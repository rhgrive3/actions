# Charger audio, falling paint and Stringer charge stages

Base: `48511150bbaeab182dd04c712d39bd5b26df18f3` (`origin/main`, fetched 2026-10-26).
Local branch: `fix/inkwave-charge-flight-bow-20261026`. No push, PR or CI launch.

## Source ownership and overlap

Owned `main-weapon-catalog.mjs` charge and Charger stripe hunks,
`weapons-charger-flight.mjs` falling-paint lease, `audio/charger-charge-rise.mjs`,
`audio/engine.mjs`, `audio/runtime.mjs`, and the Charger network hunk in
`audio-adapter.mjs`. Added `charger-paint-drop.mjs` and
`catalog-charge-stages.mjs`; no reticle/projection/geometry/CSS edits.

Open PRs inspected: #1882 (audio/runtime overlap), #1889 (CI), #1890 (menus).
The necessary audio candidate was read from #1882 head
`efcbdf3232653b20690f1867de73b586cddd0117`, not applied as a whole.

- `charger-charge-rise.mjs`, `pitch-preserving-charge.mjs`,
  `pitch-preserving-charge-worker.mjs`, `shared-splat-rise.test.mjs` originate in
  `f2f15a00de81099592f860b116f0f4f00172160d` and match that PR head's blobs.
- `pitch-preserving-charge.test.mjs` originates in
  `55a577154cd887a7fffca6101223db9b1310392f` and matches that PR head's blob.
- Engine/runtime/network connections were selectively adapted to this base.
  Unrelated PR #1882 optimizer, spatial audio, Spinner, world, character and CI
  changes were not imported. That PR was neither modified nor published here.

No MP3, texture, model, Nintendo media or original-game video is added.

## Original-game evidence and conditions

Numerical reference remains Splatoon 3 11.3.0, no gear, human form, sufficient
ink, grounded stationary charge/release unless an airborne case is named.
Pinned original parameter extraction:
[Leanny/splat3 7280ff9c](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon).
The retained Stringer rows are SHA-256 checked against their original JSON by
`stringer-source-1130.test.mjs`. The original Tri-Stringer JSON was also fetched
directly during this investigation; it declares 30F first ring, 72F full charge,
separate Min/Mid/Max shot fields and `IsExplosiveBoltMidCharge:true`.

| Weapon family | First / full frames | Shot consequences retained |
| --- | --- | --- |
| Tri-Stringer | 30 / 72 | 3 arrows; explosive bolts from the first ring |
| REEF-LUX / LACT | 12 / 34 | 3 arrows; no explosive bolts; source charge keep |
| Wellstring / Fluid | 40 / 80 | 5 arrows; explosive bolts from the first ring |

Those shot consequences, charge-dependent speed/damage/spread, costs and
recovery stages **already existed on this base**. This change exposes the two
observable charge stages and adds boundary feedback; it does not claim to
have introduced that existing shot physics.

Nintendo's official Direct summary describes charged Tri-Stringer shots freezing
briefly before exploding (search result verified; full page fetch timed out).
No new Switch capture or original-game audiovisual comparison was available.
Source numbers and INKWAVE browser checks are not retail visual/audio proof.

## Changed behavior

- Every Charger now requests the existing user-selected Splat Charger rising
  phrase rather than the short weapon-specific HoldNoise onset. Alternate kits
  retain their sound identity mapping. An offline Worker prepares duration
  variants with pitch-preserving overlap/add; playback stays at rate 1.
- START requires the real shared charge phrase to decode, alongside the existing
  selected shot/ready/critical recordings. A missing phrase blocks admission
  with an explicit error rather than losing the first onset silently.
- Charge, range, ammo, damage and projectile clocks are unchanged. Readiness is
  still owned by gameplay. The selected source phrase is from Splatune 2; this
  remains a user-selected proxy, not claimed S3 11.3.0 audio identity.
- Added Charger stripe samples more than 3.5 world units above a surface use
  the **same** pooled, visible falling-paint records as Splat Charger. High
  samples no longer project turf instantly or disappear beyond the old ray
  probe. Their recorded target is painted when that native drop lands.
- `queueChargerPaintDrop` is shared with native Splat Charger. Its existing
  20-world-unit gravity / preselected target model is retained, including its
  limitations; it is not recovered Nintendo simulation or a newly asserted
  collision law. Low stripe samples retain the established Splat immediate
  support policy; direct head impacts still paint on impact.
- Stringer `charge` remains the full-clock fraction. `chargeStage` is 0 while
  filling ring one, 1 while filling ring two, and 2 at full. The current ring's
  `chargeStageProgress`, `weapon.firstChargeTime`, and pure
  `catalogChargeStage(weapon,charge)` are available for the reticle owner.
  Release/cancellation/reset clear the published stage state.
