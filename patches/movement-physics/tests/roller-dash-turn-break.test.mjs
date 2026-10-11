import test from 'node:test';
import assert from 'node:assert/strict';
import { rollingMovementSpeed } from '../../splatoon3/runtime/movement-physics.mjs';
const roller = () => ({
  a: { weapon: {kind:'roller',rollBaseSpeed:6.48,rollDashTurnBreakSpeed:6.48,rollSpeed:7.92,rollDashTime:1.5},
       vel:{x:0,z:7.92},intent:{move:{x:0,z:1}} },
  rollT:2,
});
test('#466 normal roll, straight 90F dash and hard turn use distinct S3 speed caps',()=>{
  const r=roller();
  r.rollT=1.49;assert.equal(rollingMovementSpeed(r),6.48);
  r.rollT=1.5;assert.equal(rollingMovementSpeed(r),7.92);
  r.a.intent.move.z=-1;assert.equal(rollingMovementSpeed(r),6.48);
  r.a.intent.move.z=0;r.a.intent.move.x=1;assert.equal(rollingMovementSpeed(r),7.92);
  r.a.intent.move.z=1;r.a.intent.move.x=0;assert.equal(rollingMovementSpeed(r),7.92);
});
test('#466 reversal brake does not fire with no stick or near-zero velocity',()=>{
  const r=roller();r.a.intent.move.z=0;assert.equal(rollingMovementSpeed(r),7.92);
  r.a.intent.move.z=-1;r.a.vel.z=0;assert.equal(rollingMovementSpeed(r),7.92);
});
