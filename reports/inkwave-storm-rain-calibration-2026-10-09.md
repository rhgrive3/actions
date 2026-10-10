# INKWAVE Ink Storm rain accounting — 2026-10-09

Issue [#226](https://github.com/rhgrive3/actions/issues/226) is calibration research. It does not establish a confirmed overpainting defect. The issue correction retains the INKWAVE 172-call observation but withdraws both the asserted one-to-one comparison with **RainNum=72** and any 72-call acceptance target. This measurement does not infer a Nintendo rain-particle lifecycle or an overpainting factor.

## Pinned reference boundary

- INKWAVE source inputs are bound by the per-file SHA-256 manifest in the JSON. Git HEAD at export was **97ae3fec482fb2291a9fa8c16fb1471ff627a5a6**; source-input working-tree status was **modified**. Git HEAD is provenance context only; sourceSha256 binds the measured working-tree contents and no exact source commit is claimed. Baseline main: **5d0be6b7fdebfd07e696e75497aaa97aa5ff5648**. No public gameplay source, storm runtime, or gameplay value was changed for this tool.
- Splatoon 3 comparison version: Ver. 11.3.0, as recorded by corrected Issue #226. The issue cites Leanny's pinned 11.3.0 extraction (CloudParam.RainNum=72, RainyFrame.Low=480, NoPaintRainNum=0, WithNoPaintRainNum=120) and the community Splatoon3 Wiki's RainNum/time notes. These source values remain reference metadata only: they do not resolve whether RainNum describes emitted particles, reuse, simultaneous management, ground contacts, or paint API calls.
- Links: [corrected Issue #226](https://github.com/rhgrive3/actions/issues/226), [Leanny 11.3.0 extracted table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpInkStorm.game__GameParameterTable.json), [Splatoon3 Wiki — Ink Storm](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%9A%E3%82%B7%E3%83%A3%E3%83%AB%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E3%82%A2%E3%83%A1%E3%83%95%E3%83%A9%E3%82%B7), [Nintendo update history](https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/How-to-Update-Splatoon-3-2266003.html). The interpretation boundary above is inherited from the correction; this task did not repeat the source-lifecycle audit.
- patches/splatoon3/profile.json documents raw coordinates as 1:1 with INKWAVE meters, but marks distanceScale.factor=1 as inferred and says actual character/stage scale must be measured. inkwave-public/src/game/inkFlight.js likewise says its scale of 1 is not verified real-world metres. To keep that project convention separate from a verified physical or Nintendo scale, this report labels measured coordinates as INKWAVE world units (WU) and areas as WU². The mapping to retail Splatoon 3 world/collision units remains unknown, and no conversion is applied.
- The measured production composition retains the already-present adapter behavior in patches/splatoon3/adapter.mjs: its Storm update window runs through the final duration tick, and its 12 WU ray reach remains unchanged. This is why the 'production' scope records 178 candidate rays at every render cadence. The issue's 172 PaintSystem.splat-call observation is reproduced by the 'public-source' scope (unpatched modules, one _updateClouds call per render frame, update window closed 0.3 s before expiry), which records 172, 172, and 171 at 30, 60, and 120 Hz. Both scopes are recorded in the Results table; neither establishes a Nintendo-particle mapping.

## Measurement setup

One local, non-ghost, team-0 cloud runs for 8 simulation seconds from (0, 5, 0) WU above a flat 64 WU × 64 WU paintable plane. There are no actors or gear modifiers. The same seeded random stream is used at each render cadence. The 'production' scope composes the public Projectiles._updateClouds, real Physics.raycast, real PaintSystem CPU grid, real FX.rain drop-pool path, the current adapter, and the 60 Hz FixedClock. The 'public-source' scope uses the same real public modules without the INKWAVE adapter or runtime and without the FixedClock: each render frame calls _updateClouds(1/renderHz) once. Both scopes advance rendering at 30, 60, and 120 Hz. Each event row includes its scope, render frame, simulation tick/time, and cloud time.

The terms are deliberately local to INKWAVE:

- **Candidate ray emission**: one call into INKWAVE's rain raycast path. It is not a Nintendo particle.
- **Ground hit**: a successful return from INKWAVE's composed physics raycast against this fixture plane.
- **Paint write**: one call to the real PaintSystem.splat. Its returned newly claimed area and its CPU grid cell changes are separately recorded.
- **Cosmetic particle emission**: one drop-pool admission through INKWAVE FX.rain → FX._spawnDrop. These are not Nintendo particles; the Storm rain path does not set the FX paint flag.
- **Summed circular brush footprint**: Σπr² in WU² for paint calls. This nominal footprint sum can overlap and is not an area of unique turf.
- **CPU turf union**: unique team-owned cells read from the real PaintSystem.grid after the run. The area is in WU²; the radial/angle distribution is reported in both data files.

## Results

| Scope | Render Hz | Simulation updates | INKWAVE candidate rays | Ray ground hits | Paint writes | Cosmetic FX drop emissions | Sum of nominal πr² (WU²) | Sum newly claimed (WU²) | Final CPU turf cells | Final CPU turf union (WU²) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| production | 30 | 480 | 178 | 178 | 178 | 6384 | 233.134166494 | 170.6875 | 2731 | 170.6875 |
| production | 60 | 480 | 178 | 178 | 178 | 6384 | 233.134166494 | 170.6875 | 2731 | 170.6875 |
| production | 120 | 480 | 178 | 178 | 178 | 6384 | 233.134166494 | 170.6875 | 2731 | 170.6875 |
| public-source | 30 | 240 | 172 | 172 | 172 | 6352 | 223.503576303 | 159.1875 | 2547 | 159.1875 |
| public-source | 60 | 480 | 172 | 172 | 172 | 6335 | 217.792052147 | 156.4375 | 2503 | 156.4375 |
| public-source | 120 | 960 | 171 | 171 | 171 | 6328 | 224.34162211 | 165.375 | 2646 | 165.375 |

The detailed timestamped event ledger, per-write areas, final CPU-grid radial/angle bins, and summary counters are retained in [CSV](./inkwave-storm-rain-calibration-2026-10-09.csv) and [JSON](./inkwave-storm-rain-calibration-2026-10-09.json). Within the 'production' scope, simulation events and CPU turf distribution match across render rates after omitting only the render-frame index. Within the 'public-source' scope they do not: candidate counts are 172, 172, and 171 at 30, 60, and 120 Hz, and the CPU turf differs. That scope's cloud time is accumulated per render frame, so the window check falls on a different update at each cadence. At 30 and 60 Hz the cloud is still listed at the end of the run because accumulated floating-point time stops just below 8 s; the window had already closed, so no further emissions occur.

## Artifact binding

The JSON retains all 6,203 timestamped event records, 1,433 CPU distribution bins, and 156 summary records represented in the CSV. The JSON records the CSV SHA-256; this report records both payload hashes: JSON **76481dd02ee9cc84d9c262ce0fe3957f669bf90d23c38f874395b06aee540fba**, CSV **499cf91436278d235b9fb2e6e8644f2eb0efab06fabcc992c2636ef054c1d7ff**. The input SHA-256 manifest in JSON includes the harness, fixture, focused test, exporter, production modules, and the two unit-convention reference files. The Git commit containing this report and both data artifacts binds the report version.

## Limits and remaining anchors

This is deterministic logic-level accounting with a headless renderer stub. It is not a browser render, GPU readback, Switch measurement, or claim of retail Splatoon 3 equivalence. FX records particle-pool admissions; this harness does not age or collide those cosmetic particles. The ground is a single ideal flat fixture, and turf distribution is the INKWAVE 0.25 WU CPU grid, not a measured Nintendo turf map. The results establish separations and reproducibility in the checked-in INKWAVE path only.

Remaining hardware anchors are a controlled Ver. 11.3.0 Switch observation of particle creation/reuse and ground-contact timing, plus corresponding observed turf coverage/distribution over a repeatable flat surface and a supported scale mapping. Until those are measured or an authoritative lifecycle source resolves the mapping, RainNum=72 must not be treated as a required number of INKWAVE ray candidates, splat calls, or CPU turf writes. The retail coordinate/area mapping remains unknown. No gameplay fix or full calibration is claimed.
