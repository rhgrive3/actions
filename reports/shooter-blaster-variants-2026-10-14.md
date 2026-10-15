# Shooter / blaster alternate-model first pass

## Scope and provenance

31 real alternate rows (22 shooter, 9 blaster) from Splatoon 3 11.3.0, excluding replicas, campaign and Salmon Run rows. Source: https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/mush/1130/WeaponInfoMain.json . Downloaded bytes SHA256 `53641c4b4c96d56d3ed4ca8d4c7426d83a0bf28af6f85e9eafc391b2ae9f663e` matches the existing canonical-kits reference. The adjacent identity JSON records the exact source-row, numeric ID, Japanese Label, source pointer, GameActor and existing base catalogue ID.

The old canonical-kits file has only65 base records. No gameplay records are invented, no sub/special kits are changed, and these IDs do not become gameplay weapons. Shared registry / visual-only preview selection is owned by parent integration.

Current source baseline: main45d60b3d11a66a8abea49ecf699aa1071f638095. All existing builders are imported, not copied or edited. PR1294's five-shooter base rebuild ownership remains separate; its unresolved Nova muzzle is not moved. This work does not claim to fix that discrepancy. Existing Tenacity edits remain untouched. The active PR search also found1271 and1278 model work in other families; no overlapping files are changed.

## API

`VARIANT_MODELS[sourceRow] = {...baseSpec,baseId,sourceRow,name,sourceUrl,sourceInfoUrl,referenceVersion,visualStatus,build(freshFamilyDef)}`.

`name` is the exact pinned Japanese Label. `sourceModel` intentionally stays the base mesh name; it is not a fabricated variant asset identifier. Every spec inherits base hold and nativeCarry. All base animations are inherited directly except the two Splattershot fixed tank surfaces, FRZ-N barrel, Jr. badge and Glitterz charm, which call base animation first and synchronize their additional fixed-color part to the existing `can` transform. Base geometry coordinates, normals and oriented triangles are conserved. Seven source-backed variants repartition selected faces from ink to fixed shading; native channels and pivots remain available for animation, with an empty geometry when all their faces transfer. The shooter/blaster family modules have no direct `MODELS[ch.weaponModel]` callback lookup.

Registry integration should resolve visual source-row aliases to `baseId` for family/behavior/hold/native carry; retain source-row as visual cache key. Keep main weapon stats, network kit IDs and catalogues on their original base identity. Variant selection must be explicitly visual-only until actual gameplay kits are separately requested.

## What is actually implemented

All colors below are authored approximations supported by each linked appearance description, not sampled original texture values. Each spec's `sourceUrl` supplies its exact appearance article.

