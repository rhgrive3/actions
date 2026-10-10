import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  comparableStormRun,
  measureStormRainCalibration,
  stringifyCalibrationJson,
} from './storm-rain-calibration-harness.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const EXPORTER = path.join(ROOT, 'scripts/measure-inkwave-storm-rain.mjs');
const REPORTS = [
  'reports/inkwave-storm-rain-calibration-2026-10-09.csv',
  'reports/inkwave-storm-rain-calibration-2026-10-09.json',
  'reports/inkwave-storm-rain-calibration-2026-10-09.md',
];

function reportHashes() {
  return Object.fromEntries(REPORTS.map((file) => [file,
    createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex')]));
}

test('#226 compact JSON keeps leaf records on one line without changing parsed data', () => {
  const source = {
    measurement: { units: 'WU', retailMapping: 'unknown' },
    runs: [{
      summary: { renderHz: 60, fixedSimulationTicks: 480 },
      events: [{ kind: 'ray_ground_hit', simulationTick: 4, x: 0, y: 0, z: 0 }],
      distribution: [{ radialStartWorldUnits: 0, cells: 3, areaWorldUnitsSquared: 0.1875 }],
    }],
  };
  const serialized = stringifyCalibrationJson(source);
  assert.deepEqual(JSON.parse(serialized), source);
  assert.ok(serialized.split('\n').includes('        {"kind":"ray_ground_hit","simulationTick":4,"x":0,"y":0,"z":0}'));
  assert.ok(serialized.split('\n').includes('        {"radialStartWorldUnits":0,"cells":3,"areaWorldUnitsSquared":0.1875}'));
});

test('#226 production-composed Storm accounting is deterministic at 30/60/120Hz render cadence', async () => {
  const { measurement, runs } = await measureStormRainCalibration();
  assert.match(measurement.coordinateUnits.inkwaveInternalConvention, /1:1 with INKWAVE meters/);
  assert.equal(measurement.coordinateUnits.retailMapping, 'unknown; this measurement applies no conversion');
  assert.equal(measurement.coordinateUnits.distance, 'INKWAVE world units (WU); no conversion to retail Splatoon 3 units is established');
  assert.deepEqual(runs.map((run) => run.summary.renderHz), [30, 60, 120]);
  assert.deepEqual(comparableStormRun(runs[0]), comparableStormRun(runs[1]));
  assert.deepEqual(comparableStormRun(runs[1]), comparableStormRun(runs[2]));

  for (const { summary, events, distribution } of runs) {
    assert.equal(summary.fixedSimulationTicks, 480);
    assert.equal(summary.cloudCount, 1);
    assert.equal(summary.cloudRemovedAtEnd, true);
    assert.ok(summary.candidateRayEmissions > 0);
    assert.equal(summary.candidateRayEmissions, summary.auditCandidateRayEmissions);
    assert.equal(summary.rayGroundHits, summary.auditRayGroundHits);
    assert.equal(summary.paintWriteEvents, summary.auditPaintEvents);
    assert.equal(summary.rayGroundHits, summary.paintWriteEvents);
    assert.ok(summary.cosmeticParticleEmissions > 0);
    assert.equal(summary.cosmeticRainCalls, summary.cosmeticParticleBatchEvents);
    assert.equal(summary.paintFlaggedCosmeticEmissions, 0);
    assert.ok(summary.finalCpuTurfUnionWorldUnitsSquared > 0);
    assert.equal(summary.finalCpuTurfCellsFromGrid, summary.finalCpuTurfCellsFromPaintCounts);
    assert.equal(summary.summedClaimedWorldUnitsSquared, summary.finalCpuTurfUnionWorldUnitsSquared);
    assert.equal(distribution.reduce((sum, bin) => sum + bin.cells, 0), summary.finalCpuTurfCellsFromGrid);
    assert.ok(Math.abs(distribution.reduce((sum, bin) => sum + bin.areaWorldUnitsSquared, 0) - summary.finalCpuTurfUnionWorldUnitsSquared) < 1e-9);
    assert.ok(events.every((event) => Number.isInteger(event.simulationTick) && event.simulationTick > 0 && event.simulationTick <= 480));
    const candidateIds = events.filter((event) => event.kind === 'candidate_ray_emission').map((event) => event.candidateIndex);
    assert.deepEqual(events.filter((event) => event.kind === 'ray_ground_hit').map((event) => event.candidateIndex), candidateIds);
    assert.deepEqual(events.filter((event) => event.kind === 'paint_splat_write').map((event) => event.candidateIndex), candidateIds);
    assert.ok(events.some((event) => event.kind === 'candidate_ray_emission' && Number.isFinite(event.simulationTimeSeconds)));
    assert.ok(events.some((event) => event.kind === 'ray_ground_hit'));
    assert.ok(events.some((event) => event.kind === 'paint_splat_write' && Number.isFinite(event.claimedWorldUnitsSquared)));
    assert.ok(events.some((event) => event.kind === 'cosmetic_fx_rain_batch' && Number.isInteger(event.emittedCosmeticParticles)));
  }
});

test('#226 exporter rejects alternate fixture roots before measuring or writing artifacts', () => {
  const before = reportHashes();
  for (const override of ['INKWAVE_BUILT_SITE', 'INKWAVE_UPSTREAM_SOURCE']) {
    const env = { ...process.env };
    delete env.INKWAVE_BUILT_SITE;
    delete env.INKWAVE_UPSTREAM_SOURCE;
    env[override] = path.join(ROOT, 'alternate-fixture-root');
    const result = spawnSync(process.execPath, [EXPORTER], { cwd: ROOT, env, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, new RegExp(`unset ${override}`));
    assert.deepEqual(reportHashes(), before);
  }
});
