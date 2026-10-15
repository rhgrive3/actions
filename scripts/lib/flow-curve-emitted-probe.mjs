import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
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
 if(actual?.length!==24||expected?.length!==24||JSON.stringify(actual)!==JSON.stringify(expected)) {
  const differences=[];
  const walk=(a,b,path)=>{
   if(Object.is(a,b))return;
   if(a&&b&&typeof a==='object'&&typeof b==='object'){
    const keys=new Set([...Object.keys(a),...Object.keys(b)]);
    for(const key of keys)walk(a[key],b[key],path+'.'+key);
   }else differences.push({path,actual:a,expected:b,actualType:typeof a,expectedType:typeof b,actualText:String(a),expectedText:String(b),
    ...(typeof a==='number'&&typeof b==='number'?{delta:a-b}: {})});
  };
  walk(actual,expected,'rows');
  const error=Error('Source/emitted Flow output differs');
  error.flowCurveParity={status:'failed',actual,expected,differences,
   actualJSON:JSON.stringify(actual),expectedJSON:JSON.stringify(expected),
   actualCount:actual?.length??null,expectedCount:expected?.length??null};
  throw error;
 }
 return {cases:actual.length,refreshCalls:actual.reduce((n,r)=>n+r.refreshCalls,0),cachedCalls:actual.reduce((n,r)=>n+r.cachedCalls,0)};
}
export function readFlowSource(root, relative, manifest) {
 if (!relative.startsWith('patches/splatoon3/') || relative.split('/').some(p=>!p||p==='.'||p==='..'||p.includes('\\')))
  throw Error('Unbound Flow source path');
 const key='patch/'+relative.slice('patches/splatoon3/'.length),expected=manifest.files[key];
 if(!/^[a-f0-9]{64}$/.test(expected||''))throw Error('Missing Flow source pin: '+relative);
 const body=fs.readFileSync(new URL(relative,root)),sha256=crypto.createHash('sha256').update(body).digest('hex');
 if(sha256!==expected)throw Error('Changed Flow source: '+relative);
 return {body,sha256};
}
export async function runFlowCurveEmittedProbe(page,{prefix,root,manifest}) {
 const read=p=>fs.readFileSync(new URL(p,root),'utf8');
 const profile=JSON.parse(read('patches/splatoon3/profile.json'));
 const source=read('patches/splatoon3/runtime/gear.mjs');
 const begin=source.indexOf('export function gearCurve('),end=source.indexOf('export function modifiersFor(',begin);
 if(begin<0||end<begin)throw Error('Source gearCurve extraction anchor');
 const curve=vm.runInNewContext(source.slice(begin,end).replace('export ','')+';gearCurve');
 // Preserve the independent Node oracle as a diagnostic. Acceptance compares both
 // untransformed source and emitted modules inside the same Chromium engine.
 const nodeExpected=flowCurveCases(refreshFlowEffects,curve,weaponWeight,profile);
 const origin=new URL(page.url()).origin,sourcePrefix=origin+'/__flow_source__/',pattern=sourcePrefix+'**',served=new Map(),routeErrors=[];
 const handler=async route=>{
  try{
   const url=new URL(route.request().url());
   if(url.search||url.hash||url.origin!==origin)throw Error('Unexpected Flow source URL');
   const relative=decodeURIComponent(url.pathname.slice('/__flow_source__/'.length));
   const {body,sha256}=readFlowSource(root,relative,manifest);
   served.set(relative,{path:relative,sha256,bytes:body.length});
   await route.fulfill({status:200,contentType:relative.endsWith('.json')?'application/json':'text/javascript',body});
  }catch(error){routeErrors.push(String(error.message||error));await route.abort();}
 };
 await page.route(pattern,handler);
 let actual,expected;
 try{
  ({actual,expected}=await page.evaluate(async ({prefix,sourcePrefix,run})=>{
   const evaluate=(0,eval)('('+run+')');
   async function rows(base){
    const {refreshFlowEffects}=await import(base+'patches/splatoon3/runtime/flow-effects.mjs');
    const {gearCurve}=await import(base+'patches/splatoon3/runtime/gear.mjs');
    const {weaponWeight}=await import(base+'patches/splatoon3/runtime/weapon-weight.mjs');
    const response=await fetch(base+'patches/splatoon3/profile.json');if(!response.ok)throw Error('Flow profile delivery');
    return evaluate(refreshFlowEffects,gearCurve,weaponWeight,await response.json());
   }
   return {expected:await rows(sourcePrefix),actual:await rows(prefix)};
  },{prefix,sourcePrefix,run:flowCurveCases.toString()}));
 }finally{await page.unroute(pattern,handler);}
 if(routeErrors.length)throw Error('Flow source delivery: '+routeErrors.join('; '));
 for(const path of ['runtime/flow-effects.mjs','runtime/gear.mjs','runtime/weapon-weight.mjs','profile.json'])
  if(!served.has('patches/splatoon3/'+path))throw Error('Flow source not consumed: '+path);
 const diagnostics={nodeExpected,sourceBrowserExpected:expected,emittedActual:actual,
  nodeBrowserJSONEqual:JSON.stringify(nodeExpected)===JSON.stringify(expected),sourceServed:[...served.values()]};
 try{return {...validateFlowCurveRows(actual,expected),rows:actual,...diagnostics,
  scope:'24 controlled actor containers; SHA-bound untransformed source versus emitted modules in the same Chromium engine. Node oracle retained separately. No whole-Game performance claim.'};}
 catch(error){if(error.flowCurveParity)Object.assign(error.flowCurveParity,diagnostics);throw error;}
}
