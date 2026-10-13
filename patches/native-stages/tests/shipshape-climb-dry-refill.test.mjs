import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';

const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
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
  console.log(JSON.stringify({sourceSha256:L.manifest.sourceSha256,helperSha256,from:from.id,to:edge.to,sourceFloor:33518,firingStart:firingStart.toArray(),preparationSteps:preparation,approachSteps:approach,step:1/60,initialInk,endInk:a.ink,kidRefillTicks,fireInputs,recovered,expected,conditions:'Original source/production Character/Shooter/Actor/resources. Low ink comes from ordinary shots away from the stance, followed by ordinary grounded movement; controlled initial two-node source route, not a whole-map Game proof.'}));
 }finally{f.restoreRandom();}
});
