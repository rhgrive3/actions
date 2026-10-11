import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {CATALOG_WALL_DROP} from '../runtime/catalog-wall-drop-data.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';

async function world(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 const {paint,level}=makePaintWorld(f,{wall:true});f.G.settings={};f.setRandom(()=>.37);
 return {f,paint,level};
}
function round(c,id,height=8,configure=()=>{}){
 const {f}=c,a=f.make(id);a.pos.set(0,height,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,height,60);a.form='kid';a.grounded=true;configure(a);
 for(let i=0;i<180&&!f.G.projectiles.list.some(p=>p.catalog);i++)a.weaponRunner.update(1/60,{fire:i<150,firePressed:i===0});
 const p=f.G.projectiles.list.find(p=>p.catalog);assert.ok(p,id+' actual main emits');
 f.G.projectiles.list.splice(0,f.G.projectiles.list.length,p);
 // Isolate main body wall contact from independently tested flight splashes.
 p.catalog.descriptor.splashCount=0;p.pos.set(0,height,7);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,100);
 return {a,p};
}
async function sample(id='s3-shooter-short',rate=60,{height=8,dead=false,ghost=false,paintable=true}={}){
 const c=await world(),{f,paint}=c,{a,p}=round(c,id,height);a.alive=!dead;p.ghost=ghost;c.level.faces[1].paintable=paintable;
 // Native atlas layout excludes unpaintable faces at level construction.
 if(!paintable)c.level.faces[1].atlas=null;
 const stamps=[],raw=paint.splat;paint.splat=function(at,r,team,opts){stamps.push({at:at.clone(),r,time:f.G.time});return raw.call(this,at,r,team,opts);};
 let seen=null,max=0;
 for(let i=0;i<rate*3;i++){f.G.time+=1/rate;f.G.projectiles.update(1/rate);paint.advanceSimulation(1/rate);const drops=f.G.projectiles._s3DetachedWallDrops||[];max=Math.max(max,drops.length);if(drops.length&&!seen)seen={...drops[0]};}
 return {...c,a,p,seen,max,stamps,grid:Array.from(paint.grid)};
}
test('23 added shooter/splatling/dualies use exact pinned complete wall-drop records',()=>{
 const expected=MAIN_WEAPON_CATALOG.records.filter(r=>!r.legacy&&['shooter','splatling','dualies'].includes(r.family));
 assert.equal(expected.length,23);assert.deepEqual(Object.keys(CATALOG_WALL_DROP).sort(),expected.map(r=>r.id).sort());
 for(const r of expected){const d=CATALOG_WALL_DROP[r.id];assert.equal(d.sourceSha256,r.sourceSha256);assert.equal(d.sourceActor,r.sourceActor);
  assert.equal(Object.keys(d.move).length,7);assert.equal(Object.keys(d.paint).length,3);
  for(const n of [...Object.values(d.move),...Object.values(d.paint)])assert.ok(Number.isFinite(n)&&n>=0);
 }
});
test('all 23 actual main rounds start one sourced wall lifecycle with no high-wall floor turf',async()=>{
 for(const id of Object.keys(CATALOG_WALL_DROP)){
  const c=await sample(id);assert.ok(c.seen,id);assert.equal(c.max,1,id);assert.ok(c.stamps.length>1,id+' delayed slide paint');
  assert.equal(c.seen.shockRadius,CATALOG_WALL_DROP[id].paint.PaintRadiusShock,id);
  assert.equal(c.seen.fallRadius,CATALOG_WALL_DROP[id].paint.PaintRadiusFall,id);
  assert.equal(c.paint.sampleWorld(1,new c.f.THREE.Vector3(0,7,8)),1,id+' wall ownership supports swimming');
  assert.equal(c.a.stats.turf,0,id+' walls are not floor turf');assert.equal(c.paint.counts[0],0,id);
  assert.equal(c.f.G.projectiles._s3DetachedWallDrops.length,0,id+' bounded lifecycle retires');
 }
});
test('wall drop reaches floor only at contact and is frame-rate independent after owner death',async()=>{
 const base=await sample('s3-shooter-short',60,{height:1.5});assert.ok(base.paint.counts[0]>0);assert.equal(base.a.stats.turf,base.paint.counts[0]*.0625);
 assert.ok(base.stamps.some(s=>s.at.y<.1&&s.r===.6),'source ground radius used at floor contact');
 for(const rate of [30,120]){const c=await sample('s3-shooter-short',rate,{height:1.5,dead:true});assert.deepEqual(c.grid,base.grid);assert.equal(c.a.stats.turf,base.a.stats.turf);}
});
test('remote ghosts cannot spawn another wall ownership producer',async()=>{
 const c=await sample('s3-shooter-short',60,{ghost:true});assert.equal(c.seen,null);assert.equal(c.stamps.length,0);assert.equal(c.a.stats.turf,0);
});
if(process.env.INKWAVE_WALL_DROP_RAW)test('wall-drop extraction matches all raw pinned source values',()=>{
 for(const d of Object.values(CATALOG_WALL_DROP)){
  const bytes=fs.readFileSync(process.env.INKWAVE_WALL_DROP_RAW+'/'+d.sourceActor+'.game__GameParameterTable.json');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),d.sourceSha256);
  const p=JSON.parse(bytes).GameParameters;for(const[k,v]of Object.entries(d.move))assert.equal(v,p.WallDropMoveParam[k]);
  for(const[k,v]of Object.entries(d.paint))assert.equal(v,p.WallDropCollisionPaintParam[k]);
  assert.equal(d.freeGravityType,p.WallDropMoveParam.FreeGravityType??null);
 }
});

