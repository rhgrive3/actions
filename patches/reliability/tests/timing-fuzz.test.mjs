import test from 'node:test';
import assert from 'node:assert/strict';
import { timingFuzz } from './timing-fuzz.mjs';

test('12,000 actual-source timing cases deliver a legal press once, independent of cadence and prior hold', async () => {
  const result = await timingFuzz();
  assert.equal(result.cases, 12000);
  assert.equal(result.passed, result.cases, JSON.stringify(result.rows));
  assert.equal(result.duplicates, 0);
  assert.equal(result.releaseFailures, 0);
});
