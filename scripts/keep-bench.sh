#!/bin/sh
# Foreground keeper for launchd. Do not background. Cleveland does not have Grok.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/node_modules/.bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
export BENCH_EVIDENCE="/Volumes/ELEMENTS/EVIDENCE"
exec /usr/local/bin/npm run dev
