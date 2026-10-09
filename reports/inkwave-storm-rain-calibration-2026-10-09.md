# INKWAVE Ink Storm rain accounting — 2026-10-09

Issue [#226](https://github.com/rhgrive3/actions/issues/226) is calibration research. It does not establish a confirmed overpainting defect. The issue correction retains the INKWAVE 172-call observation but withdraws both the asserted one-to-one comparison with **RainNum=72** and any 72-call acceptance target. This measurement does not infer a Nintendo rain-particle lifecycle or an overpainting factor.

## Pinned reference boundary

- INKWAVE production-source snapshot: **a8f22317917505646a5e8e2ec65822dade5a7101**; baseline main: **5d0be6b7fdebfd07e696e75497aaa97aa5ff5648**. No public gameplay source, storm runtime, or gameplay value was changed for this tool.
- Splatoon 3 comparison version: Ver. 11.3.0, as recorded by corrected Issue #226. The issue cites Leanny's pinned 11.3.0 extraction (CloudParam.RainNum=72, RainyFrame.Low=480, NoPaintRainNum=0, WithNoPaintRainNum=120) and the community Splatoon3 Wiki's RainNum/time notes. These source values remain reference metadata only: they do not resolve whether RainNum describes emitted particles, reuse, simultaneous management, ground contacts, or paint API calls.
- Links: [corrected Issue #226](https://github.com/rhgrive3/actions/issues/226), [Leanny 11.3.0 extracted table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpInkStorm.game__GameParameterTable.json), [Splatoon3 Wiki — Ink Storm](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%9A%E3%82%B7%E3%83%A3%E3%83%AB%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E3%82%A2%E3%83%A1%E3%83%95%E3%83%A9%E3%82%B7), [Nintendo update history](https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/How-to-Update-Splatoon-3-2266003.html). The interpretation boundary above is inherited from the correction; this task did not repeat the source-lifecycle audit.
- The measured production composition retains the already-present adapter behavior in patches/splatoon3/adapter.mjs: its Storm update window runs through the final duration tick, and its 12 m ray reach remains unchanged. This is why this fully composed run records 178 candidate rays; the issue's 172 PaintSystem.splat-call observation came from the public-source-only update window that stops 0.3 s before expiry. The two run scopes are recorded separately here; neither establishes a Nintendo-particle mapping.

## Measurement setup

One local, non-ghost, team-0 cloud runs for 8 simulation seconds from (0, 5, 0) above a flat 64 m × 64 m paintable plane. There are no actors or gear modifiers. The same seeded random stream is used at each render cadence. The harness composes the public Projectiles._updateClouds, real Physics.raycast, real PaintSystem CPU grid, real FX.rain drop-pool path, the current adapter, and the 60 Hz FixedClock; it advances rendering at 30, 60, and 120 Hz. Each event row includes render frame, fixed simulation tick/time, and cloud time.

The terms are deliberately local to INKWAVE:

- **Candidate ray emission**: one call into INKWAVE's rain raycast path. It is not a Nintendo particle.
- **Ground hit**: a successful return from INKWAVE's composed physics raycast against this fixture plane.
- **Paint write**: one call to the real PaintSystem.splat. Its returned newly claimed area and its CPU grid cell changes are separately recorded.
- **Cosmetic particle emission**: one drop-pool admission through INKWAVE FX.rain → FX._spawnDrop. These are not Nintendo particles; the Storm rain path does not set the FX paint flag.
- **Summed circular brush footprint**: Σπr² for paint calls. This nominal footprint sum can overlap and is not an area of unique turf.
- **CPU turf union**: unique team-owned cells read from the real PaintSystem.grid after the run. The radial/angle distribution is reported in both data files.

## Results

| Render Hz | Fixed ticks | INKWAVE candidate rays | Ray ground hits | Paint writes | Cosmetic FX drop emissions | Sum of nominal πr² (m²) | Sum newly claimed (m²) | Final CPU turf cells | Final CPU turf union (m²) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 480 | 178 | 178 | 178 | 6384 | 233.134166494 | 170.6875 | 2731 | 170.6875 |
| 60 | 480 | 178 | 178 | 178 | 6384 | 233.134166494 | 170.6875 | 2731 | 170.6875 |
| 120 | 480 | 178 | 178 | 178 | 6384 | 233.134166494 | 170.6875 | 2731 | 170.6875 |

The detailed timestamped event ledger, per-write areas, final CPU-grid radial/angle bins, and summary counters are retained in [CSV](./inkwave-storm-rain-calibration-2026-10-09.csv) and [JSON](./inkwave-storm-rain-calibration-2026-10-09.json). Across render rates, simulation events and CPU turf distribution match after omitting only the render-frame index; render-frame indices differ by design.

## Limits and remaining anchors

This is deterministic logic-level accounting with a headless renderer stub. It is not a browser render, GPU readback, Switch measurement, or claim of retail Splatoon 3 equivalence. FX records particle-pool admissions; this harness does not age or collide those cosmetic particles. The ground is a single ideal flat fixture, and turf distribution is the INKWAVE 0.25 m CPU grid, not a measured Nintendo turf map. The results establish separations and reproducibility in the checked-in INKWAVE path only.

Remaining hardware anchors are a controlled Ver. 11.3.0 Switch observation of particle creation/reuse and ground-contact timing, plus corresponding observed turf coverage/distribution over a repeatable flat surface. Until those are measured or an authoritative lifecycle source resolves the mapping, RainNum=72 must not be treated as a required number of INKWAVE ray candidates, splat calls, or CPU turf writes. No gameplay fix or full calibration is claimed.
