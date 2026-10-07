import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptAimProfiles } from '../aim-profile-adapter.mjs';
import { adaptControls } from '../../reliability/controls-adapter.mjs';
const rel = 'src/ui/menus.js';
const raw = fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const withControls = adaptControls(rel, raw);
function controls(s) {
  const a = s.indexOf("  { id: 'controls'"), b = s.indexOf('\n  ] },', a);
  assert.ok(a >= 0 && b > a);
  return new Function('sgnFmt', 'pctFmt', 'return (' + s.slice(a, b + 6) + ');')(v => String(v), v => String(v)).rows;
}
test('raw Controls gain one independent profile setting row per key', () => {
  const rows = controls(adaptAimProfiles(rel, raw));
  for (const key of ['aimProfile', 'gyro', 'gyroSens', 'padSensitivity', 'invertY', 'invertX']) assert.equal(rows.filter(r => r.key === key).length, 1, key);
  assert.equal(rows.filter(r => r.key === 'padInvertX').length, 0);
  assert.equal(rows.find(r => r.key === 'sensitivity').kbm, true);
});
test('Controls predecessor retains its global padInvertX row unchanged and in place', () => {
  const prior = controls(withControls).find(r => r.key === 'padInvertX');
  const rows = controls(adaptAimProfiles(rel, withControls));
  assert.deepEqual(rows.find(r => r.key === 'padInvertX'), prior);
  assert.equal(rows.filter(r => r.key === 'padInvertX').length, 1);
  const keys = rows.map(r => r.key);
  assert.ok(keys.indexOf('padSensitivity') < keys.indexOf('padInvertX'));
  assert.ok(keys.indexOf('padInvertX') < keys.indexOf('invertY'));
  assert.equal(rows.filter(r => r.key === 'invertX').length, 1);
});
test('unknown, duplicate and repeated Controls profile connections fail closed', () => {
  const row = "    { key: 'padInvertX', label: 'Invert right-stick horizontal look', type: 'toggle', help: 'Reverse controller left/right look only. Mouse, touch and gyro are unchanged.' },";
  for (const input of [withControls.replace(row, row + '\n' + row), raw.replace("label: 'Controller sensitivity'", "label: 'unknown predecessor'"), adaptAimProfiles(rel, withControls)])
    assert.throws(() => adaptAimProfiles(rel, input), /aim profile/);
});
