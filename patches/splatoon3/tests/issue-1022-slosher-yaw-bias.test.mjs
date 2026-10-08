import assert from 'node:assert/strict';
import { biasedSourceYaw } from '../runtime/weapons-fidelity.mjs';
const deg=v=>v*Math.PI/180;
assert.equal(biasedSourceYaw(.75,4.5,.5),deg(2.25)); // uniform control
assert.equal(biasedSourceYaw(.25,4.5,.5),-deg(2.25));
assert.equal(biasedSourceYaw(.75,4.5,0),0);
assert.equal(biasedSourceYaw(1,4.5,1),deg(4.5));
assert.equal(biasedSourceYaw(0,4.5,1),-deg(4.5));
assert.ok(biasedSourceYaw(.75,4.5,.65)>biasedSourceYaw(.75,4.5,.5));
assert.ok(biasedSourceYaw(.75,4.5,.65)<=deg(4.5));
console.log('Bucket Slosher source yaw bias regression passed');
