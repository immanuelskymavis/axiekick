#!/usr/bin/env bash
# Publish the current build to GitHub Pages.
#
# gh-pages is an orphan branch holding one file: the game, at the root, so the
# site URL is the game itself. Nothing here is generated at deploy time - the
# build is already a single self-contained file - so this is a copy and a
# force-push, and re-running it is always safe.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=game/index.html
[ -f "$SRC" ] || { echo "missing $SRC"; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cp "$SRC" "$WORK/index.html"
cp "$SRC" "$WORK/game.html"     # keeps /game.html working if anyone bookmarked it
touch "$WORK/.nojekyll"         # Jekyll would otherwise eat files starting with _

git worktree add --detach "$WORK/repo" >/dev/null
(
  cd "$WORK/repo"
  # a fresh throwaway branch every time: --orphan gh-pages fails the moment a
  # local gh-pages exists, which silently broke the second deploy
  git checkout --orphan "pages-$$" >/dev/null 2>&1
  git rm -rq --cached . 2>/dev/null || true
  find . -maxdepth 1 ! -name . ! -name .git -exec rm -rf {} +
  cp "$WORK/index.html" "$WORK/game.html" "$WORK/.nojekyll" .
  git add -A
  git commit -qm "Publish $(cd .. && git -C "$OLDPWD" rev-parse --short HEAD 2>/dev/null || echo build)"
  git push -qf origin "HEAD:gh-pages"
)
git worktree remove --force "$WORK/repo"
echo "pushed gh-pages: $(wc -c < "$SRC" | tr -d " ") bytes -> https://immanuelskymavis.github.io/axiekick/"
