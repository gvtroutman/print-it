# Deploy a pinned pair of images to a compose stack on the NAS.
#
# Runs inside docker:29-cli on the NAS, with its Docker socket, fed on stdin
# by deploy/nas.sh. POSIX sh: that image is Alpine. Prints
# "BENCH <label> <metric> <seconds>" lines for bench.yml.
#
# STRATEGY=full         what the ZimaOS dashboard does: pin both images, pull,
#                       `up` the whole project, wait for Docker to call the
#                       app healthy. Kept as the benchmark baseline and as a
#                       blunt fallback.
# STRATEGY=incremental  pull explicitly; skip a service whose image is
#                       unchanged; run the migrator before touching the app,
#                       so the old app serves while migrations run; swap only
#                       the app; gate on the app itself answering rather than
#                       on Docker's health-check cadence; put the previous
#                       image back if the new one never answers.
#
# Never touches the database container in either mode: the incremental path
# names its services with --no-deps, and only starts db when it is not
# running at all (a fresh benchmark stack).
set -eu

: "${PROJECT:?}" "${COMPOSE_FILE:?}" "${REPO:?}" "${TAG:?}" "${OWNER:?}" "${REGISTRY_TOKEN:?}"
STRATEGY="${STRATEGY:-incremental}"
LABEL="${LABEL:-deploy}"
READY_TIMEOUT="${READY_TIMEOUT:-180}"
MEASURE_DOCKER_HEALTH="${MEASURE_DOCKER_HEALTH:-0}"

now() { cut -d' ' -f1 /proc/uptime; }
since() { awk -v a="$1" -v b="$(now)" 'BEGIN { printf "%.1f", b - a }'; }
past() { awk -v a="$1" -v b="$(now)" -v t="$2" 'BEGIN { exit !(b - a > t) }'; }
report() { echo "BENCH $LABEL $1 $2"; }
dc() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" "$@"; }

docker compose version > /dev/null
echo "$REGISTRY_TOKEN" | docker login localhost:3002 -u "$OWNER" --password-stdin > /dev/null 2>&1

pinned() {
  sed -nE "s#^[[:space:]]*image:[[:space:]]*$REPO/$1:([A-Za-z0-9._-]+)[[:space:]]*\$#\1#p" "$COMPOSE_FILE" | head -n 1
}

# Rewrite through a temp file and cat it back, rather than sed -i, so the file
# keeps its owner and mode.
pin() {
  sed -E "s#(image:[[:space:]]*$REPO/ppp-(app|migrate)):[A-Za-z0-9._-]+#\1:$1#" "$COMPOSE_FILE" > /tmp/compose.yml
  n=$(grep -cE "image:[[:space:]]*$REPO/ppp-(app|migrate):$1[[:space:]]*\$" /tmp/compose.yml || true)
  if [ "$n" != 2 ]; then
    echo "expected 2 images pinned to $1, found $n; $COMPOSE_FILE left unchanged" >&2
    return 1
  fi
  cat /tmp/compose.yml > "$COMPOSE_FILE"
}

cid() { dc ps -a -q "$1" | head -n 1; }

# Layers plus config: two builds of the same content compare equal even when
# their tags, and their image IDs' creation stamps, differ.
signature() {
  docker image inspect -f '{{json .RootFS.Layers}} {{json .Config}}' "$1" 2> /dev/null || echo "absent:$1"
}

# True when service $1's existing container already runs what image $2 holds.
unchanged() {
  c=$(cid "$1")
  [ -n "$c" ] || return 1
  [ "$(signature "$(docker inspect -f '{{.Image}}' "$c")")" = "$(signature "$2")" ]
}

probe() {
  docker exec "$1" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" > /dev/null 2>&1
}

wait_ready() {
  started=$(now)
  until probe "$1"; do
    past "$started" "$READY_TIMEOUT" && return 1
    [ "$(docker inspect -f '{{.State.Running}}' "$1" 2> /dev/null)" = true ] || return 1
    sleep 0.5
  done
}

wait_healthy() {
  started=$(now)
  until [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$1")" = healthy ]; do
    past "$started" "$READY_TIMEOUT" && return 1
    sleep 0.5
  done
}

prev=$(pinned ppp-app)
app_image="$REPO/ppp-app:$TAG"
migrate_image="$REPO/ppp-migrate:$TAG"
echo "deploying $TAG over ${prev:-nothing} ($STRATEGY)"

if [ "$STRATEGY" = full ]; then
  pin "$TAG"
  t=$(now)
  dc pull -q migrate app
  report pull "$(since "$t")"
  t=$(now)
  dc up -d
  report recreate "$(since "$t")"
  c=$(cid app)
  t=$(now)
  wait_ready "$c" || { echo "app never answered" >&2; docker logs --tail 80 "$c" >&2; exit 1; }
  report ready "$(since "$t")"
  wait_healthy "$c" || { echo "app never turned healthy" >&2; exit 1; }
  report healthy "$(since "$t")"
  exit 0
fi

t=$(now)
docker pull -q "$app_image" > /dev/null &
p_app=$!
docker pull -q "$migrate_image" > /dev/null &
p_migrate=$!
wait "$p_app"
wait "$p_migrate"
report pull "$(since "$t")"

# A fresh stack has no database yet. An existing one is left strictly alone.
db=$(cid db)
if [ -z "$db" ] || [ "$(docker inspect -f '{{.State.Running}}' "$db")" != true ]; then
  dc up -d --wait db
fi

pin "$TAG"

# The migrator: skipped when the image is the one that last ran and succeeded,
# since the same image holds the same migrations and the same seed.
m=$(cid migrate)
if [ "${SKIP_MIGRATE:-0}" = 1 ]; then
  echo "SKIP_MIGRATE: the migrator was not run"
  report migrate 0
elif unchanged migrate "$migrate_image" && [ "$(docker inspect -f '{{.State.ExitCode}}' "$m")" = 0 ]; then
  echo "migrator unchanged since its last successful run: skipped"
  report migrate 0
else
  t=$(now)
  dc up -d --no-deps --pull never --force-recreate migrate
  m=$(cid migrate)
  code=$(docker wait "$m")
  report migrate "$(since "$t")"
  if [ "$code" != 0 ]; then
    docker logs --tail 80 "$m" >&2
    echo "migrator exited $code; the app was not touched" >&2
    if [ -n "$prev" ]; then pin "$prev"; fi
    exit 1
  fi
fi

c=$(cid app)
if unchanged app "$app_image" && [ "$(docker inspect -f '{{.State.Running}}' "$c")" = true ]; then
  echo "app unchanged: left running"
  report recreate 0
  report ready 0
  exit 0
fi

t=$(now)
dc up -d --no-deps --pull never app
report recreate "$(since "$t")"
c=$(cid app)
t=$(now)
if ! wait_ready "$c"; then
  docker logs --tail 80 "$c" >&2 || true
  if [ -n "$prev" ] && [ "$prev" != "$TAG" ] && docker image inspect "$REPO/ppp-app:$prev" > /dev/null 2>&1; then
    echo "the new app never answered: putting $prev back" >&2
    pin "$prev"
    dc up -d --no-deps --pull never app
    if wait_ready "$(cid app)"; then echo "rolled back to $prev" >&2; fi
  else
    echo "the new app never answered, and there is no previous image to put back" >&2
  fi
  exit 1
fi
report ready "$(since "$t")"

if [ "$MEASURE_DOCKER_HEALTH" = 1 ]; then
  wait_healthy "$c" || { echo "app answered but never turned healthy" >&2; exit 1; }
  report healthy "$(since "$t")"
fi
