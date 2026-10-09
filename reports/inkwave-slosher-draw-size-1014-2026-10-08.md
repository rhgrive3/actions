# INKWAVE Slosher draw sizes — #1014

Baseline: c2c938b9af5b6cce2a7bdbecf0415c7c3836cadb. The installed six-adapter runtime selected sourced collision and flight data but retained the generic visual radius and speed-based tail law.

The presentation layer now reads each selected Slosher unit/index DrawSizeParam, applies the explicit worldUnitsPerSourceUnit conversion, evaluates radius by native projectile age, and maps the bounded TailSolidFrame window and tail lengths to the native rear-hemisphere stretch coefficient. ChangeFrame zero immediately uses EndRadius; nonzero transitions are tested. Pool reuse clears the presentation record. Remote projectiles derive the same record from existing weapon/group/index birth events; no new protocol field is added.

Five focused installed-runtime tests pass: all nine per-unit/index glob radii and main-baseline gameplay fingerprint; native instance matrices and tail extents; nonzero radius transition and solid window; actual NetMatch birth replay; pooled Shooter control. The exact clean-main native nine-glob case fails on the absent DrawSize record, proving the existing root rather than a missing import. All nine measured gameplay records and the 17 RNG calls remain unchanged. Focused existing Slosher, Roller draw and wire controls are recorded separately by the parent.

This is a deterministic CPU matrix capture through the native renderer and fixed camera, not a browser screenshot or Nintendo hardware calibration. The velocity-based tail mapping does not claim recovered Nintendo curved-history mesh fidelity. Collision, movement, damage, paint distribution and weapon timing remain authoritative and unchanged.
