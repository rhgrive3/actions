import test from 'node:test';
import assert from 'node:assert/strict';
import { measureStormRainAtRenderHz } from './storm-rain-calibration-harness.mjs';

assert.ok(!process.env.INKWAVE_BUILT_SITE,
  'Public-source calibration requires the raw public source; use the production test file for emitted builds');

function assertOwnerAccounting(summary) {
  const immediate = summary.summedClaimedWorldUnitsSquared;
  const late = summary.delayedOwnerCreditWorldUnitsSquared;
  assert.ok(Number.isFinite(immediate) && immediate > 0);
  assert.ok(Number.isFinite(late) && late >= 0);
  assert.equal(summary.immediateOwnerCreditWorldUnitsSquared, immediate,
    'native Storm awards each immediate splat return exactly once');
  assert.equal(summary.ownerTurfDeltaWorldUnitsSquared, immediate + late,
    'real Actor turf equals the separate immediate and late callback ledgers');
  assert.equal(summary.ownerTurfDeltaWorldUnitsSquared, summary.finalCpuTurfUnionWorldUnitsSquared,
    'real Actor turf equals unique owned cells at the same measurement boundary');
}

test('#226 public-source scope reproduces the issue 172/172/171 candidate-call counts and stops 0.3 s before expiry', async () => {
  await assert.rejects(measureStormRainAtRenderHz(60, { scope: 'unknown' }), RangeError);
  const runs = [];
  for (const renderHz of [30, 60, 120]) runs.push(await measureStormRainAtRenderHz(renderHz, { scope: 'public-source' }));
  assert.deepEqual(runs.map((run) => run.summary.candidateRayEmissions), [172, 172, 171]);
  for (const { summary, events, distribution } of runs) {
    assert.equal(summary.scope, 'public-source');
    assertOwnerAccounting(summary);
    assert.equal(summary.delayedOwnerCreditWorldUnitsSquared, 0, 'raw public source has no #264 late-owner path');
    assert.equal(summary.auditCandidateRayEmissions, null);
    assert.equal(summary.rayGroundHits, summary.candidateRayEmissions);
    assert.equal(summary.paintWriteEvents, summary.rayGroundHits);
    assert.equal(summary.cosmeticRainCalls, summary.cosmeticParticleBatchEvents);
    assert.equal(summary.paintFlaggedCosmeticEmissions, 0);
    assert.equal(summary.finalCpuTurfCellsFromGrid, summary.finalCpuTurfCellsFromPaintCounts);
    assert.equal(distribution.reduce((sum, bin) => sum + bin.cells, 0), summary.finalCpuTurfCellsFromGrid);
    // _updateClouds emits only after `c.t += dt` leaves c.t < duration - 0.3 (7.7 s), so no emission is at or after 7.7 s.
    const emissionTimes = events.filter((event) => event.kind === 'candidate_ray_emission').map((event) => event.cloudTimeSeconds);
    assert.ok(Math.max(...emissionTimes) < 7.7 + 1e-6);
  }
});

