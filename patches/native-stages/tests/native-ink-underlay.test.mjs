import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { unpackFaces } from '../../native-stages/runtime/prebuilt-format.mjs';

// Scorch Gorge (Vss_Yunohana) converted data. Git LFS pointers in a checkout
// without `git lfs pull` are not real arrays, so the test then skips.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DIR = path.join(ROOT, 'native-prebuilt/scorch');
const record = (() => { try { return JSON.parse(fs.readFileSync(path.join(DIR, 'stage.json'), 'utf8')); } catch { return null; } })();
const TYPES = { Float32Array, Float64Array, Int32Array, Uint32Array, Uint8Array, Uint16Array, Int8Array, Int16Array };
function loadStage() {
  const data = { ...record.extra, manifest: structuredClone(record.manifest) };
  for (const [name, spec] of Object.entries(record.arrays)) {
    const parts = spec.chunks.map(c => fs.readFileSync(path.join(DIR, c.file)));
    const b = Buffer.concat(parts), T = TYPES[spec.type];
    data[name] = new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    assert.equal(data[name].length, spec.length, name);
  }
  data.manifest.faces = unpackFaces(data.faceF64, data.faceI32, data.faceTriangleOffsets, data.faceTriangles);
  for (const k of ['faceF64', 'faceI32', 'faceTriangleOffsets', 'faceTriangles']) delete data[k];
  return data;
}
const ready = !!record?.arrays && fs.statSync(path.join(DIR, 'vertices.0.bin')).size > 1024;


test('display-only decals on paintable surfaces are drawn under the ink overlay; every triangle is kept once', { skip: !ready }, async () => {
  const f = await fixture({ fullRuntime: true, extraExports: `
    export { NativeLevel } from './patches/native-stages/runtime/native-level.mjs';
    export { nativeDisplay } from './patches/native-stages/runtime/native-render.mjs';` });
  const data = loadStage(), level = new f.NativeLevel(data), objects = data.manifest.objects;
  const marked = objects.filter(o => o.inkUnderlayMask);
  assert.ok(['WarningTape', 'Graffiti'].every(k => marked.some(o => o.name.includes(k))), 'tape and graffiti decals are found: ' + marked.map(o => o.name));
  // Physical covers standing off their surface keep their opaque pass.
  for (const name of ['YunohanaLight_cp']) assert.ok(!marked.some(o => o.name.includes(name)), name);
  for (const o of objects) if (o.collidable || o.background || o.glass) assert.equal(o.inkUnderlayMask ?? null, null, 'collision/background/glass objects keep their pass');
  // Each marked triangle lies within 1.5 cm in front of a paintable, same-facing source triangle.
  const V = data.vertices, I = data.indices, w = level.triangleWorld, T = f.THREE;
  let checked = 0, area = 0;
  for (const o of marked) for (let t = 0; t < o.inkUnderlayMask.length && checked < 400; t++) {
    if (!o.inkUnderlayMask[t]) continue;
    const p = k => new T.Vector3(V[(o.vo + I[o.io + t * 3 + k]) * 8], V[(o.vo + I[o.io + t * 3 + k]) * 8 + 1], V[(o.vo + I[o.io + t * 3 + k]) * 8 + 2]);
    const a = p(0), b = p(1), c = p(2), n = new T.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    area += n.length() / 2; n.normalize();
    const centre = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const hits = [1, -1].map(s => w.ray(centre.clone().addScaledVector(n, .002 * s), n.clone().multiplyScalar(-s), .017)).filter(h => h && data.triangleFace[h.triangle] >= 0);
    assert.ok(hits.length > 0, 'a paintable surface lies just behind'); checked++;
  }
  const display = f.nativeDisplay(data, new Map(), 'balanced');
  try {
    let under = 0, total = 0;
    for (const mesh of display.group.children) {
      const count = mesh.geometry.index.count;
      total += count;
      if (mesh.userData.nativeInkUnderlay) {
        under += count;
        assert.equal(mesh.material.depthWrite, false); assert.equal(mesh.renderOrder, 1); assert.equal(mesh.castShadow, false);
      } else assert.equal(mesh.renderOrder, 0);
    }
    const expected = objects.filter(o => o.active).reduce((n, o) => n + o.ic, 0);
    const masked = marked.reduce((n, o) => n + o.inkUnderlayMask.reduce((m, v) => m + v, 0) * 3, 0);
    assert.equal(total, expected, 'no triangle is lost or duplicated');
    assert.equal(under, masked);
    console.log(JSON.stringify({ objects: marked.map(o => o.name.replace(/^Fld_Yunohana_/, '').slice(0, 32)), underTriangles: under / 3, sampledArea: +area.toFixed(1) }));
  } finally { display.dispose(); }
});
