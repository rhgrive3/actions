import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { numericStatus } from '../../../scripts/sync-inkwave-numeric-status.mjs';

// Audited against the raw 11.3.0 WeaponSpPogo table in the Drive source bundle.
// SHA256: 9edc75af8698166c89191cfa07c22aa3fda5ce4ea4d0ffaac600bd18be41e910
// This test tracks source provenance only, NOT Nintendo's unextracted damage
// falloff function, splashdown animation, fall height, or engine-state timing.
const profile = JSON.parse(readFileSync(new URL('../profile.json', import.meta.url), 'utf8'));
const ledger = JSON.parse(readFileSync(new URL('../reference/numeric-status.json', import.meta.url), 'utf8'));
const path = 'data/parameter/1130/weapon/WeaponSpPogo.game__GameParameterTable.json#/GameParameters/BlastParamNormal/DistanceDamage/';
const rows = [
  ['damageMax', '0/Damage', 2200, 0.1, 220],
  ['damageMin', '1/Damage', 600, 0.1, 60],
  ['damageNearRadius', '0/Distance', 6.4, 1, 6.4],
  ['damageRadius', '1/Distance', 9.6, 1, 9.6],
];

test('#966/#912 11.3.0 Pogo endpoints are traceable without borrowing legacy SuperLanding numbers', () => {
  for (const [field, suffix, rawValue, factor, expected] of rows) {
    const key = 'specials.slam.' + field;
    assert.equal(profile.specials.slam[field], expected);
    assert.deepEqual(profile.bindings[key], {parameter: path + suffix, index: null, factor, rawValue});
    assert.equal(rawValue * factor, expected);
    assert.deepEqual(ledger[key], {
      value: expected,
      status: 'derived from pinned extracted data; physical scale unverified',
      binding: profile.bindings[key],
    });
  }
  assert.notEqual(rows[0][2], 1800, 'retail Pogo is not the legacy single SuperLanding blast');
});

test('#966 no extracted Pogo Hang parameter is invented from the 60F Rise_Frame', () => {
  assert.equal(profile.specials.slam.hang, 0.5, 'preserve current tested local timing');
  assert.equal(profile.bindings['specials.slam.hang'], undefined);
  assert.equal(ledger['specials.slam.hang'].binding, null);
  assert.deepEqual(ledger, numericStatus(profile), 'numeric ledger is exactly reproducible');
});
