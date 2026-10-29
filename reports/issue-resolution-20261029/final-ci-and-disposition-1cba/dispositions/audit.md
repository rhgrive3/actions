# Eight original-criteria audit, 2026-10-29

Read-only comparison of cached original issues/comments (`/workspace/scratch/inkwave-validation/resumed-issues.json` and `/workspace/scratch/issue-human-audit/{532,992,997,1097,1116,1708,1789,1823}.json`), the public 13:58 ledger, `remaining-weapons.md`, `continuation-20261029.md`, `audio-followup.md`, and named motion references. No tests, build, downloads, GPU, product edits, or issue writes. Current app identity is root-reported `1cba` with the same 1,550 application inputs as the verified `5d8b` build; historical receipts below retain their own identities. The user waived physical-device verification; references may come from suitable existing evidence or source analysis without a new hardware requirement. Status is an audit, not final CI/closure authorization.

## #532 Dualies dodge

**Explicit requirement:** The current issue re-evaluation says “Establish the retail DU-to-INKWAVE WU spatial scale with an independent anchor”, “Recover/measure core and glide easing, acceleration/deceleration and phase-boundary displacement across ground/air, collision and chained rolls”, and “Validate the current **4F** glide duration and **8 WU/s** downward admission against retail motion.” Historical acceptance also asks “Collision should truncate/resolve the path rather than increasing total displacement.”

**Software evidence:** `remaining-weapons.md` records 4+1 WU, 12F core, 7% ink, 32F lock, terrain/collision/chaining and fixed-rate controls. `movement-physics.mjs` integrates the locally chosen 1.5(1−u²) interval curve separately in core and 4F glide; it documents clipped distance is discarded. Glide starts its own curve and may reaccelerate at the phase boundary. The re-evaluation records 27/27 mixed emitted/source and 8/8 edgecase checks at their historical build identities.

**Disposition:** Existing baseline addresses the original 2.8-unit omission, but independent scale/easing/4F and 8 WU/s evidence is specifically requested, so exact source calibration is unresolved. A demonstrated generic mathematical collision/reflection error that violates truncation would be a separate actionable software bug independent of S3 coefficients; this read-only audit did not establish such an error, and does not label phase reacceleration itself a mathematical reflection bug. Conversely, unverified S3 coefficients are not a basis to invent a replacement curve. A physical capture is waived; an appropriate independently sourced mathematical/behavioral anchor would suffice.

## #992 Dualies paint

**Explicit requirement:** Current issue's active verification says “Recover/measure the retail 7-pattern phase permutation and nearest/feet selection”, “Verify particle spawn velocity, inheritance, gravity/drag, lifetime and overlap rules”, “Verify the break/free phase and height selector/composition”, and “Validate sparse/default anchors absent from the pinned weapon JSON ... including the project world-scale mapping.” The superseded historical acceptance also specifies near/far, depth, droplet, CPU turf and wall/drop controls.

**Software evidence:** Live native InkFlight and independent droplets replace generic random blobs; pinned width, depth, spacing/count/radius endpoints and CPU turf ownership have source-path tests. Historical 27/27 is mixed scope and does not establish the undocumented phase/dynamics/default meanings. `remaining-weapons.md` records the same boundaries.

**Disposition:** Functional old generic-paint defect is corrected, but the current rewritten issue explicitly asks to validate those phase and dynamics details; this is a genuine named source/behavior gap. No new mathematical model or all-weapon certification should be added as a gate. No separately proven fix identified.

## #997 weak diagonal walk

**Explicit requirement:** “Weak 45° diagonal walk at ~0.25–0.5 stick magnitude matches a current-S3 reference capture in cadence, stride, pelvis direction and foot placement within the project's chosen visual tolerance”, and “Slow/mid/full stick magnitudes produce a reference-calibrated walk→run progression”. Fixed-yaw, transition, feet, local/remote and rate controls are also listed.

**Software evidence:** The existing source-bank gait and movement controls are implemented. `character-local.md` describes synthetic loader/render/lifecycle passes, not S3 visual comparison. Shipped motion catalog is explicitly original Wii U Splatoon; it is generational evidence rather than proof of current-S3 weak-input behavior.

**Disposition:** The source-derived weak-input *selector* is one possible route, not a separately stated original prerequisite: the actual requirement is sufficiently grounded current-S3 visual reference and progression/continuity, which could be met with suitable existing source/footage analysis under the hardware waiver. No exact unpublished selector, all-class parity or fresh console capture should be invented as a gate. No existing receipt reviewed establishes the specified comparison.

## #1097 class damage poses

**Explicit requirement:** “Current 11.3.0 ROMFS/capture identifies the actual damage animation selection used for Shooter, Charger, Roller, Dualies, Slosher and Splatling before final tuning”; “Idle damage and moving damage select/reference the correct current-S3 state family”; and onset, peak and recovery are to be “measured from synchronized current-S3 60 fps reference capture/animation inspection” within chosen tolerance.

**Software evidence:** `weapon-hit-reaction-comparison-2026-10-09.md` records provisional class layer and fixture controls, but its 2026-10-21 addendum says Wii U source bank overrides that layer for Shooter, Blaster, Charger and Splatling; generic Wii U Damage plays instead, while Roller/Dualies/Slosher retain the layer. Animation names do not prove S3 chooser or curves. The historical fixture and mixed ownership boundaries must not be mistaken for a complete production-wide class hit fix.

