import test from 'node:test';
import assert from 'node:assert/strict';
import { LINEAGE_FIELDS, classifyNumeric, compareLineage } from '../../../scripts/measure-splatoon2-3-lineage.mjs';

const lookup = (rows, family, key) => {
  const row = rows.find(r => r.family === family && r.key === key);
  assert.ok(row, 'missing comparison ' + family + '.' + key);
  return row;
};

test('S2 v5.5.0 archived weapon values are compared to pinned S3 v11.3.0 with explicit per-field units', () => {
  const r = compareLineage(), rows = r.rows;
  assert.equal(LINEAGE_FIELDS.length, 41);
  assert.equal(rows.length, 41);
  assert.deepEqual(r.counts, {
    'same-extracted-value': 27,
    'changed-extracted-value': 6,
    'omitted-s3-default-unknown': 8,
  });
  for (const row of rows) {
    assert.ok(Number.isFinite(row.s2Converted), row.key);
    if (row.status === 'same-extracted-value')
      assert.ok(Math.abs(row.s2Converted - row.s3Explicit) <= 1e-9, row.key);
    else if (row.status === 'omitted-s3-default-unknown')
      assert.equal(row.s3Explicit, null, 'omitted typed S3 default is not the S2 value');
    else assert.notEqual(row.s2Converted, row.s3Explicit);
  }
});

test('S2 shooter has the same ink and scaled splash distance but changed S3 spread endpoints', () => {
  const rows = compareLineage().rows;
  assert.ok(Math.abs(lookup(rows, 'shooter', 'splash-between').s2Converted - 9.2) < 1e-9);
  assert.equal(lookup(rows, 'shooter', 'ink-consume').s3Explicit, .0092);
  assert.equal(lookup(rows, 'shooter', 'move-speed').s3Explicit, .072);
  assert.deepEqual([lookup(rows,'shooter','stand-spread').s2, lookup(rows,'shooter','stand-spread').s3Explicit], [6, 4.86]);
  assert.deepEqual([lookup(rows,'shooter','jump-spread').s2, lookup(rows,'shooter','jump-spread').s3Explicit], [12, 11.66]);
});

test('S2 Spinner retained seven sampled values; S2 Dualies slide timing differs, omitted S3 motion law cannot be copied', () => {
  const rows = compareLineage().rows;
  const spinner = rows.filter(r => r.family === 'splatling');
  assert.equal(spinner.length, 7);
  assert.ok(spinner.every(r => r.status === 'same-extracted-value'));
  assert.equal(lookup(rows, 'dualies', 'move-frame').s2, 16);
  assert.equal(lookup(rows, 'dualies', 'move-frame').s3Explicit, 12);
  assert.equal(lookup(rows, 'dualies', 'ink-consume').s3Explicit, .07);
  for (const key of ['move-distance','move-damping','air-slide-distance','post-slide-duration','input-accept-window']) {
    assert.equal(lookup(rows, 'dualies', key).status, 'omitted-s3-default-unknown');
  }
});

test('S2 Blaster and S3 Blaster explicitly disagree on collision drop radius and collision blast volume', () => {
  const rows = compareLineage().rows;
  const drop = lookup(rows, 'blaster', 'collision-drop');
  assert.deepEqual([drop.s2, drop.s2Converted, drop.s3Explicit], [20, 2, 2.5]);
  assert.equal(drop.status, 'changed-extracted-value');
  const volume = lookup(rows, 'blaster', 'collision-radius-rate');
  assert.deepEqual([volume.s2, volume.s3Explicit], [.5, .4234]);
  assert.equal(volume.status, 'changed-extracted-value');
  assert.ok(Math.abs(lookup(rows, 'blaster', 'collision-sphere').s2Converted - 1.4) <= 1e-9);
  assert.equal(lookup(rows, 'blaster', 'collision-sphere').status, 'omitted-s3-default-unknown');
  assert.equal(lookup(rows, 'blaster', 'timed-sphere').status, 'omitted-s3-default-unknown');
});

test('missing S3 sparse parameter never silently takes zero, a previous S2 value or a universally-scaled number', () => {
  assert.equal(classifyNumeric(16, null, 1).status, 'omitted-s3-default-unknown');
  assert.equal(classifyNumeric(200, 20, .1).status, 'same-extracted-value');
  assert.equal(classifyNumeric(200, 20, 1).status, 'changed-extracted-value');
  assert.throws(() => classifyNumeric(NaN, 2, .1), /Invalid/);
  assert.throws(() => classifyNumeric(1, Infinity), /Non-finite/);
});

test('S2 Hot Blaster 5.5 source values normalize in fifteen fields but InkRecoverStop changed in S3', () => {
  const rows = compareLineage().rows;
  const main = rows.filter(r => r.family === 'blaster' && r.source2.startsWith('BlasterMiddle.'));
  assert.equal(main.length, 16);
  assert.equal(main.filter(r => r.status === 'same-extracted-value').length, 15);
  const changed = main.filter(r => r.status === 'changed-extracted-value');
  assert.deepEqual(changed.map(r => r.key), ['ink-recover-stop']);
  assert.deepEqual([changed[0].s2, changed[0].s3Explicit], [60, 57],
    'do not import S2 original InkRecoverStop into S3');
  assert.deepEqual([lookup(rows,'blaster','spawn-speed').s2, lookup(rows,'blaster','spawn-speed').s3Explicit], [9.45, .945]);
  assert.deepEqual([lookup(rows,'blaster','flight-spacing').s2, lookup(rows,'blaster','flight-spacing').s3Explicit], [15, 1.5]);
  assert.deepEqual([lookup(rows,'blaster','repeat-frame').s2, lookup(rows,'blaster','repeat-frame').s3Explicit], [50, 50]);
});
