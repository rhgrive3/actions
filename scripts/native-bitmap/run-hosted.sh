#!/usr/bin/env bash
set -euo pipefail
cd "$PACKAGE"
mkdir -p "$BITMAP_EVIDENCE"
node --test receipt-gate.test.mjs 2>&1 | tee "$BITMAP_EVIDENCE/receipt-gate.log"
node acceptance.mjs candidate.mjs baseline.mjs "$GITHUB_WORKSPACE/inkwave-public/vendor/three/build" "$BITMAP_EVIDENCE/result.json" 2>&1 | tee "$BITMAP_EVIDENCE/acceptance.log"
