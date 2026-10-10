import assert from 'node:assert/strict';
import { BLASTER_BURST_PARAM_DEFAULTS, resolvedBlasterBurstParam, blasterPaintContract } from '../runtime/weapons-fidelity.mjs';
import fs from 'node:fs';

assert.deepEqual(resolvedBlasterBurstParam({ BlasterBurstParam: {} }), BLASTER_BURST_PARAM_DEFAULTS);
assert.equal(resolvedBlasterBurstParam({ BlasterBurstParam: { SplashDropPaintShotColHitRadius: 2.5 } }).SplashDropPaintRadius, 3.2);
assert.equal(resolvedBlasterBurstParam({ BlasterBurstParam: { SplashPaintRadius: 1.8 } }).SplashPaintRadius, 1.8);
assert.equal(resolvedBlasterBurstParam(null), null);
console.log('Blaster sparse source-default resolution passed');

test('S2 5.5 Middle_Burst and S3 11.3 Middle independently distinguish collision sphere from timed splash', () => {
  const two = JSON.parse(fs.readFileSync(new URL('../reference/splatoon2-550/BlasterMiddle_Burst.json', import.meta.url), 'utf8')).param;
  const three = JSON.parse(fs.readFileSync(new URL('../reference/weapon-audit-1130/WeaponBlasterMiddle.game__GameParameterTable.json', import.meta.url), 'utf8')).GameParameters;
  assert.equal(two.mSphereSplashPaintRadius, 20);
  assert.equal(two.mSphereSplashPaintShotCollisionHitRadius, 14);
  assert.equal(two.mSphereSplashDropPaintRadius, 32);
  assert.equal(three.WeaponParam.RepeatFrame, 50);
  assert.equal(three.SplashSpawnParam.SpawnNum, 7);
  assert.equal(three.BlasterBurstParam.SplashDropPaintShotColHitRadius, 2.5);
  assert.ok(!Object.hasOwn(three.BlasterBurstParam, 'SplashPaintShotColHitRadius'),
    'an omitted S3 type-default is not evidence that it equals the timed radius');
  const contract = blasterPaintContract(three).burst;
  assert.equal(contract.timedSplashRadius, 2.0);
  assert.equal(contract.collisionSplashRadius, 1.4, 'historical S2 14/10 candidate');
  assert.equal(contract.timedDropRadius, 3.2);
  assert.equal(contract.radius, 2.5);
  const explicit = resolvedBlasterBurstParam({ BlasterBurstParam:
    { SplashPaintRadius: 2.4, SplashPaintShotColHitRadius: 1.68 } });
  assert.equal(explicit.SplashPaintShotColHitRadius, 1.68,
    'later S3 explicit overrides always beat historical default');
});
