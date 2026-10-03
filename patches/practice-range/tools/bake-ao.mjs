#!/usr/bin/env node
// Bake the Practice Range ambient-occlusion lightmap (assets/lightmaps/range.{json,png}) from the real level: the same
// Level the game builds (layout + prop colliders), the same lightmap layout (Level.layoutLightmap), rays cast with the
// game's own Physics. The game applies it only when its layout hash matches (main.js _loadLightmap), so a stale bake can
// never be applied to a changed layout. Encoding as the other stages: 8-bit grey, 1 = open sky, R channel = AO.
//   node --experimental-vm-modules patches/practice-range/tools/bake-ao.mjs [--rays 64] [--dist 3.5]
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rangeRealm, rangeWorld } from '../tests/harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? +process.argv[i + 1] : d; };
const RAYS = arg('--rays', 64), DIST = arg('--dist', 3.5), PPM = 8, SIZE = 2048, PAD = 2;

const R = await rangeRealm();
rangeWorld(R);
const { G, THREE, Hit } = { ...R, Hit: null };
const level = G.level, physics = G.physics;
if (!level.layoutLightmap(PPM, SIZE, PAD)) throw new Error('lightmap atlas overflow');
const img = new Uint8Array(SIZE * SIZE).fill(255);
// stratified cosine-weighted hemisphere directions (fixed: the bake is deterministic)
const dirs = [];
const n1 = Math.round(Math.sqrt(RAYS));
for (let i = 0; i < n1; i++) for (let j = 0; j < n1; j++) {
  const u1 = (i + 0.5) / n1, u2 = (j + 0.5 + 0.37 * i) / n1;
  const r = Math.sqrt(u1), phi = 2 * Math.PI * u2;
  dirs.push([r * Math.cos(phi), r * Math.sin(phi), Math.sqrt(Math.max(0, 1 - u1))]);
}
const hit = { hit: false, dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), block: -1, face: -1, u: 0, v: 0 };
const p = new THREE.Vector3(), d = new THREE.Vector3();
let texels = 0, rays = 0;
const t0 = Date.now();
for (const f of level.faces) {
  if (!f.light) continue;
  const w = Math.ceil(f.su * PPM) + PAD * 2, h = Math.ceil(f.sv * PPM) + PAD * 2;
  // quick out: nothing within DIST of the face's open side → fully open
  const lo = f.origin.clone(), hi = f.origin.clone().addScaledVector(f.u, f.su).addScaledVector(f.v, f.sv);
  const minX = Math.min(lo.x, hi.x) - DIST, maxX = Math.max(lo.x, hi.x) + DIST, minZ = Math.min(lo.z, hi.z) - DIST, maxZ = Math.max(lo.z, hi.z) + DIST;
  for (let iy = 0; iy < h; iy++) for (let ix = 0; ix < w; ix++) {
    const cu = Math.min(f.su - 0.01, Math.max(0.01, (ix - PAD + 0.5) / PPM)), cv = Math.min(f.sv - 0.01, Math.max(0.01, (iy - PAD + 0.5) / PPM));
    p.copy(f.origin).addScaledVector(f.u, cu).addScaledVector(f.v, cv).addScaledVector(f.n, 0.03);
    let occ = 0;
    for (const [a, b, c] of dirs) {
      d.copy(f.u).multiplyScalar(a).addScaledVector(f.v, b).addScaledVector(f.n, c);
      physics.raycast(p, d, DIST, hit, true);
      rays++;
      if (hit.hit) occ += 1 - hit.dist / DIST;
    }
    const ao = 1 - Math.min(1, (occ / dirs.length) * 1.6);
    const tx = f.light.x + ix, ty = f.light.y + iy;          // texture space, v from the bottom
    if (tx < SIZE && ty < SIZE) img[(SIZE - 1 - ty) * SIZE + tx] = Math.round(255 * Math.pow(ao, 0.9));
    texels++;
  }
  void minX; void maxX; void minZ; void maxZ;
}
// PNG (8-bit greyscale)
const raw = Buffer.alloc((SIZE + 1) * SIZE);
for (let y = 0; y < SIZE; y++) { raw[y * (SIZE + 1)] = 0; Buffer.from(img.buffer, y * SIZE, SIZE).copy(raw, y * (SIZE + 1) + 1); }
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const out = path.join(HERE, '../assets/lightmaps');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'range.png'), png);
fs.writeFileSync(path.join(out, 'range.json'), JSON.stringify({ id: 'range', hash: level.layoutHash, size: SIZE, ppm: PPM, rays: dirs.length, dist: DIST }));
console.log(`range AO: ${texels} texels, ${rays} rays, ${((Date.now() - t0) / 1000).toFixed(1)} s, hash ${level.layoutHash}, used ${level.lightUsed}/${SIZE} rows, ${(png.length / 1024).toFixed(0)} KB`);
