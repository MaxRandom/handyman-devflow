#!/usr/bin/env bash
# Ensure plugin's npm deps are installed in CLAUDE_PLUGIN_DATA. Runs on SessionStart.
set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:?CLAUDE_PLUGIN_ROOT not set}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:?CLAUDE_PLUGIN_DATA not set}"

mkdir -p "$PLUGIN_DATA"

ROOT_PKG="$PLUGIN_ROOT/package.json"
DATA_PKG="$PLUGIN_DATA/package.json"

# If package.json content differs (or data copy missing), install
if [ ! -f "$DATA_PKG" ] || ! cmp -s "$ROOT_PKG" "$DATA_PKG"; then
  echo "handyman-devflow: installing/updating npm deps in plugin data dir..." >&2
  cp "$ROOT_PKG" "$DATA_PKG"
  if [ -f "$PLUGIN_ROOT/package-lock.json" ]; then
    cp "$PLUGIN_ROOT/package-lock.json" "$PLUGIN_DATA/package-lock.json"
  fi
  (cd "$PLUGIN_DATA" && npm install --silent --no-audit --no-fund) || {
    echo "handyman-devflow: npm install failed in $PLUGIN_DATA" >&2
    exit 1
  }
fi

# Symlink node_modules into PLUGIN_ROOT so tsx and validators can find them
if [ ! -e "$PLUGIN_ROOT/node_modules" ]; then
  ln -s "$PLUGIN_DATA/node_modules" "$PLUGIN_ROOT/node_modules" 2>/dev/null || true
fi
