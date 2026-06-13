#!/usr/bin/env bash
# Deploy built SDK examples to ~/.ChatableX/my_tools/ for host loading.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_ROOT="${CHATABLEX_MY_TOOLS:-$HOME/.ChatableX/my_tools}"

for app in counter-app todo-app; do
  SRC="$ROOT/examples/$app"
  DST="$TARGET_ROOT/$app"

  if [[ ! -f "$SRC/dist/index.html" ]]; then
    echo "ERROR: $SRC/dist/index.html missing — run npm run build:examples first"
    exit 1
  fi

  mkdir -p "$TARGET_ROOT"
  rm -rf "$DST"
  mkdir -p "$DST"

  # Ship runtime artifacts only (no node_modules / src)
  cp "$SRC/package.json" "$DST/"
  cp -R "$SRC/dist" "$DST/"

  echo "DEPLOYED: $DST"
  echo "  entry: $(node -e "const p=require('$DST/package.json'); console.log(p.chatablex?.webapp?.webui?.entry||'MISSING')")"
  echo "  dist/index.html: $(test -f "$DST/dist/index.html" && echo OK || echo MISSING)"
done

echo "ALL_DEPLOYED: $TARGET_ROOT"
