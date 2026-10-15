import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {lactGameScenario,verifyGameInstance} from './lib/lact-game-probe.mjs';
function fixture({other=false,fault,omitArrowNum=false}={}){
 const id=other?'s3-stringer-normal':'s3-stringer-short',p={ChargeKeepParam:{KeepChargeFullFrame:75},ChargeParam:{InkConsumeFullCharge:.065},ShotParam:{ArrowNum:3},...(other?{IsEnableChargeKeep:false}:{})};
 if(omitArrowNum)delete p.ShotParam.ArrowNum;
 const s={paid:0,chargeF:0,stored:null},r={catalogState:s,charge:0,charging:false},a={weaponId:id,alive:true,grounded:true,ink:100,form:'kid',weaponRunner:r,weapon:{catalogRecord:{id,sourceActor:other?'WeaponStringerNormal':'WeaponStringerShort',sourceSha256:'synthetic-test',parameters:{spl__WeaponStringerParam:p}}}};
 const system={_push(q){return q;}},originalPush=system._push;let everStored=false,emitted=false;
 const g={input:{mouse:{left:false},keys:new Set()},_skipRender:false,s3Clock:{ticks:0},_frame(){
  this.s3Clock.ticks+=fault==='wrongTick'?2:1;const squid=this.input.keys.has('ShiftLeft'),fire=this.input.mouse.left;
  if(squid){a.form='squid';if(s.chargeF){if(!other&&fault!=='missingKeep'){s.stored={paid:s.paid,frames:s.chargeF,remaining:75/60};everStored=true;}s.chargeF=s.paid=0;r.charge=0;r.charging=false;}
   if(s.stored){s.stored.remaining-=1/60;if(s.stored.remaining<1e-9&&fault!=='noExpiry')s.stored=null;}return;}
  a.form='kid';if(fire){if(s.stored){s.paid=s.stored.paid;s.chargeF=s.stored.frames;s.stored=null;r.charge=1;r.charging=true;if(fault==='doubleDebit')a.ink-=6.5;return;}
   r.charging=true;if(s.chargeF===0){s.paid=6.5;a.ink-=6.5;}s.chargeF=Math.min(4,s.chargeF+1);r.charge=s.chargeF/4;
  }else if(r.charge===1){for(let i=0;i<(fault==='wrongArrowCount'?2:3);i++)system._push({owner:a,ghost:false,wid:id,catalog:{descriptor:{charge:fault==='partialArrow'?.5:1}},pos:{toArray:()=>[0,1,0]},vel:{toArray:()=>[0,0,1]}});s.chargeF=s.paid=0;r.charge=0;r.charging=false;emitted=true;
  }else if(emitted&&fault==='lateArrow'){system._push({owner:a,wid:id,catalog:{descriptor:{charge:1}},pos:{toArray:()=>[0,1,0]},vel:{toArray:()=>[0,0,1]}});}
 }};
 globalThis.LACT_GAME={game:g,local:a,projectiles:system,match:{playing:()=>true}};
 return {id,a,g,system,originalPush,everStored};
}
for(const [label,other,hold]of [['retained',false,30],['expired',false,75],['explicit other Stringer',true,30]])test('synthetic receipt control '+label,async()=>{const f=fixture({other});const x=await lactGameScenario({id:f.id,holdTicks:hold,expectKeep:!other});assert.equal(x.births.length,3);assert.equal(x.debit,hold===30&&!other?6.5:13);assert(x.restored);assert.equal(f.system._push,f.originalPush);assert.equal(Object.getOwnPropertyDescriptor(f.a,'ink').get,undefined);});
for(const fault of ['missingKeep','noExpiry','doubleDebit','wrongArrowCount','partialArrow','lateArrow','wrongTick'])test('reject '+fault+' and restore observation/input',async()=>{const f=fixture({fault});await assert.rejects(lactGameScenario({id:f.id,holdTicks:fault==='noExpiry'?75:30,expectKeep:true}));assert.equal(f.system._push,f.originalPush);assert.equal(Object.getOwnPropertyDescriptor(f.a,'ink').get,undefined);assert.equal(f.g.input.mouse.left,false);assert.equal(f.g.input.keys.size,0);assert.equal(f.g._skipRender,false);});
test('portable source has no direct runner/actor tick or charge/form/ink injection',()=>{const s=fs.readFileSync(new URL('./lib/lact-game-probe.mjs',import.meta.url),'utf8');assert(!/weaponRunner\.update|a\.update\(|a\.form\s*=(?!=)|r\.charge\s*=[^=]|a\.ink\s*=(?!=)/.test(s));assert(s.includes('g._frame(1/60)'));assert(s.includes("g.api.setLoadout({weapon:id})"));});

test('missing-keep failure retains specific paid actual-squid evidence',async()=>{const f=fixture({fault:'missingKeep'});const x=await lactGameScenario({id:f.id,holdTicks:30,expectKeep:true,captureFailure:true});assert.equal(x.status,'failed');assert.equal(x.failure.message,'LACT Game: stored charge before expiry');assert.equal(x.failure.phase,'hold');assert.equal(x.failure.held,1);assert.equal(x.failure.form,'squid');assert.equal(x.paid,6.5);assert.equal(x.debit,6.5);assert.equal(x.births.length,0);assert(x.restored);});

test('actual running Game identity rejects duplicated context module',()=>{const saved=globalThis.__inkwave;try{const f=fixture();globalThis.__inkwave=f.g;assert.equal(verifyGameInstance(),true);globalThis.__inkwave={};assert.throws(verifyGameInstance,/not the running Game instance/);}finally{if(saved===undefined)delete globalThis.__inkwave;else globalThis.__inkwave=saved;}});

for(const fault of [undefined,'wrongArrowCount','lateArrow'])test('native omitted ArrowNum '+(fault||'three arrows and 20 post-release ticks'),async()=>{const f=fixture({other:true,omitArrowNum:true,fault});if(fault){await assert.rejects(lactGameScenario({id:f.id,holdTicks:30,expectKeep:false}),/native arrow volley|duplicate\/delayed volley/);}else{const x=await lactGameScenario({id:f.id,holdTicks:30,expectKeep:false});assert.equal(x.births.length,3);assert.equal(x.debit,13);const after=x.transitions.find(t=>t.to==='after');assert.equal(x.ticks-after.tick,20);assert.equal(x.expectKeep,false);}assert.equal(f.system._push,f.originalPush);assert.equal(Object.getOwnPropertyDescriptor(f.a,'ink').get,undefined);});
