import test from 'node:test';
import assert from 'node:assert/strict';
import { s3PadMultiplier, legacyPadToS3, clampPadSetting } from '../runtime/pad-sensitivity.mjs';
import { adaptPadSensitivity } from '../pad-sensitivity-adapter.mjs';

test('S3 stick setting is 21 discrete half-step options with centered gain', () => {
  assert.equal(s3PadMultiplier(-5), 0.5);
  assert.equal(s3PadMultiplier(0), 1);
  assert.equal(s3PadMultiplier(5), 2);
  for (let i = -10; i < 10; i++) assert.ok(s3PadMultiplier(i / 2) < s3PadMultiplier((i + 1) / 2));
  assert.equal(clampPadSetting(100), 5);
  assert.equal(clampPadSetting(NaN), 0);
});
test('legacy persisted multipliers preserve default and bounded sensitivity', () => {
  for (const old of [0.5, 0.75, 1, 1.5, 2]) {
    assert.ok(Math.abs(s3PadMultiplier(legacyPadToS3(old)) - old) < 1e-10);
  }
  assert.equal(legacyPadToS3(0), 0);
  assert.equal(legacyPadToS3(999), 5);
});
test('build-only adapter rejects missing/duplicate anchors', () => {
  const once = (s, old, next) => {
    const count = s.split(old).length - 1;
    if (count !== 1) throw Error('anchor mismatch');
    return s.replace(old, next);
  };
  const src = '  padSensitivity: 1.0,';
  assert.match(adaptPadSensitivity('src/config.js', src, once), /padSensitivity: 0/);
  assert.throws(() => adaptPadSensitivity('src/config.js', src + '\n' + src, once), /anchor mismatch/);
});
