import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';

async function bomb({old=false,oldGround=false,rate=60,wall=false,center=30,slope=0,roof=false,network=false}={}) {
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  adaptRuntime:(r,s)=>{
    if(!r.endsWith('all-specials.mjs'))return s;
    if(old)s=s.replace('const at=rt.v4.copy(point).addScaledVector(tangent,x).addScaledVector(bitangent,z);','const at = rt.v4.set(point.x+x,point.y,point.z+z);');
    if(oldGround)s=s.replace('from.y += .25;','from.y += 24;').replace('rt.down, .5, rt.hit','rt.down, 60, rt.hit');
    return s;
  }});
 const {paint,V,face,level}=makePaintWorld(f,{wall});f.G.settings={};f.setRandom(()=>.37);
 if(slope){
  const q=new f.THREE.Quaternion().setFromAxisAngle(V(1,0,0),slope*Math.PI/180),pivot=V(0,0,center);
  const move=v=>v.sub(pivot).applyQuaternion(q).add(pivot);
  for(const f0 of level.faces){move(f0.origin);for(const key of ['u','v','n'])f0[key].applyQuaternion(q);}
  for(const b of level.blocks){move(b.center);for(const a of b.axes)a.applyQuaternion(q);b.aabbMin.set(Infinity,Infinity,Infinity);b.aabbMax.set(-Infinity,-Infinity,-Infinity);
   for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1]){const v=b.center.clone().addScaledVector(b.axes[0],x*b.half.x).addScaledVector(b.axes[1],y*b.half.y).addScaledVector(b.axes[2],z*b.half.z);b.aabbMin.min(v);b.aabbMax.max(v);}
  }paint._initGrid();
 }

 if(roof){
  const id=level.blocks.length,fi=level.faces.length;
  const block={id,solid:true,grate:false,center:V(0,7.5,30),half:V(30,.5,30),axes:[V(1,0,0),V(0,1,0),V(0,0,1)],faces:[-1,-1,fi,-1,-1,-1],aabbMin:V(-30,7,0),aabbMax:V(30,8,60)};
  const roofFace={origin:V(-30,8,0),u:V(1,0,0),v:V(0,0,1),n:V(0,1,0),su:60,sv:60,turf:true,wall:false,paintable:true};
  level.blocks.push(block);level.faces.push(roofFace);paint._layout(30);paint._initGrid();
 }

 const actor=f.make();actor.pos.set(0,0,center);actor.weapon={...actor.weapon,special:'booyahBomb',specialCost:100};actor.special=100;
 let sender=null;
 if(network){
  sender=new f.NetMatch({myId:'a',isHost:true,hostId:'a',_members:new Map([['a','A'],['b','B']]),tr:{broadcast(){},sendTo(){}}},{id:'slope-wire',map:'map',difficulty:'normal'});
  actor.nid=0;actor.owner='a';actor.remote=false;sender.byNid.set(0,actor);sender._setupActor(actor);f.G.netm=sender;
 }
 actor._startSpecial();actor._updateSpecial(1/60);actor.intent.sub=true;actor._updateSpecial(1/60);
 const p=f.G.projectiles.list.at(-1);assert.equal(p.s3AllSpecial,'booyahBomb');
 f.G.projectiles._blastBurst(p,V(0,.08,center),null);f.G.projectiles.list.length=0;
 const stamps=[],native=paint.splat;paint.splat=function(at,r,team,opts){stamps.push({x:at.x,z:at.z,r,seed:opts.seed,claimMode:opts.claimMode});return native.call(this,at,r,team,opts);};
 for(let i=0;i<rate*5;i++){f.G.time+=1/rate;f.G.projectiles.update(1/rate);paint.advanceSimulation(1/rate);}
 let area=0,outside=0,max=0,holes=0,interior=0;
 for(let j=0;j<face.nv;j++)for(let i=0;i<face.nu;i++){
  const d=Math.hypot(-40+(i+.5)*face.cu,-5+(j+.5)*face.cv-center),owned=paint.grid[face.grid+j*face.nu+i];
  if(d<12){interior++;if(!owned)holes++;}
  if(owned){area+=face.cu*face.cv;max=Math.max(max,d);if(d>13.5)outside+=face.cu*face.cv;}
 }
 assert.ok(area>0);assert.equal(actor.special,0,'special paint cannot recharge its own gauge');
 const creditedArea=level.faces.filter(f=>f.turf).reduce((sum,f)=>sum+Array.from(paint.grid.slice(f.grid,f.grid+f.nu*f.nv)).filter(v=>v===1).length*f.cu*f.cv,0);
 assert.equal(actor.stats.turf,creditedArea,'real CPU claims on all floor layers determine player turf');
 let wireGrid=null;
 if(network){
  const receiverPaint=new paint.constructor(null,level,{atlasSize:4096,maxDensity:30,cell:.25});
  const receiver=new f.NetMatch({myId:'b',isHost:false,hostId:'a',_members:new Map([['a','A'],['b','B']]),tr:{broadcast(){},sendTo(){}}},{id:'slope-wire',map:'map',difficulty:'normal'});
  actor.remote=true;receiver.byNid.set(0,actor);receiver._setupActor(actor);f.G.netm=receiver;f.G.paint=receiverPaint;receiver._peer('a');
  const rows=sender.out.filter(e=>e[1]==='s');assert.ok(rows.length>20);
  for(const e of rows){const row=JSON.parse(JSON.stringify(e));row._netSeq=e._netSeq;row._netTick=e._netTick;receiver._play('a',row);}
  for(let i=0;i<240;i++)receiverPaint.advanceSimulation(1/60);
  wireGrid=Array.from(receiverPaint.grid);
 }
 return {wireGrid,grid:Array.from(paint.grid),area,outside,max,holes,interior,stamps,roofCells:roof?Array.from(paint.grid.slice(level.faces.at(-1).grid)).filter(Boolean).length:0,wallCells:wall?Array.from(paint.grid.slice(level.faces[1].grid)).filter(Boolean).length:0};
}


