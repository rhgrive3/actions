#!/usr/bin/env bash
set -euo pipefail
cd /workspace/stage-worktrees/bluefin
export INKWAVE_NATIVE_STAGE_SOURCE="$PWD/.codex-stage-sources/KiTrix/stages"
export INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated"
export NATIVE_STAGE_IDS=bluefin
export NATIVE_MOBILE_STAGE_IDS=bluefin
mkdir -p .browser-evidence/final
# Caller must first consume all accepted foundations and qualify whole banks.
git rev-parse HEAD > .browser-evidence/final/head.txt
git rev-parse codex/native-stage-expansion > .browser-evidence/final/foundation.txt
git status --porcelain > .browser-evidence/final/worktree-status.txt
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock python3 patches/native-stages/tools/build-native.py --source "$INKWAVE_NATIVE_STAGE_SOURCE" --out "$INKWAVE_NATIVE_STAGE_ASSETS" --stages bluefin > .browser-evidence/final/conversion.jsonl
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node --experimental-vm-modules --test --test-reporter=tap --test-concurrency=1 patches/native-stages/tests/*.test.mjs > .browser-evidence/final/cpu.tap 2>&1
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock python3 patches/native-stages/tools/verify-source.py --source "$INKWAVE_NATIVE_STAGE_SOURCE" --assets "$INKWAVE_NATIVE_STAGE_ASSETS" --report .browser-evidence/final/source-independent.json > .browser-evidence/final/source-independent.log
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node scripts/build-inkwave.mjs inkwave-public _site-native-bluefin-final > .browser-evidence/final/build-private.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock env -u INKWAVE_NATIVE_STAGE_ASSETS node scripts/build-inkwave.mjs inkwave-public _site-native-bluefin-final-public > .browser-evidence/final/build-public.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node scripts/check-inkwave-startup-budget.mjs _site-native-bluefin-final > .browser-evidence/final/startup-private.json
flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node scripts/check-inkwave-startup-budget.mjs _site-native-bluefin-final-public > .browser-evidence/final/startup-public.json
INKWAVE_BUILT_SITE="$PWD/_site-native-bluefin-final" flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node --test --test-concurrency=1 scripts/tests/inkwave-build-packaging.test.mjs > .browser-evidence/final/packaging-private.tap 2>&1
INKWAVE_BUILT_SITE="$PWD/_site-native-bluefin-final-public" flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node --test --test-concurrency=1 scripts/tests/inkwave-build-packaging.test.mjs > .browser-evidence/final/packaging-public.tap 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-stages.mjs _site-native-bluefin-final .browser-evidence/final/gameplay > .browser-evidence/final/gameplay.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-bluefin-human.mjs _site-native-bluefin-final .browser-evidence/final/human > .browser-evidence/final/human.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-bluefin-prefix.mjs _site-native-bluefin-final .browser-evidence/final/prefix > .browser-evidence/final/prefix.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-bluefin-banks.mjs _site-native-bluefin-final .browser-evidence/final/banks > .browser-evidence/final/banks.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-tower-calibration.mjs _site-native-bluefin-final .browser-evidence/final/tower-calibration > .browser-evidence/final/tower-calibration.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-source-browser.mjs _site-native-bluefin-final-public .browser-evidence/final/source-browser > .browser-evidence/final/source-browser.log 2>&1
# Named peer Hump owns the once-only strict five-mode production WS gate on this exact pair; bind its receipt before Ready.
NATIVE_RENDER_MOVING=1 flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-render.mjs _site-native-bluefin-final .browser-evidence/final/render > .browser-evidence/final/render.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-projectiles.mjs _site-native-bluefin-final .browser-evidence/final/projectiles > .browser-evidence/final/projectiles.log 2>&1
NATIVE_STAGE_ID=bluefin flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-camera-basis.mjs _site-native-bluefin-final .browser-evidence/final/camera > .browser-evidence/final/camera.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-spawn-landing.mjs _site-native-bluefin-final .browser-evidence/final/landing > .browser-evidence/final/landing.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-floor-initial.mjs _site-native-bluefin-final .browser-evidence/final/initial-bots > .browser-evidence/final/initial-bots.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-bluefin-layers.mjs _site-native-bluefin-final .browser-evidence/final/layers > .browser-evidence/final/layers.log 2>&1
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-lifecycle.mjs _site-native-bluefin-final .browser-evidence/final/lifecycle > .browser-evidence/final/lifecycle.log 2>&1
