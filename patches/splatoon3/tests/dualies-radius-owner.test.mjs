import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ROOT} from '../../../scripts/weapons-fixture.mjs';
import {installWeaponGates} from '../runtime/weapon-gates.mjs';
import {hurtboxRadius} from '../runtime/player-hurtbox.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
async function round({turret=false,fidelity=true,oldRatio=false,target=null}={}){
 const f=await fixture({site:process.env.INKWAVE_RADII_SITE||`${ROOT}.radius-source`,fidelity});
 const a=f.make('dualies');a.weaponRunner.s3Turret=turret;f.G.actors=[a];
 // Preserve the original contact distance while #430 calibrates the body radius.
 // This negative control isolates duplicate PROJECTILE scaling, not terrain geometry.
 if(target!==null)f.G.actors.push(f.make('shooter',{
  team:1,z:target+hurtboxRadius({form:'kid'},f.PLAYER)-f.PLAYER.radius,name:'enemy'
 }));
 f.projectiles.fireDualies(a,a.weapon,0,0);const p=f.projectiles.list[0];
 if(oldRatio){p.s3PlayerRadius=p.size*(turret?a.weapon.playerRadiusAfterRoll/a.weapon.playerRadiusNormal:1);p.inkPlayerRadius=p.s3PlayerRadius;}
 return {f,a,p};
}
test('canonical Dualies normal and turret radii have exactly one owner',async()=>{
 for(const turret of [false,true]){
  const {f,p}=await round({turret});const raw=f.profile.weaponsFidelityCompletion.weapons.dualies[turret?'CollisionLapOverParam':'CollisionParam'];
  close(f.fidelityPlayerCollisionRadius(p),raw.InitRadiusForPlayer);
  assert.equal(p.s3PlayerRadius,null,'legacy override retires when canonical record is installed');
  close(p.fidelityFieldCollision.initRadius,raw.InitRadiusForField);
 }
});
test('legacy non-fidelity installation retains its existing relative radius fallback',async()=>{
 class Runner {reset(){}busy(){return false;}update(){}_charger(){}tryDodge(){return false;}_dualies(){}}
 class Actor {update(){}}
 class Projectiles {_new(){return {};}_push(p){return p;}}
 installWeaponGates({WeaponRunner:Runner,Actor,Projectiles});
 const system=new Projectiles(),p=system._new();
 p.size=.2;p.owner={weapon:{kind:'dualies',playerRadiusNormal:.31,playerRadiusAfterRoll:.335},weaponRunner:{s3Turret:true}};
 system._push(p);close(p.s3PlayerRadius,.2*.335/.31);
 assert.equal(p.fidelityPlayerCollision,undefined);
});
test('negative old double-ratio extends the actual full-damage boundary with body size held constant',async()=>{
 for(const [oldRatio,target,full] of [[false,11.5,true],[false,11.6,false],[true,11.6,true]]){
  const {f,a,p}=await round({turret:true,oldRatio,target});
  if(oldRatio)close(f.fidelityPlayerCollisionRadius(p),.335*.335/.31);
  for(let i=0;i<120&&f.projectiles.list.length;i++)f.tick(a);
  const damage=f.hits.reduce((s,h)=>s+h.damage,0);
  assert.ok(damage>0);
  assert.equal(damage>=30-1e-7,full,'only duplicate projectile scaling invents full damage at the outer sample');
 }
});
