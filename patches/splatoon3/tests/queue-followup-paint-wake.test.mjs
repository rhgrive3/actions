import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptSource} from '../adapter.mjs';
import {installMinimapDirty,_emptyInkDirty} from '../runtime/minimap-dirty.mjs';
import {installScoring,floorCoverage,notePaintMutation} from '../runtime/scoring.mjs';
import {SpecialVfxKit} from '../runtime/special-vfx-kit.mjs';
import {fixture} from './source-fixture.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
// The archived reference intentionally has no upload cache or pooled points.
// Apply its gameplay visibility rule, but keep the independent unconditional
// uploader intact. Current production adapters require the current raw source.
function wakeClass(raw,G,reference=false){const source=(reference?adaptSource:adaptBuildSource)('src/fx/swimWake.js',raw).replace(/^import .*;\n/gm,'').replace('export class','class');return new Function('THREE','G','clamp','damp','swimTrailVisible',source+';return SwimWake;')(T,G,(x,a,b)=>Math.max(a,Math.min(b,x)),(x,y,k,dt)=>T.MathUtils.damp(x,y,k,dt),a=>!a.sneaking);}
function uniforms(){return Object.fromEntries([['uWake',48],['uWakeB',4],['uSwimH',4],['uSwimF',4]].map(([k,n])=>[k,{value:Array.from({length:n},()=>new T.Vector4(17,19,23,29))} ]));}
function snapshot(u){return Object.fromEntries(Object.entries(u).map(([k,v])=>[k,v.value.map(x=>x.toArray())]));}
for(const hz of [30,60,120])test('composed SwimWake exact uniform parity through idle/live/teleport/fade/reset/rebind '+hz+'Hz',()=>{
 const G={time:0,match:{state:'playing',actors:[]}},raw=fs.readFileSync(new URL('../../../inkwave-public/src/fx/swimWake.js',import.meta.url),'utf8'),old=fs.readFileSync(new URL('./fixtures/swim-wake-before-queue.txt',import.meta.url),'utf8');
 const a=new (wakeClass(raw,G))(),b=new (wakeClass(old,G,true))();let ua=uniforms(),ub=uniforms(),writes=0;
 for(const u of [ua])for(const v of Object.values(u))for(const p of v.value){const set=p.set;p.set=function(...args){writes++;return set.apply(this,args);};}
 const actors=Array.from({length:5},(_,i)=>({alive:true,isLocal:i===0,pos:new T.Vector3(i*2,0,0),vel:new T.Vector3(4,0,1),anim:{form:'swim'}}));
 for(let frame=0;frame<hz*5;frame++){
  G.time=frame/hz;if(frame===3){assert.equal(writes,56,'only the first idle upload writes 48 tail + 8 bounds/head vectors');G.match.actors=actors.slice(0,1);}
  if(frame===20)G.match.actors=actors;if(frame===35)actors[0].pos.x+=10;if(frame===40)actors[1].anim.form='climb';if(frame===45)actors[2].sneaking=true;if(frame===50)actors[3].alive=false;
  if(frame===60)G.match.actors=[];if(frame===80){a.reset();b.reset();}if(frame===90){ua=uniforms();ub=uniforms();}if(frame===100){G.match.actors=actors;G.match.state='results';}
  for(const x of actors)x.pos.addScaledVector(x.vel,1/hz);
  a.update(1/hz,ua,new T.Vector3());b.update(1/hz,ub,new T.Vector3());assert.deepEqual(snapshot(ua),snapshot(ub),'frame '+frame);
 }
});
test('actual composed body batches affine row bounds but preserves dirty gen, cells, dead masks and score',async()=>{
 const f=await fixture({productionComposition:true});class MapStub{tickHidden(){}}installMinimapDirty({PaintSystem:f.PaintSystem,Minimap:MapStub});
 for(const angle of [0,.3,1.6,3.6])for(const kind of [0,6,10,14]){
  const face={grid:0,nu:64,nv:48,cu:.13,cv:.17,turf:true,wall:false,n:new f.THREE.Vector3(0,1,0),origin:new f.THREE.Vector3(7,2,-4),u:new f.THREE.Vector3(Math.cos(angle),0,Math.sin(angle)),v:new f.THREE.Vector3(-Math.sin(angle),0,Math.cos(angle))};
  const p=Object.create(f.PaintSystem.prototype);Object.assign(p,{grid:new Uint8Array(3072),dead:new Uint8Array(3072),counts:[0,0],version:0,level:{native:true},paintFaces:[face]});
  for(let i=0;i<p.dead.length;i++)if(i%13===0)p.dead[i]=1;
  let calls=0;const mark=p._inkMark;p._inkMark=function(...args){calls++;return mark.apply(this,args);};
  p._cpuSplat(face,3.2,3.1,1.9,0,.37,Math.cos(.7),Math.sin(.7),.6,kind);
  const actual=plain(p.inkDirty),wanted={inkDirty:_emptyInkDirty(),dead:p.dead};let changed=0;
  for(let j=0;j<face.nv;j++)for(let i=0;i<face.nu;i++)if(p.grid[j*face.nu+i]){changed++;mark.call(wanted,face,i,j);}
  assert.deepEqual(actual,plain(wanted.inkDirty));assert.equal(p.inkDirty.gen,changed);assert.ok(calls<=face.nv*2);assert.ok(calls<changed);assert.equal(p.counts[0],changed);
 }
});
test('coverage ignores known wall writes and preserves weighted scan order, while unknown writes and identity changes invalidate',()=>{
 class Paint{}installScoring({PaintSystem:Paint});const p=new Paint();Object.assign(p,{grid:new Uint8Array([1,2,0,1]),dead:new Uint8Array(4),version:0,paintFaces:[{grid:0,nu:3,nv:1,cu:.1,cv:.3,n:{y:.8},turf:true},{grid:3,nu:1,nv:1,turf:false}]});
 assert.deepEqual(p.coverage(),floorCoverage(p));const cache=p._s3Coverage;
 for(let i=0;i<100;i++){p.grid[3]=i%3;notePaintMutation(p,false);assert.deepEqual(p.coverage(),floorCoverage(p));assert.equal(p._s3Coverage,cache);}
 p.grid[0]=2;notePaintMutation(p,true);assert.deepEqual(p.coverage(),floorCoverage(p));assert.notEqual(p._s3Coverage,cache);
 const turf=p._s3Coverage;p.grid[1]=1;p.version++;notePaintMutation(p,false);assert.deepEqual(p.coverage(),floorCoverage(p));assert.notEqual(p._s3Coverage,turf,'unknown writer before known wall mutation still invalidates');
 for(const key of ['grid','dead','paintFaces']){const before=p._s3Coverage;p[key]=key==='paintFaces'?[...p[key]]:p[key].slice();p.coverage();assert.notEqual(p._s3Coverage,before,key+' identity');}
 p.grid.fill(0);p.version++;assert.deepEqual(p.coverage(),[0,0],'clear fallback');
});
test('actual composed body wall writes retain the coverage cache; turf body writes replace it',async()=>{
 const f=await fixture({productionComposition:true});installScoring({PaintSystem:f.PaintSystem});
 const floor={grid:0,nu:16,nv:16,cu:.25,cv:.25,turf:true,n:{y:1}},wall={...floor,grid:256,turf:false,n:{y:0}};
 const p=Object.create(f.PaintSystem.prototype);Object.assign(p,{grid:new Uint8Array(512),dead:new Uint8Array(512),paintFaces:[floor,wall],level:{native:false},counts:[0,0],version:0});p.coverage();const cache=p._s3Coverage;
 p._cpuSplat(wall,2,2,1,0,.5,1,0,0,0);assert.ok(p.version>0);p.coverage();assert.equal(p._s3Coverage,cache);
 p._cpuSplat(floor,2,2,1,0,.5,1,0,0,0);assert.deepEqual(plain(p.coverage()),plain(floorCoverage(p)));assert.notEqual(p._s3Coverage,cache);
});
test('growth team guard follows retained, evicted, completed, reused and unexpected leases without changing eligible order',async()=>{
 const f=await fixture({productionComposition:true}),p=Object.create(f.PaintSystem.prototype);Object.assign(p,{growing:[],_splatGrowthPool:[],_splatEntryPool:[],_splatPoolStats:{}});
 const add=(team,kind=0)=>{const g={team,kind,entries:[]};p._retainSplatGrowth(g);p.growing.push(g);return g;};
 assert.equal(p._hasOpposingGrowth(0),true,'unknown counter state fails open');const same=add(0);assert.equal(p._hasOpposingGrowth(0),false);const speck=add(1,7);assert.equal(p._hasOpposingGrowth(0),false);const enemy=add(1);assert.equal(p._hasOpposingGrowth(0),true);
 p.growing.splice(p.growing.indexOf(enemy),1);p._releaseSplatGrowth(enemy);assert.equal(p._hasOpposingGrowth(0),false);enemy.team=1;enemy.kind=0;p._retainSplatGrowth(enemy);p.growing.push(enemy);assert.equal(p._hasOpposingGrowth(0),true);
 for(const g of [same,speck,enemy])p._releaseSplatGrowth(g);p.growing.length=0;assert.equal(p._growthTrackedCount,0);assert.deepEqual(plain(p._growthTeams),[0,0]);assert.equal(p._hasOpposingGrowth(0),false);
 p.growing.push({team:1});assert.equal(p._hasOpposingGrowth(0),true,'external addition fails open');
});
test('ShapePool escaped record and typed array cannot be recycled into another live lease',()=>{
 const kit=new SpecialVfxKit(T,new T.Scene(),.35);try{
  const pool=kit.beams;pool.cap=2;const old=pool.add(10,Array(16).fill(1)),escaped=old.v,next=pool.add(10,Array(16).fill(2));
  assert.notEqual(old,next);assert.notEqual(escaped,next.v);old.dead=true;escaped[0]=999;old.follow=r=>{r.v[1]=777;};old.follow(old,0);pool.update(.01);assert.equal(pool.recs[0],next);assert.equal(next.dead,false);assert.equal(next.v[0],2);assert.equal(next.v[1],2);assert.equal(pool.buf[0].array[4],2);
  // Executable negative controls implement each proposed reuse on this real
  // pool; stale handles then alter its actual uploaded attributes/liveness.
  for (const reuseRecord of [false,true]) {
    pool.clear();const normal=pool.add;
    pool.add=function(life,values,follow=null){
      if(this.recs.length < this.cap-1)return normal.call(this,life,values,follow);
      const retired=this.recs.shift(),record=reuseRecord?retired:{v:retired.v};
      Object.assign(record,{t:0,life,follow,dead:false});record.v.set(values);this.recs.push(record);return record;
    };
    const stale=pool.add(10,Array(16).fill(3)),buffer=stale.v,live=pool.add(10,Array(16).fill(4));
    buffer[0]=999;stale.dead=true;pool.update(.01);
    if(reuseRecord)assert.equal(pool.recs.length,0,'stale record kills the new lease');
    else {assert.equal(pool.recs[0],live);assert.equal(pool.buf[0].array[4],999,'escaped raw typed array corrupts a new rendered lease');}
    pool.add=normal;
  }
 }finally{kit.dispose();}
});
test('production splat opposing-growth guard preserves forced-completion order against unconditional scan',async()=>{
 const f=await fixture({productionComposition:true});f.G.netm=null;
 const make=()=>{
  const face={grid:0,nu:4,nv:4,cu:1,cv:1,su:30,sv:30,turf:true,atlas:{},wall:false,origin:new f.THREE.Vector3(-15,0,-15),n:new f.THREE.Vector3(0,1,0),u:new f.THREE.Vector3(1,0,0),v:new f.THREE.Vector3(0,0,1)};
  const events=[],p=Object.create(f.PaintSystem.prototype);Object.assign(p,{grid:new Uint8Array(16),dead:new Uint8Array(16),counts:[0,0],version:0,level:{native:false,faces:[face],blocks:[{aabbMin:{x:-20,y:-1,z:-20},aabbMax:{x:20,y:1,z:20},faces:[0,-1,-1,-1,-1,-1]}],queryBlocks:()=>[0]},growing:[],clock:0,_wetUntil:0,_splatEntryPool:[],_splatGrowthPool:[],_splatPoolStats:{entryArraysCreated:0,entryArraysReused:0,growthRecordsCreated:0,growthRecordsReused:0},_cpuSplat:()=>0,_finishSplatOwnership(){},_rippledNear:()=>true,_emitGrowth(g,tn,dT,dripOnly){events.push([g.team,g.seed,tn,dT,dripOnly]);}});return {p,events};
 };
 const a=make(),b=make();b.p._hasOpposingGrowth=()=>true;let bypass=0;const guard=a.p._hasOpposingGrowth;a.p._hasOpposingGrowth=function(team){const yes=guard.call(this,team);if(!yes)bypass++;return yes;};
 const snap=p=>p.growing.map(g=>[g.team,g.kind,g.seed,g.R,g.cx,g.cy,g.cz,g.entries.length]);
 for(let i=0;i<150;i++){
  const center=new f.THREE.Vector3(Math.sin(i*.3)*4,0,Math.cos(i*.8)*4),radius=.25+i%7*.04,team=i<60?0:i%2,opts={seed:i*.003,kind:i%9===0?'speck':'shot',cosmetic:i%9===0,instant:i%19===0};
  assert.equal(a.p.splat(center,radius,team,{...opts}),b.p.splat(center,radius,team,{...opts}));assert.deepEqual(a.events,b.events,'completion order '+i);assert.deepEqual(snap(a.p),snap(b.p),'retained sequence '+i);
 }
 assert.ok(bypass>30,'same-team/speck-only stretches skip the complete scan');
});
