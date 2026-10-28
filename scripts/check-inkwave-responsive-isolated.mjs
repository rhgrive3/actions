#!/usr/bin/env node
// Run every existing responsive acceptance case in an isolated browser process.
// A long-lived 14-context WebKit matrix can crash late from accumulated process
// resources; never treat the resulting missing case as a pass or skip.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { emitFailedResponsiveProgress } from './lib/inkwave-responsive-progress-summary.mjs';
import { boundedChildStderr } from './lib/inkwave-responsive-diagnostics.mjs';
import { mapResponsiveCases, spawnResponsiveCase } from './ci/inkwave-responsive-child-pool.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const arg = (name) => {
  const i = process.argv.indexOf(name);
  assert(i >= 0 && process.argv[i + 1], 'Required ' + name);
  return path.resolve(process.argv[i + 1]);
};
const source = arg('--source'), evidence = arg('--evidence-dir'), profiles = arg('--profile-dir');
const section = process.argv.includes('--section')
  ? process.argv[process.argv.indexOf('--section') + 1] : 'all';
assert(['core', 'expansion', 'all'].includes(section));
const workersArg = process.argv.indexOf('--workers');
const workers = workersArg < 0 ? 1 : Number(process.argv[workersArg+1]);
assert(Number.isSafeInteger(workers) && workers >= 1 && workers <= 2, 'Responsive workers must be 1 or 2');
const matrix = ['phone-portrait','phone-landscape','small-phone','tablet-portrait',
  'tablet-landscape','tablet-split','desktop'];
fs.mkdirSync(evidence,{recursive:true});
fs.mkdirSync(profiles,{recursive:true});
const report = {
  kind:'production-menu-dom-with-offline-session',
  method:'isolated-browser-process-per-viewport',
  source,section,realDeviceVerified:false,cases:[],errors:[],shards:[]
};
const summaryFile = path.join(evidence,'responsive-result.json');
const cohort=['chromium','webkit'].flatMap(engine=>matrix.map(name=>({engine,name})));
const caseOrder=new Map(cohort.map(({engine,name},index)=>[engine+'-'+name,index]));
function write() {
  const complete = report.cases.length === 14 && report.shards.length === 14
    && report.shards.every(x => x.ok);
  // Parallel completion order must never change canonical evidence ordering.
  report.cases.sort((a,b)=>caseOrder.get(a.engine+'-'+a.name)-caseOrder.get(b.engine+'-'+b.name));
  report.shards.sort((a,b)=>caseOrder.get(a.engine+'-'+a.name)-caseOrder.get(b.engine+'-'+b.name));
  report.status = complete ? 'passed' : 'failed';
  fs.writeFileSync(summaryFile+'.writing',JSON.stringify(report,null,2)+'\n');
  fs.renameSync(summaryFile+'.writing',summaryFile);
  return complete;
}
let expectedInputs=null, expectedRunners=null;
async function runCase({engine,name}) {
  const key=engine+'-'+name;
  const shardDir=path.join(evidence,'cases',key);
  const profileDir=path.join(profiles,key);
  fs.mkdirSync(shardDir,{recursive:true});
  fs.mkdirSync(profileDir,{recursive:true});
  const args=[path.join(root,'scripts/check-inkwave-responsive.mjs'),
    '--source',source,'--section',section,'--engine',engine,'--cases',name,
    '--evidence-dir',shardDir,'--profile-dir',profileDir];
  const startedAt=Date.now();
  console.log(JSON.stringify({event:'responsive-child-start',engine,name}));
  const processResult=workers===1
    ? spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:20*60*1000,maxBuffer:16*1024*1024})
    : await spawnResponsiveCase(process.execPath,args,{cwd:root,timeoutMs:20*60*1000,maxBuffer:16*1024*1024});
  console.log(JSON.stringify({event:'responsive-child-end',engine,name,
    elapsedMs:Date.now()-startedAt,exitCode:processResult.status,signal:processResult.signal,
    processError:processResult.error?.message||null}));
  if(processResult.stdout)process.stdout.write(processResult.stdout);
  if(processResult.stderr)process.stderr.write(processResult.stderr);
  const stderr = boundedChildStderr(processResult.stderr);
  fs.writeFileSync(path.join(shardDir, 'child-stderr.txt'), stderr.text);
  const row={engine,name,exitCode:processResult.status,signal:processResult.signal,
    processError:processResult.error?.message||null,
    stderr: { file: 'child-stderr.txt', totalChars: stderr.totalChars,
      retainedChars: stderr.retainedChars, truncated: stderr.truncated }};
  let fragment;
  try {
    fragment=JSON.parse(fs.readFileSync(path.join(shardDir,'responsive-result.json'),'utf8'));
    row.fragmentStatus=fragment.status;
    assert.equal(fragment.cases.length,1,'Exactly one viewport case required');
    assert.equal(fragment.cases[0].engine,engine);
    assert.equal(fragment.cases[0].name,name);
    assert.equal(fragment.cases[0].status,'passed');
    assert.equal(fragment.status,'passed');
    assert.deepEqual(fragment.errors,[]);
    if(expectedInputs===null){expectedInputs=fragment.sourceHashes;expectedRunners=fragment.runnerHashes;
      report.sourceHashes=expectedInputs;report.runnerHashes=expectedRunners;report.runtimeInstalled=fragment.runtimeInstalled;}
    else {
      assert.deepEqual(fragment.sourceHashes,expectedInputs,'Source drift across browser processes');
      assert.deepEqual(fragment.runnerHashes,expectedRunners,'Runner drift across browser processes');
      assert.equal(fragment.runtimeInstalled,report.runtimeInstalled);
    }
    report.cases.push(fragment.cases[0]);
  } catch(error) {
    row.error=String(error?.stack||error);
    report.errors.push(key+': '+row.error);
  }
  row.ok=processResult.status===0 && !processResult.error && !row.error;
  if(!row.ok && !row.error)report.errors.push(key+': exit '+String(row.exitCode)+' / '+String(row.signal));
  emitFailedResponsiveProgress(row.ok, { shardDir, engine, name, startedAt });
  report.shards.push(row);
  write();
}
// One isolated browser process per viewport, at most two active on a 4-CPU runner.
// Retain every test, source-hash check, failure receipt and the complete 14-case gate.
await mapResponsiveCases(cohort,workers,runCase);
if (!write()) process.exitCode=1;
console.log(JSON.stringify({status:report.status,cases:report.cases.length,shards:report.shards.length,
  errors:report.errors.slice(0,6),evidence:summaryFile}));
