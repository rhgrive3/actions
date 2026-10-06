# PR612 Storm snapshot/event authority connection

This patch sits on the integration-owned PR609/612 pair, main37ab. Its base includes the integration owner's main694 respawn anchor preserving superJumpGround. It does not change Storm hold semantics or add PR322/668.

## Failure and repair

Native NetMatch.update samples accepted remote state, then plays events; Match applies the sampled actor presentation afterward. The former auth gate read actor.specialActive from the previous frame. A valid inactive-to-Storm packet therefore lost its use and birth at 30/60/120Hz. The comparison script masked this by applying Storm actor state before events.

The receiver now attaches local proof only after the actor snapshot in that packet has passed existing owner and combat-life acceptance. The active/alive snapshot, packet timestamp and simulation tick bound the event. Incoming same-named proof properties are overwritten; event-only packets cannot authorize anything. Replaying use/birth also checks the latest accepted snapshot remains active/alive under the same owner/life. Same-tick birth, monotonic sequence, one-use, and death/respawn/handoff retirement remain. Duplicate use notifications for an already consumed same-tick authority cannot rearm it. Old ordered packets cannot overwrite newer inactive evidence.

This intentionally allows the prior rendered/sample state to be inactive when an activation event precedes its containing 20Hz snapshot by one or two fixed ticks. It does not infer permission from that prior presentation. The snapshot and event remain tied at receipt. If a sender supplies no accepted active snapshot, or its latest accepted state has already ended/died/changed life before playback, admission stays closed. General historical reconstruction across such absent evidence and delayed PR322 hold-to-throw is outside this connection.

## Evidence

- Before: native update order drops legitimate Storm at 30/60/120Hz; sampled special=true, actor before=null, auth=null, bombs=0. Moving presentation before events makes the same packet produce one bomb, isolating the defect.
- After: 20Hz send phases 0/1F/2F × 30/60/120Hz, nine native update-order positive cases, exactly one bomb.
- Negative cases: inactive snapshot, wrong sender, event without snapshot, stale/old ticks, duplicate birth/use, later inactive/dead/new-life snapshot, forged proof, respawn cancellation, and out-of-order active packet after accepted inactive. All pass.
- Changed network test files plus dedicated native-order cases: 47/47. Prior manual-active security cases moved to native received-snapshot tests. Existing cloud catch-up tests now supply the actual accepted snapshot and owner clock rather than inventing actor activation.
- Canonical Storm comparison with production-order sample→events→applyRemote restored: 546 compared steps, maximum position error 0.005023470633679599, all final entities retired, owner/receiver random draws 494/494. Persistent receipt saved under the movement evidence directory.
- No new build, aggregate, source PR or CI was run here. The integration owner runs the combined gates. No browser or physical-device claim.
