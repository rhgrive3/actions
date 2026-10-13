#!/bin/bash
set -eu
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" node scripts/build-inkwave.mjs inkwave-public _site-native-shipshape > .ci-scratch/final-current/private-build.log 2>&1
INKWAVE_BUILT_SITE="$PWD/_site-native-shipshape" node --test --test-concurrency=1 scripts/tests/inkwave-build-packaging.test.mjs > .ci-scratch/final-current/private-packaging.log 2>&1
node scripts/check-inkwave-startup-budget.mjs _site-native-shipshape > .ci-scratch/final-current/private-budget.json
node scripts/build-inkwave.mjs inkwave-public _site-native-shipshape-public > .ci-scratch/final-current/public-build.log 2>&1
INKWAVE_BUILT_SITE="$PWD/_site-native-shipshape-public" node --test --test-concurrency=1 scripts/tests/inkwave-build-packaging.test.mjs > .ci-scratch/final-current/public-packaging.log 2>&1
node scripts/check-inkwave-startup-budget.mjs _site-native-shipshape-public > .ci-scratch/final-current/public-budget.json
