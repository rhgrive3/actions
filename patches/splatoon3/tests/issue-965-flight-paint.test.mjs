import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture} from './batch03-fixture.mjs';
import {configureBlasterFlightPaint,paintBlasterFlight,blasterFlightPaintSpec,advanceSplashDrops,splashDepthScale,splashStretch} from '../runtime/blaster-flight-paint.mjs';
// PR1188: scheduled splashes fall before they paint. Settle them on the
// fixture's real floor at the fixed 60 Hz reference step.
function settle(f,maxFrames=300){let n=0;while((f.G.projectiles._s3SplashDrops||[]).length&&n<maxFrames){advanceSplashDrops(f.G.projectiles,1/60,f.G);n++;}return n;}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup(){const f=await batchFixture(),a=f.make('blaster');a.isLocal=true;f.G.camera=new f.THREE.PerspectiveCamera();a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);f.G.projectiles.fireBlaster(a,a.weapon,0);f.G.projectiles.list[0].seed=.5;return {...f,a,p:f.G.projectiles.list[0]};}
test('#965 live Blaster receives pinned schedule, seven stamps and no legacy trail',async()=>{
 const f=await setup(),{p}=f,s=p.s3BlasterFlightPaint;assert.ok(s);assert.equal(p.trailEvery,0);
 const {first,spacing,count,width,nearestWidth,depthScaleMax,depthScaleMin,dropHeightMax,dropHeightMin,gravity}=s.spec;
 assert.deepEqual({first,spacing,count,width,nearestWidth,depthScaleMax,depthScaleMin,dropHeightMax,dropHeightMin},
  {first:.5,spacing:1.5,count:7,width:1.62,nearestWidth:2.43,depthScaleMax:1.2,depthScaleMin:1,dropHeightMax:3,dropHeightMin:10});
 close(gravity,.016*3600);close(s.spec.drag,.02);
 p.pos.copy(s.last).add(new f.THREE.Vector3(0,0,20));paintBlasterFlight(f.G,p);
 assert.equal(f.paint.length,0,'splashes fall before they paint');assert.equal(f.G.projectiles._s3SplashDrops.length,7);
 settle(f);assert.equal(f.paint.length,7);
 const landed=f.G.projectiles._s3SplashLandings;assert.equal(landed.length,7);
 assert.deepEqual(landed.map(l=>+(l.releaseZ-p.start.z).toFixed(8)).sort((a,b)=>a-b),[.5,2,3.5,5,6.5,8,9.5]);
 f.paint.forEach((e,i)=>{const l=landed[i],depth=splashDepthScale(s.spec,l.height),r=Math.abs(l.releaseZ-p.start.z-.5)<1e-9?2.43:1.62,{amount,centreBack}=splashStretch(depth,r);
  close(e.point.z,l.z-centreBack);close(e.radius,r);close(e.opts.stretchAmt,amount);close(e.point.y,.005);assert.equal(e.opts.face,l.face);});
 paintBlasterFlight(f.G,p);settle(f);assert.equal(f.paint.length,7);
});
test('#965 30/60/120Hz distance sampling is identical, ghost/remote/special never paint',async()=>{
 const snapshots=[];for(const hz of [30,60,120]){const f=await setup(),start=f.p.pos.clone();for(let n=1;n<=hz;n++){f.p.pos.copy(start).add(new f.THREE.Vector3(0,0,12*n/hz));paintBlasterFlight(f.G,f.p);advanceSplashDrops(f.G.projectiles,1/hz,f.G);}settle(f);snapshots.push(f.paint.map(e=>[+e.point.z.toFixed(8),e.radius,e.opts.seed,+e.opts.stretchAmt.toFixed(8)]));}assert.equal(snapshots[0].length,7);assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
 for(const mode of ['ghost','remote','special']){const f=await setup();if(mode==='remote')f.a.remote=true;else if(mode==='special')f.p.s3SpecialWeapon={};else f.p.ghost=true;f.p.pos.z+=20;paintBlasterFlight(f.G,f.p);settle(f);assert.equal(f.paint.length,0);assert.equal((f.G.projectiles._s3SplashDrops||[]).length,0);}
});
test('#965 production collision solver truncates at terrain, actor and boss; reused objects clear schedule',async()=>{
 for(const kind of ['terrain','actor','boss']){
  const f=await setup(),{p}=f,start=p.start.clone();p.prev.copy(start);p.pos.copy(start).add(new f.THREE.Vector3(0,0,5));p.age=.05;
  f.G.physics.level=null;f.G.physics.segment=(from,to,hit)=>{hit.hit=kind==='terrain';if(hit.hit){hit.point.copy(start).add(new f.THREE.Vector3(0,0,1));hit.normal.set(0,0,-1);hit.dist=1;}return hit;};
  if(kind==='boss')f.G.boss={segHit:()=>({point:start.clone().add(new f.THREE.Vector3(0,0,1)),dist:1})};
  if(kind==='actor'){const e=f.make('shooter');e.team=1;e.pos.copy(start).add(new f.THREE.Vector3(0,-1.05,1.7));f.G.actors=[e];}
  f.fidelityProjectileTargets(f.G.projectiles,p);const released=(f.G.projectiles._s3SplashDrops||[]).map(d=>d.pos.z-start.z);
  assert.ok(released.length<=1,kind);assert.ok(released.every(z=>z<1.8),kind);
  f.G.projectiles.pool.push(p);const recycled=f.G.projectiles._new();assert.equal(recycled,p);assert.equal(recycled.s3BlasterFlightPaint,null);
 }
});
test('#965 invalid schedules fail closed and source scaling is explicit',()=>{
 const raw={SplashSpawnParam:{SpawnNearestLength:.5,SpawnBetweenLength:1.5,SpawnNum:7,SplitNum:1},SplashPaintParam:{WidthHalf:1.62,WidthHalfNearest:2.43},MoveParam:{FreeGravity:.016}};
 assert.throws(()=>blasterFlightPaintSpec({...raw,MoveParam:{}}),RangeError,'the fall needs the sourced FreeGravity');
 assert.equal(blasterFlightPaintSpec(raw,2).spacing,3);assert.throws(()=>blasterFlightPaintSpec({...raw,SplashSpawnParam:{...raw.SplashSpawnParam,SplitNum:2}}),RangeError);
});
