# Ranged and defense alternate weapon finishes

## Scope and reference

Splatoon 3 11.3.0 canonical identities are taken from the pinned WeaponInfoMain source URL and SHA-256 in `weapon-variants-ranged-defense-1130.json`. That inventory enumerates all 38 alternate rows in these five families, with explicit base IDs and source array indices. Only 36 currently supported variants are exported by `variants-ranged-defense.mjs`; the other 2 are explicitly deferred, not mislabeled base models or invented IDs.

This is a first visual finish pass on the current base builders. It is not a retail-model parity claim. The original base builders remain unchanged. Variant-only finishes preserve existing positions and animation; verified ink-ownership differences repartition complete original triangles. Heavy Deco adds 24 octahedral rhinestones (192 triangles), within the existing 16,000-triangle ceiling. No behavior, muzzle, grip, lamp or charge channel is changed. No unmerged geometry from PRs 1294, 1235 or 1245 is incorporated. Original family modules and registry are unchanged.

## Evidence inspected

Existing `reports/inkwave-weapon-model-workspace/alt-kits.json` identifies which checked-in turntable sheets are alternate versions. Their media URLs are recorded in `rot-variants.json`. These image pixels were inspected:

- `s3-charger-normalscope.rot.jpg`: Z+F red furniture, purple shell, cyan caps; applied also to the corresponding unscoped variant.
- `s3-charger-longscope.rot.jpg`: Custom red furniture and unchanged silver reservoir; applied also to the unscoped equivalent.
- `s3-charger-light.rot.jpg`: Mk II blue label on green bamboo. Current label patch is approximate.
- `s3-charger-keeper.rot.jpg`: Custom blue bulb with orange grip and pale hose retained.
- `s3-spinner-quick.rot.jpg`: Zink dark-blue frame and white/silver straps/front plate. Team-colored tank is untouched.
- `s3-spinner-downpour.rot.jpg`: Nouveau red rear cap, unchanged white foregrip and transparent sleeve treatment.
- `s3-spinner-serein.rot.jpg`: Nautilus79 darker shell metal and gold trim. Existing geometry remains unchanged, including unresolved base-shape issues.
- `s3-maneuver-gallon.rot.jpg`: Deco yellow body. Blue graphics are not reproduced exactly.
- `s3-maneuver-dual.rot.jpg`: Custom yellow badge on unchanged red shell. Current badge patch is approximate.
- `s3-shelter-compact.rot.jpg`: Patternz canopy; implementation deliberately deferred after identifying ink-dependent stripes rather than treating pictured green/purple as fixed paint.

Additional appearance descriptions checked on Inkipedia:

- https://splatoonwiki.org/wiki/New_Squiffer : green bottle and red/yellow label. Its thinner rectangular bottle shape is NOT reproduced by this finish-only pass.
- https://splatoonwiki.org/wiki/Dapple_Dualies_Nouveau : dark-blue frame. Nouveau sticker is not reproduced exactly.
- https://splatoonwiki.org/wiki/Light_Tetra_Dualies : white body and scarlet highlights.
- https://splatoonwiki.org/wiki/Enperry_Splat_Dualies : black/gold with white accents.
- https://splatoonwiki.org/wiki/Recycled_Brella_24_Mk_II : caramel body and purple cap. Canopy coat of arms remains missing.
- https://splatoonwiki.org/wiki/Tenta_Sorella_Brella : S3 support beams yellow instead of red.
- https://splatoonwiki.org/wiki/Custom_Wellstring_V : dark grip. Full-color Custom logo remains missing; the base model's grip was green rather than source light blue, so selection is spatially limited to the grip.
- https://splatoonwiki.org/wiki/REEF-LUX_450_Deco : black outer nozzles and strings; this pass changes fixed outer nozzle hardware only. Strings remain owned by the existing team-ink channel, and yellow arrow stickers remain missing.
- https://splatoonwiki.org/wiki/Custom_Hydra_Splatling : light-blue feed hose rather than yellow. Custom logo remains missing.
- https://splatoonwiki.org/wiki/Heavy_Edit_Splatling_Nouveau : ammo box becomes opaque metallic team ink. Implemented by transferring the exact grey ammo-box triangles to the native ink channel. Opaque metallic sheen and the sticker remain missing.

Exact RGB values are artist approximations to observed palette roles, not sampled retail material constants. Small patches use existing vertex colors and therefore cannot reproduce crisp retail lettering or decals. Do not describe them as exact logo recreations.

## Integration contract

`VARIANT_MODELS` is keyed by exact source row (for example `Charger_Normal_01`), and each record includes `baseId`, `sourceRow`, `name`, `sourceUrl`, and inherited base hold/nativeCarry/animate fields. `build(freshFamilyDef)` calls the unchanged base builder first, then changes only body-owned color attributes. Do not pass a cached definition into a builder.

