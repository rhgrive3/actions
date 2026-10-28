import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldRetryResponsiveSessionLoss as admit, sameResponsiveRecoveryIdentity as sameIdentity} from '../lib/inkwave-responsive-session-retry.mjs';
// Data shape/timing captured from official 2784 failed small-phone artifact
// 12810706635. Its bounded ring dropped earlier events; first-error is a
// single persistent error in the unchanged runner and cleanup starts once.
const message='page.evaluate: Target page, context or browser has been closed';
const failure=()=>({engine:'webkit',name:'small-phone',processResult:{status:1,signal:null,error:null},
 fragment:{status:'failed',error:message,errors:[],cases:[{engine:'webkit',name:'small-phone',status:'failed',error:message,diagnostics:{pageUnavailable:true,droppedEvents:247,firstError:{message},events:[
 {type:'page-crash',ms:44050,detail:''},{type:'first-error',ms:44051,detail:message},
 {type:'context-close-start',ms:44053,detail:''},{type:'page-close',ms:44056,detail:''},
 {type:'context-close',ms:44073,detail:''},{type:'browser-disconnected',ms:44073,detail:''}]}}]}});
test('only explicit failed WebKit browser session loss admits one fresh-process verification',()=>{
 assert.equal(admit(failure()),true);
 for(const patch of [
  x=>x.engine='chromium',x=>x.processResult.status=0,x=>x.processResult.signal='SIGTERM',
  x=>x.processResult.error=Error('killed'),x=>x.fragment.status='passed',
  x=>x.fragment.error='AssertionError: viewport overflow',
  x=>x.fragment.errors.push('UI behavior mismatch'),
  x=>x.fragment.cases[0].name='tablet-landscape',
  x=>x.fragment.cases[0].status='passed',
  x=>x.fragment.cases[0].diagnostics.pageUnavailable=false,
  x=>x.fragment.cases[0].diagnostics.events=[{type:'first-error'}],
  x=>x.fragment.cases.push({...x.fragment.cases[0]}),
 ]){const x=failure();patch(x);assert.equal(admit(x),false);}
});
test('empty, malformed or code-failure receipts cannot authorize a browser retry',()=>{
 for(const x of [null,{},false,{engine:'webkit'}, {...failure(),fragment:null},
  {...failure(),fragment:{status:'failed',error:'Target closed',errors:[],cases:[]}}])assert.equal(admit(x),false);
});
test('cleanup close and disconnect after error are never independent crash proof',()=>{const x=failure(),d=x.fragment.cases[0].diagnostics;d.events=d.events.filter(e=>e.type!=='page-crash');assert.equal(admit(x),false)});
test('a crash at or after cleanup start or after primary failure is rejected',()=>{for(const where of [1,2,3]){const x=failure(),d=x.fragment.cases[0].diagnostics,crash=d.events.shift();d.events.splice(where,0,{...crash,ms:d.events[where-1].ms});assert.equal(admit(x),false)}});
test('missing, dropped or contradictory provenance fails closed',()=>{for(const patch of [
 d=>delete d.firstError, d=>delete d.droppedEvents,d=>d.droppedEvents=-1,
 d=>d.events=d.events.filter(e=>e.type!=='first-error'),d=>d.events=d.events.filter(e=>e.type!=='context-close-start'),
 d=>d.events[1].detail='different error',d=>d.firstError.message='different error',
 d=>d.events[0].ms=Infinity,d=>d.events[0].ms=50000,
 d=>d.events.unshift({type:'page-close',ms:44049,detail:''}),
 d=>d.events.unshift({type:'context-close-start',ms:44049,detail:''}),
 d=>d.events.unshift({type:'fatal-pageerror-context-closing',ms:44049,detail:''}),
 d=>d.events.push({type:'first-error',ms:44074,detail:message}),
 d=>d.events.push({type:'context-close-start',ms:44074,detail:''}),
 ]){const x=failure();patch(x.fragment.cases[0].diagnostics);assert.equal(admit(x),false)}});
test('row and primary error must be identical',()=>{const x=failure();x.fragment.cases[0].error='different error';assert.equal(admit(x),false)});

test('malformed arrays, missing rows and oversized event lists fail closed',()=>{for(const patch of [
 x=>x.fragment.errors='',x=>x.fragment.errors={},x=>x.fragment.cases=[null],x=>x.fragment.cases={length:1},
 x=>x.fragment.cases[0].diagnostics.events=Array(33).fill({type:'page-crash',ms:0}),
 ]){const x=failure();patch(x);assert.equal(admit(x),false)}});

