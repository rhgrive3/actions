# Trizooka launch-anchor audit

Baseline: `67f708b6`. The existing visible Trizooka model is also the actual
gameplay muzzle. `Character.getMuzzle` transforms its fitted local nozzle into
world space; `getAimMuzzle` uses that same result during an active mapped hold.
`throwVolley` calls native `Projectiles._muzzle`, then `_aimFrom`, before
creating all three globs. Moving the model therefore changes both launch
position and camera-ray convergence.

## Decision

Use the corrected visible nozzle for the real launch. A provisional independent
legacy anchor would separate the projectile birth from the corrected barrel;
the initial unfitted estimate from the holds lane was about 0.337 world units.
Root approved the coherent-nozzle approach. There is no cosmetic substitute
projectile path and no claim that launch positions/directions remain identical
to the wrong old pose.
The changed origin and convergence can consequently change collision and paint
coordinates. The unchanged contract is the combat parameters, action timing,
resources, movement and network schema/scalars—not exact old impact locations.

The native safeguards stay in charge. `_muzzle` blends toward the native full
aim pose when needed, rejects nonfinite/distant origins and a body-to-nozzle
segment blocked by level geometry, and uses its existing body-origin fallback.
`_aimFrom` converges toward the real aim point; a point less than two world
units away or behind the aim direction retains the existing `aimDir` fallback.
These are existing INKWAVE rules, not newly measured Nintendo values.

Only the mapped, visible human Trizooka may replace the main muzzle. Before its
first drawn pose, when hidden/disabled, after disposal, or in a nonhuman form,
the original main-weapon getter must retain its normal pitch/return behavior.
The source bank continues advancing while the native special owns the upper
body. The cosmetic `trizookaPresentationMuzzle` remains an observer of the
visible model; it is not a second ballistic launch route.

## Focused regression

[`trizooka-launch-anchor-20261030.test.mjs`](../../patches/splatoon3/tests/trizooka-launch-anchor-20261030.test.mjs)
uses the real production-composed Actor, loaded Player00 bank, Projectiles,
Physics and NetMatch serializer. It checks:

- Actual synchronous births equal the unobstructed visible nozzle, including
  movement, yaw, pitch, subsequent-shot recoil and 30/60/120 Hz updates.
- The central glob follows native `_aimFrom` at that actual origin.
- Native close-wall LOS fallback and near/behind aim behavior use real Physics.
- Before-first-pose births and hidden/disabled/disposed/nonhuman getter paths
  retain the native fallback and main aim pitch behavior.
- A deliberately offset getter produces a real off-barrel volley which the
  physical-origin assertion rejects.

The compact
[`trizooka-anchor-scalars-before-67f708b6.json`](../../patches/splatoon3/tests/fixtures/trizooka-anchor-scalars-before-67f708b6.json)
records the baseline's three volleys, 0/4/8F network births, damage, speed,
radius, gravity, drag, lifetime, authority, seeds, packet schema/extension
fields, final ink/gauge/HP and actual actor movement. Launch positions and
directions are deliberately excluded from this scalar comparison. They are
checked against the corrected physical nozzle and native aim rules instead.

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/trizooka-launch-anchor-20261030.test.mjs
INKWAVE_BUILT_SITE=<candidate-site> node --experimental-vm-modules --test patches/splatoon3/tests/trizooka-launch-anchor-20261030.test.mjs
```

Baseline source checks at `67f708b6` passed **6/6**, including comparison to the
captured scalar receipt. The corrected third emitted build at
`/workspace/scratch/trizooka-third-site` also passed **6/6** with that same
baseline. Its revision was
`a79e04fadd1109470761bab023bb030358bb769d899a1e419716b7483155c4d9`,
content hash
`3cd93b7a19107336844d6b9bd485d6e244dc3d61ac03eb5041f2fc629b6241eb`,
and emitted `special-motion.mjs` SHA-256
`654745a2d85bbcac5714588087675f76bdc96f45763faef62cd8a6b8e561df2e`.
Final source checks after the holds commit are integration-owned. These are actual CPU
scene and gameplay pipeline checks; the verification lane owns browser images,
visible-grip/first-shot inspection and final source/artifact hashes. No retail
frame, joint or ballistic parity is inferred from these checks.
