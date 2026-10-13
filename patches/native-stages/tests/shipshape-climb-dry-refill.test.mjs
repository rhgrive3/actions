import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
 const N=G.nav=new f.NavGraph(L,G.physics),from=N.nodes[16843];
 const edge=from.nb.find(e=>e.to===16578&&e.type==='climb'&&!e.climb.kind);
 assert(edge,'the recorded failure is a genuine plain source wall edge');
 const c=edge.climb,a=new f.Actor({team:1,name:'dry source stance',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 G.actors=[a];G.camera=new THREE.PerspectiveCamera();a.isBot=true;
 a.spawnAt(new THREE.Vector3(...c.paintStance),Math.PI);a.invuln=0;
 const tick=()=>{G.time+=1/60;a.update(1/60);G.projectiles.update(1/60);G.paint.advanceSimulation(1/60);};
 f.setRandom(()=>.5);
 try{
  for(let i=0;i<36;i++)tick();
  const normal=new THREE.Vector3(...c.normal);
  a.aimYaw=Math.atan2(normal.x,normal.z);a.aimPitch=.3;
  a.aimPoint.copy(a.pos).add(new THREE.Vector3(0,8,0)).addScaledVector(normal,20);
  a.intent.fire=true;
  let preparation=0;
  while(a.ink>8&&preparation++<1200)tick();
  a.intent.fire=false;for(let i=0;i<12;i++)tick();
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
  console.log(JSON.stringify({sourceSha256:L.manifest.sourceSha256,from:from.id,to:edge.to,sourceFloor:33518,preparationSteps:preparation,step:1/60,initialInk,endInk:a.ink,kidRefillTicks,fireInputs,recovered,expected,conditions:'Original source/production Character/Shooter/Actor/resources. Low ink comes from ordinary shots; controlled initial two-node source route, not a whole-map Game proof.'}));
 }finally{f.restoreRandom();}
});
