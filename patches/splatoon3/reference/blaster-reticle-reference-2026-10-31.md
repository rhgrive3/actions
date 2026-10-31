# Blaster reticle presentation: source and calibration record

## Scope and evidence level

The module `runtime/blaster-reticle-presentation.mjs` changes HUD presentation only. Projectile launch angles, spread recovery, hit tests and weapon range remain owned by their existing runtimes. The values below are measurements of original gameplay captures, **not extracted Nintendo UI layout constants**. Original 720p measurements have approximately 1 px uncertainty; values normalized from 432p footage have approximately 2 px uncertainty. Exact camera/pitch dependence remains unverified.

## Original capture measurements

- [李夜, スプラトゥーン3 ホッカス解説, 2024-07-28](https://note.com/eleonor/n/n7394e3178ba0): [non-target, 1280×720](https://assets.st-note.com/img/1721909161457-dPQxioJi92.png), [direct hit](https://assets.st-note.com/img/1721913428811-agYOCRTNNP.png), [separate camera and terrain impact](https://assets.st-note.com/img/1721913036201-3DWzWgfzM6.png), [jump sample](https://assets.st-note.com/img/1721913435599-7DTLZn7r6c.jpg).
- [わ, ホットブラスターやギアなど, 2026-02-13](https://note.com/brave_zinnia1853/n/nced0fa32e3de): [1920×1080 original](https://assets.st-note.com/img/1770900748-hC35oMSsPqNWyvrKi26Hg0fF.jpg).
- [ノヴァ original 1280×720](https://assets.st-note.com/img/1739701159-7QFaPnJ8LbGkfw6vYCsrXote.jpg), [author article](https://note.com/dorasamajragm/n/nd55d6112b43f).

The non-target marker has four straight diagonal tangent segments, a gray camera circle and a small white point. It is not a broken circular arc. At 720p the Hot segment centers are approximately ±24.2 px on each axis, each segment approximately 14 px long and 3 px wide; their overall bright-pixel extent is approximately 60×60 px. Independent bright-mask measurements give component boxes (620,309)–(631,320), (668,310)–(679,320), (620,358)–(631,368), (668,358)–(679,368). The 1080p capture gives approximately ±36 px centers and 90 px total extent, consistent with 1.5× presentation scale.

The gray camera circle is approximately r=13 px. The actual impact marker has a white ring centered at approximately r=12.5 px, a 2 px white stroke, an ink-colored outer edge reaching approximately r=17 px, and a white point approximately 6 px in diameter. A direct-hit enemy adds four radial lines forming an X. The camera circle and impact marker can be far apart at nearby geometry; the example above places them around (637,295) and (663,391).

The name `camera` in the helper is an API label for the gray aiming mark, **not evidence that this mark is fixed at screen center**. In the non-target 1280×720 capture its center is approximately (649.5,338.9), displaced (+9.5,-21.1) from (640,360). In the upward-jump/near-box image it is approximately (637,295), displaced (-3,-65). The Game8 Hot human frame at 3 seconds has approximately the same normalized offset as the first image. These observations rule out both a universal viewport-center assumption and a single constant pixel offset. Projection of the unoccluded firing/flight endpoint is a plausible integration model, but the native projection law has not been extracted or isolated by a controlled camera experiment. Do not claim a local FOV correction or a guessed depth formula is a Nintendo constant.

The jump sample has segment-center half-width approximately 44.8 px and half-height approximately 23.7 px. Independent measurement agrees: each short-line bounding box remains approximately 12×12 px. The implementation therefore moves the segments horizontally without enlarging their line lengths or thicknesses. The exact frame in the jump-recovery window is unknown. The provisional 10° → 20.6 px extra half-width curve is explicitly marked as image calibration, not an extracted mapping. The optional `spreadHalfWidth720` input can replace it after a controlled comparison.

## Weapon baseline samples

| Family | Half-extent at 720p | Direct footage |
|---|---:|---|
| Hot | 24.2 px | [Game8 original clip](https://img.game8.jp/10250234/214f9954184a5110d19f4c9b62c47337.mp4/show) |
| Luna | 28.5 px | [clip](https://img.game8.jp/10743889/2c428d6e78d9717930c4fe677ee1263c.mp4/show) |
| Range | 20.0 px | [clip](https://img.game8.jp/10439483/ad323f3d94b9fe5769ea1391f600c627.mp4/show) |
| Clash | 26.0 px | [clip](https://img.game8.jp/10250253/da8fcf5eea9248accaaf5e227e26f30c.mp4/show) |
| Rapid | 18.7 px | [clip](https://img.game8.jp/10086663/2762f11b094f54efa9dcc107b32bf610.mp4/show) |
| S-BLAST, ground | 19.1 px | [clip](https://img.game8.jp/10250284/903580eed86e9cf88f3608e62daf628d.mp4/show) |
| Rapid Elite | Unmeasured | Explicit Rapid fallback, `baselineMeasured=false` |
| S-BLAST, short mode | 28.1 px vertically; horizontal adds `229*tan(spreadDeg)` | [5.1.0 original, AP10](https://img.game8.jp/8887902/00bc84d232ea126670a4056e963d8e39.jpeg/original) |

The Game8 footage is 768×432; measurements were multiplied by 720/432. A second reviewer measured Rapid at 1, 3 and 5 seconds at approximately 11.1 px (18.5 px normalized), despite different firing poses. Hot measured approximately 14.6 px at the human-form frame (24.3 px normalized); its squid-transition/camera-lowered frame measured approximately 13.3 px (22.2 px normalized). These clips do not isolate pitch, distance or transformation effects. Consequently the table is a useful baseline, not a claim of invariant native constants. `halfExtent720` allows a future correctly projected value to override it.

The official Nintendo Splatoon Base weapon demonstration clips were also inspected, but their HUD is hidden. They cannot establish reticle dimensions.

## Rapid Elite evidence audit

The Elite profile remains explicitly `measured:false`, `fallbackFrom:'rapid'`. Its 18.7 px half-extent is a temporary presentation fallback, not an Elite measurement. The following additional primary-capture candidates were inspected and excluded from ground-baseline measurement:

- [Vyname's original 1920×1080 comparison of all three Elite variants, 2025-07-25](https://splatoonwiki.org/wiki/File%3AS3_Rapid_Blaster_Pro_all_versions_comparison.mp4), [original MP4](https://cdn.wikimg.net/en/splatoonwiki/images/5/56/S3_Rapid_Blaster_Pro_all_versions_comparison.mp4): weapon-model close-ups with no reticle in the 23.7-second clip.
- [攻略大百科's Elite article](https://gamepedia.jp/splatoon3/archives/16155), [original 1280×720 battle image](https://media.gamepedia.jp/wp-content/uploads/sites/123/2023/01/26044556/24ac04ed0fa23c1f6c495731f567e52c.jpg): the weapon and Splatoon 3 battle are identifiable, but this replay capture hides the aiming HUD.
- [woo-chan's original play article, 2022-09-19](https://woo-chan.hatenablog.com/entry/2022/09/19/165337), [1024×576 gameplay image](https://cdn-ak.f.st-hatena.com/images/fotolife/w/woo_chan/20220919/20220919150543.jpg): a rail mission with target-hit graphics; unsuitable for a normal ground baseline.
- [ふうき's original play diary](https://note.com/huuuuukiiiiin/n/n28e16f7295db): Elite battle imagery has hit/kill overlays; the other visible outer-mark sample is Salmon Run, with state and PvE differences not controlled.

The GameWith Elite tutorial image shows the older game's training room, and the Game8 special-demo media attached to the Elite article actually uses a roller. Neither is evidence for Splatoon 3 Elite reticle geometry. A recent Reddit ink-consumption clip was located, but it is a camera recording of a display and its media was not obtained. Do not upgrade the Elite profile to measured based on any of these exclusions.

## S-BLAST short-mode measurement added

Game8 published an original 1280×720 comparison at the same camera position, jump pose and **10 AP of Intensify Action** for the 5.1.0 change: [before](https://img.game8.jp/8887897/8e34d5fc98549e6488596d390214348a.jpeg/original) and [after](https://img.game8.jp/8887902/00bc84d232ea126670a4056e963d8e39.jpeg/original). These are distinct from the ground-mode clips above.

Bright-mask connected components give before halfX=50.46 px, halfY=28.02 px; after halfX=45.87 px, halfY=28.14 px. The gray center circle has radius approximately 23 px in both, and the white dot has approximately 3 px radius. The stable vertical extent and circle radius, with the horizontal extent changing under the gear adjustment, support separating mode geometry from angular spread.

The public [5.0.0](https://leanny.github.io/splat3/data/parameter/500/weapon/WeaponBlasterPrecision.game__GameParameterTable.json) and [5.1.0](https://leanny.github.io/splat3/data/parameter/510/weapon/WeaponBlasterPrecision.game__GameParameterTable.json) parameter tables give an 8° air cone and an action-curve Mid value changing from .5 to .625. With the established gear curve at AP10 (`p=.303`), the effective angles are 5.576° and 4.43982946°. The display calibration `halfX=28.1+229*tan(angle)` reproduces both measured images to within .1 px. This replaces the ground fallback with an independently measured short-mode geometry and a curve constrained by two known-gear samples. It does not alter the existing launch cone.

These short-mode captures are **5.1.0**, not 11.3.0. `currentVersionPixelParityVerified=false` remains explicit. S-BLAST damage radius was changed in later versions; that alone does not prove the HUD should be proportionally resized. Ground-mode measurements from 5.1.0 and 8.1.0 both remain approximately 19.1 px despite the intervening 7.2.0 long-mode explosion-radius change. A 2026-10-09 original-play video by 檸檬と紅茶 ([video](https://www.youtube.com/watch?v=fHmo0QnO-qk)) was located and its publisher/title/date/available resolution verified, but its media endpoint returned an unavailable page. Its frames were not inspected or used as evidence.

## Integration contract

1. Append exported `BLASTER_RETICLE_CSS` after legacy HUD styles. Its blaster-specific selector disables the old target/bloom scale, transition and animation without altering other weapon families. It uses a distinct SVG class so generic `.iw-ret__svg circle/path` styles cannot overwrite measured geometry.
2. In `_buildReticle`, replace the blaster branch contents with `blasterReticleMarkup()` and call `bindBlasterReticle(reticle)` whenever the markup is rebuilt.
3. After the existing `applyShotGuide`, call `updateBlasterReticle(reticle, {weapon, viewportWidth, viewportHeight, spreadDeg, guide, anchor:guide, inRange, onTarget})`. `weapon` should be the live weapon descriptor with `catalogRecord` where available; `spreadDeg` should come from the live `WeaponRunner.spread`. This preserves the existing admitted-jump and landing-recovery logic instead of introducing a second clock or an airborne test.
4. Points are absolute CSS viewport coordinates. `anchor:guide` compensates for the existing whole-reticle translation: the gray aiming mark stays at the supplied `camera` point, while the impact mark remains at the guide. Supply the existing firing owner's unoccluded aiming-point projection when available. Omitted `camera` falls back to viewport center only for missing-input safety; that fallback is not native position parity. If the integration instead removes whole-reticle translation for blasters, omit `anchor`.
5. Pass the catalog's selected S-BLAST firing mode: `mode:'short'`, `'blaster-jump'`, or the compatibility alias `'air'` activates the measured short-mode geometry. The long mode uses the ground profile. Select this from the existing firing-mode owner; the helper does not infer mode from `grounded` or create a jump latch. Returned metadata records the original short-mode capture version.

## Verification completed

`node --test patches/splatoon3/tests/blaster-reticle-presentation.test.mjs` passes 15 tests: original 720p/1080p bounds, catalog/kit resolution, unmeasured fallbacks, two S-BLAST short-mode gear samples, horizontal jump expansion, existing spread-clock ownership, distinct camera/impact coordinates, direct-hit/range transitions, viewport scaling with full-precision fractional CSS scale, projected-extent overrides, unchanged-frame DOM writes, rebuilt/removed markup and CSS isolation. An independent Chromium component check also passed 20 combinations of legacy HUD styles, weapon/state and viewport/DPR before the short-mode addition. These checks do not establish full game-HUD integration or exact Nintendo equivalence.
