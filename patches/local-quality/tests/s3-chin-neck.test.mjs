import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const root = fileURLToPath(new URL('../../../inkwave-public/', import.meta.url));
// Compare the production composition with its former jaw/neck union. Test-only exports never enter a build.
async function realm(previous = false) {
  const context = vm.createContext({ console, performance, URL }), cache = new Map();
  const load = file => {
    if (cache.has(file)) return cache.get(file);
    const rel = path.relative(root, file).split(path.sep).join('/');
    let source = fs.readFileSync(file, 'utf8');
    if (rel.startsWith('src/')) source = adaptBuildSource(rel, source);
    if (rel === 'src/game/character-face.js') {
      if (previous) source = source.replace(/const NECK_K = 0\.028;[\s\S]*?(?=const NECK_O)/,
        'const NECK_K = 0.017;\nconst unionField = (p) => sminK(headField(p), neckField(p), NECK_K);\n');
      source += '\nexport { unionField, neckField, neckProfiles };';
    }
    const module = new vm.SourceTextModule(source, { context, identifier: file });
    cache.set(file, module); return module;
  };
  const face = load(path.join(root, 'src/game/character-face.js'));
  await face.link((spec, from) => load(spec === 'three' ? path.join(root, 'vendor/three/build/three.module.js') : path.resolve(path.dirname(from.identifier), spec)));
  await face.evaluate(); return face.namespace;
}
let pair;
const both = () => pair ||= Promise.all([realm(true), realm()]);
function underside(face, x, z) {
  const p = face.HEAD_C.clone().set(x, 0, z); let lo = 1.025, hi = 1.12;
  assert.ok(face.unionField(p.setY(lo)) > 0 && face.unionField(p.setY(hi)) < 0, 'bracket underside outside neck');
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (face.unionField(p.setY(mid)) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

test('chin/neck: lower side and rear overhang lift locally; central front chin stays round and unchanged', async () => {
  const [before, after] = await both();
  for (const [x, z, minLift, maxLift] of [[0.06, -0.04, 0.005, 0.018], [0.035, -0.07, 0.012, 0.03]]) {
    const lift = underside(after, x, z) - underside(before, x, z);
    assert.ok(lift > minLift && lift < maxLift, `local lift ${x},${z}: ${lift}`);
    assert.ok(Math.abs(underside(after, -x, z) - underside(after, x, z)) < 1e-9, 'symmetric underside');
  }
  for (const x of [-0.02, 0, 0.02]) assert.ok(Math.abs(underside(after, x, 0.12) - underside(before, x, 0.12)) < 1e-6, 'front chin preserved, no V taper');
});

test('chin/neck: hair-fit head surface, facial features, lower neck and collar are unchanged', async () => {
  const [before, after] = await both();
  const a = before.HEAD_C.clone(), b = after.HEAD_C.clone();
  for (let az = -Math.PI; az <= Math.PI; az += 0.1) for (let el = -1.5; el < 1.5; el += 0.1) {
    before.headSurfFace(az, el, 0, a); after.headSurfFace(az, el, 0, b);
    assert.equal(a.distanceTo(b), 0, 'analytic head and feature surface unchanged');
  }
  for (let y = 0.935; y <= 1.035; y += 0.01) for (let az = -Math.PI; az < Math.PI; az += 0.1) {
    a.set(0.04 * Math.sin(az), y, 0.04 * Math.cos(az));
    assert.equal(before.neckField(a), after.neckField(a), 'neck tube not widened');
    assert.ok(Math.abs(before.unionField(a) - after.unionField(a)) < 1e-9, 'lower neck blend unchanged');
  }
});

test('chin/neck: profile columns remain finite, descending and continuous into the untouched first face row', async () => {
  const [before, after] = await both(), original = before.neckProfiles(), profiles = after.neckProfiles();
  for (let c = 0; c < profiles.length; c++) {
    const col = profiles[c];
    assert.equal(col[0].distanceTo(original[c][0]), 0, 'upper join preserved');
    assert.ok(col.at(-1).distanceTo(original[c].at(-1)) < 1e-6, 'collar join preserved');
    for (let i = 1; i < col.length; i++) {
      assert.ok([col[i].x, col[i].y, col[i].z].every(Number.isFinite));
      assert.ok(col[i].y <= col[i - 1].y + 1e-6, 'no folded profile');
      assert.ok(col[i].distanceTo(col[i - 1]) < 0.005, 'no gap or step');
    }
  }
});
