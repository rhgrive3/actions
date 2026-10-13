#!/usr/bin/env bash
set -euo pipefail
cd /workspace/stage-worktrees/bluefin
export INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated"
export NATIVE_STAGE_IDS=bluefin NATIVE_MOBILE_STAGE_IDS=bluefin
mkdir -p .browser-evidence/accepted79ad-partial
git rev-parse HEAD > .browser-evidence/accepted79ad-partial/head.txt
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node scripts/build-inkwave.mjs inkwave-public _site-native-bluefin-accepted79ad > .browser-evidence/accepted79ad-partial/build-private.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock env -u INKWAVE_NATIVE_STAGE_ASSETS node scripts/build-inkwave.mjs inkwave-public _site-native-bluefin-accepted79ad-public > .browser-evidence/accepted79ad-partial/build-public.log 2>&1
node scripts/check-inkwave-startup-budget.mjs _site-native-bluefin-accepted79ad > .browser-evidence/accepted79ad-partial/startup-private.json
node scripts/check-inkwave-startup-budget.mjs _site-native-bluefin-accepted79ad-public > .browser-evidence/accepted79ad-partial/startup-public.json
INKWAVE_BUILT_SITE="$PWD/_site-native-bluefin-accepted79ad" node --test scripts/tests/inkwave-build-packaging.test.mjs > .browser-evidence/accepted79ad-partial/packaging-private.tap 2>&1
INKWAVE_BUILT_SITE="$PWD/_site-native-bluefin-accepted79ad-public" node --test scripts/tests/inkwave-build-packaging.test.mjs > .browser-evidence/accepted79ad-partial/packaging-public.tap 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-projectiles.mjs _site-native-bluefin-accepted79ad .browser-evidence/accepted79ad-partial/projectiles > .browser-evidence/accepted79ad-partial/projectiles.log 2>&1
NATIVE_RENDER_MOVING=1 flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-render.mjs _site-native-bluefin-accepted79ad .browser-evidence/accepted79ad-partial/render > .browser-evidence/accepted79ad-partial/render.log 2>&1
NATIVE_STAGE_ID=bluefin flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-camera-basis.mjs _site-native-bluefin-accepted79ad .browser-evidence/accepted79ad-partial/camera > .browser-evidence/accepted79ad-partial/camera.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-lifecycle.mjs _site-native-bluefin-accepted79ad .browser-evidence/accepted79ad-partial/lifecycle > .browser-evidence/accepted79ad-partial/lifecycle.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-source-browser.mjs _site-native-bluefin-accepted79ad-public .browser-evidence/accepted79ad-partial/source-browser > .browser-evidence/accepted79ad-partial/source-browser.log 2>&1
