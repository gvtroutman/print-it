#!/usr/bin/env bash
# One benchmark deploy, on the NAS runner, to a throwaway stack of its own.
#
# Each run gets its own project and directory: Gitea does not reliably hold
# one run back while another is between jobs, and two runs sharing a stack
# would wipe and re-pin it under each other.
#
#   deploy/bench/deploy.sh <scenario>     deploy that scenario's images
#   deploy/bench/deploy.sh teardown       remove the stack, its images and
#                                         this run's tags in the registry
set -euo pipefail
scenario=$1
here=$(dirname "$0")
export STACK_DIR="/DATA/AppData/print-it-bench-$RUN" PROJECT="ppp-bench-$RUN"
export REPO="localhost:3002/$OWNER" TAG="bench-$RUN-$scenario" LABEL="$scenario"
export MEASURE_DOCKER_HEALTH=1

if [ "$scenario" = teardown ]; then
  if docker run --rm --mount "type=bind,source=$STACK_DIR,target=$STACK_DIR" alpine:3 \
       test -f "$STACK_DIR/docker-compose.yml" 2> /dev/null; then
    docker run --rm --network host -v /var/run/docker.sock:/var/run/docker.sock \
      --mount "type=bind,source=$STACK_DIR,target=$STACK_DIR" \
      docker:29-cli docker compose -p "$PROJECT" -f "$STACK_DIR/docker-compose.yml" \
        down -v --remove-orphans || true
  fi
  docker images --format '{{.Repository}}:{{.Tag}}' \
    | grep -E "^$REPO/ppp-(app|migrate):bench-$RUN-" \
    | xargs -r docker rmi || true
  for name in ppp-app ppp-migrate; do
    for s in s0 s1 s2 s3; do
      curl -s -o /dev/null -w "delete $name:bench-$RUN-$s %{http_code}\n" -X DELETE \
        -H "Authorization: token $REGISTRY_TOKEN" \
        "http://$REGISTRY/api/v1/packages/$OWNER/container/$name/bench-$RUN-$s" || true
    done
  done
  docker run --rm -v /DATA/AppData:/a alpine:3 rm -rf "/a/print-it-bench-$RUN"
  docker image prune -f > /dev/null
  exit 0
fi

# The first deploy of a run lays the stack down fresh.
if [ "$scenario" = s0 ]; then
  docker run --rm -v /DATA/AppData:/a alpine:3 sh -c "rm -rf /a/print-it-bench-$RUN && mkdir /a/print-it-bench-$RUN"
  secret=$(head -c 32 /dev/urandom | base64)
  sed "s#__BENCH_SECRET__#$secret#" "$here/compose.yml" \
    | docker run --rm -i --mount "type=bind,source=$STACK_DIR,target=/s" alpine:3 \
        sh -c 'cat > /s/docker-compose.yml'
fi

exec "$here/../nas.sh"
