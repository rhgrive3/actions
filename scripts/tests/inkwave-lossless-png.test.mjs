import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {optimizePngLossless} from '../lib/inkwave-lossless-png.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const dir=path.join(root,'inkwave-public/assets/lightmaps');
function inflateIds(bytes){
  let pos=8, data=[];
  while(pos<bytes.length){
    const size=bytes.readUInt32BE(pos), kind=bytes.toString('ascii',pos+4,pos+8);
    if(kind==='IDAT')data.push(bytes.subarray(pos+8,pos+8+size));
    pos+=size+12;
  }
  return zlib.inflateSync(Buffer.concat(data));
}
test('PNG lossless repacker preserves original encoded lightmap pixels and never grows output',()=>{
  let beforeBytes=0,afterBytes=0;
  for(const name of fs.readdirSync(dir).filter(x=>x.endsWith('.png'))){
    const original=fs.readFileSync(path.join(dir,name));
    const {bytes,savedBytes}=optimizePngLossless(original);
    assert.ok(savedBytes>=0,name+' must not grow');
    assert.equal(original.length-bytes.length,savedBytes);
    assert.deepEqual(inflateIds(bytes),inflateIds(original),name+' decoded scanlines');
    assert.deepEqual(bytes.subarray(0,8),original.subarray(0,8));
    const repeated=optimizePngLossless(bytes);
    assert.deepEqual(repeated.bytes,bytes,name+' stable output');
    beforeBytes+=original.length;afterBytes+=bytes.length;
  }
  assert.ok(afterBytes<=beforeBytes,'precache lightmap bytes nonincreasing');
});
test('PNG lossless repacker fails closed for corrupt data',()=>{
  assert.throws(()=>optimizePngLossless(Buffer.from('not a PNG')),/invalid signature/);
});
