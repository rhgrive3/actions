import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';

assert.ok(!process.env.INKWAVE_BUILT_SITE, 'Build composition contracts are source-only; native CI exercises emitted owners');
const raw = fs.readFileSync(new URL('../../../inkwave-public/src/main.js', import.meta.url), 'utf8');
const entry = '  _updateAttract(dt) {';
const identity = '        if (this.match !== resetMatch || this._matchFlow !== resetFlow) return;';

test('complete production composition preserves fixed-clock and delayed-reset pause owners', () => {
  const composed = adaptBuildSource('src/main.js', raw);
  assert.doesNotThrow(() => parse(composed, { ecmaVersion: 'latest', sourceType: 'module' }));
  assert.equal(composed.split(entry + '\n    if (this.match?.paused) return;').length - 1, 1);
  assert.equal(composed.split(identity + '\n        if (!this.match?.attract || this.match.paused) return;').length - 1, 1);
  assert.match(composed, /runSimulation\(this,/);
  assert.equal(composed.includes('      if (m.attract) this._updateAttract(dt);'), false);
  assert.equal(composed.split('this._fade(1, 400).then(() => {').length - 1, 1);
  assert.match(composed, /this\._setPalette\(this\._pickPalette\(\)\); this\._startAttract\(\); this\._fade\(0, 600\);/);
});

test('missing or duplicate attract method remains a fail-closed composition error', () => {
  assert.equal(raw.split(entry).length - 1, 1);
  assert.throws(() => adaptBuildSource('src/main.js', raw.replace(entry, '  _unexpectedAttract(dt) {')), /conflict/);
  assert.throws(() => adaptBuildSource('src/main.js', raw.replace(entry, entry + '\n    // ' + entry)), /conflict/);
});

test('missing delayed reset cannot silently drop its existing match and flow owner', () => {
  const reset = 'this._fade(1, 400).then(() => { this._setPalette(this._pickPalette()); this._startAttract(); this._fade(0, 600); });';
  assert.equal(raw.split(reset).length - 1, 1);
  assert.throws(() => adaptBuildSource('src/main.js', raw.replace(reset, 'void 0;')), /attract conflict/);
});
