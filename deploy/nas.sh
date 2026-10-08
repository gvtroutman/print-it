#!/usr/bin/env bash
# Run deploy/nas-deploy.sh against the NAS's Docker, in a pinned docker CLI
# image that has the compose plugin.
#
# The job container's paths are not the host's, so the script goes in on
# stdin, and the stack directory is mounted at the path it has on the host,
# so compose resolves the file exactly as ZimaOS does. Host networking lets
# the CLI reach the registry as localhost:3002, the name the stack uses.
#
# Env: STACK_DIR, COMPOSE_NAME (default docker-compose.yml), plus everything
# nas-deploy.sh reads.
set -euo pipefail
: "${STACK_DIR:?}"
here=$(dirname "$0")
exec docker run --rm -i --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --mount "type=bind,source=$STACK_DIR,target=$STACK_DIR" \
  -e PROJECT -e REPO -e TAG -e OWNER -e REGISTRY_TOKEN \
  -e STRATEGY -e LABEL -e READY_TIMEOUT -e MEASURE_DOCKER_HEALTH -e SKIP_MIGRATE \
  -e COMPOSE_FILE="$STACK_DIR/${COMPOSE_NAME:-docker-compose.yml}" \
  docker:29-cli sh -s < "$here/nas-deploy.sh"
