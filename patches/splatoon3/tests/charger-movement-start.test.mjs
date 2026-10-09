// Corrects #377's invalid oracle: MoveSpeedFullCharge is not partial-charge
// speed. Independent measured endpoints: S3 Wiki/Splat Charger .96 -> .21 DU/F,
// full .20 DU/F; 1 legacy DU=.1m and 60Hz. Intermediate engine curve unknown.
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
test('Charger keeps 1F startup, starts near .96 DU/F and ends at .20 DU/F', async()=>{
  const startup=await chargingAt(1);
  close(startup.speed,ENTRY,'startup'); assert.equal(startup.r.charging,false);
  const entry=await chargingAt(2);
  assert.equal(entry.r.charging,true);
  assert.ok(entry.speed>5.6 && entry.speed<=ENTRY,'partial charge must not drop immediately to 1.2');
  const partials=await Promise.all([8,12,18,30,60].map(chargingAt));
  let previous=entry.speed;
  for(const p of partials){assert.ok(p.speed<previous && p.speed>FULL);previous=p.speed;}
  // The last partial sample rounds to the independently measured .21 DU/F.
  assert.equal(Math.round(partials.at(-1).speed/6*100)/100,.21);
  const full=await chargingAt(61);close(full.speed,FULL,'full');assert.equal(full.r.chargeT,1);
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
    close(states[60].speed,FULL,'60F charged');assert.equal(states[60].charge,1);
    traces.push(states);
  }
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});
test('Actor acceleration converges to full target; planted lock keeps priority',async()=>{
  const f=await fixture(),a=f.make('charger');a.intent.fire=true;a.intent.move.set(0,0,1);a.vel.set(0,0,0);
  for(let i=0;i<120;i++){f.G.time+=STEP;a.update(STEP);}
  close(a.weaponRunner.moveSpeed(),FULL,'runner full');
  close(Math.hypot(a.vel.x,a.vel.z),FULL,'horizontal full');
  a.weaponRunner.lockT=.5;assert.equal(a.weaponRunner.moveSpeed(),0);
});
test('partial/full charge apply actor-local firing gear once and do not mutate another actor',async()=>{
  const f=await fixture(),a=f.make('charger'),idle=f.make('charger');
  a.s3.loadout=Array.from({length:3},()=>({main:'runSpeed',subs:['runSpeed','runSpeed','runSpeed']}));a.setWeapon('charger');
  const multiplier=gearCurve(57,...f.profile.gearExtra.runSpeedFiring);
  a.weaponRunner.charging=true;a.weaponRunner.chargeT=0;
  close(a.weaponRunner.moveSpeed(),ENTRY*multiplier,'entry gear');
  a.weaponRunner.chargeT=1;close(a.weaponRunner.moveSpeed(),FULL*multiplier,'full gear');
  close(idle.weaponRunner.moveSpeed(),ENTRY,'other actor unchanged');
  assert.notEqual(a.weapon,idle.weapon);close(f.WEAPONS.charger.moveSpeedFiring,FULL,'registry unchanged');
});
