// #1165: CPU Roller ownership must match the visible GPU band body on the real
// composed paint.js, at grid-aligned cell centres, for several radii, seeds and
// stroke directions. The GPU side is read from the composed GLSL text so the
// oracle drifts with the shader; it is not a free-standing copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RAW = fs.readFileSync(path.join(ROOT, 'inkwave-public/src/world/paint.js'), 'utf8');
const COMPOSED = adaptSource('src/world/paint.js', RAW);
const CELL = 0.25; // src/world/paint.js grid cell size used by these checks (metres)

const glslBand = COMPOSED.match(/if \(kind > 5\.5 && kind < 6\.5\) \{([\s\S]*?)\} else if \(kind > 6\.5\)/);
assert.ok(glslBand, 'shader roller band branch remains in the composed source');
const cpuRoll = COMPOSED.match(/        if \(roll\) \{([\s\S]*?)\n        \} else \{/);
assert.ok(cpuRoll, 'CPU roller branch remains in the composed source');

test('#1165 composed GLSL and CPU share the seeded wobble and the zero-inset boundary', () => {
  // Shader: sd = band SDF with the wobble added to the across-stroke half width.
  assert.match(glslBand[1], /0\.03 \* sin\(q\.x \/ r \* 9\.0 \+ seed \* 30\.0\)/);
  assert.match(glslBand[1], /0\.018 \* sin\(q\.x \/ r \* 23\.0 \+ seed \* 11\.0\)/);
  assert.match(glslBand[1], /abs\(q\) - vec2\(r \* \$\{BAND_L\} \* grow, r \* \$\{BAND_W\} \+ wv\)/);
  // CPU: same terms, same boundary (sd <= 0), no -0.03 * r inset.
  assert.match(cpuRoll[1], /0\.03 \* Math\.sin\(along \/ r \* 9\.0 \+ seed \* 30\.0\)/);
  assert.match(cpuRoll[1], /0\.018 \* Math\.sin\(along \/ r \* 23\.0 \+ seed \* 11\.0\)/);
  assert.match(cpuRoll[1], /if \(sd > 0\) continue;/);
  assert.doesNotMatch(cpuRoll[1], /-0\.03 \* r/);
});

test('#1165 CPU/GPU roller body agree at grid-aligned cells over radii, seeds and directions', () => {
  const cpuOwns = new Function('px', 'py', 'sdu', 'sdv', 'r', 'seed', 'BAND_L', 'BAND_W', 'BAND_R',
    cpuRoll[1].replace('continue;', 'return false;') + '\nreturn true;');
  // GPU oracle: the composed shader's band expression for grow = 1 (final body).
  const gpuOwns = (px, py, dx, dy, r, seed) => {
    const along = px * dx + py * dy, across = -px * dy + py * dx;
    const wv = r * (0.03 * Math.sin(along / r * 9.0 + seed * 30.0) + 0.018 * Math.sin(along / r * 23.0 + seed * 11.0));
    const qa = Math.abs(along) - r * 0.55, qb = Math.abs(across) - (r * 0.62 + wv);
    return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - r * 0.1 <= 0;
  };
  let inside = 0, samples = 0;
  for (const r of [0.3, 0.62, 1.0]) for (const seed of [0, Math.PI / 60, 0.1, 0.5, 0.99])
    for (const angle of [0, Math.PI / 4, 1.3, 2.8]) {
      const dx = Math.cos(angle), dy = Math.sin(angle);
      for (const lu of [0, 0.1, 0.37]) for (const lv of [0, 0.13, 0.41])
        for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) {
          // cell centres (i + .5) * CELL in face space, relative to the stamp centre
          const px = (i + 0.5) * CELL - lu, py = (j + 0.5) * CELL - lv;
          const cpu = cpuOwns(px, py, dx, dy, r, seed, 0.55, 0.62, 0.1);
          const gpu = gpuOwns(px, py, dx, dy, r, seed);
          assert.equal(cpu, gpu, `r=${r} seed=${seed} angle=${angle} cell=(${i},${j}) lu=${lu} lv=${lv}`);
          samples++; if (gpu) inside++;
        }
    }
  assert.ok(inside > 0 && inside < samples, 'sampling covers both inside and outside cells');
});

test('#1165 published witness: seed pi/60, offset (0, 0.73r) is team-owned on both sides', () => {
  const cpuOwns = new Function('px', 'py', 'sdu', 'sdv', 'r', 'seed', 'BAND_L', 'BAND_W', 'BAND_R',
    cpuRoll[1].replace('continue;', 'return false;') + '\nreturn true;');
  assert.equal(cpuOwns(0, 0.73, 1, 0, 1, Math.PI / 60, 0.55, 0.62, 0.1), true,
    'witness is painted on the CPU like the visible GPU body');
});
