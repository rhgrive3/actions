import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../network-replication/tests/robustness-fixture.mjs';
import {tickTripleSlamFists,tripleSlamFistCenters} from '../runtime/triple-slam-fists.mjs';

async function client(id, wallHeight=5) {
 const f=await fixture(),V=(...a)=>new f.THREE.Vector3(...a),axes=[V(1,0,0),V(0,1,0),V(0,0,1)];
 const nm=f.makeNetMatch(f.makeSession(id,'a',[['a','A'],['b','B']]),{id:'fist-wall'});
 const actors=['a','b'].map((owner,nid)=>f.makeActor({nid,owner,remote:owner!==id,team:nid,roller:false}));
 f.G.match=f.bind(nm,actors);f.G.time=10;
 const floor={id:0,block:0,paintable:true,turf:true,wall:false,origin:V(-20,0,-12),u:V(1,0,0),v:V(0,0,1),n:V(0,1,0),su:40,sv:32};
 const back={id:1,block:1,paintable:true,turf:false,wall:true,origin:V(6.2,0,-10),u:V(0,0,1),v:V(0,1,0),n:V(1,0,0),su:30,sv:wallHeight};
 const blocks=[{id:0,solid:true,grate:false,center:V(0,-.05,4),half:V(20,.05,16),axes,aabbMin:V(-20,-.1,-12),aabbMax:V(20,0,20),faces:[-1,-1,0,-1,-1,-1]},
 {id:1,solid:true,grate:false,center:V(6.1,wallHeight/2,5),half:V(.1,wallHeight/2,15),axes,aabbMin:V(6,0,-10),aabbMax:V(6.2,wallHeight,20),faces:[1,-1,-1,-1,-1,-1]}];
 const level={faces:[floor,back],blocks,pointInside:()=>false,queryBlocks:()=>[0,1],groundHeight:()=>0};
 f.G.level=level;f.G.physics=new f.Physics(level);
 class CPU extends f.PaintSystem{_initGPU(){} _pushQuad(){}}
 const paint=f.G.paint=new CPU(null,level,{atlasSize:1024,maxDensity:8,cell:.25});
 f.G.projectiles={applyHit(){}};f.G.actors=[];
 const owner=actors[0];owner.alive=true;owner.addTurfNoSpecial=()=>{};
 return {f,nm,paint,owner,V,back};
}
function fire(c,steps) {
 const origin={x:0,y:0,z:0};
 c.owner._s3TripleSlamFists={origin,centers:tripleSlamFistCenters(origin,0),remaining:.25,scale:1};
 for(const dt of steps)tickTripleSlamFists(c.owner,dt,c.f.G,c.f.THREE);
 return c.nm.out.filter(e=>e[1]==='s');
}
function replay(a,b,rows){b.nm._peer('a');for(const e of rows){const row=JSON.parse(JSON.stringify(e));row._netSeq=e._netSeq;row._netTick=e._netTick;b.nm._play('a',row);}assert.deepEqual(Array.from(a.paint.grid),Array.from(b.paint.grid));}
for(const [label,steps] of [['60 Hz',Array(15).fill(1/60)],['low FPS',Array(5).fill(1/20)]]) {
 test(`fist split centres cannot paint across thin cover at ${label}; replay agrees`,async()=>{
  const a=await client('a'),b=await client('b'),rows=fire(a,steps);
  assert.ok(rows.length>0&&rows.length<38,'blocked offsets are not emitted, but the visible footprint remains');
  assert.ok(rows.every(e=>e[2]<6),'no emitted stamp centre crosses the wall');
  const face=a.back,cells=a.paint.grid.slice(face.grid,face.grid+face.nu*face.nv);
  assert.ok(cells.every(c=>c===0),'the back-facing wall stays unpainted like the original central splat');
  assert.ok(a.paint.counts[0]>0,'admitted floor turf is retained');replay(a,b,rows);
 });
}
test('a low lip below the fist impact plane does not reject visible stamp centres',async()=>{
 const a=await client('a',.05),b=await client('b',.05),rows=fire(a,Array(15).fill(1/60));
 assert.equal(rows.length,38);replay(a,b,rows);
});
