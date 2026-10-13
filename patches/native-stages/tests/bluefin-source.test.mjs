import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {nativeFixture,readStage} from './fixture.mjs';

const ROOT=process.env.INKWAVE_NATIVE_STAGE_ASSETS,SOURCE=process.env.INKWAVE_NATIVE_STAGE_SOURCE;
const available=ROOT&&fs.existsSync(path.join(ROOT,'bluefin','manifest.json'));

test('Bluefin exact original Float32 attributes and every Uint32 triangulated face index',{skip:!available||!SOURCE},async()=>{
 const buffer=name=>{const b=fs.readFileSync(path.join(ROOT,'bluefin',name+'.bin'));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
 const vertices=new Float32Array(buffer('vertices')),indices=new Uint32Array(buffer('indices'));
 let v=0,n=0,uv=0,index=0,offset=0,objectUV=0;
 const finish=()=>{if(!objectUV)for(let i=offset;i<v;i++){assert.equal(vertices[i*8+6],0);assert.equal(vertices[i*8+7],0);}else assert.equal(objectUV,v-offset);};
 const lines=readline.createInterface({input:fs.createReadStream(path.join(SOURCE,'Vss_Ruins03','Vss_Ruins03.obj')),crlfDelay:Infinity});
 for await(const line of lines){
  if(line.startsWith('o ')){finish();offset=v;objectUV=0;}
  else if(line.startsWith('v ')){const values=line.trim().split(/\s+/).slice(1,4);for(let k=0;k<3;k++)assert.equal(vertices[v*8+k],Math.fround(Number(values[k])));v++;}
  else if(line.startsWith('vn ')){const values=line.trim().split(/\s+/).slice(1,4);for(let k=0;k<3;k++)assert.equal(vertices[n*8+3+k],Math.fround(Number(values[k])));n++;}
  else if(line.startsWith('vt ')){const values=line.trim().split(/\s+/).slice(1,3);for(let k=0;k<2;k++)assert.equal(vertices[(offset+objectUV)*8+6+k],Math.fround(Number(values[k])));objectUV++;uv++;}
  else if(line.startsWith('f ')){
   const face=line.trim().split(/\s+/).slice(1).map(token=>Number(token.split('/')[0])-1-offset);
   for(let i=1;i<face.length-1;i++)for(const expected of [face[0],face[i],face[i+1]])assert.equal(indices[index++],expected,'original face index '+(index-1));
  }
 }
 finish();assert.equal(v,1024229);assert.equal(n,v);assert.equal(vertices.length,v*8);assert.equal(index,indices.length);assert.equal(index/3,774445);assert(uv>0);
});

test('Bluefin source deck capsules, inward movement, real launch and both-team objective access',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=new f.NativeLevel(readStage(ROOT,'bluefin')),P=new f.NativePhysics(L);G.level=L;G.physics=P;
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});
 const alternatives=L.manifest.objects.filter(o=>/^FldObj_Ruins03(?:Tcl|Var|Vcl|Vgl|Vlf)(?:Stage|Center)_|^FldObj_Ruins03GeneralBox(?:Tcl|Var|Vcl|Vgl|Vlf)_/.test(o.name));
 assert(alternatives.length>400);assert(alternatives.every(o=>!o.active&&!o.collidable));
 for(const [team,pad] of L.spawnPads.entries()){
  const h=P.raycast(pad.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert(h.hit&&h.normal.y>.99);assert(h.point.distanceTo(pad)<.01);assert.match(L.manifest.objects[L.data.objectIds[h.triangle]].name,/^FldObj_Ruins03PntStage_.*__DeckFloor0[12]$/);
  assert(P.bodyFits(pad.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height));
  const inward=L.spawnPads[1-team].clone().sub(pad).setY(0).normalize();
  for(const hz of [30,60,120]){
   const a=f.make('shooter');a.team=team;a._integrate=f.Actor.prototype._integrate;a.spawnAt(pad,Math.atan2(inward.x,inward.z));a.intent.move.copy(inward);a.intent.fire=false;
   for(let i=0;i<hz*.5;i++){G.time+=1/hz;a.update(1/hz);}
   assert(a.alive&&a.grounded,'real controller inward source movement '+team+' '+hz);assert(a.pos.distanceTo(pad)>1);
  }
 }
 G.nav=new f.NavGraph(L,P);const N=G.nav;
 G.match.mode='turf';G.match.opts={};
 const launches=[];
 for(const team of [0,1])for(const botSlot of [-1,0,1,2,3])for(const hz of [30,60,120]){
  const a=f.make('shooter');a.team=team;a.slot=botSlot<0?0:botSlot;a.isBot=botSlot>=0;a._integrate=f.Actor.prototype._integrate;a._spawnBarrier=f.Actor.prototype._spawnBarrier;
  assert.equal(f.beginInitialSquidSpawn(a),true);const target={...a.s3.squidSpawn.target};
  if(!a.isBot){a.intent.fire=true;a.update(1/hz);a.intent.fire=false;}
  let frames=0;for(;frames<hz*3&&a.s3.squidSpawn;frames++){G.time+=1/hz;a.update(1/hz);}
  assert(a.alive&&!a.s3.squidSpawn&&a.grounded&&a.ground.hit,'real initial integrator settles '+JSON.stringify({team,botSlot,hz,target,frames,phase:a.s3.squidSpawn?.phase,pos:a.pos.toArray()}));
  launches.push({team,botSlot,hz,frames,target,position:a.pos.toArray()});
 }
 console.log(JSON.stringify({id:'bluefin',sourceInitialLaunches:launches,navNodes:N.nodes.length,validNodes:N.validIds.length}));
 const stage=f.nativeRankedStage(G),goals=[...stage.zones.map(z=>z.center),stage.rainmaker.center,...stage.rainmaker.goals,...stage.rainmaker.checkpoints.flat(),...stage.clams.spawns,...stage.tower.path.map(p=>[p[0],p[1]-(stage.tower.localLift??3.3),p[2]])];
 for(const [team,pad] of L.spawnPads.entries())for(const p of goals){const start=N.nearest(pad,1.2),end=N.nearest(new THREE.Vector3(...p),1.2);assert(N.path(start,end,team,50000),'team '+team+' directed route to '+p);}
 assert.equal(stage.version1130Verified,false);
});

