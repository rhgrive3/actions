import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture,readStage} from '/workspace/stage-worktrees/bluefin/patches/native-stages/tests/fixture.mjs';

const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const available=root&&fs.existsSync(path.join(root,'bluefin','manifest.json'));

test('Bluefin ordinary source bots traverse the negative original upper bank (private one-bank scope) at 30/60/120Hz',{skip:!available},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage(root,'bluefin')),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 const reset=()=>{G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();};
 reset();G.match.mode='turf';G.match.opts={};G.camera=new THREE.PerspectiveCamera();
 assert.equal(L.manifest.sourceNavigation?.wallClimb,true);
 assert.deepEqual(Array.from(L.spawnPads,p=>Array.from(p.toArray())),[[-12,15,-70],[12,15,70]]);
 const started=performance.now(),N=G.nav=new f.NavGraph(L,P),banks=[],clearance=f.nativeDropClearance(L);
 f.setRandom(()=>.5);
 try{
  for(const team of [1]){
   const sign=team?-1:1,requested=new THREE.Vector3(20*sign,9,40*sign),goalId=N.nearest(requested,1.2),node=N.nodes[goalId];
   assert(node&&Math.abs(node.y-9)<.1&&Math.abs(node.z)>39&&Math.sign(node.z)===sign,'goal remains the genuine opposing Y9 bank, not a lower or same-bank substitute');
   const goal=new THREE.Vector3(node.x,node.y,node.z),support=P.raycast(goal.clone().add(new THREE.Vector3(0,.3,0)),new THREE.Vector3(0,-1,0),.6);
   assert(support.hit&&support.normal.y>.68&&support.point.distanceTo(goal)<.01);
   assert(P.bodyFits(goal.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height));
   const route=N.path(N.nativeSpawnNodeIds[team],goalId,team,Math.max(6000,N.nodes.length*4));assert(route?.length,'original upper pad has a directed opposing-bank path');
   const edges=route.slice(1).map((to,i)=>N.nodes[route[i]].nb.find(e=>e.to===to)),climbs=edges.filter(e=>e.type==='climb'),drops=edges.filter(e=>e.type==='drop');
   assert(climbs.length&&drops.length,'opposing route genuinely traverses source drops and walls');
   for(const hz of [30,60,120]){
    reset();const actor=new f.Actor({team,name:'source bank bot',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});actor.isBot=true;actor.spawnAt(L.spawnPads[team],team?Math.PI:0);actor.invuln=0;G.actors=[actor];
    const brain=actor.bot=new f.BotBrain(actor,'normal');assert(brain._pathTo(goal,.6));brain.goalTimer=brain.repath=brain.bombCd=1000;
    let climbed=false,fire=false,seconds=0,replans=0,transientPathMisses=0,minimumY=actor.pos.y,capsuleSamples=0;
    for(let frame=0;frame<hz*120;frame++){
     if(brain.mode==='paint'&&(!brain.path||brain.goal!==goalId)){if(!brain._pathTo(goal,.6))transientPathMisses++;brain.goalTimer=brain.repath=1000;replans++;}
     G.time+=1/hz;brain.update(1/hz);fire ||=actor.intent.fire;const previous=actor.pos.clone();actor.update(1/hz);
     const squid=actor.form==='squid',raw=squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw,radius=Number.isFinite(raw)&&Number.isFinite(PLAYER.s3TerrainDistanceScale)?raw*PLAYER.s3TerrainDistanceScale:PLAYER.radius;
     assert(clearance.clear(previous,actor.pos,radius,squid?PLAYER.squidBodyLift:PLAYER.stepUp,squid?PLAYER.squidHeight:PLAYER.height,squid),'continuous actual source bank capsule '+JSON.stringify({team,hz,frame,from:previous.toArray(),to:actor.pos.toArray(),form:actor.form}));capsuleSamples++;
     G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);climbed ||=actor.climbing;minimumY=Math.min(minimumY,actor.pos.y);seconds=(frame+1)/hz;
     if(!actor.alive||actor.grounded&&actor.pos.distanceTo(goal)<1.5&&f.nativeSourceFootSupported(G,actor,node))break;
    }
    assert(actor.alive&&actor.grounded&&actor.pos.distanceTo(goal)<1.5&&f.nativeSourceFootSupported(G,actor,node)&&climbed&&fire,'existing bot physically reaches genuine opposite upper bank '+JSON.stringify({team,hz,seconds,goal:goal.toArray(),pos:actor.pos.toArray(),distance:actor.pos.distanceTo(goal),climbed,fire,alive:actor.alive,grounded:actor.grounded,form:actor.form,ink:actor.ink,mode:brain.mode,pi:brain.pi,path:brain.path?.slice(brain.pi,brain.pi+2),phase:brain._nativeClimb?.phase,replans}));
    assert.deepEqual(Object.keys(actor.s3.abilityPoints),[]);
    banks.push({team,hz,seconds,replans,transientPathMisses,waypoints:route.length,sourceClimbs:climbs.length,sourceDrops:drops.length,start:Array.from(L.spawnPads[team].toArray()),goal:Array.from(goal.toArray()),end:Array.from(actor.pos.toArray()),sourceGoalTriangle:support.triangle,minimumY,distanceToGoal:actor.pos.distanceTo(goal),alive:true,grounded:true,sourceFootSupported:true,continuousActualCapsuleSamples:capsuleSamples,continuousActualCapsuleFailures:0,weapon:'shooter / Shooter_Normal_00',sourceWeapon:actor.weapon.sourceMainActor,gearAP:0,initialPaint:'unpainted',actualBrainActorWeaponProjectilesPaintClock:true});
    console.log(JSON.stringify({sourceBankBot:banks.at(-1)}));
   }
  }
 }finally{f.restoreRandom();}
 console.log(JSON.stringify({id:'bluefin',sourceSha256:L.manifest.sourceSha256,version1130Verified:false,candidateNodes:N.nodes.length,validNodes:N.validIds.length,verificationMilliseconds:performance.now()-started,banks,conditions:'production Actor integration/frame finishing and Character muzzle; CPU VM optional source motion unavailable; source-supported initial poses only; no later Actor pose, velocity or ink assignment; goal reacquired after normal recovery; one isolated CPU actor; 0.5 RNG; no retail physics or hardware claim'}));
});
