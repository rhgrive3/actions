# #522: reject overflowing network paint payloads

Scope: defensive input validation in the existing INKWAVE network paint receiver. This is a partial repair of #522, not complete actor/action provenance authentication. No Splatoon numerical behavior is invented or changed. The valid emitter's radius, seed, colors, legacy rows, causal ordering and artwork remain unchanged.

## Reproduced impact

The prior `readPaintOrder()` checked JavaScript `Number.isFinite`. A malicious member could submit the finite number `1e308` as a paint seed. The actual production-composed NetMatch and PaintSystem accepted it, changed 16 CPU ownership cells, queued one growth object, generated eight quads with 32 non-finite `aSplat` attribute entries, and consumed one paint receipt. This is an actual CPU grid and Float32 attribute observation using a renderer stub, not a physical GPU screenshot.

An oversized finite position also reserved the sender sequence even when it painted nothing, preventing a corrected event at that sequence from being applied. The direct pre-deadline paint commit route used the same insufficient guard.

`PaintSystem._kind()` uses a plain object mapping. Untrusted strings such as `__proto__`, `constructor` and `toString` can resolve inherited values rather than a numeric shader kind. The wire guard now admits only the current eight native paint names, the composed `rollFloor` alias, or the existing omitted/zero sentinel.

## Fix

`patches/network-replication/adapter.mjs::readPaintOrder` now verifies required and optional paint numerics are finite both as JavaScript numbers and Float32 values. It also validates intermediates used by the existing renderer:

- position-length and radius squares;
- the nested seed/angle expressions used by the shader (`73 + 11 × 6.2831 < 144`, plus bounded phase terms), after Float32 upload rounding;
- projected stretch magnitude, including the actual default amount 1 for legacy rows and rejection of incomplete direction groups, and a conservative footprint extent using the existing 3.9 drip reach and 1.4 stretch coefficient;
- positive radius must remain nonzero in Float32.

Malformed inputs return before sender sequence, applied paint receipt or causal clock is reserved. Because normal replay, queue admission and pre-deadline application share this reader, the same validation protects each path. Rejection does not clamp values or create weapon-specific balance limits. A corrected valid event at the same sequence remains usable.

The seed bound comes from the existing public renderer, `inkwave-public/src/world/paint.js::PAINT_FS` (the `wob` function and unsmeared ray angle), not a game-balance source. An unsmeared ray has `a = a0 + seed * 6.2831`, with `0 <= a0 < 6.2831`. Substitution into the five sine terms gives seed coefficients 25.1324, 48.4155, 84.9817, 142.1141, and 135.8127. The two cosine terms, standalone body terms and hash calls have smaller coefficients. Thus 144 provides rounding headroom beyond the largest coefficient; the bounded angle and loop-index phase terms are below 256. The guard applies this envelope to the Float32-rounded seed, so double values that round upward at upload cannot bypass it.

This is an overflow and malformed-kind repair, not proof that every representable input produces meaningful paint. For example, a very small nonzero Float32 radius can still have its square underflow to zero and be discarded by the renderer. No full CPU/GPU numerical-equivalence claim is made.

The corresponding after-fix reproduction reports no accepted event, zero changed ownership cells, zero growth/quads/non-finite attributes, and no paint receipt.

## Face-selector follow-through

A further actual NetMatch regression found that malformed face selectors in field 13 (fraction, negative non-sentinel, null, string, object or oversized number) were ignored by `_applyRemoteSplatEvent`, turning them into unrestricted-face paint and consuming the sender sequence. `readPaintOrder` now accepts only the established omitted legacy field, the emitter's `-1` sentinel, or a nonnegative safe-integer face index. This does not add a claim that the sender owns the selected face; it prevents invalid selector types from silently widening the footprint. The valid-kind regression now explicitly sends face 0, alongside the existing unrestricted and omitted-legacy controls.

## Validation and remaining work

- `issue-522-paint-numeric-admission.test.mjs` (4 passed): unsafe required/optional fields, shader-intermediate overflow, subnormal radius, invalid kinds and face selectors, direct deadline application, all nine valid kinds, corrected same-sequence payload and finite GPU attributes.
- Existing `paint-canonical-order.test.mjs` (15 passed): normal opposing paint, legacy compatibility, duplicate/stale handling, same-match recreation, ownership handoff, causal and deadline ordering, wall drips and 30/60/120 Hz convergence.
- Existing `issue-189-roller-max-width.test.mjs` (6 passed): native and composed roller paint, source units and wavy footprint compatibility. The three files above pass together: 25 tests, 0 failures.
- Quick upstream/profile compatibility check passes. Full integration CI/build/browser execution remains with the integration owner.

The broader #522 requirement remains open: a representable paint row is still not cryptographically or semantically tied to a specific actor/action. Legitimate victim-owned splat bursts and host-owned Boss paint can use another team's color, so this patch does not apply an incorrect blanket sender-team restriction. Completing provenance requires a consistent contract for every gameplay paint producer and lifecycle; this numeric-boundary repair must not be described as complete anti-cheat or full Issue closure.
