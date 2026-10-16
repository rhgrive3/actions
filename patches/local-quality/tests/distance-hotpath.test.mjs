import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {BUILD_ONLY_PATCH_MODULES} from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import {adaptDistanceHotpath} from '../distance-hotpath-adapter.mjs';
import {replaceOnce} from '../adapter.mjs';
import {convertSource} from '../../native-stages/runtime/source-convert.mjs';
import {distanceFixture,baselineDistanceSource,makePaint,randomStream,countHypot} from './distance-fixture.mjs';
const read=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
const apis=Promise.all([distanceFixture(true),distanceFixture()]);
test('guarded source transformers compose and never ship as runtime dependencies',()=>{
 assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/distance-hotpath-adapter.mjs'));
 for(const rel of ['src/world/paint.js']){
  const raw=read(rel),before=baselineDistanceSource(rel,raw),after=adaptBuildSource(rel,raw);
  assert.notEqual(after,before);assert.doesNotThrow(()=>new vm.SourceTextModule(after));
  assert.throws(()=>adaptDistanceHotpath(rel,after,replaceOnce),/conflict/);
  assert.throws(()=>adaptDistanceHotpath(rel,'',replaceOnce),/conflict/);
 }
 assert.equal(adaptDistanceHotpath('src/main.js','untouched',replaceOnce),'untouched');
});
const bytes=x=>Buffer.from(x.buffer,x.byteOffset,x.byteLength);
const nativeData=()=>convertSource({id:'distance-probe',bounds:{minX:-24,maxX:24,minZ:-24,maxZ:24},spawnPads:[[1,0,1],[20,0,20]],spawnBarrier:0},
 'o Fld_floor\nusemtl Concrete00\nv 0 0 0\nv 24 0 0\nv 0 0 24\nv 24 0 24\nv 0 0 0\nv 0 8 0\nv 24 0 0\nv 0 0 0\nv 8 2 0\nv 0 0 8\nvn 0 1 0\nvn 0 1 0\nvn 0 1 0\nvn 0 1 0\nvn 0 0 1\nvn 0 0 1\nvn 0 0 1\nvn -.25 1 0\nvn -.25 1 0\nvn -.25 1 0\nf 1//1 3//3 2//2\nf 2//2 3//3 4//4\nf 5//5 7//7 6//6\nf 8//8 10//10 9//9\n',
 'newmtl Concrete00\nKd 1 1 1\n',{});
