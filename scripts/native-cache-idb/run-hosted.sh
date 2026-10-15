#!/usr/bin/env bash
set -euo pipefail
cd "$PACKAGE"
mkdir -p "$IDB_EVIDENCE"
node --test receipt-gate.test.mjs 2>&1 | tee "$IDB_EVIDENCE/receipt-gate.log"
node acceptance.mjs baseline.mjs candidate.mjs "$IDB_EVIDENCE/result.json" 2>&1 | tee "$IDB_EVIDENCE/acceptance.log"
