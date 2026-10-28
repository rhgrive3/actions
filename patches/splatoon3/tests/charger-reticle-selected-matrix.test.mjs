import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';import {ALTERNATE_WEAPON_KITS} from '../runtime/alternate-weapon-kits-data.mjs';
const rows=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='charger');const ids=rows.flatMap(r=>[r.id,...ALTERNATE_WEAPON_KITS.filter(k=>k.baseId===r.id).map(k=>k.id)]);
class Node {constructor(){this.names=new Set();this.classList={toggle:(k,v)=>{v?this.names.add(k):this.names.delete(k)},add:(...keys)=>keys.forEach(k=>this.names.add(k)),remove:(...keys)=>keys.forEach(k=>this.names.delete(k)),contains:k=>this.names.has(k)};this.style={setProperty:(k,v)=>this.style[k]=v};this.parts=new Map()}set className(v){this.names=new Set(v.split(/\s+/));}set innerHTML(v){this._html=v;this.parts.clear()}contains(node){return [...this.parts.values()].includes(node)}querySelector(k){if(!this.parts.has(k))this.parts.set(k,new Node());return this.parts.get(k)}}
function hud(f,a){const h=Object.create(f.HUD.prototype);Object.assign(h,{_L:{},_bloom:0,_kick:0,ret:new Node(),scopeMask:new Node(),xh:new Node(),shield:new Node(),subChip:new Node(),spIcon:new Node(),_local:()=>a,_restart(){},_snd(){}});return h;}
function update(h,a){h._updCrosshair({weapon:a.weaponId,charge:a.weaponRunner.charge,crosshair:{spread:0},subAim:false,ink:1,subCost:.7},1/60);}
test('all 18 Charger kit HUD gauges follow selected live runner and reset in idle',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { HUD } from './inkwave-public/src/ui/hud.js';"});assert.equal(ids.length,18);
 for(const id of ids){const a=f.make(id),h=hud(f,a);a.form='kid';a.alive=true;a.ink=100;a.intent.fire=true;const ticks=Math.ceil((a.weapon.chargeTime||1)*60)+3;
  for(let i=0;i<ticks;i++){a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});if(![0,4,5,19,ticks-1].includes(i))continue;update(h,a);
   const r=a.weaponRunner,w=a.weapon,frames=Math.max(1,Math.round((w.chargeTime||1)*60)),delay=Math.max(0,+w.reticleDelayF||0),elapsed=Math.max(0,+r.chargeT||0)*frames;
   const visible=!!r.charging&&elapsed>delay+1e-9,expected=visible?Math.min(1,Math.max(0,(elapsed-delay)/Math.max(1,frames-delay))):0;
   assert.equal(h.ret.classList.contains('is-charging'),visible,`${id} tick ${i+1} visible`);
   assert.equal(h.ret.classList.contains('is-charge-delay'),!!r.charging&&!visible,`${id} tick ${i+1} delay`);
   assert.ok(Math.abs(Number(h.ret.style['--ch'])-expected)<.0046,`${id} tick ${i+1} gauge ${h.ret.style['--ch']} expected ${expected}`);
  }
  assert.ok(a.weaponRunner.charging,id);assert.ok(a.weaponRunner.charge>=.999,id);
  a.weaponRunner.reset();a.intent.fire=false;update(h,a);assert.equal(h.ret.classList.contains('is-charging'),false,id);assert.equal(h.ret.classList.contains('is-charge-delay'),false,id);assert.equal(h.ret.classList.contains('has-reach'),false,id);
 }
});
test('switching between Charger kits after next begins charging keeps charge ring visible',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { HUD } from './inkwave-public/src/ui/hud.js';"});
 for(const id of ids){const a=f.make(id==='charger'?'s3-charger-long':'charger'),h=hud(f,a);a.form='kid';a.alive=true;a.ink=100;
  function charge(){a.intent.fire=true;for(let i=0;i<20;i++)a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});update(h,a);assert.ok(a.weaponRunner.charging);assert.ok(a.weaponRunner.charge>0);assert.ok(h.ret.classList.contains('is-charging'),`active charge ring for ${a.weaponId}`);}
  charge();a.setWeapon(id);a.ink=100;charge();a.setWeapon('shooter');update(h,a);assert.equal(h.ret.classList.contains('is-charging'),false,`${id} switch to shooter`);
 }
});
test('scoped Charger reticle rebuild restores scope on detached ring and fast scoped switch',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { HUD } from './inkwave-public/src/ui/hud.js';"});
 const scoped=ids.filter(id=>!!f.WEAPONS[id]?.scopedCharge);assert.ok(scoped.length>=2,'at least two selected scoped kits');
 const a=f.make(scoped[0]),h=hud(f,a);a.form='kid';a.alive=true;
 function full(){a.ink=100;a.intent.fire=true;for(let i=0;i<Math.ceil((a.weapon.chargeTime||1)*60)+5;i++)a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});assert.ok(a.weaponRunner.charging);assert.ok(a.weaponRunner.charge>=.999);update(h,a);assert.equal(h.ret.classList.contains('is-scoped'),true,`${a.weaponId} scoped`);}
 for(const id of scoped){if(a.weaponId!==id)a.setWeapon(id);full();h.ret.innerHTML='';update(h,a);assert.equal(h.ret.classList.contains('is-scoped'),true,`${id} detached ring recovery`);}
 a.setWeapon(scoped[0]);full();a.setWeapon(scoped[1]);full();
});