test('recovered source, runner and runtime identity must match the initial attempt',()=>{const before={sourceHashes:{'a':'a'.repeat(64)},runnerHashes:{'b':'b'.repeat(64)},runtimeInstalled:true};assert.equal(sameIdentity(before,structuredClone(before)),true);for(const mutate of [x=>x.sourceHashes.a='c'.repeat(64),x=>x.runnerHashes.b='c'.repeat(64),x=>x.runtimeInstalled=false,x=>delete x.sourceHashes,x=>x.sourceHashes={},x=>x.runnerHashes.b='bad',x=>x.sourceHashes.extra='d'.repeat(64),x=>delete x.runtimeInstalled]){const x=structuredClone(before);mutate(x);assert.equal(sameIdentity(before,x),false)}assert.equal(sameIdentity({},{}),false)});

test('actual isolated runner preserves first attempt and rejects recovered identity drift',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path'),{spawnSync}=await import('node:child_process');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'responsive-retry-'));
 try {
  const scripts=path.join(root,'scripts'),lib=path.join(scripts,'lib');fs.mkdirSync(lib,{recursive:true});fs.mkdirSync(path.join(scripts,'ci'),{recursive:true});
  for(const f of ['check-inkwave-responsive-isolated.mjs','ci/inkwave-responsive-child-pool.mjs','lib/inkwave-responsive-session-retry.mjs','lib/inkwave-responsive-progress-summary.mjs','lib/inkwave-responsive-diagnostics.mjs','lib/inkwave-responsive-animation-diagnostics.mjs']) {
   fs.copyFileSync(new URL('../'+f,import.meta.url),path.join(scripts,f));
  }
  const runner=path.join(scripts,'check-inkwave-responsive-isolated.mjs');const production=fs.readFileSync(runner,'utf8'),replaced=production.replace("import { spawnSync } from 'node:child_process';","import { spawnSync } from './fake-child.mjs';");assert.notEqual(production,replaced);fs.writeFileSync(runner,replaced);
  const child=`import fs from 'node:fs';import path from 'node:path';export function spawnSync(command,args,options){if(options.timeout!==20*60*1000)throw Error('deadline changed');const arg=k=>args[args.indexOf(k)+1],engine=arg('--engine'),name=arg('--cases'),dir=arg('--evidence-dir'),retry=dir.includes('browser-recovery-1'),initial=engine==='webkit'&&name==='small-phone'&&!retry;let sourceHashes={source:'a'.repeat(64)},runnerHashes={runner:'b'.repeat(64)},runtimeInstalled=true;if(initial&&process.env.FIXTURE_DRIFT==='source')sourceHashes.source='c'.repeat(64);if(initial&&process.env.FIXTURE_DRIFT==='runner')runnerHashes.runner='c'.repeat(64);if(initial&&process.env.FIXTURE_DRIFT==='runtime')runtimeInstalled=false;if(initial&&process.env.FIXTURE_DRIFT==='missing')sourceHashes={};const msg='page.evaluate: Target page, context or browser has been closed';const diag={pageUnavailable:true,droppedEvents:0,firstError:{message:msg},events:[{type:'page-crash',ms:1,detail:''},{type:'first-error',ms:2,detail:msg},{type:'context-close-start',ms:3,detail:''}]};const row={engine,name,status:initial?'failed':'passed',...(initial?{error:msg,diagnostics:diag}:{})};fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'responsive-result.json'),JSON.stringify({status:initial?'failed':'passed',...(initial?{error:msg}:{}),errors:[],cases:[row],sourceHashes,runnerHashes,runtimeInstalled}));return {status:initial?1:0,signal:null,error:null,stdout:'',stderr:''}}`;
  fs.writeFileSync(path.join(scripts,'fake-child.mjs'),child);
  for(const mode of ['none','source','runner','runtime','missing']){
   const dir=path.join(root,mode),evidence=path.join(dir,'evidence'),profiles=path.join(dir,'profiles');
   const result=spawnSync(process.execPath,[path.join(scripts,'check-inkwave-responsive-isolated.mjs'),'--source',path.join(root,'site'),'--section','all','--evidence-dir',evidence,'--profile-dir',profiles],{encoding:'utf8',env:{...process.env,FIXTURE_DRIFT:mode},timeout:30000,maxBuffer:1024*1024});
   assert.equal(result.error,undefined);assert.equal(result.status,mode==='none'?0:1,mode+' '+result.stderr);
   const report=JSON.parse(fs.readFileSync(path.join(evidence,'responsive-result.json'))),row=report.shards.find(x=>x.engine==='webkit'&&x.name==='small-phone');
   assert.equal(row.recovery.previousStatus,'failed');assert.equal(row.recovery.initialExitCode,1);assert.equal(row.recovery.initialSignal,null);assert.equal(row.recovery.initialProcessError,null);assert.equal(row.ok,mode==='none');
   const shard=path.join(evidence,'cases','webkit-small-phone');assert.equal(JSON.parse(fs.readFileSync(path.join(shard,row.recovery.originalEvidence))).status,'failed');assert.equal(JSON.parse(fs.readFileSync(path.join(shard,row.fragmentFile))).status,'passed');
   if(mode!=='none')assert.match(row.error,/Recovered attempt source or runner identity differs/);
  }
 } finally {fs.rmSync(root,{recursive:true,force:true})}
});
