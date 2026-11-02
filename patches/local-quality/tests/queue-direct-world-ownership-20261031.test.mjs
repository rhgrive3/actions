import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptQueueVisualWorld20261031} from '../queue-visual-world-20261031-adapter.mjs';
import {directWorldBaseline, raw, rawBefore, composed} from './queue-visual-world-20261031.helper.mjs';

const sha256 = source => crypto.createHash('sha256').update(source).digest('hex');
const paths = ['src/world/props-core.js', 'src/world/props-marina-vessels.js'];
const stageBackdropEpoch = `\n// Backdrops live outside the playable bounds. They have no collider and do not cast shadows onto the arena;\n// the original symmetrical cover, paint and navigation geometry remain authoritative.\nD.plaza_backdrop = {\n  desc: 'Sunlit shopfronts behind the plaza spawn.', params: {}, variants: 1, mount: 'ground',\n  build(B) {\n    const buildings = [\n      { x: -17, w: 12, h: 9, wall: '#e6d5b9', trim: '#b9715a' },\n      { x: -5, w: 11, h: 11, wall: '#ddd4be', trim: '#528f91' },\n      { x: 7, w: 12, h: 8.5, wall: '#e9ddc7', trim: '#d09b56' },\n      { x: 19, w: 10, h: 10, wall: '#d4dfd8', trim: '#6b9eaa' },\n    ];\n    for (const b of buildings) {\n      B.box('paint~ns', b.wall, b.w, b.h, 2.4, b.x, b.h / 2, 0);\n      B.box('paint~ns', b.trim, b.w + 0.25, 0.32, 2.7, b.x, b.h, 0);\n      B.box('paint~ns', b.trim, b.w - 0.6, 0.45, 0.24, b.x, 4.8, 1.25);\n      for (let x = b.x - b.w / 2 + 1.5; x < b.x + b.w / 2 - 0.8; x += 2.3) {\n        B.box('paint~ns', '#58757b', 1.25, 1.8, 0.08, x, b.h - 2.1, 1.23);\n        B.box('paint~ns', '#f3e8d0', 1.42, 0.1, 0.1, x, b.h - 3.05, 1.29);\n      }\n      // Striped awnings and fascia make the skyline read as a lively shopping street.\n      B.box('paint~ns', b.trim, b.w - 0.8, 0.25, 1.1, b.x, 4.05, 1.65);\n      for (let x = b.x - b.w / 2 + 0.9; x < b.x + b.w / 2 - 0.5; x += 1.4)\n        B.box('paint~ns', '#f4e9d3', 0.52, 0.27, 1.12, x, 4.05, 1.65);\n    }\n  },\n};\n\nD.terminal_backdrop = {\n  desc: 'Warehouse and cargo gantry beyond the terminal spawn.', params: {}, variants: 1, mount: 'ground',\n  build(B) {\n    B.box('paint~ns', '#a9b6b2', 47, 8.5, 3, 0, 4.25, 0);\n    B.box('metal~ns', '#536d78', 47.5, 0.45, 3.3, 0, 8.6, 0);\n    B.box('paint~ns', '#cf9551', 46, 0.4, 0.12, 0, 5.3, 1.55);\n    for (let x = -21; x <= 21; x += 6) {\n      B.box('metal~ns', '#6e8587', 0.3, 8.5, 0.18, x, 4.25, 1.58);\n      B.box('paint~ns', '#49646d', 3.7, 1.3, 0.1, x + 2.4, 6.8, 1.58);\n    }\n    // A portal crane frames the yard above the existing spawn wall.\n    for (const x of [-22, 22]) {\n      B.box('metal~ns', '#d59642', 1.05, 16, 1.05, x, 8, 2.2);\n      B.box('metal~ns', '#4e626b', 1.5, 0.4, 1.5, x, 15.8, 2.2);\n    }\n    B.box('metal~ns', '#d59642', 45, 1.1, 1.2, 0, 15.6, 2.2);\n    B.box('metal~ns', '#526771', 45, 0.22, 1.35, 0, 16.25, 2.2);\n    B.box('metal~ns', '#526771', 3.2, 0.75, 1.6, 8, 14.65, 2.2);\n    for (const x of [7.1, 8.9]) B.box('metal~ns', '#526771', 0.09, 3.1, 0.09, x, 12.75, 2.2);\n    B.box('metal~ns', '#d59642', 2.5, 0.3, 0.6, 8, 11.15, 2.2);\n  },\n};\n`;

for (const rel of paths) test('direct owner keeps the previously emitted bytes and immutable old control: ' + rel, () => {
  assert.equal(directWorldBaseline.schema, 1);
  assert.equal(directWorldBaseline.sourceSha, 'b60a2216a4a553be9ffa6b80f2c30c325aebfd55');
  const snapshot = directWorldBaseline.modules[rel];
  const before = rawBefore(rel), current = raw(rel);
  assert.equal(sha256(before), snapshot.rawSha256, 'old raw bytes must retain their recorded identity');
  assert.equal(composed(rel, true), before, 'before=true must still execute the real old source');
  assert.notEqual(before, current, 'the optimization comparison must not become self-comparison');
  const priorCurrent = rel === 'src/world/props-core.js' ? (assert.equal(sha256(current), '52dab30705cf8435374d74e5774bf453c68357ba9e7f42c130da0c94a8425f45'), assert.equal(current.split(stageBackdropEpoch).length, 2), current.replace(stageBackdropEpoch, '')) : current;
  assert.equal(sha256(priorCurrent), snapshot.composedSha256, 'adopted source must equal the former composed bytes');
  assert.equal(adaptBuildSource(rel, current), current, 'direct-owned production source must have zero build-time rewrite');
  assert.equal(adaptQueueVisualWorld20261031(rel, current), current, 'the removed adapter must leave the owner intact');
  assert.equal(adaptQueueVisualWorld20261031(rel, before), before, 'the removed adapter must not rewrite the old raw owner either');
});
