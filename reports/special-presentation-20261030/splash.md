# Special splash cadence — 2026-10-30

Base: `fd6435a4dd2781928d211537c485c87bc50b3784`. Scope: the shared `SpritePool` in `patches/splatoon3/runtime/special-vfx-kit.mjs`; no gameplay, paint, collision, networking, emission recipe, shader, colour, geometry, or pool-capacity change.

## Finding and correction

The existing liquid splashes already use lit, irregular drops, petals, mist and ink surfaces. Their motion was evaluated by damping velocity, applying gravity/buoyancy, then moving by the resulting velocity once per rendered frame. Although damping used an exponential, displacement and acceleration were still frame dependent. The same burst therefore spread and fell differently at 30, 60 and 120 Hz.

The corrected pool evaluates a fractional step of its established 60 Hz recurrence. Both the drag and the constant acceleration participate in that calculation. The original 60 Hz arithmetic path is retained exactly; zero and negative time, negative drag and nonfinite inputs retain their previous path. The zero-drag limit is explicit, and small positive drag uses stable series to avoid cancellation. Adjacent particles with the same drag still share this update's coefficients. The 23 Float32 state fields, renderer attributes, object identities, spawn order and separate presentation RNG are unchanged.

At the authored step `h = 1/60`, the retained recurrence is `v' = exp(-drag*h) * v + acceleration*h`, followed by `x' = x + v'*h`. Alternative frame intervals evaluate powers of that same affine map, rather than adopting a different continuous-physics calibration. Thus the 60 Hz look is the reference, not an asserted Nintendo physics curve.

## Original reference and limits

The project [special VFX reference](../../patches/splatoon3/reference/special-vfx.md) describes liquid domes, thrown ink and ground splashes from Zephiel810's [all-specials footage](https://youtu.be/PLxqXn_E898). Its 320×180 storyboards are approximately 1.98 seconds apart, and the retail version, gear and exact particle curves were not established. They cannot establish a particle lifetime, count or trajectory. This change fixes INKWAVE's inconsistent sampling of its own existing effect; it does not claim new retail timing or visual parity.

