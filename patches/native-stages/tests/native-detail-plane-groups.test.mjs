import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { consumeNativeWork, consumeNativeWorkAsync } from '../runtime/native-work.mjs';
import { unpackFaces } from '../runtime/prebuilt-format.mjs';

// Detail pages are chosen by a static plane-group id carried by every ink
// overlay vertex, never by a plane-distance guess. A page only holds its own
// group's ink, so sampling another group's page made painted floor look bare.
const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
const clean = source => source.replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function ').replaceAll('export class ', 'class ').replaceAll('export const ', 'const ');
const detailSource = read('../runtime/native-paint-detail.mjs');
const { nativeDetailPlanes, enableNativePaintDetail, NativePaintDetail } = new Function('THREE', 'G', 'paintShapeSeed',
  clean(detailSource) + '\nreturn {nativeDetailPlanes,enableNativePaintDetail,NativePaintDetail};')(THREE, {}, () => 0);
const { nativeInkGeometry } = new Function('THREE', 'consumeNativeWork', 'consumeNativeWorkAsync', 'createLevelMaterial', 'enableNativePaintDetail',
  clean(read('../runtime/native-render.mjs')) + '\nreturn {nativeInkGeometry};')(THREE, consumeNativeWork, consumeNativeWorkAsync, null, enableNativePaintDetail);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function face(id, y, { n = V(0, 1, 0), u = V(1, 0, 0), x = 0, turf = true, triangles = [id] } = {}) {
  n = n.clone().normalize(); u = u.clone().addScaledVector(n, -u.dot(n)).normalize();
  return { id, n, u, v: new THREE.Vector3().crossVectors(u, n), origin: V(x, y, 0), su: 4, sv: 4, turf, triangles,
    atlas: { x: id * 40, y: 0, pad: 8, ppm: 8 }, bounds: [[x, y, 0], [x + 4, y, 4]] };
}

test('coincident source charts share one detail plane; separate floors and walls do not', () => {
  const tilt = V(0.0027, 1, 0);
  const faces = [
    face(0, 1.386), face(1, 1.3885, { u: V(1, 0, 0.0027) }), face(2, 1.3905, { x: 8 }), // chained within 3 mm, other u axes
    face(3, 1.386, { n: tilt }),                                                       // normal within the former 0.9999 test
    face(4, 1.40),                                                                       // 14 mm step: separate floor
    face(5, 1.386, { n: V(0, 1, -1) }),                                                  // ramp through the same height
    face(6, 1.386, { turf: false }),                                                     // not a detail floor
  ];
  const planes = nativeDetailPlanes({ faces });
  const id = i => planes.get(faces[i])?.id;
  assert.equal(id(0), 1, 'the earliest source face fixes the first id');
  assert.equal(id(1), id(0)); assert.equal(id(2), id(0)); assert.equal(id(3), id(0));
  assert.notEqual(id(4), id(0)); assert.notEqual(id(5), id(0)); assert.notEqual(id(4), id(5));
  assert.equal(planes.get(faces[6]), undefined);
  assert.equal(planes.get(faces[1]).u, faces[0].u, 'one page basis per group');
  assert.equal(nativeDetailPlanes({ faces }).get(faces[0]).id, 1, 'deterministic');
});

test('ink overlay vertices carry their chart group id and the shader matches pages only by that id', () => {
  const faces = [face(0, 0), face(1, 0.002, { u: V(0, 0, 1) }), face(2, 0.5), face(3, 0, { turf: false })];
  const triangles = new Float32Array(36);
  faces.forEach((f, i) => triangles.set([0, f.origin.y, 0, 1, f.origin.y, 0, 0, f.origin.y, 1], i * 9));
  const level = { faces, data: { triangles } }, g = nativeInkGeometry(level, { paintFaces: faces, size: 1024 });
  const attr = g.getAttribute('nativeDetailPlane'), planes = nativeDetailPlanes(level);
  assert.ok(attr.array instanceof Uint16Array);
  assert.deepEqual(Array.from(attr.array), [1, 1, 1, 1, 1, 1, 2, 2, 2, 0, 0, 0]);
  assert.equal(planes.get(faces[1]).id, 1);
  g.dispose();
  const glsl = detailSource.slice(detailSource.indexOf('const NATIVE_DETAIL_GLSL'));
  assert.match(glsl, /varying float vNativeDetailPlane;/);
  assert.match(glsl, /abs\(page\.w-vNativeDetailPlane\)>0\.25\)continue;/);
  assert.doesNotMatch(glsl, /closest|dot\(vWPos,page\.xyz\)/, 'no plane-distance selection remains');
  const render = read('../runtime/native-render.mjs'), chunks = read('../runtime/native-ink-chunks.mjs');
  assert.match(render, /vNativeDetailPlane = nativeDetailPlane;/);
  assert.match(chunks, /vNativeDetailPlane=nativeDetailPlane;/, 'the stencil pre-pass samples the same page');
});

