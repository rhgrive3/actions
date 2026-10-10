// #992: Splat Dualies normal-shot paint must come from the native ink-flight
// model, not the generic trail (trailRadius x random 0.8..1.2).
// Sourced values: pinned S3 11.3.0 Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6
// (PaintParam: WidthHalfNear 1.71, WidthHalfMiddle 1.71, WidthHalfFar 1.66, DistanceMiddle 1.1,
// DepthScaleMax 2.24, DepthScaleMin 1.31, DepthScaleMaxBreakFree 2.24, DepthScaleMinBreakFree 1.12;
// SplashSpawnParam: SpawnNum 1, SpawnNearestLength 1, SpawnBetweenLength 14, SplitNum 7;
// SplashPaintParam: WidthHalf 1.55825, WidthHalfNearest 2.18155).
// Unsourced and deliberately NOT asserted here (remain 未確認): far anchor 20, angle thresholds
// 10..35, flight height thresholds 1.5..10, splash DepthScaleMax 1.2, and the 7-pattern / particle law.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './source-fixture.mjs';
import { INK_PROFILES, paintShape, splashPlan, splashShape } from '../../../inkwave-public/src/game/inkFlight.js';

const dualies = INK_PROFILES.dualies;

test('#992 pinned Dualies PaintParam widths and depth endpoints are wired into the native profile', () => {
  assert.equal(dualies.paint.widthNear, 1.71);
  assert.equal(dualies.paint.widthMiddle, 1.71);
  assert.equal(dualies.paint.widthFar, 1.66);
  assert.equal(dualies.paint.depthMax, 2.24);
  assert.equal(dualies.paint.depthMin, 1.31);
  assert.equal(dualies.paint.depthMaxFall, 2.24);
  assert.equal(dualies.paint.depthMinFall, 1.12);
});

test('#992 near floor hits use WidthHalfNear and far floor hits use WidthHalfFar', () => {
  // d = 1.0 is inside DistanceMiddle (1.1), where near and middle are both 1.71.
  assert.equal(paintShape(dualies, 1.0, 0, 0, 0).radius, 1.71);
  // d = 40 lies beyond every anchor, so only the far endpoint is asserted (far anchor is unsourced).
  assert.equal(paintShape(dualies, 40, 0, 0, 0).radius, 1.66);
  assert.notEqual(paintShape(dualies, 1.0, 0, 0, 0).radius, paintShape(dualies, 40, 0, 0, 0).radius);
});

test('#992 pre-fall depth scale takes the sourced DepthScaleMax / DepthScaleMin endpoints', () => {
  // Endpoints are clamped, so the unsourced angle thresholds are not asserted.
  assert.ok(Math.abs(paintShape(dualies, 5, 0, 0, 0).stretch - (2.24 - 1)) < 1e-12);
  assert.ok(Math.abs(paintShape(dualies, 5, 90, 0, 0).stretch - (1.31 - 1)) < 1e-12);
});

test('#992 falling depth scale takes the sourced DepthScaleMaxBreakFree / MinBreakFree endpoints', () => {
  // Drop heights 0 and 100 clamp the unsourced height thresholds to their ends.
  assert.ok(Math.abs(paintShape(dualies, 5, 0, 1, 100).stretch - (2.24 - 1)) < 1e-12);
  assert.ok(Math.abs(paintShape(dualies, 5, 90, 1, 100).stretch - (1.12 - 1)) < 1e-12);
  assert.ok(Math.abs(paintShape(dualies, 5, 90, 1, 0).stretch - (1.31 - 1)) < 1e-12);
});

test('#992 droplet path: one droplet per shot, 14-unit spacing, feet only on the 7th split', () => {
  const cycle = [];
  for (let seq = 0; seq < 7; seq++) cycle.push(splashPlan(dualies, seq));
  assert.ok(cycle.every(plan => plan.count === 1), 'SpawnNum 1: at most one droplet per shot');
  assert.equal(cycle.reduce((sum, plan) => sum + plan.count, 0), 7, 'one droplet per shot over a full split cycle');
  assert.equal(cycle.filter(plan => plan.feet).length, 1, 'only the SplitNum-th shot takes the nearest/feet path');
  assert.equal(cycle[6].feet, true);
  assert.equal(cycle[6].first, 1, 'SpawnNearestLength 1 on the nearest droplet');
  assert.ok(cycle.every(plan => plan.spacing === 14), 'SpawnBetweenLength 14');
});

test('#992 droplet radius: normal 1.55825 vs nearest 2.18155', () => {
  assert.equal(splashShape(dualies, false, 0).radius, 1.55825);
  assert.equal(splashShape(dualies, true, 0).radius, 2.18155);
});

test('#992 live Dualies normal shots are owned by the native ink-flight profile, not the generic trail', async () => {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const { G } = f, owner = f.make('dualies');
  G.settings = {}; f.setRandom(() => 0.37);
  owner.aimDir.set(0, 0, 1); owner.aimPoint.set(0, 1.05, 10);
  owner.weaponRunner.charge = 0;
  G.projectiles.fireDualies(owner, owner.weapon, 0, 0);
  const shots = G.projectiles.list.filter(p => p.owner === owner && p.inkProfile);
  assert.ok(shots.length >= 1, 'a live Dualies shot is configured with a native ink profile');
  for (const p of shots) {
    assert.equal(p.inkKey, 'dualies');
    assert.equal(p.trailEvery, 0, 'native shots disable the generic constant-radius trail');
  }
});
