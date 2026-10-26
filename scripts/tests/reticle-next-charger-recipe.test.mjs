// Deterministic Node contract tests. These are NOT browser screenshots or
// production gameplay execution; fixtures only verify recipe assertions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CHARGER_CASES,BAMBOO_PHASES,PENCIL_PHASES,BASELINE_SHA,chargerPhaseReady,assertChargerSnapshot,installChargerObservation,runChargerRecipe} from '../lib/reticle-next/charger-recipe.mjs';
const pencil=CHARGER_CASES[1];
function loaded(before=false){return {weaponId:pencil.id,hudWeapon:pencil.id,kind:'charger',form:'kid',charging:false,streaming:false,charge:0,chargeF:0,rounds:4,pending:false,
 hudVisible:true,chargeHandleConnected:true,chargeHandleInReticle:true,full:false,nativeCharging:false,hudCharge:0,
 chargeOffset:157.08,chargeCircumference:2*Math.PI*25,classes:before?['is-idle']:[],xhClasses:[],visible:!before,
 divideCount:5,catalogId:pencil.id,helperEligible:before?null:true,shape:before?null:'pencil',scope:0,scoped:false};}
test('immutable pinned baseline and explicit 6/10 capture matrix',()=>{
 assert.equal(BASELINE_SHA,'e0072a749df0ec8c2d368e383bdf337baa7b44ad');
 assert.equal(BAMBOO_PHASES.length,6);assert.equal(PENCIL_PHASES.length,10);assert.equal(new Set(PENCIL_PHASES).size,10);
 assert(Object.isFrozen(CHARGER_CASES)&&CHARGER_CASES.every(Object.isFrozen));
});
test('partial native gauge uses delayed HUD charge, not raw runner charge',()=>{
 const row={...loaded(),charge:.5,charging:true,hudCharge:.45,chargeOffset:Number((2*Math.PI*25*.55).toFixed(2)),visible:true,classes:['is-charging'],nativeCharging:true,rounds:0};
 assertChargerSnapshot(row,pencil,'charging');
 assert.throws(()=>assertChargerSnapshot({...row,chargeOffset:Number((2*Math.PI*25*.5).toFixed(2))},pencil,'charging'));
});
test('Pencil loaded native rounds4 is visible only in candidate, zero gauge/full',()=>{
 assertChargerSnapshot(loaded(),pencil,'loaded-kid');assertChargerSnapshot(loaded(true),pencil,'loaded-kid',{before:true});
 for(const change of [{rounds:3},{charge:.1},{full:true},{nativeCharging:true},{helperEligible:false},{classes:['is-idle']},{chargeOffset:0},{visible:false}])
  assert.throws(()=>assertChargerSnapshot({...loaded(),...change},pencil,'loaded-kid'));
});
test('squid hides loaded helper/reticle but native owner keeps four rounds',()=>{
 const row={...loaded(),form:'squid',visible:false,helperEligible:false,classes:['is-idle']};
 assertChargerSnapshot(row,pencil,'loaded-squid');
 assert.throws(()=>assertChargerSnapshot({...row,rounds:0},pencil,'loaded-squid'));
 assert.throws(()=>assertChargerSnapshot({...row,visible:true},pencil,'loaded-squid'));
});
test('no false loaded proof from charging, a pending tap, or a reset weapon',()=>{
 for(const change of [{charging:true},{charge:.001},{rounds:0},{rounds:5},{pending:true},{form:'squid'}])assert.equal(chargerPhaseReady({...loaded(),...change},'loaded-kid'),false);
 assert.equal(chargerPhaseReady({...loaded(),rounds:0},'switch-back'),true);
 assert.equal(chargerPhaseReady(loaded(),'switch-back'),false);
});
test('immutable event copies survive event/vector pooling and actor mutations',async()=>{
 let listener;const w={};const a={weaponId:pencil.id,grounded:true,weaponRunner:{catalogState:{rounds:0,chargeF:72},charging:true,charge:1}};
 w.__G={local:a,time:2};w.__inkwave={s3Clock:{ticks:120}};
 const source=installChargerObservation.toString()
  .replace("const {on,G}=await import(new URL('src/core/ctx.js',document.baseURI).href);","const {on,G}=deps;")
  .replace("const {WEAPONS}=await import(new URL('src/config.js',document.baseURI).href);","const {WEAPONS}=deps;")
  .replace("if(!before)({pencilLoadedReticleEligible:eligible}=await import(new URL('patches/local-quality/pencil-loaded-visibility-proposal.mjs',document.baseURI).href));","if(!before)eligible=deps.eligible;");
 const install=new Function('window','deps','return ('+source+')') (w,{G:w.__G,on:(event,fn)=>{assert.equal(event,'weapon:fire');listener=fn;return()=>{};},WEAPONS:{},eligible:()=>true});
 await install({before:false});
 const e={actor:a,weapon:pencil.id,charge:1,muzzle:{x:1,y:2,z:3},dir:{x:0,y:0,z:1}};listener(e);
 e.weapon='wrong';e.charge=0;e.muzzle.x=999;a.weaponId='wrong';a.weaponRunner.catalogState.rounds=4;
 const saved=w.__reticleNativeShots[0];assert.equal(saved.weaponId,pencil.id);assert.equal(saved.charge,1);assert.equal(saved.actorWeaponId,pencil.id);assert.equal(saved.eventRounds,0);assert.deepEqual(saved.muzzle,[1,2,3]);
 assert(Object.isFrozen(saved)&&Object.isFrozen(saved.muzzle)&&Object.isFrozen(saved.dir));
 listener({...e,actor:{}});assert.equal(w.__reticleNativeShots.length,1,'remote event ignored');
});
test('failed native input admission releases mouse and Shift without forcing lock',async()=>{
 const calls=[];const page={mouse:{up:async()=>calls.push('mouse-up')},keyboard:{up:async key=>calls.push('key-up:'+key)},evaluate:async()=>({input:{locked:false}})};
 await assert.rejects(runChargerRecipe(page,{scenario:pencil,pace:async()=>{},capture:async()=>{},selectWeapon:async id=>calls.push('select:'+id)}),/actual pointer lock/);
 assert.deepEqual(calls.slice(-2),['mouse-up','key-up:Shift']);
});
test('capture recipe forbids direct state/debug fire mutations',()=>{
 const source=fs.readFileSync(new URL('../lib/reticle-next/charger-recipe.mjs',import.meta.url),'utf8');
 assert(!/\.debug\.fire\s*\(/.test(source));
 assert(!/\.(?:rounds|chargeF|charge|charging|form|locked)\s*=(?!=)/.test(source));
 assert(source.includes("page.mouse.down({button:'left'})"));assert(source.includes("page.keyboard.down('Shift')"));
 assert(source.includes("new URL('src/core/ctx.js',document.baseURI).href"));
 assert(source.includes("if(G!==window.__G)throw"));
 assert(!source.includes("import('/src/"));
});
