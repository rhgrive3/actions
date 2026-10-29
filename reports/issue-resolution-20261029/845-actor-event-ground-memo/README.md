# #845 native Actor event boundary and exact ground memo

Repair `5bc9d1fc4b227d6c31b955956ca6af81e617ca97` follows the separately reviewed flat-foot certificate correction `edac3d2778f7793e8e5587bbe46abaee3586cfe6` on common `73481884e2519534a17be68d79691c94dc18f0dd`.

The exact-query memo in `offline-offscreen-budget.mjs` reused native ground height/normal within a synchronous Character update. Its key included coordinates, root height and physics identity, but synchronous native Actor event listeners could change support between identical queries. The source's prior statement that physics cannot change during a synchronous visual update was incorrect for that actual callback path.

A bounded source-loaded Actor/Character proof uses the unmodified Character callback → Actor `emit` → documented `actor:footstep` subscription. The listener moves a real native dynamic support box. At frame 11, a subsequent identical query at `(0.10782778054644077, 3.9285542313971455)` returned cached height 0, while uncached NativePhysics returned `0.09999999999999998`. Real contact state diverged. Muzzle difference remained exactly zero over the 120 measured ticks; no muzzle divergence is claimed. This earlier proof at `395b…` applied the same flat-foot-null correction symmetrically to isolate the memo issue.

The repair changes two production adapter/runtime files. The existing Actor adapter captures the owning Character once at construction. Around synchronous bus emission it pauses the current memo lease, clears cached physics references/results, then clears again and restores the captured prior lease in `finally`. Queries made inside a listener use native ground directly. Nested native events preserve the prior paused state, and callback throws still release the lease through Character update cleanup. The implementation adds no per-event wrapper, array, geometry guess, cross-frame cache or uncertified world version. Payload ordering and original callback error propagation remain.

Exact duplicate queries continue reusing results between callback boundaries. This is a correctness fix for the documented native Actor bus path. Replacing `character.onEvent` directly or supplying custom/reentrant physics query owners can bypass that boundary; this report does not claim a universal certificate for such owners. It also does not close the original #845 no-simulation-cadence-ground acceptance criterion, remove whole/alternate solver ticks, or claim FPS/device gains.

## Focused controls

Node **v22.23.4**, CPU only: **5/5 pass, 0 fail, 0 skip**, 23.35 seconds.

- Source-only negative reverses exactly the new Actor event-boundary owner while retaining the corrected native terrain path. The native bus listener's query → support mutation → query returns 0 again with the old memo policy, while the uncached control sees 0.1; actual contact state diverges.
- Three emitted-safe positives run actual Actor/Character and NativeLevel/NativePhysics at matched `1/30`, `1/60` and `1/120` frame inputs. Native control and memo candidate preserve full bone transforms, skin matrices, contacts, muzzle and authoritative Actor state exactly. Inside-listener and nested-event queries run with memo paused. Memo hits remain positive outside callbacks, and every avoided native source ray is accounted for by a memo hit.
- A throwing native listener preserves the exact exception and leaves no active memo, retained query result or cached physics reference.

Positive file: `patches/local-quality/tests/native-ground-event-memo.test.mjs`. Source-only counterfactual: `native-ground-event-memo-source.test.mjs`. Shared actual-path fixture: `native-ground-event-memo-fixture.mjs`. Positive code uses no source transformation. Emitted execution is pending the final combined build; the retained receipt is source execution only.

Agent6 independently reviewed the frozen product diff and focused tests and approved the documented Actor-bus scope. The source receipt was verified; no additional emitted or GPU execution is claimed. All 24 source-motion asset Git blobs were checked before and after temporary read-only access to an existing checkout; all were unchanged and the link removed. No source asset was copied or modified.

The raw actual-bus proof, source TAP and asset-closure receipts are gzip-compressed. `manifest.json` records compressed and original SHA-256 hashes. Root owns the canonical behavior-ledger paragraph and final emitted registration, avoiding duplicate ledger edits.
