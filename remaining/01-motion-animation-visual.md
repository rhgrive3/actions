# Remaining: Motion / Animation / Visual Fidelity

Status: not included in this PR.

Owner scope:
- left/right/diagonal/backward footwork
- current bug where both feet can move similarly during strafe
- planted-foot and gait-phase behavior
- 90/180-degree turn animation
- start/stop/reversal body motion
- pelvis/spine/chest/head response
- roller model size
- roller holding pose, arms/IK, horizontal/vertical swing pose
- squid moving/stationary visual appearance

Boundary:
- Read authoritative root velocity/yaw from gameplay.
- Do not retune movement speed, weapon range or network state to make animation look better.

Acceptance:
- rendered before/after evidence
- left/right symmetry without duplicated-foot bug
- no planted-foot sliding regression
- roller pose compared with public Splatoon references
- squid stationary appearance reviewed separately from squid physics
