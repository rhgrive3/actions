import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
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

test('Trizooka shells on a source stage collide with source triangles, not stage-wide object boxes', { skip: !ready }, async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true, extraExports: `
    export { NativeLevel } from './patches/native-stages/runtime/native-level.mjs';
    export { kitTrizookaWorldSweep } from './patches/splatoon3/runtime/trizooka-collision.mjs';
    export { trizookaSpecialWeapon } from './patches/splatoon3/runtime/kit-trizooka.mjs';` });
  const level = new f.NativeLevel(loadStage());
  const V = f.THREE.Vector3;
  // Shoulder-height lanes on open floor of the spawn deck and mid stage.
  const [pad] = level.spawnPads;
  const lanes = [];
  for (const [x, z, dz] of [[pad.x, pad.z, 1], [pad.x - 4, pad.z + 2, 1], [-pad.x, -pad.z, -1]]) {
    lanes.push({ from: new V(x, pad.y + 1.2, z), dir: new V(0, 0, dz) });
  }
  const descriptor = f.trizookaSpecialWeapon();
  let hitsAtBirth = 0, objectBoxesAround = 0;
  for (const lane of lanes) {
    // object boxes do enclose the muzzle: this is the case that used to fail
    for (let i = level.faces.length; i < level.staticBlockCount; i++) {
      const b = level.blocks[i], p = lane.from;
      if (p.x >= b.aabbMin.x && p.x <= b.aabbMax.x && p.y >= b.aabbMin.y && p.y <= b.aabbMax.y && p.z >= b.aabbMin.z && p.z <= b.aabbMax.z) objectBoxesAround++;
    }
    const p = f.G.projectiles._new();
    Object.assign(p, { type: 'blast', wid: 'trizooka', team: 0, age: 0, s3Weapon: descriptor, s3SpecialWeapon: descriptor });
    p.prev.copy(lane.from); p.pos.copy(lane.from).addScaledVector(lane.dir, 0.5);
    const out = new f.Hit();
    f.kitTrizookaWorldSweep(f.G.projectiles, p, out, { level, segment: () => { throw Error('native segment fallback'); } });
    if (out.hit && out.dist < 1e-6) hitsAtBirth++;
  }
  assert.ok(objectBoxesAround > 0, 'source object AABBs surround the muzzle');
  assert.equal(hitsAtBirth, 0, 'no zero-distance contact at birth');
  // A shell fired straight down still meets the real floor.
  const p = f.G.projectiles._new();
  Object.assign(p, { type: 'blast', wid: 'trizooka', team: 0, age: 1, s3Weapon: descriptor, s3SpecialWeapon: descriptor });
  p.prev.set(pad.x, pad.y + 1.2, pad.z); p.pos.set(pad.x, pad.y - 1, pad.z);
  const out = new f.Hit();
  f.kitTrizookaWorldSweep(f.G.projectiles, p, out, { level, segment: () => { throw Error('fallback'); } });
  assert.ok(out.hit, 'floor contact'); assert.ok(out.normal.y > 0.7, 'upward floor normal');
  assert.ok(out.triangle >= 0, 'source triangle reported');
});
