# Trizooka: model form and two-hand hold

Baseline `67f708b650b1af788206a4c0e9e3dd879bfa3e44`; runtime candidate `6f3fcd42` (integrated as `b27043b2`). Only the Trizooka model/hold sections of `special-motion.mjs` change. The original model/hold already reported essentially zero hand error, which did not establish a correct weapon silhouette, handle shape, shoulder relationship or firing origin.

## Original evidence and diagnosis

[Reference audit](reference.md) identifies the full-resolution Nintendo 2021 Trizooka screenshots 00/01 and official SplatoonJP promotional images 02/03. They show a substantial yellow/silver rear housing behind the head, large rounded banded capsules and hoses, a long ribbed silver tube, broad faceted yellow collars, a bulbous green head around a dark recessed opening, and separate green trigger/support grips. In image 03 the rear trigger fist is lower at the upper torso, while the support hand is farther forward and higher under the collar. Shoulder contact is obscured; no exact contact, retail dimensions, joint angles, game version, gear or input timing is inferred from these prerelease stills.

The baseline differed in concrete ways:

- A flat opaque team-colored disk plugged the apparent muzzle instead of a dark recessed bore.
- The rear was a small red cap; the substantial yellow housing and exposed silver longitudinal ribs were absent.
- Short flat-ended yellow cylinders replaced the rounded, tilted capsules.
- The front support was a tiny dark block. Both hand axes were vertical despite the distinct projecting support grip.
- The model used the same chest-level placement as Ink Vac. It sat near the character center and crossed the face in common views. Hand contact remained numerically exact because the solver faithfully reached the wrong authored model sockets.

## Final model and hold

The procedural reconstruction has a genuinely recessed dark bore and red open lip, a rounded/faceted green nose with raised rails and fasteners, ten silver neck ribs, actual six-sided yellow collars, an exposed silver-fluted rear drum framed by yellow rims, and three rounded tilted capsules with dark bands, caps and hoses. These are reference-guided INKWAVE geometry choices, not imported Nintendo meshes.

The rear green trigger and forward green support are physically distinct parts of the merged housing. Each socket lies inside the rendered handle, and each hand's grip-hole axis follows its corresponding bar. The front support is oblique; the rear trigger is vertical. The rear handle has a connected upper riser and a short asymmetric free end below the fist. Its red trigger follows the lowered index-side grasp region.

The neutral authored root placement changes from `[-.11,.96,.25]` to `[-.40,1.07,.10]` before the existing reach fit. The barrel moves to the character's right flank and close to eye level. The trigger socket is `[0,-.26,-.18]` in model space, support `[.205,-.11,.08]`. In the loaded-source neutral scene their world heights are `.810` and `.960`, with the support `.26` forward. The rear fist is below the right clavicle, and the two arms no longer imitate two identical vertical-grip holds. Existing native limb IK still owns elbow bends; no source-body or torso channels were retuned for this change.

Trizooka recoil keeps its existing `.055` displacement and exponential response, but its translation follows the actual aimed bore in kid space, including side yaw. Breech motion, flash timing, accepted volley/ejection ownership and cartridge timing remain under their existing sources. Ink Vac and other specials retain their prior model/hold path.

## Firing origin is an intentional correction

`Character.getMuzzle` was already overridden to return the fitted visible Trizooka nozzle, and native `throwVolley` samples it through `Projectiles._muzzle` and `_aimFrom`. Moving the weapon therefore moves the actual launch origin and camera-ray convergence. It would be incorrect to call this entire change cosmetic.

An initial trial retained the old origin in a separate kid-local mathematical anchor. Independent browser measurements found a `.3374` neutral nozzle/birth gap and `.239–.426` over the sampled states; a real wall could separate the visible barrel from the retained old origin. That trial was removed before the committed candidate. There is no legacy anchor, fake trajectory or separate visual projectile path in the final code.

The final model uses the existing visible-nozzle getter and unchanged native muzzle LOS/distance safeguards and camera-ray aim convergence. In the independently recorded moving-shot comparison, the first birth moves `.40813` INKWAVE world units relative to baseline; its initial velocity direction changes accordingly. Native and visible nozzle/birth coincide in the final sample matrix. A real close wall blocks the new nozzle and causes the existing fallback exactly at actor-relative `[0,1.05,.3]`. Position-dependent paint can consequently move; the verification report records a maximum paired paint-stamp shift of `.52181` in that controlled comparison. Damage values, radii, shot count, cadence, flight parameters, paint-band definitions, packet schema and authority remain unchanged.

[Native launch audit and scalar receipt](anchor-audit.md) and [independent browser review](verification.md) document those distinctions. The scalar comparison deliberately excludes launch position/direction, which are checked against the corrected physical nozzle and native aim rules instead.

## Checks and resource bounds

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/trizooka-hold-model-20261030.test.mjs
node --experimental-vm-modules --test --test-concurrency=2 patches/splatoon3/tests/special-presentation.test.mjs patches/splatoon3/tests/special-presentation-hotpath.test.mjs
```

The two new tests pass with the actual loaded SourceMotionController at 30/60/120 Hz. They inspect actual ray intersections through the dark recessed bore and both rendered grips, exposed rear silver fins, six real collar corners, hand/bar axes, face-side barrel position, lower trigger versus higher forward support, cosmetic nozzle access and paused fit/clock behavior. Model construction also consumes zero gameplay `Math.random` calls under the existing production crypto-UUID adapter. The existing dedicated presentation and exact held/Wail hotpath cases pass **12/12**, including extreme aim, lifecycle restoration, shared geometry/material ownership, cartridge boundaries/pause and accepted remote volley presentation.

The final model keeps the original **five meshes** and uses **10,588 triangles**, with immutable shared geometry and owned instance materials. Tiny cap/rear ribs use flat boxes rather than heavily subdivided rounded boxes; this reduces the initial form's 16,036 triangles without changing its silhouette. No extra runtime module, shader type, actor/gameplay owner or scene inspection node is introduced.

Final runtime SHA-256: `a4336340325fb796b0dfa6f21382915a37ef22531078f2857ebebc5b26b13ff2`. The separate final build used for independent browser review has content hash `d76c80e7ba56743fb6ea3e01bac87b95072b7760351cb3fd243f0e66b5779690`, revision `d34673c42881432f93416f2f30f68c3c7df17e36d5e918f7dba25fedd88f0c0e`. [Curated before/final front, side and back images](visual/) accompany the browser review; numeric grip error alone is not the acceptance evidence.

## Remaining limits

The three large modeled capsules remain static for the activation. The existing separate small ejected shell and its sourced lifecycle are preserved; the static housing does not yet consume/hide a capsule per accepted volley. Image 02 shows depletion/ejection, so that visual detail remains an explicit discrepancy. Exact shell/capsule topology, logos, materials, proportions, wrist curves and original shoulder contact remain approximations. Chromium and local CPU evidence do not establish Nintendo hardware or retail animation parity.
