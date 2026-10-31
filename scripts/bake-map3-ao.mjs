#!/usr/bin/env node
// Deterministic AO for the two public MAP3 stages, using composed Level/Physics
// and exactly the structural colliders used by the public world build.
// node --experimental-vm-modules scripts/bake-map3-ao.mjs [--id tidewater] [--verify]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptBuildSource } from './inkwave-source-composition.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)), source = path.join(root, 'inkwave-public');
const arg = (key, fallback) => { const index = process.argv.indexOf(key); return index < 0 ? fallback : process.argv[index + 1]; };
const requested = arg('--id', null), stages = requested ? [requested] : ['tidewater', 'kelpline'];
if (stages.some(id => !['tidewater', 'kelpline'].includes(id))) throw Error('--id must be tidewater or kelpline');
const ppm = Number(arg('--ppm', 5)), size = 2048, pad = 2, dist = 3.5;
const side = Math.round(Math.sqrt(Number(arg('--rays', 64)))), rays = side * side;
if (!(ppm >= 1 && ppm <= 8 && side >= 2 && side <= 16)) throw Error('Invalid density or ray count');
const outDir = path.resolve(arg('--out', path.join(source, 'assets/lightmaps')));
const context = vm.createContext({ console, performance, URL, TextEncoder, TextDecoder }), modules = new Map();
function load(file) {
  if (modules.has(file)) return modules.get(file);
  const relative = path.relative(source, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8'), code = relative.startsWith('..') ? text : adaptBuildSource(relative, text);
  const m = new vm.SourceTextModule(code, { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } }); modules.set(file, m); return m;
}
const entry = new vm.SourceTextModule(`
  export * as THREE from 'three';
  export {Level} from './src/world/level.js';
  export {Physics,Hit} from './src/game/physics.js';
  export {MAP3_LAYOUTS} from './src/world/stages/map3-layout.js';
  export {map3ArtColliders} from './src/world/stages/map3-art.js';`, { context, identifier: path.join(source, 'map3-ao-entry.mjs') });
await entry.link((specifier, importer) => {
  if (specifier === 'three') return load(path.join(source, 'vendor/three/build/three.module.js'));
  if (specifier.startsWith('three/addons/')) return load(path.join(source, 'vendor/three/jsm', specifier.slice('three/addons/'.length)));
  let file = path.resolve(path.dirname(importer.identifier), specifier).replace('/inkwave-public/patches/', '/patches/');
  if (file.startsWith(path.join(root, 'src') + path.sep)) file = path.join(source, path.relative(root, file));
  return load(file);
});
await entry.evaluate();
const { THREE, Level, Physics, Hit, MAP3_LAYOUTS, map3ArtColliders } = entry.namespace;
const dirs = [];
for (let i = 0; i < side; i++) for (let j = 0; j < side; j++) {
  const u = (i + 0.5) / side, angle = 2 * Math.PI * (j + 0.5 + 0.37 * i) / side, radius = Math.sqrt(u);
  dirs.push([radius * Math.cos(angle), radius * Math.sin(angle), Math.sqrt(1 - u)]);
}
const crcTable = new Int32Array(256).map((_, n) => { let value = n; for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value; });
function chunk(type, data) {
  const header = Buffer.alloc(4); header.writeUInt32BE(data.length);
  const tagged = Buffer.concat([Buffer.from(type), data]); let crc = -1;
  for (const byte of tagged) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ -1) >>> 0);
  return Buffer.concat([header, tagged, checksum]);
}
function png8(image) {
  const raw = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y++) Buffer.from(image.buffer, y * size, size).copy(raw, y * (size + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
for (const id of stages) {
  const layout = MAP3_LAYOUTS[id], extra = map3ArtColliders(layout), level = new Level(layout, extra), physics = new Physics(level);
  if (!level.layoutLightmap(ppm, size, pad)) throw Error(`${id}: lightmap atlas overflow (${level.lightUsed}/${size})`);
  const colliderHash = crypto.createHash('sha256').update(JSON.stringify(level.blocks.map(b => [b.center.toArray(), b.half.toArray(), b.axes.map(a => a.toArray()), b.solid, b.grate]))).digest('hex');
  if (process.argv.includes('--verify')) {
    const meta = JSON.parse(fs.readFileSync(path.join(outDir, `${id}.json`), 'utf8'));
    const png = fs.readFileSync(path.join(outDir, `${id}.png`));
    if (meta.hash !== level.layoutHash || meta.colliderHash !== colliderHash || meta.ppm !== ppm || meta.size !== size || meta.rays !== rays || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size || crypto.createHash('sha256').update(png).digest('hex') !== meta.pngSha256) throw Error(`${id}: stale or corrupt MAP3 bake`);
    console.log(`${id}: verified face hash ${meta.hash}, collision hash ${colliderHash}, ${png.length} bytes`); continue;
  }
  const image = new Uint8Array(size * size).fill(255), hit = new Hit(), point = new THREE.Vector3(), direction = new THREE.Vector3();
  let texels = 0, rayCount = 0, usedFaces = 0; const started = performance.now();
  console.log(`${id}: baking ${level.faces.length} faces; ${level.lightUsed}/${size} atlas rows; ${rays} rays/texel`);
  for (const face of level.faces) {
    if (!face.light) continue;
    const width = Math.ceil(face.su * ppm) + pad * 2, height = Math.ceil(face.sv * ppm) + pad * 2;
    for (let iy = 0; iy < height; iy++) for (let ix = 0; ix < width; ix++) {
      const u = Math.min(face.su - 0.01, Math.max(0.01, (ix - pad + 0.5) / ppm));
      const v = Math.min(face.sv - 0.01, Math.max(0.01, (iy - pad + 0.5) / ppm));
      point.copy(face.origin).addScaledVector(face.u, u).addScaledVector(face.v, v).addScaledVector(face.n, 0.03);
      let occ = 0;
      for (const [a, b, c] of dirs) {
        direction.copy(face.u).multiplyScalar(a).addScaledVector(face.v, b).addScaledVector(face.n, c);
        physics.raycast(point, direction, dist, hit, true); if (hit.hit) occ += 1 - hit.dist / dist;
      }
      const ao = 1 - Math.min(1, occ / rays * 1.6);
      image[(size - 1 - face.light.y - iy) * size + face.light.x + ix] = Math.round(255 * Math.pow(ao, 0.9));
      texels++; rayCount += rays;
    }
    if (++usedFaces % 80 === 0) console.log(`${id}: ${usedFaces} faces, ${(rayCount / 1e6).toFixed(1)}M rays, ${((performance.now() - started) / 1000).toFixed(1)}s`);
  }
  const png = png8(image);
  const meta = { id, hash: level.layoutHash, size, ppm, rays, dist, colliderHash, pngSha256: crypto.createHash('sha256').update(png).digest('hex'), source: 'scripts/bake-map3-ao.mjs', structuralColliders: extra.length, faces: level.faces.length, texels };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${id}.png`), png); fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(meta) + '\n');
  console.log(`${id}: ${texels} texels, ${rayCount} rays, ${((performance.now() - started) / 1000).toFixed(1)}s, hash ${level.layoutHash}, ${(png.length / 1024).toFixed(1)} KiB`);
}
