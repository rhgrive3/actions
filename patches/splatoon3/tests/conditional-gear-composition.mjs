// Run explicitly on the reviewed multi-PR composition described in the report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { emptyLoadout, gearCurve } from '../runtime/gear.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function setup(){
  const f=await fixture(`export * from './inkwave-public/src/game/match.js'; export * from './patches/splatoon3/runtime/respawn-lifecycle.mjs';`);
  assert.ok(f.profile.conditionalGear && f.profile.flow.abilityPoints && f.profile.spawnArmor);
  const m=new f.Match({duration:180});f.G.match=m;m.setState('playing');
  f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];f.G.physics.groundProbe=(_x,_y,_z,_u,_d,_r,h)=>{h.hit=false;return h;};
  f.installRespawnLifecycle(f,f.profile);return {...f,m};
}
function equip(a,head){a.s3.loadout=emptyLoadout();a.s3.loadout[0].main=head;a.setWeapon(a.weaponId);}
function enter(f,a){const v=f.make();v.team=1-a.team;f.emit('turf',{actor:a,area:10000});v.splat(a);}
function die(f,a,cause='weapon'){const e=f.make();e.team=1-a.team;a.splat(e,cause);a.respawn();}
test('Flow + Opening Gambit saturates four AP channels once and their clocks expire independently',async()=>{
  const f=await setup(),a=f.make('blaster');equip(a,'openingGambit');enter(f,a);
  for(const id of ['runSpeed','swimSpeed','inkResistance','actionIntensify'])close(a.s3.modifiers[id],f.profile.gear[id][2]);
  close(a.s3.modifiers.enemyInkGrace*60,39);close(a.weapon.spreadAir,0);
  const openingEnd=a.s3.conditionalGear.openingEnd;a.s3.flow.remaining=1/60;f.tick(a);
  assert.equal(a.s3.conditionalGear.openingEnd,openingEnd);close(a.s3.modifiers.runSpeed,gearCurve(30,...f.profile.gear.runSpeed));
  enter(f,a);a.s3.conditionalGear.openingEnd=20;f.m.time=160;f.tick(a);
  assert.ok(a.s3.flow.active);close(a.s3.modifiers.runSpeed,gearCurve(30,...f.profile.gear.runSpeed));
});
test('Comeback + Flow combines40AP run/swim but only10AP ink and preserves PR330 gauge through respawn',async()=>{
  const f=await setup(),a=f.make();equip(a,'comeback');a.special=.5*a.specialCost();die(f,a);close(a.specialFrac(),.25);enter(f,a);
  close(a.s3.modifiers.runSpeed,gearCurve(40,...f.profile.gear.runSpeed));
  close(a.s3.modifiers.inkSaverMain,gearCurve(10,...f.profile.gear.inkSaverMain));
  close(a.s3.modifiers.inkSaverSub,gearCurve(10,...f.SUB.bomb.inkSaverCurve));
  const flowTime=a.s3.flow.remaining;a.s3.conditionalGear.comeback=1/60;f.tick(a);
  close(a.s3.modifiers.runSpeed,gearCurve(30,...f.profile.gear.runSpeed));close(a.s3.modifiers.inkSaverMain,1);
  close(a.s3.flow.remaining,flowTime-1/60);assert.ok(a.s3.spawnArmor);
});
test('Last Ditch + Flow preserves PR327 per-sub cost and PR340 Roller recovery owner',async()=>{
  const f=await setup(),a=f.make('roller');equip(a,'lastDitchEffort');f.m.time=20;enter(f,a);
  close(a.s3.modifiers.inkSaverSub,gearCurve(18,...f.SUB.bomb.inkSaverCurve));
  close(a.s3.modifiers.runSpeed,gearCurve(30,...f.profile.gear.runSpeed));
  a.s3.rollerRefillMode=true;a.s3.recoverStopRemaining=.2;
  a.s3.flow.remaining=1/60;f.tick(a);assert.equal(a.s3.rollerRefillMode,true);
  assert.ok(a.s3.recoverStopRemaining>0,'temporary AP refresh cannot reset refill lock');
});
test('Sub Resistance precedes actual PR330 armor; PR321 remains the only final quantization owner',async()=>{
  const f=await setup(),a=f.make(),e=f.make();e.team=1;equip(a,'none');a.s3.loadout[0].subs[0]='subResistance';a.setWeapon(a.weaponId);
  die(f,a);a.invuln=0;const hp=a.hp,shield=a.s3.spawnArmor.hp;
  assert.equal(a[Symbol.for('inkwave.s3.final-damage.v1')],true);
  a.damage(30,e,'splat-bomb-far');close(a.hp,hp);close(a.s3.spawnArmor.hp,shield-30*gearCurve(3,1,.75,.5));
  a.s3.spawnArmor=null;a.specialActive={armor:true};a.damage(30,e,'splat-bomb-far');close(hp-a.hp,7.1);
  a.specialActive=null;a.hp=100;a.damage(180,e,'bomb');assert.equal(a.alive,false);
});
test('PR318 rollInk refresh starts from pristine cost, never compounds temporary main efficiency',async()=>{
  const f=await setup(),a=f.make('dualies');equip(a,'lastDitchEffort');const w=a.weapon;
  f.m.time=30;f.tick(a);const cost=7*gearCurve(18,...f.profile.gear.inkSaverMain);close(a.weapon.rollInk,cost);
  for(let n=0;n<3;n++){
    enter(f,a);close(a.weapon.rollInk,cost);a.s3.flow.remaining=1/60;f.tick(a);close(a.weapon.rollInk,cost);
  }
  assert.equal(a.weapon,w);a.grounded=true;a.intent.fire=true;a.weaponRunner.reset();a.ink=cost;
  assert.equal(a.weaponRunner.tryDodge({x:1,z:0}),true);close(a.ink,0);
  f.m.setState('finish');f.tick(a);close(a.weapon.rollInk,7);
});
