# Native online final paint settlement

The native online checker could finish its initial paint watermark/growth/replay wait, apply a ranked snapshot and advance 20 ordinary frames, then hash while newly produced paint was still growing. Actual Urchin Rainmaker evidence rejected that stale settlement claim: both full grids already had the same SHA-256 and ranked counts `[65,100]`, but both peers had three active growth entries. The failed run remains in ignored `urchin/.browser-evidence/final-online/`.

The checker reuses the same genuine settlement loop after the ranked snapshot and immediately before the final hashes. It records initial and final phase receipts. Each phase retains the 120-second deadline and at most 300 batches of five ordinary frames, the real host paint watermark, both growth queues, replay queues and outbound paint queues. Timeouts, final zero-queue assertions, full-grid equality and ranked equality remain strict. No queues, actors, rules or hashes are cleared or replaced.

The actual five-mode rerun passed against the unchanged immutable Urchin runtime artifact `d7f93d077dda20300c7f6e9043ba6ec1743aad7c59e6e0b0e41e6a9e97b8531c`: real WebSocket plus production RoomDurableObject, 8 actors per peer, host `s3-blaster-short`, Luna probe radius 3.84, 2,082 packets, no browser errors. Initial/final phase receipts show zero growth/replay/outbound paint queues on both peers for every mode. Entire grids agree: 2,539,305 cells in Turf/Zones/Rainmaker/Clams and 2,539,405 in Tower, including its dynamic deck cells. All four ranked snapshots agree at `[65,100]`. The fixed run used 215/205/15/205/295 initial settling frames and five final settling frames, respectively; no deadline rejection occurred. The earlier Rainmaker negative receipt is preserved, not relabeled as a timeout or divergence.

Only the test runner changes. Product source, geometry, paint logic and build identity are unchanged. Numeric receipts are in `native-online-final-settlement-verification.json`; detailed source evidence stays ignored. Source rights/version/retail semantics and physical mobile or Switch performance remain unverified.

```sh
NATIVE_STAGE_IDS=urchin NATIVE_HOST_WEAPON=s3-blaster-short TMPDIR="$PWD/.ci-scratch/t" flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-online.mjs _site-native-urchin .browser-evidence/final-online-settled
```
