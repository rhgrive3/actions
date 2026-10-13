import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';

const root=process.env.NATIVE_RANKED_TRAVERSAL_FIXTURE_ASSETS;
const stages=root?JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))).stages.filter(s=>['manta','flounder'].includes(s.id)):[];
for(const definition of stages)test(definition.id+' production ranked bot wrapper preserves physical source transitions to rule-authored goals under a constructed CPU frame at 30/60/120Hz',async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(root,definition.id)),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}_pushQuad(){}_drawQuads(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(L,P);G.camera=new THREE.PerspectiveCamera();f.setRandom(()=>.5);
 f.installRankedBots({G,BotBrain:f.BotBrain,PLAYER});assert.ok(f.BotBrain.prototype._rankedBotWrapped);
 const stage=f.nativeRankedStage(G),cases=[];
 for(const mode of ['zones','rainmaker','clams'])for(const team of [0,1])for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();G.actors=[];
  const match=G.match=new f.Match({mode,difficulty:'normal',duration:300});assert.equal(match.mode,mode);match.state='playing';match.ranked=new f.RankedEngine(mode,stage);
  const a=new f.Actor({team,slot:0,name:'ranked source',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.isBot=true;a.spawnAt(L.spawnPads[team],team?Math.PI:0);a.invuln=0;G.actors=[a];match.actors=[a];a.bot=new f.BotBrain(a,'normal');
  let seconds=0,fire=false,traversalFrames=0,goal=null;
  for(let frame=0;frame<hz*90;frame++){
   match.ranked.frame={actors:[{id:team+':0',team,slot:0,pos:a.pos.toArray(),alive:a.alive,grounded:a.grounded}],inputs:{}};
   G.time+=1/hz;a.bot.update(1/hz);fire ||=a.intent.fire;traversalFrames+=!!a.bot._nativeTraversalHandled;a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);seconds=(frame+1)/hz;goal=a.bot._rankedGoalPos;
   if(goal&&a.grounded&&Math.hypot(goal.x-a.pos.x,goal.z-a.pos.z)<1&&Math.abs(goal.y-a.pos.y)<.2)break;
  }
  assert.ok(goal&&a.alive&&a.grounded&&Math.hypot(goal.x-a.pos.x,goal.z-a.pos.z)<1&&Math.abs(goal.y-a.pos.y)<.2,'real rule objective/controller travel '+JSON.stringify({id:definition.id,mode,team,hz,seconds,goal,end:a.pos.toArray(),fire,traversalFrames}));
  const source=L.triangleWorld.ray(a.pos.clone().setY(a.pos.y+.1),new THREE.Vector3(0,-1,0),.3,{minNormalY:.68});assert.ok(source&&(source.flags&2));assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);
  cases.push({mode,team,hz,seconds,sourcePad:L.spawnPads[team].toArray(),goal,end:a.pos.toArray(),sourceTriangle:source.triangle,weapon:'shooter / Shooter_Normal_00',gearAP:0,traversalFrames,actualWeaponPaint:fire,actualRankedRule:true,constructedFrameOmitsLiveBlockedCallback:true,actualInstalledRankedWrapper:true,grounded:true});
 }
 assert.ok(cases.some(c=>c.traversalFrames>0&&c.actualWeaponPaint),'the actual rule paths must exercise native physical ownership and real weapon painting');
 console.log(JSON.stringify({id:definition.id,sourceSha256:L.manifest.sourceSha256,cases,conditions:'Actual Match/RankedEngine/rule botGoal/installed wrapper/Actor/production Character muzzle/WeaponRunner/Projectiles; constructed CPU frame omits real RankedWorld blocked callback, so these are controller routes to rule-authored goals, not complete production objective-selection proof; empty initial ink; fixed RNG before Actor and Brain; 0AP; CPU paint GPU draw only is disabled; nearby Clam collection can legitimately require no wall painting'}));
});

const dropRoot=process.env.NATIVE_RANKED_DROP_FIXTURE_ASSETS;
test('accepted source drops keep ordinary input through the production ranked wrapper',{skip:!dropRoot},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,data=readStage(dropRoot,'humpback');data.manifest.sourceNavigation={wallClimb:true,highDrops:true};
 const L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}_pushQuad(){}_drawQuads(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});const N=G.nav=new f.NavGraph(L,P);G.camera=new THREE.PerspectiveCamera();f.setRandom(()=>.5);f.installRankedBots({G,BotBrain:f.BotBrain,PLAYER});
 const from=N.nodes[18734],edge=from.nb.find(e=>e.drop&&e.drop.direction[2]<-.99&&Math.abs(e.drop.landing[1])<.01);assert.ok(edge);const stage=f.nativeRankedStage(G),cases=[];
 for(const mode of ['zones','rainmaker','clams'])for(const hz of [30,60,120]){
  G.projectiles.clear();G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.actors=[];const match=G.match=new f.Match({mode,difficulty:'normal'});match.state='playing';match.ranked=new f.RankedEngine(mode,stage);
  const a=new f.Actor({team:1,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.isBot=true;a.spawnAt(new THREE.Vector3(...edge.drop.upper),Math.PI);G.actors=match.actors=[a];const b=a.bot=new f.BotBrain(a,'normal'),goal=new THREE.Vector3(...edge.drop.landing);assert.ok(b._pathTo(goal,.6));b.goalTimer=b.repath=b.bombCd=1000;let handled=0,airborne=false;
  for(let i=0;i<hz*6;i++){
   match.ranked.frame={actors:[{id:'1:0',team:1,slot:0,pos:a.pos.toArray(),alive:a.alive,grounded:a.grounded}],inputs:{}};G.time+=1/hz;b.update(1/hz);
   if(b._nativeTraversalHandled){handled++;assert.equal(a.intent.squid,false);assert.equal(a.intent.jump,false);assert.equal(a.intent.fire,false);}
   a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);airborne ||=!a.grounded;if(airborne&&a.grounded&&a.pos.distanceTo(goal)<.45)break;
  }
  assert.ok(handled>0&&airborne&&a.alive&&a.grounded&&a.pos.distanceTo(goal)<.45,JSON.stringify({mode,hz,handled,end:a.pos.toArray(),goal:goal.toArray()}));assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);assert.equal(a.s3JumpSerial||0,0);cases.push({mode,hz,handledFrames:handled,end:a.pos.toArray(),grounded:true,ordinaryKidMoveGravity:true,productionCharacter:true,gearAP:0});
 }
 console.log(JSON.stringify({id:'humpback',cases,scope:'Actual source drop input preservation through installed ranked wrapper; controlled valid source path, constructed CPU frame omits live blocked callback; no whole objective selection or score claim'}));
});
