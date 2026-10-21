// Small integrity-checked inputs for the real bundled native load/level/physics.
// These bytes are QA data, never a replacement for the emitted engine module.
export const PREPARED_STAGE_ID = 'synthetic-recovery';
export async function preparedStageAssets(crypto) {
  const encode = value => new TextEncoder().encode(JSON.stringify(value));
  const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
  const manifest = { schema: 1, id: PREPARED_STAGE_ID, bounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
    spawnPads: [[-3, 1, 0], [3, 1, 0]], spawnBarrier: 0, faces: [], gridCells: 0,
    geometry: { vertices: 3, triangles: 1, collisionTriangles: 0 },
    objects: [{ name: 'prepared-triangle', active: true, collidable: false, material: 'test', vo: 0, vc: 3, io: 0, ic: 3 }],
    materials: { test: { tint: '#3987df' } } };
  const arrays = { vertices: new Float32Array([-2,0,-2,0,1,0,0,0,2,0,-2,0,1,0,1,0,0,0,2,0,1,0,.5,1]),
    indices: new Uint32Array([0,1,2]), collision: new Float32Array(), normals: new Float32Array(), flags: new Uint32Array(),
    objects: new Uint32Array(), bvh: new Float32Array([-4,0,-4,4,0,4,0,0]), order: new Uint32Array(), triangleFace: new Int32Array(), mask: new Uint8Array() };
  const files = new Map([['manifest.json', encode(manifest)]]);
  for (const [name, array] of Object.entries(arrays)) files.set(name + '.bin', new Uint8Array(array.buffer));
  const integrity = {};
  for (const [name, bytes] of files) integrity[name] = { bytes: bytes.byteLength, sha256: await digest(bytes) };
  const raw = encode(integrity); files.set('integrity.json', raw);
  const config = { mode: 'compiled', stages: [{ id: PREPARED_STAGE_ID, integritySha256: await digest(raw) }] };
  const data = { manifest, integrity, ...arrays, triangles: arrays.collision, objectIds: arrays.objects, nodes: arrays.bvh };
  return { files, config, manifest, data };
}
