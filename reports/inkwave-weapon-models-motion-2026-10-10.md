# INKWAVE: base weapon models and motion ownership

Public implementation: `inkwave-public/`, composed through `patches/splatoon3/adapter.mjs`. Baseline: `9117816158c7a890a40b91319fbd6d9433b2f974`. No locked upstream files are edited.

## Reference and comparison boundary

The reference is Nintendo's public [Splatoon weapon gallery](https://www.nintendo.com/jp/character/splatoon/fashion/index.html), inspected on 2026-10-10. It supplies the visible base-weapon shapes, rather than exact mesh dimensions or joint curves. The gallery is an undated franchise reference, **not** a versioned Splatoon 3 executable or a Switch capture. The project's existing S3 timing/profile calibration is retained; this change does not invent new retail frame values.

These are original procedural interpretations. Geometry dimensions, pipe paths, flame strips, colors and material tuning are INKWAVE art calibration. No Nintendo model, texture, logo, binary asset or animation bank is added. The existing locomotion bank is legacy Wii U material and must not be described as a S3 attack reference.

| INKWAVE | Corresponding base weapon | Difference addressed |
| --- | --- | --- |
| shooter | Splattershot / スプラシューター | Rounded pale upper bottle, yellow short cone nozzle and rail, purple grip, blue rear cap. |
| dualies | Splat Dualies / スプラマニューバー | Open magenta frame, round black muzzle, exposed feed tube and pale hose instead of generic pistol slides. |
| charger | Splat Charger / スプラチャージャー | Long black tube, yellow open sights and stock, pale oval tank; remove the unrelated visible scope from this unscoped kit. |
| blaster | Blaster / ホットブラスター | Broad dark front can with flame strips, rear metal reservoir, central spring, pull lever and ribbed skid. The visible muzzle follows the admitted spring-front movement. |
| roller | Splat Roller / スプラローラー | Purple frame, yellow bearings and pale reservoir; keep the existing verified wide drum and articulated fold. |
| slosher | Slosher / バケットスロッシャー | Dark tapered faceted pail, lilac braces and open arch, exposed spring; fit the animated liquid inside the taper. |
| splatling | Heavy Splatling / バレルスピナー | Three substantial barrels with gold muzzles, red receiver, tilted tall silver tank, yellow hose and handle. |

## Implementation and reproduced behavior

`runtime/weapon-reference-models.mjs` rebuilds the geometry before native `finishParts`. It retains the authored right/left attachment transforms, muzzle rest coordinates, indexed material attributes, animated-part names, cached definitions and near/far LOD assembly. Unrelated old mechanisms retain zero-area compatibility channels so existing state drivers can reset them without drawing an incorrect accessory. Roller construction and its folding ownership remain with the existing roller modules.

Before this change, the asynchronously loaded legacy controller owned the upper body throughout attacks for five families. It could overwrite current weapon recoil, Slosher heave and charge/recovery poses after the native solver. `runtime/source-weapon-owner.mjs` now yields upper-body ownership for current actor fire/sub intent, charging/streaming, windup, admitted flick/slosh, recovery, bomb swap, Dualies, death and Special states. Ground/air movement continues through the existing locomotion path. Reading actor intent covers the first Charger admission frame before the runner's charging flag is set.

Reproduction: wait for the source motion bank to load; walk with each weapon; hold fire; jump and aim upward during fire; release; hold and throw a sub; change form/weapon or enter a Special. Current weapon-specific attack solvers retain ownership in these states. The fully held support hand stays on its authored socket; deliberately released hands during throws remain free. Blaster front and the rendered muzzle move together, returning to the unchanged native rest socket.

Gameplay impact: improved recognition, grip alignment and weapon-specific attack readability. Damage, spread, fire intervals, ink costs, charge thresholds, projectile algorithms and gear parameters are not retuned.

## Verification

- New production-composition tests cover seven finite indexed models, attachment inverse transforms, caching, animated parts, unscoped Charger, preserved roller fold, real Actor/Runner attacks, finite poses, fully held support contact, reset/swap, and Blaster front/muzzle attachment.
- The browser gate `scripts/check-inkwave-weapon-models.mjs` uses the built revision, production physical shaders, actual Character/Runner and fully loaded source bank. Each family runs 270 frames across carry, walking, firing, airborne upward aim and sub hold/throw. It requires native ownership for all 100 fire-intent frames and support contact within 0.006 world units whenever the support hand is fully held. It records source SHA, content hash, frame samples and 21 screenshots.
- Existing weapon-detail and weapon-motion regressions cover recoil, charge/release, Slosher liquid/heave, Heavy spin, bomb, Flow, reset/form/swap/death and 30/60/120Hz clocks. Existing browser detail verification covers 14 state scenarios.
- The new browser gate is part of the unchanged active workflow gate, including its immutable source/build receipt. Full patch and workflow regressions and publication must be read from the exact-head CI result, not inferred from this document.

Visual review: [seven models, moving carry and firing](assets/weapon-models-motion-2026-10-10.jpg). Orange is the test team ink; weapon body colors remain independent.

## Unverified comparison

Exact retail dimensions, hidden construction, every Switch joint trajectory, camera/gear combination and all online combinations remain unmeasured. Browser/native regressions establish INKWAVE contracts and the covered states; they do not establish complete S3 console equivalence. Wii U carry assets, stylized character proportions, and INKWAVE's existing grip locations limit a pixel-identical comparison. No outstanding retail-parity issue is automatically closed by this change.
