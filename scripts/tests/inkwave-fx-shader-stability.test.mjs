import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptFxShaderStability, fxShaderStabilityTargets } from '../../patches/local-quality/fx-shader-stability-adapter.mjs';
import { orderedVariableSmoothstep } from '../../patches/local-quality/ordered-shader-smoothstep.mjs';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';

const raw = rel => fs.readFileSync(new URL('../../inkwave-public/' + rel, import.meta.url), 'utf8');
const outsideShaders = code => code.replace(/\/\* glsl \*\/`[\s\S]*?`/g, '/* GLSL */').replace(/\n\/\/ INKWAVE non-stage FX shader stability v1\n$/, '');

test('FX ordering changes shader text only; all event, pool and lifecycle code remains identical', () => {
  for (const rel of fxShaderStabilityTargets) {
    const before = raw(rel), after = adaptFxShaderStability(rel, before);
    assert.equal(outsideShaders(after), outsideShaders(before), rel);
    assert.equal(adaptFxShaderStability(rel, after), after);
    const numeric = [...after.matchAll(/smoothstep\(\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*,/g)];
    assert.equal(numeric.filter(m => +m[1] >= +m[2]).length, 0, rel);
  }
});

test('variable ramps preserve the exact nested argument and reject changed anchors', () => {
  assert.equal(orderedVariableSmoothstep('x = smoothstep(edge, edge - 0.14, length(v.xy));', 'edge', 'edge - 0.14'),
    'x = (1.0 - smoothstep(edge - 0.14, edge, length(v.xy)));');
  assert.throws(() => orderedVariableSmoothstep('smoothstep(a, b, x) + smoothstep(a, b, y)', 'a', 'b'), /anchor changed/);
  assert.throws(() => orderedVariableSmoothstep('smoothstep(a, c, x)', 'a', 'b'), /anchor changed/);
});

test('the production composition includes the stable FX shaders', () => {
  for (const rel of fxShaderStabilityTargets) {
    const code = adaptBuildSource(rel, raw(rel));
    assert.ok(code.includes('// INKWAVE non-stage FX shader stability v1'));
    assert.ok(!code.includes('smoothstep(lw, lw * 0.25,'));
    assert.ok(!code.includes('smoothstep(outer + 0.02, outer - 0.02,'));
  }
});

test('stage, paint, renderer, weapons, movement and networking cannot be transformed', () => {
  const input = 'smoothstep(1.0, 0.0, value)';
  for (const rel of ['src/world/paint.js', 'src/world/inkShading.js', 'src/world/environment.js',
    'src/world/levelMaterial.js', 'src/core/renderer.js', 'src/game/weapons.js', 'src/game/player.js',
    'patches/native-stages/runtime/registry.mjs', 'patches/network-replication/runtime.mjs'])
    assert.equal(adaptFxShaderStability(rel, input), input, rel);
});
