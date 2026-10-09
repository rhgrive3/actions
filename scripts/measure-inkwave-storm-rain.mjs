import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { measureStormRainCalibration } from '../patches/splatoon3/tests/storm-rain-calibration-harness.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REPORT_STEM = 'inkwave-storm-rain-calibration-2026-10-09';
const OUTPUTS = {
  json: path.join(ROOT, 'reports', `${REPORT_STEM}.json`),
  csv: path.join(ROOT, 'reports', `${REPORT_STEM}.csv`),
  markdown: path.join(ROOT, 'reports', `${REPORT_STEM}.md`),
};
const SOURCE_FILES = [
  'inkwave-public/src/game/weapons.js',
  'inkwave-public/src/game/physics.js',
  'inkwave-public/src/world/paint.js',
  'inkwave-public/src/fx/fx.js',
  'patches/splatoon3/adapter.mjs',
  'patches/splatoon3/runtime/clock.mjs',
  'patches/splatoon3/runtime/paint-ownership.mjs',
  'patches/splatoon3/tests/source-fixture.mjs',
  'patches/splatoon3/tests/storm-rain-calibration-harness.mjs',
  'patches/splatoon3/tests/storm-rain-calibration.test.mjs',
  'scripts/measure-inkwave-storm-rain.mjs',
];
const SOURCE_URLS = {
  issueCorrection: 'https://github.com/rhgrive3/actions/issues/226',
  leanny1130StormParameter: 'https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpInkStorm.game__GameParameterTable.json',
  splatoon3MixStormWiki: 'https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%9A%E3%82%B7%E3%83%A3%E3%83%AB%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E3%82%A2%E3%83%A1%E3%83%95%E3%83%A9%E3%82%B7',
  nintendoVersionHistory: 'https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/How-to-Update-Splatoon-3-2266003.html',
};

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? String(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvFor(data) {
  const fields = [
    'render_hz', 'render_frame', 'simulation_tick', 'simulation_time_s', 'cloud_time_s', 'kind', 'candidate_index', 'hit',
    'x_m', 'y_m', 'z_m', 'ray_length_m', 'radius_m', 'nominal_circle_footprint_m2', 'claimed_area_m2',
    'cpu_turf_cells_delta', 'cosmetic_particles', 'paint_flagged_particles', 'cpu_radial_start_m', 'cpu_radial_end_m',
    'cpu_angle_start_deg', 'cpu_angle_end_deg', 'cpu_turf_cells', 'cpu_turf_area_m2', 'metric_name', 'metric_value',
  ];
  const rows = [fields.join(',')];
  for (const run of data.runs) {
    for (const event of run.events) {
      const row = {
        render_hz: event.renderHz,
        render_frame: event.renderFrame,
        simulation_tick: event.simulationTick,
        simulation_time_s: event.simulationTimeSeconds,
        cloud_time_s: event.cloudTimeSeconds,
        kind: event.kind,
        candidate_index: event.candidateIndex,
        hit: event.hit,
        x_m: event.x,
        y_m: event.y,
        z_m: event.z,
        ray_length_m: event.rayLengthM,
        radius_m: event.radiusM ?? event.visualRadiusM,
        nominal_circle_footprint_m2: event.nominalCircularBrushFootprintM2,
        claimed_area_m2: event.claimedAreaM2,
        cpu_turf_cells_delta: event.cpuTurfCellsDelta,
        cosmetic_particles: event.emittedCosmeticParticles,
        paint_flagged_particles: event.paintFlaggedParticles,
      };
      rows.push(fields.map((field) => csvCell(row[field])).join(','));
    }
    for (const bin of run.distribution) rows.push(fields.map((field) => csvCell(({
      render_hz: run.summary.renderHz,
      simulation_tick: run.summary.fixedSimulationTicks,
      simulation_time_s: run.summary.fixedSimulationSeconds,
      cloud_time_s: run.summary.fixedSimulationSeconds,
      kind: 'cpu_turf_distribution',
      cpu_radial_start_m: bin.radialStartM,
      cpu_radial_end_m: bin.radialEndM,
      cpu_angle_start_deg: bin.angleStartDegrees,
      cpu_angle_end_deg: bin.angleEndDegrees,
      cpu_turf_cells: bin.cells,
      cpu_turf_area_m2: bin.areaM2,
    })[field])).join(','));
    for (const [metricName, metricValue] of Object.entries(run.summary)) rows.push(fields.map((field) => csvCell(({
      render_hz: run.summary.renderHz,
      kind: 'summary',
      metric_name: metricName,
      metric_value: metricValue,
    })[field])).join(','));
  }
  return `${rows.join('\n')}\n`;
}

function markdownFor(data) {
  const row = (run) => {
    const s = run.summary;
    return `| ${s.renderHz} | ${s.fixedSimulationTicks} | ${s.candidateRayEmissions} | ${s.rayGroundHits} | ${s.paintWriteEvents} | ${s.cosmeticParticleEmissions} | ${s.summedCircularBrushFootprintAreaM2} | ${s.summedClaimedAreaM2} | ${s.finalCpuTurfCellsFromGrid} | ${s.finalCpuTurfUnionAreaM2} |`;
  };
  const rows = data.runs.map(row).join('\n');
  return `# INKWAVE Ink Storm rain accounting — 2026-10-09

Issue [#226](https://github.com/rhgrive3/actions/issues/226) is calibration research. It does not establish a confirmed overpainting defect. The issue correction retains the INKWAVE 172-call observation but withdraws both the asserted one-to-one comparison with **RainNum=72** and any 72-call acceptance target. This measurement does not infer a Nintendo rain-particle lifecycle or an overpainting factor.

## Pinned reference boundary

- INKWAVE production-source snapshot: **${data.measurement.inkwaveSourceSnapshot}**; baseline main: **${data.measurement.baselineMain}**. No public gameplay source, storm runtime, or gameplay value was changed for this tool.
- Splatoon 3 comparison version: Ver. 11.3.0, as recorded by corrected Issue #226. The issue cites Leanny's pinned 11.3.0 extraction (CloudParam.RainNum=72, RainyFrame.Low=480, NoPaintRainNum=0, WithNoPaintRainNum=120) and the community Splatoon3 Wiki's RainNum/time notes. These source values remain reference metadata only: they do not resolve whether RainNum describes emitted particles, reuse, simultaneous management, ground contacts, or paint API calls.
- Links: [corrected Issue #226](${SOURCE_URLS.issueCorrection}), [Leanny 11.3.0 extracted table](${SOURCE_URLS.leanny1130StormParameter}), [Splatoon3 Wiki — Ink Storm](${SOURCE_URLS.splatoon3MixStormWiki}), [Nintendo update history](${SOURCE_URLS.nintendoVersionHistory}). The interpretation boundary above is inherited from the correction; this task did not repeat the source-lifecycle audit.
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
${rows}

The detailed timestamped event ledger, per-write areas, final CPU-grid radial/angle bins, and summary counters are retained in [CSV](./${REPORT_STEM}.csv) and [JSON](./${REPORT_STEM}.json). Across render rates, simulation events and CPU turf distribution match after omitting only the render-frame index; render-frame indices differ by design.

## Limits and remaining anchors

This is deterministic logic-level accounting with a headless renderer stub. It is not a browser render, GPU readback, Switch measurement, or claim of retail Splatoon 3 equivalence. FX records particle-pool admissions; this harness does not age or collide those cosmetic particles. The ground is a single ideal flat fixture, and turf distribution is the INKWAVE 0.25 m CPU grid, not a measured Nintendo turf map. The results establish separations and reproducibility in the checked-in INKWAVE path only.

Remaining hardware anchors are a controlled Ver. 11.3.0 Switch observation of particle creation/reuse and ground-contact timing, plus corresponding observed turf coverage/distribution over a repeatable flat surface. Until those are measured or an authoritative lifecycle source resolves the mapping, RainNum=72 must not be treated as a required number of INKWAVE ray candidates, splat calls, or CPU turf writes. No gameplay fix or full calibration is claimed.
`;
}

const data = await measureStormRainCalibration();
data.measurement.sourceUrls = SOURCE_URLS;
data.measurement.sourceSha256 = Object.fromEntries(SOURCE_FILES.map((file) => [file, sha256(file)]));
fs.writeFileSync(OUTPUTS.json, `${JSON.stringify(data, null, 2)}\n`);
fs.writeFileSync(OUTPUTS.csv, csvFor(data));
fs.writeFileSync(OUTPUTS.markdown, markdownFor(data));
process.stdout.write(`${JSON.stringify({ ...OUTPUTS, runSummaries: data.runs.map((run) => run.summary) }, null, 2)}\n`);
