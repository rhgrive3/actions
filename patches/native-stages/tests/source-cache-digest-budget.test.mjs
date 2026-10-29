import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const keys=['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'];
const source=fs.readFileSync(new URL('../runtime/source-cache.mjs',import.meta.url),'utf8')+'\nexport {seal};';
async function module(){
 const calls=[],pending=new Set();let peakBytes=0,maxJobs=0;
 const context=vm.createContext({TextEncoder,Uint32Array,crypto:{subtle:{digest:async(algorithm,value)=>{
  const call={bytes:value.byteLength};calls.push(call);pending.add(call);
  peakBytes=Math.max(peakBytes,[...pending].reduce((n,c)=>n+c.bytes,0));maxJobs=Math.max(maxJobs,pending.size);
  try{return await crypto.webcrypto.subtle.digest(algorithm,value);}finally{pending.delete(call);}
 }}}});
 const m=new vm.SourceTextModule(source,{context});await m.link(()=>{throw Error('unexpected import')});await m.evaluate();return {seal:m.namespace.seal,stats:()=>({peakBytes,maxJobs,calls})};
}
test('derived authentication retains exact byte order and bounds outstanding native inputs',async()=>{
 const bytes=[12,3,9,2,1,1,1,1,1,10].map(m=>m*1024*1024),data={manifest:{id:'fixture',quality:'unchanged'}};
 for(let i=0;i<keys.length;i++){const padded=new Uint8Array(bytes[i]+8).fill(i+1);data[keys[i]]=padded.subarray(3,-5);}
 const f=await module(),seal=await f.seal(data),expected=[];
 for(const key of keys)expected.push(crypto.createHash('sha256').update(data[key]).digest('hex'));
 expected.push(crypto.createHash('sha256').update(JSON.stringify(data.manifest)).digest('hex'));
 assert.equal(seal,expected.join('/'));assert.ok(f.stats().maxJobs<=2);assert.ok(f.stats().peakBytes<=Math.max(...bytes));
 assert.deepEqual(f.stats().calls.slice(0,10).map(c=>c.bytes),bytes);
});
test('packed face byte and range authentication stays distinct under bounded scheduling',async()=>{
 const data={...Object.fromEntries(keys.map((k,i)=>[k,new Uint8Array([i])])),faceTriangles:new Uint32Array([3,8,12]),manifest:{}};
 data.manifest.faces=[{triangles:data.faceTriangles.subarray(1,3)}];
 const f=await module(),initial=await f.seal(data);data.faceTriangles[2]++;assert.notEqual(await f.seal(data),initial);
 data.faceTriangles[2]--;data.manifest.faces[0].triangles=data.faceTriangles.subarray(0,2);assert.notEqual(await f.seal(data),initial);
});