[Nintendo's update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/) confirms that Ink Vac ink can paint both walls and ground. The generic visual `inkBlast` callers currently retain impact positions without reliable contact normals. This work does not infer a wall normal or rotate the horizontal decorative puddle; accurate surface-oriented impact rendering remains unverified work.

## Reproduction and measured result

`special-splash-cadence.test.mjs` executes the actual `Director.inkBlast` with radius 6 at `(1, .5, 3)`, copies its real 73-sprite initial state into production pools, and samples positions and velocities at 0.1, 0.2, 0.3 and 0.4 seconds at 30/60/120 Hz. The negative control replaces only the motion loop with the frozen pre-change recurrence. It uses the same births and the same reference state; no substitute particle recipe is involved.

| Maximum component difference from 60 Hz | Frozen old loop | Corrected loop |
| --- | ---: | ---: |
| Position | 0.104273796 m | 0.000001907 m |
| Velocity | 0.042521477 m/s | 0.000003815 m/s |

All sprites expire after the two-second test window. Clear/reuse leaves the transparent warm instance, no paint callback runs, and no gameplay random call occurs. Separate tests cover zero/near-zero drag, gravity plus buoyancy, and uneven frame intervals. Existing tests continue to assert complete byte-for-byte Float32/renderer parity at 60 Hz and unchanged lifespan, overflow, eviction, clear and upload behavior at all three cadences. Only the alternative-cadence motion comparisons were replaced by the new explicit trajectory contract.

## Verification

Node `v24.19.0`; upstream assets `/workspace/actions/inkwave-public`; esbuild `0.28.2` from `/workspace/actions/node_modules`.

```sh
INKWAVE_UPSTREAM_SOURCE=/workspace/actions/inkwave-public node --experimental-vm-modules --test \
  patches/splatoon3/tests/special-splash-cadence.test.mjs \
  patches/splatoon3/tests/special-sprite-drag-cache.test.mjs \
  patches/local-quality/tests/special-vfx-zero-drag-parity.test.mjs

INKWAVE_UPSTREAM_SOURCE=/workspace/actions/inkwave-public \
SPECIAL_SPLASH_ESBUILD=/workspace/actions/node_modules/esbuild/lib/main.js \
node --experimental-vm-modules --test patches/splatoon3/tests/special-splash-cadence.test.mjs
```

Results: source 9/9; composed/minified cadence tests 2/2. The same measured values above occur in both runs. Runtime SHA-256: `953dce5808051310f9cf4d7a7404f85e98536d7ffe366e173e47634b2b7d72cf`.

Related regressions: `special-vfx.test.mjs`, `special-vfx-pool-capacity.test.mjs`, `inkjet-vfx-pool-budget.test.mjs`, `special-vfx-recipes-parity.test.mjs` and `trizooka-lobe-vfx.test.mjs` pass 61/61. This includes VFX-on/off gameplay parity, pooled geometry/material reuse and disposal, unchanged recipe state/RNG order, Inkjet fair capacity at 30/60/120 Hz, and native Trizooka birth/terminal timing. The fixture reports its existing optional source-motion dynamic-import warning; the tests exit successfully. `check-inkwave-patches.mjs --quick` and `git diff --check` pass.

These are production CPU pool and recipe checks. Browser/GPU and combined-branch verification are recorded separately by the integration owner; Switch hardware, retail side-by-side frames and iPad performance were not measured here.

## Follow-up: bounded CPU cost and extreme inputs

The [one-off probe](splash-cost-probe.mjs) executes the real `SpritePool.update` from `8d84fd3` and the exact cached-drag baseline from `fd6435a4`, including Float32 writes and dirty attribute range bookkeeping. The seed is the same real 73-sprite `inkBlast` (72 puffs and one spark). Half/full loads repeat its admitted records; the final two cases deliberately alternate `.8/1.12/1.6/2.2` drag each particle to defeat the adjacent-rate cache. Each sample resets outside the wall-time window and runs three updates, keeping every particle inside its authored lifetime. Seven paired samples alternate old/new order. Process CPU timing includes the same reset overhead on both sides.

Recorded machine: Node 24.19.0, Intel Xeon Platinum 8573C, five logical CPUs. Several other source tests ran on this shared host. Wall-time medians were noisy, so the table uses **process CPU milliseconds per update**. The [raw results](splash-cost-results.json) include both clocks, every sample and 60 Hz results; negative differences are noise, not a speedup claim.

| Load | 30 Hz old → new (ms) | 120 Hz old → new (ms) |
| --- | ---: | ---: |
| Actual 73-sprite burst | 0.015638 → 0.015567 | 0.014676 → 0.014886 |
| 260 puffs | 0.038087 → 0.041055 | 0.038668 → 0.042242 |
| 520 puffs | 0.071653 → 0.077777 | 0.077585 → 0.081207 |
| 450 sparks | 0.036416 → 0.039550 | 0.037719 → 0.038004 |
| 900 sparks | 0.068884 → 0.073613 | 0.071405 → 0.073024 |
| 520 puffs, alternating drag | 0.075188 → 0.095905 | 0.075078 → 0.092069 |
| 900 sparks, alternating drag | 0.082384 → 0.113524 | 0.080190 → 0.117268 |

The largest observed added CPU cost is 0.037078 ms/update in the deliberately alternating 900-particle load (46.2% of that small isolated component). The real burst and normal full-pool cases add at most 0.006125 ms in these 30/120 Hz medians. This is not a mobile-frame-time or GPU measurement, and no further optimization is justified by this component result alone. All old/new pool tests retained the same counts and bounded upload ranges: 520 puffs plus one warm slot, 900 sparks plus one warm slot, and 12 kit draw pools. No capacity, geometry, shader or material was added.

Extreme stored positive Float32 drag from `2^-149` through `3.4028234663852886e38` stayed finite at 30/60/120 Hz. Inputs above Float32's maximum become infinity in the existing state array and retain the legacy nonfinite-rate path. A separate pathological probe found that positive time as small as `Number.MIN_VALUE` or `1e-300`, combined with tiny positive drag, can underflow `drag*dt` to zero. The exponential ratio then evaluated `0/0`. The follow-up uses its mathematical limit, `1`, when that product is zero. It changes neither ordinary-frame coefficients nor the preserved 60 Hz path.

The added regression exercises the actual pool with nine tiny-positive-time/rate combinations, checks unchanged sub-Float32 motion and finite uploaded attributes. Follow-up source suite: 10/10; composed/minified suite: 3/3. Follow-up runtime SHA-256: `326f5ec529bb53edc70606758bfbb92ef467a081d19c3ac5b5ea1689e97a7d79`. The CPU samples predate this single limit guard and identify their original source hash in the attached results.

```sh
INKWAVE_UPSTREAM_SOURCE=/workspace/actions/inkwave-public \
node --experimental-vm-modules reports/special-presentation-20261030/splash-cost-probe.mjs
```
