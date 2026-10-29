import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {fixture} from './source-fixture.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {createInkSheets} from '../runtime/s3-ink-sheets.mjs';
import {ProjectileVisualRuntime} from '../runtime/projectile-visuals.mjs';
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-combat-continuation-before-20261029.json',import.meta.url)));
function original(rel,source){
  const replacements=before[rel.split('/').at(-1).replace('.mjs','')];if(!replacements)return source;
  const nodes=parse(source,{sourceType:'module',ecmaVersion:'latest'}).body.map(n=>n.declaration||n);
  for(const n of nodes.reverse())if(n.type==='FunctionDeclaration'&&replacements[n.id.name])source=source.slice(0,n.start)+replacements[n.id.name]+source.slice(n.end);
  return source;
}
const setup=(old=false)=>fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,adaptRuntime:old?original:(_r,s)=>s});
function birth(f,subId,seq=1,charge=0){const a=f.make();a.remote=true;a.nid=seq;a.netLife=0;a.owner='peer';a.weapon={...a.weapon,sub:subId};
 const e={v:1,phase:'spawn',subId,seq,life:0,sourceLife:0,x:0,y:1,z:0,vx:0,vy:0,vz:1,charge,seed:4,actor:a};assert.equal(f.installedRuntime.replaySub(e),true);return{e,a,o:f.G.projectiles._s3SubObjects.find(o=>o.owner===a)};}

test('installed sub replay admits one terminal burst, binds sub identity, and preserves first late ghostWait contact',async()=>{
 for(const old of [true,false]){
  const f=await setup(old);let fx=0;f.G.fx={explosion(){fx++;}};
  const {e,o}=birth(f,'burst');o.phase='ghostWait';
  const burst={...e,phase:'burst',burstIndex:0,x:1,y:2,z:3};
  assert.equal(f.installedRuntime.replaySub(burst),true);
  for(let i=1;i<10;i++)assert.equal(f.installedRuntime.replaySub({...burst,eventSeq:100+i}),old);
  assert.equal(fx,old?10:1);
  if(!old){const state=JSON.stringify([o.phase,o.pos.toArray()]);for(const phase of ['burst','bounce','deploy'])assert.equal(f.installedRuntime.replaySub({...burst,phase,x:20}),false);assert.equal(JSON.stringify([o.phase,o.pos.toArray()]),state);}
  const beacon=birth(f,'beakon',2),prior=JSON.stringify([beacon.o.phase,beacon.o.pos.toArray()]);
  assert.equal(f.installedRuntime.replaySub({...beacon.e,subId:'burst',phase:'burst',burstIndex:0,x:8}),old);
  if(!old)assert.equal(JSON.stringify([beacon.o.phase,beacon.o.pos.toArray()]),prior);
  f.G.projectiles.clear();
 }
});

test('burst validation precedes state mutations and FX reentry; three Fizzy pops retain their hop sequence',async()=>{
 const f=await setup();const {e,o}=birth(f,'burst');
 let calls=0;f.G.fx={explosion(){calls++;assert.equal(f.installedRuntime.replaySub({...e,phase:'burst',burstIndex:0}),false);}};
 for(const changes of [{x:NaN},{burstIndex:1},{subId:'beakon'},{life:1}]){
  const state=JSON.stringify([o.phase,o.pos.toArray(),o.burstReplayed]);assert.equal(f.installedRuntime.replaySub({...e,phase:'burst',burstIndex:0,...changes}),false);assert.equal(JSON.stringify([o.phase,o.pos.toArray(),o.burstReplayed]),state);
 }
 assert.equal(f.installedRuntime.replaySub({...e,phase:'burst',burstIndex:0}),true);assert.equal(calls,1);
 f.G.fx={explosion(){calls++;}};
 for(const charge of [0,1,2]){
  const fizzy=birth(f,'fizzy',10+charge,charge),n=fizzy.o.popLimit,initial=calls;
  for(let i=0;i<n;i++){
   const burst={...fizzy.e,phase:'burst',burstIndex:i};assert.equal(f.installedRuntime.replaySub(burst),true);assert.equal(f.installedRuntime.replaySub(burst),false);
   if(i<n-1){const pops=n-i-1;assert.equal(f.installedRuntime.replaySub({...fizzy.e,phase:'fizzyHop',pops,fuse:(fizzy.o.spec.burstWaitFrames[n-pops]||1)/60}),true);}
  }
  assert.equal(calls-initial,n);assert.equal(f.installedRuntime.replaySub({...fizzy.e,phase:'burst',burstIndex:n}),false);
 }
 f.G.projectiles.clear();
});

