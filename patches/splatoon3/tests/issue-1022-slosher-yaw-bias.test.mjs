import assert from 'node:assert/strict';
import { biasedSourceYaw, slosherYawOffset } from '../runtime/weapons-fidelity.mjs';
const deg=v=>v*Math.PI/180;
assert.equal(biasedSourceYaw(.75,4.5,.5),deg(2.25)); // uniform control
assert.equal(biasedSourceYaw(.25,4.5,.5),-deg(2.25));
assert.equal(biasedSourceYaw(.75,4.5,0),0);
assert.equal(biasedSourceYaw(1,4.5,1),deg(4.5));
assert.equal(biasedSourceYaw(0,4.5,1),-deg(4.5));
assert.ok(biasedSourceYaw(.75,4.5,.65)>biasedSourceYaw(.75,4.5,.5));
assert.ok(biasedSourceYaw(.75,4.5,.65)<=deg(4.5));
console.log('Bucket Slosher source yaw bias regression passed');

const unit1={ RandomRotateYDegree:4.5, RandomRotateYBias:.65, RandomRotateYOffOrderNum:[0] };
const unit2={ RandomRotateYDegree:4.5, RandomRotateYBias:.65, RandomRotateYOffOrderNum:[] };
let draws=0;
const fixed=()=>{draws++;return .75;};
assert.equal(slosherYawOffset(unit1,0,fixed),0,'the source-exempt first glob does not consume RNG');
assert.equal(draws,0);
for (const [u,index] of [[unit1,1],[unit1,2],[unit1,3],[unit2,0],[unit2,4]]) {
  assert.equal(slosherYawOffset(u,index,fixed),biasedSourceYaw(.75,4.5,.65));
}
assert.equal(draws,5,'one RNG draw per admitted glob, none for excluded glob');
assert.ok(slosherYawOffset(unit1,1,()=>.75)>deg(2.25),
  '0.65 source bias promotes outer yaw rather than the inverted 1+bias power');
assert.equal(slosherYawOffset({...unit1,RandomRotateYBias:0},1,()=>.75),0);
assert.equal(slosherYawOffset({...unit1,RandomRotateYBias:1},1,()=>.75),deg(4.5));
assert.equal(slosherYawOffset({...unit1,RandomRotateYBias:.5},1,()=>.75),deg(2.25));
