import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function setup() {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:`export {trizookaSpecialWeapon} from './patches/splatoon3/runtime/kit-trizooka.mjs';
      export {kitTrizookaApplyHit} from './patches/splatoon3/runtime/trizooka-collision.mjs';`});
  const a=f.make(),enemy=f.make();enemy.team=1;enemy.invuln=0;enemy.hp=enemy.maxHp=1000;
  f.G.camera={position:new f.THREE.Vector3(0,20,0)};
  enemy.pos.set(2,0,0);f.G.physics.los=()=>true;
  const hits=[],apply=f.G.projectiles.applyHit;
  f.G.projectiles.applyHit=function(owner,victim,amount,cause,...rest){
    if(victim===enemy)hits.push({amount,cause});
    return apply.call(this,owner,victim,amount,cause,...rest);
  };
  const descriptor=f.trizookaSpecialWeapon(),ledger=new Map();
  const shot=(special=true)=>{
    const p=f.G.projectiles._new();
    Object.assign(p,{type:'blast',owner:a,team:0,wid:special?'trizooka':'blaster',seed:.5,
      s3Weapon:special?descriptor:f.WEAPONS.blaster,s3SpecialWeapon:special?descriptor:null,
      damageOwner:special,s3TrizookaVolleyDamage:special?ledger:null,
      s3ActionIndex:3,s3VolleyIndex:0});
    p.pos.set(0,.7,0);p.vel.set(0,0,30);return p;
  };
  const impact=p=>f.G.projectiles._impact(p,{point:new f.THREE.Vector3(0,.7,0),normal:new f.THREE.Vector3(0,1,0)});
  return {f,a,enemy,hits,descriptor,ledger,shot,impact};
}

test('deferred Trizooka terrain bursts preserve special bands and the shared action ledger after pooled reuse',async()=>{
  const {f,enemy,hits,descriptor,ledger,shot,impact}=await setup();
  const originals=[];
  for(let index=0;index<3;index++){
    const p=shot();p.s3VolleyIndex=index;impact(p);originals.push(p);
  }
  assert.equal(enemy.hp,1000,'terrain damage remains deferred to the next tick');
  assert.equal(f.G.projectiles.s3BlastQueue.length,3);
  for(const entry of f.G.projectiles.s3BlastQueue){
    assert.equal(entry.p.s3SpecialWeapon,descriptor);assert.equal(entry.p.s3TrizookaVolleyDamage,ledger);
    assert.equal(entry.p.damageOwner,true);
  }
  // Reuse of the original pool slot cannot change the queued action identity.
  for(const p of originals)Object.assign(p,{wid:'blaster',s3SpecialWeapon:null,s3TrizookaVolleyDamage:new Map(),damageOwner:false});
  f.G.projectiles.flushBlastImpacts();
  assert.deepEqual(hits,[{amount:53,cause:'trizooka'}]);
  assert.equal(enemy.hp,947,'three lobes share the strongest splash rather than summing');
  const direct=shot();f.kitTrizookaApplyHit(f.G.projectiles,direct,enemy,220);
  assert.equal(enemy.hp,780,'a later direct upgrades the same action to 220 total');
});

test('ordinary Blaster terrain bursts retain their reduced native damage and cause',async()=>{
  const {f,enemy,hits,shot,impact}=await setup();
  enemy.pos.set(.8,0,0);impact(shot(false));
  assert.equal(enemy.hp,1000);
  f.G.projectiles.flushBlastImpacts();
  assert.equal(hits.length,1);assert.equal(hits[0].cause,'blaster');
  assert.ok(hits[0].amount>0&&hits[0].amount<=35);
});

for(const [id,amount,mode,objectCause] of [['crabTank',30,'cannon','Chariot_Cannon'],['inkjet',50,'shot','Jetpack_BombCore']])
test(`${id} keeps its terrain burst descriptor, source tags and one deferred object-effect pass`,async()=>{
  const {f,enemy,hits,shot,impact}=await setup(),p=shot(false);
  const descriptor=f.SPECIALS[id].projectileDescriptor(p),objects=[];
  f.G.projectiles.s3DamageSubObjects=(attack,center,radius,damageAt,cause)=>objects.push(cause);
  Object.assign(p,{wid:id,s3Weapon:descriptor,s3SpecialWeapon:descriptor,s3AllSpecial:id,
    s3AllSpecialMode:mode,s3AllSpecialActivation:71,s3AllSpecialSeed:91,s3PaintNoSpecial:true});
  impact(p);
  assert.equal(enemy.hp,1000);assert.equal(objects.length,0,'no object effects before deferred damage');
  const pending=f.G.projectiles.s3BlastQueue[0].p;
  assert.equal(pending.s3SpecialWeapon,descriptor);assert.equal(pending.s3AllSpecial,id);
  assert.equal(pending.s3AllSpecialMode,mode);assert.equal(pending.s3AllSpecialActivation,71);
  assert.equal(pending.s3AllSpecialSeed,91);assert.equal(pending.s3PaintNoSpecial,true);
  p.s3SpecialWeapon=null;p.s3AllSpecial=null;p.wid='blaster';
  f.G.projectiles.flushBlastImpacts();
  assert.deepEqual(hits,[{amount,cause:id}]);assert.deepEqual(objects,[objectCause]);
});

test('a nested impact queued by a listener does not suppress the current immediate special burst',async()=>{
  const {f,shot,impact}=await setup(),p=shot(false),nested=shot(false),objects=[];
  const descriptor=f.SPECIALS.inkjet.projectileDescriptor(p);
  Object.assign(p,{wid:'inkjet',s3Weapon:descriptor,s3SpecialWeapon:descriptor,s3AllSpecial:'inkjet'});
  f.G.projectiles.s3DamageSubObjects=(_attack,_center,_radius,_damageAt,cause)=>objects.push(cause);
  let once=false;
  f.on('weapon:impact',()=>{if(!once){once=true;impact(nested);}});
  f.G.projectiles._blastBurst(p,new f.THREE.Vector3(0,.7,0),null);
  assert.equal(f.G.projectiles.s3BlastQueue.length,1);
  assert.deepEqual(objects,['Jetpack_BombCore'],'an unrelated queued round cannot defer this immediate burst');
});
