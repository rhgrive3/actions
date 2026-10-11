import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSubSpecialFidelity } from '../sub-special-adapter.mjs';
import { adaptSource, replaceOnce } from '../adapter.mjs';
import { fidelityThrowVelocity, SUB_SPECIAL_FIDELITY } from '../runtime/sub-special-fidelity.mjs';

const root = new URL('../../../', import.meta.url);
const source = fs.readFileSync(new URL('inkwave-public/src/game/weapons.js', root), 'utf8');

test('Splat Bomb arm condition is a fail-closed build-time source connection', () => {
  const out = adaptSource('src/game/weapons.js', source);
  assert.match(out, /if \(b\.fuse < 0\) \{/);
  assert.doesNotMatch(out, /if \(hit\.normal\.y > 0\.6 && b\.fuse < 0\) \{/);
  const anchor = '        if (hit.normal.y > 0.6 && b.fuse < 0) {';
  assert.throws(() => adaptSource('src/game/weapons.js', source.replace(anchor, '')), /conflict/);
  assert.throws(() => adaptSource('src/game/weapons.js', source + '\n' + anchor), /conflict/);
});

test('sub/special adapter leaves unrelated source files untouched', () => {
  assert.equal(adaptSubSpecialFidelity('src/game/physics.js', 'UNCHANGED', replaceOnce), 'UNCHANGED');
});

test('pinned sub/special reference records all directly checked 11.3.0 fields', () => {
  const ref = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/reference/sub-special-fidelity-reference.json', root)));
  assert.equal(ref.referenceVersion, '11.3.0');
  assert.equal(ref.sourceCommit, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  // The original 25 Bomb/Storm fields stay locked, while new source-backed
  // gear curves add records. Do not freeze the total at the pre-gear inventory.
  assert.equal(ref.explicitFields.filter(field => ['bomb','storm'].includes(field.sourceId)).length, 25);
  const byKey = new Map(ref.explicitFields.map(field => [`${field.sourceId}:${field.pointer}`, field.value]));
  assert.equal(byKey.size, ref.explicitFields.length, 'source pointers are unique');
  const expectedGearFields = [
    ['zipcaster', '/GameParameters/WeaponParam/InkCapacityRt', 1.5],
    ['zipcaster', '/GameParameters/WeaponParam/InkConsume_Hook', {High:.015,Low:.04,Mid:.025}],
    ['zipcaster', '/GameParameters/WeaponParam/InkConsume_PerSec', {High:.12,Low:.15,Mid:.1305}],
    ['reefslider', '/GameParameters/BulletBlastParam/SubSpecialSpecUpList/0', {SpecUpType:'DistanceDamageDistanceRate',Value:{High:1.2,Low:1,Mid:1.1}}],
    ['reefslider', '/GameParameters/BulletBlastParam/SubSpecialSpecUpList/1', {SpecUpType:'PaintRadius',Value:{High:9.012,Low:7.51,Mid:8.26}}],
    ['screen', '/GameParameters/WallParam/MoveSpeed', {High:.06,Low:.04,Mid:.053}],
    ['inkjet', '/GameParameters/BlastParam/SubSpecialSpecUpList/0', {Value:{High:4,Low:3.2,Mid:3.6}}],
    ['inkjet', '/GameParameters/BlastParam/SubSpecialSpecUpList/1', {SpecUpType:'DistanceDamageDistanceRate',Value:{High:1.3,Low:1,Mid:1.15}}],
    ['superChump', '/GameParameters/IceParam/BlastParam/SubSpecialSpecUpList/0', {Value:{High:4.1,Low:3.5,Mid:3.8}}],
    ['superChump', '/GameParameters/IceParam/BlastParam/SubSpecialSpecUpList/3', {SpecUpType:'DistanceDamageDistanceRate',Value:{High:1.2,Low:1,Mid:1.1}}],
  ];
  for (const [id,pointer,value] of expectedGearFields) assert.deepEqual(byKey.get(`${id}:${pointer}`),value,`${id} ${pointer}`);
  for (const field of ref.explicitFields) assert.ok(ref.sources.some(source => source.id === field.sourceId), `${field.sourceId} has a pinned source`);
  assert.equal(ref.sources.every(source => source.official === false), true);
  assert.equal(ref.explicitUnknowns.length > 0, true);
});

test('throw transform uses the extracted local Y/Z basis and player inheritance caps', () => {
  const out = { set(x, y, z) { this.x=x; this.y=y; this.z=z; return this; } };
  const a = { aimYaw: 0, aimPitch: 0, vel: { x: 3, y: 0, z: -2 } };
  const v = fidelityThrowVelocity(a, 'bomb', out);
  assert.ok(Math.abs(v.x - 4.8) < 1e-9);
  assert.ok(Math.abs(v.y - 14.4) < 1e-9);
  assert.ok(Math.abs(v.z - 64) < 1e-9);
  const up = fidelityThrowVelocity({ ...a, aimPitch: .6, vel: { x:0, y:8, z:0 } }, 'bomb', { ...out });
  const storm = fidelityThrowVelocity({ ...a, aimPitch: .6, vel: { x:0, y:8, z:0 } }, 'storm', { ...out });
  assert.ok(up.y > storm.y);
  assert.equal(SUB_SPECIAL_FIDELITY.bomb.inheritYMax, 19.2);
  assert.equal(SUB_SPECIAL_FIDELITY.storm.inheritYMax, 9.6);
});
