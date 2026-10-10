# Slosher intermediate paint: source conversion and admission

Baseline: PR #1202, `7d74919cf78dd203e7bd0d1b80eeaf451eaec0f8`.
Target: Splatoon 3 11.3.0, stock Bucket Slosher, unchanged gear and main-shot damage.

## Evidence and limits

The user-provided `Splatoon-public-sources-part-02-of-19.zip` contains the pinned
[Leanny/splat3 weapon table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherStrong.game__GameParameterTable.json).
The member SHA-256 is `1d20043ad7efaf2831801afbce601fb1e14bfd11947063903c6fadd6c98f5298`.
Its Unit[2] `SplashAndSplashWallHitSpawnPrm` exactly matches the baseline profile.
This is an extracted parameter table, **not recovered executable game logic**.
No raw archive or decompiled source is added to this change.

Unit[2], order 3 specifies one paint-only splash: player collision radius zero,
width half 0.7, total depth ratio 2, between-length 1.5 and first-length rate
0.7–0.9. The existing profile uses 1 INKWAVE world unit per source length unit;
width and schedule lengths each receive that scale once. Depth is dimensionless.
At the existing seed 0.5 calibration, the event distance is 1.2 world units.

The random-rate mapping, downward 10-unit projection, asymmetric INKWAVE paint
rasterizer and visual outline remain local approximations. This patch does not
recover a native falling-droplet simulation, PRNG, or Nintendo's exact paint mask.
In particular, consuming a missed projected slot preserves its source identity;
it does not assert that a retail droplet disappears at this projection limit.

## Five independent defects repaired

1. **Depth units:** `PaintDepthScale=2` was passed as additive `stretchAmt=2`,
   which PaintSystem interprets as foreground scale 3. Pass 1, preserving the
   existing renderer's additive convention and its separate rear-half shape.
2. **Missed-slot relocation:** after a missing ground probe, the same scheduled
   slot was retried from a later projectile position. Consume the source slot
   when its distance is crossed, even if its projected surface is absent.
3. **Pool lifetime:** equal random seeds on consecutive uses of one projectile
   retained the spent counter. Reset schedule state on `_new`, independently of
   random sampling; retain the source-spec cache where inputs are unchanged.
4. **Paint authority:** a remote-owned non-ghost projectile could author this
   supplementary stamp. Require both non-ghost and non-remote ownership.
5. **Terminal chronology:** the after-`_step` wrapper discarded every event on
   an actor-terminal tick, even when its scheduled distance preceded contact.
   Reuse the existing collision solver's clipped segment before impact effects.
   Slots beyond actor/world/boss contact are not projected. Do not create a
   second integrator, collision query, damage event or network packet format.

The common collision callback is optional, preserving partial/source-only test
realms. The fallback handles only nonterminal segments when no solver callback
ran. Ordinary Slosher births, nine-glob grouping, damage, yaw and flight values
are unchanged. No source parameter numbers were retuned to make tests pass.

## Verification

- The five focused negative controls all fail on the unchanged baseline.
- Expanded eight-test baseline: seven failures, one unchanged cadence pass.
  Includes actual composed Actor-terminal and wall-clipped projectile paths.
- Fixed expanded suite: eight pass, zero skip.
- Related source/runtime suite: 98 pass, zero fail, zero skip:
  `node --experimental-vm-modules --test patches/splatoon3/tests/*slosher*.test.mjs patches/splatoon3/tests/issue-six-followup-network-paint.test.mjs`
- Native CPU paint traces agree at 30/60/120 Hz rendering over the same 60 Hz
  fixed simulation. This is not a Nintendo device measurement.

Native-module fixtures use the real adapters, collision solver and CPU paint;
render backend, audio and character meshes are fixtures. GPU/browser visuals,
physical Switch comparison, live two-device networking and complete exact-head
CI are not claimed by this workstream. The integrating branch owns full CI and
emitted-build verification. No issue is marked fully retail-equivalent here.
