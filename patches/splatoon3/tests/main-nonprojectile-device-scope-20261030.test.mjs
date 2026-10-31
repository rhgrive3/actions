import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function setup(id){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
 const a=f.make(id),enemy=f.make('shooter');a.form='kid';a.grounded=true;a.pos.set(0,0,0);a.yaw=0;a.aimDir.set(0,0,1);
 enemy.team=1;enemy.pos.set(20,0,0);enemy.weapon={...enemy.weapon,sub:'beakon'};
 const target=f.G.projectiles.throwBomb(enemy);Object.assign(target,{hp:1000,phase:'deployed',activeAt:Infinity,expireAt:Infinity});
 const hits=[],objects=[],source=f.G.projectiles;
 source.applyHit=(owner,victim,amount)=>hits.push({owner,victim,amount,cause:owner._s3AllSpecialDamageCause});
 for(const name of ['s3DamageSubObjects','s3DamageSpecialObjects']){
  const method=source[name];source[name]=function(attack,...args){objects.push({attack,name});return method.call(this,attack,...args);};
 }
 return {f,a,enemy,target,hits,objects};
}
for(const [id,cause]of [['s3-roller-compact','RollerCore'],['s3-brush-mini','BrushCore']])test(`${id} native body has an Actor contact producer and no device damage producer`,async()=>{
 const {f,a,enemy,target,hits,objects}=await setup(id);
 enemy.pos.set(0,0,.6);target.pos.copy(enemy.pos);a.intent.move.set(0,0,1);a.vel.set(0,0,12);
 for(let i=0;i<40;i++){f.G.time+=1/60;a.weaponRunner.update(1/60,{fire:true,firePressed:false});}
 assert.ok(hits.some(h=>h.victim===enemy&&h.cause===cause&&h.amount>0),'actual body controller contacts its enemy Actor');
 assert.equal(objects.length,0,'body controller never calls a device damage owner');assert.equal(target.hp,1000);
});

for(const detached of [false,true])test(`${detached?'detached':'held'} native Brella canopy contacts Actors without producing device attacks`,async()=>{
 const {f,a,enemy,target,hits,objects}=await setup(detached?'s3-shelter-focus':'s3-shelter-compact');
 let canopy;
 for(let i=0;i<(detached?65:30);i++){
  if(a.weaponRunner.catalogState?.canopy)canopy=a.weaponRunner.catalogState.canopy;
  f.G.time+=1/60;a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});
 }
 if(!detached)canopy=a.weaponRunner.catalogState.canopy;
 assert.ok(canopy?.open);assert.equal(canopy.launched,detached);
 enemy.pos.copy(canopy.pos);target.pos.copy(canopy.pos);
 if(detached){
  // Isolate the detached cloth owner after the real native launch. Its earlier
  // pellets have independent device producers already covered by flight tests.
  f.G.projectiles.list.length=0;for(let i=0;i<3;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}
 }else{f.G.time+=1/60;a.weaponRunner.update(1/60,{fire:true});}
 assert.ok(hits.some(h=>h.victim===enemy&&h.cause?.startsWith('ShelterCanopy')&&h.amount>0),'actual canopy controller contacts its enemy Actor');
 assert.equal(objects.length,0,'canopy path has no device AoE producer');assert.equal(target.hp,1000);
});
