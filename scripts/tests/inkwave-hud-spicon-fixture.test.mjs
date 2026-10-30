import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
import {fixture} from '../../patches/splatoon3/tests/source-fixture.mjs';

const source=fs.readFileSync(new URL('../check-inkwave-hud-authority.mjs',import.meta.url),'utf8');
const privateIcon='spIcon:h.spIcon.cloneNode(false),';
assert.equal(source.split(privateIcon).length-1,1);
const previous=source.replace(privateIcon,'');
assert.equal(crypto.createHash('sha256').update(previous).digest('hex'),'30425d5aad2f70741a076b7fe5fd04ac2b7a2420a2adffdd4484e9423dc2e427','complete failed 39c collector is the negative counterfactual');
function collectorInitialization(code){
 const sites=[];
 function visit(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.object.name==='Object'&&node.callee.property.name==='assign'&&node.arguments[0]?.name==='holder'&&node.arguments[1]?.type==='ObjectExpression'){
   const keys=node.arguments[1].properties.map(p=>p.key.name);
   if(keys.includes('ret')&&keys.includes('scopeMask')&&keys.includes('subChip'))sites.push(node);
  }
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
 }
 visit(parse(code,{ecmaVersion:'latest',sourceType:'module'}));
 assert.equal(sites.length,1,'actual first Splatling collector initialization');
 return new Function('holder','h','xh','ret','a','document',code.slice(sites[0].start,sites[0].end)+';return holder;');
}
// Minimal DOM API services for a CPU first-call regression. Native HUD and
// native special-icon/reticle policies execute unchanged; this does not test
// browser SVG visibility, which remains in the full strict browser harness.
function element(){
 const labels={i:{innerHTML:''},b:{textContent:''}};
 return {innerHTML:'',style:{setProperty(){}},classList:{toggle(){}},querySelector:s=>labels[s],cloneNode:()=>element(),contains:()=>true};
}
function holder(f,code){
 const h={spIcon:element(),scopeMask:element(),subChip:element()};h.spIcon.innerHTML='LIVE_NATIVE_ICON';
 const a={alive:true,weapon:f.WEAPONS.splatling,weaponRunner:{streaming:false}};
 const xh=element(),ret=element(),result=Object.create(f.HUD.prototype);
 collectorInitialization(code)(result,h,xh,ret,a,{createElement:()=>element()});
 result._chargeEl=element();result._chargeSecond=element();
 return {h,a,result};
}
test('failed collector lacks constructor-owned spIcon at the very first native Splatling update',async()=>{
 const f=await fixture({productionComposition:true,extraExports:"export {HUD} from './inkwave-public/src/ui/hud.js';"});
 const {h,result}=holder(f,previous);
 assert.equal(Object.hasOwn(result,'spIcon'),false);
 assert.throws(()=>result._updCrosshair({weapon:'splatling',charge:2/3},1/60),/Cannot set properties of undefined.*innerHTML/);
 assert.equal(h.spIcon.innerHTML,'LIVE_NATIVE_ICON');
});
test('collector owns a private icon before first native update and preserves the live HUD icon',async()=>{
 const f=await fixture({productionComposition:true,extraExports:"export {HUD} from './inkwave-public/src/ui/hud.js';"});
 const {h,a,result}=holder(f,source);
 assert.equal(Object.hasOwn(result,'spIcon'),true);assert.notEqual(result.spIcon,h.spIcon);
 result._updCrosshair({weapon:'splatling',charge:2/3},1/60);
 assert.equal(result._L.kitSpecial,a.weapon.special);
 assert.match(result.spIcon.innerHTML,/<svg/);
 const first=result.spIcon.innerHTML;
 assert.equal(result._chargeEl.style.strokeDashoffset,'0.00');
 assert.equal(result._chargeSecond.style.strokeDashoffset,'100.00');
 a.weapon={...a.weapon,special:'slam'};
 result._updCrosshair({weapon:'splatling',charge:5/6},1/60);
 assert.equal(result._L.kitSpecial,'slam');assert.notEqual(result.spIcon.innerHTML,first);
 assert.equal(result._chargeSecond.style.strokeDashoffset,'50.00');
 assert.equal(h.spIcon.innerHTML,'LIVE_NATIVE_ICON','fixture must never borrow the live icon');
});
