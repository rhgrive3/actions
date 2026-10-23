// Host-side QA supervision only. These doubles make no browser/GPU acceptance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {
  IDLE_OPERATION_TIMEOUT_MS, boundIdleEvaluations, runIdleProbe,
  idleFailureReporter, closeIdleResources, primaryIdleFailure, closeProbeOwner,
} from '../check-inkwave-idle-resources.mjs';

function clock() {
  let now=0,serial=0;const pending=new Map(),delays=[];
  return {pending,delays,
    setTimeout(fn,ms){const id=++serial;delays.push(ms);pending.set(id,{fn,due:now+ms});return id;},
    clearTimeout(id){pending.delete(id);},
    tick(ms){now+=ms;for(const [id,timer]of [...pending])if(timer.due<=now&&pending.delete(id))timer.fn();},
  };
}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function observe(promise){const state={settled:false};state.done=promise.then(value=>{Object.assign(state,{settled:true,value});},error=>{Object.assign(state,{settled:true,error});});return state;}
function rig(evaluate,{ownerError,serverError,publishError,publish}={}){
  const timers=clock(),order=[],receipts=[];let screenshots=0,phase='gpu-identity';
  const page=boundIdleEvaluations({evaluate,screenshot:async options=>{screenshots++;order.push('screenshot');assert.equal(options.path,'/evidence/failure.png');}},()=>phase,timers);
  const available={phase,result:{audio:{sfxPlayed:true}},errors:[],sourceSha:'pinned-test-source'};
  const diagnose=idleFailureReporter({
    publish(receipt){order.push('failed-receipt');if(publishError)throw publishError;receipts.push(structuredClone(receipt));publish?.(receipt);},
    snapshot:()=>available,page:()=>page,screenshotPath:'/evidence/failure.png',
  });
  const owner={async close(){order.push('owner-close');if(ownerError)throw ownerError;}};
  const server={close(done){order.push('server-close');done(serverError);}};
  return {page,timers,order,receipts,available,diagnose,
    setPhase(value){phase=value;},screenshots:()=>screenshots,
    run:()=>runIdleProbe(()=>page.evaluate(()=> 'native callback identity',{aim:'unchanged'}),{diagnose,cleanup:error=>closeIdleResources(owner,server,error)}),
  };
}

test('ordinary success returns the exact value after cleanup, clears its timer and never diagnoses',async()=>{
  const expected={accepted:'component value; not GPU evidence'};
  const f=rig(function(fn,arg){assert.equal(this,f.page);assert.equal(typeof fn,'function');assert.deepEqual(arg,{aim:'unchanged'});return Promise.resolve(expected);});
  const value=await f.run();assert.equal(value,expected);
  assert.deepEqual(f.order,['owner-close','server-close']);assert.equal(f.receipts.length,0);
  assert.equal(f.timers.pending.size,0);assert.deepEqual(f.timers.delays,[120000]);
});

for(const synchronous of [false,true])test(`ordinary ${synchronous?'synchronous':'asynchronous'} evaluate failure keeps its identity and diagnostics precede cleanup`,async()=>{
  const original=Error('original browser failure');
  const f=rig(()=>{if(synchronous)throw original;return Promise.reject(original);});
  await assert.rejects(f.run(),error=>error===original);
  assert.deepEqual(f.order,['failed-receipt','screenshot','owner-close','server-close']);
  assert.equal(f.receipts[0].status,'failed');assert.equal(f.receipts[0].primaryError,original.stack);
  assert.deepEqual(f.receipts[0].result,f.available.result);assert.equal(f.timers.pending.size,0);
});

test('never-resolving evaluate rejects at the existing 120 seconds, writes available evidence, then cleans up',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'idle-deadline-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'receipt.json');let evaluations=0;
  const f=rig(()=>{evaluations++;return new Promise(()=>{});},{publish:r=>fs.writeFileSync(file,JSON.stringify(r))});
  const work=observe(f.run());await flush();
  assert.equal(IDLE_OPERATION_TIMEOUT_MS,120000);assert.equal(evaluations,1);
  f.timers.tick(119999);await flush();assert.equal(work.settled,false);assert.equal(fs.existsSync(file),false);
  f.setPhase('later-phase-must-not-rename-operation');f.timers.tick(1);await work.done;
  assert.equal(work.error.code,'INKWAVE_IDLE_EVALUATION_TIMEOUT');assert.equal(work.error.phase,'gpu-identity');
  assert.equal(work.error.timeoutMs,120000);assert.equal(f.timers.pending.size,0);
  const receipt=JSON.parse(fs.readFileSync(file));assert.equal(receipt.status,'failed');
  assert.deepEqual(receipt.operation,{phase:'gpu-identity',timeoutMs:120000,code:'INKWAVE_IDLE_EVALUATION_TIMEOUT'});
  assert.deepEqual(receipt.result,f.available.result);assert.equal(receipt.primaryError,work.error.stack);
  assert.equal(f.screenshots(),0,'a timed-out page is not asked for another potentially stalled call');
  assert.deepEqual(f.order,['failed-receipt','owner-close','server-close']);
});

