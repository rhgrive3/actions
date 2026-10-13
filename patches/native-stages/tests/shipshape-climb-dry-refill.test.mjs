import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';

const root=process.env.NATIVE_SHIPSHAPE_CLIMB_REFILL_ASSETS||process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const ready=root&&fs.existsSync(path.join(root,'shipshape','manifest.json'));

test('ordinary source-climb inputs recover from a naturally drained dry firing stance',{skip:!ready},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f;
 const L=G.level=new f.NativeLevel(readStage(root,'shipshape'));
 G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{
  _initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}
  _pushQuad(){} _drawQuads(){}
 }
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});
 const helperSha256=crypto.createHash('sha256').update(fs.readFileSync('patches/native-stages/runtime/native-climb.mjs')).digest('hex');
 console.log('source-climb-refill-module-bound '+JSON.stringify({helperSha256,expectedRecovery:process.env.NATIVE_SHIPSHAPE_EXPECT_DRY_RECOVERY!=='0'}));
 const N=G.nav=new f.NavGraph(L,G.physics),from=N.nodes[16843];
 const edge=from.nb.find(e=>e.to===16578&&e.type==='climb'&&!e.climb.kind);
 assert(edge,'the recorded failure is a genuine plain source wall edge');
 const c=edge.climb,a=new f.Actor({team:1,name:'dry source stance',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 G.actors=[a];G.camera=new THREE.PerspectiveCamera();a.isBot=true;
 const firingStart=new THREE.Vector3(...c.paintStance).add(new THREE.Vector3(-2,0,0));
 a.spawnAt(firingStart,-Math.PI/2);a.invuln=0;
 const tick=()=>{G.time+=1/60;a.update(1/60);G.projectiles.update(1/60);G.paint.advanceSimulation(1/60);};
 f.setRandom(()=>.5);
 try{
  for(let i=0;i<36;i++)tick();
  a.aimYaw=-Math.PI/2;a.aimPitch=1;
  a.aimPoint.copy(a.pos).add(new THREE.Vector3(-20*Math.cos(1),1.1+20*Math.sin(1),0));
  a.intent.fire=true;
  let preparation=0;
  while(a.ink>3&&preparation++<1200)tick();
  a.intent.fire=false;let approach=0;
  for(;approach<180;approach++){
   const dx=c.paintStance[0]-a.pos.x;
   a.intent.move.set(dx>.2?1:dx<-.2?-1:0,0,0);tick();
   if(Math.abs(c.paintStance[0]-a.pos.x)<.2&&Math.hypot(a.vel.x,a.vel.z)<.15)break;
  }
  a.intent.move.set(0,0,0);
  assert(approach<180&&Math.hypot(a.pos.x-c.paintStance[0],a.pos.z-c.paintStance[2])<=.2,'ordinary grounded movement reaches the real dry stance without a pose write');
  assert(a.ink<PLAYER.inkMax*.15,'ordinary admitted Shooter shots create the low-ink condition');
  assert(a.grounded&&!a.submerged&&a.ground.hit&&a.ground.face===33518&&!a.ground.grate);
  assert.equal(G.paint.sample(a.ground.face,a.ground.u,a.ground.v),0,'the original Floor00 firing stance stays dry');
  // These are controller contract probes of an observed low-ink actor, not
  // physical trajectories. They reject stale/unsupported contact declarations
  // without changing any original source triangle, role, chart or mask.
  const snapshot={...a,pos:a.pos.clone(),vel:a.vel.clone(),aimPoint:a.aimPoint.clone(),ground:{...a.ground,normal:a.ground.normal.clone()},intent:{...a.intent,move:a.intent.move.clone()},weaponRunner:{...a.weaponRunner}};
  const probeActor=()=>({...snapshot,pos:snapshot.pos.clone(),vel:snapshot.vel.clone(),aimPoint:snapshot.aimPoint.clone(),ground:{...snapshot.ground,normal:snapshot.ground.normal.clone()},intent:{...snapshot.intent,move:snapshot.intent.move.clone()},s3:{...snapshot.s3}});
  const controls=[
   ['airborne',q=>{q.grounded=false;},true],
   ['climbing',q=>{q.grounded=false;q.climbing=true;},true],
   ['missing-support',q=>{q.ground.hit=false;},true],
   ['NoPaint-contact-marker',q=>{q.ground.face=-1;},true],
   ['grate-contact-marker',q=>{q.ground.grate=true;},true],
   ['dynamic-or-invalid-support',q=>{q.ground.block=L.staticBlockCount;},true],
   ['outside-original-polygon-UV',q=>{q.ground.u=-.001;},true],
   ['unsupported-height',q=>{q.pos.y+=.17;},true],
   ['off-original-stance',q=>{q.pos.x+=.21;},true],
   ['death',q=>{q.alive=false;},false],
   ['source-spawn',q=>{q.s3.squidSpawn={phase:'flight'};},false],
   ['superjump',q=>{q.superJumpState={phase:'flight'};},false],
   ['special-owner',q=>{q.specialActive={id:'trizooka',phase:'charge'};},false],
  ],negativeResults=[];
  for(const [name,change,handled] of controls){
   const q=probeActor(),b=new f.BotBrain(q,'normal');b.path=[from.id,edge.to];b.pi=1;b.goal=edge.to;q.intent.squid=true;q.intent.fire=false;change(q);
   assert.equal(f.updateNativeClimb(b,G,1/60),handled,name);
   assert.equal(q.intent.squid,true,name+' retains the existing squid request');
   negativeResults.push({name,handled,squidRetained:true,scope:'Seeded controller/contact metadata contract, not an actual Game trajectory'});
  }
  {
   const q=probeActor(),b=new f.BotBrain(q,'normal');b.path=[from.id,edge.to];b.pi=1;b.goal=edge.to;q.weaponRunner={...snapshot.weaponRunner,s3ShooterCancelMain:true};
   assert(f.updateNativeClimb(b,G,1/60));assert.equal(b._nativeClimb.phase,'release');assert.equal(q.intent.fire,false);assert.equal(q.intent.squid,false);
   negativeResults.push({name:'shooter-cancellation-release',scope:'Seeded existing runner cancellation contract',fire:false,squid:false});
  }
  {
   const q=probeActor(),b=new f.BotBrain(q,'normal');b.path=[from.id,edge.to];b.pi=1;b.goal=edge.to;
   f.updateNativeClimb(b,G,1/60); // Finish the unchanged source line screening.
   const original=G.physics.bodyFits;let calls=0;
   G.physics.bodyFits=function(p,r,l,h,skip,margin){calls++;assert.equal(r,PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale);assert.equal(l,PLAYER.stepUp);assert.equal(h,PLAYER.height);assert.equal(skip,false);assert.equal(margin,.003);return false;};
   try{assert(f.updateNativeClimb(b,G,1/60));assert.equal(q.intent.squid,true);assert.equal(calls,1);}finally{G.physics.bodyFits=original;}
   negativeResults.push({name:'human-body-query-refusal',scope:'Negative interface fault injection after authentic source line screening; no positive physical claim',calls,squidRetained:true});
  }
  {
   G.paint.splat(snapshot.pos.clone(),1,a.enemyTeam,{instant:true,seed:.375});
   const q=probeActor(),b=new f.BotBrain(q,'normal');b.path=[from.id,edge.to];b.pi=1;b.goal=edge.to;
   assert.equal(G.paint.sample(q.ground.face,q.ground.u,q.ground.v),a.enemyTeam+1);
   assert(f.updateNativeClimb(b,G,1/60));assert.equal(q.intent.squid,true);
   negativeResults.push({name:'enemy-source-floor',scope:'Seeded CPU ownership fixture on original source Floor00, not a weapon proof',owner:a.enemyTeam+1,squidRetained:true});
   G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});
  }
  const brain=a.bot=new f.BotBrain(a,'normal');brain.path=[from.id,edge.to];brain.pi=1;brain.goal=edge.to;brain.goalTimer=brain.repath=brain.bombCd=1000;
  const initialInk=a.ink;let recovered=false,kidRefillTicks=0,fireInputs=0;
  for(let i=0;i<180;i++){
   f.updateNativeClimb(brain,G,1/60);
   kidRefillTicks+=brain._nativeClimb?.phase==='refill'&&!a.intent.squid;
   fireInputs+=!!a.intent.fire;tick();recovered ||=a.ink>initialInk+1;
  }
  const expected=process.env.NATIVE_SHIPSHAPE_EXPECT_DRY_RECOVERY!=='0';
  assert.equal(recovered,expected,JSON.stringify({initialInk,endInk:a.ink,kidRefillTicks,fireInputs,phase:brain._nativeClimb?.phase}));
  if(expected)assert(kidRefillTicks>0);else assert.equal(kidRefillTicks,0);
  console.log(JSON.stringify({sourceSha256:L.manifest.sourceSha256,helperSha256,from:from.id,to:edge.to,sourceFloor:33518,firingStart:firingStart.toArray(),preparationSteps:preparation,approachSteps:approach,step:1/60,initialInk,endInk:a.ink,kidRefillTicks,fireInputs,recovered,expected,negativeResults,conditions:'Original source/production Character/Shooter/Actor/resources. Low ink comes from ordinary shots away from the stance, followed by ordinary grounded movement; controlled initial two-node source route, not a whole-map Game proof. Contact/lifecycle and physics-refusal negatives are separately scoped seeded unit contracts.'}));
 }finally{f.restoreRandom();}
});