test('large special disk follows a nearby slope without central holes or projection-area inflation',async()=>{
 const flat=await bomb();assert.ok(flat.outside/flat.area<.06,'edge tiles keep external area bounded');assert.ok(flat.stamps.length<=65,'bounded disk does not increase paint packets');
 for(const slope of[15,30]){
  const after=await bomb({slope});assert.equal(after.holes,0);assert.ok(Math.abs(after.area-flat.area)/flat.area<.01);assert.ok(after.outside/after.area<.06);
  if(!process.env.INKWAVE_BUILT_SITE){const before=await bomb({old:true,slope});assert.ok(before.holes>2000);assert.ok(after.area>before.area);}
 }
});
test('large special disk keeps flat terrain and remote upper storey isolated',async()=>{
 const flat=await bomb(),roof=await bomb({roof:true});assert.equal(roof.roofCells,0);assert.ok(Math.abs(roof.area-flat.area)/flat.area<.001,'adding an atlas face may change texel wobble by a few cells');assert.equal(roof.holes,0);
 if(!process.env.INKWAVE_BUILT_SITE){const before=await bomb({roof:true,oldGround:true});assert.ok(before.roofCells>9000,'broad old ground projection selected the remote upper floor (bounded envelope)');}
});
test('slope disk is deterministic at 30, 60 and 120 render Hz',async()=>{
 const expected=await bomb({slope:30});for(const rate of[30,120])assert.deepEqual((await bomb({slope:30,rate})).grid,expected.grid);
});
test('adjacent wall may receive paint without adding wall cells to floor turf',async()=>{
 const result=await bomb({wall:true,center:5});assert.ok(result.wallCells>0);assert.ok(result.area>0);
});

test('slope disk actual NetMatch JSON splats reproduce identical ownership',async()=>{
 const result=await bomb({slope:30,network:true});assert.deepEqual(result.wireGrid,result.grid);
});


test('locked Tenta Missiles preserve target height when both ground probes miss',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.raycast=(_a,_b,_distance,hit)=>{hit.hit=false;return hit;};
 f.G.level.groundHeight=()=>-Infinity;
 const actor=f.make();actor.weapon={...actor.weapon,special:'tentaMissiles',specialCost:100};
 actor.special=100;actor.alive=true;actor.remote=false;actor.pos.set(0,0,0);actor.aimDir.set(0,0,1);actor._resolve=()=>{};
 const locked=f.make();locked.team=1;locked.pos.set(0,1.05,28);f.G.actors=[actor,locked];
 actor._startSpecial();actor.intent.fire=true;actor._updateSpecial(1/60);actor.intent.fire=false;
 for(let i=0;i<40&&actor.specialActive;i++)actor._updateSpecial(1/60);
 const missiles=f.G.projectiles.list.filter(p=>p.s3AllSpecial==='tentaMissiles');assert.equal(missiles.length,10);
 for(const p of missiles){assert.equal(p.s3TentaTarget.y,1.05,'ray probe offset must not mutate the locked target');assert.equal(p.s3TentaTarget.z,28);}
});
