import fs from 'node:fs';
import vm from 'node:vm';
import {refreshFlowEffects} from '../../patches/splatoon3/runtime/flow-effects.mjs';
import {weaponWeight} from '../../patches/splatoon3/runtime/weapon-weight.mjs';

// Shared inputs only; both sides execute their own actual Flow/weight/curve modules.
export function flowCurveCases(refresh, curve, weight, profile) {
 if ([refresh,curve,weight].some(f=>typeof f!=='function')) throw Error('Missing Flow comparison export');
 const rows=[];
 for(const [id,klass] of [['s3-shooter-short','Fast'],['shooter','Mid'],['s3-roller-heavy','Slow']]) {
  if(weight(id)!==klass)throw Error('Flow weight fixture mismatch: '+id);
  for(const active of [false,true])for(const mode of ['plain','drink','drop','opening']) {
   const points={runSpeed:13,swimSpeed:9,inkResistance:6,actionIntensify:3,inkSaverMain:17};
   const base={spreadGround:2,spreadAir:10,runSpeedFiringCurve:[.1,.15,.2],actionAirSpreadCurve:[0,.4,1]};
   const actor={weaponId:id,weapon:{...base},remote:false,team:0,s3:{loadout:[{main:mode==='opening'?'openingGambit':'none'}],modifiers:{runSpeed:1,swimSpeed:1,inkResistance:1,actionIntensify:1,untouched:123},flow:{active},drink:mode==='drink',dropRollerBuffRemaining:mode==='drop'?1:0}};
   const api={G:{match:{state:'playing',duration:180,time:165,mode:'turf'}},WEAPONS:{[id]:base}};
   let calls=0;const counted=(...args)=>{calls++;return curve(...args);};
   refresh(actor,api,profile,()=>({...points}),counted);
   const first=calls;refresh(actor,api,profile,()=>({...points}),counted);
   if(first!==13||calls!==first)throw Error('Flow refresh/cache call contract');
   if(Object.values(actor.s3.modifiers).some(v=>!Number.isFinite(v))||!Number.isFinite(actor.weapon.spreadAir))throw Error('Non-finite Flow result');
   if(base.spreadAir!==10||points.runSpeed!==13||actor.s3.modifiers.untouched!==123)throw Error('Flow owner mutation');
   rows.push({id,klass,active,mode,modifiers:{...actor.s3.modifiers},spreadAir:actor.weapon.spreadAir,refreshCalls:first,cachedCalls:calls-first});
  }
 }
 return rows;
}
export function validateFlowCurveRows(actual,expected){
 if(actual?.length!==24||expected?.length!==24||JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Source/emitted Flow output differs');
 return {cases:actual.length,refreshCalls:actual.reduce((n,r)=>n+r.refreshCalls,0),cachedCalls:actual.reduce((n,r)=>n+r.cachedCalls,0)};
}
export async function runFlowCurveEmittedProbe(page,{prefix,root}) {
 const read=p=>fs.readFileSync(new URL(p,root),'utf8');
 const profile=JSON.parse(read('patches/splatoon3/profile.json'));
 const source=read('patches/splatoon3/runtime/gear.mjs');
 const begin=source.indexOf('export function gearCurve('),end=source.indexOf('export function modifiersFor(',begin);
 if(begin<0||end<begin)throw Error('Source gearCurve extraction anchor');
 const curve=vm.runInNewContext(source.slice(begin,end).replace('export ','')+';gearCurve');
 const expected=flowCurveCases(refreshFlowEffects,curve,weaponWeight,profile);
 const actual=await page.evaluate(async ({prefix,run})=>{
  const {refreshFlowEffects}=await import(prefix+'patches/splatoon3/runtime/flow-effects.mjs');
  const {gearCurve}=await import(prefix+'patches/splatoon3/runtime/gear.mjs');
  const {weaponWeight}=await import(prefix+'patches/splatoon3/runtime/weapon-weight.mjs');
  const response=await fetch(prefix+'patches/splatoon3/profile.json');if(!response.ok)throw Error('Flow profile delivery');
  return (0,eval)('('+run+')')(refreshFlowEffects,gearCurve,weaponWeight,await response.json());
 },{prefix,run:flowCurveCases.toString()});
 return {...validateFlowCurveRows(actual,expected),rows:actual,scope:'24 controlled actor containers; actual source versus emitted Flow, weight, gearCurve and profile. No whole-Game performance claim.'};
}
