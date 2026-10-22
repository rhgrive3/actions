// QA byte binding between source audit completion and private physics admission.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
export const TERRAIN_FILES=['vertices.bin','indices.bin','collision.bin','normals.bin','flags.bin','objects.bin','bvh.bin','order.bin','triangleFace.bin','mask.bin','manifest.json'];
export function terrainFileReceipt(bytes){return {bytes:bytes.byteLength,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};}
export function assertTerrainReceipt(actual,expected){
 assert(expected&&typeof expected==='object','Missing audit-time byte receipt');
 assert.deepEqual(Object.keys(expected).sort(),[...TERRAIN_FILES].sort(),'Incomplete audit-time byte receipt');
 assert.deepEqual(Object.keys(actual).sort(),[...TERRAIN_FILES].sort(),'Incomplete current byte receipt');
 for(const name of TERRAIN_FILES){
  const pin=expected[name];assert(pin&&Number.isSafeInteger(pin.bytes)&&pin.bytes>=0&&/^[a-f0-9]{64}$/.test(pin.sha256),'Malformed audit-time byte receipt: '+name);
  assert.deepEqual(actual[name],pin,'Audit-to-fixture byte mismatch: '+name);
 }
}
