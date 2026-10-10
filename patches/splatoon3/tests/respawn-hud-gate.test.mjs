import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRespawnRing} from '../../../scripts/lib/inkwave-respawn-hud.mjs';
test('HUD ring gate allows CSS serialization rounding, not stale or invalid evidence', () => {
 const circumference=2*Math.PI*44, half=circumference/2;
 for (const offset of [String(half),half.toFixed(6),half.toPrecision(6),half.toFixed(6)+'px']) assert.ok(Math.abs(assertRespawnRing(offset,circumference,.5)-.5)<1e-6);
 for (const offset of ['', 'NaN', 'Infinity', '50%', String(half+.01), String(circumference), '0']) assert.throws(()=>assertRespawnRing(offset,circumference,.5));
 assert.throws(()=>assertRespawnRing('1',0,.5));assert.throws(()=>assertRespawnRing('1',circumference,NaN));
 assert.equal(assertRespawnRing('0',circumference,0),0);
});
