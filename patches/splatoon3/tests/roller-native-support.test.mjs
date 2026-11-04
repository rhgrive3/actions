import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { unpackFaces } from '../../native-stages/runtime/prebuilt-format.mjs';

// Scorch Gorge (Vss_Yunohana) converted data (shared loader shape with trizooka-native-birth). Git LFS pointers in a checkout
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


test('Roller drum support on a source stage uses source triangles, not stage-wide object boxes', { skip: !ready }, async () => {
  const f = await fixture({ fullRuntime: true, extraExports: `
    export { NativeLevel } from './patches/native-stages/runtime/native-level.mjs';
    export { rollerDrumSupport } from './patches/splatoon3/runtime/roller.mjs';` });
  const level = new f.NativeLevel(loadStage()), V = f.THREE.Vector3, G = { physics: { level } };
  const [pad] = level.spawnPads;
  const scratch = () => ({ ids: [], start: { x: 0, y: 0, z: 0 }, delta: { x: 0, y: 0, z: 0 }, normalY: 0, contactPoint: { x: 0, y: 0, z: 0 }, wallPoint: { x: 0, y: 0, z: 0 } });
  const body = (pos, yaw) => ({ pos, yaw, grounded: true, ground: { hit: true } });
  const w = level.triangleWorld, normals = w.normals;
  const wallsNear = (x, y, z, r) => { let n = 0; w.capsuleContacts({ x, y, z }, { x, y, z }, r, id => { if (Math.abs(normals[id * 3 + 1]) < .6) n++; }); return n; };
  // Flat source floor with no vertical source face within 1.6 m of the drum height.
  const spots = [];
  for (let x = -30; x <= 30 && spots.length < 6; x += 3) for (let z = -75; z <= 75 && spots.length < 6; z += 3) {
    const hit = w.ray(new V(x, 40, z), new V(0, -1, 0), 60);
    if (!hit || normals[hit.triangle * 3 + 1] < .99) continue;
    const y = 40 - hit.distance;
    if (wallsNear(x, y + .4, z, 1.7) === 0) spots.push(new V(x, y, z));
  }
  assert.ok(spots.length >= 3, 'open floor samples found: ' + spots.length);
  let enclosed = 0;
  for (const p of spots) {
    for (let i = level.faces.length; i < level.staticBlockCount; i++) {
      const bl = level.blocks[i];
      if (p.x > bl.aabbMin.x && p.x < bl.aabbMax.x && p.y + .4 > bl.aabbMin.y && p.y + .4 < bl.aabbMax.y && p.z > bl.aabbMin.z && p.z < bl.aabbMax.z) { enclosed++; break; }
    }
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const r = f.rollerDrumSupport(body(p.clone(), yaw), G, scratch());
      assert.deepEqual({ floor: r.floor, wall: r.wall }, { floor: true, wall: false }, 'open floor at ' + p.toArray().map(v => v.toFixed(1)));
    }
  }
  assert.ok(enclosed > 0, 'stage-wide object boxes enclose these drums (the former false walls)');
  // A real wall: from an open spot, walk toward the first vertical face a ray finds.
  let checked = 0;
  for (const p of spots) for (let k = 0; k < 16 && !checked; k++) {
    const yaw = k * Math.PI / 8, dir = new V(Math.sin(yaw), 0, Math.cos(yaw));
    const hit = w.ray(new V(p.x, p.y + .4, p.z), dir, 12);
    if (!hit || Math.abs(normals[hit.triangle * 3 + 1]) >= .6) continue;
    const d = hit.distance - 1.1, pos = new V(p.x + dir.x * d, p.y, p.z + dir.z * d);
    const down = w.ray(new V(pos.x, p.y + .5, pos.z), new V(0, -1, 0), 1);
    if (!down || Math.abs(down.distance - .5) > .02) continue; // same floor up to the wall
    const sc = scratch(), r = f.rollerDrumSupport(body(pos, yaw), G, sc);
    assert.equal(r.wall, true, 'a real source wall is still a wall');
    // The contact lies on the drum capsule (0.75 m ahead, half width 1.4 m, radius 0.4 m).
    const mid = { x: (sc.start.x + sc.start.x + sc.delta.x) / 2, z: (sc.start.z + sc.start.z + sc.delta.z) / 2 };
    assert.ok(Math.hypot(sc.wallPoint.x - mid.x, sc.wallPoint.z - mid.z) <= Math.hypot(sc.delta.x, sc.delta.z) / 2 + .41, 'wall point on the drum');
    checked++;
  }
  assert.equal(checked, 1, 'a wall approach was exercised');
});
