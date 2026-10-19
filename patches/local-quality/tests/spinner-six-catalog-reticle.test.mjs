import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splatlingStages } from '../splatling-reticle.mjs';
import { MAIN_WEAPON_CATALOG } from '../../splatoon3/runtime/main-weapon-catalog-data.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const records=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='splatling');
const eq=(v,w,label)=>assert.ok(Math.abs(v-w)<1e-7,`${label}: ${v} != ${w}`);

test('the five non-Barrel S3 Spinners fill BOTH original 11.3.0 HUD rings at their own first/second frames',()=>{
 assert.equal(records.length,6);
 const five=records.filter(r=>!r.legacy);
 assert.equal(five.length,5);
 for(const r of five){
  const t=r.parameters.WeaponParam, w={kind:'catalog',catalogRecord:r,chargeTime:t.ChargeFrame_Second/60};
  const ratio=t.ChargeFrame_First/t.ChargeFrame_Second;
  const before=splatlingStages(Math.max(0,ratio-.01),null,w);
  assert.ok(before.first<1&&before.second===0,r.sourceRow+' before first');
  const at=splatlingStages(ratio,null,w);
  eq(at.first,1,r.sourceRow+' first ring at source first stage');
  eq(at.second,0,r.sourceRow+' second ring zero at first stage');
  const middle=splatlingStages((1+ratio)/2,null,w);
  eq(middle.first,1,r.sourceRow+' first ring remains full');
  eq(middle.second,.5,r.sourceRow+' second ring halfway');
  const full=splatlingStages(1,null,w);
  eq(full.first,1,r.sourceRow+' first ring full');
  eq(full.second,1,r.sourceRow+' second ring full');
 }
});

test('S3 catalogue Spinner active streams display first/second remaining rounds instead of zero',()=>{
 for(const r of records.filter(r=>!r.legacy)){
  const t=r.parameters.WeaponParam,w={catalogRecord:r};
  const first=t.MaxShootingFrame_First/60;
  const last=(r.parameters.WeaponFullChargeParam?.MaxShootingFrame_Second??t.MaxShootingFrame_Second)/60;
  for(const [seconds,expectedFirst,expectedSecond] of [[last,1,1],[(last+first)/2,1,.5],[first,1,0],[first/2,.5,0],[0,0,0]]){
   const runner={streaming:true,catalogState:{streamTime:last,streamElapsed:last-seconds}};
   const result=splatlingStages(0,runner,w);
   eq(result.first,expectedFirst,r.sourceRow+' remaining first at '+seconds);
   eq(result.second,expectedSecond,r.sourceRow+' remaining second at '+seconds);
  }
 }
});

test('fully installed HUD keeps the verified original twin rings and catalogue reticle family',()=>{
 const source=fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js',import.meta.url),'utf8');
 const adapted=adaptBuildSource('src/ui/hud.js',source);
 assert.match(adapted,/updateSplatlingStages\(this,c,lr,this\._local\(\)\?\.weapon \|\| WEAPONS\.splatling\)/);
 assert.match(adapted,/iw-ret__charge-second/,'must retain the existing two-ring markup');
 assert.match(adapted,/const family = W\?\.behaviorKind/,'all catalogue Spinner actors use the Splatling reticle');
 assert.match(adapted,/this\._chargeSecond\.style\.strokeDashoffset|updateSplatlingStages/);
});
