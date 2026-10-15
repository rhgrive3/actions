#!/usr/bin/env bash
set -euo pipefail
cd "$PACKAGE"
mkdir -p "$BITMAP_EVIDENCE"
node --test gate.test.mjs binding.test.mjs 2>&1 | tee "$BITMAP_EVIDENCE/controls.log"
node acceptance.mjs "$SOURCE_ROOT" "$BITMAP_EVIDENCE/result.json" 2>&1 | tee "$BITMAP_EVIDENCE/browser.log"
