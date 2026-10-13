import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';
const ROOT=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const available=!!ROOT&&fs.existsSync(path.join(ROOT,'umami/manifest.json'));
test('Umami pins the complete source identity and opposing source support definition',()=>{
 const s=nativeStageCatalog().stages.find(s=>s.id==='umami');
 assert.equal(s.internal,'Vss_Factory00');assert.equal(s.tree,'232d0e5ba4b69b74a7fa044da5b7c15c8ee273f5');
 assert.equal(s.sourceSha256,'9d7c261d324d514148499d2ab804b49b05e0394bdc74e46b6e6afb0fff664d3b');
 assert.equal(s.version1130Verified,false);assert.ok(s.spawnPads[0][2]<0&&s.spawnPads[1][2]>0);
});
test('Umami opposing source floors have capsule clearance and directed routes to every local objective',{skip:!available},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(ROOT,'umami')),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});
 for(const p of L.spawnPads){
  const h=P.raycast(p.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert.ok(h.hit&&h.normal.y>.99);assert.ok(Math.abs(h.point.y-p.y)<1e-5);
  assert.equal(L.manifest.objects[L.data.objectIds[h.triangle]].name,'Fld_Factory00_floorA_20_1__FloorRubber00');
  assert.ok(P.bodyFits(p.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height));
 }
 G.nav=new f.NavGraph(L,P);const N=G.nav,S=f.nativeRankedStage(G),spawns=L.spawnPads.map(p=>N.nearest(p,1.2));
 const goals=[...S.zones.map(z=>z.center),S.rainmaker.center,...S.rainmaker.goals,...S.rainmaker.checkpoints.flat(),...S.clams.goals,...S.clams.spawns];
 for(const [team,from]of spawns.entries())for(const p of goals){
  const target=N.nearest(new THREE.Vector3(...p),1.2);assert.ok(N.path(from,target,team,50000),'team '+team+' to '+p);
 }
 const water=L.manifest.objects.filter(o=>/^Fld_Factory00_pPlane(?:590_1__GroundWater00_va|644_1__GroundWater00)$/.test(o.name));assert.equal(water.length,2);assert.ok(water.every(o=>o.active&&!o.collidable&&!o.paintable&&o.bounds[1][1]<-1.45),'original underwater bottom remains display only');
 const fallen=f.make('shooter');fallen._integrate=f.Actor.prototype._integrate;fallen.pos.set(-20,-2,-46);fallen.intent.move.set(0,0,0);fallen.intent.fire=false;fallen.update(1/60);assert.equal(fallen.alive,false,'fall under original water floor uses real existing death logic');
 const sourceOnly=L.manifest.objects.filter(o=>o.name.startsWith('FldObj_Factory00_PackVar_'));
 assert.ok(sourceOnly.length>0);assert.ok(sourceOnly.every(o=>!o.active&&!o.collidable));
 for(const o of L.manifest.objects.filter(o=>o.name.includes('GeneralBoxNoPaint_')&&o.active))assert.equal(o.paintable,false);
});
test('Umami opening, death respawn and inward grounded walk use actual source at 30/60/120 Hz',{skip:!available},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE}=f,L=G.level=new f.NativeLevel(readStage(ROOT,'umami'));G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(L,G.physics);G.match.mode='turf';G.match.opts={};
 const measurements=[];
 for(const team of [0,1])for(const hz of [30,60,120])for(const opening of [true,false]){
  const a=f.make('shooter');a.team=team;a._integrate=f.Actor.prototype._integrate;a.spawnAt(L.spawnPads[team],0);a.intent.fire=false;a.intent.move.set(0,0,0);
  if(opening)assert.ok(f.beginInitialSquidSpawn(a));else{a.alive=false;a.respawn();}
  assert.ok(a.s3.squidSpawn.target);a.intent.fire=true;a.update(1/hz);a.intent.fire=false;
  for(let k=0;k<Math.ceil(hz*1.5);k++){G.time+=1/hz;a.update(1/hz);}
  assert.equal(a.s3.squidSpawn,undefined);assert.ok(a.alive&&a.grounded&&a.ground.hit);
  const start=a.pos.clone(),direction=L.spawnPads[1-team].clone().sub(L.spawnPads[team]);direction.y=0;direction.normalize();a.intent.move.copy(direction);
  for(let k=0;k<hz*.2;k++){G.time+=1/hz;a.update(1/hz);}
  const distance=a.pos.distanceTo(start);assert.ok(distance>.05&&distance<5);assert.ok(a.alive&&a.grounded);
  measurements.push({team,hz,opening,grounded:a.grounded,distance});
 }
 console.log(JSON.stringify({umamiNativeMovement:measurements,weapon:'fixture shooter; owned game movement',gear:'fixture default; console gear equivalence unverified',state:'initial launch or death respawn, dry source floor, 0.2 s full inward walk'}));
});