test('6000 overlapping splats: exact ownership, area, order acceptance, counts, dirty cells and versions on real block/native faces',async()=>{
 const api=await apis,totals=[0,0];let changed=0,checked=0;
 for(const native of [false,true]){
  const data=native?nativeData():null,paints=api.map(a=>makePaint(a,data)),counters=api.map(countHypot),marks=[[],[]];
  paints.forEach((p,k)=>{p._inkMark=(f,i,j)=>marks[k].push([f.id,i,j]);});
  const faces=paints.map(p=>p.level.faces.filter(f=>f.atlas&&f.nu>0&&f.nv>0));assert.ok(faces[0].length>=2);
  const rand=randomStream(721+Number(native));
  try{for(let i=0;i<3000;i++){
   const index=i%faces[0].length,face=faces[0][index],ang=rand()*Math.PI*2;
   const args=[(rand()*1.4-.2)*face.su,(rand()*1.4-.2)*face.sv,i%37===0?.02:.025+rand()*3,i%2,rand(),Math.cos(ang),Math.sin(ang),i%4?rand()*1.4:0,i%10];
   const order=i%7===0?Math.max(1,i-20):i+1,states=[{},{}];marks.forEach(m=>{m.length=0;});
   const results=paints.map((p,k)=>p._cpuSplat(faces[k][index],...args,order,states[k]));
   assert.equal(results[1],results[0],`claimed ${native} ${i}`);if(results[0]>0)changed++;
   assert.equal(states[1].accepted,states[0].accepted,'order acceptance');assert.equal(paints[1].version,paints[0].version);
   assert.deepEqual(Array.from(paints[1].counts),Array.from(paints[0].counts));assert.deepEqual(marks[1],marks[0],'dirty notification order');
   if(i%100===0){assert.equal(Buffer.compare(bytes(paints[1].grid),bytes(paints[0].grid)),0);checked++;}
  }
  assert.equal(Buffer.compare(bytes(paints[1].grid),bytes(paints[0].grid)),0);
  totals.forEach((_,k)=>totals[k]+=counters[k].get());
  }finally{counters.forEach(c=>c.restore());}
 }
 assert.ok(changed>100,'nonempty, changing turf');assert.ok(totals[1]<totals[0]*.85,'substantially fewer hypot calls');
 console.log(JSON.stringify({scope:'real source-composed CPU paint; not hardware FPS',splats:6000,gridComparisons:checked+2,changed,hypotBefore:totals[0],hypotAfter:totals[1],reduction:1-totals[1]/totals[0]}));
});
const adjacent=(v,step)=>{const b=new ArrayBuffer(8),d=new DataView(b);d.setFloat64(0,v);d.setBigUint64(0,d.getBigUint64(0)+BigInt(step));return d.getFloat64(0);};
test('circle/wobble boundaries retain original hypot; extreme radii and nonfinite intermediates preserve results',async()=>{
 const api=await apis,paints=api.map(a=>makePaint(a)),rand=randomStream(51);let cases=0;
 for(const r of [.019,.02,.02000000001,.5,1,13,1e154,1e308,Infinity,NaN])for(const kind of [0,6,8,9])for(const factor of [.68,1,1.5])for(const ulps of [-8,-1,0,1,8]){
  const radius=adjacent(r*factor,ulps),angle=rand()*Math.PI*2,px=Math.cos(angle)*radius,py=Math.sin(angle)*radius;
  const results=paints.map(p=>{const owner=Object.create(p);owner.grid=new Uint8Array(1);owner.dead=new Uint8Array(1);owner.counts=[0,0];owner.version=0;owner.level={native:false};owner._paintCurrentOrder=0;
   const f={grid:0,nu:1,nv:1,cu:1,cv:1,turf:true},area=owner._cpuSplat(f,.5-px,.5-py,r,0,.3,1,0,0,kind);return {area,grid:Array.from(owner.grid),counts:owner.counts,version:owner.version};});
  assert.deepEqual(results[1],results[0],`${r} ${kind} ${factor} ${ulps}`);cases++;
 }
 for(const [sdu,sdv,sa,seed]of [[NaN,1,1,.2],[Infinity,1,1,.2],[1,0,Infinity,.2],[1,0,1,NaN]]){
  const out=paints.map(p=>{const f=p.level.faces.find(f=>f.turf);p.grid.fill(0);p.counts=[0,0];p.version=0;const area=p._cpuSplat(f,2,2,.3,0,seed,sdu,sdv,sa,0);return {area,grid:Array.from(p.grid),counts:Array.from(p.counts),version:p.version};});assert.deepEqual(out[1],out[0]);cases++;
 }
 console.log(JSON.stringify({boundaryAndExtremeCases:cases}));
 const counter=countHypot(api[1]);
 try{for(const [px,expected]of [[.2,0],[1,1],[adjacent(1,-1),1],[adjacent(1,1),1]]){
  const p=paints[1],owner=Object.create(p);owner.grid=new Uint8Array(1);owner.dead=new Uint8Array(1);owner.counts=[0,0];owner.level={native:false};owner._paintCurrentOrder=0;
  counter.reset();owner._cpuSplat({grid:0,nu:1,nv:1,cu:1,cv:1,turf:true},.5-px,.5,1,0,.3,1,0,0,8);assert.equal(counter.get(),expected,'hypot at source circle x='+px);
 }}finally{counter.restore();}
});
