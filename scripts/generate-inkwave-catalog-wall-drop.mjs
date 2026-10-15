import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MAIN_WEAPON_CATALOG } from '../patches/splatoon3/runtime/main-weapon-catalog-data.mjs';
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/generate-inkwave-catalog-wall-drop.mjs RAW_WEAPON_DIRECTORY');
const families = new Set(['shooter', 'splatling', 'dualies']);
const moveKeys = ['FallPeriodFirstFrameMin','FallPeriodFirstFrameMax','FallPeriodFirstTargetSpeed',
  'FallPeriodSecondFrame','FallPeriodSecondTargetSpeed','FallPeriodLastFrameMin','FallPeriodLastFrameMax'];
const paintKeys = ['PaintRadiusShock','PaintRadiusFall','PaintRadiusGround'];
const records = {};
for (const r of MAIN_WEAPON_CATALOG.records.filter(r => !r.legacy && families.has(r.family))) {
  const bytes = fs.readFileSync(path.join(source, r.sourceActor + '.game__GameParameterTable.json'));
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (sha !== r.sourceSha256) throw new Error('Wrong pinned source: ' + r.id);
  const p = JSON.parse(bytes).GameParameters;
  const fields = (value, keys) => Object.fromEntries(keys.map(k => {
    if (!Number.isFinite(value?.[k]) || value[k] < 0) throw new Error('Missing numeric source: ' + r.id + '/' + k);
    return [k, value[k]];
  }));
  records[r.id] = {sourceActor:r.sourceActor, sourceSha256:sha,
    move:fields(p.WallDropMoveParam,moveKeys), paint:fields(p.WallDropCollisionPaintParam,paintKeys),
    // Keep explicit enum provenance; the existing finite-period model does not
    // implement an inferred post-period free-fall law from this string.
    freeGravityType:p.WallDropMoveParam.FreeGravityType ?? null};
}
if (Object.keys(records).length !== 23) throw new Error('Unexpected family coverage');
const out = new URL('../patches/splatoon3/runtime/catalog-wall-drop-data.mjs', import.meta.url);
fs.writeFileSync(out, '// Generated from pinned Splatoon 3 11.3.0 numerical records.\n' +
  '// Existing INKWAVE finite-period wall-slide model; not a retail primitive claim.\n' +
  'export const CATALOG_WALL_DROP = ' + JSON.stringify(records,null,2) + ';\n');
console.log('Wrote 23 pinned wall-drop records');
