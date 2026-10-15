import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {refreshFlowEffects as candidate} from '../runtime/flow-effects.mjs';
import {WEAPON_WEIGHTS} from '../runtime/weapon-weight-data.mjs';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const tuning=JSON.parse(read('../profile.json'));
const gear=read('../runtime/gear.mjs');
const current=read('../runtime/flow-effects.mjs');
const optimized="// Weight-specific run/swim curves below own these two final values.\n  for (const id of FLOW_ABILITIES) if (id !== 'runSpeed' && id !== 'swimSpeed') m[id] = gearCurve(ap[id] || 0, ...tuning.gear[id]);";
const original="for (const id of FLOW_ABILITIES) m[id] = gearCurve(ap[id] || 0, ...tuning.gear[id]);";
assert.equal(current.split(optimized).length-1,1,'reviewed optimization must exist exactly once');
const before=current.replace(optimized,original).replace(/from '(\.\/[^']+)'/g,(_,p)=>"from '"+new URL('../runtime/'+p,import.meta.url).href+"'");
const {refreshFlowEffects:baseline}=await import('data:text/javascript;base64,'+Buffer.from(before).toString('base64'));
const curveText=gear.slice(gear.indexOf('export function gearCurve('),gear.indexOf('export function modifiersFor(')).replace('export ','');
const curve=vm.runInNewContext(curveText+';gearCurve');
function fixture(id,ap,active,drink,drop,remote,head='none'){
 const base={spreadGround:2,spreadAir:10,runSpeedFiringCurve:[.1,.15,.2],actionAirSpreadCurve:[0,.4,1]};
 return {actor:{weaponId:id,weapon:{...base},remote,team:0,s3:{loadout:[{main:head}],modifiers:{runSpeed:1,swimSpeed:1,inkResistance:1,actionIntensify:1,untouched:123},flow:{active},drink,dropRollerBuffRemaining:drop,conditionalGear:undefined}},api:{G:{match:{state:'playing',duration:180,time:head==='openingGambit'?165:15,mode:'turf'}},WEAPONS:{[id]:base}},points:{runSpeed:ap,swimSpeed:ap,inkResistance:ap,actionIntensify:ap,inkSaverMain:17}};
}
function run(fn,f){let calls=0;fn(f.actor,f.api,tuning,()=>({...f.points}),(...args)=>{calls++;return curve(...args)});return calls;}
const snapshot=f=>structuredClone({actor:f.actor,base:f.api.WEAPONS,points:f.points});
test('baseline control reverses only the reviewed redundant curve hunk',()=>{assert.equal(current.split(optimized).length-1,1);assert.ok(before.includes(original));assert.ok(!before.includes(optimized));});
test('actual dependency outputs match across weight/AP/Flow/drink/drop/remote/conditional cases',()=>{
 let cases=0, before=0,after=0;const ids=Object.keys(WEAPON_WEIGHTS);
 for(const id of ids)for(const ap of [0,27,57])for(const active of [false,true])for(const mode of ['normal','drink','drop','remote-drop','opening']){
  const args=[id,ap,active,mode==='drink',mode.includes('drop')?1:0,mode==='remote-drop',mode==='opening'?'openingGambit':'none'];
  const a=fixture(...args),b=fixture(...args);before+=run(baseline,a);after+=run(candidate,b);assert.deepEqual(snapshot(b),snapshot(a));cases++;
 }
 console.log(JSON.stringify({cases,baselineCurveCalls:before,candidateCurveCalls:after,saved:before-after,scope:'refresh calls only; no CPU/FPS measurement'}));assert.equal(before-after,2*cases);
});
test('same state skips all work; state, modifier and weapon replacement invalidate independently',()=>{
 for(const fn of [baseline,candidate]){const f=fixture('shooter',27,false,false,0,false);assert.ok(run(fn,f)>0);assert.equal(run(fn,f),0);f.actor.s3.flow.active=true;assert.ok(run(fn,f)>0);assert.equal(run(fn,f),0);f.actor.s3.modifiers={...f.actor.s3.modifiers};assert.ok(run(fn,f)>0);f.actor.weapon={...f.actor.weapon};assert.ok(run(fn,f)>0);f.actor.s3.flow.active=false;assert.ok(run(fn,f)>0);assert.equal(run(fn,f),0);}
});
test('no modifier/weapon cases keep zero callbacks',()=>{for(const fn of [baseline,candidate])for(const actor of [{},{s3:{}},{s3:{modifiers:{}}}]){let n=0;fn(actor,{}, {},()=>{n++;},()=>{n++;});assert.equal(n,0);}});
test('wrong weight or skipped active curve is detectable by output oracle',()=>{
 const a=fixture('s3-shooter-short',27,true,true,1,false),b=fixture('shooter',27,true,true,1,false);run(baseline,a);run(candidate,b);
 // Saturated AP can converge; zero AP must still distinguish weight classes.
 const c=fixture('s3-shooter-short',0,false,false,0,false),d=fixture('shooter',0,false,false,0,false);run(baseline,c);run(candidate,d);assert.notEqual(c.actor.s3.modifiers.runSpeed,d.actor.s3.modifiers.runSpeed);
 const e=fixture('shooter',0,true,false,0,false),f=fixture('shooter',0,false,false,0,false);run(baseline,e);run(candidate,f);assert.notDeepEqual(e.actor.s3.modifiers,f.actor.s3.modifiers);
});
test('lifecycle sequence preserves all fields and 1440 steady-state refreshes cost zero curves',()=>{
 const a=fixture('shooter',27,false,false,0,false),b=fixture('shooter',27,false,false,0,false);let before=0,after=0;
 for(const phase of ['initial','flow','steady','drink','drop','expiry','weapon','gear']){
  for(const f of [a,b]){
   if(phase==='flow')f.actor.s3.flow.active=true;
   if(phase==='drink'){f.actor.s3.drink=true;f.actor.s3.modifiers={...f.actor.s3.modifiers};}
   if(phase==='drop'){f.actor.s3.dropRollerBuffRemaining=1;f.actor.s3.modifiers={...f.actor.s3.modifiers};}
   if(phase==='expiry')f.actor.s3.flow.active=false;
   if(phase==='weapon')f.actor.weapon={...f.actor.weapon};
   if(phase==='gear'){f.points.actionIntensify=57;f.actor.s3.modifiers={...f.actor.s3.modifiers};}
  }
  const n=phase==='steady'?1440:1;
  for(let i=0;i<n;i++){const x=run(baseline,a),y=run(candidate,b);before+=x;after+=y;if(phase==='steady'){assert.equal(x,0);assert.equal(y,0);}assert.deepEqual(snapshot(b),snapshot(a));}
 }
 assert.equal(before,105);assert.equal(after,91);
});

test('opening window actually applies temporary AP and expiry changes all four abilities',()=>{
 for(const fn of [baseline,candidate]){const f=fixture('shooter',0,false,false,0,false,'openingGambit');run(fn,f);const active={...f.actor.s3.modifiers};f.api.G.match.time=100;f.actor.s3.modifiers={...f.actor.s3.modifiers};run(fn,f);for(const k of ['runSpeed','swimSpeed','inkResistance','actionIntensify'])assert.notEqual(f.actor.s3.modifiers[k],active[k],k);}
});
