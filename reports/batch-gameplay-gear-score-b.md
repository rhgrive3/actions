# Batch: Gameplay Gear / Scoring / Damage (B)

Current-main integration checkpoint: `a3993f37a00cc2f0a7b01d954591b98fb6ae97e3`.

Included source PRs: #341, #353, #317, #321.

Integration rules:
- latest main owns Flow progression/respawn lifecycle, network precision, input policy, Super Jump, and current Weapons/Ballistics;
- Flow contributes +30 temporary AP with the 57 AP cap, without legacy multiplicative speed bonuses;
- one victim-authoritative assist list feeds scoring, Flow, and conditional gear;
- final weapon damage keeps full precision until the final 0.1 HP boundary and preserves grouped-hit identity;
- stale Slosher projectile/collision code from #321 is not restored; only the still-missing movement/final-damage semantics are retained;
- current-main Practice Range stabilization and input-policy files are retained unchanged.

This file exists as an audit marker for the exact-head Batch CI.
