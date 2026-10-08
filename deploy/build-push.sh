#!/usr/bin/env bash
# Build both images side by side and push them to the NAS's registry.
#
# Shared by build-images.yml and bench.yml, so the benchmark measures the
# pipeline that actually ships. Prints "BENCH <label> <metric> <value>" lines
# that bench.yml collects; in a normal build they are just a timing summary.
#
# Env: REGISTRY, OWNER, TAG, REGISTRY_TOKEN
#      EXTRA_TAG  optional second tag for both images (e.g. latest)
#      PREV_TAG   optional: also report how much is new since that tag, which
#                 is what a host holding that tag has to pull
#      LABEL      prefix for the BENCH lines
set -euo pipefail
: "${REGISTRY:?}" "${OWNER:?}" "${TAG:?}" "${REGISTRY_TOKEN:?}"
label="${LABEL:-build}"
repo="$REGISTRY/$OWNER"

now() { date +%s.%N; }
since() { awk -v a="$1" -v b="$(now)" 'BEGIN { printf "%.1f", b - a }'; }
report() { echo "BENCH $label $1 $2"; }

# No provenance attestation: nothing here reads it, and it wraps every image
# in an index with an extra manifest to push, pull and store on the NAS.
build_flags=(--provenance=false)

tags_for() {
  printf '%s\n' -t "$repo/$1:$TAG"
  if [ -n "${EXTRA_TAG:-}" ]; then printf '%s\n' -t "$repo/$1:$EXTRA_TAG"; fi
}
mapfile -t app_tags < <(tags_for ppp-app)
mapfile -t migrate_tags < <(tags_for ppp-migrate)

# The migrator is light and shares nothing with the app past the base image,
# so it builds alongside. Its log is held back and printed after, so the two
# do not interleave; both builds are always waited for.
start=$(now)
(
  s=$(now) rc=0
  docker build --progress=plain "${build_flags[@]}" --target migrator \
    "${migrate_tags[@]}" . > migrate-build.log 2>&1 || rc=$?
  since "$s" > migrate-build.time
  exit "$rc"
) &
migrate=$!

s=$(now) app=0
docker build --progress=plain "${build_flags[@]}" --target runner "${app_tags[@]}" . || app=$?
app_time=$(since "$s")
migrate_status=0
wait "$migrate" || migrate_status=$?

echo "::group::ppp-migrate build"
cat migrate-build.log
echo "::endgroup::"
echo "ppp-app: exit $app, ppp-migrate: exit $migrate_status"
[ "$app" = 0 ] && [ "$migrate_status" = 0 ]
report build_app "$app_time"
report build_migrate "$(cat migrate-build.time)"
report build "$(since "$start")"

echo "$REGISTRY_TOKEN" | docker login "$REGISTRY" -u "$OWNER" --password-stdin > /dev/null
s=$(now) pids=()
for name in ppp-app ppp-migrate; do
  (
    docker push -q "$repo/$name:$TAG" > /dev/null
    if [ -n "${EXTRA_TAG:-}" ]; then docker push -q "$repo/$name:$EXTRA_TAG" > /dev/null; fi
  ) &
  pids+=("$!")
done
failed=0
for pid in "${pids[@]}"; do wait "$pid" || failed=1; done
docker logout "$REGISTRY" > /dev/null
[ "$failed" = 0 ]
report push "$(since "$s")"

# Sizes straight from the registry: what the image weighs compressed, and,
# against PREV_TAG, the layers a host holding PREV_TAG still has to fetch.
REGISTRY="$REGISTRY" OWNER="$OWNER" TAG="$TAG" PREV_TAG="${PREV_TAG:-}" LABEL="$label" \
  node --input-type=module - <<'EOF'
const { REGISTRY, OWNER, TAG, PREV_TAG, LABEL, REGISTRY_TOKEN } = process.env;
const basic = "Basic " + Buffer.from(`${OWNER}:${REGISTRY_TOKEN}`).toString("base64");
const accept = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

async function layers(name, ref) {
  const scope = `repository:${OWNER}/${name}:pull`;
  const res = await fetch(`http://${REGISTRY}/v2/token?service=container_registry&scope=${scope}`, {
    headers: { Authorization: basic },
  });
  const headers = { Authorization: `Bearer ${(await res.json()).token}`, Accept: accept };
  const get = async (r) => (await fetch(`http://${REGISTRY}/v2/${OWNER}/${name}/manifests/${r}`, { headers })).json();
  let m = await get(ref);
  if (m.manifests) m = await get(m.manifests.find((x) => x.platform?.os === "linux").digest);
  return m.layers;
}

const mb = (n) => (n / 1e6).toFixed(1);
for (const name of ["ppp-app", "ppp-migrate"]) {
  const short = name.slice(4);
  const now = await layers(name, TAG);
  console.log(`BENCH ${LABEL} size_${short}_mb ${mb(now.reduce((a, l) => a + l.size, 0))}`);
  if (PREV_TAG) {
    const old = new Set((await layers(name, PREV_TAG)).map((l) => l.digest));
    const fresh = now.filter((l) => !old.has(l.digest));
    console.log(`BENCH ${LABEL} new_${short}_mb ${mb(fresh.reduce((a, l) => a + l.size, 0))}`);
    console.log(`BENCH ${LABEL} new_${short}_layers ${fresh.length}`);
  }
}
EOF
