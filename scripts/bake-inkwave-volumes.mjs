#!/usr/bin/env node
// Explicit local conversion. Outputs contain source pixels/derived assets and
// MUST NOT be published until the owner has established redistribution rights.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MeshoptSimplifier } from 'meshoptimizer';
import { decodeVTF } from '../patches/local-quality/ink-volume/vtf.mjs';
import { buildInkMesh } from '../patches/local-quality/ink-volume/mesh.mjs';
export async function bakeVolumes(inputs, out, { fps = 30, thickness = .22 } = {}) {
  await MeshoptSimplifier.ready;
  const chunks = [], patterns = []; let bytes = 0;
  function append(a) {
    const pad = (4 - bytes % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); bytes += pad; }
    const descriptor = { offset: bytes, length: a.length }; chunks.push(Buffer.from(a.buffer, a.byteOffset, a.byteLength)); bytes += a.byteLength; return descriptor;
  }
  for (const input of inputs) {
    const source = fs.readFileSync(input), image = decodeVTF(source), started = performance.now();
    const frames = image.frames.map(rgba => {
      const full = buildInkMesh(rgba, image.width, image.height, { thickness, interiorStep: 8 });
      return { rgba: append(rgba), levels: [.003, .012].map(errorLimit => {
        // All outer/hole/island boundary vertices are locked. Never prune small
        // components. UVs stay a linear function of unchanged XY positions.
        const N = full.frontVertexCount, flat = full.positions.slice(0, N * 3), heights = new Float32Array(N * 4);
        for (let i = 0; i < N; i++) { heights[i * 4] = flat[i * 3 + 2]; heights.set(full.normals.subarray(i * 3, i * 3 + 3), i * 4 + 1); flat[i * 3 + 2] = 0; }
        // Simplify the 2D triangulation with height as an attribute. A whole
        // closed-volume simplification can introduce vertical/collinear front
        // faces. This keeps the front a height field and shares its topology
        // with the back; every contour vertex and side face stays unchanged.
        const locks = full.boundary.subarray(0, N).slice();
        for (let i = 0; i < full.frontIndices.length; i += 3) if (full.boundary[full.frontIndices[i]] || full.boundary[full.frontIndices[i + 1]] || full.boundary[full.frontIndices[i + 2]]) for (let k = 0; k < 3; k++) locks[full.frontIndices[i + k]] = 1;
        let front = new Uint32Array(full.frontIndices), error = 0;
        for (let attempt = 0; attempt < 8; attempt++) {
          const candidate = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(full.frontIndices), flat, 3, heights, 4, [1, .04, .04, .04], locks, Math.floor(full.frontIndices.length * .08 / 3) * 3, errorLimit, ['LockBorder', 'ErrorAbsolute']);
          const invalid = new Uint8Array(N); let count = 0;
          for (let i = 0; i < candidate[0].length; i += 3) {
            const a = candidate[0][i], b = candidate[0][i + 1], c = candidate[0][i + 2];
            const area = (flat[b * 3] - flat[a * 3]) * (flat[c * 3 + 1] - flat[a * 3 + 1]) - (flat[b * 3 + 1] - flat[a * 3 + 1]) * (flat[c * 3] - flat[a * 3]);
            if (!(area > 1e-16)) { invalid[a] = invalid[b] = invalid[c] = 1; count++; }
          }
          if (!count) { [front, error] = candidate; break; }
          // Expand protection around the exact source vertices implicated by a
          // bad collapse. Retry from the original, never accept folded/zero faces.
          let changed = false;
          for (let i = 0; i < full.frontIndices.length; i += 3) if (invalid[full.frontIndices[i]] || invalid[full.frontIndices[i + 1]] || invalid[full.frontIndices[i + 2]]) for (let k = 0; k < 3; k++) { const id = full.frontIndices[i + k]; if (!locks[id]) { locks[id] = 1; changed = true; } }
          if (!changed) break; // retain the exact original triangulation
        }
        const faces = [...front];
        for (let i = 0; i < front.length; i += 3) faces.push(front[i] + N, front[i + 2] + N, front[i + 1] + N);
        for (let i = full.frontIndices.length * 2; i < full.indices.length; i++) faces.push(full.indices[i]);
        const indices = new Uint32Array(faces);
        const remap = new Int32Array(full.positions.length / 3).fill(-1), positions = [], normals = [], uvs = [];
        for (let i = 0; i < indices.length; i++) {
          const old = indices[i]; if (remap[old] < 0) { remap[old] = positions.length / 3; positions.push(...full.positions.subarray(old * 3, old * 3 + 3)); normals.push(...full.normals.subarray(old * 3, old * 3 + 3)); uvs.push(...full.uvs.subarray(old * 2, old * 2 + 2)); }
          indices[i] = remap[old];
        }
        const Index = positions.length / 3 <= 65535 ? Uint16Array : Uint32Array;
        return { positions: append(new Float32Array(positions)), normals: append(new Float32Array(normals)), uvs: append(new Float32Array(uvs)), indices: append(new Index(indices)), indexBytes: Index.BYTES_PER_ELEMENT, boundaryEdges: full.boundaryEdges, simplificationError: error };
      }) };
    });
    patterns.push({ name: path.basename(input), sourceSHA256: crypto.createHash('sha256').update(source).digest('hex'), width: image.width, height: image.height, format: image.format, fps, frames });
    console.log(JSON.stringify({ source: path.basename(input), width: image.width, height: image.height, frames: frames.length, bakeMs: Math.round(performance.now() - started), vertices: frames.map(f => f.levels[0].positions.length / 3), triangles: frames.map(f => f.levels[0].indices.length / 3) }));
  }
  const binary = Buffer.concat(chunks), manifest = { schema: 'inkwave-volume-v1', binary: 'volumes.bin', byteLength: bytes, binarySHA256: crypto.createHash('sha256').update(binary).digest('hex'), artSettings: { thickness, interiorStep: 8, simplificationErrors: [.003, .012], boundaryLocked: true }, patterns };
  fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(path.join(out, 'volumes.bin'), binary); fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [out, ...inputs] = process.argv.slice(2); if (!out || !inputs.length) throw Error('Usage: node scripts/bake-inkwave-volumes.mjs <local-output-directory> <pattern1.vtf> [pattern2.vtf]');
  await bakeVolumes(inputs, path.resolve(out));
}
