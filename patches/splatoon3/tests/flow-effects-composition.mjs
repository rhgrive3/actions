// Explicitly run against the reviewed PR315 + PR323 + PR327 composition.
// This file is not a replacement for those patches' own regression suites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { emptyLoadout } from '../runtime/gear.mjs';
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
function equip(a, id, ap=0, ninja=false) {
  const parts=emptyLoadout();
  if(ap===27) for(const p of parts)p.subs.fill(id);
  if(ap===57) for(const p of parts){p.main=id;p.subs.fill(id);}
  if(ninja)parts[1].main='ninjaSquid';
  a.s3.loadout=parts;a.setWeapon(a.weaponId);
}
function enter(f,a){const v=f.make();v.team=1-a.team;f.emit('turf',{actor:a,area:10000});f.emit('splatted',{attacker:a,victim:v});}
test('PR315: Flow consumes the sole resistance grace and quantized damage consumer',async()=>{
  const f=await fixture();assert.ok(f.profile.gearExtra.enemyInkGraceFrames,'PR315 required');
  f.G.paint.sample=()=>2;
  for(const [ap,grace] of [[0,33],[27,39],[57,39]]){
    const a=f.make();equip(a,'inkResistance',ap);enter(f,a);a.invuln=0;a.hp=100;
    close(a.s3.modifiers.enemyInkGrace*60,grace);
    for(let n=0;n<grace;n++)f.updateResources(a,1/60);
    close(a.hp,100);f.updateResources(a,1/60);close(a.hp,99.9);
    const spent=a.s3.enemyInkTime;a.s3.flow.remaining=1/60;f.tick(a);
    assert.ok(a.s3.enemyInkTime>=spent,'expiry must not restart grace');
  }
});
test('PR323: actual Flow and Ninja movement use the effective AP cap with one 0.9 penalty',async()=>{
  const f=await fixture();assert.ok(f.profile.stealth,'PR323 required');const speeds=[];
  for(const ninja of [false,true]){
    const a=f.make();equip(a,'swimSpeed',27,ninja);enter(f,a);
    a.form='squid';a.submerged=true;a.intent.move.set(0,0,1);a.vel.set(0,0,0);
    for(let n=0;n<600;n++)a._horizontal(1/60,true,false);
    speeds.push(a.vel.z);close(a.s3.modifiers.swimSpeed,f.profile.gear.swimSpeed[2]);
    close(f.PLAYER.swimSpeed,f.profile.player.swimSpeed);
  }
  close(speeds[1]/speeds[0],.9);
  close(speeds[0],f.profile.player.swimSpeed*f.profile.gear.swimSpeed[2]);
});
test('PR327: Flow never changes fixed sub hold speed, costs or the active Storm power snapshot',async()=>{
  const f=await fixture();assert.ok(f.profile.gearExtra.stormDurationFrames,'PR327 required');
  f.G.projectiles=new f.Projectiles(new f.THREE.Scene());
  const a=f.make();equip(a,'specialPower',57);a.weapon.special='storm';a._startSpecial();
  const snapshot=a.s3.stormPowerSnapshot;assert.ok(snapshot);close(snapshot.duration,10);
  a.specialActive=null;enter(f,a);assert.equal(a.s3.stormPowerSnapshot,snapshot);
  a.grounded=true;a.weaponRunner.aimingSub=true;close(a.weaponRunner.moveSpeed(),4.32);
  a.weaponRunner.aimingSub=false;a.specialActive={id:'storm',phase:'hold',subArmed:true};a.intent.sub=true;
  close(a.weaponRunner.moveSpeed(),4.32);
  a._resolve=()=>{}; // collision/render fixture only; keep the actual update clocks
  a.s3.flow.remaining=1/60;f.tick(a);assert.equal(a.s3.stormPowerSnapshot,snapshot);
  close(a.s3.modifiers.stormDuration,10);close(a.s3.modifiers.inkSaverSub,1);
});
