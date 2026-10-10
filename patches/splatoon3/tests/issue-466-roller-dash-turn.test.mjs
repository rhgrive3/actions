import test from 'node:test';
import assert from 'node:assert/strict';
import { rollingMovementSpeed } from '../runtime/movement-physics.mjs';
import { fixture } from './weapon-edgecases-fixture.mjs';

test('#466 S3 Roller dash speed uses distinct 0.108/f turn-break while reversing', () => {
  const w={rollBaseSpeed:6.48,rollSpeed:7.92,rollDashTime:1.5,rollDashTurnBreakSpeed:6.48};
  const a={weapon:w,intent:{move:{x:0,z:1}},vel:{x:0,z:7.92}};
  const r={a,rollT:1.49};
  assert.equal(rollingMovementSpeed(r),6.48);
  r.rollT=1.5;assert.equal(rollingMovementSpeed(r),7.92);
  a.intent.move.z=-1;assert.equal(rollingMovementSpeed(r),6.48);
  a.intent.move.z=1;assert.equal(rollingMovementSpeed(r),7.92);
  r.rollT=1;assert.equal(rollingMovementSpeed(r),6.48);
});

test('#466 real Roller runtime profile has turning-speed source and does not affect other weapons', async () => {
  const f=await fixture(),a=f.make('roller'),runner=a.weaponRunner;
  const w=a.weapon;
  assert.ok(Math.abs(w.rollDashTurnBreakSpeed-6.48)<1e-7);
  assert.ok(Math.abs(w.rollSpeed-7.92)<1e-7);
  a.form='kid';a.grounded=true;runner.rolling=true;runner.rollT=1.5;
  a.intent.move.set(0,0,1);a.vel.set(0,0,6);
  assert.equal(rollingMovementSpeed(runner),w.rollSpeed);
  a.intent.move.z=-1;assert.equal(rollingMovementSpeed(runner),w.rollDashTurnBreakSpeed);
  a.intent.move.z=1;assert.equal(rollingMovementSpeed(runner),w.rollSpeed);
});
