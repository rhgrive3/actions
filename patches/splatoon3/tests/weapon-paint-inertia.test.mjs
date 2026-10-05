import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { chargerImpactRadius, chargerLineSpacing, addPlayerForwardVelocity } from '../runtime/weapon-paint-inertia.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
async function setup(kind='charger') {
 const f=await fixture(),a=f.make(kind),ps=new f.Projectiles(new f.THREE.Scene());
 f.G.actors=[];f.G.boss=null;f.setRandom(()=>.5);a.yaw=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);return {...f,a,ps};
}
async function paint(charge) {
 const f=await setup(),paint=[];let casts=0;
 f.G.physics.raycast=(from,dir,range,h)=>{casts++;h.hit=true;h.dist=10;h.point.copy(from).addScaledVector(dir,dir.y<-.5?1:10);h.normal.set(0,1,0);return h;};
 f.G.paint.splat=(p,r,team,opts)=>{paint.push({pos:p.clone(),r,team,opts});return 1;};
 f.ps.fireCharger(f.a,f.a.weapon,charge);f.ps.clear();return {...f,paint,casts};
}
test('#407 actual ground impact follows three sourced endpoint ratios and full-charge step',async()=>{
 const a=await paint(0),b=await paint(.998999),c=await paint(1);
 near(a.paint.at(-1).r,1.2*.906/2.719);near(c.paint.at(-1).r,1.2*3.263/2.719);
 assert.ok(c.paint.at(-1).r/b.paint.at(-1).r>1.2);
 near(chargerImpactRadius(a.a.weapon,1)/chargerImpactRadius(a.a.weapon,.998999),c.paint.at(-1).r/b.paint.at(-1).r);
 assert.equal(c.paint.at(-1).opts.stretchAmt,.6); // actual impact, not line splashes
});
test('#420 actual line centers tighten with charge; first offset and footprint stay separate',async()=>{
 for(const charge of [0,.5,.998999,1]) {
  const f=await paint(charge),line=f.paint.filter(p=>p.opts.stretchAmt===1.2),step=chargerLineSpacing(f.a.weapon,charge);
  assert.ok(line.length>2);near(line[0].pos.z,.3+1.2);
  for(let i=1;i<line.length;i++)near(line[i].pos.z-line[i-1].pos.z,step);
  near(line[0].r,f.a.weapon.lineRadius*(.8+charge*.4));
 }
 const f=await setup();near(chargerLineSpacing(f.a.weapon,0),1.2);near(chargerLineSpacing(f.a.weapon,1)/1.2,2.0592/4.7775);
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
test('non-target family and replayed ghosts never inherit owner velocity',async()=>{
 const a=await launch('shooter'),b=await launch('shooter',{speed:8});near(a.vels[0].distanceTo(b.vels[0]),0);a.ps.clear();b.ps.clear();
 const f=await launch('dualies',{speed:4});const event=[0,'p',0,'shot','dualies',0,1,0,3,4,5,0,1,.2,1,.15,28,.8,0,0,.1,.8,1,0,0,0,0];
 f.ps.clear();f.ps.ghostProjectile(f.a,event);const p=f.ps.list[0];addPlayerForwardVelocity(p);assert.deepEqual([p.vel.x,p.vel.y,p.vel.z],[3,4,5]);assert.equal(p.s3ForwardVelocityApplied,false);f.ps.clear();
});