- Neo Sploosh / Neo Splash: silver fixed trim replacing bronze; brand decals remain pending.
- Splash GCK-O: brown fixed trim and an added top lamp; precise lamp placement and logo remain pending.
- Aerospray RG: gold fixed metal; black hose / ink preserved.
- Colorz Aerospray: blue-purple fixed metal and an attached red/green/blue ring; true holographic response and engraved logo remain pending.
- Custom Jr.: additive two-tone orange pointed badge with eyes, following the original pulsing ink body. Badge contour/placement is approximate.
- Tentatek: pink fixed tank following the original tank channel and pink upper straps; embossed logo/wordmark pending. The original tank faces transfer to one fixed-color channel; no duplicate cover remains.
- Glamorz: silver body accents, pale holographic-color approximation and three colored muzzle sticks; view-dependent holography and branding pending.
- .52 / .96 Deco: raised alternating pink/white rhinestone arrow rows on the barrel. Full stock/jug decoration and exact surface fit remain pending.
- Clawz .96: tan/dark spotted fixed shell, preserving team ink; exact spot distribution, details and decoration remain pending.
- N-ZAP89: orange body/barrel/grip and black trigger treatment.
- Forge Pro: dark frame and orange fixed nozzle details. Some precise white/orange partitions and branding remain pending.
- Pro FRZ-N: sea-green/tan/orange finish, source-backed chrome fixed barrel, chrome-colored hose and a procedural coral fabric tag. Barrel ownership now follows the original-game fixed color. Exact logo, hose metal response and fabric contour/placement remain pending.
- Custom Jet: yellow fixed nozzle, transferring its exact faces from the base ink channel. Unrelated white labels stay white, as confirmed against the pinned icon. Custom logo pending.
- Jet COB-R: tan/dark fixed finish with a coarse vertex-based scale pattern. Exact scale density and branding pending.
- Annaki Nova: raspberry accents. Team-colored logo pending; original muzzle/hold untouched.
- L3D / H3D: lighter blue/white fixed frames. Dolphin decal pending.
- Glitterz L3: green fixed barrel/reel, pale-green frame and magenta-tinted fixed hose. Added gray squid-shaped toy with a display, three colored buttons and a tether, following native reel motion. Actual translucent resin/glitter, exact toy contour and print remain pending; no new transparency shader is invented.
- H3 VIP-R (source Japanese SNAK): green fixed frame/hose and approximate scale pattern. Jagged underside fitting, strap and decal pending.
- Foil Squeezer: dark wood grip, gold neck trim and alternating green/white bottle panels on the animated fixed-color channel. Precise foil logo and band spacing pending.
- Custom Blaster: white fixed wire treatment; exact twin stickers pending.
- Gleamz Blaster: dark hardware, blue-purple flames, a triangle-exact fixed blue-purple partition of the rear tank and a tricolor ring. Exact print/branding and fluorescent response pending.
- Luna Neo: black fixed shell/front antenna and white trigger/print, rear antenna now fixed white through a triangle-exact partition. The front shell remains team ink. Exact print pending.
- Custom Range: an approximate plain sticker panel only. Exact Custom logo and surface placement are NOT complete; do not call this finished retail reproduction.
- Clash Neo: dark red fixed frame, original ink crayons retained; branding pending.
- Rapid Deco / Rapid Pro Deco: blue fixed trim; Pro has approximate plain sticker panels. Exact Deco graphics pending.
- Rapid Pro WNT-R: tan/silver/gray fixed finish and approximate camouflage; triangle-exact orange fixed windows/drum and a procedural seaweed tag beneath the loop. Exact fabric contour and color partitions/branding pending.
- S-BLAST91: white rear / light-gray front / purple muzzle and button finish; base black parts retained.

## Validation and limits

Run `node --experimental-vm-modules patches/splatoon3/tests/shooter-blaster-variants.test.mjs`.
In this private sparse folder, unchanged dependencies are resolved read-only from sibling `inkwave-gameplay-unowned-private`; an integrated repository resolves itself. Override `INKWAVE_VARIANT_BASE` only to point to an actual unchanged source tree. No cloned checkout, full build or public write is required.

Six focused tests cover31 IDs: source mapping, finite indexed geometry and bounded triangle counts, every existing position/normal/material-class/topology prefix, unchanged ink buffers outside seven explicitly tested source-backed partitions, part material/pivot ownership, muzzle and grip equality, inherited hold/carry, existing and subsequent base isolation, and base channel animation equality at30/60/120Hz. Partition tests compare the exact oriented triangle/normal multiset before and after, rejecting lost or duplicated faces, and validate fixed colors/material classes. Luna's front shell is proved to remain ink while only its separate rear sphere transfers. Existing and later-built base models are unchanged.

These are actual procedural-geometry/animation component checks. They are NOT browser pixels, actual Actor integration, emitted build verification, match play, original-game hardware measurement, exact logo/text reproduction or final visual acceptance. Parent preview and multiview/two-team/near-far tests remain necessary. Color-only changes do not prove gameplay parity. No firing, movement, damage, paint, kit or balance values change.


## Follow-up reference and validation checkpoint

All31 original128px icons were independently downloaded through the pinned Leanny GitHub contents listing and inspected as pixels. Every download's Git blob SHA1 matches that listing; the new icon evidence JSON records URLs, SHA1/SHA256 and dimensions. Original PNGs and the private contact sheet are deliberately excluded from the patch. The images corrected N-ZAP89 receiver/rib coloring, preserved the Clawz black stock and located the WNT-R tag beneath its loop. Small icons support broad partitions/colors, not precise shape or texture measurement.

The original over-skin implementation has been superseded by explicit face partitions for Tentatek, Glamorz, Pro FRZ-N, Custom Jet, Luna Neo, Gleamz and WNT-R. No shared materials or base model geometry are changed. Remaining procedural decals, patterns, material response and accessory placement still need final multiview/two-team/near-far acceptance. Custom Range's plain sticker and exact logos remain unfinished; this checkpoint is not a claim that all31 are finished reproductions.
