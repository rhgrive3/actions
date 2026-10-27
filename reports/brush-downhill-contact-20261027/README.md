# Brush rolling transform and downhill contact

Base: `4ce9768e6177b19f11f17e28f086a4da36f35fcd`.
Branch: `fix/brush-rolling-presentation-20261027`.

The loaded production Brush receives `runner.rolling`, `anim.rolling` and
`wRoll` correctly. Its floor-feedback loop read the weapon matrix last flushed
by a draw. Multiple fixed ticks reused that stale error, producing alternating
raised/buried weapon transforms despite a continuously held action. Refreshing
the weapon's existing world-transform cache before reading it removes the
feedback oscillation. The tip-height target also follows the actual standing
surface plane rather than the height at the actor's feet.

Only the Brush weapon presentation changes. No geometry, character model/rig,
local bone values, collision, speed, ink or paint rule is authored or changed.
The source regression awaits the actual motion bank and measures displayed
weapon vertices with one/six gameplay ticks per draw. Movement, payment and
shot-admission traces remain equal. The existing held/jump/landing regression
also passes. Old emitted runtime fails the new stability check.

Before-change browser evidence uses ordinary menu/keyboard/mouse input, an
actual pointer lock, and the range's normal R reset while the Brush remains
held. The CPU grid is empty before descent. Turf increases from 0 to 2.9929
and 10.4745; five sampled ramp points change from empty to own ink. Separate
weapon bounds document the floating presentation, so that fresh paint is not
mistaken for correct weapon contact.

Candidate emitted regression, exact build binding, and before/after normal
browser weapon captures are recorded after validation. They are not retail
frame/geometry measurements. The pre-existing ink-tip/model calibration is
retained; no original Nintendo media is included.
