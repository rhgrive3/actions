# Roller flick ink-recovery origin (#881)

Audited base: PR868402802be92d76b6aa30502237429fb66e34f3fc2 (relevant Roller runtime unchanged fromc1b9). Claim: https://github.com/rhgrive3/actions/issues/881#issuecomment-6024139477. This is independent of the #558/#750 source-PR ports and the #839 contact interval.

Before: an actual humanoid Actor's horizontal tap released at tick22 and first refilled at44, only22 ticks later. An airborne vertical tap released at32 and refilled at59, only27 later. Admission had already started the configured43F/58F stop, consuming21F/31F during windup.

The existing Roller release latch now resets lastFire and raises recoverStopRemaining to at least the already-configured mode-specific stop. It runs only on the actual committed windup-to-release transition, once per shot, for a local simulation owner. Existing longer stops remain in force. No new coefficient, cost, projectile/physics, startup, repeat, post-flick Sub/squid gate or roll-stop value is introduced. The shared fireFlick wrapper being optimized elsewhere is untouched.

After: horizontal release22 → refill65 (43F), vertical release32 → refill90 (58F). Nine new source cases cover both modes at30/60/120Hz, no-release reset/dry controls, a longer overlapping stop, remote ownership and successive admitted taps. Thirteen existing #626 roll-stop cases pass; total22 focused passing cases across the initial combined run and the additional tap regression. Actual first emission22/32, counts13/5,8.5 ink cost,14/18F Sub and15/19F squid recovery owners remain intact.

Reference: the [S3 timing verification page](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%A1%E3%82%A4%E3%83%B3%E3%82%A6%E3%82%A7%E3%83%B3/%E5%89%8D%E9%9A%99%E3%83%BB%E5%BE%8C%E9%9A%99) defines post-shot timing from the emission frame and includes ink recovery. It also notes that observed display timing can differ from extracted values by one frame. This patch preserves the current source-derived43F/58F settings and verifies their runtime release origin; it does not claim a new frame-by-frame console measurement or resolve that separate display convention. No new emitted build or whole CI was run. Refs #881.
