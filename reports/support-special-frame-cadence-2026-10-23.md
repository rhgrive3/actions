# Support-special presentation cadence candidate

Base: PR1844 frozen 354536b365ae54bac71c9ce2970a5c5f322c1304. Candidate only; no merge, publication, browser launch or changes to the fixed base.

## Observed and corrected implementation differences

The production install path imports `special-vfx.mjs` from `runtime/install.mjs:96` and installs it at line 243. Director.update uses a presentation clock with dt capped at 0.1 seconds, then invokes updateObjects/updateKits before updating the pooled VFX. Actual gameplay remains in all-specials.mjs (Wave Breaker), kit-big-bubbler.mjs and kit-support.mjs (Tacticooler). Their geometry, network state, collision, pulse schedule, gauge and damage are untouched.

Owned changes are limited to OBJECT_FX.wave.start, KIT_FX.bubbler.frame and KIT_FX.cooler.frame in special-vfx.mjs.

- Wave Breaker target-disc rotation previously added 0.01 radians per callback, giving 0.3/0.6/1.2/1.44 rad/s at 30/60/120/144Hz. It now preserves the randomized initial orientation and samples elapsed presentation time at 0.6 rad/s. This preserves the nominal existing 60Hz calibration, NOT an asserted retail rotation speed. The flight hiding and live position tracking remain unchanged.
- Bubbler sparkle and Cooler mist discarded accumulator remainders. Over nine seconds Bubbler emitted 67/67/72/72 sparks and Cooler emitted 45/49/49/49 pairs at those cadences. The candidate retains the existing 0.12/0.18-second calibrations, producing 75 Bubbler sparks and 50 Cooler mist/spark pairs at each tested cadence. This modestly increases counts versus the old quantized behavior; it adds no pools, geometry, draw calls or retained effects. Existing culling remains, and at most one emission per update is admitted, including after an artificial large delta. No backlog burst is possible.

## Evidence boundaries and exact reference gaps

The source comments cite Zephiel810, “Splatoon 3 - All Special Weapons (DLC Included)”, https://youtu.be/PLxqXn_E898, explicitly as a sparse storyboard. Comments mention Bubbler 2.0–5.9s and Cooler 156.1s. Those are historical annotations, not newly observed frame evidence. The referenced patches/splatoon3/reference/special-vfx.md is absent from the frozen source. No recording of these three specials with verifiable native FPS, game version and frame-index/timecode alignment was found in the inspected authorized local material. No denied Library artifact was retried and no alternative browser launch was attempted.

Therefore there is NO completed retail frame-by-frame comparison or visual acceptance. The ~2-second storyboard does not establish deployment, pulse, emitter or disappearance timing. This candidate addresses independently demonstrated cadence artifacts only; it does not claim retail fidelity.

Outstanding comparison requirements:
- Bubbler: continuous original footage from activation through emitter ascent, field ignition, damage and collapse; synchronized candidate capture, same camera/view and activation zero frame. Native FPS, version, gear and stationary/Tower state are needed.
- Wave Breaker: continuous throw, landing, all three pulse emissions and destruction; original frame numbers and candidate capture. Align landing and pulse zero frames separately; do not assume projectile/field frame units prove visual timing.
- Tacticooler: continuous throw, landing/unfold, idle mist, drink removal and expiration, plus matching candidate camera/action. Native recording FPS, version and gear required.

## Verification

Node22 executes actual production handler bodies in a VM with fake renderer sinks. Six tests pass: cross-cadence rotation, flight/position/gameplay immutability, both emitter cadence checks and both culling/bounded-work checks. The identical harness against the frozen unmodified source fails exactly the three cadence tests and passes the other three. Single-module esbuild parse/transform passes with no warnings. The same six handler tests also pass after a bounded esbuild 0.28.2 minifying transform with synthetic renderer dependencies. This is not final emitted-site verification.

These are source-method tests, NOT full composed runtime, production-emitted build, GPU/browser frames, or original-game comparisons. Production-emitted and visual validation remain pending. Frozen source was protected with same-filesystem sparse hardlink setup followed by atomic copy-before-write; the final candidate inode differs from the original.
