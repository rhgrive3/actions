import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../adapter.mjs';
import { adaptSubSpecialFidelity } from '../sub-special-adapter.mjs';
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
  assert.equal(adaptSubSpecialFidelity('src/game/physics.js', 'UNCHANGED'), 'UNCHANGED');
});

test('pinned sub/special reference records all directly checked 11.3.0 fields', () => {
  const ref = JSON.parse(fs.readFileSync(new URL('patches/splatoon3/reference/sub-special-fidelity-reference.json', root)));
  assert.equal(ref.referenceVersion, '11.3.0');
  assert.equal(ref.sourceCommit, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.equal(ref.explicitFields.length, 25);
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
