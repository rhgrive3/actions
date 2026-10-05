import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { emptyLoadout, gearCurve } from '../runtime/gear.mjs';
import { FixedClock } from '../runtime/clock.mjs';
const close = (a, b) => assert.ok(Math.abs(a-b) < 1e-8, `${a} != ${b}`);
function loadout(points, ability = 'inkResistance') {
  for (let mains = 0; mains <= 3; mains++) {
    const subs = (points - 10 * mains) / 3;
    if (!Number.isInteger(subs) || subs < 0 || subs > 9) continue;
    const value = emptyLoadout();
    for (let i = 0; i < mains; i++) value[i].main = ability;
    for (let i = 0; i < subs; i++) value[Math.floor(i/3)].subs[i%3] = ability;
    return value;
  }
  throw Error(`Unattainable AP ${points}`);
}
function equip(a, points, ability) { a.s3.loadout = loadout(points, ability); a.setWeapon(a.weaponId); }
function speed(a, enemy = true, dt = 1/60) {
  a.intent.move.set(0,0,1); a.vel.set(0,0,0);
  for (let i=0;i<600;i++) a._horizontal(dt, false, enemy);
  return Math.hypot(a.vel.x,a.vel.z);
}

test('#210 actor-local equipment grants the documented whole-frame damage grace', async () => {
  const f = await fixture(); f.G.paint.sample = () => 2;
  for (const [ap, frames] of [[0,0],[3,10],[6,15],[9,19],[10,20],[20,28],[30,33],[39,37],[48,39],[57,39]]) {
    const a=f.make(); equip(a,ap); close(a.s3.modifiers.enemyInkGrace,frames/60);
    f.tick(a,frames); close(a.hp,100);
    f.tick(a); close(100-a.hp,ap===0?.3:ap<26?.2:.1);
  }
});

test('#210 short exits preserve consumed grace; 45F away restores the full window', async () => {
  const f=await fixture(), a=f.make(); equip(a,3); f.G.paint.sample=()=>2;
  f.tick(a,6); close(a.hp,100);
  f.G.paint.sample=()=>0; f.tick(a,44); close(a.s3.enemyInkTime,6/60);
  f.G.paint.sample=()=>2; f.tick(a,4); close(a.hp,100); f.tick(a); close(a.hp,99.8);
  f.G.paint.sample=()=>1; f.tick(a,45); close(a.s3.enemyInkTime,0);
  const hp=a.hp; f.G.paint.sample=()=>2; f.tick(a,10); close(a.hp,hp);
  f.tick(a); close(a.hp,hp-.2);
});

test('#210 leaving by takeoff also needs 45F, and reset clears both contact clocks', async () => {
  const f=await fixture(), a=f.make(); equip(a,6); f.G.paint.sample=()=>2; f.tick(a,10);
  a.grounded=false; f.tick(a,44); close(a.s3.enemyInkTime,10/60);
  f.tick(a); close(a.s3.enemyInkTime,0);
  a.grounded=true; f.tick(a,5); assert.ok(a.s3.enemyInkTime>0);
  a.reset(); close(a.s3.enemyInkTime,0); close(a.s3.enemyInkAwayTime,0);
});

test('#210 grace and #244 rate do not leak between differently equipped actors', async () => {
  const f=await fixture(), bare=f.make(), geared=f.make(); equip(geared,57); f.G.paint.sample=()=>2;
  f.tick(geared,10); f.tick(bare,10); close(geared.hp,100); close(bare.hp,97);
  close(bare.s3.modifiers.enemyInkGrace,0); close(geared.s3.modifiers.enemyInkGrace,39/60);
});

test('#244 damage is quantized to 0.1 HP per reference frame, including the AP25/26 boundary', async () => {
  const f=await fixture(); f.G.paint.sample=()=>2;
  for(const ap of [0,3,6,10,20,25,26,30,48,57]) {
    const a=f.make(); equip(a,ap); a.s3.enemyInkTime=2;
    f.tick(a,60); close(100-a.hp,ap===0?18:ap<26?12:6);
  }
});

test('#244 rate quantization is independent of resource-call interval partitioning', async () => {
  const f=await fixture(); f.G.paint.sample=()=>2;
  for(const ap of [0,3,26,57]) {
    const out=[];
    for(const hz of [30,60,120]) {
      const a=f.make(); equip(a,ap); a.s3.enemyInkTime=2;
      for(let i=0;i<hz;i++) f.updateResources(a,1/hz);
      out.push(a.hp);
    }
    close(out[0],out[1]);close(out[1],out[2]);
  }
});

test('#114 weapon damage uses the same total-damage cap, without healing or passive splats', async () => {
  const f=await fixture(); f.G.paint.sample=()=>2;
  for(const [hit,expectedHP] of [[0,60],[20,60],[40,60],[70,30],[99,1]]) {
    const a=f.make(); if(hit)a.damage(hit,null,'shooter');
    f.tick(a,600); close(a.hp,expectedHP); assert.equal(a.alive,true);
    close(a.damageFromInk,Math.max(0,40-hit));
    a.damage(expectedHP,null,'shooter'); assert.equal(a.alive,false);
  }
});