async function online(id,weapon){
 const c=await world(),{f}=c;const nm=new f.NetMatch({myId:id,isHost:id==='a',hostId:'a',_members:new Map([['a','A'],['b','B']]),tr:{broadcast(){},sendTo(){}}},{id:'catalog-wall',map:'map',difficulty:'normal'});f.G.netm=nm;c.nm=nm;
 const configure=a=>{Object.assign(a,{owner:'a',nid:0,remote:id!=='a',team:0});nm.match={actors:[a],state:'playing',time:180,follower:false,playing:()=>true};f.G.match=nm.match;nm.byNid.set(0,a);nm._setupActor(a);};
 if(id==='a')Object.assign(c,round(c,weapon,1.5,configure));
 else{const a=f.make(weapon);configure(a);c.a=a;}
 f.G.actors=[];return c;
}
function replay(c,row){const e=JSON.parse(JSON.stringify(row));e._netSeq=row._netSeq;e._netTick=row._netTick;c.nm._play('a',e);}
test('wall slides use ordinary authenticated paint rows and survive delayed duplicate JSON replay',async()=>{
 for(const weapon of ['s3-shooter-short','s3-spinner-quick','s3-maneuver-short']){
  const a=await online('a',weapon),b=await online('b',weapon);let sent=0;const rows=[];
  for(let i=0;i<240;i++){
   a.f.G.time+=1/60;a.f.G.projectiles.update(1/60);a.paint.advanceSimulation(1/60);
   if(i%6===5){for(const row of a.nm.out.slice(sent)){if(row[1]==='s'){rows.push(row);replay(b,row);}}sent=a.nm.out.length;}
   b.paint.advanceSimulation(1/60);
  }
  for(let i=0;i<120;i++){a.paint.advanceSimulation(1/60);b.paint.advanceSimulation(1/60);}
  assert.ok(rows.length>3,weapon);assert.deepEqual(Array.from(b.paint.grid),Array.from(a.paint.grid),weapon+' delayed grid');
  const grid=Array.from(b.paint.grid);for(const row of rows)replay(b,row);for(let i=0;i<120;i++)b.paint.advanceSimulation(1/60);
  assert.deepEqual(Array.from(b.paint.grid),grid,weapon+' duplicate harmless');
  assert.equal(a.a.stats.turf,a.paint.counts[0]*.0625);assert.equal(b.a.stats.turf,0,'remote replay does not award local turf again');
 }
});

test('eight rapid shooters keep bounded active slides and reset releases them',async()=>{
 const c=await world(),{f,paint}=c,actors=[];let maxDrops=0,stamps=0;
 const nm=new f.NetMatch({myId:'a',isHost:true,hostId:'a',_members:new Map([['a','A']]),tr:{broadcast(){},sendTo(){}}},{id:'wall-load',map:'map',difficulty:'normal'});f.G.netm=nm;
 nm.match={actors,state:'playing',time:180,follower:false,playing:()=>true};f.G.match=nm.match;
 for(let i=0;i<8;i++){const a=f.make('s3-shooter-short');Object.assign(a,{owner:'a',nid:i,remote:false,team:0});a.pos.set((i-3.5)*3,6,0);a.aimDir.set(0,0,1);a.aimPoint.set(a.pos.x,6,60);a.form='kid';a.grounded=true;actors.push(a);nm.byNid.set(i,a);nm._setupActor(a);}
 f.G.actors=[];let maxRows=0,rows=0;const raw=paint.splat;paint.splat=function(...args){stamps++;return raw.apply(this,args);};
 for(let i=0;i<240;i++){
  for(const a of actors){a.ink=100;a.weaponRunner.update(1/60,{fire:i<180,firePressed:i===0});}
  f.G.time+=1/60;f.G.projectiles.update(1/60);paint.advanceSimulation(1/60);
  maxDrops=Math.max(maxDrops,f.G.projectiles._s3DetachedWallDrops?.length||0);maxRows=Math.max(maxRows,nm.out.length);
  if(i%3===2){rows+=nm.out.length;nm.out.splice(0);}
 }
 assert.ok(maxDrops>8);assert.ok(maxDrops<=8*30,'three-period bounded lifetime, no permanent slide accumulation');
 assert.ok(maxRows<512,'normal 20Hz send cadence never reaches outgoing queue capacity');
 assert.ok(rows>0);f.G.projectiles.clear();assert.equal(f.G.projectiles._s3DetachedWallDrops.length,0);
 console.log('catalog wall load',JSON.stringify({actors:8,frames:240,maxDrops,maxRows,rows,stamps}));
});

test('unpaintable walls cannot start wall-slide ownership',async()=>{
 const c=await sample('s3-shooter-short',60,{paintable:false});assert.equal(c.seen,null);assert.equal(c.a.stats.turf,0);assert.equal(c.paint.sampleWorld(1,new c.f.THREE.Vector3(0,7,8)),0);
});
