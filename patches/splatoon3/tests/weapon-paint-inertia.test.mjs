import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { addPlayerForwardVelocity } from '../runtime/weapon-paint-inertia.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
async function setup(kind='charger') {
 const f=await fixture(),a=f.make(kind),ps=new f.Projectiles(new f.THREE.Scene());
 f.G.actors=[];f.G.boss=null;f.setRandom(()=>.5);a.yaw=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);return {...f,a,ps};
}
async function paint(charge,{ground=false,ghost=false,dt=1/60}={}) {
 const f=await setup(),paint=[],impacts=[],V=f.THREE.Vector3;
 const axes=[new V(1,0,0),new V(0,1,0),new V(0,0,1)];
 const blocks=[{id:0,solid:true,center:new V(0,-.1,20),half:new V(100,.1,100),axes,faces:[-1,-1,-1,-1,-1,-1]}];
 if(!ground)blocks.push({id:1,solid:true,center:new V(0,1,8),half:new V(10,2,.1),axes,faces:[-1,-1,-1,-1,-1,-1]});
 const level={blocks,faces:[],queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;for(let i=0;i<blocks.length;i++)out.push(i);return out;}};
 f.G.level=level;f.G.physics=new f.Physics(level);
 f.G.camera={position:new V(0,20,0)};
 if(ground){f.a.aimDir.set(0,-.2,1).normalize();f.a.aimPoint.set(0,1.05,.3).addScaledVector(f.a.aimDir,100);}
 f.G.paint.splat=(p,r,team,opts)=>{paint.push({pos:p.clone(),r,team,opts});return 1;};
 f.on('weapon:impact',e=>impacts.push(e));
 if(ghost)f.ps.ghostFire(f.a,{weapon:'charger',charge,muzzle:new V(0,1.05,.3),dir:f.a.aimDir.clone()});
 else f.ps.fireCharger(f.a,f.a.weapon,charge);
 // Production now owns a finite flight; launch itself cannot paint or hit.
 assert.equal(paint.length,ghost?0:1,'only the dedicated feet stamp exists at launch');if(!ghost){assert.equal(paint[0].opts.kind,'trail');near(paint[0].r,f.a.weapon.feetPaintRadius);}assert.equal(impacts.length,0);
 assert.equal(f.ps._fidelityChargerFlights.length,1);
 let frames=0;
 while(f.ps._fidelityChargerFlights.length && frames++<120)f.ps.update(dt);
 assert.equal(f.ps._fidelityChargerFlights.length,0,'finite flight reaches its obstacle');
 const feet=paint.filter(p=>p.opts?.kind==='trail');const flightPaint=paint.filter(p=>p.opts?.kind!=='trail');f.ps.clear();return {...f,paint:flightPaint,feet,impacts,frames};
}
test('#407 finite Charger ground/wall impacts and events retain raw endpoint ratios and full-charge step',async()=>{
 for(const ground of [false,true]){
  const cases=[];
  for(const [charge,want] of [[1/6,.906],[7/12,1.8125],[1/6+5/6*.998,2.715374],[.999,3.263],[1,3.263]]){
   const f=await paint(charge,{ground}),impact=f.paint.at(-1);
   assert.equal(f.impacts.length,1);assert.equal(impact.opts.stretchAmt,.6);
   near(impact.r,want);near(f.impacts[0].radius,impact.r);
   assert.ok(f.frames>0);cases.push(f);
  }
  near(cases[0].paint.at(-1).r/cases[4].paint.at(-1).r,.906/3.263);
  assert.ok(cases[3].paint.at(-1).r/cases[2].paint.at(-1).r>1.2);
 }
});
test('#420 finite Charger line centers follow raw spacing and keep nearest footprint separate',async()=>{
 const spacings=[];
 for(const [charge,spacing,width,depth] of [[1/6,4.7775,.78,2.73],[7/12,3.485625,1.17,2.145],[1/6+5/6*.998,2.34429117,1.55844,1.56234],[.999,2.0592,1.56,1.56],[1,2.0592,1.56,1.56]]){
  const f=await paint(charge),line=f.paint.slice(0,-1);
  assert.ok(line.length>=2);near(line[0].pos.z,.3+1.2);near(line[0].r,1.2);
  for(let i=1;i<line.length;i++){near(line[i].pos.z-line[i-1].pos.z,spacing);near(line[i].r,width);}
  for(const p of line){near(p.opts.stretchAmt,depth/width-1);assert.ok(p.pos.z<7.9,'line centres stop before wall');}
  spacings.push(line[1].pos.z-line[0].pos.z);
 }
 near(spacings[4]/spacings[0],2.0592/4.7775);
 assert.ok(spacings[0]>spacings[1]&&spacings[1]>spacings[2]&&spacings[2]>spacings[3]);
});
test('finite Charger paint is independent of update subdivision and ghost flights never paint',async()=>{
 for(const charge of [0,.5,1]){
  const baseline=await paint(charge);
  for(const dt of [1/30,1/120]){
   const other=await paint(charge,{dt});assert.equal(other.paint.length,baseline.paint.length);
   other.paint.forEach((p,i)=>{near(p.pos.distanceTo(baseline.paint[i].pos),0);near(p.r,baseline.paint[i].r);});
   near(other.impacts[0].radius,baseline.impacts[0].radius);
  }
  const ghost=await paint(charge,{ghost:true});assert.equal(ghost.paint.length,0);assert.equal(ghost.impacts.length,0);
 }
});
async function launch(kind,{speed=0,strafe=0,yaw=0,vertical=false,hand=0,remote=false}={}) {
 const f=await setup(kind);f.a.yaw=yaw;f.a.remote=remote;f.a.aimDir.set(Math.sin(yaw),0,Math.cos(yaw));f.a.aimPoint.copy(f.a.aimDir).multiplyScalar(100);f.a.aimPoint.y=1.05;
 f.a.vel.set(Math.sin(yaw)*speed+Math.cos(yaw)*strafe,17,Math.cos(yaw)*speed-Math.sin(yaw)*strafe);
 f.a.weaponRunner.s3FlickVertical=vertical;const packets=[];f.G.netm={recProj:p=>packets.push(p.vel.clone())};
 if(kind==='dualies')f.ps.fireDualies(f.a,f.a.weapon,0,hand);else if(kind==='roller')f.ps.fireFlick(f.a,f.a.weapon);else f.ps.fireShooter(f.a,f.a.weapon,0);
 return {...f,packets,vels:f.ps.list.map(p=>p.vel.clone())};
}
for(const kind of ['dualies','roller'])test(`#414/#431 ${kind}: signed yaw-local forward contribution, no strafe/vertical inheritance`,async()=>{
 for(const yaw of [0,.7,Math.PI/2])for(const vertical of kind==='roller'?[false,true]:[false])for(const hand of kind==='dualies'?[0,1]:[0]){
  const base=await launch(kind,{yaw,vertical,hand}),forward=await launch(kind,{speed:4.8,yaw,vertical,hand}),back=await launch(kind,{speed:-4.8,yaw,vertical,hand}),side=await launch(kind,{strafe:9,yaw,vertical,hand});
  assert.equal(base.vels.length,kind==='dualies'?1:vertical?5:13);
  for(let i=0;i<base.vels.length;i++){
   near(forward.vels[i].x-base.vels[i].x,Math.sin(yaw)*9.6);near(forward.vels[i].z-base.vels[i].z,Math.cos(yaw)*9.6);
   near(back.vels[i].x-base.vels[i].x,-Math.sin(yaw)*9.6);near(back.vels[i].z-base.vels[i].z,-Math.cos(yaw)*9.6);
   near(forward.vels[i].y,base.vels[i].y);near(side.vels[i].distanceTo(base.vels[i]),0);
   near(forward.packets[i].distanceTo(forward.vels[i]),0);
  }
  for(const f of [base,forward,back,side])f.ps.clear();
 }
});
test('launch snapshots cannot change after movement/weapon switch and reused objects get fresh inheritance once',async()=>{
 const f=await launch('dualies',{speed:4}),p=f.ps.list[0],v=p.vel.clone();f.a.vel.set(99,99,99);f.a.setWeapon('roller');addPlayerForwardVelocity(p);near(p.vel.distanceTo(v),0);
 f.ps.clear();f.a.setWeapon('dualies');f.a.vel.set(0,0,-4);f.ps.fireDualies(f.a,f.a.weapon,0,0);assert.equal(f.ps.list[0],p);assert.equal(p.s3ForwardVelocityApplied,true);assert.ok(p.vel.z<v.z);f.ps.clear();
});
test('Shooter has its own2x forward owner while replayed ghosts never inherit again',async()=>{
 const a=await launch('shooter'),b=await launch('shooter',{speed:8});near(b.vels[0].z-a.vels[0].z,16);near(b.vels[0].x-a.vels[0].x,0);near(b.vels[0].y-a.vels[0].y,0);a.ps.clear();b.ps.clear();
 const f=await launch('dualies',{speed:4});const event=[0,'p',0,'shot','dualies',0,1,0,3,4,5,0,1,.2,1,.15,28,.8,0,0,.1,.8,1,0,0,0,0];
 f.ps.clear();f.ps.ghostProjectile(f.a,event);const p=f.ps.list[0];addPlayerForwardVelocity(p);assert.deepEqual([p.vel.x,p.vel.y,p.vel.z],[3,4,5]);assert.equal(p.s3ForwardVelocityApplied,false);f.ps.clear();
});