for(const late of ['resolve','reject'])test(`late evaluate ${late} after timeout cannot overwrite the failed receipt`,async()=>{
  let settle;
  const f=rig(()=>new Promise((resolve,reject)=>{settle=late==='resolve'?()=>resolve({late:true}):()=>reject(Error('target closed after timeout'));}));
  const work=observe(f.run());await flush();f.timers.tick(120000);await work.done;
  const primary=work.error;settle();await flush();
  assert.equal(work.error,primary);assert.equal(f.receipts.length,1);assert.equal(f.receipts[0].status,'failed');
  assert.equal(f.timers.pending.size,0);assert.equal(f.order.filter(x=>x==='owner-close').length,1);
});

test('timeout remains primary if cleanup also fails; the server is still closed and both errors are recorded',async()=>{
  const closeError=Error('browser close failed');const f=rig(()=>new Promise(()=>{}),{ownerError:closeError});
  const work=observe(f.run());await flush();f.timers.tick(120000);await work.done;
  assert(work.error instanceof AggregateError);const primary=primaryIdleFailure(work.error);
  assert.equal(primary.code,'INKWAVE_IDLE_EVALUATION_TIMEOUT');assert.equal(work.error.cause,primary);
  assert.equal(work.error.errors[0],primary);assert.equal(work.error.errors[1],closeError);
  assert.equal(f.receipts.length,2);assert(f.receipts.every(r=>r.status==='failed'&&r.primaryError===primary.stack));
  assert(f.receipts[1].relatedErrors.includes(closeError.stack));assert.equal(f.screenshots(),0);
  assert.deepEqual(f.order,['failed-receipt','owner-close','server-close','failed-receipt']);assert.equal(f.timers.pending.size,0);
});

test('cleanup failure after an ordinary pass fails the probe instead of committing success',async()=>{
  const closeError=Error('close after pass failed');const f=rig(()=>Promise.resolve({accepted:true}),{ownerError:closeError});
  await assert.rejects(f.run(),error=>error===closeError);
  assert.equal(f.receipts.length,1);assert.equal(f.receipts[0].status,'failed');
  assert.deepEqual(f.order,['owner-close','server-close','failed-receipt','screenshot']);assert.equal(f.timers.pending.size,0);
});

test('diagnostic write failure cannot erase the original error or prevent cleanup',async()=>{
  const original=Error('original evaluate error'),writeError=Error('evidence disk full');
  const f=rig(()=>Promise.reject(original),{publishError:writeError});
  await assert.rejects(f.run(),error=>error instanceof AggregateError&&error.cause===original&&error.errors[0]===original&&error.errors[1]===writeError);
  assert.deepEqual(f.order,['failed-receipt','owner-close','server-close']);assert.equal(f.timers.pending.size,0);
});

test('browser and server cleanup failures retain the operation error in order',async()=>{
  const original=Error('operation'),browserError=Error('browser close'),serverError=Error('server close');
  const f=rig(()=>Promise.reject(original),{ownerError:browserError,serverError});
  await assert.rejects(f.run(),error=>error instanceof AggregateError&&error.cause===original&&error.errors[0]===original&&error.errors[1]===browserError&&error.errors[2]===serverError);
  assert.equal(f.order.filter(x=>x==='screenshot').length,1,'diagnostic retries do not repeat browser capture');
  assert.equal(f.timers.pending.size,0);
});

test('guarding the same page twice does not nest deadlines or invoke evaluate twice',async()=>{
  const timers=clock();let calls=0;const page={evaluate:async()=>++calls};
  boundIdleEvaluations(page,()=> 'first',timers);const guarded=page.evaluate;
  assert.equal(boundIdleEvaluations(page,()=> 'second',timers),page);assert.equal(page.evaluate,guarded);
  assert.equal(await page.evaluate(()=>{}),1);assert.deepEqual(timers.delays,[120000]);assert.equal(timers.pending.size,0);
});

test('falsy thrown values remain failures and cyclic error causes cannot hang reporting',async()=>{
  const records=[];let cleaned=false;
  const work=observe(runIdleProbe(()=>{throw 0;},{diagnose:e=>records.push(e),cleanup:()=>{cleaned=true;}}));await work.done;
  assert.equal(work.error,0);assert.equal(cleaned,true);assert.deepEqual(records,[0]);
  const cyclic=new AggregateError([],'cyclic');cyclic.cause=cyclic;assert.equal(primaryIdleFailure(cyclic),cyclic);
});

