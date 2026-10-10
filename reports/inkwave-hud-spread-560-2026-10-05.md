# HUD accuracy ownership — Issue 560

Target: published INKWAVE plus the active S3 11.3.0 adapters. Baseline is the integration candidate `e92269e`, containing main `fc057af` and the pending network repairs. This delta neither republishes nor changes those network files.

The native Game already projects WeaponRunner's authoritative spread into `crosshair.spread`. Native HUD then added its own recoil bloom and per-shot kick. With a fixed projected 18.3 px spread, the unmodified emitted HUD reports 21.907777777777778 px at 30 Hz after a fire/recoil event. This is an internal ownership discrepancy; no Nintendo pixel radius or exact hardware equivalence is inferred.

The build-only quality adapter removes that second additive cone. Cosmetic shot callbacks, ink-tank wobble, hit confirmation, charge stages and weapon-state owners remain intact. Accuracy reticles also clear inherited `--bl` when switching from Charger/Slosher, so an old decorative scale cannot survive the switch. Raw upstream source remains unchanged.

Validation:
- Native full HUD/event-bus regression: 9/9. Covers Shooter, Dualies, Splatling and Blaster; actual fire/recoil events; repeated shots; authoritative spread changes; 30/60/120 Hz; weapon swap. Existing Splatling 48/72F and paid-slot release tests remain included.
- Actual minified HUD regression: 9/9, build `4d8b6c1bade9`.
- Prior composed emitted HUD fails both new tests: numeric double expansion and inherited `--bl=1.00` after a switch.
- HUD/verifier contracts: 18 pass, one optional emitted authority mode not exercised in this focused run.
- Browser helper adds a private native HUD clone check for computed spread and settled geometry, with an applied inflated-spread negative control and source/content-bound receipt. This new browser probe has not run locally; combined CI must verify it. No physical browser/GPU/long-session or Nintendo hardware acceptance is claimed.

The source issue references S3 Splattershot accuracy mechanics: https://github.com/rhgrive3/actions/issues/560 . Weapon probability/distribution correctness, muzzle guide positioning, charge-reticle idle lifecycle and calibration remain separate issues.

Pre-CI verifier review found that equal computed spread/transforms could accept an invisible accuracy reticle. The follow-up probe now requires SVG/ancestor visibility, positive painted stroke geometry and viewport bounds. Each of the four weapons gets applied spread/hidden/opacity negatives and a restored-visible PNG; finite CSS transitions are awaited between mutations. Two local probe tests explicitly reproduce hidden ancestry with unchanged spread/transform and reject missing paint, clipped bounds and inflated spread. Real browser execution remains pending.
