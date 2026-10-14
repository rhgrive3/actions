// Original mathematical QA ribbon and tiny procedural maps. No user/model/reference artwork.
import zlib from 'node:zlib';
function crc(bytes) { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function png(colors) {
  const chunk = (type, data) => { const b = Buffer.alloc(data.length + 12); b.writeUInt32BE(data.length); b.write(type, 4); data.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, -4)), b.length - 4); return b; };
  const h = Buffer.alloc(13); h.writeUInt32BE(2); h.writeUInt32BE(2, 4); h[8] = 8; h[9] = 6;
  const scan = Buffer.from([0, ...colors[0], ...colors[1], 0, ...colors[2], ...colors[3]]);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', h), chunk('IDAT', zlib.deflateSync(scan)), chunk('IEND', Buffer.alloc(0))]);
}
export function syntheticGLB() {
  const buffers = [], views = [], accessors = []; let length = 0;
  const add = bytes => { const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4); bytes.copy(padded); const i = views.length; views.push({buffer: 0, byteOffset: length, byteLength: bytes.length}); buffers.push(padded); length += padded.length; return i; };
  const acc = (values, type, componentType) => { const n = {SCALAR: 1, VEC2: 2, VEC3: 3}[type], b = Buffer.alloc(values.length * (componentType === 5126 ? 4 : 2)); values.forEach((v, i) => componentType === 5126 ? b.writeFloatLE(v, i * 4) : b.writeUInt16LE(v, i * 2)); const a = {bufferView: add(b), componentType, count: values.length / n, type}; if (type === 'VEC3') { a.min = Array.from({length: 3}, (_, i) => Math.min(...values.filter((_, j) => j % 3 === i))); a.max = Array.from({length: 3}, (_, i) => Math.max(...values.filter((_, j) => j % 3 === i))); } accessors.push(a); return accessors.length - 1; };
  const p = [], n = [], uv = [], ix = [], segments = 12;
  for (let y = 0; y <= segments; y++) for (let x = 0; x < 2; x++) { const v = y / segments; p.push((x - .5) * .06, v * .18, .012 * Math.sin(v * Math.PI * 2)); const dz = .024 * Math.PI * Math.cos(v * Math.PI * 2) / .18, q = Math.hypot(1, dz); n.push(0, -dz / q, 1 / q); uv.push(x, v); }
  for (let y = 0; y < segments; y++) { const a = y * 2; ix.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const attributes = {POSITION: acc(p, 'VEC3', 5126), NORMAL: acc(n, 'VEC3', 5126), TEXCOORD_0: acc(uv, 'VEC2', 5126), TEXCOORD_1: acc(uv, 'VEC2', 5126)}, indices = acc(ix, 'SCALAR', 5123);
  const maps = [png([[150,70,90,255],[80,140,160,255],[210,180,100,255],[100,100,180,255]]), png([[12,4,4,255],[3,12,8,255],[10,10,4,255],[3,3,12,255]]), png([[35,35,35,255],[200,200,200,255],[100,100,100,255],[180,180,180,255]])];
  const images = maps.map((bytes, i) => ({name: `procedural-map-${i}`, mimeType: 'image/png', bufferView: add(bytes)}));
  const extensions = ['KHR_materials_clearcoat','KHR_materials_transmission','KHR_materials_specular','KHR_materials_ior'];
  const g = {asset: {version: '2.0', generator: 'INKWAVE original neutral QA fixture'}, scene: 0, scenes: [{nodes: [0]}], nodes: [{name: 'neutral-qa-ribbon', mesh: 0}], meshes: [{primitives: [{attributes, indices, material: 0}]}], materials: [{name: 'neutral-qa-pbr', doubleSided: true, pbrMetallicRoughness: {baseColorTexture: {index: 0, texCoord: 1}, metallicFactor: 0, roughnessFactor: .3}, emissiveTexture: {index: 1, texCoord: 1}, emissiveFactor: [1,1,1], extensions: {KHR_materials_clearcoat: {clearcoatFactor: 1, clearcoatTexture: {index: 2, texCoord: 1}, clearcoatRoughnessFactor: .12}, KHR_materials_transmission: {transmissionFactor: .06}, KHR_materials_specular: {specularFactor: .7}, KHR_materials_ior: {ior: 1.46}}}], textures: images.map((_, source) => ({source})), images, buffers: [{byteLength: length}], bufferViews: views, accessors, extensionsUsed: extensions};
  const raw = Buffer.from(JSON.stringify(g)), json = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(json); const bin = Buffer.concat(buffers), header = Buffer.alloc(12), a = Buffer.alloc(8), b = Buffer.alloc(8); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2,4); header.writeUInt32LE(28 + json.length + bin.length,8); a.writeUInt32LE(json.length); a.writeUInt32LE(0x4e4f534a,4); b.writeUInt32LE(bin.length); b.writeUInt32LE(0x004e4942,4); return Buffer.concat([header,a,json,b,bin]);
}
