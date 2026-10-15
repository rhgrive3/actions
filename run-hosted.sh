#!/usr/bin/env bash
set -euo pipefail
node "$PACKAGE/capture.mjs" --plan "$PACKAGE/plan.json" --source "$SOURCE" --site "$SITE" --out "$REMOTE_EVIDENCE"
