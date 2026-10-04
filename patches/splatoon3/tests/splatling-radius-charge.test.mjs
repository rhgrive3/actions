import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { playerCollisionRadius, installSplatlingRadiusCharge } from '../runtime/splatling-radius-charge.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-10, `${a} != ${b}`);
async function setup(kind = 'splatling') {
  const f = await fixture(), a = f.make(kind), ps = new f.Projectiles(new f.THREE.Scene());
  f.G.actors = [];
  f.G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
  a.aimDir.set(0,0,1); a.aimPoint.set(0,1.05,100);
  return { ...f, a, ps };
}
function fire(f, kind = f.a.weapon.kind) {
  if (kind === 'shooter') f.ps.fireShooter(f.a, f.a.weapon, 0);
  else if (kind === 'splatling') f.ps.fireSplatling(f.a, f.a.weapon, 0);
  else if (kind === 'dualies') f.ps.fireDualies(f.a, f.a.weapon, 0, 0);
  else f.ps.fireBlaster(f.a, f.a.weapon, 0);
  return f.ps.list.at(-1);
}
test('#403: actual emitters use independent snapshot and pinned relative radius, not visuals', async () => {
  const f = await setup();
  const spin = fire(f); near(playerCollisionRadius(spin), .15*.225/.285); near(spin.size,.15);
  f.a.setWeapon('shooter'); const shot = fire(f); near(playerCollisionRadius(shot), .15);
  near(playerCollisionRadius(spin)/playerCollisionRadius(shot), .225/.285);
  spin.size = 99; shot.size = .00001; near(playerCollisionRadius(spin), .15*.225/.285); near(playerCollisionRadius(shot),.15);
  f.a.setWeapon('blaster'); near(playerCollisionRadius(spin), .15*.225/.285);
  const blast = fire(f); assert.equal(blast.s3PlayerRadius,null); near(playerCollisionRadius(blast),.26); near(blast.damage,125);
  f.ps.clear();
});
test('#403: native segment/capsule path has a Shooter-hit/Splatling-miss grazing band', async () => {
  for (const kind of ['shooter','splatling']) {
    const f = await setup(kind), p = fire(f), e=f.make(); e.team=1;e.invuln=0;
    const spinRadius=.15*.225/.285, x=f.PLAYER.radius*.95+(spinRadius+.15)/2;
    e.pos.set(x,0,0);f.G.actors=[e]; p.pos.set(0,1.05,-1);p.start.copy(p.pos);p.vel.set(0,0,120);p.straight=1;
    p.trailEvery=0; const hits=[];f.ps.applyHit=(_a,target,damage)=>hits.push({target,damage});
    f.ps._step(p,1/60); assert.equal(hits.length,kind==='shooter'?1:0);if(hits.length)assert.equal(hits[0].target,e);
    f.ps.clear();
  }
});
test('#403: charge and render states cannot mutate a flight collider; pool clears it', async () => {
  const f = await setup(), p=fire(f), r=playerCollisionRadius(p);
  for(const charge of [0,.2,2/3,1]) {f.a.weaponRunner.charge=charge;near(playerCollisionRadius(fire(f)),r);}
  f.profile.splatlingPlayerCollision.referenceRadius=99;f.a.weapon={...f.a.weapon,kind:'shooter'};near(playerCollisionRadius(p),r);
  f.ps.pool.push(p);const reused=f.ps._new();assert.equal(reused,p);assert.equal(reused.s3PlayerRadius,null);
  reused.size=.77;near(playerCollisionRadius(reused),.77);f.ps.clear();
});
test('#403: visual/paint/gravity/field inputs and non-target families stay native', async () => {
  const f=await setup(), p=fire(f);
  near(p.size,.15);near(p.radius,f.a.weapon.impactRadius);near(p.trailRadius,f.a.weapon.trailRadius);near(p.grav,f.a.weapon.referenceGravity);
  assert.equal(p.fieldRadius,undefined); // field sweep is independently owned by PR63
  f.a.setWeapon('dualies');const d=fire(f);assert.equal(d.s3PlayerRadius,null);near(playerCollisionRadius(d),.15);
  f.ps.clear();
});
test('#403: ghosts and reused ghost objects never acquire authoritative player radius', async () => {
  const f=await setup(), p=fire(f);f.ps.list.length=0;f.ps.pool.push(p);
  const event=[0,'p',0,'shot','splatling',0,1,0,0,0,10,0,1,.2,1,.15,28,.8,0,0,.1,.8,1,0,0,0,0];
  f.ps.ghostProjectile(f.a,event);const ghost=f.ps.list[0];assert.equal(ghost,p);assert.ok(ghost.ghost);assert.equal(ghost.s3PlayerRadius,null);near(ghost.size,.15);f.ps.clear();
});
test('#470: every active charge sample uses 3.72 independent of percent; stream remains 4.2', async () => {
  const f=await fixture(),a=f.make('splatling'),r=a.weaponRunner;
  for(const frame of [1,12,24,48,60,72]){r.charging=true;r.charge=frame/72;near(r.moveSpeed(),3.72);}
  r.charging=false;r.streaming=true;r.firingT=.35;near(r.moveSpeed(),4.2);
  r.lockT=.1;r.charging=true;near(r.moveSpeed(),0);
});
test('#470: gear/Flow multiply charge target once and never restore the progress ramp', async () => {
  const f=await fixture(),a=f.make('splatling'),r=a.weaponRunner;
  a.s3.loadout=Array.from({length:3},()=>({main:'runSpeed',subs:['runSpeed','runSpeed','runSpeed']}));a.setWeapon('splatling');
  r.charging=true;r.charge=.01;const boosted=r.moveSpeed();assert.ok(boosted>3.72);
  r.charge=1;near(r.moveSpeed(),boosted);a.s3.flow.active=true;near(r.moveSpeed(),boosted*f.profile.flow.runMultiplier);
});
test('#470: actual 48/72 charge, prepaid ink and 4f stream cadence stay unchanged', async () => {
  const f=await fixture(),a=f.make('splatling'),r=a.weaponRunner; const targets=[];
  for(let frame=1;frame<=73;frame++){r.update(1/60,{fire:true});if(r.charging)targets.push(r.moveSpeed());if(frame===48)near(r.charge,2/3);}
  near(r.charge,1);assert.ok(targets.every(s=>Math.abs(s-3.72)<1e-10));
  r.update(1/60,{fire:false});near(a.ink,77.5);const releaseInk=a.ink;const shotFrames=[];let count=f.shots.length;
  for(let i=0;i<100;i++){r.update(1/60,{fire:false});if(f.shots.length>count){shotFrames.push(i);count=f.shots.length;}}
  for(let i=1;i<shotFrames.length;i++)assert.equal(shotFrames[i]-shotFrames[i-1],4);near(a.ink,releaseInk);
});
test('#470: 30/60/120 render schedules produce identical fixed-clock charge/stream targets', async () => {
  const traces=[];
  for(const hz of [30,60,120]){const f=await fixture(),a=f.make('splatling'),r=a.weaponRunner,clock=new FixedClock(),trace=[];
    for(let render=0;render<hz*2;render++)clock.advance(1/hz,dt=>{r.update(dt,{fire:clock.ticks<73});trace.push([r.charging,r.streaming,r.charge,r.moveSpeed(),f.shots.length,a.ink]);});
    traces.push(trace);
  }
  assert.deepEqual(traces[1],traces[0]);assert.deepEqual(traces[2],traces[0]);
});
test('invalid calibration fails closed before wrapping gameplay', () => {
  class Projectiles {_new(){} _push(){}} class WeaponRunner {moveSpeed(){}}
  const method=Projectiles.prototype._new;
  for(const value of [NaN,0,-1,Infinity]) assert.throws(()=>installSplatlingRadiusCharge({Projectiles,WeaponRunner},{splatlingPlayerCollision:{referenceRadius:value,referenceShooterRadius:.285,shooterWorldRadius:.15}}));
  assert.equal(Projectiles.prototype._new,method);
});
