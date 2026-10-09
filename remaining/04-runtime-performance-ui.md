# Remaining: Runtime Performance / UI Responsiveness

Status: not included in this PR.

User-visible issues:
- non-battle/menu screens still feel heavier than desired
- selected-item outline/highlight can lag behind the actual selection
- battle runtime should be lighter without lowering visual/gameplay quality

Investigate:
- duplicate rAF/update owners
- hidden/offscreen work
- render/postprocess/paint/particle hot paths
- per-frame allocation/GC
- input -> selection state -> highlight target -> paint latency

Do not lower simulation Hz, paint resolution or visible quality as the first solution.

Acceptance:
- repeatable before/after benchmark
- highlight target switches with logical selection, animation follows afterward
- gameplay/visual output preserved
