#!/usr/bin/env bash
# One benchmark build, on the build runner: apply the scenario's change to the
# checkout, then build and push exactly as build-images.yml does.
#
#   deploy/bench/build.sh <scenario> [<previous scenario>]
#
# Scenarios are cumulative, like a real afternoon of pushes:
#   s0  the commit as pushed: the deploy the others are measured against
#   s1  the same code again: what a push that changes nothing costs
#   s2  s1 plus a one-word change on a page
#   s3  s2 plus a dependency change (zod moved to the release before the
#       pinned one, which the bundle and the lockfile both feel)
set -euo pipefail
scenario=$1
prev=${2:-}

# The run id goes into the edit so that no earlier run's build cache already
# holds the result: the build has to do the work a real edit would.
frontend() {
  sed -i "s/You&rsquo;re in</You\&rsquo;re in! $RUN</" src/app/welcome/page.tsx
  grep -q "re in! $RUN<" src/app/welcome/page.tsx
}

dependency() {
  current=$(node -p "require('./package.json').dependencies.zod")
  target=$(npm view zod versions --json | CURRENT="$current" node -e '
    const v = JSON.parse(require("fs").readFileSync(0, "utf8")).filter((x) => !x.includes("-"));
    console.log(v[v.indexOf(process.env.CURRENT) - 1]);')
  echo "zod $current -> $target"
  npm install --package-lock-only --ignore-scripts --no-audit --no-fund --save-exact "zod@$target"
}

case "$scenario" in
  s0 | s1) ;;
  s2) frontend ;;
  s3) frontend; dependency ;;
  *) echo "unknown scenario $scenario" >&2; exit 2 ;;
esac
git status --short

export TAG="bench-$RUN-$scenario" LABEL="$scenario"
if [ -n "$prev" ]; then export PREV_TAG="bench-$RUN-$prev"; fi
exec "$(dirname "$0")/../build-push.sh"