**Disposition:** A real visible class-selection gap remains for source-owned families and the issue explicitly requires actual current-S3 selection before final tuning. Suitable S3 animation inspection or independent relevant evidence, without mandatory new hardware recording, is the path to narrow implementation. Do not require decompiling an exact engine if equivalent evidence establishes the requested selection and timing. No closure candidate.

## #1116 class jump poses

**Explicit requirement:** “Document which `Jump_Nrml*`, `Jump_<class>*`, `JumpShoot_<class>*` resources **actually run** in current S3 no-fire and fire/charge scenarios; unused animation names do not count as parity evidence”; “Non-shooter class-specific curves are selected when justified by 11.3.0 reference”. Start/air/land/action priority and attachment controls remain required.

**Software evidence:** `jump-motion-comparison-2026-10-03.md` documents local class profiles and test coverage, then reports Wii U bank owns hips/legs in production and hides those local profiles; Roller/Slosher generally use `Jump_Nrml` and Splatling its Wii U family. Named S3 animation resources do not prove live selection.

**Disposition:** This is both a real production ownership limitation and an explicitly required S3 selector/pose evidence gap. The Wii U bank or class names alone are insufficient; source analysis or suitable existing S3 evidence can substitute for new device capture. No new universal class-uniqueness requirement: the issue only requires distinct curves where justified.

## #1708 eleven weapon sounds

**Explicit requirement:** “そのブキ自身の発射音および必要な状態別効果音を、出典・バージョン・SHA256とともに確保、検証する” and “2022年録音の同系統ブキへの差し替えは『本家固有音の取得』と数えない.” Work also explicitly asks for lawful updated sound containers or permitted alternative, event mapping, version, SHA256 and rights-aware publication.

**Software evidence:** `audio-followup.md` records current family proxy/borrowed clips, existing audio tests and bounded asset searches; neither establishes the eleven weapons' own S3 11.3 cues. These proxy cues are operational, not the demanded source assets.

**Disposition:** The per-weapon sound source/identity and event mapping are original criteria, not an invented physical capture gate. Permitted alternative source is expressly allowed; no blanket demand to obtain proprietary ROMFS or publicly redistribute audio should be added. A suitable lawful, identified reference plus original specified checks is required. No software-only completion candidate found.

## #1789 Bloblobber bounce

**Explicit requirement:** “Determine whether `BounceAfterMaxSpeed` caps total outgoing speed, normal velocity, or is conditional on pitch/slope, and whether absent large-bubble row inherits default .4”; “Derive exact slope classification and angle threshold branches, including wall-edge bevel normals and bouncing near walls, then implement the verified formula”. It also asks to reconcile muzzle arc/animation offsets and footprint textures. The original first checklist item specifies an original-device measurement, now waived; the separately expressed behavior/formula criteria remain.

**Software evidence:** Current code has four-round sweep, two floor bounces, wall ×.8, small-bubble normal-only cap and earlier forward-momentum repair; `remaining-weapons.md` calls those current source-guided interpretations, not proven native dispatch. `main-weapon-catalog.mjs:1311–1312` invokes vector `reflect` and wall .8; merely observing it does not demonstrate a general mathematical reflection bug.

**Disposition:** Correct a proven generic reflection error on its own merits if one is actually demonstrated; do not claim an S3 coefficient/order from such a fix. The `.35` cap interpretation, slope classification and sparse `.4` inheritance are expressly requested and remain unresolved. Reference source/engine analysis can satisfy them without imposing new physical-device measurement. No new exact all-weapons parity prerequisite.

## #1823 Charger rise

**Explicit requirement:** “Identify the true S3 Charger charging-progress sound source(s) and trigger/parameter curves with source provenance, preferably a legitimately obtained XLink/SLink event graph or independent quiet no-commentary gameplay recording”; separate click/rise/ready/keep phases and “objective FFT/spectrogram comparisons to obtained original audio” are requested. Explicit rights condition is part of the original issue.

**Software evidence:** `audio-followup.md` documents local/remote special-interrupt lifecycle repair, prewarming, historical source 52/52 and 6/6 source/emitted focused checks, Chromium and Linux WebKit/WPE eight-family audio tests. The current phrase is user-selected Splatune 2, not a verified S3 11.3 cue; current playback handles many lifecycle cases but does not establish true S3 event/curve or objective S3 comparison.

**Disposition:** Original cue/source and event/parameter provenance remain genuinely missing. The issue permits a documented graph or independent recording rather than demanding a physical console or a specific extraction method. The Linux WebKit receipt does not claim iOS Safari; device-specific testing is waived. No software-only closure candidate identified.

## Overall

No issue has been determined complete based on the reviewed evidence. #997 is the main over-gating correction: it asks for the specified S3-calibrated observed gait, not proof of a particular internal selector. #1789's physical-trace checklist is waived while its explicitly separate formula/semantic requirements remain. #532 and #992 contain explicit later re-evaluations calling for source calibration; their corrected functional baseline should not be described as total parity. Further source requirements are limited to the cited issue wording. No new hardware prerequisite is introduced.
