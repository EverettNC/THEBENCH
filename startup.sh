#!/bin/sh
# THEBENCH door on this Mac. Not the Grok Linux sandbox.
# preview.mjs reads /proc and will never work here.
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT"

LOG="$ROOT/logs/startup.log"
mkdir -p "$ROOT/logs"

if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:4849/; then
  echo "THEBENCH already listening on http://127.0.0.1:4849/"
  exit 0
fi

if [ ! -x "$ROOT/node_modules/.bin/vite" ]; then
  echo "local vite missing — npm install"
  npm install
fi

# pnpm's global vite shim points at a deleted /Users/EverettN/vite tree.
# npm run prepends node_modules/.bin; we force it anyway.
export PATH="$ROOT/node_modules/.bin:$PATH"
export BENCH_EVIDENCE="/Volumes/ELEMENTS/EVIDENCE"

if [ ! -x "$ROOT/node_modules/.bin/vite" ]; then
  echo "FAIL: local vite not at $ROOT/node_modules/.bin/vite"
  echo "Do not use the pnpm PATH shim. It points at a missing /Users/EverettN/vite."
  exit 1
fi

: >"$LOG"
nohup npm run dev >>"$LOG" 2>&1 &
PID=$!
echo "dev pid $PID — waiting for :4849"

i=0
while [ "$i" -lt 90 ]; do
  if curl -sf -o /dev/null --max-time 1 http://127.0.0.1:4849/; then
    echo "THEBENCH up: http://127.0.0.1:4849/"
    exit 0
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "FAIL: npm run dev died. last log:"
    tail -50 "$LOG"
    exit 1
  fi
  i=$((i + 1))
  sleep 1
done

echo "FAIL: :4849 never opened in 90s. last log:"
tail -50 "$LOG"
exit 1
