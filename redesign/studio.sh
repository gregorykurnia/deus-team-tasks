#!/usr/bin/env bash
# The design studio is a separate git repo in its own folder (../<project>-studio, branch design-studio).
# It never holds the codebase's history and has no remote: work moves only through this script.
#
#   redesign/studio.sh init     create the studio from redesign/studio-template/ (fresh history)
#   redesign/studio.sh enter    save studio work, refresh the studio's guard files, sync redesign/handoff/ into it
#   redesign/studio.sh import   bring the approved redesign/design/ from the studio onto the base branch
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
ROOT="$PWD"
SBRANCH="design-studio"
STUDIO="$(dirname "$ROOT")/$(basename "$ROOT")-studio"
BASE="${BASE_BRANCH:-$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)}"
BASE="${BASE:-main}"
branch="$(git branch --show-current)"

require_base_clean() {
  [ "$branch" = "$BASE" ] || { echo "✋ Run this from $BASE (currently on '$branch')." >&2; exit 1; }
  if [ -n "$(git status --porcelain)" ]; then
    echo "✋ Uncommitted changes on $BASE. Commit them first." >&2
    exit 1
  fi
}

have_remote() { [ -n "$(git remote)" ]; }
have_branch() { git show-ref --verify --quiet "refs/heads/$SBRANCH"; }

save_studio_work() {
  [ -d "$STUDIO/.git" ] || return 0
  if [ -n "$(git -C "$STUDIO" status --porcelain)" ]; then
    git -C "$STUDIO" add -A
    git -C "$STUDIO" commit -q -m "Save unsaved studio work"
  fi
}

# Copy the studio's branch into this repo (one-way: studio -> codebase), and back it up to origin.
collect_studio_branch() {
  [ -d "$STUDIO/.git" ] || return 0
  git fetch -q --no-tags "$STUDIO" "$SBRANCH:$SBRANCH"
  if have_remote; then git push -q origin "$SBRANCH"; fi
}

ensure_studio() {
  [ -d "$STUDIO" ] && return 0
  if ! have_branch && have_remote; then git fetch -q --no-tags origin "$SBRANCH:$SBRANCH" 2>/dev/null || true; fi
  have_branch || { echo "✋ There's no studio yet. Run 'init' first." >&2; exit 1; }
  # --no-local + --single-branch copy only design-studio's objects, never the codebase's history.
  git clone -q --no-local --single-branch --no-tags --branch "$SBRANCH" "$ROOT" "$STUDIO"
  git -C "$STUDIO" remote remove origin
  echo "Recreated the studio folder: $STUDIO"
}

write_guard_files() {  # rewritten on every init/enter, so template fixes arrive and tampering is undone
  cp "$ROOT/redesign/studio-template/CLAUDE.md" "$STUDIO/CLAUDE.md"
  cp "$ROOT/redesign/studio-template/settings.json" "$STUDIO/.claude/settings.json"
  rm -f "$STUDIO/.claude/settings.local.json"  # drop any "always allow" clicked in a studio session
  printf '.DS_Store\nnode_modules/\n.tmp/\n.claude/settings.local.json\n' > "$STUDIO/.gitignore"
  cat > "$STUDIO/start" <<'START'
#!/usr/bin/env bash
# Starts a brand-new, isolated design session: no MCP servers, no claude.ai connectors,
# no auto memory, no artifacts. Never continue or resume an old session.
cd "$(dirname "$0")"
for a in "$@"; do
  case "$a" in -c|--continue|-r|--resume|--resume=*|--fork-session)
    echo "✋ Always start a brand-new session." >&2; exit 1;;
  esac
done
export ENABLE_CLAUDEAI_MCP_SERVERS=false CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 CLAUDE_CODE_DISABLE_ARTIFACT=1
# Your arguments go first: --mcp-config takes several values and would swallow anything after it.
exec claude "$@" --strict-mcp-config --mcp-config '{"mcpServers":{}}'
START
  cat > "$STUDIO/shoot" <<'SHOOT'
#!/usr/bin/env bash
# Screenshots design directions at desktop and phone width, then opens them.
# The OWNER runs this from inside the studio session as `! ./shoot` (or from a terminal):
#   ./shoot                 every folder in redesign/design/directions/
#   ./shoot <folder>...     only these folders (each holds an index.html, inside redesign/design/)
# Pages are served from redesign/design/ over a local web server, so they can't load local files
# from anywhere else. Chrome reaches Google Fonts only; all other traffic goes to a dead proxy.
set -euo pipefail
cd "$(dirname "$0")"
STUDIO="$PWD"
DESIGN="$STUDIO/redesign/design"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
NOSANDBOX=""
if [ "$(uname)" = Linux ]; then
  # Linux server (arm64, no Google Chrome build): Playwright's headless shell (full Chromium hangs
  # there), same lockdown flags. Chrome's own sandbox can't start under Ubuntu's user-namespace
  # restriction; the proxy and local-only server still confine the page.
  CHROME="$(ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux*/headless_shell 2>/dev/null | tail -1)"
  NOSANDBOX="--no-sandbox"
fi
FONTS="fonts.googleapis.com;fonts.gstatic.com"

if [ -n "$(find "$DESIGN" -type l -print -quit)" ]; then
  echo "✋ redesign/design/ contains symlinks. Remove them first:" >&2
  find "$DESIGN" -type l >&2
  exit 1
