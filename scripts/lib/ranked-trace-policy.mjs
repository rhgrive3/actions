import path from 'node:path';
import {rankedBootState} from './ranked-boot-diagnostics.mjs';
export const rankedTraceOptions = env => ({screenshots:env.RANKED_TRACE_FULL_SCREENSHOTS==='1',snapshots:true,sources:false});
// Two bounded phase images complement the normal failure PNG. No periodic
// timer, request interception, game mutation or ZIP post-processing is used.
export async function captureRankedBootPhase(page,out,receipt,phase){
 const observation={phase,at:new Date().toISOString()};
 (receipt.visualPhases??=[]).push(observation);
 let timer;
 try{observation.state=await Promise.race([page.evaluate(rankedBootState),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Boot state observation timed out')),5000);})]);}catch(error){observation.stateError=error.message;}finally{clearTimeout(timer);}
 try{
  const file='boot-'+receipt.context+'-'+phase+'.png';
  await page.screenshot({path:path.join(out,file),timeout:5000});observation.screenshot=file;
 }catch(error){observation.screenshotError=error.message;}
 return observation;
}
