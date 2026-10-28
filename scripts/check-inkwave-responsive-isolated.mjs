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
import { shouldRetryResponsiveSessionLoss, sameResponsiveRecoveryIdentity } from './lib/inkwave-responsive-session-retry.mjs';

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
function write() {
  const complete = report.cases.length === 14 && report.shards.length === 14
    && report.shards.every(x => x.ok);
  report.status = complete ? 'passed' : 'failed';
  fs.writeFileSync(summaryFile+'.writing',JSON.stringify(report,null,2)+'\n');
  fs.renameSync(summaryFile+'.writing',summaryFile);
  return complete;
}
let expectedInputs=null, expectedRunners=null;
for (const engine of ['chromium','webkit']) for (const name of matrix) {
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
  const launch=argv=>spawnSync(process.execPath,argv,{
    cwd:root,encoding:'utf8',timeout:20*60*1000,maxBuffer:16*1024*1024
  });
  let processResult=launch(args), resultDir=shardDir, recovery=null;
  let firstFragment=null;
  try { firstFragment=JSON.parse(fs.readFileSync(path.join(shardDir,'responsive-result.json'),'utf8')); } catch {}
  if(shouldRetryResponsiveSessionLoss({engine,name,processResult,fragment:firstFragment})){
    // Retain the failed original evidence under its own immutable directory.
    // A fresh temporary browser profile is required for an independent retry.
    const retryEvidence=path.join(shardDir,'browser-recovery-1'),
          retryProfile=path.join(profileDir,'browser-recovery-1');
    fs.mkdirSync(retryEvidence,{recursive:true});
    fs.mkdirSync(retryProfile,{recursive:true});
    fs.writeFileSync(path.join(shardDir,'initial-crash-stderr.txt'),boundedChildStderr(processResult.stderr).text);
    recovery={kind:'verified-webkit-session-loss',previousStatus:firstFragment.status,
      initialExitCode:processResult.status,initialSignal:processResult.signal ?? null,
      initialProcessError:processResult.error?.message ?? null,
      originalEvidence:'responsive-result.json',originalStderr:'initial-crash-stderr.txt'};
    console.log(JSON.stringify({event:'responsive-browser-session-retry',engine,name,reason:recovery.kind}));
    const retryArgs=[...args];
    retryArgs[retryArgs.indexOf('--evidence-dir')+1]=retryEvidence;
    retryArgs[retryArgs.indexOf('--profile-dir')+1]=retryProfile;
    processResult=launch(retryArgs);resultDir=retryEvidence;
  }
  console.log(JSON.stringify({event:'responsive-child-end',engine,name,
    elapsedMs:Date.now()-startedAt,exitCode:processResult.status,signal:processResult.signal,
    processError:processResult.error?.message||null}));
  if(processResult.stdout)process.stdout.write(processResult.stdout);
  if(processResult.stderr)process.stderr.write(processResult.stderr);
  const stderr = boundedChildStderr(processResult.stderr);
  fs.writeFileSync(path.join(shardDir, 'child-stderr.txt'), stderr.text);
  const row={engine,name,...(recovery?{recovery,fragmentFile:path.relative(shardDir,path.join(resultDir,'responsive-result.json'))}:{}),exitCode:processResult.status,signal:processResult.signal,
    processError:processResult.error?.message||null,
    stderr: { file: 'child-stderr.txt', totalChars: stderr.totalChars,
      retainedChars: stderr.retainedChars, truncated: stderr.truncated }};
  let fragment;
  try {
    fragment=JSON.parse(fs.readFileSync(path.join(resultDir,'responsive-result.json'),'utf8'));
    row.fragmentStatus=fragment.status;
    assert.equal(fragment.cases.length,1,'Exactly one viewport case required');
    assert.equal(fragment.cases[0].engine,engine);
    assert.equal(fragment.cases[0].name,name);
    assert.equal(fragment.cases[0].status,'passed');
    assert.equal(fragment.status,'passed');
    assert.deepEqual(fragment.errors,[]);
    if(recovery) assert.ok(sameResponsiveRecoveryIdentity(firstFragment,fragment), 'Recovered attempt source or runner identity differs from the initial attempt');
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
  emitFailedResponsiveProgress(row.ok, { shardDir: resultDir, engine, name, startedAt });
  report.shards.push(row);
  write();
}
if (!write()) process.exitCode=1;
console.log(JSON.stringify({status:report.status,cases:report.cases.length,shards:report.shards.length,
  errors:report.errors.slice(0,6),evidence:summaryFile}));