test('#114 weapon hit during contact, re-entry, and recovery cannot renew a separate ink budget', async () => {
  const f=await fixture(), a=f.make(); f.G.paint.sample=()=>2; f.tick(a,30); close(a.hp,91);
  a.damage(50,null,'shooter'); f.tick(a,60); close(a.hp,41);
  f.G.paint.sample=()=>0; f.tick(a,10); f.G.paint.sample=()=>2; f.tick(a,60); close(a.hp,41);
  // After health actually recovers above the threshold, ink may reduce it to the same cap.
  f.G.paint.sample=()=>1; f.tick(a,300); close(a.hp,100);
  f.G.paint.sample=()=>2; f.tick(a,300); close(a.hp,60);
});

test('#114 equipped total cap suppresses regeneration even during grace or invulnerability', async () => {
  const f=await fixture(); f.G.paint.sample=()=>2;
  for(const ap of [3,10,30,57]) {
    const a=f.make();equip(a,ap);a.damage(10,null,'shooter');f.tick(a,900);
    close(a.hp,100-a.s3.modifiers.enemyDamageCap);
    a.hp=25;a.lastDamage=99;a.invuln=2;f.tick(a,60);close(a.hp,25);
  }
});

test('#247 classifies actual shooter/dualies/blaster attack state instead of held ZR', async () => {
  const f=await fixture();
  for(const kind of ['shooter','dualies','blaster']) {
    const a=f.make(kind);a.intent.fire=true;close(speed(a),1.44);
    a.intent.fire=false;a.weaponRunner.firingT=.2;close(speed(a),.72);
    a.weaponRunner.firingT=0;close(speed(a),1.44);
  }
  const b=f.make('blaster');b.weaponRunner.s3BlasterWindup=.1;close(speed(b),.72);
});

test('#247 charge/stream/slosh use un-geared action speed times the resistance coefficient', async () => {
  const f=await fixture();
  for(const ap of [0,3,10,30,57]) for(const kind of ['charger','splatling','slosher']) {
    const a=f.make(kind);equip(a,ap);const r=a.weaponRunner;
    if(kind==='slosher'){r.slosh=.1;r.firingT=.2;}else{r.charging=true;r.charge=1;}
    const base=kind==='slosher'?a.weapon.moveSpeedFiring*.7:kind==='charger'?a.weapon.moveSpeedFiring:a.weapon.moveSpeedCharging;
    const expected=Math.min(a.s3.modifiers.enemyMoveSpeed,base*gearCurve(ap,.5,.75,1));
    close(speed(a),expected);
    a.intent.fire=true;close(speed(a),expected);
    a.s3.modifiers.runSpeed=a.s3.modifiers.runSpeedFiring=4;close(speed(a),expected);
  }
});

test('#247 splatling release does not select a different enemy speed during its stream', async () => {
  const f=await fixture(), a=f.make('splatling');const r=a.weaponRunner;
  r.charging=true;r.charge=1;r.chargeT=a.weapon.chargeTime;
  r.update(1/60,{fire:false}); assert.equal(r.streaming,true);
  a.intent.fire=false;const released=speed(a);a.intent.fire=true;close(speed(a),released);close(released,1.44);
});

test('#247 restores shared tuning even when movement throws, preserving other actors and dry movement', async () => {
  const f=await fixture(), a=f.make('charger'), b=f.make();equip(a,57);a.weaponRunner.charging=true;a.weaponRunner.charge=1;
  const shared=f.PLAYER.enemyInkSpeed; speed(a);close(f.PLAYER.enemyInkSpeed,shared);close(speed(b),1.44);
  a.weaponRunner.moveSpeed=()=>{throw Error('movement probe');};
  assert.throws(()=>a._horizontal(1/60,false,true),/movement probe/);close(f.PLAYER.enemyInkSpeed,shared);
  equip(b,57,'runSpeed');assert.ok(speed(b,false)>f.PLAYER.runSpeed);close(speed(b),1.44);
});

test('all four enemy-ink fixes use identical 60Hz actor outcomes at 30/60/120Hz render cadence', async () => {
  const results=[];
  for(const hz of [30,60,120]) {
    const f=await fixture(),a=f.make();equip(a,3);a.damage(20,null,'shooter');f.G.paint.sample=()=>2;
    a.intent.move.set(0,0,1);const clock=new FixedClock();
    for(let i=0;i<hz;i++)clock.advance(1/hz,dt=>{f.G.time+=dt;a.update(dt);});
    results.push([a.hp,a.s3.enemyInkTime,a.vel.z,clock.ticks]);
  }
  for(let i=0;i<4;i++){close(results[0][i],results[1][i]);close(results[1][i],results[2][i]);}
  close(results[0][0],70);close(results[0][3],60);
});
