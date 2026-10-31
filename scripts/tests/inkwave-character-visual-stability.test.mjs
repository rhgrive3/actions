import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptCharacterVisualStability, orderedCharacterSmoothsteps } from '../../patches/local-quality/character-visual-stability-adapter.mjs';

const raw = fs.readFileSync(new URL('../../inkwave-public/src/game/character-mats.js', import.meta.url), 'utf8');
const hermite = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

test('descending character ramps retain their authored interpolation with ordered GLSL edges', () => {
  const pattern = /smoothstep\(\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*,/g;
  const descending = [...raw.matchAll(pattern)].filter(m => +m[1] > +m[2]);
  assert.ok(descending.length >= 20, 'real skin/cloth/hair/eye/squid ramps covered');
  for (const [, first, second] of descending) {
    const a = +first, b = +second;
    for (let i = -20; i <= 120; i++) {
      const x = b + (a - b) * i / 100;
      assert.ok(Math.abs(hermite(a, b, x) - (1 - hermite(b, a, x))) < 1e-14);
    }
  }
  const actual = orderedCharacterSmoothsteps(raw);
  assert.equal([...actual.matchAll(pattern)].filter(m => +m[1] >= +m[2]).length, 0);
  assert.equal(orderedCharacterSmoothsteps(actual), actual);
});

test('normalizer handles nested ramps, signed/exponent edges and preserves ascending calls', () => {
  assert.equal(orderedCharacterSmoothsteps('smoothstep(1e0, -1e-1, smoothstep(1.0, 0.0, abs(x)))'),
    '(1.0 - smoothstep(-1e-1, 1e0, (1.0 - smoothstep(0.0, 1.0, abs(x)))))');
  const input = 'smoothstep(-0.2, 0.2, value) + smoothstep(-.15, -.5, x)';
  assert.equal(orderedCharacterSmoothsteps(input), 'smoothstep(-0.2, 0.2, value) + (1.0 - smoothstep(-.5, -.15, x))');
  assert.throws(() => orderedCharacterSmoothsteps('smoothstep(1.0, 1.0, x)'), /zero-width/);
  assert.throws(() => orderedCharacterSmoothsteps('smoothstep(1.0, 0.0, abs(x)'), /unbalanced/);
});

test('weapon brushing preserves close detail and converges continuously to its mean', () => {
  for (const br of [0, .1, .25, .5, .9, 1]) {
    const values = [0, .1, .22, .3, .4, .55, 1, 100].map(footprint => {
      const lod = 1 - hermite(.22, .55, footprint);
      return .9 + .2 * (.5 + (br - .5) * lod);
    });
    assert.equal(values[0], .9 + .2 * br);
    assert.equal(values[2], .9 + .2 * br);
    assert.equal(values.at(-1), 1);
    assert.equal(values[5], 1);
    for (let i = 1; i < values.length; i++) assert.ok(Math.abs(values[i] - 1) <= Math.abs(values[i - 1] - 1) + 1e-15);
  }
  const result = adaptCharacterVisualStability('src/game/character-mats.js', raw);
  assert.ok(result.indexOf('vec3 iwWPixel = fwidth(vWPos);') < result.indexOf('if (iwM == 2.0)'));
  assert.match(result, /if \(iwBrushLod > 0\.0\) br = mix/);
  assert.ok(result.includes('diffuseColor.rgb *= 0.9 + 0.2 * br;'));
});

test('adapter is strict, repeatable and cannot touch stages or other visual systems', () => {
  for (const rel of ['src/world/environment.js', 'src/world/inkShading.js', 'src/game/character.js', 'src/game/character-hair.js', 'src/game/character-face.js'])
    assert.equal(adaptCharacterVisualStability(rel, raw), raw);
  const result = adaptCharacterVisualStability('src/game/character-mats.js', raw);
  assert.equal(adaptCharacterVisualStability('src/game/character-mats.js', result), result);
  assert.throws(() => adaptCharacterVisualStability('src/game/character-mats.js', raw.replace('float br = iwNoise', 'float brush = iwNoise')), /source changed/);
});

test('every changed material program has a distinct cache identity', () => {
  const result = adaptCharacterVisualStability('src/game/character-mats.js', raw);
  const keys = [...result.matchAll(/customProgramCacheKey\s*=\s*\(\)\s*=>\s*([^;\n]+);/g)].flatMap(m => [...m[1].matchAll(/['"](iw-(?:skin|cloth|hair|eye|squid|plastic)[^'"]*)['"]/g)].map(k => k[1]));
  assert.equal(keys.length, 7);
  assert.ok(keys.every(key => key.endsWith('|visual-stability1')), keys.join('\n'));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(result.includes("'iw-glass3'"), 'unchanged glass shader retains its key');
  assert.throws(() => adaptCharacterVisualStability('src/game/character-mats.js', raw.replace("'iw-skin4'", "'unreviewed-skin'")), /program-key coverage/);
});
