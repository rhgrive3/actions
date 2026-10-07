import test from 'node:test';
import assert from 'node:assert/strict';
import {batchFixture} from './batch03-fixture.mjs';
import {rollerVerticalPaintSpec,configureRollerVerticalPaint,paintRollerVerticalFlight} from '../runtime/roller-vertical-paint.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup(vertical=true){const f=await batchFixture(),a=f.make('roller');a.isLocal=true;a.grounded=!vertical;a.weaponRunner.s3FlickVertical=vertical;a.aimPitch=0;f.G.projectiles.fireFlick(a,a.weapon);return {...f,a,ps:f.G.projectiles.list,group:f.profile.weaponsFidelityCompletion.weapons.roller.VerticalSwingUnitGroupParam};}
test('#423 one vertical group owns four intermediate events plus one reserved nearest slot; no five legacy trails',async()=>{
 const f=await setup();assert.equal(f.ps.length,5);assert.equal(f.ps.filter(p=>p.s3RollerFlightPaint).length,1);assert.ok(f.ps.every(p=>p.trailEvery===0));const p=f.ps[0],start=p.pos.clone();
 p.pos.copy(start).add(new f.THREE.Vector3(0,0,30));paintRollerVerticalFlight(f.G,p);assert.equal(f.paint.length,4);assert.equal(p.s3RollerFlightPaint.spec.reservedNearest,1);
 f.paint.forEach((e,i)=>{near(e.point.z-start.z,1.2+i*4.6);near(e.radius,1.287);near(e.opts.stretchAmt,2);near(e.opts.stretch.z,1);});paintRollerVerticalFlight(f.G,p);assert.equal(f.paint.length,4);
 const h=await setup(false);assert.equal(h.ps.length,13);assert.ok(h.ps.every(p=>!p.s3RollerFlightPaint&&p.trailEvery===0));
});
test('#423 first-distance, spacing and count are independent source controls; motion and damage stay immutable',async()=>{
 for(const [key,value,first,spacing,count] of [['SpawnSplashFirstLength',2,2,4.6,4],['SpawnSplashBetweenLength',2,1.2,2,4],['SpawnSplashNum',3,1.2,4.6,2]]){
  const f=await setup(),p=f.ps[0],velocity=p.vel.toArray(),damage=p.damage,collision=p.fidelityPlayerCollision,source={...f.group,[key]:value};configureRollerVerticalPaint(p,source,1);const start=p.pos.clone();p.pos.z+=30;paintRollerVerticalFlight(f.G,p);assert.equal(f.paint.length,count);f.paint.forEach((e,i)=>near(e.point.z-start.z,first+i*spacing));assert.deepEqual(p.vel.toArray(),velocity);assert.equal(p.damage,damage);assert.equal(p.fidelityPlayerCollision,collision);
 }
});
test('#423 actual 60Hz solver runs one bounded cadence, stops at a wall and resets pooled state',async()=>{
 const f=await setup(),p=f.ps[0],start=p.pos.clone();p.vel.set(0,0,60);p.fidelityMove=null;p.straight=100;p.grav=0;p.drag=0;p.life=1;f.G.physics.level=null;
 f.G.physics.segment=(from,to,hit)=>{const wall=start.z+7;hit.hit=to.z>=wall;if(hit.hit){hit.point.copy(to).setZ(wall);hit.normal.set(0,0,-1);hit.dist=wall-from.z;}return hit;};
 for(let i=0;i<7;i++){f.advanceFidelityProjectile(p,1/60);f.fidelityProjectileTargets(f.G.projectiles,p);}assert.equal(f.paint.length,2);near(f.paint[0].point.z-start.z,1.2);near(f.paint[1].point.z-start.z,5.8);
 f.G.projectiles.pool.push(p);assert.equal(f.G.projectiles._new().s3RollerFlightPaint,null);
});
test('#423 source scaling, authority and unsupported geometry fail closed',async()=>{
 const f=await setup(),p=f.ps[0];assert.equal(rollerVerticalPaintSpec(f.group,2).first,2.4);assert.throws(()=>rollerVerticalPaintSpec({...f.group,SplashPaintParam:{...f.group.SplashPaintParam,DepthScaleMin:2}}),RangeError);
 p.pos.z+=20;p.ghost=true;paintRollerVerticalFlight(f.G,p);assert.equal(f.paint.length,0);p.ghost=false;f.a.remote=true;paintRollerVerticalFlight(f.G,p);assert.equal(f.paint.length,0);
});
