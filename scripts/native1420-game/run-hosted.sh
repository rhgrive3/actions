#!/usr/bin/env bash
# Private launcher only. No workflow dispatch/publication is supplied.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${NATIVE1420_GAME_AUTHORIZED:-}" == true ]]
: "${COMMON_CHECKOUT:?exact clean c99 checkout}" "${GAME_SITE:?new output directory}" "${GAME_EVIDENCE:?compact output}" "${RUNNER_TEMP:?ephemeral cache}"
PACKAGE="$(cd "$(dirname "$0")" && pwd)"
export PLAYWRIGHT_MODULE="$PACKAGE/node_modules/playwright/index.mjs"
export ESBUILD_MODULE="$PACKAGE/node_modules/esbuild/lib/main.js"
export CHROMIUM_PATH="$(node --input-type=module -e "import {chromium} from '$PLAYWRIGHT_MODULE';console.log(chromium.executablePath())")"
export CATALOGUE_TREE_RESPONSE_CACHE="$RUNNER_TEMP/native1420-tree-response.json"
export GAME_BINDING="$GAME_EVIDENCE/build-binding.json"
export GAME_RESOURCE_PINS="$GAME_EVIDENCE/resource-pins.json"
[[ ! -e "$GAME_SITE" && ! -e "$GAME_EVIDENCE" ]]
mkdir -p "$GAME_EVIDENCE"
node --test "$PACKAGE/test-final-binding.mjs" "$PACKAGE/test-resource-pins.mjs" > "$GAME_EVIDENCE/gate-tests.log"
node "$PACKAGE/prepare-build.mjs" "$COMMON_CHECKOUT" "$GAME_SITE" "$GAME_BINDING" > "$GAME_EVIDENCE/build.log" 2>&1
node "$PACKAGE/prepare-resources.mjs" "$GAME_SITE" "$GAME_SITE" "$GAME_RESOURCE_PINS" > "$GAME_EVIDENCE/resource-preflight.log" 2>&1
# Dependency link is diagnostic-only and added after source composition verification.
[[ ! -e "$COMMON_CHECKOUT/node_modules" ]]
ln -s "$PACKAGE/node_modules" "$COMMON_CHECKOUT/node_modules"
export NATIVE_STAGE_IDS=shipshape NATIVE_SHIPSHAPE_RANKED_MODES=zones NATIVE_SHIPSHAPE_TEAMS=1 NATIVE_SHIPSHAPE_RENDER_HZ=30,60,120
GAME_NETWORK_RECEIPT="$GAME_EVIDENCE/dry-network.json" node --import "$PACKAGE/browser-preload.mjs" "$COMMON_CHECKOUT/scripts/check-inkwave-shipshape-ranked-objectives.mjs" "$GAME_SITE" "$RUNNER_TEMP/native1420-dry" > "$GAME_EVIDENCE/dry.log" 2>&1
GAME_NETWORK_RECEIPT="$GAME_EVIDENCE/wet-network.json" node --import "$PACKAGE/browser-preload.mjs" "$COMMON_CHECKOUT/scripts/check-inkwave-shipshape-climb-refill-guards.mjs" "$GAME_SITE" "$RUNNER_TEMP/native1420-wet" > "$GAME_EVIDENCE/wet.log" 2>&1
cp "$RUNNER_TEMP/native1420-dry/browser.json" "$GAME_EVIDENCE/dry.json"
cp "$RUNNER_TEMP/native1420-wet/browser.json" "$GAME_EVIDENCE/wet.json"
node "$PACKAGE/verify-final.mjs" "$GAME_EVIDENCE/dry.json" "$GAME_EVIDENCE/wet.json" "$GAME_EVIDENCE/dry-network.json" "$GAME_EVIDENCE/wet-network.json" "$GAME_BINDING" > "$GAME_EVIDENCE/qualification.json"
# Only GAME_EVIDENCE/*.json and *.log are eligible artifacts. No site/assets/screenshots/cache.
