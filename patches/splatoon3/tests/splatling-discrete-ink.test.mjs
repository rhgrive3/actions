import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './weapon-edgecases-fixture.mjs';import {FixedClock} from '../runtime/clock.mjs';
import {splatlingBurst,splatlingReservation} from '../runtime/weapons.mjs';
const dt=1/60,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function burst(frames,{gear=false,available=null}={}) {
 const f=await fixture(),a=f.make('splatling'),r=a.weaponRunner;
 if(gear){a.s3.loadout=Array.from({length:3},()=>({main:'inkSaverMain',subs:['inkSaverMain','inkSaverMain','inkSaverMain']}));a.setWeapon('splatling');}
 for(let i=0;i<frames;i++)r.update(dt,{fire:true});const charge=r.charge;
 if(available!==null)a.ink=available;const before=a.ink;r.update(dt,{fire:false});const paid=before-a.ink,ink=a.ink,duration=r.burstDur,shotFrames=[];let count=0;
 for(let i=0;i<200;i++){r.update(dt,{fire:false});if(f.shots.length>count){shotFrames.push(i);count=f.shots.length;}near(a.ink,ink);}
 return {...f,a,r,paid,duration,charge,shotFrames};
}
test('#543 every legal fixed-tick partial charge pays exactly its discrete emitted count',async()=>{
 for(const gear of [false,true])for(let frames=1;frames<=72;frames++){
  const f=await burst(frames,{gear}),w=f.a.weapon,expected=Math.ceil(splatlingBurst(w,f.charge)/w.fireInterval-1e-10);
  assert.equal(f.shots.length,expected,`frame ${frames}, gear ${gear}`);near(f.paid,f.shots.length*w.inkPerShot);near(f.duration,expected*w.fireInterval);
  for(let i=1;i<f.shotFrames.length;i++)assert.equal(f.shotFrames[i]-f.shotFrames[i-1],4);
  if(frames===72){assert.equal(f.shots.length,40);near(f.paid,w.inkFull);near(f.duration,w.burstMax);}
 }
});
test('#543 one-tick tap pays one .5625 round, repeated taps never gain fractional-round efficiency',async()=>{
 const f=await burst(1);assert.equal(f.shots.length,1);near(f.paid,.5625);
 const g=await fixture(),a=g.make('splatling'),r=a.weaponRunner;
 for(let n=0;n<50;n++){r.update(dt,{fire:true});r.update(dt,{fire:false});for(let i=0;i<30;i++)r.update(dt,{fire:false});}
 assert.equal(g.shots.length,50);near(100-a.ink,50*a.weapon.inkPerShot);
});
test('#543 low available ink caps reservation to whole affordable rounds, never negative or free',async()=>{
 for(const available of [0,.1,.5625-1e-7,.5625,.8,1.125,2,22.5]){
  const f=await burst(72,{available});assert.equal(f.shots.length,Math.floor(available/f.a.weapon.inkPerShot+1e-10));near(f.paid,f.shots.length*f.a.weapon.inkPerShot);assert.ok(f.a.ink>=0);
 }
});
test('#543 canceled charge consumes no firing ink; stream cancellation does not invent emitted rounds',async()=>{
 const f=await fixture(),a=f.make('splatling'),r=a.weaponRunner;for(let i=0;i<12;i++)r.update(dt,{fire:true});a.form='squid';r.update(dt,{fire:false});near(a.ink,100);assert.equal(f.shots.length,0);assert.equal(r.streaming,false);
 a.form='kid';r.reset();r.update(dt,{fire:true});r.update(dt,{fire:false});const reserved=100-a.ink;a.form='squid';r.update(dt,{fire:false});near(reserved,a.weapon.inkPerShot);assert.equal(f.shots.length,0); // Existing prepaid-stream cancellation policy remains unchanged.
});
test('#543 zero-charge/invalid plan and exact floating-point full boundaries',async()=>{
 const f=await fixture(),w=f.WEAPONS.splatling;assert.deepEqual(splatlingReservation(w,0,100),{shots:0,cost:0,duration:0});
 near(splatlingReservation(w,1,100).cost,22.5);assert.equal(splatlingReservation(w,2,100).shots,40);
 for(const x of [NaN,Infinity])assert.throws(()=>splatlingReservation(w,.5,x));
});
test('#543 actual native projectile and packet carry one complete round after minimal reservation',async()=>{
 const f=await fixture(),a=f.make('splatling'),ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;f.G.actors=[];const packets=[];f.G.netm={recProj:p=>packets.push({damage:p.damage,vel:p.vel.clone()})};a.aimDir.set(0,0,1);a.aimPoint.set(0,1,100);
 a.weaponRunner.update(dt,{fire:true});a.weaponRunner.update(dt,{fire:false});a.weaponRunner.update(dt,{fire:false});assert.equal(ps.list.length,1);assert.equal(packets.length,1);near(ps.list[0].damage,a.weapon.damage);near(100-a.ink,a.weapon.inkPerShot);ps.clear();
});
test('#543 30/60/120 render clocks produce identical charge, debit and shot histories',async()=>{
 const traces=[];for(const hz of [30,60,120]){const f=await fixture(),a=f.make('splatling'),r=a.weaponRunner,clock=new FixedClock(),trace=[];let tick=0;
  for(let render=0;render<hz*5;render++)clock.advance(1/hz,delta=>{r.update(delta,{fire:tick<19});trace.push([r.charge,r.streaming,r.burstT,a.ink,f.shots.length]);tick++;});traces.push(trace);}
 assert.deepEqual(traces[1],traces[0]);assert.deepEqual(traces[2],traces[0]);
});
