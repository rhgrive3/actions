import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptQueueVisualWorld20261031} from '../queue-visual-world-20261031-adapter.mjs';
import {directWorldBaseline, raw, rawBefore, composed} from './queue-visual-world-20261031.helper.mjs';

const sha256 = source => crypto.createHash('sha256').update(source).digest('hex');
const paths = ['src/world/props-core.js', 'src/world/props-marina-vessels.js'];

for (const rel of paths) test('direct owner keeps the previously emitted bytes and immutable old control: ' + rel, () => {
  assert.equal(directWorldBaseline.schema, 1);
  assert.equal(directWorldBaseline.sourceSha, 'b60a2216a4a553be9ffa6b80f2c30c325aebfd55');
  const snapshot = directWorldBaseline.modules[rel];
  const before = rawBefore(rel), current = raw(rel);
  assert.equal(sha256(before), snapshot.rawSha256, 'old raw bytes must retain their recorded identity');
  assert.equal(composed(rel, true), before, 'before=true must still execute the real old source');
  assert.notEqual(before, current, 'the optimization comparison must not become self-comparison');
  assert.equal(sha256(current), snapshot.composedSha256, 'adopted source must equal the former composed bytes');
  assert.equal(adaptBuildSource(rel, current), current, 'direct-owned production source must have zero build-time rewrite');
  assert.equal(adaptQueueVisualWorld20261031(rel, current), current, 'the removed adapter must leave the owner intact');
  assert.equal(adaptQueueVisualWorld20261031(rel, before), before, 'the removed adapter must not rewrite the old raw owner either');
});
