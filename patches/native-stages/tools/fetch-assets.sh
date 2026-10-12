#!/usr/bin/env bash
# Run from the root of the rhgrive3/actions checkout after the handoff ZIP was extracted.
# Downloads 5 third-party reference OBJ/MTL/PNG trees into an ignored local directory.
set -euo pipefail
REPO_ROOT="${1:-$PWD}"
REFERENCE_COMMIT=0611f51b35c9736ee986fb2218461e2585b7875e
TARGET="$REPO_ROOT/.codex-stage-sources/KiTrix"
STAGES=(Vss_Yunohana Vss_Yagara Vss_Upland03 Vss_Line03 Vss_BigSlope00)
command -v git >/dev/null
command -v git-lfs >/dev/null || { echo 'Install git-lfs in the Codex Cloud setup environment.' >&2; exit 2; }
if [ ! -d "$TARGET/.git" ]; then
  mkdir -p "$(dirname "$TARGET")"
  GIT_LFS_SKIP_SMUDGE=1 git clone --no-checkout --depth 1 --filter=blob:none https://github.com/kirakira-dev/KiTrix.git "$TARGET"
fi
(
cd "$TARGET"
git sparse-checkout init --cone
DIRS=()
for stage in "${STAGES[@]}"; do DIRS+=("stages/$stage"); done
git sparse-checkout set "${DIRS[@]}"
git fetch --depth 1 origin "$REFERENCE_COMMIT"
GIT_LFS_SKIP_SMUDGE=1 git checkout --detach "$REFERENCE_COMMIT"
# LFS requires a network route that allows GitHub's LFS batch endpoint and object redirects.
PATTERNS=()
for stage in "${STAGES[@]}"; do PATTERNS+=("stages/$stage/$stage.obj"); done
INCLUDE=$(IFS=,; echo "${PATTERNS[*]}")
git lfs pull --include="$INCLUDE" --exclude=''
for stage in "${STAGES[@]}"; do
  obj="stages/$stage/$stage.obj"
  test -s "$obj" || { echo "Missing $obj" >&2; exit 3; }
  test "$(wc -c < "$obj")" -gt 500000 || { echo "LFS pointer only: $obj" >&2; exit 4; }
  test -f "stages/$stage/$stage.mtl" || { echo "Missing MTL: $stage" >&2; exit 5; }
done
)
printf 'Reference asset directory (do not commit): %s\n' "$TARGET/stages"
printf 'To regenerate stage5, set INKWAVE_NATIVE_ASSETS=%s/stages\n' "$TARGET"
printf 'INKWAVE_MAIN_SOURCE=%s/inkwave-public\n' "$REPO_ROOT"
