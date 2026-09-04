#!/bin/sh
set -eu
cd /workspace
node scripts/preview.mjs stop || true

if ! curl -sf -o /dev/null --max-time 2 http://127.0.0.1:4849/; then
  npm run dev >>/tmp/app-startup.log 2>&1 &
fi
