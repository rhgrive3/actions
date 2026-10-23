// QA port/source preservation and never-resolving page double; no GPU claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const base='433299cb5e1518458e00f520d0a9845baa560db3';
const modulePath='scripts/check-inkwave-idle-resources.mjs';
const before=execFileSync('git',['show',`${base}:${modulePath}`],{cwd:root,encoding:'utf8'});
const after=fs.readFileSync(path.join(root,modulePath),'utf8');
const source=await import(pathToFileURL(path.join(root,modulePath)).href);
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
// Ask the JS parser for the first complete callback expression. The actual
// evaluate functions are blocks or identifiers; do not execute their bodies.
function callbacks(text){
 const result=[];
 for(const m of text.matchAll(/\b(?:page|coldPage)\.evaluate\(/g)){
  const start=m.index+m[0].length;let callback;
  for(let i=start;i<text.length;i++)if(text[i]===','||text[i]===')'){
   const candidate=text.slice(start,i);
   try{new vm.Script('('+candidate+')');callback=candidate;break;}catch{}
  }
  assert(callback,'parse evaluate callback');result.push(callback);
 }
 return result;
}
const oldCallbacks=callbacks(before),newCallbacks=callbacks(after);
assert.equal(oldCallbacks.length,12);assert.deepEqual(newCallbacks,oldCallbacks);
const existingFunctions=['validateIdleResult','observeColdEnvironment','inspectColdBoot','retireDesktopForCold','closeProbeOwner','launchColdMobileBrowser'];
const functionChecks=Object.fromEntries(existingFunctions.map(name=>{
 const expression=source[name].toString();assert(before.includes(expression),name+' body changed');
 return [name,digest(expression)];
}));
const flags=s=>s.match(/^const BROWSER_ARGS=.*$/m)?.[0];
assert.equal(flags(after),flags(before));
const timeouts=s=>[...s.matchAll(/timeout:(\d+)|setTimeout\([^,]*,(\d+)\)/g)].map(m=>Number(m[1]||m[2]));
assert.deepEqual(timeouts(after),timeouts(before));
assert.equal(source.IDLE_OPERATION_TIMEOUT_MS,120000);assert.match(before,/page\.setDefaultTimeout\(120000\)/);
async function desktopSetup(text){
 let now=0,serial=0,configuredTimeout;const pending=new Map();
 const timers={setTimeout(fn,ms){const id=++serial;pending.set(id,{fn,due:now+ms});return id;},clearTimeout(id){pending.delete(id);}};
 const page={evaluate:()=>new Promise(()=>{}),setDefaultTimeout(ms){configuredTimeout=ms;},on(){},async route(){},async addInitScript(){},async goto(){},async waitForFunction(_fn,_arg,options){assert.equal(options.timeout,180000);}};
 const start=text.indexOf('\n  page=',text.indexOf('browser=await chromium.launchPersistentContext'));
 const first=text.indexOf('await page.evaluate(',start),end=text.indexOf('\n',first);assert(start>=0&&first>start&&end>first);
 const context={browser:{newPage:async()=>page},boundIdleEvaluations:(p,phase)=>source.boundIdleEvaluations(p,phase,timers),IDLE_OPERATION_TIMEOUT_MS:120000,phase:'setup',errors:[],loaded:new Set(),address:'http://localhost/'};
 const state={settled:false};
 vm.runInNewContext('(async()=>{'+text.slice(start,end)+'})()',context).then(()=>{state.settled=true;},error=>Object.assign(state,{settled:true,code:error.code,phase:error.phase}));
 for(let i=0;i<60;i++)await Promise.resolve();const timersAtStart=pending.size;
 now=120000;for(const [id,timer]of [...pending])if(timer.due<=now&&pending.delete(id))timer.fn();
 for(let i=0;i<60;i++)await Promise.resolve();
 return {...state,configuredTimeout,timersAtStart,timersRemaining:pending.size};
}
const oldSetup=await desktopSetup(before),newSetup=await desktopSetup(after);
assert.equal(oldSetup.settled,false);assert.equal(oldSetup.timersAtStart,0);
assert.equal(newSetup.settled,true);assert.equal(newSetup.code,'INKWAVE_IDLE_EVALUATION_TIMEOUT');assert.equal(newSetup.timersAtStart,1);
const donorFiles={
 'scripts/check-inkwave-idle-resources.mjs':'bc5ad497b0b2d3e5f21e792d9c0ced0608b822d9',
 'scripts/tests/inkwave-idle-evaluate-deadline.test.mjs':'0dcb6fe498086c81a2c5218347ca7cd8f451274f',
 'scripts/tests/inkwave-idle-resources-gates.test.mjs':'d384824f3ac170167db9ff5e3dd0a62ee77e7518',
};
for(const [file,expected]of Object.entries(donorFiles)){
 const data=fs.readFileSync(path.join(root,file));
 const actual=crypto.createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');assert.equal(actual,expected,file);
}
const productionDiff=execFileSync('git',['diff',base,'--','inkwave-public','patches/splatoon3/runtime','.github/workflows/validate-inkwave-update.yml'],{cwd:root,encoding:'utf8'});assert.equal(productionDiff,'');
const result={base,donor:'2d164d063050c15266febcb6af88109938f26701',donorFiles,evaluateCallbacks:oldCallbacks.map(digest),existingFunctions:functionChecks,browserArgs:flags(after),existingExplicitTimeouts:timeouts(after),operationDeadline:120000,actualDesktopSetup:{before:oldSetup,candidate:newSetup},productionAndWorkflowDiffBytes:productionDiff.length,limits:'Doubles and source preservation only; no browser/GPU/hosted-CI pass, no root-cause claim for external runner shutdown.'};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
