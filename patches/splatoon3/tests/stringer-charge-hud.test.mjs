import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { updateStringerChargeHud, installStringerChargeHud } from '../runtime/stringer-charge-hud.mjs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { ALTERNATE_WEAPON_KITS } from '../runtime/alternate-weapon-kits-data.mjs';
import { adaptStringerChargeHud } from '../stringer-charge-hud-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';
const rows=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='stringer');
function hud(){
  const circle={style:{}},track={style:{}},classes=new Set(),flashes=[];
  const h={_chargeEl:circle,_chargeC:Math.PI*50,ret:{dataset:{},
    classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,on){on?classes.add(k):classes.delete(k);}},
    querySelector:key=>key==='.iw-ret__track'?track:null},_restart:(_ret,name)=>flashes.push(name)};
  return {h,circle,track,classes,flashes};
}
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<.011,`${label}: ${a} != ${b}`);
test('every Stringer kit fills the existing native circle once per actual charge stage, with no added geometry',()=>{
  for(const row of rows)for(const id of [row.id,...ALTERNATE_WEAPON_KITS.filter(k=>k.baseId===row.id).map(k=>k.id)]){
    const weapon=Object.freeze({id,catalogRecord:row}),p=row.parameters.spl__WeaponStringerParam.ChargeParam;
    const {h,circle,track,flashes,classes}=hud(),boundary=p.ChargeFrameMidCharge/p.ChargeFrameFullCharge;
    updateStringerChargeHud(h,weapon,boundary/2);close(+circle.style.strokeDashoffset,h._chargeC*.5,id+' first lap');
    assert.equal(h.ret.dataset.chargeStage,'first');assert.equal(track.style.opacity,'');
    updateStringerChargeHud(h,weapon,boundary);close(+circle.style.strokeDashoffset,h._chargeC,id+' second lap begins empty');
    assert.equal(h.ret.dataset.chargeStage,'second');assert.equal(track.style.opacity,'1');assert.equal(circle.style.stroke,'#fff');
    assert.equal(flashes.length,1,id+' first completion flashes once');assert.equal(classes.has('is-full'),false);
    updateStringerChargeHud(h,weapon,(1+boundary)/2);close(+circle.style.strokeDashoffset,h._chargeC*.5,id+' second lap');
    updateStringerChargeHud(h,weapon,1);close(+circle.style.strokeDashoffset,0,id+' full');assert.ok(classes.has('is-full'));
    updateStringerChargeHud(h,weapon,1);assert.equal(flashes.length,1,'HUD does not add a duplicate full-charge flash');
    updateStringerChargeHud(h,weapon,0);close(+circle.style.strokeDashoffset,h._chargeC,id+' reset');assert.equal(track.style.opacity,'');assert.equal(classes.has('is-full'),false);
    assert.equal(h._chargeEl,circle);assert.equal(h.ret.querySelector('.iw-ret__track'),track,'same native geometry owns both laps');
  }
});

test('HUD wrapper preserves native projection, calls and return values, and clears Stringer styling on switch',()=>{
  const {h,circle,track}=hud(),bow={catalogRecord:rows[0]},shooter={kind:'shooter'};
  let nativeCalls=0;
  class HUD { _updCrosshair(frame,dt){nativeCalls++;this.projected=[frame.crosshair.guide.x,dt];return 71;} }
  installStringerChargeHud(HUD,{bow,shooter});installStringerChargeHud(HUD,{bow,shooter});Object.setPrototypeOf(h,HUD.prototype);
  assert.equal(h._updCrosshair({weapon:'bow',charge:.8,crosshair:{guide:{x:37}}},1/120),71);
  assert.deepEqual(h.projected,[37,1/120]);assert.equal(nativeCalls,1);assert.equal(track.style.opacity,'1');
  h._updCrosshair({weapon:'shooter',charge:0,crosshair:{guide:{x:-13}}},1/30);
  assert.deepEqual(h.projected,[-13,1/30]);assert.equal(nativeCalls,2);assert.equal(track.style.opacity,'');assert.equal(circle.style.stroke,'');
  assert.equal(h._stringerChargeHud,null);assert.equal(h.ret.dataset.chargeStage,undefined);
});

test('Stringer adapter appends only an installer after the complete HUD owner and stays build-only',()=>{
  const raw=fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js',import.meta.url),'utf8');
  const adapted=adaptStringerChargeHud('src/ui/hud.js',raw);
  assert.ok(adapted.includes(raw),'native geometry, scope and projection body are preserved verbatim by this adapter');
  const composed=adaptBuildSource('src/ui/hud.js',raw);
  assert.ok(composed.includes('installStringerChargeHud(HUD, WEAPONS);'));
  assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/splatoon3/stringer-charge-hud-adapter.mjs'));
  assert.equal(adaptStringerChargeHud('src/main.js','untouched'),'untouched');
});