test('Bluefin opposing source ledges really walk or jump down to retained lower floors at 30/60/120Hz',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(ROOT,'bluefin')),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.match.mode='turf';G.match.opts={};
 const cases=[];
 for(const side of [-1,1])for(const jumping of [false,true])for(const hz of [30,60,120]){
  const start=new THREE.Vector3(-25*side,9,22*side),h=P.raycast(start.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert(h.hit&&h.normal.y>.99&&h.point.distanceTo(start)<.12);assert(P.bodyFits(start.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height));
  const a=f.make('shooter');a.team=side<0?0:1;a._integrate=f.Actor.prototype._integrate;a._spawnBarrier=f.Actor.prototype._spawnBarrier;a.spawnAt(start,side<0?0:Math.PI);a.intent.move.set(0,0,-side);a.intent.jump=jumping;
  for(let i=0;i<hz*2;i++){G.time+=1/hz;a.update(1/hz);}
  assert(a.alive&&a.grounded&&a.ground.hit&&Math.abs(a.pos.y-3)<.01,'actual controller source drop '+JSON.stringify({side,jumping,hz,start:start.toArray(),end:a.pos.toArray()}));
  cases.push({team:a.team,jumping,hz,start:start.toArray(),sourceStart:h.point.toArray(),end:a.pos.toArray(),alive:a.alive,grounded:a.grounded});
 }
 console.log(JSON.stringify({id:'bluefin',actualSourceBankDrops:cases,conditions:'ordinary real Actor integrator; shooter; kid; zero AP; no paint or fire; 2 seconds inward movement; all source collision retained'}));
});

