import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const BASE='87fca6d7a15678e5e323fa2c8af2ec0af6d7494d';
const files=['head87-scoring.mjs','two-pass-scoring.mjs'];
const old=process.env.INKWAVE_PREFIX_BASE_SOURCE
 ? fs.readFileSync(process.env.INKWAVE_PREFIX_BASE_SOURCE,'utf8')
 : execFileSync('git',['show',BASE+':patches/splatoon3/runtime/scoring.mjs'],{cwd:ROOT,encoding:'utf8',maxBuffer:1024*1024});
const current=fs.readFileSync(new URL('../../patches/splatoon3/runtime/scoring.mjs',import.meta.url),'utf8');
const sources=[old,current],hashes=['1796177c81f6cdf69ad5e120d3173ec9df3d9ba5b3762cc965b07fb88c381003','cc4c5c207eeea5e9e7c0313d122952e0cd511e898dbec716bac584d14f5d7e9d'];
for(let i=0;i<2;i++)assert.equal(createHash('sha256').update(sources[i]).digest('hex'),hashes[i],'immutable review input '+files[i]);
const apis=await Promise.all(sources.map(s=>import('data:text/javascript;base64,'+Buffer.from(s+'\nexport {coverageReplay};\n').toString('base64'))));
function make(api,n,offset=0,eligible=null){class Paint{}api.installScoring({PaintSystem:Paint}); const p=Object.assign(new Paint(),{grid:new Uint8Array(new ArrayBuffer(n+offset),offset,n),dead:new Uint8Array(n),version:0,paintFaces:[{turf:true,grid:0,nu:n,nv:1,cu:.17,cv:.13,n:{y:.8}}]}); if(eligible){p.dead.fill(1);for(const k of eligible)p.dead[k]=0;}for(let k=0;k<n;k++)p.grid[k]=(k*19)%256;return p;}
function signature(p){const r=p._s3CoverageIndex.replay;return r&&{length:r.length,groups:[...r.groups],starts:[...r.starts],prefix0:[...r.prefix0],prefix1:[...r.prefix1],ownership:[...r.ownership],t0:r.t0,t1:r.t1};}
test('independent empty eligibility, every byte mask, 255/256/257 and 511/512/513 group checkpoint boundaries',()=>{
 for(const groups of [0,1,2,255,256,257,511,512,513])for(const mode of ['dense','first','last','mixed','none'])for(const off of [0,4]){
  const n=Math.max(4,groups*4), eligible=[];
  for(let w=0;w<groups;w++)for(let b=0;b<4;b++)if(mode==='dense'||mode==='first'&&b===0||mode==='last'&&b===3||mode==='mixed'&&((w%15+1)&1<<b))eligible.push(w*4+b);
  const ps=apis.map(a=>make(a,n,off,eligible)); const outputs=ps.map(p=>p.coverage());assert.deepEqual(outputs[1],outputs[0]);assert.deepEqual(signature(ps[1]),signature(ps[0]));
  for(const k of [0,3,4,1023,1024,1027,n-1].filter(k=>k<n)){for(let j=0;j<2;j++){ps[j].grid[k]=(ps[j].grid[k]+1)%3;apis[j].notePaintMutation(ps[j],true);}assert.deepEqual(ps[1].coverage(),ps[0].coverage());assert.deepEqual(signature(ps[1]),signature(ps[0]));}
 }
});
test('full fallback stays exact for descending/duplicate/outside/truncated eligible lists',()=>{
 for(const cells of [[4,3],[0,0],[-1,0],[0,8],[0,7]])for(const api of apis){const length=cells.at(-1)===7?7:8;const idx={cells:Int32Array.from(cells)};assert.equal(api.coverageReplay(idx,new Uint8Array(length)),null);assert.equal(idx.replay,null);}
});
test('group encoding upper bound and signed starts arithmetic proof without allocating gigabytes',()=>{
 const maxLength=0x40000000,maxWord=(maxLength>>>2)-1;assert.equal(maxWord*16+15,0xffffffff);assert.equal(Uint32Array.of(maxWord*16+15)[0]>>>4,maxWord);assert.equal(Int32Array.of(maxLength-1)[0],maxLength-1);assert.equal(maxLength>>>2,0x10000000);
});
test('typed allocation failure cannot publish partial replay and retry succeeds at every buffer site',()=>{
 for(let variant=0;variant<2;variant++)for(const [kind,ordinal] of [['Uint32Array',1],['Uint32Array',2],['Int32Array',1],['Float64Array',1],['Float64Array',2]]){
  const source=sources[variant].replace(/export /g,'')+'\nglobalThis.probeReplay=coverageReplay;';
  const context=vm.createContext({});vm.runInContext(source,context);
  vm.runInContext('globalThis.idx={cells:Int32Array.from([0,1,4,7,8])};globalThis.grid=new Uint8Array(12);',context);
  vm.runInContext(`globalThis.Original=${kind};globalThis.count=0;globalThis.sentinel=new Error('allocation-fault');globalThis['${kind}']=new Proxy(Original,{construct(target,args,newTarget){if(++count===${ordinal})throw sentinel;return Reflect.construct(target,args,target);}});`,context);
  assert.throws(()=>vm.runInContext('probeReplay(idx,grid)',context),e=>e===context.sentinel,`${files[variant]} ${kind}/${ordinal}`);assert.equal(context.idx.replay,undefined);
  vm.runInContext(`globalThis['${kind}']=Original;probeReplay(idx,grid)`,context);assert.equal(context.idx.replay.groups.length,3);
 }
});
console.log(JSON.stringify(Object.fromEntries(files.map((p,i)=>[p,createHash('sha256').update(sources[i]).digest('hex')]))));
