// Real production-composed shot admission and FX hook routing.
// These are functional VFX-call tests, not Nintendo Switch footage or GPU captures.
// Catalogue families (kind:'catalog') must not lose effects owned by their
// behaviorKind. No shot, paint, ink balance or protocol change is permitted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { ALTERNATE_WEAPON_KITS } from '../runtime/alternate-weapon-kits-data.mjs';

const mains=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='splatling'||r.family==='dualies');
const familyOf=new Map(mains.map(r=>[r.id,r.family]));
const ids=[...mains.map(r=>r.id),...ALTERNATE_WEAPON_KITS.filter(v=>familyOf.has(v.baseId)).map(v=>v.id)];
const spinners=ids.filter(id=>familyOf.get(ALTERNATE_WEAPON_KITS.find(v=>v.id===id)?.baseId||id)==='splatling');
const dualies=ids.filter(id=>familyOf.get(ALTERNATE_WEAPON_KITS.find(v=>v.id===id)?.baseId||id)==='dualies');

test('every Spinner and Dualies base/alternate emits visible muzzle ink on admitted fire',async()=>{
  assert.equal(mains.length,12);
  assert.ok(spinners.length>6&&dualies.length>6,'verify both 11.3.0 variant families');
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>.5});
  f.G.physics.segment=(_from,_to,hit)=>{hit.hit=false;return hit;};
  const flashes=[];
  f.G.fx={muzzle(at,dir,color,kind){
    flashes.push({at:at.clone(),dir:dir.clone(),color,kind});
  }};
  for(const id of ids){
    f.G.projectiles.clear();f.G.actors.length=0;flashes.length=0;
    const a=f.make(id),fires=[];a.isLocal=true;a.form='kid';a.ink=100;
    const off=f.on('weapon:fire',event=>{if(event.actor===a)fires.push(event);});
    try {
      a.intent.fire=true;f.tick(a,150);
      a.intent.fire=false;f.tick(a,30);
      assert.ok(fires.length>0,id+' emitted no main projectile event');
      assert.equal(flashes.length,fires.length,id+' lost or duplicated a muzzle burst');
      for(let i=0;i<flashes.length;i++){
        const burst=flashes[i],shot=fires[i];
        assert.equal(burst.kind,'shooter',id+' uses existing shot muzzle recipe');
        assert.ok(Number.isFinite(burst.at.x+burst.at.y+burst.at.z+
          burst.dir.x+burst.dir.y+burst.dir.z),id+' finite FX');
        assert.ok(burst.at.distanceTo(shot.muzzle)<=.51,id+' FX still belongs to its firing muzzle');
        assert.equal(burst.color,a.color,id+' team ink color');
      }
      if(familyOf.get(a.weapon.variantOf||id)==='dualies'){
        assert.ok(fires.some(e=>e.hand===0)&&fires.some(e=>e.hand===1),
          id+' alternate barrels must both fire');
      }
    } finally {off();}
  }
});

test('actual composed FX hooks retain spin-up, full-charge and streaming ink for all Spinner variants',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export { initFxHooks } from './inkwave-public/src/fx/fxHooks.js';"});
  const calls=[],full=[];
  f.G.camera={position:new f.THREE.Vector3(0,2,-4)};
  f.G.fx={
    spinUp(at,dir,color,charge,streaming){calls.push({at:at.clone(),charge,streaming,color});},
    spinFull(at,dir,color){full.push({at:at.clone(),color});},
  };
  const hooks=f.initFxHooks(f.G);
  for(const id of spinners){
    f.G.actors.length=0;const a=f.make(id);a.form='kid';a.anim.form='kid';
    assert.equal(a.weapon.behaviorKind||a.weapon.kind,'splatling',id+' family');
    a.weaponRunner.charging=true;a.weaponRunner.streaming=false;a.weaponRunner.charge=.5;
    calls.length=full.length=0;
    hooks._actor(a,1/60);hooks._actor(a,1/60);
    assert.equal(calls.length,1,id+' spin-up muzzle ink is visible');
    assert.equal(calls[0].streaming,false);
    assert.equal(calls[0].charge,.5);
    assert.equal(calls[0].color,a.color);
    const muzzle=new f.THREE.Vector3();a.character.getMuzzle(muzzle);
    assert.ok(calls[0].at.distanceTo(muzzle)<1e-8,id+' actual character muzzle');
    a.weaponRunner.charge=1;
    hooks._actor(a,1/60);hooks._actor(a,1/60);
    assert.equal(full.length,1,id+' full-charge flash plays exactly once');
    a.weaponRunner.charging=false;a.weaponRunner.streaming=true;a.weaponRunner.burstFrac=.4;
    hooks._actor(a,1/60);
    assert.equal(calls.at(-1).streaming,true,id+' live streaming has barrel ink');
    assert.ok(Math.abs(calls.at(-1).charge-.61)<1e-10);
  }
});
