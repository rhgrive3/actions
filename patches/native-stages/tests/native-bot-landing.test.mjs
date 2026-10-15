import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {nativeFixture,readStage} from './fixture.mjs';
const root=process.env.INKWAVE_NATIVE_STAGE_ASSETS,ids=root?JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))).stages.map(s=>s.id):['scorch','hagglefish','inkblot','mako','brinewater'];
// Reuse the installed VM, while resetting every live world owner per stage.
// A separate full catalogue VM per case retains gigabytes under node:test.
let runtime;const loadRuntime=()=>runtime??=nativeFixture();
for(const id of ids)test('source bot launch retains an actual directed objective route after touchdown: '+id,{skip:!root},async()=>{
 const f=await loadRuntime(),{G,THREE}=f,data=readStage(root,id);G.actors.length=0;G.time=0;G.projectiles.clear();G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,G.level,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(G.level,G.physics);G.match.mode='turf';G.match.opts={};
 const stage=f.nativeRankedStage(G),targets=[stage.zones[0].center,stage.rainmaker.center,...stage.rainmaker.goals,...stage.rainmaker.checkpoints.flat(),...stage.clams.spawns,...stage.clams.goals],cases=[];
 for(const team of [0,1])for(const hz of [30,60,120])for(let slot=0;slot<4;slot++){
  const actor=f.make('shooter');actor.team=team;actor.slot=slot;actor.isBot=true;actor._integrate=f.Actor.prototype._integrate;
  assert.equal(f.beginInitialSquidSpawn(actor),true);assert.equal(actor.s3.squidSpawn.phase,'flight');const target={...actor.s3.squidSpawn.target};
  const selected=G.nav.nearest(new THREE.Vector3(target.x,target.y,target.z),1.2);assert.ok(Math.abs(G.nav.nodes[selected].y-target.y)<=.5,'selected source layer, not an arbitrary topmost roof');
  let frames=0;while(actor.s3.squidSpawn&&frames<hz*3){G.time+=1/hz;actor.update(1/hz);frames++;}
  assert.equal(actor.s3.squidSpawn,undefined);assert.ok(actor.alive&&actor.grounded&&actor.ground.hit);
  const landing=G.nav.nearest(actor.pos,1.2);assert.ok(G.nav.valid[landing]);
  for(const target of targets){const goal=G.nav.nearest(new THREE.Vector3(...target),1.2);assert.ok(G.nav.path(landing,goal,team,50000),`team${team} slot${slot} ${hz}Hz has a post-launch source objective route`);}
  cases.push({team,hz,slot,target,landingNode:landing,selectedNode:selected,landingSeconds:frames/hz,reachableObjectives:targets.length});
 }
 const report={id,cases:cases.length,maximumLandingSeconds:Math.max(...cases.map(c=>c.landingSeconds)),minimumObjectiveRoutes:Math.min(...cases.map(c=>c.reachableObjectives)),sourceSha256:data.manifest.sourceSha256,version1130Verified:false};
 if(process.env.NATIVE_BOT_LANDING_EVIDENCE){const file=process.env.NATIVE_BOT_LANDING_EVIDENCE,previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];previous.push(report);fs.writeFileSync(file,JSON.stringify(previous,null,2)+'\n');}
 console.log(JSON.stringify(report));
});
