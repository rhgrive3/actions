import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {nativeFixture,readStage} from './fixture.mjs';
import {nativeArenaBasis,nativeSpawnYaw} from '../runtime/native-spawn.mjs';
const ROOT=process.env.INKWAVE_NATIVE_STAGE_ASSETS,SOURCE=process.env.INKWAVE_NATIVE_STAGE_SOURCE;
const available=ROOT&&fs.existsSync(path.join(ROOT,'robo','manifest.json'));

test('Robo definition pins authentic X-axis source and names only inferred semantics',()=>{
 const s=nativeStageCatalog().stages.find(s=>s.id==='robo');assert(s);
 assert.equal(s.internal,'Vss_Cross00');assert.equal(s.tree,'53a94ccb7abc115382c208b540ac45728ba914d9');assert.equal(s.version1130Verified,false);
 assert.equal(s.sourceSha256,'8dacb74311fc9af52fbcebbb37038246871dfc7ad633830b16d62eb57d7e655e');
 assert(s.bounds.maxX-s.bounds.minX>s.bounds.maxZ-s.bounds.minZ);
 assert(s.spawnPads[0][0]<0&&s.spawnPads[1][0]>0);assert.match(s.placementStatus,/inferred.*unverified/);
});

test('Robo uint32 face indices preserve every original text face in its original object',{skip:!available||!SOURCE},async()=>{
 const d=readStage(ROOT,'robo'),objects=d.manifest.objects;let oi=-1,vertexOffset=0,indexOffset=0;
 const lines=readline.createInterface({input:fs.createReadStream(path.join(SOURCE,'Vss_Cross00','Vss_Cross00.obj')),crlfDelay:Infinity});
 for await(const line of lines){
  if(line.startsWith('o ')){
   if(oi>=0){assert.equal(indexOffset,objects[oi].io+objects[oi].ic);vertexOffset+=objects[oi].vc;}
   oi++;assert.equal(line.slice(2).trim(),objects[oi].name);assert.equal(vertexOffset,objects[oi].vo);
  }else if(line.startsWith('f ')){
   const face=line.slice(2).trim().split(/\s+/).map(t=>Number(t.split('/')[0])-1-vertexOffset);
   for(let j=1;j<face.length-1;j++)for(const k of [0,j,j+1])assert.equal(d.indices[indexOffset++],face[k]);
  }
 }
 assert.equal(oi+1,objects.length);assert.equal(indexOffset,d.indices.length);assert.equal(indexOffset,1759113);
});

test('Robo source supports both teams, inward launch/respawn and a common directed paint component',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,d=readStage(ROOT,'robo'),L=new f.NativeLevel(d),P=new f.NativePhysics(L);G.level=L;G.physics=P;
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(L,P);G.match.mode='turf';G.match.opts={};
 for(const o of d.manifest.objects){
  if(/^Fld_Cross00_(?:HokoSet|HokoAsariSet|Tclobj)_/.test(o.name))assert.equal(o.active,false,o.name);
  if(/^Fld_Cross00JerryMannequin_/.test(o.name))assert.equal(o.collidable,false,o.name);
  if(/__(?:.*(?:NoPaint|Nopaintable).*|MetalNetwork00|NetParts00)(?:_.*)?$/.test(o.name)||/^Fld_Cross00_GeneralCube_.*GeneralBoxNoPaint_/.test(o.name))assert.equal(o.paintable,false,o.name);
 }
 const basis=nativeArenaBasis(L),proof=[];
 for(const team of [0,1]){
  const pad=L.spawnPads[team],h=P.raycast(pad.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert(h.hit&&h.normal.y>.68&&Math.abs(h.point.y-pad.y)<.01);assert(h.face>=0);assert(P.bodyFits(pad.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height,false,.01));
  for(const hz of [30,60,120])for(const opening of [true,false])for(const slot of [-1,0,3]){
   const a=f.make('shooter');a.team=team;a.slot=Math.max(0,slot);a.isBot=slot>=0;a._integrate=f.Actor.prototype._integrate;a.spawnAt(pad,nativeSpawnYaw(L,team,0));a.aimPoint.copy(pad);a.intent.move.set(0,0,0);a.intent.fire=false;
   if(a.isBot){a.bot=new f.BotBrain(a,'normal');if(!opening){a.bot.aimYaw=1.234;a.aimPoint.copy(pad).add(new THREE.Vector3(90,0,40));}}
   if(opening)assert(f.beginInitialSquidSpawn(a));else{a.alive=false;a.respawn();}
   const yaw=nativeSpawnYaw(L,team,0);assert.equal(a.yaw,yaw);assert.equal(a.aimYaw,yaw);if(a.isBot&&opening)assert.equal(a.bot.aimYaw,yaw);
   const target=a.s3.squidSpawn.target,sign=team?-1:1;assert(target);assert(((target.x-pad.x)*basis.forward.x+(target.z-pad.z)*basis.forward.z)*sign>0);
   a.intent.fire=true;a.update(1/hz);a.intent.fire=false;for(let i=0;i<Math.ceil(hz*1.5);i++){G.time+=1/hz;a.update(1/hz);}
   assert.equal(a.s3.squidSpawn,undefined);assert(a.alive&&a.grounded&&a.ground.hit,`${team}/${hz}/${opening}/${slot}`);
   proof.push({team,hz,opening,slot,landing:a.pos.toArray()});
  }
 }
 const movement=[];
 for(const team of [0,1]){
  const endpoints=[];
  for(const hz of [30,60,120]){
   const a=f.make('shooter');a.team=team;a._integrate=f.Actor.prototype._integrate;a.spawnAt(L.spawnPads[team],nativeSpawnYaw(L,team,0));a.intent.fire=false;
   const sign=team?-1:1;a.intent.move.set(basis.forward.x*sign,0,basis.forward.z*sign);
   for(let i=0;i<hz/2;i++){G.time+=1/hz;a.update(1/hz);assert(a.alive&&a.grounded,'source-supported full-input walking');}
   a.intent.move.set(0,0,0);for(let i=0;i<hz/2;i++){G.time+=1/hz;a.update(1/hz);assert(a.alive&&a.grounded,'source-supported stop');}
   assert(a.pos.distanceTo(L.spawnPads[team])>1);endpoints.push(a.pos.clone());movement.push({team,hz,weapon:'shooter',gear:'fixture default without added abilities',input:'0.5 s opposing-pad full walk, then 0.5 s release',endpoint:a.pos.toArray()});
  }
  assert(endpoints.every(p=>p.distanceTo(endpoints[1])<.25),'30/60/120 Hz source movement remains stable');
 }
 const ranked=f.nativeRankedStage(G),targets=[...ranked.zones.map(z=>z.center),ranked.rainmaker.center,...ranked.rainmaker.goals,...ranked.rainmaker.checkpoints.flat(),...ranked.clams.spawns,...ranked.clams.goals];
 for(const [team,pad] of L.spawnPads.entries()){const start=G.nav.nearest(pad,1.2);assert(start>=0);for(const p of targets){const goal=G.nav.nearest(new THREE.Vector3(...p),1.2);assert(goal>=0);assert(G.nav.path(start,goal,team,50000),`team ${team} reaches calibrated objective ${p}`);}}
 assert.equal(ranked.version1130Verified,false);assert.match(ranked.calibration,/UNVERIFIED/);assert(ranked.tower.path.length>2);
 console.log(JSON.stringify({id:'robo',validNodes:G.nav.validIds.length,objectives:targets.length,launchCases:proof,movement}));
});
