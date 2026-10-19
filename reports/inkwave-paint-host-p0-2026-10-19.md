# P0 paint ownership and suspended hosts (#264 / #878)

## Current reproduction

Baseline main: `161f8f410ac614c12c826e3255d293daae20cc12`.

The published composition already disables the old far satellites and fine
spatter from #264. The old test incorrectly described their unowned positions
as a current visible residual. The remaining production ray-tip beads can still
fall between all five gameplay-cell samples. A 0.2-radius bomb / seed 0.11
reproduces the missing bead owner. A local splat whose body misses every cell
also discarded its growth entries, even when its ancillary ink was visible.

#878 already has monotonic host-hidden finish/result timers and migration
handling. An OS-frozen page, however, can stop those timers without closing its
socket. Running the real guest/Match/NetSession against the in-process relay,
while delivering no host RAF or timeout callback, leaves the old guest playing
at zero forever. No Contest can likewise wait for an unavailable host's end.

## Changes

- Add circle/ellipse core versus cell intersection for retained bead ink,
  including directional stretching. Return a real visible witness instead of
  claiming a cell merely because the dot is nearby. Keep five-point checks for
  the remaining shapes. Include the full half-cell in the visit bounds.
- Retain local growth when no body cell was hit. Existing event order, credit,
  cosmetic exclusion and network protocol stay in force.
- Update native-stage mask pruning to retain sub-cell dot cores too. The
  original strict-margin helper behavior remains available for legacy probes;
  production explicitly opts into the new rule.
- Extend the actual shader probe with cell-intersection witnesses and a forward
  GPU-to-CPU check of all ten retained bomb ray beads on floors/walls, at three
  grid sizes and two radii, repainted by both teams. Disabled far spatter remains
  disabled. This is a discrete ownership grid, not a per-pixel scoring claim:
  a cell intersecting a visible core owns its cell area (0.25 m in production).
- Bound visible followers' wait after zero/finish by the existing native finish
  delay plus the existing six-second connection-recovery allowance. If no host
  result arrives, close the current transport and use the normal connection-loss
  exit. Never manufacture a winner/coverage. Pending No Contest uses the same
  recovery allowance after its existing countdown. Positive clock corrections,
  host changes, replacement matches, offline and pause retire old waits.

## Validation

- Focused source ownership/hidden-host/order/hotpath set: 101 passed; emitted
  ownership/hidden-host set: 75 passed, zero failures/skips. Adjacent platform,
  input, cell sampling and native-cache regressions: 50 passed.
- New transformed intersection test covers 5,184 forward-generated core points.
- Removing only the new dot-intersection predicate makes the new production
  bead regression fail at R=0.2 / seed 0.11; the fixed test passes.
- Chromium 141 headless / SwiftShader: actual source-composed and emitted shader
  probes pass and give identical receipts. 124 ancillary cases / 15,813 cells;
  1,512 exact hash queries; 1,094 body cases with CPU-only=0 and GPU-only=0
  outside the existing 17 zero-crossing float ties. Twelve additional sub-cell
  rows check ten bead centres on both surfaces, three cell sizes and two radii,
  repainted by both teams. Reverted active-family hashes still fail the probe;
  disabled satellite/spatter families remain inert.
- Existing hidden-host tests cover 5/20/120-second hiding, result delivery,
  migration, nested renderer suspension, replacement and disposal. Six new
  cases cover missing host callbacks, No Contest, and a guest's own suspension.
- Production build and quick source compatibility pass. Source and emitted P0
  suites are explicitly in CI. Chromium's full-browser process singleton could
  not create its socket here; its headless shell successfully ran the same
  verifier. WebKit and remote full CI remain separate acceptance gates.

## Splatoon 3 comparison

Reference remains the repository's Splatoon 3 11.3.0. Same-condition comparison:
normal team ink should support the same ownership queries; online Turf War
must not pause indefinitely when another player's page stops. No Nintendo
shape, timing, disconnect/no-contest calibration or physical Switch measurement
is introduced here. INKWAVE's bounded connection-loss fallback is an application
recovery policy; retail disconnect parity and physical mobile/console tests
remain unverified. Clock/physics catch-up and numerical weapon profiles are
unchanged.
