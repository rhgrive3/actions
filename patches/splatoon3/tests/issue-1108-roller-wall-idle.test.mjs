import assert from 'node:assert/strict';
import { stationaryRollerWallPaintEligible } from '../runtime/roller.mjs';
const base = { firing: true, wall: true, stick: false, alive: true, ink: 50, cooldown: 0 };
assert.equal(stationaryRollerWallPaintEligible(base), true, 'ZR wall without stick can paint');
assert.equal(stationaryRollerWallPaintEligible({ ...base, wall: false }), false);
assert.equal(stationaryRollerWallPaintEligible({ ...base, firing: false }), false);
assert.equal(stationaryRollerWallPaintEligible({ ...base, ink: 0 }), false);
assert.equal(stationaryRollerWallPaintEligible({ ...base, stick: true }), false, 'moving stripe stays separate');
console.log('stationary roller wall contact admission passed');
