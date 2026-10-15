# INKWAVE projectile VFX source audit — 2026-10-11

Splatoon 3 comparison target: **Ver. 11.3.0**, fixed Leanny commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6`. Scope: ShooterNormal shot, RollerNormal wide/vertical flick, SlosherStrong front four/rear five projectile presentation. This adds research evidence only; no renderer, damage, paint, physics or network code changes.

The original projectile effect files, emitter-set identities, meshes, textures and runtime dispatch remain **unverified**. Public parser source supplies a concrete extraction path and explains why a viewer can omit real geometry. It does not supply those stock assets or establish an exact S3 projectile equation.

## Fixed primary sources

| Source | Verified commit | What was read |
|---|---|---|
| [HoianViewer](https://github.com/nvnprogram/HoianViewer/tree/89f23684b9dede5da8207e5f9f1980150bec774a) | `89f23684b9dede5da8207e5f9f1980150bec774a` (2026-09-29) | Six requested loader/emitter/stripe/playback files, primitive/layout/renderer/simulation companions, README and project file |
| [EffectLibrary](https://github.com/KillzXGaming/EffectLibrary/tree/d5491138d645221ec92189eeff3ded8c43fd0a1a) | `d5491138d645221ec92189eeff3ded8c43fd0a1a` (2024-12-08) | EFT2 parser, emitter definitions, README, MIT license; complete tree |
| [Awesome-Splatoon3-Hacking](https://github.com/DesperC/Awesome-Splatoon3-Hacking/tree/07b2888c04cc383a54b27b05edb62051868ebe03) | `07b2888c04cc383a54b27b05edb62051868ebe03` (2025-05-29) | README, CC0 license; complete two-file tree |
| [Blitz_MasterVer22-Decomp](https://github.com/YoshiCrystal9/Blitz_MasterVer22-Decomp/tree/6e6f8ebb1a3d8ebac518ba47b881ec5d3740baac) | `6e6f8ebb1a3d8ebac518ba47b881ec5d3740baac` (2023-09-13) | S2 README, Bullet/BulletSimple bodies, full symbol CSV; complete tree |
| [Leanny 11.3.0 weapon parameters](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon) | `7280ff9cde8bb1c5dcef46c700c326471584d2e6` | ShooterNormal, SpinnerStandard; separate 1.0.0 MissionLv3 example |

All 28 source file URLs, Git blob SHAs and line anchors are recorded in `patches/splatoon3/reference/projectile-vfx-evidence.json`. “Source code verified” means the public implementation was read. The viewer author's claims of matching the S3 runtime have not been independently confirmed against S3 execution/captures in this audit.

## Correction to the supplied reference pack

The pack says mission `DiffusionTailLengthParam` is a different type from `spl__BulletShooterTailLengthParam`. **The primary JSON contradicts that type claim.** [WeaponShooterMissionLv3, data/parameter/100, L30–38](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/100/weapon/WeaponShooterMissionLv3.game__GameParameterTable.json#L30) declares:

| Field | Verified value |
|---|---|
| Parameter slot | `GameParameters.DiffusionTailLengthParam` |
| Declared `$type` | `spl__BulletShooterTailLengthParam` |
| `MaxLengthFrame` | `10` |
| Applicable example | MissionLv3, data version 100 (1.0.0) |

Do not copy ten frames into ordinary 11.3.0 ShooterNormal because of the **different slot, weapon/mode and old version, plus absent runtime/default evidence**. An incompatible type is not the reason. The ordinary shooter default remains unresolved.

## Loader, emitter and geometry facts

[Esetb.cs L9–59](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Core/Formats/Esetb.cs#L9) decompresses the input before BYML parsing. `Esets` gives stored emitter-set names/order; `PtclBin` is the aligned binary containing VFXB. Missing PtclBin is rejected.

[VfxFile.cs L13–86](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/Library/EffectLibrary/VfxFile.cs#L13) checks VFXB magic and accepts **version 46 only**. Typed resources separate ESTA emitter sets, GRTF textures, G3PR particle BFRES meshes, PRMA native primitives and GRSN shaders. This identifies where to inspect actual data; no stock VFX binary was opened here.

[Emitter.cs L53–185](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/Library/EffectLibrary/Emitter.cs#L53) exposes hierarchy, Life/InfiniteLife, calculation/follow/billboard/volume types, three primitive IDs, shader variants/compute index, CustomAction, render state, six texture samplers and animation subsections. A texture can live in another binary; unresolved lookup does not prove that no texture is used.

[PrimitiveArchive.cs L11–26, L108–158, L184–204](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/Library/EffectLibrary/PrimitiveArchive.cs#L11) distinguishes these resources:

| Resource | Meaning in the implementation |
|---|---|
| G3PR + G3NT | Embedded BFRES; GUID maps to model index and six particle input attribute indices |
| PRMA + PRIM | Native primitive; float4 attribute arrays and u32 indices |
| `ShapePrimitiveId` | Emission-volume/shape primitive |
| `ParticlePrimitiveId` | Visible particle mesh; [EffectRenderer.Mesh L566–576](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Effects/Gl/EffectRenderer.cs#L566) explicitly uses it |
| `ParticlePrimitiveExId` | Additional exposed ID; target role needs consumer inspection |

Emission-volume geometry and visible-particle geometry are separate. A visible effect can also use a shader-generated strip or quad. A numerical drawing radius alone does not select the topology.

[EmitterDef.cs L244–255](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Effects/Sim/EmitterDef.cs#L244) reads start/frame range, rate/random rate and interval/random interval. “Emit count” is not one universal constant: volume type, animation and initialization can change rate interpretation.

[EmitterLayout.cs L17–28](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/Library/EffectLibrary/EmitterLayout.cs#L17) labels field meanings `Verified`, `Likely` or `Guess`. Likely is older-library naming; Guess is unestablished meaning. Preserve confidence alongside raw offsets/bytes instead of promoting every name to confirmed game semantics.

## History stripes and viewer gaps

[HistoryStripes.cs L8–49, L95–192](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Effects/Sim/HistoryStripes.cs#L8) implements **EP02 history stripes**: per-particle position/direction/up-axis history, local/world handling through FollowEmitter, and optional Hermite subdivision. Draw points use 12 floats each and two vertices per point; fewer than three points produce no stripe.

[L246–273, L319–481](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Effects/Sim/HistoryStripes.cs#L246) retain stripes after particle death and shrink history using frame-boundary-aware handling. This is inspected implementation, not an invented INKWAVE equation. No evidence assigns EP02 to the target weapons.

[EmitterInstance.cs L194–197](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Effects/Sim/EmitterInstance.cs#L194) allocates HistoryStripes only for `CalcType.Cpu`; an EP02 tag alone does not establish GPU stripe simulation. [SimDrawInputs.cs L58–98](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Effects/Sim/SimDrawInputs.cs#L58) packs point storage/plugin blocks; [EffectRenderer.cs L495–554](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Effects/Gl/EffectRenderer.cs#L495) draws triangle strips and optionally a crossed strip.

[EffectFile.cs L13–25, L107–117](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Effects/Viewer/EffectFile.cs#L13) defines:

| Condition | Gap flag | Limit |
|---|---|---|
| GPU compute emitter | CpuFallback | CPU substitutes for compute execution |
| FCSF custom field | CustomField | Custom-field fidelity unresolved |
| EP01 or EP03 | Stripes | Connection/super stripes are not simulated or drawn |
| EP02 alone | No unsupported-Stripes flag | CPU implementation exists; target identity/GPU path still require inspection |

A missing roller liquid sheet or slosher connector in HoianViewer can therefore be a **viewer gap**. It cannot establish that S3 uses disconnected droplets.

[EffectPlayback.cs L10–39](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Effects/Viewer/EffectPlayback.cs#L10) advances whole frames at 60 Hz, seed 0; frame `f` is after `f+1` calculations. Seeking restores snapshots or replays. [L334–351](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Effects/Viewer/EffectPlayback.cs#L334) caps wall-time catch-up at four steps and drops excess accumulated time. Use `Seek(frame)` for deterministic frame exports. [Program.cs L63–68](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/Program.cs#L63) supports `--open` and `--set`; neither establishes target set identity.

## Shooter default versus splatling three frames

| Source | Raw fact | Permitted conclusion |
|---|---|---|
| [ShooterNormal 11.3.0](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json) | `spl__BulletShooterTailLengthParam.MaxLengthFrame` absent | Runtime default unknown; absence is not zero/three/ten |
| [SpinnerStandard 11.3.0 L110–113](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpinnerStandard.game__GameParameterTable.json#L110) | Explicit `MaxLengthFrame=3` | Splatling-specific value |
| [MissionLv3 1.0.0 L30–38](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/100/weapon/WeaponShooterMissionLv3.game__GameParameterTable.json#L30) | Different slot, same declared type, explicit 10 | Different mission/version example, not shooter default proof |

An 11.3.0 constructor/default table or runtime initialization trace is needed to resolve ShooterNormal's omission. Another weapon's explicit value does not supply that evidence.

## Public sources and original-asset availability

[EffectLibrary EFT2/PtclFile.cs L10–25, L138–158](https://github.com/KillzXGaming/EffectLibrary/blob/d5491138d645221ec92189eeff3ded8c43fd0a1a/EffectLibrary/FileData/EFT2/PtclFile.cs#L10) exposes emitters, textures, shaders, BFRES/native primitives and familiar section tags. Its version-dependent emitter structs provide useful format context. They do not prove S3 BYML-wrapper support or exact v46 runtime dispatch/shader reproduction. Hoian has the S3-specific wrapper and explicit v46 check.

EffectLibrary's [MIT license](https://github.com/KillzXGaming/EffectLibrary/blob/d5491138d645221ec92189eeff3ded8c43fd0a1a/LICENSE) applies to library code. Its complete pinned tree has no .ptcl/.esetb/.vfx/.byml/.bfres/.bntx/.bfsha/.zs asset files.

[Awesome-Splatoon3-Hacking L65–78](https://github.com/DesperC/Awesome-Splatoon3-Hacking/blob/07b2888c04cc383a54b27b05edb62051868ebe03/README.md#L65) assumes/acquires RomFS; [L128–139](https://github.com/DesperC/Awesome-Splatoon3-Hacking/blob/07b2888c04cc383a54b27b05edb62051868ebe03/README.md#L128) describes compressed/model formats; [L421–426](https://github.com/DesperC/Awesome-Splatoon3-Hacking/blob/07b2888c04cc383a54b27b05edb62051868ebe03/README.md#L421) covers weapon model files. The pinned tree contains **only README.md and LICENSE**. Its CC0 guide license and external mod links do not establish licensed stock projectile assets.

No reusable licensed stock S3 projectile VFX/geometry package was identified in the inspected sources. This conclusion is bounded to the inspected sources, not global asset absence.

## Drive provenance and integrity

`reference-input/SOURCE_INFO.txt` identifies public GitHub snapshots at the same Hoian/Leanny/Awesome commits and explicitly excludes **Git histories, external downloads and Splatoon 3 RomFS**. It requires a separately obtained legitimate RomFS. That manifest establishes the bundle-wide exclusion; it is not inferred from sample absence.

Root's archive 01 inventory has 1,716 entries, including 1,252 S3-source entries, and no esetb/vfx/ptcl assets. Root inspected archive 19; unrelated images were not used. Other 17 archives are not represented as individually inspected.

The six requested Drive code files were independently hashed using Git's blob convention and exactly match the retrieved pinned public source:

| File | Git blob SHA | Match |
|---|---|---|
| Esetb.cs | `7f92e5d4a649baba22602d434cbc0e9f5d52cd6c` | Exact |
| VfxFile.cs | `c19d8547489b0daf60bc22a1ee2bd018c0831792` | Exact |
| Emitter.cs | `171c190e5ce483c01f8b9a727a201d13fa212234` | Exact |
| HistoryStripes.cs | `c884057f96017b60be35972ef73e75ba5fd79ec9` | Exact |
| EffectFile.cs | `ae733f5f46af31d7d11f88a5b6e828c81d5c0919` | Exact |
| EffectPlayback.cs | `5e3ff3687e47e6c920d34e2b712b5d05353b19bd` | Exact |

The reference-v3 ZIP contains research documents/JSON/scripts and an uncompiled exporter, with no original effect/model/texture/shader binary. Hoian's [README L38–44](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/README.md#L38) requires separate RomFS resources. Its complete 1,477-entry tree has no identified stock projectile asset; a generic Cafe-Shader-Studio Texture.zip is not identified S3 projectile data.

## S2 CSV: verification completed, equation unresolved

The [S2 README](https://github.com/YoshiCrystal9/Blitz_MasterVer22-Decomp/blob/6e6f8ebb1a3d8ebac518ba47b881ec5d3740baac/README.md#L1) targets Splatoon 2 3.1.0. [GameBullet.cpp](https://github.com/YoshiCrystal9/Blitz_MasterVer22-Decomp/blob/6e6f8ebb1a3d8ebac518ba47b881ec5d3740baac/src/Game/Bullet/GameBullet.cpp) is an empty namespace; [GameBulletSimple.cpp](https://github.com/YoshiCrystal9/Blitz_MasterVer22-Decomp/blob/6e6f8ebb1a3d8ebac518ba47b881ec5d3740baac/src/Game/Bullet/GameBulletSimple.cpp) has an empty reset body.

This audit fetched the **entire** [blitz_functions.csv](https://github.com/YoshiCrystal9/Blitz_MasterVer22-Decomp/blob/6e6f8ebb1a3d8ebac518ba47b881ec5d3740baac/data/blitz_functions.csv), parsed 149,530 records, and verified blob SHA `eceb80fb1855a99bb8781b712eaef8d56d62ecd6`. Size 13,347,889 bytes; SHA256 `2e62abbc48fc9a4efb7c37fe33589d09eaa3348b13d5088d885d0c6380e4b81a`.

| CSV line | Demangled symbol | Address | Size field | Quality |
|---|---|---|---|---|
| 19053 | `Game::BulletEffectMgr::shotShooter(Game::BulletShooterBase*)` | `0x0000007100343920` | 100 | U |
| 19056 | `Game::BulletEffectMgr::shotRollerSplash(Game::BulletRollerSplash*)` | `0x0000007100343a4c` | 100 | U |
| 19057 | `Game::BulletEffectMgr::shotRollerJumpSplash(Game::BulletRollerSplash*)` | `0x0000007100343ab0` | 100 | U |
| 19061 | `Game::BulletEffectMgr::shotSlosher(Game::BulletSlosherBase*)` | `0x0000007100343c40` | 100 | U |
| 20194 | `Game::BulletShooterBase::updateTailPos()` | `0x0000007100387f80` | 272 | U |
| 21942 | `Game::BulletUmbrellaShotBase::updateTailPos()` | `0x00000071003ec8f0` | 340 | U |

These are symbol records, not bodies. They establish S2 function existence and separate named dispatch entry points. They do not recover updateTailPos, derive an S3 equation or prove roller/slosher connection topology. Quality U is recorded literally, without inferring its meaning.

## Concrete extraction and implementation boundaries

1. With an already authorized legitimate 11.3.0 RomFS, inventory all Effect files, relative path/hash/version and every Esets/ESTA name. Filename keywords remain candidates.
2. Export full parent/child identity and field confidence; Life, CalcType, FollowType, emission rate/interval, primitive resolution, texture slots/cross-binary flags, shader variants/compute index, CustomAction, render state, animation tracks and all subsections.
3. Include **EP02 as well as EP01/EP03/FCSF**. Resolve BFRES/native PRIM separately. Write 64-bit GUIDs as hexadecimal strings to avoid JavaScript's 53-bit numeric rounding.
4. Obtain game-to-effect dispatch/callback evidence. Keep shooter, roller wide, roller vertical and slosher 4+5 separate. Shared shader/primitive IDs do not prove the same geometry/lifecycle.
5. Compare source/INKWAVE fixed 60 Hz, fixed seed and matched camera frames: silhouette width/length/area, connected surfaces, curvature, opacity, separation and birth/end time. Parser determinism and INKWAVE-only checks are not original-game visual evidence.
6. Without actual resources/dispatch, retain **unverified original shape**. A procedural reconstruction remains class F until independently supported by actual assets/runtime or source-game measurements.

The supplied HoianEffectManifest.cs omits EP02, hierarchy identity, rate/interval, field confidence and resolution results. It remains uncompiled here: dotnet is not installed, while [PlayerViewer.csproj L5](https://github.com/nvnprogram/HoianViewer/blob/89f23684b9dede5da8207e5f9f1980150bec774a/PlayerViewer/PlayerViewer.csproj#L5) targets net10.0. No stock asset bytes are added to the repository.

Validation: 28 primary-source entries; six Drive code hashes match pinned blobs; full S2 CSV blob verified; ShooterNormal absence, Splatling 3 and MissionLv3 same-type/different-slot 10 directly inspected. Remaining blockers: actual S3 effect/dispatch identities, ordinary-shooter runtime default, original mesh/material/connection topology, and matched original gameplay captures.

