#!/usr/bin/env bash
# Offline-capable local verification. No GitHub access or writes.
# Keep results of every phase, including failures; do not stop after one failure.
set -u
cd "$(dirname "$0")/.." || exit 2
OUT="${INKWAVE_AUDIT_EVIDENCE:-$PWD/.ci-scratch/weapon-audit}"
mkdir -p "$OUT" || exit 2
status=0
run() {
  local name="$1"; shift
  printf '\n== %s ==\n' "$name"
  "$@" > "$OUT/$name.log" 2>&1
  local code=$?
  printf '%s\n' "$code" > "$OUT/$name.exit"
  tail -n 14 "$OUT/$name.log"
  if [ "$code" -ne 0 ]; then status=1; fi
}
run source node scripts/check-weapons-reference.mjs patches/splatoon3/reference/weapon-audit-1130
run completion node scripts/verify-completion-sources.mjs patches/splatoon3/reference/weapon-audit-1130
run splatoon3 node --experimental-vm-modules --test --test-concurrency=4 patches/splatoon3/tests/*.test.mjs
run measurement-provenance node --test scripts/tests/weapon-measurement-provenance.test.mjs
run diagnostic-budget node --test patches/loading-cache/tests/offline-diagnostic.test.mjs
run related node --experimental-vm-modules --test --test-concurrency=3 patches/loading-cache/tests/*.test.mjs patches/network-replication/tests/*.test.mjs patches/movement-physics/tests/*.test.mjs patches/practice-range/tests/*.test.mjs
run quality node --experimental-vm-modules --test --test-concurrency=3 patches/local-quality/tests/*.test.mjs patches/reliability/tests/*.test.mjs
run build env INKWAVE_BUILD_UNMINIFIED=1 node scripts/build-inkwave.mjs
if [ "$(cat "$OUT/build.exit")" = 0 ]; then
  run emitted bash scripts/check-weapon-audit-emitted.sh _site
  run integrated node --experimental-vm-modules scripts/check-inkwave-weapons-fidelity.mjs --site _site
  run measurements node --experimental-vm-modules scripts/measure-weapons-fidelity.mjs --site _site --after --out "$OUT/measurements.json"
fi
printf '\nEvidence: %s\n' "$OUT"
printf 'Nintendo hardware parity is NOT certified by these local tests.\n'
exit "$status"
