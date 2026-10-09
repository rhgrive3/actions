#!/usr/bin/env bash
# Test the actual emitted modules. Browser GPU is a separate, explicit probe.
set -eu
cd "$(dirname "$0")/.."
site="$(cd "${1:-_site}" && pwd)"
test -f "$site/inkwave-build.json"
export INKWAVE_ASSIST_BUILT_SITE="$site" INKWAVE_MAP_POLICY_SITE="$site" INKWAVE_TIE_BUILT_SITE="$site"
export INKWAVE_TENACITY_BUILT_SITE="$site" INKWAVE_CONTINUATION_BUILT_SITE="$site" INKWAVE_HUD_BUILT_SITE="$site"
export INKWAVE_HUD_SNAPSHOT_SITE="$site" INKWAVE_PORTRAIT_SITE="$site" INKWAVE_INPUT_POLICY_SITE="$site"
node --experimental-vm-modules --expose-gc --test --test-concurrency=3 \
  patches/splatoon3/tests/assist-presentation.test.mjs \
  patches/splatoon3/tests/default-map-information.test.mjs \
  patches/splatoon3/tests/turf-alpha-tie.test.mjs \
  patches/local-quality/tests/tenacity.test.mjs \
  patches/local-quality/tests/result-continuation.test.mjs \
  patches/local-quality/tests/hud-authority.test.mjs \
  patches/local-quality/tests/hud-snapshots.test.mjs \
  patches/local-quality/tests/portrait-guard.test.mjs \
  patches/local-quality/tests/fx-actor-lifetime.test.mjs \
  patches/local-quality/tests/ui-actor-lifetime.test.mjs \
  patches/local-quality/tests/runtime-lifetime.test.mjs \
  patches/reliability/tests/input-policy-emitted.test.mjs \
  patches/reliability/tests/focus-loss-verifier.test.mjs \
  patches/reliability/tests/inkwave-six-followup-composition.test.mjs
