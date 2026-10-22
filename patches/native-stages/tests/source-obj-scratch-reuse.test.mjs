import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

if (!vm.SourceTextModule) {
 test('OBJ scratch reuse isolated VM',()=>{
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  execFileSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{env,stdio:'pipe'});
 });
} else {
 const old=fs.readFileSync(new URL('fixtures/source-convert-870872c8.mjs.txt',import.meta.url));
 const blob=crypto.createHash('sha1').update('blob '+old.length+'\0').update(old).digest('hex');
 assert.equal(blob,'e89d4b15e4551d13357bfc1692ff9494cad092f8');
 const candidate=fs.readFileSync(new URL('../runtime/source-convert.mjs',import.meta.url),'utf8');
 async function load(source){
  const counts={initial4096:0,bytes:0};
  const tracked=Type=>new Proxy(Type,{construct(target,args){
   if(typeof args[0]==='number'){counts.bytes+=args[0]*Type.BYTES_PER_ELEMENT;if(args[0]===4096)counts.initial4096++;}
   return Reflect.construct(target,args,target);
  }});
  const context=vm.createContext({Float32Array:tracked(Float32Array),Uint32Array:tracked(Uint32Array)});
  const m=new vm.SourceTextModule(source+'\nexport {BufferBuilder as TestBuilder};',{context});
  await m.link(spec=>{
   const values=spec==='./source-catalog.mjs'?{SOURCE_COMMIT:'pinned',SOURCE_RECIPE:'v4'}:
    spec==='./source-placement.mjs'?{applySourcePlacements(){throw Error('placement not requested');}}:null;
   assert(values,spec);
   return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});
  });await m.evaluate();return {api:m.namespace,counts};
 }
 function obj(groups,vertices=3,mixedUV=false){
  let out='',vo=0,uvo=0;
  for(let j=0;j<groups;j++){
   const uv=!mixedUV||j%2===0;
   out+=`o Fld_Part${j}\nusemtl Plain\n`;
   for(let i=0;i<vertices;i++){const t=i%3;out+=`v ${j*2+(t===1?1:0)} 0 ${t===2?1:0}\n`;}
   for(let i=0;i<vertices;i++)out+='vn 0 1 0\n';
   if(uv)for(let i=0;i<vertices;i++)out+=`vt ${i%2} ${(i>>1)%2}\n`;
   for(let i=0;i+2<vertices;i+=3){const p=[0,1,2].map(k=>`${vo+i+k+1}/${uv?uvo+i+k+1:''}/${vo+i+k+1}`);out+='f '+p.join(' ')+'\n';}
   vo+=vertices;if(uv)uvo+=vertices;
  }return out;
 }
 function same(a,b){
  assert.deepEqual(JSON.parse(JSON.stringify(b.objects)),JSON.parse(JSON.stringify(a.objects)));
  for(const k of ['vertices','indices'])assert.deepEqual(Buffer.from(b[k].buffer,b[k].byteOffset,b[k].byteLength),Buffer.from(a[k].buffer,a[k].byteOffset,a[k].byteLength),k);
 }
 for(const [name,groups,vertices,mixed]of [['many small',100,3,false],['mixed UV',20,9,true],['large then reset',3,6000,false]])test('OBJ exact ownership/order: '+name,async()=>{
  const a=await load(old.toString()),b=await load(candidate),text=obj(groups,vertices,mixed);
  same(a.api.parseSourceOBJ(text),b.api.parseSourceOBJ(text));
  assert.ok(b.counts.initial4096<a.counts.initial4096);
 });
 test('100 small parts allocate four initial builder buffers, not 404',async()=>{
  const a=await load(old.toString()),b=await load(candidate),text=obj(100);
  a.api.parseSourceOBJ(text);b.api.parseSourceOBJ(text);
  assert.equal(a.counts.initial4096,404);assert.equal(b.counts.initial4096,4);
  console.log('OBJ_SCRATCH_RECEIPT',JSON.stringify({baseline:a.counts,candidate:b.counts,scope:'synthetic constructor payload counts, not process RSS or device FPS'}));
 });
 test('full conversion preserves collision BVH masks faces and material references',async()=>{
  const a=await load(old.toString()),b=await load(candidate);
  const stage={id:'scratch-parity',bounds:{minX:-2,maxX:20,minZ:-2,maxZ:3},spawnPads:[[0,0,0],[1,0,0]],spawnBarrier:0};
  const args=[stage,obj(5,6,true),'newmtl Plain\nKd 1 1 1\n',{}];
  const x=a.api.convertSource(...args),y=b.api.convertSource(...args);
  for(const k of Object.keys(x)){
   if(ArrayBuffer.isView(x[k]))assert.deepEqual(Buffer.from(y[k].buffer,y[k].byteOffset,y[k].byteLength),Buffer.from(x[k].buffer,x[k].byteOffset,x[k].byteLength),k);
   else assert.deepEqual(JSON.parse(JSON.stringify(y[k])),JSON.parse(JSON.stringify(x[k])),k);
  }
 });
 test('oversized builder capacity is retired, small scratch retains ownership without clearing data',async()=>{
  const b=await load(candidate),builder=new b.api.TestBuilder(Float32Array);
  const initial=builder.array;builder.push(1,2,3);const owned=builder.finish();builder.reset();
  assert.equal(builder.length,0);assert.equal(builder.array,initial);builder.push(8,9,10);assert.deepEqual(Array.from(owned),[1,2,3]);
  for(let i=0;i<20000;i++)builder.push(i);
  assert.ok(builder.array.length>16384);builder.reset();assert.equal(builder.array.length,4096);assert.equal(builder.length,0);
 });
 test('empty and malformed objects preserve original rejection',async()=>{
  const a=await load(old.toString()),b=await load(candidate);
  for(const text of ['', 'o Empty\n',obj(2).replace('f 4/4/4','f 999/4/4'),obj(1).replace('vn 0 1 0\n','')]){
   let x,y;try{a.api.parseSourceOBJ(text);}catch(e){x=e.message;}try{b.api.parseSourceOBJ(text);}catch(e){y=e.message;}
   assert.equal(y,x);
  }
 });
}
