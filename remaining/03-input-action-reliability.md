# Remaining: Input / Action Reliability

Status: not included in this PR.

Priority issue:
- Dualies dodge sometimes fails to start even when the user attempts the action.

Movement Physics now owns what happens **after a dodge has been admitted**. This workstream must own only the path before that point:

raw input -> pressed edge -> fixed-step consumption -> action admission -> dodge start.

Investigate:
- render/fixed-step boundary loss
- fire+jump+dodge conflicts
- cooldown/landing boundary
- keyboard/gamepad/touch equivalence
- duplicate consumption or premature clear

Do not change the 2.8-distance integration in Movement Physics merely to hide an admission bug.

Acceptance:
- legal one-frame action edges are consumed exactly once
- no FPS-dependent misses
- timing fuzz around simulation boundaries
