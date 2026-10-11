# Tacticooler and Drop Roller takeover candidate

## Confirmed gaps

An actual Actor with Tacticooler had run multiplier 1.364965, but owner snapshot → JSON → host takeover produced multiplier 1 and no drink. A real Super Jump landing followed by Drop Roller completion had 2.9667 seconds of its temporary buff and run multiplier 1.3735; the adopted owner had zero remaining and multiplier 1. Remote presentation intentionally does not grant gameplay AP, so this work restores the bounded effect only when that replica becomes an owner.

## Independent implementation

A new `gb` sidecar carries match, actor, life and existing adoption sequence identities plus an optional birth/deadline identifier and remaining seconds for each effect. It is read only after native ownership/order admission and valid fixed-slot gear admission. It never transmits AP, speed, damage or an arbitrary multiplier. A receipt is immutable and bound to the actual local match object. Same-generation packets cannot replenish elapsed time; cancellation retains the generation high-water mark so the old effect cannot be reintroduced in a newer envelope. Older generations, invalid slots, over-limit values and extra fields are rejected. A fresh generation may renew the effect within its existing limits.

The existing active simulation clock from the separate conditional-clock candidate ages receipts. Waiting before takeover counts once, pause does not consume active effect time, and missing sidecars keep aging the previous valid receipt. Only after native adoption does the runtime invoke the local Tacticooler grant and restore the local Drop Roller remainder, then recompute gear effects from existing code. Native death/respawn and new-match boundaries cannot import an old effect.

Tacticooler's limit is derived from the existing pinned `TACTICOOLER_SOURCE.powerUpFrames[2] / 60` (25 seconds); its actual AP remains the local 29/57 maximum model. Drop Roller's three-second/30-AP buff remains the existing implementation. This change does not newly establish the unverified Drop Roller travel distance or pose duration. The 86,400 birth-time bound is a transport defense, not retail tuning. Remote owner claims remain client-authoritative; a valid owner could invent a new generation within the bounds. This is not server-attested pickup or landing proof. Unknown transit latency is not reconstructed.

## Evidence

- Actual N-ZAP Tacticooler activation, stand contact pickup, JSON transfer, two-second receiver wait, adoption and expiry: 30/60/120 Hz.
- Actual Super Jump landing and Drop Roller completion, JSON transfer, half-second wait, adoption and expiry: 30/60/120 Hz.
- Same-generation refill, cancel/replay, fresh renewal, stale generation, invalid owner/life/sequence/match/slots/values, missing sidecar, pause, new connection/match, new life and pending native respawn.
- Initial focused source groups passed 10/10 after fixture corrections. The combined production-built group passed 53/53 (transient 10, conditional 22, static equipment 21), then the added pending-respawn case separately passed 1/1 in source and built modules.
- Production content hash: `1623b43da84ebb73bfaaa3365199d422161bb041a595e42fd5e57d71be8a4d61`.

The broad source/network gates, actual browser verification and remote publication are still pending. Publication order remains static equipment PR 1242, conditional clocks, then this independent candidate. No all-gear or retail-complete claim is made.

## Independent review corrections

A regular ordered 100 ms delivery test initially reproduced 0.100 seconds of excess adopted time. The sidecar now includes the existing owner's elapsed match time. On reception, known elapsed receiver time beyond that timestamp is deducted, with no credit when the receiver clock is behind. Same-generation deadline clamping remains in place. The corrected drink latency and two-successive-host tests pass, including a missing later sidecar, explicit new-owner cancellation and original-owner replay. Drop Roller now exercises 100 ms delivery at each 30/60/120 Hz rate as well. Unsynchronized clocks and unknown latency beyond this existing match-clock evidence remain unverified.

The first broader network pass exposed 16 legacy partial-context fixture errors because the packer assumed a configured room. It now omits the sidecar when room identity or match timing is unavailable, preserving the native protocol path instead of throwing. The targeted event-container group passes 4/4; the full network gate is rerun for this correction. The separate conditional-clock initialization regression was fixed in its own commit and then inherited here.

