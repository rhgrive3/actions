import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptClothDerivativeFlow } from '../cloth-derivative-adapter.mjs';
import { adaptQualitySource, qualityIdentity } from '../adapter.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';

const rel = 'src/game/character-mats.js';
const original = fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');

test('only the two reviewed cloth blocks change; existing decoration bodies stay intact', () => {
  const changed = adaptClothDerivativeFlow(rel, original);
  assert.equal(adaptClothDerivativeFlow('src/game/character.js', original), original);
  for (const text of [
    'float iwTeeH = iwH, iwTeeShine = iwShine;',
    'if (!(p.z > 0.0)) { base = iwTeeBase; iwH = iwTeeH; iwShine = iwTeeShine; }',
    'base = iwShortBase; iwH = iwShortH; iwAO = iwShortAO;',
    'if (p.z > 0.0) { base = iwFrontBase; iwH = iwFrontH; iwAO = iwFrontAO; }',
  ]) assert.equal(changed.split(text).length, 2, text);
  // Unrelated material math and the normal/roughness/metalness/AO owners are unchanged.
  for (const marker of ['const NOISE =', 'const BUMP =', 'const HURT_FRAG =']) {
    const start = original.indexOf(marker), stop = original.indexOf('\n`;', start) + 3;
    assert.ok(changed.includes(original.slice(start, stop)));
  }
  const downstream = original.indexOf('      fRough:', original.indexOf('export function makeClothMaterial'));
  assert.ok(changed.endsWith(original.slice(downstream)));
  assert.equal((changed.match(/pow\(/g) || []).length, (original.match(/pow\(/g) || []).length);
  assert.equal((changed.match(/smoothstep\(/g) || []).length, (original.match(/smoothstep\(/g) || []).length);
  assert.equal((changed.match(/normal = iwBumpN\(normal, iwH, -vViewPosition\);/g) || []).length, (original.match(/normal = iwBumpN\(normal, iwH, -vViewPosition\);/g) || []).length);
  assert.ok(changed.includes("fMetal: 'metalnessFactor = iwCls == 7.0 ? 1.0 : 0.0;'"));
});

test('missing, duplicated, changed or already-transformed blocks fail closed', () => {
  for (const source of [
    original.replace('// chest emblem', '// moved emblem'),
    original + '\n// chest emblem',
    original.replace('iwShine += 0.35 * e.x;', 'iwShine += 0.36 * e.x;'),
    original.replace('float fly = iwSdSeg', 'float changedFly = iwSdSeg'),
    adaptClothDerivativeFlow(rel, original),
  ]) assert.throws(() => adaptClothDerivativeFlow(rel, source), /Cloth derivative/);
});

test('production composition includes the correction but never ships the build-only transformer', () => {
  const composed = adaptQualitySource(rel, original);
  assert.equal(composed.split('vec3 iwTeeBase = base;').length, 2);
  assert.equal(composed.split('vec3 iwShortBase = base;').length, 2);
  assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/cloth-derivative-adapter.mjs'));
  assert.ok(JSON.stringify(qualityIdentity()).includes('cloth-derivative-adapter.mjs'));
  assert.ok(!composed.includes('cloth-derivative-adapter.mjs'));
});
