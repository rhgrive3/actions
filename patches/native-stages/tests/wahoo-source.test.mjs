import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {nativeStageCatalog,nativeStageIdentity} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {nativeFixture,readStage} from './fixture.mjs';
import {nativeTowerClearance} from '../runtime/native-tower-clearance.mjs';
import {nativeArenaBasis,nativeSpawnYaw} from '../runtime/native-spawn.mjs';

const SOURCE=process.env.INKWAVE_NATIVE_STAGE_SOURCE,ASSETS=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const REPOSITORY=process.env.INKWAVE_NATIVE_STAGE_REPOSITORY;
const stage=nativeStageCatalog().stages.find(s=>s.id==='wahoo');
test('Wahoo pins the Carousel03 export while retaining unverified moving-object semantics',()=>{
 assert.equal(stage.internal,'Vss_Carousel03');
 assert.equal(stage.tree,'5513701317c1a0d67800ffa4abac093eacbc87ea');
 assert.equal(stage.sourceSha256,'0d9fc1e01e59c34301d65e8d2a8bf2aa90e0f4920f63daf4ac567df0c4ba33db');
 assert.equal(stage.version1130Verified,false);
 assert.match(stage.placementStatus,/moving-object.*UNVERIFIED/);
 assert.ok(nativeStageIdentity()['definitions/wahoo.json']);
});

test('Wahoo original MTL and every PNG match pinned Git blob hashes and sizes',{skip:!SOURCE||!ASSETS||!REPOSITORY},()=>{
 const revision='0611f51b35c9736ee986fb2218461e2585b7875e',prefix='stages/'+stage.internal+'/',d=readStage(ASSETS,'wahoo');
 const rows=execFileSync('git',['-C',REPOSITORY,'ls-tree','-lr','-z',revision,prefix]).toString().split('\0');let png=0,mtl=0;
 for(const row of rows){if(!row)continue;const [meta,file]=row.split('\t'),relative=file.slice(prefix.length);
  if(relative!==stage.internal+'.mtl'&&!relative.startsWith('textures/'))continue;
  const [,type,oid,size]=meta.trim().split(/\s+/),raw=fs.readFileSync(path.join(SOURCE,stage.internal,relative));
  assert.equal(type,'blob');assert.equal(raw.length,Number(size));assert.equal(crypto.createHash('sha1').update(Buffer.from('blob '+raw.length+'\0')).update(raw).digest('hex'),oid);
  if(relative.endsWith('.png'))png++;else mtl++;
 }
 assert.equal(png,221);assert.equal(mtl,1);
 for(const [name,pin] of Object.entries(d.manifest.textureIntegrity)){
  const raw=fs.readFileSync(path.join(SOURCE,stage.internal,name)),copied=fs.readFileSync(path.join(ASSETS,'wahoo',name));
  assert.deepEqual(copied,raw);assert.equal(raw.length,pin.bytes);assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),pin.sha256);
 }
 assert.equal(Object.keys(d.manifest.textureIntegrity).length,187);
});

test('Wahoo independent original stream matches every float32 attribute and local uint32 face index',{skip:!SOURCE||!ASSETS||!fs.existsSync(path.join(ASSETS||'', 'wahoo','manifest.json'))},()=>{
 const d=readStage(ASSETS,'wahoo'),raw=fs.readFileSync(path.join(SOURCE,stage.internal,stage.internal+'.obj'));
 assert.equal(raw.length,25930345);assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),stage.sourceSha256);
 const positions=[],normals=[],uvs=[],indices=[];let offset=0,objectVertices=0;
 for(const line of raw.toString('utf8').split('\n')){
  const a=line.trim().split(/\s+/);
  if(a[0]==='o'){offset+=objectVertices;objectVertices=0;}
  else if(a[0]==='v'){positions.push(...a.slice(1,4).map(Number));objectVertices++;}
  else if(a[0]==='vn')normals.push(...a.slice(1,4).map(Number));
  else if(a[0]==='vt')uvs.push(...a.slice(1,3).map(Number));
  else if(a[0]==='f'){const local=a.slice(1).map(t=>Number(t.split('/')[0])-1-offset);for(let j=1;j<local.length-1;j++)indices.push(local[0],local[j],local[j+1]);}
 }
 const p=new Float32Array(positions),n=new Float32Array(normals),uv=new Float32Array(uvs),gotUV=[];
 assert.equal(d.vertices.length/8,p.length/3);
 for(let i=0;i<p.length/3;i++)for(let k=0;k<3;k++){assert.equal(d.vertices[i*8+k],p[i*3+k]);assert.equal(d.vertices[i*8+3+k],n[i*3+k]);}
 for(const o of d.manifest.objects)if(o.sourceHasUV)for(let i=o.vo;i<o.vo+o.vc;i++)gotUV.push(d.vertices[i*8+6],d.vertices[i*8+7]);
 assert.deepEqual(new Float32Array(gotUV),uv);assert.deepEqual(d.indices,new Uint32Array(indices));
 const wheels=d.manifest.objects.filter(o=>o.name.startsWith('FldObj_Carousel03_FerrisWheel_'));
 assert.equal(wheels.length,2);assert.ok(wheels.every(o=>!o.active&&!o.collidable&&!o.paintable));
 assert.ok(wheels.every(o=>o.bounds[0][1]<-64&&o.bounds[1][1]>96),'wheel remains in its unplaced original export pose');
 assert.ok(d.manifest.objects.some(o=>o.name.includes('RotationAttractions')&&o.collidable),'central static export triangles remain available');
});

