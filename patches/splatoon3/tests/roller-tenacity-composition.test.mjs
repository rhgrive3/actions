import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';import {adaptQualitySource} from '../../local-quality/adapter.mjs';import {advanceTenacity} from '../../local-quality/tenacity.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('actual Tenacity gear wrapper preserves Roller target while normalized passive charge advances once',async()=>{
 for(const vertical of [false,true])for(const flow of [false,true]){
  const f=await fixture({adaptRuntime:adaptQualitySource}),a=f.make('roller'),r=a.weaponRunner;
  a.s3.loadout=f.emptyLoadout();a.s3.loadout[0].main='tenacity';a.s3.loadout[1].main='runSpeed';a.s3.loadout[2].main='specialCharge';a.setWeapon('roller');
  if(vertical){a.intent.jump=true;f.tick(a);a.intent.jump=false;assert.equal(a.grounded,false);assert.equal(a.s3JumpAirborne,true,'accepted native jump selects vertical under the freefall owner');}
  a.s3.flow.active=flow;
  assert.equal(a.s3.loadout[0].main,'tenacity');assert.equal(f.abilityPoints(a.s3.loadout).tenacity,undefined);assert.ok(a.specialCost()<a.s3.tenacityBaseCost);a.special=0;
  r.update(1/60,{fire:true,firePressed:true});const speed=r.moveSpeed();near(speed,2.88*a.s3.modifiers.runSpeedFiring*(flow?f.profile.flow.runMultiplier:1));
  const actors=[a,...Array.from({length:2},()=>({team:1,alive:true,remote:true}))],match={mode:'turf',state:'playing',time:180,actors};
  for(let i=0;i<(vertical?31:21);i++){near(r.moveSpeed(),speed);r.update(1/60,{fire:false});advanceTenacity(match,1/60,()=>{});}
  near(a.special/a.specialCost(),3.26*(vertical?31:21)/60/a.s3.tenacityBaseCost);near(a.ink,91.5);assert.equal(f.shots.length,1);
  a.reset();assert.equal(a.s3.loadout[0].main,'tenacity');near(a.s3.tenacityBaseCost,f.WEAPONS.roller.specialCost);
 }
});
