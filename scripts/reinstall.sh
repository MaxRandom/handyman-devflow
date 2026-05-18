#!/usr/bin/env bash
# scripts/reinstall.sh — one-command full reinstall of handyman-devflow.
#
# Replicates what `/plugin install handyman-devflow@handyman-marketplace`
# does in Claude Code, so you only need to type `/reload-plugins` afterward:
#
#   1. Clones (or pulls) the marketplace into
#      ~/.claude/plugins/marketplaces/handyman-marketplace/
#   2. Reads the version from plugin.json (so the install path matches what
#      Claude Code expects: cache/<marketplace>/<plugin>/<version>/).
#   3. Wipes the prior install dir and rsyncs the marketplace clone into it,
#      excluding .git and node_modules.
#   4. Updates known_marketplaces.json (marketplace entry) and
#      installed_plugins.json (plugin entry + commit SHA + timestamps) via jq.
#   5. Prints "now paste /reload-plugins" — the only step that has to happen
#      inside Claude Code.
#
# Use --dry-run to see what would happen.
# Use --help for this docblock.
#
# Run from anywhere; the script doesn't depend on its own cwd.
set -euo pipefail

PLUGINS_DIR="${CLAUDE_PLUGINS_DIR:-$HOME/.claude/plugins}"
MARKETPLACE_NAME="handyman-marketplace"
PLUGIN_NAME="handyman-devflow"
GITHUB_REPO="MaxRandom/handyman-devflow"
GIT_URL="git@github.com:${GITHUB_REPO}.git"

MARKETPLACE_DIR="$PLUGINS_DIR/marketplaces/$MARKETPLACE_NAME"
CACHE_ROOT="$PLUGINS_DIR/cache/$MARKETPLACE_NAME/$PLUGIN_NAME"
KNOWN_MARKETPLACES_JSON="$PLUGINS_DIR/known_marketplaces.json"
INSTALLED_PLUGINS_JSON="$PLUGINS_DIR/installed_plugins.json"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
      echo
      echo "Usage: $0 [--dry-run]"
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

require() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing dependency: $1 — install it first ($2)."; exit 1;
  }
}
require git "brew install git"
require jq "brew install jq"
require rsync "macOS ships with rsync by default"

if [ ! -d "$PLUGINS_DIR" ]; then
  echo "Claude Code plugins dir not found at $PLUGINS_DIR. Is Claude Code installed?"
  exit 1
fi

# ── Step 1: marketplace clone (clone or pull) ─────────────────────────────────
if [ -d "$MARKETPLACE_DIR/.git" ]; then
  echo "→ Pulling latest origin/main into $MARKETPLACE_DIR"
  before=$(cd "$MARKETPLACE_DIR" && git rev-parse --short HEAD)
  run "(cd '$MARKETPLACE_DIR' && git fetch --quiet origin main && git reset --hard --quiet origin/main)"
  after=$(cd "$MARKETPLACE_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "?")
  if [ "$before" = "$after" ]; then
    echo "  marketplace already at $before"
  else
    echo "  marketplace updated: $before → $after"
  fi
else
  echo "→ Cloning $GIT_URL into $MARKETPLACE_DIR"
  run "mkdir -p '$(dirname "$MARKETPLACE_DIR")'"
  run "git clone --quiet '$GIT_URL' '$MARKETPLACE_DIR'"
fi

# ── Step 2: read version + commit SHA ─────────────────────────────────────────
if [ "$DRY_RUN" = true ] && [ ! -d "$MARKETPLACE_DIR/.git" ]; then
  VERSION="0.0.0-dry-run"
  COMMIT_SHA="0000000000000000000000000000000000000000"
  echo "  [dry-run] (would read version + SHA from $MARKETPLACE_DIR)"
else
  VERSION=$(jq -r .version "$MARKETPLACE_DIR/.claude-plugin/plugin.json")
  COMMIT_SHA=$(cd "$MARKETPLACE_DIR" && git rev-parse HEAD)
fi
INSTALL_DIR="$CACHE_ROOT/$VERSION"
echo "→ Target install dir: $INSTALL_DIR (version $VERSION, sha ${COMMIT_SHA:0:7})"

# ── Step 3: wipe + rsync into install dir ─────────────────────────────────────
if [ -d "$CACHE_ROOT" ]; then
  echo "  Removing prior install: $CACHE_ROOT"
  run "rm -rf '$CACHE_ROOT'"
fi
run "mkdir -p '$INSTALL_DIR'"
run "rsync -a --delete --exclude='.git' --exclude='node_modules' '$MARKETPLACE_DIR/' '$INSTALL_DIR/'"

# ── Step 4: update Claude Code's registry JSON files ──────────────────────────
NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
KEY="${PLUGIN_NAME}@${MARKETPLACE_NAME}"

echo "→ Updating $KNOWN_MARKETPLACES_JSON"
if [ ! -f "$KNOWN_MARKETPLACES_JSON" ]; then
  run "echo '{}' > '$KNOWN_MARKETPLACES_JSON'"
fi
tmp1=$(mktemp)
run "jq --arg name '$MARKETPLACE_NAME' \
       --arg repo '$GITHUB_REPO' \
       --arg loc '$MARKETPLACE_DIR' \
       --arg now '$NOW' \
       '.[\$name] = { source: { source: \"github\", repo: \$repo }, installLocation: \$loc, lastUpdated: \$now }' \
       '$KNOWN_MARKETPLACES_JSON' > '$tmp1' && mv '$tmp1' '$KNOWN_MARKETPLACES_JSON'"

echo "→ Updating $INSTALLED_PLUGINS_JSON"
if [ ! -f "$INSTALLED_PLUGINS_JSON" ]; then
  run "echo '{\"version\":2,\"plugins\":{}}' > '$INSTALLED_PLUGINS_JSON'"
fi
tmp2=$(mktemp)
run "jq --arg key '$KEY' \
       --arg path '$INSTALL_DIR' \
       --arg version '$VERSION' \
       --arg now '$NOW' \
       --arg sha '$COMMIT_SHA' \
       '.plugins[\$key] = [{ scope: \"user\", installPath: \$path, version: \$version, installedAt: (.plugins[\$key][0].installedAt // \$now), lastUpdated: \$now, gitCommitSha: \$sha }]' \
       '$INSTALLED_PLUGINS_JSON' > '$tmp2' && mv '$tmp2' '$INSTALLED_PLUGINS_JSON'"

# ── Step 5: prompt for /reload-plugins ────────────────────────────────────────
cat <<EOF

✅ Reinstall complete.

  Version:    $VERSION
  Commit:     ${COMMIT_SHA:0:7}
  Install:    $INSTALL_DIR

In Claude Code, paste ONE command:

  /reload-plugins

If a new slash command (e.g. /handyman-devflow:resume) still doesn't show up
after /reload-plugins, fully restart Claude Code — some session state caches
the command list at startup and doesn't fully refresh on /reload-plugins.
EOF