test('Wahoo pads have source floor/capsule support and both teams reach every local ranked target',{skip:!ASSETS||!fs.existsSync(path.join(ASSETS||'','wahoo','manifest.json'))},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,d=readStage(ASSETS,'wahoo');G.level=new f.NativeLevel(d);G.physics=new f.NativePhysics(G.level);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,G.level,{atlasSize:2048,maxDensity:4});G.nav=new f.NavGraph(G.level,G.physics);
 for(const pad of G.level.spawnPads){
  const h=G.physics.raycast(pad.clone().setY(pad.y+2),new THREE.Vector3(0,-1,0),4);
  assert.equal(h.hit,true);assert.ok(Math.abs(h.point.y-pad.y)<.001);assert.ok(h.normal.y>.99);
  assert.equal(G.physics.bodyFits(pad.clone().setY(pad.y+.01),PLAYER.radius+.04,.32,PLAYER.height,false,.01),true);
 }
 const s=f.nativeRankedStage(G),targets=[s.zones[0].center,s.rainmaker.center,...s.rainmaker.goals,...s.rainmaker.checkpoints.flat(),...s.clams.spawns,...s.tower.path.map(p=>[p[0],p[1]-s.tower.localLift,p[2]])];
 assert.equal(s.tower.localLift,3.3);assert.equal(s.tower.halfSize,1.2);
 const clearance=nativeTowerClearance(G.level,G.physics.actorBody,s.tower.halfSize);
 for(let i=0;i<s.tower.path.length;i++)assert.equal(clearance.clear(s.tower.path[i],s.tower.path[Math.max(0,i-1)]),true,'rotating deck, pole and live human capsule clear segment '+i);
 for(let team=0;team<2;team++){
  const start=G.nav.nearest(G.level.spawnPads[team],1.2);
  for(const p of targets){const target=G.nav.nearest(new THREE.Vector3(...p),1.2);assert.ok(G.nav.path(start,target,team,50000),'team '+team+' reaches '+JSON.stringify(p));}
 }
 assert.equal(s.version1130Verified,false);
 const movement=[];
 for(const hz of [30,60,120])for(let team=0;team<2;team++){
  const a=f.make('shooter');a.team=team;a._integrate=f.Actor.prototype._integrate;a.spawnAt(G.level.spawnPads[team],0);
  const start=a.pos.clone(),phases=[[.1,.1,0],[.6,1,0],[.25,0,1],[.25,-1,0],[.2,0,0]];
  for(const [seconds,x,z] of phases){a.intent.move.set(x*(team===0?1:-1),0,z);a.intent.fire=false;
   for(let i=0;i<Math.round(seconds*hz);i++){G.time+=1/hz;a.update(1/hz);assert.ok(a.alive&&a.grounded&&Number.isFinite(a.pos.length()),hz+' Hz supported human movement');}
  }
  assert.ok(a.pos.distanceTo(start)>1,'movement reaches actual source floor');
  movement.push({hz,team,start:start.toArray(),end:a.pos.toArray(),weapon:a.weapon?.id||'shooter',gear:a.s3?.gear||null,form:a.form,grounded:a.grounded});
 }
 console.log(JSON.stringify({id:'wahoo',movement,state:'human; neutral ink; no shooting; micro/full forward, 90-degree turn, reverse and stop',input:phasesForReport()}));
 G.match.mode='turf';G.match.opts={};const basis=nativeArenaBasis(G.level);
 assert.equal(basis.forward.x,1);assert.equal(basis.forward.z,0);
 for(const team of [0,1])for(const hz of [30,60,120])for(const opening of [true,false])for(const isBot of [false,true]){
  const a=f.make('shooter');a.team=team;a.isBot=isBot;a.slot=0;a._integrate=f.Actor.prototype._integrate;a.spawnAt(G.level.spawnPads[team],0);a.aimPoint.copy(G.level.spawnPads[team]);a.intent.move.set(0,0,0);a.intent.fire=false;
  if(isBot){a.bot=new f.BotBrain(a,'normal');a.aimPoint.z+=100;a.aimYaw=0;a.bot.aimYaw=0;}
  if(opening)assert.equal(f.beginInitialSquidSpawn(a),true);else{a.alive=false;a.respawn();}
  assert.equal(a.yaw,nativeSpawnYaw(G.level,team,0));assert.equal(a.aimYaw,a.yaw);
  const target=a.s3.squidSpawn.target,pad=G.level.spawnPads[team];assert.ok(target&&(target.x-pad.x)*(team?-1:1)>0,'supported launch points toward opposing X side');
  a.intent.fire=true;a.update(1/hz);a.intent.fire=false;for(let i=0;i<Math.ceil(hz*1.5);i++){G.time+=1/hz;a.update(1/hz);}
  assert.equal(a.s3.squidSpawn,undefined);assert.ok(a.alive&&a.grounded&&a.ground.hit,'X-axis opening/respawn source landing '+team+' '+hz+' '+opening);
 }
});

function phasesForReport(){return [[.1,.1,0],[.6,1,0],[.25,0,1],[.25,-1,0],[.2,0,0]];}
