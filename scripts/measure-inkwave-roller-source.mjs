// Read only indexed Roll-material vertices in the pinned public OBJ exports.
// Usage: node scripts/measure-inkwave-roller-source.mjs <download-dir> <output.json>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = process.argv[2], output = process.argv[3];
if (!root || !output) throw Error('Expected download directory and output JSON');
const revision = '0611f51b35c9736ee986fb2218461e2585b7875e';
const records = [
  ['roller', 'NormalT', 'Wmn_Roller_NormalT_Roll__M_Roll'],
  ['s3-roller-compact', 'Compact', 'Wmn_Roller_Compact_Roll__M_CustomRoll'],
  ['s3-roller-heavy', 'Heavy', 'Wmn_Roller_Heavy_Roll__M_Roll'],
  ['s3-roller-hunter', 'Hunter', 'Wmn_Roller_Hunter_model__M_Roll'],
  ['s3-roller-wide', 'Wide', 'Wmn_Roller_Wide_Roll__M_Roll'],
].map(([id, name, object]) => {
  const bytes = fs.readFileSync(path.join(root, name + '.obj'));
  const vertices = [], used = new Set();
  let selected = false, triangles = 0;
  for (const line of bytes.toString('utf8').split(/\r?\n/)) {
    if (line.startsWith('v ')) vertices.push(line.slice(2).trim().split(/\s+/).map(Number));
    if (line.startsWith('o ')) selected = line.slice(2).trim() === object;
    if (selected && line.startsWith('f ')) {
      const indices = line.slice(2).trim().split(/\s+/).map(v => Number(v.split('/')[0]));
      if (indices.length !== 3) throw Error('Expected indexed triangles: ' + object);
      for (const n of indices) used.add(n > 0 ? n - 1 : vertices.length + n);
      triangles++;
    }
  }
  if (!used.size) throw Error('Missing Roll geometry: ' + object);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const n of used) for (let axis = 0; axis < 3; axis++) {
    const value = vertices[n]?.[axis];
    if (!Number.isFinite(value)) throw Error('Invalid indexed vertex');
    min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
  }
  return { id, sourceModel: 'Wmn_Roller_' + name, object,
    url: `https://media.githubusercontent.com/media/kirakira-dev/KiTrix/${revision}/models/weapons/Wmn_Roller_${name}/Wmn_Roller_${name}.obj`,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    triangles, indexedVertices: used.size, min, max, width: +(max[0] - min[0]).toFixed(6) };
});
fs.writeFileSync(output, JSON.stringify({ schema: 1, sourceRevision: revision,
  meshVersion1130Verified: false,
  method: 'Indexed X extent of the named Roll material; exported bind geometry, not retail motion capture.',
  worldUnitsPerSourceUnit: 1, sourceUnitsPerRangeLine: 5,
  retailRuntimeModelScaleVerified: false, retailPaintMaskVerified: false,
  records }, null, 2) + '\n');
console.log(JSON.stringify(records.map(({id,width}) => ({id,width}))));
