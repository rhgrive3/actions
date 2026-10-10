# Heavy Splatling PDF and jump recovery: source audit (#940)

Date: 2026-10-09 UTC. Target: Splatoon 3 Ver.11.3.0, Heavy Splatling,
no accuracy-changing gear. This is a source audit, not a retail measurement or
an additional gameplay fix. #940 remains open after the envelope/bloom fix.

## Result

- The pinned data verifies the maximum angles and 25F/70F recovery boundaries.
  It does not contain the code which samples a shot or interpolates those frames.
- A published S3 simulation supplies a concrete **continuous signed power-law**
  candidate for horizontal and vertical angles. It is substantially more precise
  than interpreting `0.3` as a 30% Bernoulli choice. Its original experiment/video
  chain and Heavy Splatling joint distribution have not been verified here.
- No inspected decompilation supplies the missing sampler/recovery function body.
  Do not copy a VFX RNG, a symbol name, a placeholder C++ file, or a speculative
  pseudocode example into gameplay as if it were the retail implementation.
- This audit changes no runtime probability, pitch geometry, speed sampling,
  RNG draw order, recovery curve, or issue acceptance checkbox.

## Pinned parameters actually read

Public source: [Leanny/splat3, commit 7280ff9c, Heavy Splatling 1130 table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpinnerStandard.game__GameParameterTable.json).
The JSON path is `GameParameters.WeaponParam` (`spl__WeaponSpinnerParam`).

| Field | Raw value |
| --- | ---: |
| Stand_DegSwerve | 3.3 |
| Jump_DegSwerve | 7 |
| Stand_DegBiasMin | 0.1 |
| Stand_DegBiasMax | 0.3 |
| Jump_DegBiasMax | 0.3 |
| PitchDegSwerve | 1.6 |
| PitchDegBias | 0.4 |
| Jump_DegBiasDecreaseStartFrame | 25 |
| Jump_DegBiasEndFrame | 70 |

The absence of `Stand_DegBiasKf`/`Stand_DegBiasDecrease` in this JSON does not,
on its own, prove their default values or how the game's Spinner code consumes
`Stand_DegBiasMin`. The table has no random-to-angle expression, axis correlation,
rotation order, RNG endpoint convention, or intermediate recovery samples.

## Archive and implementation audit

The provided archive's `SOURCE_INFO.txt` identifies public snapshots, not a
complete S3 executable decompilation. It explicitly excludes S3 RomFS and
external downloads. The archive label must not be used to infer code contents.

Inspected archive members: part 01 (1,716 entries) and part 02 (12,118 entries).
Parts 03–19 were not individually downloaded or inspected in this audit.

| Artifact | SHA-256 |
| --- | --- |
| Splatoon-public-sources-part-01-of-19.zip | 824e17b9ad6a7969a3e868a26a76abf23e05a265ca825e1f91a040722af510e5 |
| Splatoon-public-sources-part-02-of-19.zip | 1a4fe5b48f47de60426a474034cf3e2aa61acf5f7eaf4b947a9e502e7d52ef66 |
| WeaponSpinnerStandard 1130 JSON member | 92647d586beee1764ca8984820fa37e0fd7887e2a756f7ca18e10e1aef97fd08 |

The code/text/HTML scan covered 968 members in part 01 and 96 in part 02
(`.c/.cpp/.cc/.h/.hpp/.cs/.js/.ts/.py/.md/.txt/.html`, excluding language tables).
Searching `DegBias`, `DegSwerve`, `deviation`, and `swerve` found parameter-editing
documentation and the gear calculator; it did not find the projectile sampler.

