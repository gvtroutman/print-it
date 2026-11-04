#!/usr/bin/env bash
# Stub Docker: prove a new mount is applied even when the image is unchanged.
set -euo pipefail
task_dir=$(mktemp -d /tmp/ppp-artwork-test.XXXXXX)
case "$task_dir" in /tmp/ppp-artwork-test.*) ;; *) exit 1 ;; esac
trap 'rm -rf "$task_dir"' EXIT
mkdir "$task_dir/bin"
export ARTWORK_TEST_LOG="$task_dir/docker.log"
export PROJECT=artwork-test COMPOSE_FILE="$task_dir/compose.yml"
export REPO=localhost:3002/test TAG=bbbbbbb OWNER=test REGISTRY_TOKEN=test

cat > "$task_dir/bin/docker" <<'STUB'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$ARTWORK_TEST_LOG"
case "$1 $2" in
  'compose version' | 'login localhost:3002' | 'builder prune' | 'pull -q' | 'exec ppp-app') exit 0 ;;
  'image inspect') echo 'same-image-signature'; exit 0 ;;
  'inspect -f')
    case "$3" in
      *State.Running*) echo true ;;
      *State.ExitCode*) echo 0 ;;
      *Image*) echo same-image ;;
      *) exit 99 ;;
    esac
    exit 0 ;;
esac
if [ "$1" = compose ]; then
  shift 5
  case "$1" in
    ps) echo "ppp-$4"; exit 0 ;;
    up) exit 0 ;;
  esac
fi
echo "unexpected Docker action: $*" >&2
exit 99
STUB
chmod +x "$task_dir/bin/docker"
export PATH="$task_dir/bin:/usr/bin:/bin"
script_dir=$(cd -- "$(dirname -- "$0")/.." && pwd)
for FORCE_RECREATE_APP in false true; do
  export FORCE_RECREATE_APP
  printf 'services:\n  app:\n    image: %s/ppp-app:aaaaaaa\n  migrate:\n    image: %s/ppp-migrate:aaaaaaa\n' "$REPO" "$REPO" > "$COMPOSE_FILE"
  : > "$ARTWORK_TEST_LOG"
  sh "$script_dir/nas-deploy.sh" > "$task_dir/output" 2>&1 || { cat "$task_dir/output"; exit 1; }
  if [ "$FORCE_RECREATE_APP" = true ]; then
    grep -q 'up -d --no-deps --pull never app$' "$ARTWORK_TEST_LOG"
    grep -q '^exec ppp-app ' "$ARTWORK_TEST_LOG"
  else
    ! grep -q ' up ' "$ARTWORK_TEST_LOG"
    grep -q 'app unchanged: left running' "$task_dir/output"
  fi
  ! grep -q 'up .*migrate' "$ARTWORK_TEST_LOG"
done
echo 'Artwork mount recreation checks passed; an unchanged migrator is skipped.'
