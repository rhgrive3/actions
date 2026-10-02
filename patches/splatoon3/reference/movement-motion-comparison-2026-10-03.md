# Movement ownership and wall GPU comparison, 2026-10-03

This review resumes the frozen public INKWAVE candidate
`cb381b38608a823d1e329c7248e4f27fe26eb18a`. It repairs shared movement-module
ownership and verifies the already integrated wall presentation. No native
source, motion coefficient, gameplay clock, input rule or trajectory is changed.
The target gameplay profile remains Splatoon 3 **11.3.0**; that is not a claim
that the older public Nintendo footage runs that version.

## Reference conditions and remaining differences

The retained [Nintendo gameplay reference](https://splatoon.nintendo.com/en/gameplay/)
shows direction-changing Squid Roll and charged Squid Surge. The prior owner
recorded its official lookup and visual inspection in `review-shared/primary-review.json`.
This continuation verified the retained source, contact-sheet and PTS hashes;
it did not restart research or infer unpublished Nintendo curves.

| Reference | Retained identity and observation | Conditions not established |
| --- | --- | --- |
| [Nintendo Surge footage](https://assets.nintendo.com/video/upload/v1657880121/Microsites/splatoon-3/videos/s3_howtoplay_move05.mp4) | SHA-256 `3fd3fd8f12f71cbe93fb28c04fc3763c110fbd813473259d7f08fe57e4b0b450`; decoded frames 270–328, PTS 4.500–5.466667 s: attached charge, brief readiness flash, ascent and crest | Executable version, weapon, gear AP, frame-aligned held/released input, editing and joint curves |
| [Nintendo Roll footage](https://assets.nintendo.com/video/upload/v1657880121/Microsites/splatoon-3/videos/s3_howtoplay_move06.mp4) | SHA-256 `9aacbf90a3bd2403192e017f4b7cb9ce37210e544cbbd95065c0037712b8be26`; turning squid after departure, then return | Exact defense/rotation timing, camera-compensated axis and shape, input/gear conditions |

| Difference / reproduction | INKWAVE implementation and effect | Confirmation boundary |
| --- | --- | --- |
| Install the complete production stack, launch a native squid reversal, then install movement motion from an independently evaluated module | Old module-private WeakSets wrap `Character` and `Actor` again; the extra action layer advances visual age twice and can deform the final native squid output. `movementMotionSnapshot` from the other module cannot see the owner | Retained full-production regression fails against the frozen module; corrected module passes. This is an engine ownership bug; no corresponding Nintendo module/realm behavior is claimed |
| Reset an untouched Character; dispose an active one, then trigger/reset/update it | `runtime/movement-motion.mjs` stores a `Symbol.for` owner on the Character prototype and registration on the Actor prototype. Snapshot/cancel resolve the existing owner; reset never allocates motion state. Disposal clears state once and prevents reacquisition | Focused native tests and complete production composition pass; native methods are delegated and all later installed hooks remain intact |
| Hold jump on a real own-ink wall until the ready glint, then view it from front, oblique and side cameras, including nonuniform mantle scale | Existing `runtime/wall-motion.mjs` uses the full inverse parent affine matrix for its indexed glint and zero drawRange under opaque overrides. `scripts/check-inkwave-wall-render.mjs` measures actual beauty, GTAO normal, depth and AO pixels | Actual Chromium WebGL evidence is required. CPU callbacks, finite transforms or a visible feature alone cannot establish correct rendering |
| Cancel, hide, reset, die or dispose while ready | Readiness must disappear immediately; disposal must release its own geometry/material/VAOs without deleting cached native geometry buffers used by a surviving Character | GPU lifecycle and survivor readback are checked separately from motion tests; no Switch, WebKit or iOS rendering parity is claimed |

## Focused validation

`movement-composition.test.mjs` loads the complete production installer and
native Actor, Character, Physics, Projectiles, WeaponRunner, indexed geometry and
IK. Only uniform own-ink sampling and the match boundary are diagnostic fixtures;
there is no whole-game update or projectile advance. Its preservation oracle
loads only the old movement module from the frozen commit into an otherwise
identical production stack. Duplicate registration must preserve each tick's
gameplay state, clocks, bones, selected deformed indexed vertices, muzzle, squid
pivot and IK exactly at 30/60/120 Hz through the native fixed clock. Nullable
preview, dt0, reset and terminal disposal are also checked.

The focused command runs `movement-composition.test.mjs` and the retained
`movement-motion.test.mjs`; all 13 tests pass. The latter includes isolated
Actor/Character fixtures as supplemental motion checks; only the composition
tests establish full production composition. Receipts bind the exact file hashes.

The wall script serves an immutable canonical build, verifies all source/build
inputs and loaded artifacts, and uses actual WebGL indexed draws and pixel
readback through the native `GTAOPass`. Four ready views require visible beauty
pixels, a camera-facing square plane, and pixel equality when the glint is hidden
in normal/depth/AO. A separate native-rig absent/present comparison proves all
three passes actually contain the native Character.

Sensitivity controls compare the corrected affine billboard with the old
quaternion-only construction and compare zero versus broken nonzero drawRange.
For the latter, the opaque wall/mantle can occlude the cue, and its clockwise
indices are culled from the beauty side by GTAO's default front-sided material.
The diagnostic therefore hides render occluders and views the frozen corrected
beauty billboard from behind. Actor pose, Physics, geometry, scale and GTAO
material semantics stay fixed between the safe/broken pairs. Every unsafe pass
must change pixels; an insensitive control is a failure. These are explicit
diagnostic conditions, not ordinary gameplay screenshots.

Static logs, source/build identities and image hashes are retained under
`/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/review-shared-normal/`.
Live runner transcripts are excluded from completion receipts. The parent owns
workflow wiring, aggregate comparison-report updates, candidate integration and
the complete exact-SHA Actions gates.

Switch 11.3.0 input-aligned measurement remains required for charge/rotation
curves, lateral wall departure, thresholds, gear-conditioned timing and physical
movement parity. The existing 45-tick 0AP readiness condition is an INKWAVE
profile check, not a new Nintendo video measurement. Existing walking, swimming,
jumping, firing, ink recovery, hit/respawn and camera unknowns remain open.
