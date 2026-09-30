#!/bin/bash
# Tests for ./install and ./copy, in a temp home, vault and clone
cd "$(dirname "$0")/.." || exit 1
HERE="$PWD"

FAILED=0
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export CLAUDE_CONFIG_DIR="$TMP/claude" CLAUDE_LIMITS_DIR="$TMP/data"
SETTINGS="$CLAUDE_CONFIG_DIR/settings.json"
VAULT="$TMP/My Vault"
REPO="$TMP/claude-limits"

check() {   # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then
    printf 'ok   %s\n' "$1"
  else
    printf 'FAIL %s\n     expected: %s\n     actual:   %s\n' "$1" "$2" "$3"
    FAILED=1
  fi
}
hooks() { jq '[.hooks.Stop[].hooks[]] | length' "$SETTINGS"; }

mkdir -p "$VAULT/.obsidian" "$REPO" "$CLAUDE_LIMITS_DIR" "$CLAUDE_CONFIG_DIR"
printf '#!/bin/sh\n' > "$REPO/collect"; chmod +x "$REPO/collect"
echo page > "$REPO/index.html"; echo rules > "$REPO/limits.js"
echo 'S.push({});' > "$CLAUDE_LIMITS_DIR/hw.js"
echo '{"theme":"dark","hooks":{"Stop":[{"hooks":[{"type":"command","command":"say done"}]}]}}' > "$SETTINGS"

# refuses what is not there
./install "$TMP/nope" --repo "$REPO" >/dev/null; check "no vault fails" "1" "$?"
./install "$VAULT" --repo "$TMP/nope" >/dev/null; check "no clone fails" "1" "$?"

# a fresh vault
./install "$VAULT" --repo "$REPO" >/dev/null; CODE=$?
check "exits 0" "0" "$CODE"
check "plugin copied" "$(cat main.js)" "$(cat "$VAULT/.obsidian/plugins/claude-limits/main.js")"
check "folder in data.json" "claude-limits" "$(jq -r .folder "$VAULT/.obsidian/plugins/claude-limits/data.json")"
check "plugin turned on" '["claude-limits"]' "$(jq -c . "$VAULT/.obsidian/community-plugins.json")"
check "page copied" "page" "$(cat "$VAULT/claude-limits/index.html")"
check "data copied" "S.push({});" "$(cat "$VAULT/claude-limits/hw.js")"
check "other settings kept" "dark" "$(jq -r .theme "$SETTINGS")"
check "own Stop hook kept, one added" "2" "$(hooks)"
check "backup written" "1" "$(jq '[.hooks.Stop[].hooks[]] | length' "$SETTINGS.bak")"

# again: nothing doubles
./install "$VAULT" --repo "$REPO" >/dev/null
check "second run adds no hook" "2" "$(hooks)"
check "second run adds no plugin entry" '["claude-limits"]' "$(jq -c . "$VAULT/.obsidian/community-plugins.json")"

# another folder replaces the vault's hook
./install "$VAULT" --repo "$REPO" --folder "_claude/limits" >/dev/null
check "new folder, still one hook for the vault" "2" "$(hooks)"
check "data.json follows" "_claude/limits" "$(jq -r .folder "$VAULT/.obsidian/plugins/claude-limits/data.json")"

# the hook as Claude Code runs it: through a shell, JSON on stdin
CMD="$(jq -r '.hooks.Stop[-1].hooks[0].command' "$SETTINGS")"
echo 'S.push({"new":1});' > "$CLAUDE_LIMITS_DIR/hw.js"; touch -t 202001010000 "$VAULT/_claude/limits/hw.js"
OUT="$(echo '{}' | sh -c "$CMD")"; CODE=$?
check "hook exits 0" "0" "$CODE"
check "hook is silent" "" "$OUT"
check "hook copies newer data" 'S.push({"new":1});' "$(cat "$VAULT/_claude/limits/hw.js")"

# an older file in the source is not copied over a newer one
echo 'vault' > "$VAULT/_claude/limits/limits.js"; touch -t 203001010000 "$VAULT/_claude/limits/limits.js"
sh -c "$CMD" </dev/null
check "older file left alone" "vault" "$(cat "$VAULT/_claude/limits/limits.js")"

# without the plugin nothing is written
rm -rf "$VAULT/.obsidian/plugins/claude-limits" "$VAULT/_claude"
sh -c "$CMD" </dev/null
check "no plugin, no folder" "no" "$([ -d "$VAULT/_claude" ] && echo yes || echo no)"

exit $FAILED
