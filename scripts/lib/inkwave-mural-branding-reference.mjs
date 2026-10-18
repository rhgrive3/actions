import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// #1612 a1f6b2ea70d4e95bf3a98bc259c8db128770f21a changes only
// these three text draws. This independent reference deliberately does NOT
// apply atlas lifecycle/build adapters or import the production compositor.
export const MURAL_RAW_BLOB = 'ba5a2d57c445392725ae0070140d2c61c0164406';
export const MURAL_BRANDING_OWNER = 'a1f6b2ea70d4e95bf3a98bc259c8db128770f21a';
export const MURAL_BRANDING_DRAWS = Object.freeze([
  "strokeText('INKWAVE', ox + 300, 186)",
  "fillText('INKWAVE', ox + 300, 186)",
  "fillText('INKWAVE', ox + 294, 180)",
]);
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
export function brandMuralReference(raw) {
  assert.equal(typeof raw,'string','raw mural source required');
  assert.equal(blob(raw),MURAL_RAW_BLOB,'unreviewed raw mural source');
  let source=raw;
  for(const before of MURAL_BRANDING_DRAWS){
    const after=before.replace("'INKWAVE'","'ZEVANT'");
    assert.equal(source.split(before).length-1,1,'one reviewed mural text draw');
    assert.equal(source.split(after).length-1,0,'no mixed branded reference');
    source=source.replace(before,after);
  }
  return source;
}
