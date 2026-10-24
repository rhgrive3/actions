# Current-main firing cosmetic candidate — PR1857 ref unchanged

Official main was read through GitHub's Git ref API and native Git, and rechecked before publication: `7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51`. The protected approved cosmetic candidate is `96efc55784320dea7e27f05f14c9cbe33df7746a`; original `d7cc9dd3` and diagnostic `84075c767` remain intact. No force push, main merge, PR1857 ref update or other PR change is part of this candidate.

## Composition and QA provenance

- Latest main's static menu adapter and its tests are retained byte-for-byte.
- Exactly four production paths differ from main: the approved terminal composition connection, new firing adapter, and the separate Shooter/Splatling modules. All four are byte-for-byte identical to96ef; no new cosmetic tuning or gameplay edits.
- Only the two reference-QA files were copied from public integration commit `22f3b7534ae2093aef4c2549112a85a1da09bbf3`: `scripts/check-inkwave-local-references.mjs` and its test. This carries c68's closed-fixture repair **and** PR1853's explicit nine migrated-edge negative guard. Both files match22f exactly. No special runtime/workflow/other integration change was taken.
- `projectile-presentation.mjs` and all four unrelated special runtime leaves equal official main. The unmerged Tri-Slosher PR1855 change is not adopted or overwritten by this branch; there is no cosmetic diff to that shared leaf.
- The QA-only before baseline is commit `dc526ffecbf141fd342d8c29a46ef4eb881162bb`: main7e plus those same two QA files, with no firing cosmetic patch. It lives in the separate `/workspace/firing-main7e-baseline` worktree. The candidate merge has both this QA baseline and96ef as ancestors, so protected history is retained and a later PR1857 update can fast-forward after confirmation.

## Fresh normal production builds

Both builds used the normal minifying builder, not an unminified diagnostic or a special admission profile:

| | Before: main7e + reviewed QA | Candidate |
|---|---|---|
| contentHash | `ac27ae5f27169f2267a85d4bed904677d26f5e0aab10910c7181e4459f453f30` | `f740110d0f27536f46725d2299710bf4e01a08c0e7ddc6efba75dbe27a61c965` |
| canonical inputs | 1420 | 1423 |
| emitted artifacts | 2110 | 2116 |

The complete canonical-input diff is exactly the four approved production paths. Every current input body, every root/versioned output body, the input/content hashes and builder hash were reread and matched. Both sets of all13 pinned source/site reference mappings pass emitted verification, including both root and versioned artifacts. The initial reference CLI invocation omitted `--site` and produced a source-only receipt; the later `*-verified.json` receipts are the actual emitted proofs. No source-only result is counted as emitted verification.

The production merge at `9c0091eefe69d4397f543236ce3749368e87c7c0` generated these builds. Subsequent changes add QA-only jump/one-slot cases and evidence; `build-verification.json` confirms all canonical inputs still match the built bytes.

## Local regressions and browser evidence

- Source:66 unique cases, no fail/skip, including the latest-main static menu cases. Initial suite65 plus the strengthened six-case capacity file rerun (one new explicit one-slot test).
- Actual emitted modules:34 unique cases, no fail/skip. Initial33 plus that same stronger capacity rerun6/6. Covers family lifecycle, native serializer/RNG, projectile paint/radii, Splatling jump spread and mixed shared-capacity retention.
- Direct-source/reference QA:28/28, no fail/skip. The nine migrated nav/facade/descriptor edges retain their owner-bound byte pins and mutation rejection.
- Startup file/dependency budget passes. This is not hardware timing.
- Shared capacity: baseline40 → old d7cc8 failure is preserved in older evidence → approved/current candidate40. Zero/one/two residual slots preserve every existing matrix/color/shape/look/petal prefix; additions use only leftovers. Clear/reuse and the original700-matrix/32-burst resource identities remain fixed. No cap, extra pool, geometry/material/shader or existing-effect exemption was added.
- Small emitted-component browser: four60Hz cases (Shooter/Splatling × standing/moving-jump),960 fixed steps. Native gameplay/projectile fields, shot events, ink/charge state, paint writes, CPU paint grid and counts are exactly equal. Actual Actor/Character/Physics/FX with CPU PaintSystem; this is separate from full Game and hardware acceptance. Raw gzip traces, exact SHA256 summaries and sampled PNGs are retained.
- Full native Game browser: Practice Range through the normal boot and real debug input. Four standing/jumping cases use fixed boot/shot seeds, the same gear/profile/palette/camera and native handoff freeze; no clock assignment. Birth positions, velocity/fields, fire payloads, Actor/Projectiles update order and RNG arrays all match exactly. Shooter RNG258, Splatling957, Shooter-jump259, Splatling-jump957 on both sides. Jump cases actually leave the floor. See `native-phase/comparison.json` and compressed full traces. These are controlled gameplay/phase comparisons, not a retail art certificate.

## Limits and handoff

Parent confirmation is required before moving PR1857 as instructed. Exact-head hosted CI is not represented as successful. Nintendo/reference media access was not retried through another path; the previous CONNECT403 remains denied. No Nintendo media is committed. Retail visual dimension/timing parity and physical phone/tablet GPU/thermal acceptance remain open. Earlier96ef resource/performance evidence remains historical; it is not re-labelled as a new hardware run on this merge.

`summary.json` records exact production, QA and unchanged-main Git blob identities and all local verification receipts. Original/intermediate files and prior failed runs remain protected in their old refs/workspace directories.
