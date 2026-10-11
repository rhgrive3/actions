import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measureStormRainCalibration, stringifyCalibrationJson } from '../patches/splatoon3/tests/storm-rain-calibration-harness.mjs';

const alternateFixtureRoots = ['INKWAVE_BUILT_SITE', 'INKWAVE_UPSTREAM_SOURCE']
  .filter((name) => process.env[name]);
if (alternateFixtureRoots.length) {
  throw new Error(`Storm calibration export requires the checkout fixture root; unset ${alternateFixtureRoots.join(' and ')} before measuring`);
}

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
  'inkwave-public/src/game/inkFlight.js',
  'inkwave-public/src/world/level.js',
  'inkwave-public/src/world/paint.js',
  'inkwave-public/src/fx/fx.js',
  'patches/splatoon3/adapter.mjs',
  'patches/splatoon3/runtime/clock.mjs',
  'patches/splatoon3/runtime/paint-ownership.mjs',
  'patches/splatoon3/profile.json',
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(file) {
  return sha256(fs.readFileSync(path.join(ROOT, file)));
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function sourceInputHashes() {
  return Object.fromEntries(SOURCE_FILES.map((file) => [file, sha256File(file)]));
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? String(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvFor(data) {
  const fields = [
    'scope', 'render_hz', 'render_frame', 'simulation_tick', 'simulation_time_s', 'cloud_time_s', 'kind', 'candidate_index', 'hit',
    'x_wu', 'y_wu', 'z_wu', 'ray_length_wu', 'radius_wu', 'nominal_circle_footprint_wu2', 'claimed_area_wu2',
    'cpu_turf_cells_delta', 'cosmetic_particles', 'paint_flagged_particles', 'cpu_radial_start_wu', 'cpu_radial_end_wu',
    'cpu_angle_start_deg', 'cpu_angle_end_deg', 'cpu_turf_cells', 'cpu_turf_area_wu2', 'metric_name', 'metric_value',
  ];
  const rows = [fields.join(',')];
  for (const run of data.runs) {
    for (const event of run.events) {
      const row = {
        scope: run.summary.scope,
        render_hz: event.renderHz,
        render_frame: event.renderFrame,
        simulation_tick: event.simulationTick,
        simulation_time_s: event.simulationTimeSeconds,
        cloud_time_s: event.cloudTimeSeconds,
        kind: event.kind,
        candidate_index: event.candidateIndex,
        hit: event.hit,
        x_wu: event.x,
        y_wu: event.y,
        z_wu: event.z,
        ray_length_wu: event.rayLengthWorldUnits,
        radius_wu: event.radiusWorldUnits ?? event.visualRadiusWorldUnits,
        nominal_circle_footprint_wu2: event.nominalCircularBrushFootprintWorldUnitsSquared,
        claimed_area_wu2: event.claimedWorldUnitsSquared,
        cpu_turf_cells_delta: event.cpuTurfCellsDelta,
        cosmetic_particles: event.emittedCosmeticParticles,
        paint_flagged_particles: event.paintFlaggedParticles,
      };
      rows.push(fields.map((field) => csvCell(row[field])).join(','));
    }
    for (const bin of run.distribution) rows.push(fields.map((field) => csvCell(({
      scope: run.summary.scope,
      render_hz: run.summary.renderHz,
      simulation_tick: run.summary.fixedSimulationTicks,
      simulation_time_s: run.summary.fixedSimulationSeconds,
      cloud_time_s: run.summary.fixedSimulationSeconds,
      kind: 'cpu_turf_distribution',
      cpu_radial_start_wu: bin.radialStartWorldUnits,
      cpu_radial_end_wu: bin.radialEndWorldUnits,
      cpu_angle_start_deg: bin.angleStartDegrees,
      cpu_angle_end_deg: bin.angleEndDegrees,
      cpu_turf_cells: bin.cells,
      cpu_turf_area_wu2: bin.areaWorldUnitsSquared,
    })[field])).join(','));
    for (const [metricName, metricValue] of Object.entries(run.summary)) rows.push(fields.map((field) => csvCell(({
      scope: run.summary.scope,
      render_hz: run.summary.renderHz,
      kind: 'summary',
      metric_name: metricName,
      metric_value: metricValue,
    })[field])).join(','));
  }
  return `${rows.join('\n')}\n`;
}

function markdownFor(data, artifactHashes) {
  const row = (run) => {
    const s = run.summary;
    return `| ${s.scope} | ${s.renderHz} | ${s.fixedSimulationTicks} | ${s.candidateRayEmissions} | ${s.rayGroundHits} | ${s.paintWriteEvents} | ${s.cosmeticParticleEmissions} | ${s.summedCircularBrushFootprintWorldUnitsSquared} | ${s.summedClaimedWorldUnitsSquared} | ${s.finalCpuTurfCellsFromGrid} | ${s.finalCpuTurfUnionWorldUnitsSquared} |`;
  };
  const rows = data.runs.map(row).join('\n');
  const sourceSnapshot = data.measurement.sourceSnapshot;
  return `# INKWAVE Ink Storm rain accounting — 2026-10-09

Issue [#226](https://github.com/rhgrive3/actions/issues/226) is calibration research. It does not establish a confirmed overpainting defect. The issue correction retains the INKWAVE 172-call observation but withdraws both the asserted one-to-one comparison with **RainNum=72** and any 72-call acceptance target. This measurement does not infer a Nintendo rain-particle lifecycle or an overpainting factor.

## Pinned reference boundary

- INKWAVE source inputs are bound by the per-file SHA-256 manifest in the JSON. Git HEAD at export was **${data.measurement.gitHead}**; source-input working-tree status was **${sourceSnapshot.workingTreeStatus}**. ${sourceSnapshot.commitBinding} Baseline main: **${data.measurement.baselineMain}**. No public gameplay source, storm runtime, or gameplay value was changed for this tool.
- Splatoon 3 comparison version: Ver. 11.3.0, as recorded by corrected Issue #226. The issue cites Leanny's pinned 11.3.0 extraction (CloudParam.RainNum=72, RainyFrame.Low=480, NoPaintRainNum=0, WithNoPaintRainNum=120) and the community Splatoon3 Wiki's RainNum/time notes. These source values remain reference metadata only: they do not resolve whether RainNum describes emitted particles, reuse, simultaneous management, ground contacts, or paint API calls.
- Links: [corrected Issue #226](${SOURCE_URLS.issueCorrection}), [Leanny 11.3.0 extracted table](${SOURCE_URLS.leanny1130StormParameter}), [Splatoon3 Wiki — Ink Storm](${SOURCE_URLS.splatoon3MixStormWiki}), [Nintendo update history](${SOURCE_URLS.nintendoVersionHistory}). The interpretation boundary above is inherited from the correction; this task did not repeat the source-lifecycle audit.
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
${rows}

The detailed timestamped event ledger, per-write areas, final CPU-grid radial/angle bins, and summary counters are retained in [CSV](./${REPORT_STEM}.csv) and [JSON](./${REPORT_STEM}.json). Within the 'production' scope, simulation events and CPU turf distribution match across render rates after omitting only the render-frame index. Within the 'public-source' scope they do not: candidate counts are 172, 172, and 171 at 30, 60, and 120 Hz, and the CPU turf differs. That scope's cloud time is accumulated per render frame, so the window check falls on a different update at each cadence. At 30 and 60 Hz the cloud is still listed at the end of the run because accumulated floating-point time stops just below 8 s; the window had already closed, so no further emissions occur.

## Artifact binding

The JSON retains all ${data.measurement.artifactBinding.eventRecordCount.toLocaleString('en-US')} timestamped event records, ${data.measurement.artifactBinding.distributionRecordCount.toLocaleString('en-US')} CPU distribution bins, and ${data.measurement.artifactBinding.summaryRecordCount.toLocaleString('en-US')} summary records represented in the CSV. The JSON records the CSV SHA-256; this report records both payload hashes: JSON **${artifactHashes.json}**, CSV **${artifactHashes.csv}**. The input SHA-256 manifest in JSON includes the harness, fixture, focused test, exporter, production modules, and the two unit-convention reference files. The Git commit containing this report and both data artifacts binds the report version.

## Limits and remaining anchors

This is deterministic logic-level accounting with a headless renderer stub. It is not a browser render, GPU readback, Switch measurement, or claim of retail Splatoon 3 equivalence. FX records particle-pool admissions; this harness does not age or collide those cosmetic particles. The ground is a single ideal flat fixture, and turf distribution is the INKWAVE 0.25 WU CPU grid, not a measured Nintendo turf map. The results establish separations and reproducibility in the checked-in INKWAVE path only.

Remaining hardware anchors are a controlled Ver. 11.3.0 Switch observation of particle creation/reuse and ground-contact timing, plus corresponding observed turf coverage/distribution over a repeatable flat surface and a supported scale mapping. Until those are measured or an authoritative lifecycle source resolves the mapping, RainNum=72 must not be treated as a required number of INKWAVE ray candidates, splat calls, or CPU turf writes. The retail coordinate/area mapping remains unknown. No gameplay fix or full calibration is claimed.
`;
}

const gitHead = git(['rev-parse', 'HEAD']);
const sourceStatus = git(['status', '--porcelain=v1', '--untracked-files=all', '--', ...SOURCE_FILES]);
const sourceSha256Before = sourceInputHashes();
const data = await measureStormRainCalibration();
data.measurement.sourceUrls = SOURCE_URLS;
data.measurement.gitHead = gitHead;
data.measurement.sourceSnapshot = {
  basis: 'repository-relative per-file SHA-256 of source input contents',
  fileCount: SOURCE_FILES.length,
  workingTreeStatus: sourceStatus ? 'modified' : 'clean',
  commitBinding: sourceStatus
    ? 'Git HEAD is provenance context only; sourceSha256 binds the measured working-tree contents and no exact source commit is claimed.'
    : 'The measured source input paths were clean relative to Git HEAD; sourceSha256 records each input file.',
};
data.measurement.sourceSha256 = sourceSha256Before;
const sourceSha256After = sourceInputHashes();
if (JSON.stringify(sourceSha256Before) !== JSON.stringify(sourceSha256After)) throw new Error('Source inputs changed during measurement');
const csv = csvFor(data);
fs.writeFileSync(OUTPUTS.csv, csv);
data.measurement.artifactBinding = {
  eventRecordCount: data.runs.reduce((count, run) => count + run.events.length, 0),
  distributionRecordCount: data.runs.reduce((count, run) => count + run.distribution.length, 0),
  summaryRecordCount: data.runs.reduce((count, run) => count + Object.keys(run.summary).length, 0),
  csv: { file: path.basename(OUTPUTS.csv), sha256: sha256(csv) },
};
const json = `${stringifyCalibrationJson(data)}\n`;
fs.writeFileSync(OUTPUTS.json, json);
const artifactHashes = { json: sha256(json), csv: sha256(csv) };
fs.writeFileSync(OUTPUTS.markdown, markdownFor(data, artifactHashes));
process.stdout.write(`${JSON.stringify({ ...OUTPUTS, runSummaries: data.runs.map((run) => run.summary) }, null, 2)}\n`);