The parent registry must keep gameplay/base identity separate from visual identity. In particular Stringer FAMILY_POSE checks its base MODELS directly; charger sight selection also keys on the base weapon ID. Route base identity into those family layers. Do not silently select base sub/special as if canonical alternate kit gameplay had been implemented; the source rows here identify appearances, not installed loadouts.

## Verification

`node --experimental-vm-modules --test patches/splatoon3/tests/weapon-variants-ranged-defense.test.mjs`

Checks every exported variant against a separately rebuilt base: pinned ID/base mapping, visible color difference, deterministic results, base isolation, exact index arrays and all non-color geometry attributes, preserved team ink and glow, all part names/pivots/material roles, hold and animation function identity, finite values and identical muzzle. Triangle-conservation tests cover Heavy Edit, Twinklez, MIL-K and Undercover Sorella. Heavy Deco adds 192 triangles and stays within the existing 16,000-triangle budget. Undercover Sorella adds one animated canopyInk part; the existing canopy animation already drives that channel. Other variants add no geometry or part channels. Existing unrelated geometry budget violations are not relaxed or repaired here.

Browser/render comparison and real gameplay / retail capture comparison are not yet performed. Byte-identical geometry and rig channels establish noninterference, not visual or timing parity. Full logos, shape-specific variants, team-dependent alternate partitions and the remaining 2 inventoried rows remain pending reference-backed work.

## Second reference-backed pass

The GitHub connector's supported base64 file read independently retrieved all 38 pinned `images/weapon/Wst_<sourceRow>.png` icons from Leanny/splat3 commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`. Every image was inspected. Each inventory entry now records the exact verified source-art URL, Git blob SHA and byte size. These 128px primary-game icons establish broad palettes and visible details; they do not establish measured geometry, hidden sides, shader constants or exact decal masks. The original CDN video fetch was cancelled and was not retried.

Newly implemented, taking the total from 20 to 36:

- Snipewriter 5B: source blue furniture becomes dark red.
- Heavy Edit Nouveau: only original grey ammo-box faces move into native team ink. Existing ink faces survive. Current native gloss lacks the source metallic sheen.
- Twinklez Splat Dualies: pink frame and pale-grey trim. Existing tank faces move out of ink into silver fixed material; nozzle ink stays dynamic. The new badge/accessory shape is not reconstructed.
- Splat Charger CAM-O and Splatterscope CAM-O: olive/grey finishes. Kelp attachment and detailed camouflage remain missing.
- Custom Douser Dualies FF: yellow nozzles/canisters replace red.
- Dapple NOC-T: brown frame, orange toothbrush accents and pale-grey braces. Night-vision scope additions remain missing.
- Hoofz Dualie Squelchers: pale-blue inside and a procedural black/white outside treatment. Exact zebra print and right-only six-spike nozzle ring remain missing; the shared single-pistol renderer cannot express distinct left/right accessories yet.
- Mini RTL-R: olive frame, beige rims, rusty orange nozzles. Snake texture and new fittings remain missing.
- Torrentz Hydra: cyan reservoir, red cage accents and dark barrels. Large illustrated tank sticker remains missing.
- Tenta CRE-M: cream/grey fixed panels and muted braces; original team-ink panels remain owned by team ink. Exact printed markings are missing.
- Inkline Tri-Stringer: tan limbs and olive fittings.
- Bulbz Tri-Stringer: pink limbs. Actual lightbulb accessories remain missing.
- REEF-LUX MIL-K: cream fixed surfaces and red cables; both animated string halves move from ink to fixed red while preserving the exact animation/pivots. Actual third-kit shape and surface differences are not claimed.
- Undercover Sorella: lighter wood handle, team-colored shaft, coarse black/grey checks and team-colored central check lines. Complete existing cloth triangles are repartitioned to canopyInk and driven by the existing canopy function. The coarse source mesh limits the print resolution; the exact retail plaid mask is NOT reproduced.
- Heavy Splatling Deco: 24 low-poly white/pink rhinestones on the tank sides; their placement is a procedural approximation to the source rhinestone decoration, not an exact Deco-logo trace.

Still withheld from registration:

- Patternz Undercover Brella: reference lines depend on both team and enemy colors. Native weapon ink has one team-color uniform and ignores vertex color. A frozen sampled palette would be wrong. Needs explicit validated dual-ink pattern support, not a guessed fixed finish.
- Sorella Brella: the updated S3 canopy mask/ownership and fixed yellow tip accents require more precise source separation than the low-resolution icon establishes. Do not register a guessed all-ink canopy.

Six focused tests pass on the final 36-variant module. Final browser/render QA, paired first/third-person captures and actual retail behavior comparison remain pending. These are actual procedural variant definitions with provenance and bounded visual limitations, not claims that all variant accessory geometry has been finished.