test('a painted chart indexes its group page and publishes that group id', () => {
  const renderer = { autoClear: true, initRenderTarget() {}, getRenderTarget() { return null; }, getClearColor(v) { return v; }, getClearAlpha() { return 1; },
    getViewport(v) { return v; }, getScissor(v) { return v; }, getScissorTest() { return false; }, setRenderTarget() {}, setClearColor() {}, setViewport() {},
    setScissor() {}, setScissorTest() {}, clear() {}, render() {} };
  const a = face(0, 0), b = face(1, 0.002, { u: V(0, 0, 1) });
  const level = { faces: [a, b], data: { triangles: new Float32Array(18) } };
  const paint = { renderer, size: 512, ppm: 8, level, mat: new THREE.ShaderMaterial(), _emitGrowth() {}, clear() {}, flush() {}, dispose() {} };
  const detail = new NativePaintDetail(paint);
  const record = { id: 1, pages: [] };
  detail.index(record, a, 0, 2, 0, 2); detail.index(record, b, 0, 2, 0, 2);
  const pages = [...detail.pages.values()];
  assert.ok(pages.length >= 1);
  assert.ok(pages.every(p => p.plane.id === 1), 'both charts share the group pages');
  assert.equal(detail.planeByFace.get(a), detail.planeByFace.get(b));
  const page = pages.find(p => p.x === 0 && p.z === 0);
  page.slot = 0; detail.slots[0] = page; page.pending.clear(); page.needsClear = false;
  detail._publishPage(0);
  assert.deepEqual(detail.uniforms.uNativeDetailPages.value[0].toArray().slice(3), [1]);
  detail.dispose();
});

// Scorch Gorge converted charts (skipped without `git lfs pull`).
const DIR = path.join(fileURLToPath(new URL('../../../', import.meta.url)), 'native-prebuilt/scorch');
const ready = (() => { try { return fs.statSync(path.join(DIR, 'faceF64.0.bin')).size > 1024; } catch { return false; } })();
test('Scorch Gorge: coincident floor charts never split across detail pages', { skip: !ready }, () => {
  const record = JSON.parse(fs.readFileSync(path.join(DIR, 'stage.json'), 'utf8'));
  const arr = name => { const s = record.arrays[name], b = Buffer.concat(s.chunks.map(c => fs.readFileSync(path.join(DIR, c.file))));
    return new globalThis[s.type](b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
  const faces = unpackFaces(arr('faceF64'), arr('faceI32'), arr('faceTriangleOffsets'), arr('faceTriangles'))
    .map((s, id) => ({ ...s, id, n: V(...s.n), u: V(...s.u), v: V(...s.v), origin: V(...s.origin), turf: s.n[1] > .7 }));
  const planes = nativeDetailPlanes({ faces }), turf = faces.filter(f => f.turf);
  assert.ok(turf.every(f => planes.get(f)?.id > 0));
  // The former per-chart keys (normal, u axis, millimetre offset) split these.
  const oldKey = f => [f.n.x, f.n.y, f.n.z, f.u.x, f.u.y, f.u.z, f.origin.dot(f.n)].map((v, i) => Math.round(v * (i === 6 ? 1000 : 10000))).join(',');
  const cells = new Map();
  for (const f of turf) for (let x = Math.floor(f.bounds[0][0] / 8); x <= Math.floor(f.bounds[1][0] / 8); x++)
    for (let z = Math.floor(f.bounds[0][2] / 8); z <= Math.floor(f.bounds[1][2] / 8); z++) { const k = x + ',' + z; (cells.get(k) || cells.set(k, []).get(k)).push(f); }
  let coincident = 0, oldSplit = 0, split = 0;
  for (const list of cells.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (!(a.n.dot(b.n) > 0.9999 && Math.abs(a.origin.dot(a.n) - b.origin.dot(b.n)) < 0.002)) continue;
    coincident++; if (oldKey(a) !== oldKey(b)) oldSplit++; if (planes.get(a) !== planes.get(b)) split++;
  }
  console.log(JSON.stringify({ turf: turf.length, groups: new Set(turf.map(f => planes.get(f).id)).size, coincident, oldSplit, split }));
  assert.ok(oldSplit > 0, 'the former keys split coincident floor charts on this stage');
  assert.equal(split, 0);
});
