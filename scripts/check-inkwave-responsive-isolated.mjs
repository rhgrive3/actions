#!/usr/bin/env node
// Run every existing responsive acceptance case in an isolated browser process.
// A long-lived 14-context WebKit matrix can crash late from accumulated process
// resources; never treat the resulting missing case as a pass or skip.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundedChildStderr } from './lib/inkwave-responsive-diagnostics.mjs';

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
  const processResult=spawnSync(process.execPath,args,{
    cwd:root,encoding:'utf8',timeout:20*60*1000,maxBuffer:16*1024*1024
  });
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
  report.shards.push(row);
  write();
}
if (!write()) process.exitCode=1;
console.log(JSON.stringify({status:report.status,cases:report.cases.length,shards:report.shards.length,
  errors:report.errors.slice(0,6),evidence:summaryFile}));
