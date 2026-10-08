import assert from 'node:assert/strict';
import { BLASTER_BURST_PARAM_DEFAULTS, resolvedBlasterBurstParam } from '../runtime/weapons-fidelity.mjs';

assert.deepEqual(resolvedBlasterBurstParam({ BlasterBurstParam: {} }), BLASTER_BURST_PARAM_DEFAULTS);
assert.equal(resolvedBlasterBurstParam({ BlasterBurstParam: { SplashDropPaintShotColHitRadius: 2.5 } }).SplashDropPaintRadius, 3.2);
assert.equal(resolvedBlasterBurstParam({ BlasterBurstParam: { SplashPaintRadius: 1.8 } }).SplashPaintRadius, 1.8);
assert.equal(resolvedBlasterBurstParam(null), null);
console.log('Blaster sparse source-default resolution passed');
