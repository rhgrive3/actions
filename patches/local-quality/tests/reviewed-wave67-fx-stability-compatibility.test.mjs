import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { replaceOnce } from '../adapter.mjs';
import { adaptReviewedWave67Gpu } from '../reviewed-wave67-gpu-adapter.mjs';

const rel = 'src/fx/fx.js';
const raw = fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const built = adaptBuildSource(rel, raw);
const apply = source => adaptReviewedWave67Gpu(rel, source, replaceOnce);

test('Wave 6/7 retains its original first-pass and exact legacy idempotence', () => {
  const legacy = apply(raw);
  assert.notEqual(legacy, raw);
  assert.equal(apply(legacy), legacy);
  assert.ok(legacy.includes('float rim = smoothstep(0.16, 0.0, abs(r - 0.8))'));
  assert.ok(legacy.includes('float fill = ivT4 * 0.45 * smoothstep(outer, outer * 0.3, r);'));
  assert.throws(() => apply(raw.replace('float c = pow(max(1.0 - r * 1.8, 0.0), 3.0);', 'float c = 1.0;')), /GPU-FX2b/);
  assert.throws(() => apply(legacy.replace('float c = c0 * c0 * c0;', 'float c = c0 * c0;')), /GPU-FX2b/);
});

test('the complete final non-stage FX projection remains byte-identical on a second Wave 6/7 pass', () => {
  assert.equal(apply(built), built);
  assert.equal(apply(apply(built)), built);
  // The adapter recognizes complete shader blocks, with no marker-only bypass.
  const withoutMarker = built.replace('// INKWAVE non-stage FX shader stability v1', '');
  assert.equal(apply(withoutMarker), withoutMarker);
});

test('final GLOW, RING and BEAM blocks reject changed ramps, missing complements and changed pow algebra', () => {
  const sites = [
    ['GPU-FX2b', '(1.0 - smoothstep(0.0, 0.16, abs(r - 0.8)))', '(1.0 - smoothstep(0.0, 0.17, abs(r - 0.8)))'],
    ['GPU-FX2b', '(1.0 - smoothstep(0.0, 0.24, length(vUv - vec2(-0.3, 0.34))))', 'smoothstep(0.0, 0.24, length(vUv - vec2(-0.3, 0.34)))'],
    ['GPU-FX3a', '(1.0 - smoothstep(outer * 0.3, outer, r))', '(1.0 - smoothstep(outer * 0.4, outer, r))'],
    ['GPU-FX3a', '(1.0 - smoothstep(outer, outer + 0.06, r))', 'smoothstep(outer, outer + 0.06, r)'],
    ['GPU-FX3a', '(1.0 - smoothstep(0.7 + wob * 0.2, 0.95 + wob * 0.2, r))', '(1.0 - smoothstep(0.7 + wob * 0.2, 0.96 + wob * 0.2, r))'],
    ['GPU-FX5a', '(1.0 - smoothstep(0.25, 1.0, vH))', '(1.0 - smoothstep(0.26, 1.0, vH))'],
    ['GPU-FX5a', '(1.0 - smoothstep(0.4, 1.0, vH))', 'smoothstep(0.4, 1.0, vH)'],
    ['GPU-FX2b', 'float c = c0 * c0 * c0;', 'float c = c0 * c0;'],
    ['GPU-FX3a', 'ivT4 = ivT2 * ivT2;', 'ivT4 = ivT2;'],
    ['GPU-FX5a', 'st5 = st2 * st2 * streak;', 'st5 = st2 * st2;'],
  ];
  for (const [label, site, tampered] of sites) {
    assert.equal(built.split(site).length, 2, 'independently located production expression: ' + site);
    assert.throws(() => apply(built.replace(site, tampered)), new RegExp(label));
    assert.throws(() => apply(built.replace(site, '')), new RegExp(label));
  }
});

test('each accepted normalized block has exactly one owner and partial projections cannot pass', () => {
  for (const [name, label] of [['GLOW_FRAG', 'GPU-FX2b'], ['RING_FRAG', 'GPU-FX3a'], ['BEAM_FRAG', 'GPU-FX5a']]) {
    const start = built.indexOf('const ' + name + ' = /* glsl */`');
    const end = built.indexOf('`;', start);
    assert.ok(start >= 0 && end > start, 'actual production shader ' + name);
    assert.throws(() => apply(built + '\n' + built.slice(start, end + 2)), /requires one final FX owner/);
    assert.throws(() => apply(built.slice(0, start) + built.slice(end + 2)), new RegExp(label));
  }
  const partial = built.replace('(1.0 - smoothstep(0.0, 0.16, abs(r - 0.8)))', 'smoothstep(0.16, 0.0, abs(r - 0.8))');
  assert.throws(() => apply(partial), /GPU-FX2b/);
});