test('Bluefin admitted shooter paint and ordinary input physically traverse the original positive upper bank',{skip:!available},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(ROOT,'bluefin')),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.match.mode='turf';G.match.opts={};G.camera=new THREE.PerspectiveCamera();const cases=[];f.setRandom(()=>.5);
 try{for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();
  const start=new THREE.Vector3(20,3,18.5),support=P.raycast(start.clone().add(new THREE.Vector3(0,.3,0)),new THREE.Vector3(0,-1,0),.6);
  assert(support.hit&&support.normal.y>.99&&support.point.distanceTo(start)<.01);
  assert.match(L.manifest.objects[L.data.objectIds[support.triangle]].name,/__BlueTarp00$/);
  assert(P.bodyFits(start.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height));
  const walls=[],floors=[];let noPaintSamples=0;
  for(let y=3.25;y<9.2;y+=.15){const wall=P.raycast(new THREE.Vector3(26,y,18.5),new THREE.Vector3(1,0,0),5);if(!wall.hit)continue;if(wall.face<0){noPaintSamples++;continue;}walls.push(wall);}
  assert(walls.length>30,'painting targets use the actual source wall chain');
  for(let x=20.5;x<=24.5;x+=.5){const floor=P.raycast(new THREE.Vector3(x,5,18.5),new THREE.Vector3(0,-1,0),3);if(floor.hit&&floor.face>=0)floors.push(floor);}
  const actor=new f.Actor({team:0,name:'source positive bank',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});actor.spawnAt(start,Math.PI/2);G.actors=[actor];
  const clearance=f.nativeDropClearance(L);let screenCapsules=false,capsuleSamples=0;
  const tick=()=>{
   const previous=actor.pos.clone();G.time+=1/hz;actor.update(1/hz);
   if(screenCapsules){
    const squid=actor.form==='squid',radius=(squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw)*PLAYER.s3TerrainDistanceScale;
    assert(clearance.clear(previous,actor.pos,radius,squid?PLAYER.squidBodyLift:PLAYER.stepUp,squid?PLAYER.squidHeight:PLAYER.height,squid),'continuous actual source capsule '+JSON.stringify({hz,from:previous.toArray(),to:actor.pos.toArray(),form:actor.form,surge:actor.s3.surge?.phase}));capsuleSamples++;
   }
   G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);
  };
  let paintSeconds=0,refillSeconds=0,fireFrames=0;
  for(const target of [...floors,...walls]){
   if(actor.ink<25){actor.intent.fire=false;actor.intent.squid=true;for(let frame=0;frame<hz*4&&actor.ink<95;frame++){tick();refillSeconds+=1/hz;}actor.intent.squid=false;}
   actor.intent.move.set(0,0,0);actor.intent.squid=false;actor.intent.fire=true;
   const aim=target.point.clone().sub(actor.pos);aim.y-=1.1;actor.aimYaw=Math.atan2(aim.x,aim.z);actor.aimPitch=Math.max(-1.1,Math.min(1,Math.atan2(aim.y,Math.hypot(aim.x,aim.z))));actor.aimPoint.copy(target.point);
   for(let frame=0;frame<hz*2&&G.paint.sample(target.face,target.u,target.v)!==1;frame++){tick();paintSeconds+=1/hz;fireFrames++;}
  }
  const wallSamples=walls.filter(h=>G.paint.sample(h.face,h.u,h.v)===1).length,floorOwned=floors.filter(h=>G.paint.sample(h.face,h.u,h.v)===1).length;
  assert.equal(wallSamples,walls.length,'admitted weapon projectiles own the entire source attachment wall');
  assert(fireFrames>0&&floorOwned>=7,'ordinary fire paints the supported running approach');
  const unownedFloorSamples=floors.filter(h=>G.paint.sample(h.face,h.u,h.v)!==1).map(h=>({point:Array.from(h.point.toArray()),face:h.face,triangle:h.triangle}));
  actor.intent.fire=false;actor.intent.squid=true;for(let frame=0;frame<hz*4&&actor.ink<95;frame++){tick();refillSeconds+=1/hz;}
  actor.intent.move.set(1,0,0);actor.intent.jump=false;screenCapsules=true;
  let jumped=false,climbed=false,burst=false,seconds=0,phase='run',fullChargeHumanPop=false;
  for(let frame=0;frame<hz*12;frame++){
   if(!jumped&&actor.pos.x>23.7){actor.intent.jump=true;jumped=true;}
   if(phase==='run'&&actor.climbing)phase='charge';
   if(phase==='charge'){
    actor.intent.jump=true;
    if(actor.pos.y>=7.2){actor.intent.move.set(0,0,0);if(actor.s3.surge?.charge>=1){actor.intent.jump=false;phase='release';fullChargeHumanPop=true;}}
   }else if(phase==='release'){actor.intent.squid=false;actor.intent.jump=false;actor.intent.move.set(1,0,0);phase='human';}
   tick();climbed ||=actor.climbing;burst ||=actor.s3.surge?.phase==='burst';seconds=(frame+1)/hz;
   if(climbed&&actor.grounded&&actor.pos.y>8.9||!actor.alive)break;
  }
  assert(actor.alive&&actor.grounded&&actor.pos.y>8.9&&actor.pos.y<9.15&&actor.pos.x>27.5&&jumped&&climbed,'ordinary running jump and wall input reaches real positive bank '+JSON.stringify({hz,end:actor.pos.toArray(),alive:actor.alive,grounded:actor.grounded,jumped,climbed,burst,seconds}));
  const endSupport=P.raycast(actor.pos.clone().add(new THREE.Vector3(0,.2,0)),new THREE.Vector3(0,-1,0),.4);
  assert(endSupport.hit&&endSupport.normal.y>.68&&endSupport.point.distanceTo(actor.pos)<.01);
  assert(fullChargeHumanPop&&capsuleSamples>hz,'ordinary full-charge release and kid pop clear every actual approach/climb capsule');
  screenCapsules=false;
  const capEnd=Array.from(actor.pos.toArray()),walkway=[[29,19.5],[30,20.5],[31,20.5],[31,21.5],[31,22.5],[31,23.5],[31,24.5],[31,25.5],[31,26.5],[30,27.5],[29,28.5],[28,29.5],[27,30.5],[27,31.5],[26,32.5],[25,33.5],[24,34.5],[23,35.5],[22,36.5],[21,37.5],[21,38.5],[20,39.5],[20,40.5]];
  actor.intent.squid=actor.intent.jump=false;let bankWalkSeconds=0,goal;
  for(const [x,z] of walkway){
   const h=P.raycast(new THREE.Vector3(x,10,z),new THREE.Vector3(0,-1,0),2);
   assert(h.hit&&h.normal.y>.68&&Math.abs(h.point.y-9)<.15,'walkway waypoint has original upper-bank source support');goal=h.point.clone();
   assert(P.bodyFits(goal.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height));
   let reached=false;
   for(let frame=0;frame<hz*3;frame++){
    const delta=goal.clone().sub(actor.pos),height=delta.y;delta.y=0;
    if(delta.length()<.35&&Math.abs(height)<.2&&actor.grounded){reached=true;break;}
    actor.intent.move.copy(delta).normalize();tick();bankWalkSeconds+=1/hz;if(!actor.alive)break;
   }
   assert(reached&&actor.alive,'ordinary input remains on supported walkway around the source cliff '+JSON.stringify({hz,goal:goal.toArray(),end:actor.pos.toArray(),grounded:actor.grounded,alive:actor.alive}));
  }
  assert(actor.grounded&&actor.pos.distanceTo(goal)<.35&&Math.abs(actor.pos.y-9)<.01);
  assert.deepEqual(Object.keys(actor.s3.abilityPoints),[]);
  cases.push({team:0,hz,start:Array.from(start.toArray()),sourceStartTriangle:support.triangle,capEnd,sourceCapTriangle:endSupport.triangle,seconds,bankGoal:Array.from(goal.toArray()),bankEnd:Array.from(actor.pos.toArray()),bankWalkSeconds,walkwaySourceSupports:walkway.length,wallSamples,floorTargets:floors.length,floorOwned,unownedFloorSamples,paintSeconds,refillSeconds,fireFrames,noPaintSamples,jumped,climbed,existingSurgeBurst:burst,fullChargeHumanPop,continuousActualCapsuleSamples:capsuleSamples,continuousActualCapsuleFailures:0,grounded:true,weapon:'shooter / Shooter_Normal_00',gearAP:0});
 }}finally{f.restoreRandom();}
 console.log(JSON.stringify({id:'bluefin',positiveBankHumanAccess:cases,conditions:'production Actor integrator/frame finishing and Character muzzle, WeaponRunner/projectiles and source collision; CPU VM optional source motion unavailable; source-supported initial pose only; empty initial paint; ordinary fire/aim/refill then inward run, jump at x>23.7, hold squid/jump through attachment, stop at feet>=7.2 until full existing Surge charge, release jump for one squid tick then kid/+X; every live approach/climb capsule continuously source-screened; 23 separately supported bank walkway points; no later pose/velocity/ink or manual ownership assignment; deterministic 0.5 RNG'}));
});