After the review corrections, all 448 network regressions pass. The focused source transfer/latency group passes 13/13; the rebuilt transfer/latency plus pure conditional/Flow regression group passes 16/16. Current built content hash is `0cba57384401fcb2092a7af68f3fea750b96a8a37105a9f41054c6943e2941d1`. An earlier broad source run is retained as diagnostic evidence because code changed during that run; a frozen full gate is still required.

## Frozen full-gate retry

The concurrency-four frozen source gate ended with one file-worker failure in `catalogue-sub-paint-authority.test.mjs` (3,859 total, 3,848 pass, 10 skip). The spec reporter retained only `test failed`, without a signal or exit cause; the failure-time memory peak was unavailable. A later executor transport disconnect recovered, but its relationship to that earlier failure is unknown. The affected file separately passed all 13 cases with TAP output. This did not replace the failed full gate.

After the conditional-clock gate completed, the unchanged transient tree was tested end-to-end again with detailed TAP and concurrency two: **3,871 total, 3,861 pass, 10 explicit optional-reference skips, zero failures**, 1,658 seconds. No assertion or code was weakened. The earlier failure remains unexplained rather than being labelled an OOM or hidden as a success. Actual browser evidence and publication remain pending the separate conditional-clock PR 1244.

A subsequent browser probe adds actual Tacticooler stand contact and the adapted Super Jump landing/Drop Roller completion, then JSON transfer, known 100 ms delivery plus 500 ms wait, takeover, locally recomputed speed and expiry. It uses actual Actor/Physics with a controlled display fixture, preserves the shared scene clock/level, and is included in the existing Chromium/WebKit catalog runner for future CI. The exact extracted probe passes locally in source and production-built modules; the built static/clock/transient probe group passes 3/3, with unchanged content hash `0cba57384401fcb2092a7af68f3fea750b96a8a37105a9f41054c6943e2941d1`. This probe was added after the frozen 3,871-case gate; actual browser execution remains pending, and no rendered-character or retail-motion comparison is claimed.

## Separate sparse-sidecar candidate

The first isolated 8-actor pack/JSON microbenchmark measured about 2.0–2.5 microseconds per call (50,000 iterations), but its initial 30 Hz bandwidth extrapolation was hypothetical. Actual production `NetMatch` uses `TICK = 1 / 20`. The actual composed update loop was subsequently run for 600 frames after warm-up and emitted exactly 200 tick packets in 10 seconds.

A separate optimization omits the transient sidecar only for actors that have never emitted an effect and have no received effect receipt. A per-NetMatch weak set retains explicit null cancellation rows after any transmission; inherited receipts also force a row. Cancellation, death, new life and equipment changes cannot silently fall back to an older effect. The additional actual JSON cases cover a lost cancellation followed by its repeated null, death/respawn, adoption of a cancelled receipt while another peer still has the old active effect, and shoes changed after actual Super Jump/Drop Roller completion. Source transfer tests pass 17/17; this is separate from the earlier dense candidate's full gate.

In the 8-owned-actor composed update harness, the never-used sidecar changed from 127,928 JSON bytes over 10 seconds to zero. The active-drink and cancelled-state payloads were unchanged at 184,328 and 129,120 bytes respectively. These are measured serialized protocol bytes in a local fixture, not WebSocket framing, relay fan-out, compression, or real-browser bandwidth. The sparse optimization only saves traffic before first use; cancellation traffic is deliberately retained. Timing varied between isolated runs and is not claimed as a CPU improvement.

## Final sparse-candidate gate

The frozen sparse candidate completed the full source gate with **3,876 tests: 3,866 pass, 10 explicit optional-reference skips, zero failures**, 1,675 seconds at concurrency two. The immediately preceding full network gate passed **448/448**. Focused source transfer tests passed **17/17** and the production-built transfer plus browser-probe contract group passed **18/18**, content hash `55def9eaf5ac50bbba5d0da3ff95331a058b14af7b0d876bdaa4208f2b0434eb`. The base is adopted main `bf38901475fa857016cf06bcc98cd764898795d0`, whose tree was independently matched to local `e56b94a`. Actual Chromium/WebKit verification of the new transient probe, exact-head CI, merge and deployment remain pending its independent PR.
