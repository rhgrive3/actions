import assert from 'node:assert/strict';
import crypto from 'node:crypto';
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function inspectGLB(bytes, expectedSha) {
  assert(Buffer.isBuffer(bytes) && bytes.length >= 28 && bytes.length <= 8 * 1024 * 1024, 'GLB size must be 28 bytes..8 MiB');
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length');
  if (expectedSha !== undefined) { assert.match(expectedSha, /^[a-f0-9]{64}$/); assert.equal(hash(bytes), expectedSha, 'GLB SHA256'); }
  const chunks = [];
  for (let at = 12; at < bytes.length;) {
    assert(at + 8 <= bytes.length, 'truncated chunk'); const length = bytes.readUInt32LE(at), type = bytes.readUInt32LE(at + 4);
    assert.equal(length % 4, 0, 'chunk alignment'); assert(at + 8 + length <= bytes.length, 'chunk bounds');
    chunks.push({type, data: bytes.subarray(at + 8, at + 8 + length)}); at += 8 + length;
  }
  assert.equal(chunks.length, 2, 'exactly JSON and BIN chunks'); assert.equal(chunks[0].type, 0x4e4f534a); assert.equal(chunks[1].type, 0x004e4942);
  const gltf = JSON.parse(chunks[0].data.toString('utf8')), binary = chunks[1].data;
  assert.equal(gltf.asset?.version, '2.0'); assert.equal(gltf.buffers?.length, 1); assert(!gltf.buffers[0].uri, 'external buffers forbidden');
  assert(Number.isInteger(gltf.buffers[0].byteLength) && gltf.buffers[0].byteLength <= binary.length && binary.length - gltf.buffers[0].byteLength <= 3, 'binary length');
  assert.equal((gltf.skins || []).length, 0, 'this first fixture is static only'); assert.equal((gltf.animations || []).length, 0, 'this first fixture has no animation');
  for (const view of gltf.bufferViews || []) {
    assert.equal(view.buffer, 0); const start = view.byteOffset || 0;
    assert(Number.isInteger(start) && start >= 0 && Number.isInteger(view.byteLength) && view.byteLength >= 0 && start + view.byteLength <= gltf.buffers[0].byteLength, 'buffer view bounds');
  }
  const sizes = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}, types = {5121: [1, 'readUInt8'], 5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE']};
  function accessor(index) {
    const a = gltf.accessors?.[index]; assert(a && !a.sparse && !a.normalized, 'supported dense accessor');
    const v = gltf.bufferViews[a.bufferView], type = types[a.componentType], n = sizes[a.type]; assert(v && type && n, 'accessor type');
    assert(Number.isInteger(a.count) && a.count > 0, 'accessor count'); const offset = a.byteOffset || 0, stride = v.byteStride || type[0] * n;
    assert(Number.isInteger(offset) && offset >= 0 && Number.isInteger(stride) && stride >= type[0] * n && stride % type[0] === 0, 'accessor layout');
    assert(offset + (a.count - 1) * stride + n * type[0] <= v.byteLength, 'accessor exceeds view');
    const data = [];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) { const value = binary[type[1]]((v.byteOffset || 0) + offset + i * stride + c * type[0]); assert(Number.isFinite(value), 'finite accessor'); data.push(value); }
    return {a, n, data};
  }
  let triangles = 0, primitives = 0; const uvSets = new Set();
  assert.equal(gltf.meshes?.length, 1, 'one-mesh pilot only');
  for (const mesh of gltf.meshes) for (const p of mesh.primitives) {
    assert.equal(p.mode ?? 4, 4, 'triangles only'); assert(!p.targets && !p.extensions, 'no morph/compressed primitive');
    const position = accessor(p.attributes.POSITION); assert.equal(position.a.type, 'VEC3'); assert.equal(position.a.componentType, 5126);
    const indices = accessor(p.indices); assert.equal(indices.a.type, 'SCALAR'); assert([5121, 5123, 5125].includes(indices.a.componentType)); assert.equal(indices.a.count % 3, 0);
    assert(indices.data.every(i => i < position.a.count), 'indices in bounds');
    for (const [key, index] of Object.entries(p.attributes)) { const attr = accessor(index); assert.equal(attr.a.count, position.a.count, 'attribute count'); if (key.startsWith('TEXCOORD_')) uvSets.add(key); }
    assert(uvSets.has('TEXCOORD_0'), 'UV required'); assert(gltf.materials?.[p.material], 'material required'); triangles += indices.a.count / 3; primitives++;
  }
  for (const im of gltf.images || []) { assert(!im.uri && Number.isInteger(im.bufferView), 'embedded images only'); assert(['image/png', 'image/jpeg'].includes(im.mimeType)); assert(gltf.bufferViews[im.bufferView]?.byteLength > 0); }
  assert(gltf.images?.length > 0, 'textured fixture required');
  for (const texture of gltf.textures || []) assert(gltf.images[texture.source], 'valid texture source');
  for (const [i, node] of (gltf.nodes || []).entries()) {
    assert(node.skin === undefined, 'no skin node'); if (node.mesh !== undefined) assert(gltf.meshes[node.mesh], 'mesh reference');
    for (const key of ['matrix', 'translation', 'rotation', 'scale']) if (node[key]) assert(node[key].every(Number.isFinite), 'finite transform');
    for (const child of node.children || []) assert(Number.isInteger(child) && child >= 0 && child < gltf.nodes.length && child !== i, 'node child');
  }
  const visited = new Set(), active = new Set();
  function visit(i) { assert(gltf.nodes[i], 'scene node'); assert(!active.has(i), 'node cycle'); if (visited.has(i)) return; active.add(i); for (const c of gltf.nodes[i].children || []) visit(c); active.delete(i); visited.add(i); }
  assert(gltf.scenes?.[gltf.scene ?? 0], 'default scene'); for (const i of gltf.scenes[gltf.scene ?? 0].nodes || []) visit(i);
  assert([...visited].some(i => gltf.nodes[i].mesh !== undefined), 'reachable mesh');
  return {sha256: hash(bytes), bytes: bytes.length, triangles, primitives, meshes: gltf.meshes.length, images: gltf.images.length, uvSets: [...uvSets].sort(), skins: 0, animations: 0, extensions: gltf.extensionsUsed || []};
}
export function assertScenarioMatrix(rows) {
  const expected = [];
  for (const count of [1, 8]) for (const light of ['day', 'shade']) for (const view of ['front', 'side65', 'back']) for (const shadows of [false, true]) expected.push(`${count}/${light}/${view}/${shadows}`);
  assert.equal(rows.length, expected.length); const actual = rows.map(r => `${r.count}/${r.light}/${r.view}/${r.shadows}`);
  assert.equal(new Set(actual).size, expected.length); assert.deepEqual([...actual].sort(), [...expected].sort());
  for (const row of rows) { assert.equal(row.nativeCharacters,row.count,'native character count'); assert(row.changedPixels >= 16, 'asset produced visible pixels'); for (const k of ['calls', 'triangles', 'loadMs', 'compileMs', 'p50Ms', 'p95Ms']) assert(Number.isFinite(row[k]) && row[k] >= 0, `finite ${k}`); assert(row.calls > 0 && row.triangles > 0); assert.equal(row.renderSamples, 12); }
}
export function assertLifecycle(rows) {
  assert.equal(rows.length, 10, 'ten fresh parse/dispose cycles');
  for (let i = 0; i < rows.length; i++) { const r = rows[i]; assert.equal(r.cycle, i); assert.equal(r.count, i % 2 ? 8 : 1); assert(r.disposed.geometry > 0 && r.disposed.material > 0 && r.disposed.texture > 0); assert.equal(r.remainingCandidates, 0); assert.deepEqual(r.memoryAfter, rows[0].memoryAfter, 'post-warmup retained geometry/texture drift'); }
}
