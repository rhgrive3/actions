import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  blasterPaintContract,
  blasterSplashDropBand,
  blasterBurstAxisDirections,
} from '../runtime/weapons-fidelity.mjs';
import {
  BLASTER_INTERRUPT_SUB,
  BLASTER_INTERRUPT_SQUID,
  blasterCancellationEdge,
} from '../runtime/weapon-gates.mjs';

const profile = JSON.parse(fs.readFileSync(new URL('../profile.json', import.meta.url), 'utf8'));
const raw = profile.weaponsFidelityCompletion.weapons.blaster;
const contract = blasterPaintContract(raw);

test('#1049 Blaster flight splash consumes the sourced 3-to-10 drop-height regime', () => {
  assert.ok(contract);
  assert.equal(contract.dropHeightMax, 3);
  assert.equal(contract.dropHeightMin, 10);
  assert.equal(blasterSplashDropBand(contract, 2.999), 'max');
  assert.equal(blasterSplashDropBand(contract, 3), 'max');
  assert.equal(blasterSplashDropBand(contract, 4), 'transition');
  assert.equal(blasterSplashDropBand(contract, 5), 'transition');
  assert.equal(blasterSplashDropBand(contract, 10), 'transition');
  assert.equal(blasterSplashDropBand(contract, 10.001), 'none');
});

test('#1009 flight-splash wall contact keeps its own nested S3 wall state', () => {
  assert.equal(contract.flightWall.firstDistance, 1.8);
  assert.equal(contract.flightWall.velocityMinusYRate, 0.4);
  assert.equal(contract.flightWall.paint.PaintRadiusShock, 1.4);
  assert.equal(contract.flightWall.paint.PaintRadiusFall, 1);
  assert.equal(contract.flightWall.move.FallPeriodFirstFrameMin, 15);
  assert.equal(contract.flightWall.move.FallPeriodSecondFrame, 35);
  assert.equal(contract.flightWall.move.FallPeriodLastFrameMin, 20);
  assert.equal(contract.flightWall.move.FallPeriodLastFrameMax, 35);
});

test('#1001 shot-collision burst paint consumes radius and both round-axis arrays', () => {
  assert.equal(contract.burst.radius, 2.5);
  assert.deepEqual(contract.burst.axisX, [-90, -45, 0, 45]);
  assert.deepEqual(contract.burst.axisY, [0, 30, 60, 90, 120]);
  const dirs = blasterBurstAxisDirections(contract);
  assert.equal(dirs.length, 20);
  for (const d of dirs) assert.ok(Math.abs(Math.hypot(d.x, d.y, d.z) - 1) < 1e-12);
  const forward = dirs.find(d => Math.abs(d.x) < 1e-12 && Math.abs(d.y) < 1e-12 && Math.abs(d.z - 1) < 1e-12);
  const right = dirs.find(d => Math.abs(d.x - 1) < 1e-12 && Math.abs(d.y) < 1e-12 && Math.abs(d.z) < 1e-12);
  assert.ok(forward);
  assert.ok(right);
});

test('#1027 burst-splash wall drop is shock-only and remains separate from the main projectile state', () => {
  const move = contract.burst.move, paint = contract.burst.paint;
  assert.equal(paint.PaintRadiusShock, 1.2);
  assert.equal(paint.PaintRadiusFall, 0);
  assert.equal(paint.PaintRadiusGround, 0);
  assert.equal(move.FallPeriodFirstFrameMin, 1);
  assert.equal(move.FallPeriodFirstFrameMax, 1);
  assert.equal(move.FallPeriodSecondFrame, 1);
  assert.equal(move.FallPeriodLastFrameMin, 1);
  assert.equal(move.FallPeriodLastFrameMax, 1);
  assert.equal(move.FallPeriodFirstTargetSpeed, 0);
  assert.equal(move.FallPeriodSecondTargetSpeed, 0);
  assert.notEqual(paint.PaintRadiusShock, raw.WallDropCollisionPaintParam.PaintRadiusShock);
});

test('#1035 held-Blaster cancellation exposes distinct 3F sub and 4F squid gates', () => {
  assert.equal(BLASTER_INTERRUPT_SUB, 3 / 60);
  assert.equal(BLASTER_INTERRUPT_SQUID, 4 / 60);
  const runner = { s3BlasterHeldRepeat: true };
  const base = {
    weapon: { kind: 'blaster' },
    _prevIntent: { fire: true, sub: false, squid: false },
  };
  assert.deepEqual(blasterCancellationEdge({
    ...base, intent: { fire: true, sub: true, squid: false },
  }, runner), { sub: 3 / 60, squid: 4 / 60, latch: true });
  assert.deepEqual(blasterCancellationEdge({
    ...base, intent: { fire: true, sub: false, squid: true },
  }, runner), { sub: 3 / 60, squid: 4 / 60, latch: true });
  assert.deepEqual(blasterCancellationEdge({
    ...base, intent: { fire: false, sub: false, squid: false },
  }, runner), { sub: 3 / 60, squid: 4 / 60, latch: false });
  assert.equal(blasterCancellationEdge({
    ...base, intent: { fire: true, sub: false, squid: false },
  }, runner), null);
  assert.equal(blasterCancellationEdge({
    ...base, weapon: { kind: 'shooter' }, intent: { fire: false, sub: true, squid: true },
  }, runner), null);
  assert.equal(blasterCancellationEdge({
    ...base, intent: { fire: false, sub: true, squid: true },
  }, { s3BlasterHeldRepeat: false }), null);
});

test('build adapter routes both flight and collision Blaster paint through fidelity owners', () => {
  const flightAdapter = fs.readFileSync(new URL('../weapons-adapter.mjs', import.meta.url), 'utf8');
  const burstAdapter = fs.readFileSync(new URL('../adapter.mjs', import.meta.url), 'utf8');
  assert.match(flightAdapter, /applyFidelityBlasterFlightPaint\(this, p\)/);
  assert.match(burstAdapter, /applyFidelityBlasterBurstPaint\(this, p, c, direct\)/);
});
