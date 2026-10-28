// Two bounded native Charger HUD transitions. No state writes or lock requests.
import {pausePlaying,selectPausedCharger,pauseHeldSource,guardNativeInput} from './check-inkwave-charger-selection-probe.mjs';
import {beginNativeFullCharge,releaseHeldPlaying} from './check-inkwave-charge-observation-probe.mjs';
export const PAIRS=Object.freeze([{name:'normal',source:'charger',target:'s3-charger-quick'},{name:'scoped',source:'s3-charger-normalscope',target:'s3-charger-longscope'}]);
export function initialPairLedger(){const names=['sourceSelection','sourcePositive','sourceFull','sourcePauseRelease','targetSelection','targetPositive','targetFull','targetRelease'];return Object.fromEntries(PAIRS.map(p=>[p.name,{source:p.source,target:p.target,stages:Object.fromEntries(names.map(n=>[n,'not-reached'])),records:[]}]))}
export async function runChargerFlow({page,bounded,native,cap,budget,readiness,closeUnsafe,capture,row,resumeEnd,setStageDeadline,save},deps={pausePlaying,selectPausedCharger,pauseHeldSource,beginNativeFullCharge,releaseHeldPlaying}){
 const names=['sourceSelection','sourcePositive','sourceFull','sourcePauseRelease','targetSelection','targetPositive','targetFull','targetRelease'];
 row.pairs??=initialPairLedger();save();
 const owner={matchIdentity:resumeEnd.matchIdentity,sessionIdentity:resumeEnd.sessionIdentity,actorIdentity:resumeEnd.actorIdentity};
 try{
  if(!resumeEnd.playing||resumeEnd.paused||resumeEnd.menu||!resumeEnd.ownerConsistent||!resumeEnd.canvasLocked||resumeEnd.inputLocked!==true)throw Error('Verified resumed game/input owner unavailable');
  for(const pair of PAIRS){const item=row.pairs[pair.name],stages=item.stages;
   const step=async(name,fn)=>{stages[name]='running';save();try{const value=await fn();stages[name]='completed';save();return value;}catch(e){stages[name]='failed';save();throw e;}};
   const record=(stage,label,value)=>{item.records.push({stage,label,value});if(label==='positive'){stages[stage+'Positive']='completed';stages[stage+'Full']='running';}if(label==='fullImage')stages[stage+'Full']='completed';save();};
   setStageDeadline(pair.name+'-source',180000);await step('sourceSelection',async()=>{await deps.pausePlaying({page,bounded,cap,owner,record:(label,value)=>record('source',label,value)});return deps.selectPausedCharger({page,bounded,cap,budget,readiness,owner,weapon:pair.source,record:(label,value)=>record('source',label,value)});});
   const sourceExpected={...owner,weapon:pair.source},sourceGuard=()=>guardNativeInput({page,bounded,owner,weapon:pair.source,paused:false});stages.sourcePositive='running';save();const source=await deps.beginNativeFullCharge({page,bounded,native,chargeTimeout:budget,closeUnsafe,capture:(label,clip)=>capture(pair.name+'-source-'+label,clip),row,expected:sourceExpected,inputGuard:sourceGuard,record:(label,value)=>record('source',label,value)});item.sourceFull=source;save();
   const point={x:source.downEvent?.clientX,y:source.downEvent?.clientY};if(!Number.isFinite(point.x)||!Number.isFinite(point.y))throw Error('Trusted source pointer location unavailable');
   setStageDeadline(pair.name+'-target',180000);await step('sourcePauseRelease',()=>deps.pauseHeldSource({page,bounded,native,cap,row,owner,expected:sourceExpected,point,record:(label,value)=>record('source',label,value)}));
   await step('targetSelection',()=>deps.selectPausedCharger({page,bounded,cap,budget,readiness,owner,weapon:pair.target,record:(label,value)=>record('target',label,value)}));
   const targetExpected={...owner,weapon:pair.target},targetGuard=()=>guardNativeInput({page,bounded,owner,weapon:pair.target,paused:false});stages.targetPositive='running';save();const target=await deps.beginNativeFullCharge({page,bounded,native,chargeTimeout:budget,closeUnsafe,capture:(label,clip)=>capture(pair.name+'-target-'+label,clip),row,expected:targetExpected,inputGuard:targetGuard,record:(label,value)=>record('target',label,value)});item.targetFull=target;save();
   await step('targetRelease',()=>deps.releaseHeldPlaying({page,bounded,native,row,expected:targetExpected,inputGuard:targetGuard,record:(label,value)=>record('target',label,value)}));item.status='observed';save();
  }
  return {status:'two-pairs-observed',reproductionStatus:'inconclusive',note:'Real HUD/charge observations only; samples do not prove the first rebuild, pixel visibility or retail parity.'};
 }catch(e){for(const item of Object.values(row.pairs))for(const key of names)if(item.stages[key]==='running')item.stages[key]='failed';if(row.fireHeld&&!row.unsafeCloseAttempted){try{await closeUnsafe();row.fireHeld=false;row.heldFailureCleanup='context-closed';}catch(closeError){row.heldFailureCleanupError=String(closeError);}}save();throw e;}
}