fi

mkdir -p .tmp && export TMPDIR="$STUDIO/.tmp"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$DESIGN" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
for _ in $(seq 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 0.1; done

shot() {  # $1 = url, $2 = width,height, $3 = output png
  if [ -x "$CHROME" ]; then
    "$CHROME" --headless=new $NOSANDBOX --hide-scrollbars --user-data-dir="$STUDIO/.tmp/chrome" \
      --proxy-server="127.0.0.1:9" --proxy-bypass-list="$FONTS" \
      --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE fonts.googleapis.com, EXCLUDE fonts.gstatic.com, EXCLUDE 127.0.0.1" \
      --virtual-time-budget=5000 --window-size="$2" --screenshot="$3" "$1" >/dev/null 2>&1
  else
    npx -y playwright screenshot --proxy-server="127.0.0.1:9" --proxy-bypass="$FONTS" \
      --viewport-size="$2" "$1" "$3" >/dev/null
  fi
}

if [ "$#" -gt 0 ]; then dirs=("$@"); else dirs=("$DESIGN"/directions/*/); fi
pngs=()
for d in "${dirs[@]}"; do
  [ -d "$d" ] || continue
  d="$(cd "$d" && pwd -P)"
  case "$d" in "$DESIGN"/*) ;; *) echo "✋ Skipping $d: not inside redesign/design/." >&2; continue;; esac
  [ -f "$d/index.html" ] || continue
  url="http://127.0.0.1:$PORT/${d#"$DESIGN"/}/index.html"
  shot "$url" 1440,900 "$d/desktop.png"
  shot "$url" 390,844 "$d/phone.png"
  pngs+=("$d/desktop.png" "$d/phone.png")
  echo "📸 ${d#"$DESIGN"/}"
done
if [ "${#pngs[@]}" -gt 0 ] && [ -z "${SHOOT_NO_OPEN:-}" ]; then
  if [ "$(uname)" = Darwin ]; then open "${pngs[@]}"; else printf '🖼  %s\n' "${pngs[@]}"; fi
fi
SHOOT
  chmod +x "$STUDIO/start" "$STUDIO/shoot"
}

case "${1:-}" in
  init)
    require_base_clean
    if have_branch || [ -e "$STUDIO" ]; then
      echo "✋ The studio already exists. Use 'enter'." >&2; exit 1
    fi
    for f in CLAUDE.md settings.json; do
      [ -f "redesign/studio-template/$f" ] || { echo "✋ Missing redesign/studio-template/$f" >&2; exit 1; }
    done
    mkdir -p "$STUDIO/.claude" "$STUDIO/redesign/handoff" "$STUDIO/redesign/design"
    git -C "$STUDIO" init -q -b "$SBRANCH"
    write_guard_files
    touch "$STUDIO/redesign/handoff/.gitkeep" "$STUDIO/redesign/design/.gitkeep"
    git -C "$STUDIO" add -A
    git -C "$STUDIO" commit -q -m "Start the design studio"
    collect_studio_branch
    echo "✅ Studio created at $STUDIO (its own repo, no shared history, no remote)."
    echo "Next: run the firewall check (Step 0b)."
    ;;
  enter)
    require_base_clean
    ensure_studio
    save_studio_work
    for f in CLAUDE.md settings.json; do
      [ -f "redesign/studio-template/$f" ] || { echo "✋ Missing redesign/studio-template/$f" >&2; exit 1; }
    done
    write_guard_files
    git -C "$STUDIO" add -A
    if ! git -C "$STUDIO" diff --cached --quiet; then git -C "$STUDIO" commit -q -m "Refresh studio guard files"; fi
    if git cat-file -e "$BASE:redesign/handoff" 2>/dev/null; then
      find "$STUDIO/redesign/handoff" -mindepth 1 ! -name .gitkeep -exec rm -rf {} +
      git archive "$BASE" redesign/handoff | tar -x -C "$STUDIO"
      git -C "$STUDIO" add -A redesign/handoff
      if ! git -C "$STUDIO" diff --cached --quiet; then
        git -C "$STUDIO" commit -q -m "Update handoff inputs"
        echo "Synced handoff inputs into the studio."
      fi
    fi
    collect_studio_branch
    cat <<MSG

✅ The studio is ready.

Open a NEW terminal window and run:
  cd "$STUDIO" && ./start

(Always ./start: a brand-new session with no connectors. To take screenshots,
 type  ! ./shoot  inside that session.)
This window stays your codebase on $BASE.
MSG
    ;;
  import)
    require_base_clean
    save_studio_work
    collect_studio_branch
    if ! have_branch && have_remote; then git fetch -q --no-tags origin "$SBRANCH:$SBRANCH" 2>/dev/null || true; fi
    have_branch || { echo "✋ There's no studio branch to import from." >&2; exit 1; }
    git checkout "$SBRANCH" -- redesign/design
    if git diff --cached --quiet; then
      echo "Nothing new to import."
      exit 0
    fi
    git commit -q -m "Import approved design guide from $SBRANCH"
    if have_remote; then git push -q; fi
    echo "✅ Imported redesign/design/ into $BASE."
    ;;
  *)
    sed -n '2,8p' "$0"
    exit 1
    ;;
esac
