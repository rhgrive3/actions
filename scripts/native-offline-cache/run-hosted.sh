#!/usr/bin/env bash
set -euo pipefail
cd "$PACKAGE"
mkdir -p "$IDB_EVIDENCE"
node acceptance.mjs 2>&1 | tee "$IDB_EVIDENCE/acceptance.log"
