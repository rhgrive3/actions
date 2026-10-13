#!/usr/bin/env node
// Source-backed local route/rules measurement; human boarding is a separate
// Chromium input check. No source geometry or screenshots are written here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
import {nativeArenaBasis} from '../patches/native-stages/runtime/native-spawn.mjs';
import {nativeTowerClearance} from '../patches/native-stages/runtime/native-tower-clearance.mjs';
import {nativeTowerBoarding} from '../patches/native-stages/runtime/native-tower-boarding.mjs';
import {RankedEngine} from '../patches/splatoon3/runtime/ranked/engine.mjs';

const assets=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
assert(assets,'An integrity-checked prepared source catalog is required');
const ids=JSON.parse(fs.readFileSync(path.join(assets,'catalog.json'))).stages.map(s=>s.id);
const baselineMode=process.argv.includes('--baseline'),out=path.resolve(process.argv[2]),result={status:'running',baseline:baselineMode,stages:[],conditions:'actual source NavGraph/NativePhysics/capsule and production RankedEngine/TowerRule; controlled single-rider rule frames; physical boarding measured separately; local calibration, retail placements unverified'};
const previous=process.env.NATIVE_TOWER_CALIBRATION_BASELINE?JSON.parse(fs.readFileSync(process.env.NATIVE_TOWER_CALIBRATION_BASELINE)):null;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
for(const id of ids){
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,data=readStage(assets,id);
 G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new CpuPaint(null,G.level,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(G.level,G.physics);
 const stage=f.nativeRankedStage(G),t=stage.tower,basis=nativeArenaBasis(G.level),project=p=>(p[0]-basis.origin.x)*basis.forward.x+(p[2]-basis.origin.z)*basis.forward.z;
 const row={id,sourceSha256:data.manifest.sourceSha256,supported:t.supported,otherModesDigest:hash([stage.zones,stage.rainmaker,stage.clams]),version1130Verified:false};
 const prior=previous?.stages.find(s=>s.id===id);
 if(prior)assert.equal(row.otherModesDigest,prior.otherModesDigest,'all four other mode centers/objectives stay unchanged');
 if(!t.supported){row.availability=stage.ruleAvailability.tower;assert.throws(()=>f.nativeRankedStage(G,'tower'),e=>e.code==='NATIVE_TOWER_SOURCE_CLEARANCE_UNSUPPORTED');if(prior)assert.equal(prior.supported,false,'arc balancing cannot re-enable unsupported routes');result.stages.push(row);console.log(JSON.stringify(row));continue;}
 const arc=[0];for(let i=1;i<t.path.length;i++)arc.push(arc.at(-1)+Math.hypot(...t.path[i].map((v,k)=>v-t.path[i-1][k])));
 const total=arc.at(-1),lengths=[total-arc[t.centerIndex],arc[t.centerIndex]],spacing=Math.max(...arc.slice(1).map((v,i)=>v-arc[i]));
 Object.assign(row,{pathDigest:hash(t.path),nodes:t.path.length,centerIndex:t.centerIndex,center:t.path[t.centerIndex],arcLengthsByTeam:lengths,arcRatio:Math.max(...lengths)/Math.min(...lengths),waypointSpacingMax:spacing,endpointProjections:[project(t.path[0]),project(t.path.at(-1))],halfSize:t.halfSize,lift:t.localLift});
 assert(t.arenaSpan.bothHalvesVerified);assert(row.endpointProjections[0]<-t.arenaSpan.minimumHalfDepth&&row.endpointProjections[1]>t.arenaSpan.minimumHalfDepth);
 if(prior){assert.equal(row.pathDigest,prior.pathDigest,'all original cleared pathpoints/endpoints stay unchanged');assert.equal(row.halfSize,prior.halfSize);assert.equal(row.lift,prior.lift);row.before={centerIndex:prior.centerIndex,arcLengthsByTeam:prior.arcLengthsByTeam,arcRatio:prior.arcRatio,timings:prior.timings};}
 if(!baselineMode)assert(Math.abs(lengths[0]-lengths[1])<=spacing+1e-8,'existing waypoint is nearest to half total 3D route arc');
 const clear=nativeTowerClearance(G.level,PLAYER,t.halfSize),board=nativeTowerBoarding(G,G.nav.validIds,PLAYER,t.halfSize);
 for(const [i,p] of t.path.entries()){
  assert(clear.clear(p,t.path[Math.max(0,i-1)]),'full deck, pole, every rider edge capsule and swept segment remain source-clear');
  for(const x of [-t.halfSize,0,t.halfSize])for(const z of [-t.halfSize,0,t.halfSize])assert(G.physics.bodyFits(new THREE.Vector3(p[0]+x,p[1]+.01,p[2]+z),PLAYER.radius,.32,PLAYER.height));
  assert(board.find(G.nav.nearest(new THREE.Vector3(p[0],p[1]-t.localLift,p[2]),1.2),p),'every original waypoint retains a normal source run/jump boarding approach');
 }
 row.sourceClearance={...clear.metrics};row.sourceBoarding={...board.metrics};row.timings=[];
 for(const hz of [30,60,120])for(const team of [0,1]){
  const engine=new RankedEngine('tower',stage);let frames=0;
  while(engine.winner===null&&frames<hz*180){const rider={id:'controlled-rider',team,alive:true,grounded:true,pos:engine.rule.state.position.slice()};engine.update(1/hz,{actors:[rider],inputs:{}});frames++;}
  assert.equal(engine.winner,team);assert.equal(engine.reason,'knockout');
  row.timings.push({team,hz,elapsed:engine.elapsed,frames,counts:engine.counts.slice(),checkpointProgress:engine.rule.state.checkpointProgress.map(a=>a.slice()),checkpointCleared:engine.rule.state.checkpointCleared.map(a=>a.slice()),events:engine.events.filter(e=>e.kind.startsWith('checkpoint')||e.kind==='finish')});
 }
 if(!baselineMode)for(const hz of [30,60,120]){const times=row.timings.filter(r=>r.hz===hz).map(r=>r.elapsed);assert(Math.abs(times[0]-times[1])<=spacing/t.speed+2/hz,'rule outcome time discrepancy is bounded by existing source waypoint spacing');}
 result.stages.push(row);console.log(JSON.stringify({id,centerIndex:t.centerIndex,lengths,ratio:row.arcRatio,ko:row.timings.map(x=>[x.hz,x.team,x.elapsed])}));
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));
}
result.status='passed';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
