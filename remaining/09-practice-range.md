# Remaining: Practice Range

Status: not included in this PR.

Goal:
a polished training stage, not a gray debug plane.

Required validation areas:
- long shooting/range lane with real world-distance markers
- stationary/moving damage targets
- paint measurement floor
- roller lane
- Dualies movement area
- squid movement/slope course
- wall/vertical paint area
- bomb throw/bounce area
- special test area
- training-only reset/resource convenience

The stage must observe existing gameplay; it must not retune weapon/movement values to make its markers look correct.

Acceptance:
- stage loads on desktop/mobile viewports
- normal battle behavior isolated from training-only rules
- stable positions/markers usable for future before/after captures
