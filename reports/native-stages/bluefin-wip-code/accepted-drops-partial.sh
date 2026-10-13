#!/usr/bin/env bash
set -euo pipefail
cd /workspace/stage-worktrees/bluefin
export INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated"
export INKWAVE_NATIVE_STAGE_SOURCE="$PWD/.codex-stage-sources/KiTrix/stages"
export NATIVE_STAGE_IDS=bluefin NATIVE_MOBILE_STAGE_IDS=bluefin
mkdir -p .browser-evidence/accepted-drops-partial
git rev-parse HEAD > .browser-evidence/accepted-drops-partial/head.txt
git rev-parse codex/native-stage-expansion > .browser-evidence/accepted-drops-partial/foundation.txt
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node --experimental-vm-modules --test --test-concurrency=1 patches/native-stages/tests/bluefin-source.test.mjs > .browser-evidence/accepted-drops-partial/cpu-source.log 2>&1
python3 patches/native-stages/tools/verify-source.py --source "$INKWAVE_NATIVE_STAGE_SOURCE" --assets "$INKWAVE_NATIVE_STAGE_ASSETS" --report .browser-evidence/accepted-drops-partial/source-independent.json > .browser-evidence/accepted-drops-partial/source-independent.log
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node scripts/build-inkwave.mjs inkwave-public _site-native-bluefin-accepted-drops > .browser-evidence/accepted-drops-partial/build-private.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock env -u INKWAVE_NATIVE_STAGE_ASSETS node scripts/build-inkwave.mjs inkwave-public _site-native-bluefin-accepted-drops-public > .browser-evidence/accepted-drops-partial/build-public.log 2>&1
node scripts/check-inkwave-startup-budget.mjs _site-native-bluefin-accepted-drops > .browser-evidence/accepted-drops-partial/startup-private.json
node scripts/check-inkwave-startup-budget.mjs _site-native-bluefin-accepted-drops-public > .browser-evidence/accepted-drops-partial/startup-public.json
INKWAVE_BUILT_SITE="$PWD/_site-native-bluefin-accepted-drops" node --test scripts/tests/inkwave-build-packaging.test.mjs > .browser-evidence/accepted-drops-partial/packaging-private.tap 2>&1
INKWAVE_BUILT_SITE="$PWD/_site-native-bluefin-accepted-drops-public" node --test scripts/tests/inkwave-build-packaging.test.mjs > .browser-evidence/accepted-drops-partial/packaging-public.tap 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-projectiles.mjs _site-native-bluefin-accepted-drops .browser-evidence/accepted-drops-partial/projectiles > .browser-evidence/accepted-drops-partial/projectiles.log 2>&1
NATIVE_RENDER_MOVING=1 flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-render.mjs _site-native-bluefin-accepted-drops .browser-evidence/accepted-drops-partial/render > .browser-evidence/accepted-drops-partial/render.log 2>&1
NATIVE_STAGE_ID=bluefin flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-camera-basis.mjs _site-native-bluefin-accepted-drops .browser-evidence/accepted-drops-partial/camera > .browser-evidence/accepted-drops-partial/camera.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-lifecycle.mjs _site-native-bluefin-accepted-drops .browser-evidence/accepted-drops-partial/lifecycle > .browser-evidence/accepted-drops-partial/lifecycle.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-source-browser.mjs _site-native-bluefin-accepted-drops-public .browser-evidence/accepted-drops-partial/source-browser > .browser-evidence/accepted-drops-partial/source-browser.log 2>&1
NATIVE_HOST_WEAPON=s3-blaster-short flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-online.mjs _site-native-bluefin-accepted-drops .browser-evidence/accepted-drops-partial/online > .browser-evidence/accepted-drops-partial/online.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-stages.mjs _site-native-bluefin-accepted-drops .browser-evidence/accepted-drops-partial/gameplay > .browser-evidence/accepted-drops-partial/gameplay.log 2>&1
