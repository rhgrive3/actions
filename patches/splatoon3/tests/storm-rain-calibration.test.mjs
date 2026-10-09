import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comparableStormRun,
  measureStormRainCalibration,
} from './storm-rain-calibration-harness.mjs';

test('#226 production-composed Storm accounting is deterministic at 30/60/120Hz render cadence', async () => {
  const { runs } = await measureStormRainCalibration();
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
    assert.ok(summary.finalCpuTurfUnionAreaM2 > 0);
    assert.equal(summary.finalCpuTurfCellsFromGrid, summary.finalCpuTurfCellsFromPaintCounts);
    assert.equal(summary.summedClaimedAreaM2, summary.finalCpuTurfUnionAreaM2);
    assert.equal(distribution.reduce((sum, bin) => sum + bin.cells, 0), summary.finalCpuTurfCellsFromGrid);
    assert.ok(Math.abs(distribution.reduce((sum, bin) => sum + bin.areaM2, 0) - summary.finalCpuTurfUnionAreaM2) < 1e-9);
    assert.ok(events.every((event) => Number.isInteger(event.simulationTick) && event.simulationTick > 0 && event.simulationTick <= 480));
    const candidateIds = events.filter((event) => event.kind === 'candidate_ray_emission').map((event) => event.candidateIndex);
    assert.deepEqual(events.filter((event) => event.kind === 'ray_ground_hit').map((event) => event.candidateIndex), candidateIds);
    assert.deepEqual(events.filter((event) => event.kind === 'paint_splat_write').map((event) => event.candidateIndex), candidateIds);
    assert.ok(events.some((event) => event.kind === 'candidate_ray_emission' && Number.isFinite(event.simulationTimeSeconds)));
    assert.ok(events.some((event) => event.kind === 'ray_ground_hit'));
    assert.ok(events.some((event) => event.kind === 'paint_splat_write' && Number.isFinite(event.claimedAreaM2)));
    assert.ok(events.some((event) => event.kind === 'cosmetic_fx_rain_batch' && Number.isInteger(event.emittedCosmeticParticles)));
  }
});