test('actual cold route retains the original evaluation timeout instead of a later navigation error',async()=>{
  const source=fs.readFileSync(new URL('../check-inkwave-idle-resources.mjs',import.meta.url),'utf8');
  const start=source.indexOf("await coldPage.route(address+'**',"),end=source.indexOf('\n   await coldPage.goto',start);
  assert(start>=0&&end>start);
  const callback=source.slice(start+"await coldPage.route(address+'**',".length,end).trim().replace(/\);$/,'');
  const timers=clock(),page=boundIdleEvaluations({evaluate:()=>new Promise(()=>{})},()=> 'cold-boot-mobile',timers);
  const context={URL,Date,manifest:{artifacts:{}},coldPage:page,observeColdEnvironment(){},coldLoaded:new Set(),coldPending:new Map(),pendingSerial:0,pendingDropped:0,errors:[],hooked:false,mainReleased:false,coldEvaluationError:null};
  const route=vm.runInNewContext('('+callback+')',context);let aborted=0;
  const url='http://localhost/_versions/r/src/main.js';
  const pending=route({request:()=>({url:()=>url,resourceType:()=> 'script'}),fetch:async()=>({url:()=>url,body:async()=>''}),fulfill:async()=>assert.fail('timed-out route cannot release main'),abort:async()=>{aborted++;}});
  await flush();timers.tick(120000);await pending;
  const original=context.coldEvaluationError;assert.equal(original.code,'INKWAVE_IDLE_EVALUATION_TIMEOUT');
  assert.equal(aborted,1);assert.equal(context.coldPending.size,0);assert.equal(timers.pending.size,0);
  context.error=Error('later navigation timeout');
  const selection=source.match(/coldError=coldEvaluationError\?\?error;/)?.[0];assert(selection);
  vm.runInNewContext(selection,context);assert.equal(context.coldError,original);
});

test('actual desktop setup bounds its first evaluate, rather than only setting Playwright default timeout',async()=>{
  const source=fs.readFileSync(new URL('../check-inkwave-idle-resources.mjs',import.meta.url),'utf8');
  const start=source.indexOf('\n  page=',source.indexOf('browser=await chromium.launchPersistentContext'));
  const first=source.indexOf('await page.evaluate(',start),end=source.indexOf('\n',first);
  assert(start>=0&&first>start&&end>first);
  const timers=clock();let configuredTimeout,closes=0;
  const page={evaluate:()=>new Promise(()=>{}),setDefaultTimeout(ms){configuredTimeout=ms;},on(){},async route(){},async addInitScript(){},async goto(){},async waitForFunction(_fn,_arg,options){assert.equal(options.timeout,180000);}};
  const context={browser:{newPage:async()=>page},boundIdleEvaluations:(p,phase)=>boundIdleEvaluations(p,phase,timers),IDLE_OPERATION_TIMEOUT_MS,phase:'setup',errors:[],loaded:new Set(),address:'http://localhost/'};
  const work=observe(vm.runInNewContext('(async()=>{'+source.slice(start,end)+'})()',context));
  for(let i=0;i<40;i++)await Promise.resolve();
  assert.equal(configuredTimeout,120000);assert.equal(timers.pending.size,1,'real checker setup must install the host deadline');
  timers.tick(119999);await flush();assert.equal(work.settled,false);
  timers.tick(1);await work.done;assert.equal(work.error.code,'INKWAVE_IDLE_EVALUATION_TIMEOUT');
  await closeIdleResources({close:async()=>{closes++;}},null,work.error);
  assert.equal(closes,1);assert.equal(timers.pending.size,0);
});

for(const failsClose of [false,true])test(`actual cold timeout persists observations before ${failsClose?'failing':'ordinary'} browser cleanup`,async()=>{
  const source=fs.readFileSync(new URL('../check-inkwave-idle-resources.mjs',import.meta.url),'utf8');
  const start=source.indexOf('  } catch(error) {\n   coldError='),end=source.indexOf('\n  result.errors=errors;',start);
  assert(start>=0&&end>start);
  const original=Object.assign(Error('cold evaluation deadline'),{code:'INKWAVE_IDLE_EVALUATION_TIMEOUT',phase:'cold-boot-mobile',timeoutMs:120000});
  const closeError=Error('cold browser close failed'),order=[],receipts=[],result={};
  const diagnose=idleFailureReporter({publish:r=>{order.push('failed-receipt');receipts.push(r);},snapshot:()=>({phase:'cold-boot-mobile',result}),page:()=>null,screenshotPath:'unused'});
  const context={original,diagnose,result,closeProbeOwner,primaryIdleFailure,AggregateError,Date,
    coldEvaluationError:original,coldError:null,hooked:true,mainReleased:false,page:null,
    coldLoaded:new Set(['src/core/ctx.js']),coldPending:new Map(),pendingDropped:0,
    coldContext:{async close(){order.push('cold-close');assert.equal(receipts[0]?.status,'failed','cold evidence must precede cleanup');if(failsClose)throw closeError;}}};
  const helper=source.slice(source.indexOf('const combineFailure='),source.indexOf('// Failure diagnostics'));
  const work=observe(vm.runInNewContext(helper+'\n(async()=>{try{throw original;'+source.slice(start,end)+'\n})()',context));
  await work.done;assert.equal(primaryIdleFailure(work.error),original);
  assert.deepEqual(order,['failed-receipt','cold-close']);assert.equal(receipts[0].primaryError,original.stack);
  assert.equal(result.coldDiagnostic.inspectionUnavailable.includes('deadline'),true);
  if(failsClose){assert.equal(work.error.errors[1],closeError);assert.equal(result.coldDiagnostic.closeError,String(closeError));}
  else assert.equal(work.error,original);
});
