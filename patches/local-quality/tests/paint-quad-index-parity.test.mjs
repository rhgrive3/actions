import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../../../inkwave-public/src/world/paint.js',import.meta.url),'utf8');
const max=Number(source.match(/^const MAX_QUADS = (\d+);$/m)?.[1]);
const start=source.indexOf('    // Build the same fixed index buffer without allocating');
const end=source.indexOf('    const mk = (arr, n) =>',start);
assert.ok(start>0&&end>start,'production _initGPU quad-index loop must be present');
const code=source.slice(start,end);
const indexFromProduction=count=>{
 const idx=new Uint32Array(count*6);
 vm.runInNewContext('const MAX_QUADS='+count+';\n'+code,{idx});
 return idx;
};
const original=count=>{
 const idx=new Uint32Array(count*6);
 for(let i=0;i<count;i++)idx.set([i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3],i*6);
 return idx;
};
test('production paint buffer keeps all 36,000 Uint32 triangle indices identical',()=>{
 assert.equal(max,6000);
 assert.ok(!code.includes('idx.set('),'never create short-lived quad array in production');
 assert.deepEqual(indexFromProduction(max),original(max));
 assert.equal(indexFromProduction(max).byteLength,144000);
});
test('index generation preserves all boundaries and winding of the two triangles',()=>{
 for(const n of [0,1,2,5999,6000]){
  const got=indexFromProduction(n);assert.deepEqual(got,original(n));
  if(n)assert.deepEqual(Array.from(got.slice((n-1)*6)),[(n-1)*4,(n-1)*4+1,(n-1)*4+2,(n-1)*4,(n-1)*4+2,(n-1)*4+3]);
 }
});
test('three.js buffer ownership still uses the same Uint32 index source',()=>{
 assert.match(source,/const idx = new Uint32Array\(MAX_QUADS \* 6\)/);
 assert.match(source,/g\.setIndex\(new THREE\.BufferAttribute\(idx, 1\)\)/);
});
