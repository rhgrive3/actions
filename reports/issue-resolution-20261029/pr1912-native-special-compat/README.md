# PR1912 native special replay compatibility

Production repair: `d250a9e7bd7336078b85f739657d8cfd3dc2f086`. Separate policy-test repair: `756aa4f781b65af52c606ff7d1e67a60af5a4fcb`. Both are isolated followups to owner head `11ea9f273bc315257699e4436d08c273145bee05`. Source identities, raw-log hashes and compressed archive hashes are in [manifest.json](manifest.json). No browser, hardware or combined emitted build was run in this receipt.

The new PR's presentation gate required an R2 sequence receipt although the native receiver and catalogue still accepted legacy event layouts. An actual composed Actor/native recorder/send tick produced Triple Splashdown. The actual receiver accepted both formats, but the original PR created zero remote fists for the legacy format; the current stack catalogue created two. R2 created two in both cases. The legacy control removes the current producer's R2 event trailers and packet marker to exercise the receiver's accepted legacy layout. It is not a captured historical client session.

The repair retains R2 native watermark/sequence admission. Legacy correlation uses private receiver data: the actual accepted native FIFO event, the accepted actor snapshot and life, exact peer/session/match/actor-net identities, and subsequent playback order. A legacy use issues a ticket only after native validation reaches `_playEvent`; a later catalogue action must consume the matching prior ticket. A per-actor native-use timestamp watermark prevents the same legacy use issuing a second ticket. Sender annotations and direct unsequenced `_play` calls cannot substitute for the private frame. Neither the wire format nor native projectile admission changes.

The native fixture uses actual composed Actor, Level, Physics, NetMatch, serialization, receiver and fists. It equips/refills the component owner to enter native activation; it is not an independent multi-client session or a proof of remote gauge authority. Positive controls use genuine producer rows. Wrong-owner, old-life, no-use, replay and malformed-use corrected-retry controls deliberately vary delivery or payloads. The new test supports `INKWAVE_BUILT_SITE` through the existing fixture.

| Check | Result | Scope |
|---|---:|---|
| Initial owner-head relevant source run | 134 tests: 128 pass, 5 fail, 1 existing skip | Two missing sourceTeam Mark fixtures; old accepted-gear override contract; two numeric-gear fallback contracts |
| New native receiver assertions against original owner catalogue/helper | 9 tests: 6 pass, 3 fail | All three failures are actual zero-fist legacy admissions; R2 controls pass; assertions unchanged |
| Repaired relevant source scope | 138 tests: 137 pass, 0 fail, 1 existing skip | Twelve relevant files; excludes the separately allocated late-Mark file and includes the new receiver file |
| Final helper after exact peer-object binding | 28 tests: 28 pass, 0 fail, 0 skip | New native receiver, existing receipt units and catalogue integration |

The 138-test run preceded the final three-line peer-object binding; the 28-test rerun covers that final source. Counts overlap and must not be added. The one skip is the pre-existing conditional raw private damage-table comparison, not a new skip or a hardware waiver. An earlier invocation omitted `--experimental-vm-modules` and failed fixture setup; that invocation is not product evidence. The first new-fixture iteration likewise exposed its default stub's missing groundProbe; actual Level/Physics now exercises native spawnAt without changing the assertions.

The test-policy repair preserves strict runtime behavior. Accepted owner/life/adoption gear outranks either untrusted hit hint, while legacy gear fallback still exercises nested overrides, exception propagation and finally restoration. Nonboolean objectShredder rejects the whole proposal without changing HP; a corrected boolean proposal with the same identity then succeeds once, proving malformed input did not reserve its replay key. The separately assigned Mark fixture changes are outside these commits.

Agent6 independently reviewed immutable production d250a9e7 and policy756aa4f7 and found no blocking defect within this presentation-admission scope. That review checked private FIFO/native callback binding, peer/session/life boundaries, R2 separation and policy negatives; it is not an additional runtime test result.

Reproduce source validation with Node22.23.4 and `--experimental-vm-modules --test`. Final 28-test selection:

```
patches/splatoon3/tests/special-legacy-native-receiver.test.mjs
patches/splatoon3/tests/special-replay-admission.test.mjs
patches/splatoon3/tests/catalogue-integration.test.mjs
```

The wider selection adds relay-clock-transport, host-clock-elapsed-queue, added-combat-scans, object-gear-accepted-snapshot, queue-combat-continuation-20261029, catalogue-replica-handoff-review, bootstrap-replica-retirement-review, special-device-sparse-replay and object-shredder-1130. Compressed raw TAP files retain every result. The compressed read-only probe preserves its original scratch workspace paths; the committed native test is the portable regression.

This repairs accepted-layout presentation compatibility. Native special-use rows remain owner-authored. ObjectHit and cheer retain their existing separate paths; accepted birth, target identity, duplicate suppression or marking-time limits do not prove actual contact. It does not close #1665/#1666, establish trusted action replay, or remove the current stack's f958 malformed-birth/one-use safeguards. The normal stack merge and its combined emitted checks remain separate evidence.
