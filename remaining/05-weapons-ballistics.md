# Remaining: Weapons / Ballistics Fidelity

Status: not included in this PR.

Known concern:
- weapon range and fine numerical behavior differ substantially from Splatoon, especially Charger and Dualies.

Measure per weapon/family:
- effective/max/paint range
- projectile speed/gravity/drag
- fire interval/startup/recovery
- spread and jump spread
- damage/falloff
- charge curves
- ink cost and paint distribution
- roller horizontal vs vertical flick projectile envelope

Do not use network symptoms as evidence for changing authoritative range.

Acceptance:
- current/reference/final values with source confidence
- deterministic range/ballistics harness
- engine measurement after each tuning change
