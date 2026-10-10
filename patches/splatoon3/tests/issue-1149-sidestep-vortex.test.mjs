import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './kit-composed-fixture.mjs';
import {installKitInkVac, disposeInkVac, inkVacSideStepScale, INK_VAC_CALIBRATION} from '../runtime/kit-ink-vac.mjs';

// #1149: PoisonMistForPlayer.SideStepInkConsumeRate = 3.5 (Leanny/splat3 @7280ff9c,
// WeaponSpBlower). A Dualies dodge roll admitted inside a live hostile Ink Vac cone
// costs rollInk x 3.5. Outside the cone, for allies, behind occlusion, or after release
// the cost stays at rollInk.
async function setup(){
  const f=await fixture();installKitInkVac(f,f.profile);
  f.G.paint.sample=()=>0;f.G.projectiles=new f.Projectiles(new f.THREE.Scene());
  const a=f.make('charger'),b=f.make('dualies');b.team=1;b.pos.set(0,0,5);
  a.weapon={...a.weapon,special:'inkVac',specialCost:190};a.special=190;a._startSpecial();
  a.aimDir.set(0,0,1);a.aimYaw=0;a.aimPitch=0;
  return {f,a,b};
}
function attemptDodge(b,ink){
  b.ink=ink;b.weaponRunner.rollsLeft=2;b.weaponRunner.dodge=null;b.weaponRunner.lockT=0;
  b.intent.fire=true;b.intent.move.set(1,0,0);
  const ok=b.weaponRunner.tryDodge(b.intent.move);
  b.intent.fire=false;b.intent.move.set(0,0,0);
  return ok;
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

for(const hz of [30,60,120])test(`#1149 ${hz}Hz dodge inside the hostile cone costs rollInk x 3.5 and is refused below it`,async()=>{
  const {f,a,b}=await setup();let acc=0;
  for(let frame=0;frame<hz/2;frame++){
    acc+=1/hz;while(acc+1e-10>=1/60){acc-=1/60;f.tick(a);f.tick(b);}
  }
  assert.equal(inkVacSideStepScale(b),INK_VAC_CALIBRATION.sideStepInkConsumeRate);
  const roll=b.weapon.rollInk;close(roll,7);
  // Just below the scaled cost: the normal cost would pass, so refusal proves the surcharge.
  assert.equal(attemptDodge(b,roll*3.5-0.1),false);close(b.ink,roll*3.5-0.1);
  // Exactly the scaled cost is admitted and paid once.
  assert.equal(attemptDodge(b,roll*3.5),true);close(b.ink,0);
});

test('#1149 dodge cost stays at rollInk outside the cone, for allies, behind occlusion, and after release',async()=>{
  const {f,a,b}=await setup();
  f.tick(a,30);
  b.pos.set(20,0,5);assert.equal(inkVacSideStepScale(b),1);assert.equal(attemptDodge(b,10),true);close(b.ink,3);
  b.pos.set(0,0,5);b.team=0;assert.equal(inkVacSideStepScale(b),1);assert.equal(attemptDodge(b,10),true);close(b.ink,3);
  b.team=1;f.G.physics.los=()=>false;assert.equal(inkVacSideStepScale(b),1);assert.equal(attemptDodge(b,10),true);close(b.ink,3);
  f.G.physics.los=()=>true;disposeInkVac(a);assert.equal(inkVacSideStepScale(b),1);assert.equal(attemptDodge(b,10),true);close(b.ink,3);
});

test('#1149 non-Dualies victims keep their own cost and are not scaled',async()=>{
  const {f,a}=await setup();const s=f.make('shooter');s.team=1;s.pos.set(0,0,5);
  f.tick(a,30);assert.equal(inkVacSideStepScale(s),1);
});
