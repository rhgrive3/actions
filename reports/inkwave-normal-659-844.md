# Normal fixes 659 and 844

Layered after CI repair wave 3, without replacing current shared files. Main merge remains pending.

- Refs #659: native ShadowCache root replacement releases the previous static caster array immediately. GPU target ownership and the next render collector are preserved. Existing resource-fixture resolver repair was already published and is not reapplied.
- Refs #844: Charger interruption enters the existing cancelMainForSub owner and waits five frames before sub aim. Existing post-shot fifteen-frame gate, preparation, keep, payment and deadline cancellation remain separate. Historical version calibration limits remain in the original report.

Original bounded tests: shadow 8; interruption plus post-shot 21. Independent reviews passed. Current composed boundaries: shadow 3 and interruption/keep/cancellation 4 passed. No runtime constants were inferred or changed beyond the documented interruption gate. Real browser acceptance remains CI work.
