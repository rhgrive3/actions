// Exact geometry/hierarchy/material roundtrip QA for the Blender migration.
//
//   node scripts/inkwave_roundtrip_qa.mjs --tree <export_tree.json> \
//     --glb source=blender/inkwave_character_source.glb --glb master=blender/INKWAVE_CHARACTER_MASTER.glb \
//     --glb game=blender/INKWAVE_GAME.glb --out <report.json>
//
// The browser QA hook __INKWAVE_QA.exportTree() is the contract: per-mesh world-space vertex bounds, triangle
// and vertex counts, and material names straight out of the live Three.js runtime. Every GLB in the chain must
// reproduce it. Nothing here trusts a renderer - all numbers come from the binary buffers.
import fs from 'node:fs';
import path from 'node:path';

const FLOAT = 5126, USHORT = 5123, UINT = 5125, UBYTE = 5121, SHORT = 5122, BYTE = 5120;
const SIZE = { [FLOAT]: 4, [UINT]: 4, [USHORT]: 2, [SHORT]: 2, [UBYTE]: 1, [BYTE]: 1 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAY = { [FLOAT]: Float32Array, [UINT]: Uint32Array, [USHORT]: Uint16Array, [SHORT]: Int16Array, [UBYTE]: Uint8Array, [BYTE]: Int8Array };
const HELPER = /^(REFERENCE_|INKWAVE_VALIDATION_CAMERA|KEY$|FILL$|RIM$|grid|axes|floor|sculpt|Light|Camera)/i;

function readGLB(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a binary glTF`);
  const version = buffer.readUInt32LE(4);
  let offset = 12, json = null, bin = null;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset), kind = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (kind === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (kind === 0x004e4942) bin = chunk;
    offset += 8 + length + ((4 - (length % 4)) % 4); // glTF pads every chunk to a 4-byte boundary
  }
  if (!json) throw new Error(`${file}: no JSON chunk`);
  return { gltf: json, bin, version, bytes: buffer.length };
}

function accessor(gltf, bin, index) {
  const acc = gltf.accessors[index];
  const components = TYPE_COUNT[acc.type];
  const out = new ARRAY[acc.componentType](acc.count * components);
  if (acc.bufferView === undefined) return out;
  const view = gltf.bufferViews[acc.bufferView];
  const base = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const size = SIZE[acc.componentType];
  const stride = view.byteStride || components * size;
  // DataView, not a typed-array view: accessor offsets are only byte-aligned, and interleaved buffer views
  // (byteStride) are legal glTF that a naive typed-array slice would silently read wrong.
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const get = { [FLOAT]: (o) => data.getFloat32(o, true), [UINT]: (o) => data.getUint32(o, true),
    [USHORT]: (o) => data.getUint16(o, true), [SHORT]: (o) => data.getInt16(o, true),
    [UBYTE]: (o) => data.getUint8(o), [BYTE]: (o) => data.getInt8(o) }[acc.componentType];
  if (!get) throw new Error(`unsupported componentType ${acc.componentType}`);
  for (let i = 0; i < acc.count; i++) for (let c = 0; c < components; c++) out[i * components + c] = get(base + i * stride + c * size);
  return out;
}

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) { // column-major, a * b
  const out = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
}
function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1];
}
const apply3 = (m, p) => [
  m[0] * p[0] + m[3] * p[1] + m[6] * p[2],
  m[1] * p[0] + m[4] * p[1] + m[7] * p[2],
  m[2] * p[0] + m[5] * p[1] + m[8] * p[2]];
/** Inverse transpose of the upper 3x3, so normals survive non-uniform scale. */
function normalMatrix(m) {
  const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[3] * (a[1] * a[8] - a[2] * a[7]) + a[6] * (a[1] * a[5] - a[2] * a[4]);
  if (!det) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const inv = [
    (a[4] * a[8] - a[5] * a[7]) / det, (a[5] * a[6] - a[3] * a[8]) / det, (a[3] * a[7] - a[4] * a[6]) / det,
    (a[2] * a[7] - a[1] * a[8]) / det, (a[0] * a[8] - a[2] * a[6]) / det, (a[1] * a[6] - a[0] * a[7]) / det,
    (a[1] * a[5] - a[2] * a[4]) / det, (a[2] * a[3] - a[0] * a[5]) / det, (a[0] * a[4] - a[1] * a[3]) / det];
  return [inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]]; // transpose of the inverse
}
const apply = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];

/** Exact per-mesh report from the binary buffers, in the same shape as __INKWAVE_QA.exportTree(). */
/** Two layout-independent fingerprints of a mesh in world space.
 *  surface: how many triangles carry each rounded centroid+geometric-normal key - same multiset, same surface.
 *  normals: every shading normal present at each rounded world position, so vertex welding or re-splitting
 *  cannot fake a difference; a normal only counts as drifted if no normal at that position matches it. */
function surfaceFingerprint(world, pos, nrm, idx, count, uv) {
  const normal = normalMatrix(world);
  const worldPos = new Float64Array(count * 3);
  const keys = new Array(count);
  const normals = new Map(), strict = new Map(); // strict: keyed by position AND uv, i.e. per loop, not per point
  for (let i = 0; i < count; i++) {
    const p = apply(world, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
    worldPos.set(p, i * 3);
    keys[i] = p.map((x) => Math.round(x * 1e5)).join(',');
    if (!nrm) continue;
    const n = apply3(normal, [nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]]);
    const len = Math.hypot(...n) || 1;
    const unit = [n[0] / len, n[1] / len, n[2] / len];
    const bucket = normals.get(keys[i]);
    if (bucket) bucket.push(unit); else normals.set(keys[i], [unit]);
    const loop = keys[i] + '|' + (uv ? Math.round(uv[i * 2] * 1e4) + ',' + Math.round(uv[i * 2 + 1] * 1e4) : '');
    if (strict.has(loop)) strict.get(loop).push(unit); else strict.set(loop, [unit]);
  }
  const n = idx ? idx.length : count;
  const surface = new Map();
  for (let t = 0; t < n / 3; t++) {
    const a = (idx ? idx[t * 3] : t * 3) * 3, b = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3, c = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3;
    const u = [worldPos[b] - worldPos[a], worldPos[b + 1] - worldPos[a + 1], worldPos[b + 2] - worldPos[a + 2]];
    const v = [worldPos[c] - worldPos[a], worldPos[c + 1] - worldPos[a + 1], worldPos[c + 2] - worldPos[a + 2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...cross) || 1;
    const key = [(worldPos[a] + worldPos[b] + worldPos[c]) / 3, (worldPos[a + 1] + worldPos[b + 1] + worldPos[c + 1]) / 3,
      (worldPos[a + 2] + worldPos[b + 2] + worldPos[c + 2]) / 3].map((x) => Math.round(x * 1e5)).join(',')
      + '#' + cross.map((x) => Math.round((x / len) * 1e3)).join(',');
    surface.set(key, (surface.get(key) || 0) + 1);
  }
  return { surface, normals, strict };
}

function glbTree(file, { keepSurface = false } = {}) {
  const { gltf, bin, version, bytes } = readGLB(file);
  const scene = gltf.scenes[gltf.scene || 0];
  const parts = [], helpers = [], roots = [];
  let tris = 0, verts = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const materials = new Set();
  const walk = (index, parent, depth, chain) => {
    const node = gltf.nodes[index];
    const world = multiply(parent, nodeMatrix(node));
    const name = node.name || `node_${index}`;
    if (HELPER.test(name) || node.camera !== undefined || node.extensions?.KHR_lights_punctual) helpers.push(name);
    if (node.mesh !== undefined) {
      const mesh = gltf.meshes[node.mesh];
      for (const prim of mesh.primitives) {
        const pos = accessor(gltf, bin, prim.attributes.POSITION);
        const nrm = prim.attributes.NORMAL !== undefined ? accessor(gltf, bin, prim.attributes.NORMAL) : null;
        const uvs = prim.attributes.TEXCOORD_0 !== undefined && keepSurface ? accessor(gltf, bin, prim.attributes.TEXCOORD_0) : null;
        const idx = prim.indices !== undefined ? accessor(gltf, bin, prim.indices) : null;
        const count = pos.length / 3;
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < count; i++) {
          const p = apply(world, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
          for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
        }
        for (let k = 0; k < 3; k++) { if (min[k] < lo[k]) lo[k] = min[k]; if (max[k] > hi[k]) hi[k] = max[k]; }
        const triangles = prim.indices !== undefined ? gltf.accessors[prim.indices].count / 3 : count / 3;
        tris += triangles; verts += count;
        const material = prim.material !== undefined ? gltf.materials[prim.material] : null;
        if (material) materials.add(prim.material);
        const print = keepSurface ? surfaceFingerprint(world, pos, nrm, idx, count, uvs) : null;
        parts.push({ name, depth, chain: chain.join('/'), tris: Math.round(triangles), verts: count,
          surface: print?.surface || null, normals: print?.normals || null, strict: print?.strict || null,
          material: material ? material.name || `material_${prim.material}` : '',
          map: !!material?.pbrMetallicRoughness?.baseColorTexture,
          uv: prim.attributes.TEXCOORD_0 !== undefined, normal: prim.attributes.NORMAL !== undefined,
          min: min.map((v) => Math.round(v * 1e6) / 1e6), max: max.map((v) => Math.round(v * 1e6) / 1e6),
          extras: node.extras ? Object.keys(node.extras).sort() : [] });
      }
    }
    for (const child of node.children || []) walk(child, world, depth + 1, chain.concat(name));
  };
  for (const index of scene.nodes) { roots.push(gltf.nodes[index].name || `node_${index}`); walk(index, identity(), 0, []); }
  return { file: path.basename(file), bytes, version, asset: gltf.asset, roots, helpers,
    cameras: (gltf.cameras || []).length, lights: (gltf.extensions?.KHR_lights_punctual?.lights || []).length,
    extensionsUsed: gltf.extensionsUsed || [], images: (gltf.images || []).length, textures: (gltf.textures || []).length,
    meshes: parts.length, tris: Math.round(tris), verts, materials: materials.size,
    materialNames: [...materials].map((i) => gltf.materials[i].name || `material_${i}`),
    min: lo.map((v) => Math.round(v * 1e6) / 1e6), max: hi.map((v) => Math.round(v * 1e6) / 1e6),
    rootExtras: gltf.nodes[scene.nodes[0]]?.extras || null, gltf, parts };
}

/** Everything a glTF material says about its look, with the spec defaults filled in, so two exports compare by value. */
function describeMaterial(m) {
  const pbr = m.pbrMetallicRoughness || {}, ext = m.extensions || {};
  const coat = ext.KHR_materials_clearcoat, sheen = ext.KHR_materials_sheen, spec = ext.KHR_materials_specular;
  return {
    baseColor: pbr.baseColorFactor ?? [1, 1, 1, 1], metallic: pbr.metallicFactor ?? 1, roughness: pbr.roughnessFactor ?? 1,
    emissive: m.emissiveFactor ?? [0, 0, 0], alphaMode: m.alphaMode ?? 'OPAQUE', alphaCutoff: m.alphaMode === 'MASK' ? m.alphaCutoff ?? 0.5 : null,
    doubleSided: !!m.doubleSided,
    clearcoat: coat?.clearcoatFactor ?? 0, clearcoatRoughness: coat ? coat.clearcoatRoughnessFactor ?? 0 : 0,
    sheenColor: sheen?.sheenColorFactor ?? [0, 0, 0], sheenRoughness: sheen?.sheenRoughnessFactor ?? 0,
    specular: spec?.specularFactor ?? 1, specularColor: spec?.specularColorFactor ?? [1, 1, 1],
    ior: ext.KHR_materials_ior?.ior ?? 1.5, transmission: ext.KHR_materials_transmission?.transmissionFactor ?? 0,
    baseColorTexture: !!pbr.baseColorTexture, emissiveTexture: !!m.emissiveTexture,
    metallicRoughnessTexture: !!pbr.metallicRoughnessTexture, occlusionTexture: !!m.occlusionTexture,
    normalTexture: !!m.normalTexture, bumpTexture: !!ext.EXT_materials_bump, extras: m.extras || {},
  };
}

/** Material-by-material value comparison. The only accepted differences are the documented conversions:
 *  EXT_materials_bump -> normalTexture, and the additive cornea -> BLEND at the exporter's cornea alpha. */
function compareMaterials(label, baseline, actual, { corneaAlpha = 0.01, tolerance = 1e-4 } = {}) {
  const theirs = new Map(actual.gltf.materials.map((m) => [m.name, describeMaterial(m)]));
  const differences = [], documented = [], missing = [];
  const same = (a, b) => (Array.isArray(a) ? a.every((v, i) => Math.abs(v - b[i]) <= tolerance) : typeof a === 'number' ? Math.abs(a - b) <= tolerance : a === b);
  for (const source of baseline.gltf.materials) {
    const want = describeMaterial(source), got = theirs.get(source.name);
    if (!got) { missing.push(source.name); continue; }
    for (const key of Object.keys(want)) {
      if (key === 'extras') continue;
      if (same(want[key], got[key])) continue;
      const entry = { material: source.name, field: key, source: want[key], [label]: got[key] };
      if (want.bumpTexture && ((key === 'bumpTexture' && !got.bumpTexture) || (key === 'normalTexture' && got.normalTexture))) documented.push({ ...entry, why: 'EXT_materials_bump baked to tangent normalTexture' });
      else if (want.extras.inkwaveBlend === 'additive' && key === 'baseColor' && same(want.baseColor.slice(0, 3), got.baseColor.slice(0, 3)) && Math.abs(got.baseColor[3] - corneaAlpha) <= tolerance) documented.push({ ...entry, why: 'additive cornea exported as BLEND alpha ' + corneaAlpha });
      else differences.push(entry);
    }
    for (const [key, value] of Object.entries(want.extras)) {
      if (JSON.stringify(got.extras[key]) !== JSON.stringify(value)) differences.push({ material: source.name, field: 'extras.' + key, source: value, [label]: got.extras[key] });
    }
  }
  const issues = [];
  if (missing.length) issues.push(`${missing.length} materials missing: ${missing.slice(0, 6).join(', ')}`);
  if (differences.length) issues.push(`${differences.length} material values differ: ${differences.slice(0, 6).map((d) => `${d.material}.${d.field}`).join(', ')}`);
  return { label, compared: baseline.gltf.materials.length, missing, differences: differences.slice(0, 200), differenceCount: differences.length,
    documented: documented.length, documentedKinds: [...new Set(documented.map((d) => d.why))], pass: issues.length === 0, issues };
}

/** Same mesh -> same material name, and every node extras key the runtime wrote is still there. */
function compareAssignments(baseline, actual) {
  const theirs = new Map(actual.parts.map((part) => [norm(part.name), part]));
  let materialSwaps = 0, extrasLost = 0; const examples = [];
  for (const want of baseline.parts) {
    const got = theirs.get(norm(want.name));
    if (!got) continue;
    if (got.material !== want.material) { materialSwaps++; if (examples.length < 6) examples.push(`${want.name}: ${want.material} -> ${got.material}`); }
    if (want.extras.some((key) => !got.extras.includes(key))) { extrasLost++; if (examples.length < 6) examples.push(`${want.name}: extras ${want.extras} -> ${got.extras}`); }
  }
  const nodes = (tree) => tree.gltf.nodes.filter((n) => n.extras && Object.keys(n.extras).length).length;
  return { materialSwaps, extrasLost, nodesWithExtras: nodes(actual), baselineNodesWithExtras: nodes(baseline), examples };
}

const norm = (name) => name.replace(/\.\d{3}$/, '');
function compare(label, expected, actual, tolerance, { exactVerts = true } = {}) {
  const issues = [];
  const add = (message) => issues.push(message);
  if (expected.tris !== actual.tris) add(`triangles ${actual.tris} != ${expected.tris}`);
  // Vertex count is an encoding detail once a mesh has been through Blender: the importer welds and the
  // exporter re-splits at normal/UV seams. compareSurface() is what guarantees the surface itself.
  if (expected.verts !== actual.verts && exactVerts) add(`vertices ${actual.verts} != ${expected.verts}`);
  if (expected.meshes !== actual.meshes) add(`meshes ${actual.meshes} != ${expected.meshes}`);
  for (let k = 0; k < 3; k++) {
    if (Math.abs(expected.min[k] - actual.min[k]) > tolerance) add(`bounds min[${k}] ${actual.min[k]} != ${expected.min[k]}`);
    if (Math.abs(expected.max[k] - actual.max[k]) > tolerance) add(`bounds max[${k}] ${actual.max[k]} != ${expected.max[k]}`);
  }
  const byName = new Map();
  for (const part of actual.parts) {
    const key = norm(part.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(part);
  }
  let worstBound = 0, worstPart = null, missing = 0, mismatched = 0, noUV = 0, noNormal = 0;
  const used = new Set(); // one GLB mesh can satisfy one contract entry only
  for (const want of expected.parts) {
    const candidates = (byName.get(norm(want.name)) || []).filter((c) => !used.has(c));
    const got = candidates.find((c) => c.tris === want.tris && (!exactVerts || c.verts === want.verts)) || candidates[0];
    if (!got) { missing++; if (missing <= 5) add(`missing mesh ${want.name}`); continue; }
    used.add(got);
    if (want.material && got.material !== want.material) { mismatched++; if (mismatched <= 5) add(`${want.name}: material ${got.material} != ${want.material}`); }
    if (got.tris !== want.tris || (exactVerts && got.verts !== want.verts)) {
      mismatched++; if (mismatched <= 5) add(`${want.name}: ${got.tris}t/${got.verts}v != ${want.tris}t/${want.verts}v`);
    }
    if (want.uv && !got.uv) noUV++;
    if (want.normal && !got.normal) noNormal++;
    for (let k = 0; k < 3; k++) {
      for (const key of ['min', 'max']) {
        const delta = Math.abs(want[key][k] - got[key][k]);
        if (delta > worstBound) { worstBound = delta; worstPart = `${want.name}.${key}[${k}] ${got[key][k]} vs ${want[key][k]}`; }
      }
    }
  }
  if (noUV) add(`${noUV} meshes lost their UV set`);
  if (noNormal) add(`${noNormal} meshes lost their normals`);
  if (worstBound > tolerance) add(`worst world-bound drift ${worstBound.toExponential(2)} m at ${worstPart}`);
  if (actual.helpers.length) add(`helper/reference/camera nodes present: ${actual.helpers.slice(0, 6).join(', ')}`);
  if (actual.cameras) add(`${actual.cameras} camera(s) exported`);
  if (actual.lights) add(`${actual.lights} punctual light(s) exported`);
  return { label, file: actual.file, bytes: actual.bytes, meshes: actual.meshes, tris: actual.tris, verts: actual.verts,
    vertexDelta: actual.verts - expected.verts, rootExtraKeys: actual.rootExtras ? Object.keys(actual.rootExtras) : [],
    materials: actual.materials, images: actual.images, textures: actual.textures, extensionsUsed: actual.extensionsUsed,
    roots: actual.roots, min: actual.min, max: actual.max, worstBoundDrift: worstBound, worstBoundAt: worstPart,
    missing, mismatched, tolerance, pass: issues.length === 0, issues };
}

/** Triangle-level equality against the GLB the runtime wrote: proves Blender changed no surface, even where
 *  it re-split vertices at normal/UV seams (a glTF -> Blender -> glTF encoding difference, not a geometry one). */
function compareSurface(label, baseline, actual, maxNormalDrift) {
  const issues = [];
  const index = new Map(actual.parts.map((part) => [norm(part.name), part]));
  let differingTriangles = 0, missing = 0, maxAngle = 0, maxAngleAt = null, checked = 0, unmatchedPositions = 0;
  const drift = { over1: 0, over5: 0, over15: 0 }, worst = [], strictWorst = [];
  let strictChecked = 0, strictOver15 = 0;
  for (const want of baseline.parts) {
    const got = index.get(norm(want.name));
    if (!got) { missing++; if (missing <= 5) issues.push(`missing mesh ${want.name}`); continue; }
    if (got.tris !== want.tris) { issues.push(`${want.name}: ${got.tris} triangles != ${want.tris}`); continue; }
    let differs = 0;
    for (const [key, count] of want.surface) differs += Math.abs(count - (got.surface.get(key) || 0));
    for (const key of got.surface.keys()) if (!want.surface.has(key)) differs += got.surface.get(key);
    if (differs) { differingTriangles += differs; if (issues.length < 6) issues.push(`${want.name}: ${differs} triangles differ`); }
    let partDrift = 0;
    for (const [key, mine] of want.normals) {
      const theirs = got.normals.get(key);
      if (!theirs) { unmatchedPositions++; continue; }
      for (const n of mine) {
        let best = 180;
        for (const m of theirs) {
          const dot = n[0] * m[0] + n[1] * m[1] + n[2] * m[2];
          const angle = Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
          if (angle < best) best = angle;
        }
        checked++;
        if (best > 1) drift.over1++;
        if (best > 5) drift.over5++;
        if (best > 15) { drift.over15++; partDrift++; }
        if (best > maxAngle) { maxAngle = best; maxAngleAt = `${want.name} @ ${key}`; }
      }
    }
    if (partDrift) worst.push({ part: want.name, normals: partDrift });
    let loopDrift = 0;
    for (const [key, mine] of want.strict) {
      const theirs = got.strict.get(key);
      if (!theirs) continue;
      for (const n of mine) {
        strictChecked++;
        if (!theirs.some((m) => n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= Math.cos(15 * Math.PI / 180))) { strictOver15++; loopDrift++; }
      }
    }
    if (loopDrift) strictWorst.push({ part: want.name, normals: loopDrift });
  }
  strictWorst.sort((a, b) => b.normals - a.normals);
  if (strictOver15 > strictChecked * maxStrictDrift) issues.push(`${strictOver15} of ${strictChecked} per-loop normals moved more than 15 deg`);
  worst.sort((a, b) => b.normals - a.normals);
  if (unmatchedPositions) issues.push(`${unmatchedPositions} vertex positions exist only in the baseline`);
  if (drift.over15 > Math.max(4, checked * maxNormalDrift)) {
    issues.push(`${drift.over15} of ${checked} shading normals moved more than 15 deg (${worst.slice(0, 3).map((w) => w.part).join(', ')})`);
  }
  if (differingTriangles) issues.push(`${differingTriangles} triangles differ from the runtime surface`);
  return { label, baseline: baseline.file, file: actual.file, triangles: actual.tris,
    vertexSplitDelta: actual.verts - baseline.verts, differingTriangles, missing,
    maxShadingNormalDeg: Math.round(maxAngle * 1000) / 1000, maxShadingNormalAt: maxAngleAt,
    normalsChecked: checked, unmatchedPositions, normalDrift: drift, worstParts: worst.slice(0, 5),
    perLoopNormals: { checked: strictChecked, over15: strictOver15, share: strictChecked ? Math.round(strictOver15 / strictChecked * 1e5) / 1e5 : 0, worstParts: strictWorst.slice(0, 6) },
    pass: issues.length === 0, issues };
}

/** Material -> base-colour-texture map, so a lost or merged image shows up as a named difference. */
function textureTable(tree) {
  const table = new Map();
  for (const part of tree.parts) if (!table.has(part.material)) table.set(part.material, part.map);
  return table;
}

const argv = process.argv.slice(2);
const read = (flag) => { const i = argv.indexOf(flag); return i < 0 ? null : argv[i + 1]; };
const glbs = argv.reduce((acc, value, i) => (argv[i - 1] === '--glb' ? acc.concat(value) : acc), []);
const treePath = read('--tree');
const baselinePath = read('--baseline');
const out = read('--out');
const tolerance = Number(read('--tolerance') || 2e-5);
const maxNormalDrift = Number(read('--max-normal-drift') || 0.0005); // share of shading normals allowed past 15 deg
const corneaAlpha = Number(read('--cornea-alpha') || 0.01);
// Per-loop (position + UV) normals may drift only where Blender cannot encode the runtime normal: see blender/README.md.
const maxStrictDrift = Number(read('--max-loop-normal-drift') || 0.005); // CORNEA_EXPORT_ALPHA in inkwave_blender_import.py
if (!treePath || !glbs.length) {
  console.error('usage: --tree <export_tree.json> --glb label=file.glb [...] [--baseline base.glb] [--out report.json]');
  process.exit(2);
}
const expected = JSON.parse(fs.readFileSync(treePath, 'utf8'));
const baseline = baselinePath ? glbTree(path.resolve(baselinePath), { keepSurface: true }) : null;
const baselineTextures = baseline ? textureTable(baseline) : null;
const contracts = [], surfaces = [];
for (const entry of glbs) {
  const [label, file] = entry.includes('=') ? [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)] : ['glb', entry];
  const resolved = path.resolve(file);
  const isBaseline = baseline && resolved === path.resolve(baselinePath);
  const tree = isBaseline ? baseline : glbTree(resolved, { keepSurface: !!baseline });
  contracts.push(compare(label, expected, tree, tolerance, { exactVerts: !baseline || isBaseline }));
  if (baseline && !isBaseline) {
    const surface = compareSurface(label, baseline, tree, maxNormalDrift);
    const theirs = textureTable(tree);
    const lost = [...baselineTextures].filter(([name, had]) => had && !theirs.get(name)).map(([name]) => name);
    if (lost.length) surface.issues.push(`materials that lost their base-colour texture: ${lost.slice(0, 8).join(', ')}`);
    surface.materialsWithTexture = [...theirs.values()].filter(Boolean).length;
    surface.baselineMaterialsWithTexture = [...baselineTextures.values()].filter(Boolean).length;
    surface.lostTextures = lost.length;
    surface.materials = compareMaterials(label, baseline, tree, { corneaAlpha });
    surface.assignments = compareAssignments(baseline, tree);
    surface.issues.push(...surface.materials.issues);
    if (surface.assignments.materialSwaps) surface.issues.push(`${surface.assignments.materialSwaps} meshes changed material`);
    if (surface.assignments.extrasLost) surface.issues.push(`${surface.assignments.extrasLost} nodes lost extras`);
    const rootKeys = Object.keys(baseline.rootExtras || {}).filter((key) => !(key in (tree.rootExtras || {})));
    if (rootKeys.length) surface.issues.push(`root extras lost: ${rootKeys.join(', ')}`);
    surface.pass = surface.issues.length === 0;
    surfaces.push(surface);
  }
  if (!isBaseline) { for (const part of tree.parts) { delete part.surface; delete part.normals; delete part.strict; } delete tree.gltf; }
}
if (baseline) { for (const part of baseline.parts) { delete part.surface; delete part.normals; delete part.strict; } delete baseline.gltf; }
const summary = {
  contract: { source: path.basename(treePath), meshes: expected.meshes, tris: expected.tris, verts: expected.verts,
    materials: expected.materials, min: expected.min, max: expected.max },
  tolerance, baseline: baseline ? baseline.file : null,
  pass: contracts.every((r) => r.pass) && surfaces.every((r) => r.pass),
  contracts: contracts.map(({ parts, ...rest }) => rest), surfaces,
};
if (out) fs.writeFileSync(out, JSON.stringify(summary, null, 2));
for (const r of summary.contracts) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'} contract ${r.label.padEnd(7)} ${r.file} meshes=${r.meshes} tris=${r.tris} verts=${r.verts} mats=${r.materials} img=${r.images} drift=${r.worstBoundDrift.toExponential(2)}`);
  for (const issue of r.issues) console.log(`     - ${issue}`);
}
for (const r of summary.surfaces) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'} surface  ${r.label.padEnd(7)} ${r.file} vs ${r.baseline} triDiff=${r.differingTriangles} normals>15deg=${r.normalDrift.over15}/${r.normalsChecked} max=${r.maxShadingNormalDeg} vertSplit=${r.vertexSplitDelta >= 0 ? '+' : ''}${r.vertexSplitDelta} tex=${r.materialsWithTexture}/${r.baselineMaterialsWithTexture}`);
  console.log(`     per-loop normals >15deg ${r.perLoopNormals.over15}/${r.perLoopNormals.checked} (${r.perLoopNormals.worstParts.map((w) => w.part + ':' + w.normals).join(', ')})`);
  console.log(`     materials ${r.materials.compared} compared, ${r.materials.differenceCount} undocumented diffs, ${r.materials.documented} documented (${r.materials.documentedKinds.join('; ')}); swaps=${r.assignments.materialSwaps} extras ${r.assignments.nodesWithExtras}/${r.assignments.baselineNodesWithExtras}`);
  for (const issue of r.issues) console.log(`     - ${issue}`);
}
console.log(summary.pass ? 'ROUNDTRIP PASS' : 'ROUNDTRIP FAIL');
process.exit(summary.pass ? 0 : 1);
