import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture} from './batch03-fixture.mjs';
import {configureBlasterFlightPaint,paintBlasterFlight,blasterFlightPaintSpec} from '../runtime/blaster-flight-paint.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup(){const f=await batchFixture(),a=f.make('blaster');a.isLocal=true;f.G.camera=new f.THREE.PerspectiveCamera();a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);f.G.projectiles.fireBlaster(a,a.weapon,0);f.G.projectiles.list[0].seed=.5;return {...f,a,p:f.G.projectiles.list[0]};}
test('#965 live Blaster receives pinned schedule, seven stamps and no legacy trail',async()=>{
 const f=await setup(),{p}=f,s=p.s3BlasterFlightPaint;assert.ok(s);assert.equal(p.trailEvery,0);
 assert.deepEqual({...s.spec},{first:.5,spacing:1.5,count:7,width:1.62,nearestWidth:2.43});
 p.pos.copy(s.last).add(new f.THREE.Vector3(0,0,20));paintBlasterFlight(f.G,p);
 assert.equal(f.paint.length,7);f.paint.forEach((e,i)=>{close(e.point.z-p.start.z,.5+i*1.5);close(e.radius,i?1.62:2.43);});
 paintBlasterFlight(f.G,p);assert.equal(f.paint.length,7);
});
test('#965 30/60/120Hz distance sampling is identical, ghost/remote/special never paint',async()=>{
 const snapshots=[];for(const hz of [30,60,120]){const f=await setup(),start=f.p.pos.clone();for(let n=1;n<=hz;n++){f.p.pos.copy(start).add(new f.THREE.Vector3(0,0,12*n/hz));paintBlasterFlight(f.G,f.p);}snapshots.push(f.paint.map(e=>[+e.point.z.toFixed(8),e.radius,e.opts.seed]));}assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
 for(const mode of ['ghost','remote','special']){const f=await setup();if(mode==='remote')f.a.remote=true;else if(mode==='special')f.p.s3SpecialWeapon={};else f.p.ghost=true;f.p.pos.z+=20;paintBlasterFlight(f.G,f.p);assert.equal(f.paint.length,0);}
});
test('#965 production collision solver truncates at terrain, actor and boss; reused objects clear schedule',async()=>{
 for(const kind of ['terrain','actor','boss']){
  const f=await setup(),{p}=f,start=p.start.clone();p.prev.copy(start);p.pos.copy(start).add(new f.THREE.Vector3(0,0,5));p.age=.05;
  f.G.physics.level=null;f.G.physics.segment=(from,to,hit)=>{hit.hit=kind==='terrain';if(hit.hit){hit.point.copy(start).add(new f.THREE.Vector3(0,0,1));hit.normal.set(0,0,-1);hit.dist=1;}return hit;};
  if(kind==='boss')f.G.boss={segHit:()=>({point:start.clone().add(new f.THREE.Vector3(0,0,1)),dist:1})};
  if(kind==='actor'){const e=f.make('shooter');e.team=1;e.pos.copy(start).add(new f.THREE.Vector3(0,-1.05,1.7));f.G.actors=[e];}
  f.fidelityProjectileTargets(f.G.projectiles,p);assert.ok(f.paint.length<=1,kind);assert.ok(f.paint.every(e=>e.point.z-start.z<1.8),kind);
  f.G.projectiles.pool.push(p);const recycled=f.G.projectiles._new();assert.equal(recycled,p);assert.equal(recycled.s3BlasterFlightPaint,null);
 }
});
test('#965 invalid schedules fail closed and source scaling is explicit',()=>{
 const raw={SplashSpawnParam:{SpawnNearestLength:.5,SpawnBetweenLength:1.5,SpawnNum:7,SplitNum:1},SplashPaintParam:{WidthHalf:1.62,WidthHalfNearest:2.43}};
 assert.equal(blasterFlightPaintSpec(raw,2).spacing,3);assert.throws(()=>blasterFlightPaintSpec({...raw,SplashSpawnParam:{...raw.SplashSpawnParam,SplitNum:2}}),RangeError);
});
