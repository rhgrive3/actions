# Shared weapon / InkVolume cache-bound audit

Read-only audit; source SHA and numeric/hash receipts are in `cache-bound-audit.json`. No browser, GPU, test suite, model builder, application or harness edit was performed. Registry counts came from lightweight initialization of 29 emitted modules (no model build functions invoked); the emitted registry's build-input hash matches the current source. Catalogue/kit counts came from pure data imports.

## Weapon geometry: finite normal-game keys, intentional page-lifetime sharing

- `inkwave-public/src/game/character-weapons.js:632,846` owns a module-level `_cache` keyed by `kind`; `patches/splatoon3/adapter.mjs:1501` changes that entry to first call `weaponModelKey(kind)`. A cache miss builds one static definition and its finite named parts; no palette, projectile radius, distance, actor identity or per-match generation is in this key.
- `patches/splatoon3/runtime/weapon-models/registry.mjs:73–127` populates its model/variant maps from fixed imported tables at module initialization; it exports no dynamic model-registration mutator. There are **65 base models + 95 appearance variants = 160 unique registered model keys**. The initial native config has eight definitions; one extra key, `charger_scope`, is outside that union. Together these give **161 possible normal-game model-definition keys**, not 161 geometries (each definition owns multiple finite part geometries).
- `patches/splatoon3/runtime/main-weapon-catalog.mjs:228` installs the fixed 65 main records (seven legacy); `runtime/alternate-weapon-kits.mjs:6` installs 95 fixed alternate kits. Unimplemented appearance choices share a base, while registered appearances select their fixed row key.
- The production `Character.setWeapon` connection (`patches/splatoon3/weapon-catalog-adapter.mjs:47–61`) resolves a valid weapon or native HOLD family, falls back to shooter for unknown input, and selects `weaponAppearanceKey`. `runtime/weapon-models/registry.mjs:140–155` validates variant-to-base membership. `runtime/weapon-appearance.mjs:20–30` validates saved local preferences; arbitrary stored strings do not create geometry keys. The direct network caller (`runtime/brella-network.mjs:97`) is gated by `rowIsBrella` / `read` at lines10,23, requiring an existing WEAPONS entry of the Brella family.
- `inkwave-public/src/game/character-lod.js:62,296` caches far geometry in a **WeakMap by source geometry**, with at most one retained far result per source; `target`, scale and palette are not new map keys. `character.js:699` instances shared definitions; `character.js:1133–1137` disposes owned per-character materials/skeleton, intentionally keeping shared geometry. `registry.mjs:184–202` holds per-base HOLD overlays in an outer WeakMap and inner fixed-weapon-key Map.
- Ink materials have a separate hex-keyed map (`character-mats.js:1653–1661`), not geometry. Normal source palettes are five two-color palettes plus the two colorblind colors (**12 colors**); network palette selection accepts an index into that fixed table. Arbitrary color API callers could expand that material map, but continuous colors do not create weapon geometry definitions.

**Boundary:** exported `getWeaponDef` is not intrinsically an LRU or validation boundary: a direct/debug call with a fresh unknown string can build the fallback shooter under that string. The finite-key statement is about the inspected normal-game callers, not arbitrary developer console code or future registration changes. No normal per-match continuous-key route was found.

## InkVolumes: two boot assets with fixed frame/LOD allocations

- `patches/local-quality/ink-volume/pack.mjs:3–6` declares just `roller` and `shooter`. `ink-volume-adapter.mjs:9–25` registers these in FX construction; production call-site search found no per-match/per-projectile registration caller. Optional `INKWAVE_INK_VOLUME_URL(S)` and public `registerInkVolume` are explicit external/debug asset-registration extensions.
- The exact bundled manifests contain:

| Pack | Patterns | Animation frames | Frame/LOD batches | Geometry containers |
|---|---:|---:|---:|---:|
| roller | 2 | 32 | 64 | 128 |
| shooter | 2 | 2 | 4 | 8 |
| total | 4 | 34 | 68 | 136 |

Each pattern creates one texture and two materials, giving **4 textures and 8 materials** for the defaults. Each frame/LOD creates opaque and fringe geometry containers that share the vertex/index attributes, plus shared instance attributes between its two meshes (`ink-volume/runtime.mjs:79–104`). Thus 136 containers is not 136 separate copies of every buffer. The original decoded packs are 45,303,672 and 253,844 bytes; registration copies only retained attributes instead of pinning the complete packed source buffer.

- All those geometry containers are created in `InkVolumes.register` (`runtime.mjs:57–117`), never in `begin`, `submitComposite` or `end`. `assets` is keyed by registered asset **name**, not weapon color, size, palette, projectile age or position. `submitComposite` (`runtime.mjs:140–174`) selects an existing pattern/frame/LOD and writes scale/color to instances. The per-projectile direction bindings are WeakMaps (`runtime.mjs:50,143`; `recipes.mjs:10,31`). Projectile-specific asset-name candidates (`recipes.mjs:25`) only perform `assets.has/get` and fall back to default packs; they do not register new names.
- Match reset `clear` (`runtime.mjs:183`) resets bindings and active counts, keeping default shared assets. `unregister` / `dispose` (`runtime.mjs:184–192`) remove meshes and dispose their owned buffers/geometries/materials/textures. Capacity is explicitly bounded 1–1024; default gameplay requests at most128 instances per batch (`ink-volume-adapter.mjs:24`).

**Boundary:** `InkVolumes.register` permits fresh arbitrary names and `assets` has no global name-count cap. The explicit override/debug API can therefore expand it if a caller continually registers new assets. That is distinct from normal gameplay, whose registration set is exactly the two fixed boot packs. Duplicate names are rejected. No palette/size-driven continuous registration path was found.

## Interpreting the observed growth

The reported weapon44→179 and InkVolume21→35 counts are not direct counts of cache-key creation. `renderer.info.memory.geometries` increments on first geometry use/upload by Three, and the supplemental inventory records first `renderBufferDirect` use. Both can grow as already-created geometry/frames become used, independently of CPU creation. They do not alone prove live cache expansion or an unbounded leak.

The source establishes finite normal-game keys and default InkVolume allocations, but **does not prove full-catalogue GPU-residency or process-memory plateau**. Eighteen-cycle normal-RAF observations remain useful for checking whether same-stage post-GC resource/PSS growth slows and for discovering unaccounted owners. A large finite cache can still be costly on iPad; this audit makes no physical-device memory/FPS claim and proposes no speculative cache eviction.
