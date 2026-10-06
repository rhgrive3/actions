import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { emptyLoadout } from '../runtime/gear.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function equip(f,kind,points){
 const a=f.make(kind),loadout=emptyLoadout();
 if(points===57)for(const part of loadout){part.main='runSpeed';part.subs.fill('runSpeed');}
 a.s3.loadout=loadout;a.setWeapon(kind);return a;
}
function flatFloor(f){
 f.G.physics.collideBody=(_p,_r,_l,_h,c)=>{c.wall=c.ceiling=false;return c;};
 f.G.physics.groundProbe=(_x,y,_z,up,down,_r,h)=>{
  h.hit=y-down<=0&&y+up>=0;h.y=0;h.normal.set(0,1,0);h.face=0;h.block=-1;return h;
 };
}
function jumpTrace(a,hz,initial){
 delete a._integrate; // use native gravity, integration, resolve, and landing
 a.grounded=false;a.ground.hit=false;a.pos.set(0,0,0);a.vel.set(initial,8,0);a.intent.move.set(0,0,1);
 const trace=[],clock=new FixedClock();
 for(let frame=0;frame<hz*3&&!a.grounded;frame++)clock.advance(1/hz,dt=>{
  if(a.grounded)return;
  a._horizontal(dt,false,false);a._integrate(dt,false,false);
  trace.push([...a.pos.toArray(),...a.vel.toArray()]);
 });
 assert.ok(a.grounded,'native floor landing reached');assert.ok(trace.length>18);return trace;
}
for(const kind of ['shooter','roller','charger','blaster','dualies','slosher','splatling'])test(`#467 ${kind} ordinary jump traces ignore Run Speed Up at equal initial velocity`,async()=>{
 const f=await fixture();flatFloor(f);
 for(const initial of [0,3,8.64]){
  let reference;
  for(const hz of [30,60,120,144]){
   const a=equip(f,kind,0),b=equip(f,kind,57);
   const x=jumpTrace(a,hz,initial),y=jumpTrace(b,hz,initial);
   assert.deepEqual(y,x,`${kind} ${hz}Hz initial=${initial}`);
   if(reference)assert.deepEqual(x,reference);else reference=x;
   close(a.pos.z,b.pos.z);close(a.pos.x,b.pos.x);
  }
 }
});
test('#467 ground speed and inherited takeoff momentum are retained',async()=>{
 const f=await fixture(),a=equip(f,'shooter',0),b=equip(f,'shooter',57);flatFloor(f);
 assert.ok(b.weaponRunner.moveSpeed()>a.weaponRunner.moveSpeed());
 for(const p of [a,b]){p.intent.move.set(1,0,0);for(let i=0;i<120;i++)p._horizontal(1/60,false,false);}
 const va=a.vel.x,vb=b.vel.x;assert.ok(vb>va);a.grounded=b.grounded=false;
 close(a.vel.x,va);close(b.vel.x,vb);close(a.weaponRunner.moveSpeed(),b.weaponRunner.moveSpeed());
 const x=jumpTrace(a,60,va),y=jumpTrace(b,60,vb);assert.notEqual(x[0][3],y[0][3]);assert.ok(b.pos.x>a.pos.x,'ground-created momentum is not overwritten');
});
test('#467 attack, ready, special, squid, and action-specific owners keep prior multipliers',async()=>{
 const f=await fixture();
 const cases=[['shooter',r=>r.firingT=1],['charger',r=>r.charging=true],['splatling',r=>r.charging=true],['splatling',r=>r.streaming=true],['roller',r=>r.flick=.1],['roller',r=>r.flickRecover=.1],['slosher',r=>r.slosh=.1],['shooter',r=>r.aimingSub=true],['shooter',r=>r.a.specialActive={id:'storm'}],['shooter',r=>r.a.superJumpState={phase:'flight'}],['shooter',r=>r.a.form='squid']];
 for(const[kind,configure]of cases){const a=equip(f,kind,57),r=a.weaponRunner;configure(r);const grounded=r.moveSpeed();a.grounded=false;close(r.moveSpeed(),grounded);}
});
test('#467 ordinary air leaves the existing independent Flow multiplier unchanged',async()=>{
 const f=await fixture(),a=equip(f,'shooter',0),b=equip(f,'shooter',57);
 for(const p of [a,b]){p.grounded=false;p.s3.flow.active=true;}
 close(a.weaponRunner.moveSpeed(),b.weaponRunner.moveSpeed());
 close(a.weaponRunner.moveSpeed(),f.PLAYER.runSpeed*f.profile.flow.runMultiplier);
});

test('#467 roller ground profile stays ground-only while the airborne fallback ignores run AP',async()=>{
 const f=await fixture();for(const points of [0,57]){const a=equip(f,'roller',points),r=a.weaponRunner;r.rolling=true;r.rollT=0;
  close(r.moveSpeed(),a.weapon.rollBaseSpeed??a.weapon.rollSpeed);a.grounded=false;close(r.moveSpeed(),f.PLAYER.runSpeed);
 }
});
