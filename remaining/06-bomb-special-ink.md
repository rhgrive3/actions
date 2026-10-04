# Remaining: Bomb / Special / Ink Distribution Fidelity

Status: not included in this PR.

Known concerns:
- bomb throw arc/behavior differs
- explosion and paint ranges differ
- fine ink splatter/distribution differs
- specials need the same numerical/visual fidelity pass

Keep separate:
- gameplay damage
- gameplay paint
- visual-only droplets/FX

Measure:
throw origin/velocity/gravity/bounce/fuse, damage bands, paint bounds/density and special-specific timing/range.

Acceptance:
- trajectory and coverage measurement harness
- reference confidence
- visual-only effects cannot change damage/score