- The retained audio pack has no Stringer-ready clip. The two boundaries use
  the existing INKWAVE `charger_full` ding, with explicit distinct pitches.
  This authored feedback is not presented as original-game audio.

## Verification

Focused source checks cover: real catalogue falling-paint lifecycle and draw
buffer positions at 30/60/120 Hz; deterministic final CPU turf; ghost exclusion;
lease clearing; all Stringer kit stage boundaries/reset; existing Stringer
shot/keep/air-charge consequences; Charger stripe/cover/remote onsets;
recorded-audio admission and alternate identities; shared-rise pitch/cache
behavior. Source regression failures first revealed a reset omission and a
test's unmatched random seed; these were corrected and the affected checks
rerun. Existing onset assertions were updated to require the new single shared
phrase and reject a layered HoldNoise.

Commands:

```sh
node scripts/check-inkwave-patches.mjs --quick
node scripts/build-inkwave.mjs inkwave-public /workspace/scratch/charge-site
node scripts/check-inkwave-startup-budget.mjs /workspace/scratch/charge-site
node scripts/check-inkwave-charge-audio-browser.mjs /workspace/scratch/charge-site <audio-evidence.json>
node scripts/check-inkwave-charge-input-browser.mjs /workspace/scratch/charge-site <input-evidence-dir>
INKWAVE_BUILT_SITE=/workspace/scratch/charge-site node --experimental-vm-modules --test patches/splatoon3/tests/catalog-charge-flight-stages.test.mjs patches/splatoon3/tests/catalog-charger-stripe.test.mjs patches/splatoon3/tests/stringer-source-1130.test.mjs
```

The audio browser check hashes all emitted artifacts, uses a trusted click to
unlock the real AudioContext, executes real MP3 decode and module Worker jobs,
and measures nonzero waveform output from the actual master graph for all 8
base Chargers. It also checks that a missing shared charge asset blocks START.
It does not measure physical speaker perception or Switch audio equivalence.

Ordinary game-input observations, screenshots, final build/source identity,
test totals and actual limitations are recorded separately with the final
validation receipt. Source tests and populated draw buffers are not visual
proof. Binding the exposed Stringer phase to reticle geometry/CSS remains owned
by the separate reticle worker; this branch deliberately does not edit it.


## Final local receipt

Implementation commit: `9a89494320a7f9cfed62c83e0830bfe52d72f76e`.
Build content hash: `32ad27a7264b34c2497796261b32105a70bc2be664e13364691600553e946cc3`.
Input hash: `3d975e375e930275d8867dc3f7a14fb14de7b4de6e800659950d2cb556b7bfe7`.
All 1,483 recorded inputs matched that commit; all 2,186 emitted artifacts
matched the build manifest. Quick compatibility and startup budget passed.

- Source checks: 132 distinct cases passed after the documented focused
  corrections. The two extra native Splat paint cases passed; their old
  headless fixture also logged `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` from
  unrelated dynamic imports. No full-suite run or CI launch is claimed.
- Emitted runtime checks: 20 passed, zero failed/skipped, including catalogue
  high-shot falling paint/draw positions, bow stages, original shot/keep
  consequences, native stripe dimensions and remote Charger onset ownership.
- Real emitted Web Audio: 8/8 base Chargers had nonzero master-graph waveform
  (maximum RMS approximately 0.022–0.038), actual pitch-preserving Worker
  variants for five distinct clocks, one source at playback rate 1. A deliberate
  shared-asset 404 blocked START with the explicit charge-audio error.
- Ordinary game input: trusted menu clicks reached Practice Range. Bamboo
  samples recorded charge 0, 0.75, 1, with no injected fire or stepping. Only
  three rendered samples were collected. The following E-liter full-charge
  observation timed out after 15 seconds, three `pointerlockerror` events were
  recorded, and the HUD at timeout displayed 60%. The failure screenshot was
  taken after the finally-block released the real mouse button; it is not a
  frame-exact charge or flight capture. There were no page errors or failed
  requests, and the renderer reported no `KHR_parallel_shader_compile`.
  Ordinary-input bow stages and short airborne head/drop frames remain
  **unverified**. That run is not marked passed.

[Validation receipt](inkwave-charge-flight-bow-20261026/validation.json),
[real audio data](inkwave-charge-flight-bow-20261026/audio-browser.json),
[source identity](inkwave-charge-flight-bow-20261026/source-identity.json),
[ordinary-input limitation](inkwave-charge-flight-bow-20261026/ordinary-input-limitation.json).
Screenshots remain local under `/workspace/scratch/charge-evidence/input-final/`;
no new media is bundled in the change.

Remaining integration: the reticle worker must connect the published Stringer
phase to its visible gauge. This branch has no projection, feedback-layout or
CSS edits. Use `catalogChargeStage(weapon, charge)` for the same first/full
boundaries without inventing a universal 50% split. Switch audiovisual fidelity,
physical speaker output, WebKit and hardware iPad remain unmeasured.
