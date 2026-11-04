#!/usr/bin/env bash
# Exercise deployment's storage preflight against a Docker stub. Nothing here
# can reach a Docker daemon or change a real compose stack.
set -euo pipefail

task_dir=$(mktemp -d /tmp/ppp-storage-test.XXXXXX)
case "$task_dir" in
  /tmp/ppp-storage-test.*) ;;
  *) echo 'unexpected test directory' >&2; exit 1 ;;
esac
trap 'rm -rf "$task_dir"' EXIT
mkdir "$task_dir/bin"
export STORAGE_TEST_LOG="$task_dir/docker.log"
export PROJECT=storage-test COMPOSE_FILE="$task_dir/compose.yml"
export REPO=localhost:3002/test TAG=bbbbbbb OWNER=test REGISTRY_TOKEN=test
printf 'services:\n  app:\n    image: %s/ppp-app:aaaaaaa\n  migrate:\n    image: %s/ppp-migrate:aaaaaaa\n' "$REPO" "$REPO" > "$COMPOSE_FILE"

cat > "$task_dir/bin/docker" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$STORAGE_TEST_LOG"
case "$1 $2" in
  'compose version' | 'login localhost:3002') exit 0 ;;
  'builder prune') exit "${STORAGE_TEST_PRUNE_STATUS:-0}" ;;
  'pull -q') exit 23 ;;
  *) echo "unexpected Docker action: $*" >&2; exit 99 ;;
esac
STUB
chmod +x "$task_dir/bin/docker"
export PATH="$task_dir/bin:/usr/bin:/bin"
script_dir=$(cd -- "$(dirname -- "$0")/.." && pwd)

run_deploy() {
  : > "$STORAGE_TEST_LOG"
  set +e
  sh "$script_dir/nas-deploy.sh" > "$task_dir/output" 2>&1
  status=$?
  set -e
}

# Both deployment strategies must reclaim only build cache before a pull.
for STRATEGY in incremental full; do
  export STRATEGY STORAGE_TEST_PRUNE_STATUS=0
  run_deploy
  if [ "$STRATEGY" = incremental ]; then
    [ "$status" = 23 ]
  else
    # Full strategy reaches compose pull; the stub rejects the real operation.
    [ "$status" = 99 ]
  fi
  awk '
    /builder prune -af --keep-storage 4gb/ { cache = 1; next }
    /pull/ { if (!cache) exit 1; pulled = 1 }
    END { if (!pulled) exit 1 }
  ' "$STORAGE_TEST_LOG"
  if grep -Eq '^(system|image|container|volume) prune|^rm |^rmi ' "$STORAGE_TEST_LOG"; then
    echo 'deployment removed something other than build cache' >&2
    exit 1
  fi
done

# A failed cleanup must stop before pulling or changing the pinned images.
export STRATEGY=incremental STORAGE_TEST_PRUNE_STATUS=17
cp "$COMPOSE_FILE" "$task_dir/compose-before.yml"
run_deploy
[ "$status" = 17 ]
! grep -q 'pull' "$STORAGE_TEST_LOG"
cmp -s "$COMPOSE_FILE" "$task_dir/compose-before.yml"
echo 'storage preflight tests passed'