test('Explosher pooled seed changes retain all Float32 outputs while reusing 28 private coefficient rows',async()=>{
 const runs=[];
 for(const old of [true,false]){
  const f=await setup(old),ps=f.G.projectiles,a=f.make('s3-slosher-washtub');a.form='kid';a.intent.fire=true;f.tick(a,3);a.intent.fire=false;
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  for(let i=0;i<90&&!ps.list.some(p=>p.delay<=0);i++){ps.update(1/60);f.tick(a);}
  const p=ps.list.find(p=>p.delay<=0);assert(p);ps.list=[p];
  const rows=[],records=new Set(),coefficients=new Set(),retained=[];
  for(const hz of [30,60,120])for(const seed of [0,.1,.9,.1,-0,NaN,Infinity,-Infinity,1e9])for(let frame=0;frame<5;frame++){
   p.seed=seed;p.age=frame/hz;ps._draw();const r=ps._s3Shapes,c=r.sparkleCoefficients.get(p),n=ps.s3ShapeCounts.sparkles;
   records.add(c);for(const row of c.rows)coefficients.add(row);
   rows.push([Array.from(r.sparkPos.array.subarray(0,n*3)),Array.from(r.sparkSize.array.subarray(0,n)),{...ps.s3ShapeCounts}]);
   retained.push(ps.s3ShapeCounts);
  }
  assert.equal(new Set(retained).size,retained.length,'public shape count records stay independent');
  if(!old){assert.equal(records.size,1);assert.equal(coefficients.size,28);}else assert.ok(coefficients.size>28);
  runs.push(rows);ps.clear();
 }
 assert.deepEqual(runs[1],runs[0]);
});

test('InkSheets optional internal result keeps default public records independent and exact geometry',()=>{
 const a=createInkSheets(THREE,new THREE.Scene(),{}),b=createInkSheets(THREE,new THREE.Scene(),{}),out={};
 const v=new THREE.Vector3(1,2,3),dir=new THREE.Vector3(0,0,1),color=new THREE.Color(.2,.4,.6);
 for(const hz of [30,60,120])for(let i=0;i<hz;i++){
  const t=i/hz;if(i%7===0)for(const s of [a,b])s.add('slash-h',v,dir,color,.5,t);
  if(i%11===0)for(const s of [a,b])s.drill(v,dir,color,.4,t,1.2);
  const original=a.draw(t),next=b.draw(t,null,out);assert.equal(next,out);assert.deepEqual(next,original);
  for(const name of ['mesh','drillMesh']){assert.equal(a[name].count,b[name].count);assert.deepEqual(a[name].instanceMatrix.array,b[name].instanceMatrix.array);}
 }
 const x=a.draw(99),y=a.draw(100);assert.notEqual(x,y);assert.deepEqual(x,{sheets:0,drills:0});a.dispose();b.dispose();
});

test('nonroller and one-record frames skip impossible pair scans while preserving draw reset',()=>{
 const r=new ProjectileVisualRuntime({list:[{}],scene:new THREE.Scene(),inkFlight:{time:0}},THREE);let calls=0;
 r.ensureBirth=()=>{};r.handles=()=>true;r._rollerLinks=()=>{calls++;};
 for(const count of [0,1,2,0,1,8]){r._drawRound=()=>{r.renderRecordCount=count;};const prior=calls;r.draw();assert.equal(calls-prior,count>=2?1:0);assert.equal(r.stats.linkedRollerPairs,0);assert.equal(r.mesh.visible,false);}
 r.dispose();
});
