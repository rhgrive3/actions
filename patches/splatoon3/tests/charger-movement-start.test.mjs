// #539 supersedes #377's full-charge-speed-from-entry interpretation.
// Partial endpoints 5.76 -> 1.26 u/s are community verification-table values
// (not in the pinned Leanny extraction); full 1.2 u/s is the pinned endpoint.
// The interpolation between endpoints is a linear approximation (未確認).
// This checks the real fixed-step Actor and gear/lock composition.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';
import { gearCurve } from '../runtime/gear.mjs';
const ENTRY = .96 * .1 * 60, FULL = .20 * .1 * 60;
const close = (a,b,label) => assert.ok(Math.abs(a-b)<1e-6,`${label}: ${a} ~= ${b}`);
async function chargingAt(frame) {
  const f = await fixture(), a = f.make('charger'), r = a.weaponRunner;
  a.intent.fire = true;
  for(let i=0;i<frame;i++) r._charger(STEP,{fire:true},a.weapon);
  return {f,a,r,speed:r.moveSpeed()};
}

test('S3 Charger preserves separate partial and full endpoints (startup 1F, frames 2/8/12/18/full)', async () => {
  const f0 = await fixture();
  assert.equal(f0.profile.weapons.charger.moveSpeedFiring, 1.2);
  assert.equal(f0.PLAYER.runSpeed, 5.76);
  // #726: the ZR edge is the 1F humanoid startup — charging has not begun, so
  // the uncharged run speed still applies on that frame.
  const startup = await chargingAt(1);
  close(startup.speed, f0.PLAYER.runSpeed, 'startup frame');
  assert.equal(startup.r.charging, false, 'no charging state during the 1F startup');
  // The entry remains normal humanoid speed. Partial frames monotonically
  // approach but never collapse into the full-charge 1.2 endpoint.
  let previous = f0.PLAYER.runSpeed;
  for (const frame of [2, 8, 12, 18]) {
    const { speed } = await chargingAt(frame);
    assert.ok(speed <= previous + 1e-6 && speed >= 1.26 - 1e-6, `partial frame ${frame}: ${speed}`);
    if (frame === 2) close(speed, f0.PLAYER.runSpeed, 'charging entry');
    previous = speed;
  }
  assert.ok(previous < f0.PLAYER.runSpeed, 'charge progress slows movement');
  const full = await chargingAt(61);   // 1F startup + 60 charge frames
  close(full.speed, 1.2, 'full charge');
  assert.equal(full.r.chargeT, 1);
});
test('Charger uncharged run, post-release firing window and cooldown retain their owners',async()=>{
  const f=await fixture(),a=f.make('charger'),r=a.weaponRunner;
  close(r.moveSpeed(),ENTRY,'idle');a.intent.fire=true;
  for(let i=0;i<30;i++)r._charger(STEP,{fire:true},a.weapon);
  a.intent.fire=false;r._charger(STEP,{fire:false},a.weapon);
  assert.equal(r.charging,false);close(r.moveSpeed(),FULL,'post-release');
  r._charger(STEP,{fire:false},a.weapon);r.update(.7,{fire:false});
  close(r.moveSpeed(),ENTRY,'cooldown');
});
test('Charger change leaves Splatling charge target and Roller movement owners intact',async()=>{
  const f=await fixture(),s=f.make('splatling');s.weaponRunner.charging=true;s.weaponRunner.charge=.2;
  close(s.weaponRunner.moveSpeed(),s.weapon.moveSpeedCharging,'splatling');
  const r=f.make('roller');r.weaponRunner.rolling=true;r.weaponRunner.rollT=2;
  close(r.weaponRunner.moveSpeed(),r.weapon.rollSpeed,'roller');
});
test('real Actor targets and charge chronology match at 30/60/120Hz rendering',async()=>{
  const traces=[];
  for(const hz of [30,60,120]){
    const f=await fixture(),a=f.make('charger'),clock=new FixedClock(),states=[];
    a.intent.fire=true;a.intent.move.set(0,0,1);
    for(let frame=0;frame<hz*2;frame++)clock.advance(1/hz,dt=>{
      f.G.time+=dt;a.update(dt);const r=a.weaponRunner;
      states.push({charge:r.chargeT,charging:r.charging,speed:r.moveSpeed()});
    });
    assert.equal(clock.ticks,120);assert.equal(states[0].charging,false);
    close(states[0].speed,ENTRY,'startup');assert.equal(states[1].charging,true);
    assert.ok(states[1].speed>5.6,'entry');
    for(let i=1;i<states.length;i++){
      assert.ok(states[i].speed>=FULL-1e-9 && states[i].speed<=ENTRY+1e-9);
      assert.ok(states[i].speed<=states[i-1].speed+1e-9,'nonincreasing partial curve');
    }
    assert.equal(clock.ticks, 120, `${hz}Hz yields 120 ticks`);
    assert.equal(firstCharging, 1, `${hz}Hz: charging enters on tick 2 after the 1F startup`);
    assert.equal(a.weaponRunner.chargeT, 1, `${hz}Hz reaches full charge`);
    assert.equal(a.weaponRunner.charging, true, `${hz}Hz still charging`);
    // #726 startup is uncharged; #539 partial starts at 5.76 and approaches
    // 1.26 before the separate 1.2 full-charge endpoint.
    close(states[0].speed, f.PLAYER.runSpeed, `startup frame at ${hz}Hz`);
    assert.equal(states[0].charging, false, `startup frame at ${hz}Hz`);
    for (let i = 1; i < states.length; i++) {
      assert.ok(states[i].speed <= states[i - 1].speed + 1e-6 &&
        states[i].speed >= 1.2 - 1e-6, `charging tick ${i + 1} at ${hz}Hz`);
    }
    close(states[1].speed, f.PLAYER.runSpeed, `charging entry at ${hz}Hz`);
    close(states.at(-1).speed, 1.2, `full-charge endpoint at ${hz}Hz`);
    traces.push(states);
  }
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('actual Actor tracks partial target, reaches 1.2 full charge and honors lockT', async () => {
  const f = await fixture();
  const a = f.make('charger');
  a.intent.fire = true;
  a.intent.move.set(0, 0, 1);
  a.vel.set(0, 0, 0);
  const clock = new FixedClock();
  // Tick 1 is the #726 1F startup: no charging state yet.
  clock.advance(STEP, (dt) => { f.G.time += dt; a.update(dt); });
  assert.equal(clock.ticks, 1);
  assert.equal(a.weaponRunner.charging, false);
  // Tick 2 begins at the #539 normal-side partial endpoint (community table).
  clock.advance(STEP, (dt) => { f.G.time += dt; a.update(dt); });
  assert.equal(a.weaponRunner.charging, true);
  close(a.weaponRunner.moveSpeed(), 5.76, 'runner target at charging entry');
  const speed = Math.hypot(a.vel.x, a.vel.z);
  assert.ok(speed >= 0 && speed <= 5.76 + 1e-6, `horizontal speed ${speed}`);
  // Run the full charge after the startup tick: velocity converges to 1.2.
  for (let i = 2; i < 61; i++) clock.advance(STEP, (dt) => { f.G.time += dt; a.update(dt); });
  assert.equal(clock.ticks, 61);
  assert.equal(a.weaponRunner.chargeT, 1);
  close(a.weaponRunner.moveSpeed(), 1.2, 'full-charge runner endpoint');
  // Movement acceleration/deceleration is finite. The tick that first reaches
  // full charge still began from the previous partial target; one ordinary
  // fixed interval is enough to settle the remaining velocity delta to 1.2.
  clock.advance(STEP, (dt) => { f.G.time += dt; a.update(dt); });
  const settled = Math.hypot(a.vel.x, a.vel.z);
  assert.ok(Math.abs(settled - 1.2) < 1e-6, `converged speed ${settled}`);
  // Upstream cooldown/state priority is preserved: a planted turret wins.
  a.weaponRunner.lockT = 0.5;
  assert.equal(a.weaponRunner.moveSpeed(), 0, 'lockT priority over charging');
});

test('two actors with distinct charge/Flow gear state share no target', async () => {
  const f = await fixture();
  const charging = f.make('charger'), idle = f.make('charger');
  // Distinct gear: charging actor stacks runSpeed, idle actor keeps none.
  const stacked = Array.from({ length: 3 }, () => ({ main: 'runSpeed', subs: ['runSpeed', 'runSpeed', 'runSpeed'] }));
  charging.s3.loadout = stacked;
  charging.setWeapon('charger');
  // Distinct Flow: only the idle actor is active.
  idle.s3.flow.active = true;
  idle.s3.flow.remaining = f.profile.flow.duration;
  charging.weaponRunner.charging = true;
  // #539 applies the sourced partial-entry endpoint before the firing-speed
  // gear modifier; a separate idle actor still uses the Flow run curve.
  close(charging.weaponRunner.moveSpeed(), 5.76 * gearCurve(57, ...f.profile.gearExtra.runSpeedFiring), 'charging target applies the current dedicated firing-speed gear curve');
  close(idle.weaponRunner.moveSpeed(), f.PLAYER.runSpeed * gearCurve(f.profile.flow.abilityPoints, ...f.profile.gear.runSpeed), 'idle Flow target');
  assert.notEqual(charging.weapon, idle.weapon, 'per-actor weapon copies');
  assert.equal(f.profile.weapons.charger.moveSpeedFiring, 1.2, 'shared profile untouched');
  assert.equal(f.WEAPONS.charger.moveSpeedFiring, 1.2, 'shared source weapon untouched');
});
