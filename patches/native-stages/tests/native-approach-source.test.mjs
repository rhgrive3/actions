import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';

const root=process.env.NATIVE_APPROACH_FIXTURE_ASSETS;
const available=root&&fs.existsSync(path.join(root,'bluefin','manifest.json'));

test('Bluefin ordinary source bots traverse both original upper banks at the production 60Hz kernel',{skip:!available},async()=>{
 const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f,data=readStage(root,'bluefin'),L=G.level=new f.NativeLevel({...data,manifest:{...data.manifest,sourceNavigation:{...data.manifest.sourceNavigation,wallApproach:true}}}),P=G.physics=new f.NativePhysics(L);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 const reset=()=>{G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();};
 reset();G.match.mode='turf';G.match.opts={};G.camera=new THREE.PerspectiveCamera();
 assert.equal(L.manifest.sourceNavigation?.wallClimb,true);
 assert.deepEqual(Array.from(L.spawnPads,p=>Array.from(p.toArray())),[[-12,15,-70],[12,15,70]]);
 const started=performance.now(),N=G.nav=new f.NavGraph(L,P),banks=[],clearance=f.nativeDropClearance(L);
 f.setRandom(()=>.5);
 try{
  for(const team of [0,1]){
   const sign=team?-1:1,requested=new THREE.Vector3(20*sign,9,40*sign),goalId=N.nearest(requested,1.2),node=N.nodes[goalId];
   assert(node&&Math.abs(node.y-9)<.1&&Math.abs(node.z)>39&&Math.sign(node.z)===sign,'goal remains the genuine opposing Y9 bank, not a lower or same-bank substitute');
   const goal=new THREE.Vector3(node.x,node.y,node.z),support=P.raycast(goal.clone().add(new THREE.Vector3(0,.3,0)),new THREE.Vector3(0,-1,0),.6);
   assert(support.hit&&support.normal.y>.68&&support.point.distanceTo(goal)<.01);
   assert(P.bodyFits(goal.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height));
   const route=N.path(N.nativeSpawnNodeIds[team],goalId,team,Math.max(6000,N.nodes.length*4));assert(route?.length,'original upper pad has a directed opposing-bank path');
   const edges=route.slice(1).map((to,i)=>N.nodes[route[i]].nb.find(e=>e.to===to)),climbs=edges.filter(e=>e.type==='climb'),drops=edges.filter(e=>e.type==='drop');
   assert(climbs.length&&drops.length,'opposing route genuinely traverses source drops and walls');
   for(const hz of [60]){
    reset();const actor=new f.Actor({team,name:'source bank bot',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});actor.isBot=true;actor.spawnAt(L.spawnPads[team],team?Math.PI:0);actor.invuln=0;G.actors=[actor];
    const brain=actor.bot=new f.BotBrain(actor,'normal');assert(brain._pathTo(goal,.6));brain.goalTimer=brain.repath=brain.bombCd=1000;
    let climbed=false,fire=false,seconds=0,replans=0,transientPathMisses=0,minimumY=actor.pos.y,capsuleSamples=0; const probes={count:0,minY:Infinity,maxY:-Infinity,bounds:[]},climbUpdate=actor._updateClimb; actor._updateClimb=function(dt,squid,...rest){ const c=brain._nativeApproach?.edge.climb,was=this.climbing; let hits=[]; if(c?.kind==='approach'&&squid&&this.climbExit<=dt){const direction=was?this.wallN.clone().negate().setY(0):this.intent.move.clone().setY(0);if(direction.length()>=.2||was){direction.normalize();hits=[.3,.85].map((lift,i)=>P.raycast(this.pos.clone().setY(this.pos.y+lift),direction,PLAYER.radius+(i?.45:.35)));}} const result=climbUpdate.call(this,dt,squid,...rest); if(c?.kind==='approach'&&(was||this.climbing))for(const h of hits){if(!h.hit||Math.abs(h.normal.y)>=.5)continue; const face=L.faces[h.face];assert(h.triangle>=0&&h.block>=0&&h.block<L.staticBlockCount&&face?.wall&&L.containsOnFace(face,h.point),'actual required wall ray retains original static paintable source role'); const i=Math.max(0,Math.min(face.nu-1,Math.floor(h.u/face.cu))),j=Math.max(0,Math.min(face.nv-1,Math.floor(h.v/face.cv)));assert(L.mask[face.grid+j*face.nu+i]&&G.paint.sample(h.face,h.u,h.v)===this.team+1,'actual required source attachment/cap ray naturally owned'); assert(h.point.y>=c.paintMinY-1e-6&&h.point.y<=c.wallProbeMaxY+1e-6,'actual SQ source ray within qualified paint/contact bounds');probes.count++;probes.minY=Math.min(probes.minY,h.point.y);probes.maxY=Math.max(probes.maxY,h.point.y);if(!probes.bounds.some(b=>b.from===c.lower.join(',')))probes.bounds.push({from:c.lower.join(','),paintMinY:c.paintMinY,wallProbeMaxY:c.wallProbeMaxY,sourceRoleIntervalSamples:c.sourceRoleIntervalSamples,requiredPaintSamples:c.samples.length});} return result;};
    for(let frame=0;frame<hz*120;frame++){
     if(brain.mode==='paint'&&(!brain.path||brain.goal!==goalId)){if(!brain._pathTo(goal,.6))transientPathMisses++;brain.goalTimer=brain.repath=1000;replans++;}
     G.time+=1/hz;brain.update(1/hz);fire ||=actor.intent.fire;const previous=actor.pos.clone();actor.update(1/hz);
     const squid=actor.form==='squid',raw=squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw,radius=Number.isFinite(raw)&&Number.isFinite(PLAYER.s3TerrainDistanceScale)?raw*PLAYER.s3TerrainDistanceScale:PLAYER.radius;
     assert(clearance.clear(previous,actor.pos,radius,squid?PLAYER.squidBodyLift:PLAYER.stepUp,squid?PLAYER.squidHeight:PLAYER.height,squid),'continuous actual source bank capsule '+JSON.stringify({team,hz,frame,from:previous.toArray(),to:actor.pos.toArray(),form:actor.form}));capsuleSamples++;
     G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);climbed ||=actor.climbing;minimumY=Math.min(minimumY,actor.pos.y);seconds=(frame+1)/hz;
     if(!actor.alive||actor.grounded&&actor.pos.distanceTo(goal)<1.5&&f.nativeSourceFootSupported(G,actor,node))break;
    }
    assert(actor.alive&&actor.grounded&&actor.pos.distanceTo(goal)<1.5&&f.nativeSourceFootSupported(G,actor,node)&&climbed&&fire,'existing bot physically reaches genuine opposite upper bank '+JSON.stringify({team,hz,seconds,goal:goal.toArray(),pos:actor.pos.toArray(),distance:actor.pos.distanceTo(goal),climbed,fire,alive:actor.alive,grounded:actor.grounded,form:actor.form,ink:actor.ink,mode:brain.mode,pi:brain.pi,activePath:brain.path?.slice(Math.max(0,brain.pi-1),brain.pi+2),phase:brain._nativeApproach?.phase||brain._nativeClimb?.phase,approach:brain._nativeApproach&&{kind:brain._nativeApproach.edge.climb.kind,from:brain._nativeApproach.edge.climb.lower,to:brain._nativeApproach.edge.climb.upper},velocity:actor.vel.toArray(),aim:actor.aimPoint.toArray(),replans}));
    assert.deepEqual(Object.keys(actor.s3.abilityPoints),[]);
    banks.push({team,hz,seconds,replans,transientPathMisses,waypoints:route.length,sourceClimbs:climbs.length,sourceDrops:drops.length,start:Array.from(L.spawnPads[team].toArray()),goal:Array.from(goal.toArray()),end:Array.from(actor.pos.toArray()),sourceGoalTriangle:support.triangle,minimumY,distanceToGoal:actor.pos.distanceTo(goal),alive:true,grounded:true,sourceFootSupported:true,continuousActualCapsuleSamples:capsuleSamples,continuousActualCapsuleFailures:0,approachSourceProbes:probes.count?probes:null,weapon:'shooter / Shooter_Normal_00',sourceWeapon:actor.weapon.sourceMainActor,gearAP:0,initialPaint:'unpainted',actualBrainActorWeaponProjectilesPaintClock:true});
    console.log(JSON.stringify({sourceBankBot:banks.at(-1)}));
   }
  }
 }finally{f.restoreRandom();}
 console.log(JSON.stringify({id:'bluefin',sourceSha256:L.manifest.sourceSha256,version1130Verified:false,candidateNodes:N.nodes.length,validNodes:N.validIds.length,verificationMilliseconds:performance.now()-started,banks,conditions:'production 1/60 Actor/Brain kernel and Character muzzle; render cadence is independently checked in real Game Chromium; CPU VM optional source motion unavailable; source-supported initial poses only; no later Actor pose, velocity or ink assignment; goal reacquired after normal recovery; one isolated CPU actor; 0.5 RNG; no retail physics or hardware claim'}));
});
