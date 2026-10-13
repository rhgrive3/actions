import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';

const root=process.env.NATIVE_RANKED_TRAVERSAL_FIXTURE_ASSETS;
const stages=root?JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))).stages.filter(s=>['manta','flounder'].includes(s.id)):[];
for(const definition of stages)test(definition.id+' production ranked bot wrapper preserves physical source transitions and reaches actual rule objectives at 30/60/120Hz',async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(root,definition.id)),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}_pushQuad(){}_drawQuads(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(L,P);G.camera=new THREE.PerspectiveCamera();f.setRandom(()=>.5);
 f.installRankedBots({G,BotBrain:f.BotBrain,PLAYER});assert.ok(f.BotBrain.prototype._rankedBotWrapped);
 const stage=f.nativeRankedStage(G),cases=[];
 for(const mode of ['zones','rainmaker','clams'])for(const team of [0,1])for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();G.actors=[];
  const match=G.match=new f.Match({mode,difficulty:'normal',duration:300});assert.equal(match.mode,mode);match.state='playing';match.ranked=new f.RankedEngine(mode,stage);
  const a=f.make('shooter');a.team=team;a.slot=0;a.isBot=true;a._integrate=f.Actor.prototype._integrate;a._spawnBarrier=f.Actor.prototype._spawnBarrier;a.spawnAt(L.spawnPads[team],team?Math.PI:0);a.invuln=0;G.actors=[a];match.actors=[a];a.bot=new f.BotBrain(a,'normal');
  let seconds=0,fire=false,traversalFrames=0,goal=null;
  for(let frame=0;frame<hz*90;frame++){
   match.ranked.frame={actors:[{id:team+':0',team,slot:0,pos:a.pos.toArray(),alive:a.alive,grounded:a.grounded}],inputs:{}};
   G.time+=1/hz;a.bot.update(1/hz);fire ||=a.intent.fire;traversalFrames+=!!a.bot._nativeTraversalHandled;a.character.root.position.copy(a.pos);a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);seconds=(frame+1)/hz;goal=a.bot._rankedGoalPos;
   if(goal&&a.grounded&&Math.hypot(goal.x-a.pos.x,goal.z-a.pos.z)<1&&Math.abs(goal.y-a.pos.y)<.2)break;
  }
  assert.ok(goal&&a.alive&&a.grounded&&Math.hypot(goal.x-a.pos.x,goal.z-a.pos.z)<1&&Math.abs(goal.y-a.pos.y)<.2&&fire&&traversalFrames>0,'real rule objective/controller travel '+JSON.stringify({id:definition.id,mode,team,hz,seconds,goal,end:a.pos.toArray(),fire,traversalFrames}));
  const source=L.triangleWorld.ray(a.pos.clone().setY(a.pos.y+.1),new THREE.Vector3(0,-1,0),.3,{minNormalY:.68});assert.ok(source&&(source.flags&2));assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);
  cases.push({mode,team,hz,seconds,sourcePad:L.spawnPads[team].toArray(),goal,end:a.pos.toArray(),sourceTriangle:source.triangle,weapon:'shooter / Shooter_Normal_00',gearAP:0,traversalFrames,actualRankedRule:true,actualInstalledRankedWrapper:true,grounded:true});
 }
 console.log(JSON.stringify({id:definition.id,sourceSha256:L.manifest.sourceSha256,cases,conditions:'Actual Match/RankedEngine/rule botGoal/installed wrapper/Actor/WeaponRunner/Projectiles; empty initial ink; fixed RNG before Actor and Brain; 0AP; CPU rendering stub only'}));
});
