import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {rankedTraceOptions,captureRankedBootPhase} from './lib/ranked-trace-policy.mjs';
import {observeRankedBoot} from './lib/ranked-boot-diagnostics.mjs';
const out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{
 for(let iteration=0;iteration<3;iteration++)for(const full of [false,true]){
  const context=await browser.newContext({viewport:{width:640,height:360}}),page=await context.newPage(),label=(full?'full':'normal')+'-'+iteration;
  const receipt={context:label};await context.tracing.start(rankedTraceOptions({RANKED_TRACE_FULL_SCREENSHOTS:full?'1':'0'}));
  // A bounded diagnostic fixture, not a claim to have rerun the historical
  // 180-second incident. The production observer still requests its full cap.
  const bounded=new Proxy(page,{get(target,key){if(key==='waitForFunction')return (fn,arg,options)=>{assert.deepEqual(options,{timeout:180000,polling:250});return target.waitForFunction(fn,arg,{...options,timeout:1200});};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
  let failed=false;
  try{await observeRankedBoot(bounded,'https://fixture.invalid/',receipt,()=>page.setContent('<canvas width="640" height="360"></canvas><script>let n=0;const c=document.querySelector("canvas").getContext("2d");function f(){n++;c.fillStyle="hsl("+(n*31%360)+",80%,50%)";c.fillRect(0,0,640,360);c.fillStyle="white";c.font="40px sans-serif";c.fillText("boot "+n,60,100);requestAnimationFrame(f)}f()</script>'),{observePhase:phase=>captureRankedBootPhase(page,out,receipt,phase)});}catch(error){failed=true;assert.match(error.message,/Timeout 1200ms/);}
  assert(failed);assert.equal(receipt.status,'failed');await page.screenshot({path:path.join(out,'failure-'+label+'.png')});
  const trace=path.join(out,'trace-'+label+'.zip');await context.tracing.stop({path:trace});await context.close();results.push({full,iteration,receipt,traceBytes:fs.statSync(trace).size});
 }
}finally{await browser.close();}
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({scope:'Real Chromium / Playwright output, 1200ms forced-unready fixture, 3 trials per policy; historical 180-second incident and runner CPU/RSS not measured',results},null,2));
