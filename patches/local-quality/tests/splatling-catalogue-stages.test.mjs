import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_WEAPON_CATALOG } from '../../splatoon3/runtime/main-weapon-catalog-data.mjs';
import { ALTERNATE_WEAPON_KITS } from '../../splatoon3/runtime/alternate-weapon-kits-data.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { splatlingStages } from '../splatling-reticle.mjs';
const records=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='splatling');
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-6,`${label}: ${a} != ${b}`);
const firstFrame=r=>r.sourceActor==='WeaponSpinnerDownpour'?50:r.parameters.WeaponParam.ChargeFrame_First;

test('all six sourced Splatlings and eight alternate kits display both charge circles from actual Actor state',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 let mains=0,alternates=0;
 for(const r of records)for(const id of [r.id,...ALTERNATE_WEAPON_KITS.filter(k=>k.baseId===r.id).map(k=>k.id)]){
  id===r.id?mains++:alternates++;
  f.G.actors.length=0;f.G.projectiles.clear();
  const a=f.make(id);a.form='kid';a.ink=100;a.intent.fire=true;
  const before=JSON.stringify(a.weapon.catalogRecord||a.weapon),out={};
  const full=r.parameters.WeaponParam.ChargeFrame_Second,first=firstFrame(r);
  // The native Heavy Splatling has one input-admission frame; catalogue
  // runners count the first funded frame immediately. Do not change either.
  if(r.legacy)f.tick(a);
  for(let frame=1;frame<=full;frame++){
   f.tick(a);
   const runner=a.weaponRunner,p=splatlingStages(runner.charge,runner,a.weapon,out);
   assert.equal(p,out,'caller-owned output is reused');
   if(frame===first){close(p.first,1,id+' first circle');close(p.second,0,id+' no early second circle');}
   if(frame===full){close(p.first,1,id+' full first');close(p.second,1,id+' full second');}
   if(frame>first&&frame<full)assert.ok(p.second>0&&p.second<1,id+' actually enters second stage');
   for(const v of Object.values(p))assert.ok(Number.isFinite(v)&&v>=0&&v<=1,id+' bounded ring');
  }
  assert.equal(JSON.stringify(a.weapon.catalogRecord||a.weapon),before,id+' no gameplay/source mutation');
  a.intent.fire=false;f.tick(a,2);
  const release=splatlingStages(a.weaponRunner.charge,a.weaponRunner,a.weapon,out);
  assert.ok(release.second>.9,id+' release does not erase second-stage ammo');
  f.tick(a,20);
  const firing=splatlingStages(a.weaponRunner.charge,a.weaponRunner,a.weapon,out);
  assert.ok(firing.second<1&&firing.first>0,id+' rings follow consumed charge');
  a.weaponRunner.reset();
 }
 assert.equal(mains,6);assert.equal(alternates,8);
});

test('catalogue charge and stream progress are independent of 30/60/120Hz HUD updates',()=>{
 for(const r of records.filter(r=>!r.legacy)){
  const w={catalogRecord:r},full=r.parameters.WeaponParam.ChargeFrame_Second,first=firstFrame(r);
  const runner={charging:true,catalogState:{chargeF:0}},out={};
  for(const hz of [30,60,120]){
   for(const frame of [first/2,first,(first+full)/2,full]){
    runner.catalogState.chargeF=frame;
    // Renderer could pass stale zero/NaN. The fixed-step actor is authority.
    const p=splatlingStages(hz===120?NaN:0,runner,w,out);
    close(p.first,Math.min(frame/first,1),r.id+' fixed first '+hz);
    close(p.second,Math.max(0,(frame-first)/(full-first)),r.id+' fixed second '+hz);
   }
  }
 }
});

test('Nautilus and Ballpoint recharge retain ring progress; ordinary Splatlings still cannot recharge midstream',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 for(const r of records.filter(r=>!r.legacy)){
  f.G.actors.length=0;f.G.projectiles.clear();
  const a=f.make(r.id);a.form='kid';a.ink=100;a.intent.fire=true;
  f.tick(a,r.parameters.WeaponParam.ChargeFrame_Second);
  a.intent.fire=false;f.tick(a,10);
  a.intent.fire=true;f.tick(a);
  if(r.parameters.WeaponParam.EnableRecharge){
   assert.equal(a.weaponRunner.charging,true,r.id+' recharge is enabled by source');
   assert.equal(a.weaponRunner.streaming,false);
   assert.ok(splatlingStages(0,a.weaponRunner,a.weapon).second>0,r.id+' recharging retained second circle');
  }else{
   assert.equal(a.weaponRunner.charging,false,r.id+' do not invent recharging');
   assert.equal(a.weaponRunner.streaming,true,r.id+' original stream remains live');
  }
 }
});
