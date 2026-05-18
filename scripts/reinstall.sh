#!/usr/bin/env bash
# scripts/reinstall.sh — refresh handyman-devflow's Claude Code install.
#
# Default behavior ("fast path"): `git pull` inside the cached marketplace
# directory so the next time Claude Code reads it (or you run /reload-plugins),
# it picks up the latest commits from origin/main. This works because Claude
# Code stores the marketplace as a regular git clone under
#   ~/.claude/plugins/marketplaces/handyman-marketplace/
# and reads from there directly.
#
# Use --clean for a full uninstall+reinstall when the fast path doesn't
# resolve a problem (e.g., schema migration, stuck state, marketplace.json
# corruption). --clean nukes the marketplace cache, the installed-plugin
# cache, and the relevant JSON registry entries — then prints the slash
# commands you paste into Claude Code.
#
# Use --dry-run to see what would happen without changing anything.
#
# Run from anywhere; the script doesn't depend on its own cwd.
set -euo pipefail

PLUGINS_DIR="${CLAUDE_PLUGINS_DIR:-$HOME/.claude/plugins}"
MARKETPLACE_NAME="handyman-marketplace"
PLUGIN_NAME="handyman-devflow"
GITHUB_REPO="MaxRandom/handyman-devflow"

MARKETPLACE_DIR="$PLUGINS_DIR/marketplaces/$MARKETPLACE_NAME"
INSTALL_DIR="$PLUGINS_DIR/cache/$MARKETPLACE_NAME"
KNOWN_MARKETPLACES_JSON="$PLUGINS_DIR/known_marketplaces.json"
INSTALLED_PLUGINS_JSON="$PLUGINS_DIR/installed_plugins.json"

MODE="fast"
DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --clean) MODE="clean" ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
      echo
      echo "Usage: $0 [--clean] [--dry-run]"
      exit 0
      ;;
    *) echo "Unknown arg: $arg (try --help)"; exit 2 ;;
  esac
done

run() {
  if [ "$DRY_RUN" = true ]; then
    echo "  [dry-run] $*"
  else
    eval "$@"
  fi
}

if [ ! -d "$PLUGINS_DIR" ]; then
  echo "Claude Code plugins dir not found at $PLUGINS_DIR. Is Claude Code installed?"
  exit 1
fi

if [ "$MODE" = "fast" ]; then
  if [ ! -d "$MARKETPLACE_DIR/.git" ]; then
    echo "Marketplace cache is missing or not a git clone — falling back to --clean."
    MODE="clean"
  else
    echo "→ Fast path: pulling latest origin/main into $MARKETPLACE_DIR"
    before=$(cd "$MARKETPLACE_DIR" && git rev-parse --short HEAD)
    run "(cd '$MARKETPLACE_DIR' && git fetch --quiet origin main && git reset --hard --quiet origin/main)"
    after=$(cd "$MARKETPLACE_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "?")
    if [ "$before" = "$after" ]; then
      echo "  already up to date ($before)."
    else
      echo "  updated: $before → $after"
      echo "  new commits:"
      (cd "$MARKETPLACE_DIR" && git log --oneline "$before".."$after" 2>/dev/null) | sed 's/^/    /' || true
    fi
    cat <<'EOF'

✅ Done. In Claude Code, paste:

  /reload-plugins

That's it. If /reload-plugins doesn't pick up the changes (rare — only happens
on schema migrations), re-run this script with --clean for a full reinstall.
EOF
    exit 0
  fi
fi

# --clean path. Nuke caches + JSON entries, then prompt for the slash commands.
echo "→ Clean path: removing cached marketplace + installed plugin + registry entries."

if [ -d "$MARKETPLACE_DIR" ]; then
  echo "  Removing $MARKETPLACE_DIR"
  run "rm -rf '$MARKETPLACE_DIR'"
fi
if [ -d "$INSTALL_DIR" ]; then
  echo "  Removing $INSTALL_DIR"
  run "rm -rf '$INSTALL_DIR'"
fi

if command -v jq >/dev/null 2>&1; then
  if [ -f "$KNOWN_MARKETPLACES_JSON" ]; then
    if jq -e --arg k "$MARKETPLACE_NAME" 'has($k)' "$KNOWN_MARKETPLACES_JSON" >/dev/null; then
      echo "  Removing '$MARKETPLACE_NAME' from $KNOWN_MARKETPLACES_JSON"
      tmp=$(mktemp)
      run "jq --arg k '$MARKETPLACE_NAME' 'del(.[\$k])' '$KNOWN_MARKETPLACES_JSON' > '$tmp' && mv '$tmp' '$KNOWN_MARKETPLACES_JSON'"
    fi
  fi
  if [ -f "$INSTALLED_PLUGINS_JSON" ]; then
    key="${PLUGIN_NAME}@${MARKETPLACE_NAME}"
    if jq -e --arg k "$key" '.plugins | has($k)' "$INSTALLED_PLUGINS_JSON" >/dev/null; then
      echo "  Removing '$key' from $INSTALLED_PLUGINS_JSON"
      tmp=$(mktemp)
      run "jq --arg k '$key' 'del(.plugins[\$k])' '$INSTALLED_PLUGINS_JSON' > '$tmp' && mv '$tmp' '$INSTALLED_PLUGINS_JSON'"
    fi
  fi
else
  echo "  WARNING: jq not installed — skipping JSON registry cleanup."
  echo "  Install jq (\`brew install jq\`) and re-run, or accept that Claude Code"
  echo "  may complain about a stale 'handyman-marketplace' entry until you run"
  echo "  /plugin marketplace remove handyman-marketplace inside Claude Code."
fi

cat <<EOF

✅ Caches cleared. In Claude Code, paste:

  /plugin marketplace add $GITHUB_REPO
  /plugin install $PLUGIN_NAME@$MARKETPLACE_NAME
  /reload-plugins

Then test:
  /$PLUGIN_NAME:start "test the autopilot end-to-end"
EOF