| Source checked | Concrete observation | Limitation |
| --- | --- | --- |
| [Dexx-io/Splatoon-Decomp 9ef403d9](https://github.com/Dexx-io/Splatoon-Decomp/tree/9ef403d96f1a370bdd70434ce158a0c29879bfcf), supplied `thick/` | Full public tree has 514 entries, not truncated. The supplied `thick/` has asset files; its only scanned text members are `env/urchinunderpass/vr_model.txt` and `pax/enemy/2.txt`. No gameplay C/C++ source was found. | Not a S3 shot-function implementation. |
| [HoianViewer 89f23684, PlayerViewer/Effects/Sim/VfxRandom.cs](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Effects/Sim/VfxRandom.cs) | `XorShift128` seed/next/float helpers are VFX emitter machinery. No Spinner parameter consumer or shot-angle sampler appears here. | Renderer RNG does not establish weapon RNG or PDF. |
| [Awesome-Splatoon3-Hacking 07b2888c README](https://github.com/DesperC/Awesome-Splatoon3-Hacking/blob/07b2888c04cc383a54b27b05edb62051868ebe03/README.md) | `DegSwerve`/`DegBias` editing guidance, including the warning about default values. | Parameter meanings, not an executable algorithm. |
| [Leanny/splat3 7280ff9c](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6), `ability.html`, `js/Utility.js`, `js/weapon.js` | Gear-rate calculation and parameter/UI utilities. Root and recursive `js/`/`sr/` trees were checked; no gameplay sampler was identified. | Gear AP interpolation is not elapsed-jump recovery. |
| [S1 sdlfoundation decomp 4fc0db8a](https://github.com/sdlfoundation/splatoon-decomp/tree/4fc0db8a6027898653d4328dde83f522b5f911a4) | Full tree: 161 entries, not truncated. `home/Cafe/Gambit/App/Program/Game/Bullet/GameBullet.cpp` and `GameBulletPlayerNormalShotBase.cpp` are zero-byte placeholders. `GamePlayer.h` exposes fields but not their calculation. | No shot/PDF function body, and S1 would still require S3 validation. |
| [S2 Blitz_MasterVer22-Decomp 6e6f8ebb](https://github.com/YoshiCrystal9/Blitz_MasterVer22-Decomp/tree/6e6f8ebb1a3d8ebac518ba47b881ec5d3740baac) | README identifies S2 3.1.0. Full tree: 207 entries, not truncated. `src/Game/Bullet/GameBullet.cpp` contains only an include/empty namespace; `src/Game/Player/GamePlayer.cpp` has small special-state functions/stubs, not Spinner accuracy. | No Spinner sampler source. The large `data/blitz_functions.csv` was identified, but its content could not be retrieved through the connector; do not claim its symbols were audited. |

Additional Drive searches for `Splatoon2` and `splat2` returned no separate
indexed files. This is a search result, not proof that no S2 material exists.

## Published research: useful candidate, not proof of retail parity

1. [かなもじ, S3 accuracy #10, 2024-11-06](https://note.com/kanamoji_1027/n/n4de8b03535de)
   describes its own Splatling trajectory simulation. Its horizontal and pitch
   angles use the signed form `sign(2u-1) * s * abs(2u-1)^(log(b)/log(.5))`,
   with horizontal `b=.3` and pitch `b=.4` for Heavy Splatling. It specifies
   world-horizontal yaw followed by a separate launch pitch, rather than a
   uniform elliptical disk. Its linked trajectory video is
   [つー, vqCSszcA6bw](https://www.youtube.com/watch?v=vqCSszcA6bw).
   The video fetch failed, so its underlying derivation was not inspected.
   This article also describes speed variation as proportional to base speed;
   INKWAVE currently interprets the pinned speed half-width as absolute.
   That disagreement is another reason not to import the whole simulation.
2. [The same researcher's #1](https://note.com/kanamoji_1027/n/nfd4a961652a6)
   derives the marginal CDF `P(abs(angle) <= q*s) = q^(log(.5)/log(b))` from
   a referenced accuracy video. [#2](https://note.com/kanamoji_1027/n/na3307fdc69e7)
   reports an original 372-shot Splattershot experiment (281 hits) comparing
   candidate maximum bias values. This is useful empirical support in another
   weapon family, not a measured Heavy Splatling yaw/pitch joint distribution.
3. [The same researcher's jump #6](https://note.com/kanamoji_1027/n/nd8db315fcebf)
   describes hold/end boundaries and gear scaling, but supplies no time curve
   between 25F and 70F. Its displayed gear equation also fails its own AP=0
   endpoint as written; it must not be copied literally as a verified formula.
4. [smssmooth's S2 accuracy experiments, 2020-09-13](https://smssmooth.hatenablog.com/entry/2020/09/13/173658)
   measure first-shot distributions and distinguish spread from bias, but the
   author explicitly leaves the exact expression unresolved. S2 experiments
   do not determine current S3 recovery or a Spinner-specific joint sampler.
5. [mntone's 2020-04-29 transition article](https://mntone.hateblo.jp/entry/2020/04/29/213131)
   contains `calcDeg` pseudocode with linear interpolation. The author labels
   the article as conjecture, not an actual extracted implementation. It is
   not evidence that the current S3 interpolation is linear.

The [XarrotD deviation draft](https://splatoonwiki.org/wiki/User:XarrotD/Data_Explanation#Deviation_Calculations)
and the [Heavy Splatling article](https://splatoonwiki.org/wiki/Heavy_Splatling#Splatoon_3)
remain conflicting secondary descriptions. The issue's literal “30% outer”
acceptance condition is therefore not an independently established oracle.

## Exact remaining implementation gap and useful next evidence

Current INKWAVE locations:

- `runtime/splatling.mjs`, installed `WeaponRunner._spreadDeg`: corrected full
  maximum envelope, independent of generic first-shot/bloom state.
- `runtime/weapon-edgecases.mjs`, `spreadWeaponRound`: shared radial draws produce
  horizontal/pitch offsets. This has not been established as S3's joint PDF.
- `runtime/splatling-jump-spread.mjs`, `splatlingJumpRecoveryAt`: internal linear
  interpolation clamped over 25F–70F. The source comment already marks it
  provisional. Endpoint agreement does not establish the intermediate curve.

To replace these approximations, obtain one of:

- S3 version-identified code consuming `spl__WeaponSpinnerParam` and producing
  the launch direction, including how bias enters each axis, axis draw
  dependence, and rotation order; and code consuming the two jump frame fields.
- Version-identified Heavy Splatling measurements with no accuracy-changing gear:
  signed yaw and pitch from stationary full-charge streams, including the first
  and late shots; repeated jumps sampled at specific ages between 25F and 70F,
  with landing distinguished from continued airtime. Record the actual sample
  coordinates/counts, not just the final reticle width or hit percentage.

One discriminating statistic for the published power-law candidate is 50% of
absolute yaw angles at or below `0.3 * maximum yaw`. For an ideal uniform disk's
normalized horizontal coordinate, the corresponding analytic fraction is
`2/pi * (asin(.3) + .3*sqrt(1-.3^2))`, approximately 37.62%. These are model
predictions, not measured S3 results; INKWAVE's tangent/normalization geometry
also needs to be accounted for when comparing its actual emitted directions.
Testing that a newly written sampler reproduces either formula would prove
only that implementation, not establish which formula Nintendo uses.

No additional runtime change or full-fidelity completion claim follows from
this audit. The prior five-case maximum-envelope regression remains a check of
the narrower fix, and is not relabeled as a PDF or physical Switch comparison.
