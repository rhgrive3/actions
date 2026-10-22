import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {runBounded,childPassed,childEnvironment,bindSite,verifySite,bindSource,verifySource,sha256} from '../run-inkwave-turf-finish-isolated.mjs';
// These process-liveness assertions require Linux /proc, as on Ubuntu CI.
assert.equal(process.platform,'linux','Guard liveness checks require Linux /proc');
const counts={tests:1,pass:1,fail:0,skipped:0};
test('handled timeout cannot pass even with status zero and passing counts',()=>{
 const run=spawnSync(process.execPath,['--max-old-space-size=64','-e',"process.on('SIGTERM',()=>process.exit(0)); console.log('ready'); setInterval(()=>{},1000)"],{timeout:500,encoding:'utf8',maxBuffer:4096});
 assert.equal(run.error?.code,'ETIMEDOUT');assert.equal(run.status,0);assert.equal(run.signal,null);assert.equal(childPassed(run,counts),false);
 assert.equal(childPassed({status:0,error:null,signal:'SIGTERM'},counts),false);
 assert.equal(childPassed({status:0,error:null,signal:null},counts),true);
});
test('all inherited alternate input and mode selectors are removed; only declared emitted site survives',()=>{
 const parent={PATH:'/bin',INKWAVE_UPSTREAM_SOURCE:'/wrong',INKWAVE_BUILT_ROOT:'/wrong',INKWAVE_BUILT_SITE:'/wrong',INKWAVE_TURF_FINISH_SITE:'/wrong',INKWAVE_NATIVE_STAGE_ASSETS:'/wrong',INKWAVE_DISABLE_FIXTURE_CACHES:'1',INKWAVE_FUTURE_SELECTOR:'/wrong',NODE_OPTIONS:'--require /wrong',NODE_PATH:'/wrong',NODE_TEST_CONTEXT:'child-v8'};
 const source=childEnvironment(parent,'source');assert(!Object.keys(source).some(k=>k.startsWith('INKWAVE_')||k.startsWith('NODE_TEST_')));assert.equal(source.NODE_PATH,undefined);assert.equal(source.NODE_OPTIONS,'--max-old-space-size=384');
 const emitted=childEnvironment(parent,'emitted','/declared');assert.deepEqual(Object.keys(emitted).filter(k=>k.startsWith('INKWAVE_')).sort(),['INKWAVE_BUILT_SITE','INKWAVE_TURF_FINISH_SITE']);assert.equal(emitted.INKWAVE_BUILT_SITE,'/declared');assert.equal(emitted.INKWAVE_TURF_FINISH_SITE,'/declared');
});
function make(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'turf-guard-v2-'));const runtime=path.join(dir,'runtime.mjs');fs.writeFileSync(runtime,'export const n=1;');const manifest=path.join(dir,'inkwave-build.json');fs.writeFileSync(manifest,JSON.stringify({artifacts:{'runtime.mjs':sha256(fs.readFileSync(runtime))},inputHash:'test',contentHash:'test',build:{revision:'test'}}));return {dir,runtime,manifest};}
test('altered actual runtime is rejected even when its manifest is untouched',()=>{const x=make();const b=bindSite(x.dir);const manifest=fs.readFileSync(x.manifest);fs.writeFileSync(x.runtime,'export const n=2;');assert.deepEqual(fs.readFileSync(x.manifest),manifest);assert.throws(()=>verifySite(b),/artifact bytes changed/);assert.throws(()=>bindSite(x.dir),/artifact bytes changed/);});
test('manifest identity drift and added undeclared payloads are rejected',()=>{const x=make(),b=bindSite(x.dir);fs.appendFileSync(x.manifest,' ');assert.throws(()=>verifySite(b),/Build identity changed/);const y=make(),c=bindSite(y.dir);fs.writeFileSync(path.join(y.dir,'extra.mjs'),'export{}');assert.throws(()=>verifySite(c),/inventory changed/);});
test('source closure detects runtime, helper and inventory drift',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'turf-source-v2-'));for(const p of ['patches','scripts','inkwave-public'])fs.mkdirSync(path.join(dir,p));const file=path.join(dir,'scripts/helper.mjs');fs.writeFileSync(file,'export{}');const b=bindSource(dir);verifySource(b);fs.writeFileSync(file,'export const changed=true;');assert.throws(()=>verifySource(b),/Source closure changed/);});

function active(pid){try{const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8');return stat.slice(stat.lastIndexOf(')')+2).split(' ')[0]!=='Z';}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function dead(pid){for(let i=0;i<40&&active(pid);i++)await new Promise(r=>setTimeout(r,25));assert.equal(active(pid),false,'Live descendant survived group cleanup: '+pid);}
test('ignored SIGTERM is forcibly bounded and cannot pass',async()=>{
 const start=performance.now();const run=await runBounded(process.execPath,['-e',"process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)"],{timeout:500,maxBuffer:4096});
 assert.equal(run.error?.code,'ETIMEDOUT');assert.equal(run.signal,'SIGKILL');assert.equal(childPassed(run,counts),false);assert(performance.now()-start<3000);await dead(Number(run.stdout.trim()));
});
test('timeout kills ordinary Node test-style descendants as well as leader',async()=>{
 const code="const {spawn}=require('node:child_process');process.on('SIGTERM',()=>{});const c=spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)\"],{stdio:['ignore','inherit','inherit']});console.log(process.pid);setInterval(()=>{},1000)";
 const start=performance.now();const run=await runBounded(process.execPath,['-e',code],{timeout:700,maxBuffer:4096});assert.equal(run.error?.code,'ETIMEDOUT');assert.equal(run.signal,'SIGKILL');const pids=run.stdout.trim().split(/\s+/).map(Number);assert.equal(pids.length,2);assert(pids.every(n=>n>1));for(const pid of pids)await dead(pid);assert(performance.now()-start<3500);
});
test('normal leader exit cannot leave a live descendant or hanging output pipe',async()=>{
 const code="const {spawn}=require('node:child_process');spawn(process.execPath,['-e',\"process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)\"],{stdio:['ignore','inherit','inherit']});setTimeout(()=>process.exit(0),300)";
 const run=await runBounded(process.execPath,['-e',code],{timeout:2000,maxBuffer:4096});assert.equal(run.status,0);assert.equal(run.error,null);await dead(Number(run.stdout.trim()));
});
test('actual node --test worker descendant dies at the group deadline',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'turf-test-descendant-v3-'));
 const file=path.join(dir,'hang.test.mjs');
 fs.writeFileSync(file,"import test from 'node:test'; process.on('SIGTERM',()=>{}); console.log('descendant='+process.pid); setInterval(()=>{},1000); test('hang',()=>new Promise(()=>{}));");
 const start=performance.now();const run=await runBounded(process.execPath,['--max-old-space-size=64','--test',file],{env:childEnvironment(process.env,'source'),timeout:700,maxBuffer:8192});
 assert.equal(run.error?.code,'ETIMEDOUT');assert.equal(run.signal,'SIGKILL');const match=/descendant=(\d+)/.exec(run.stdout);assert(match,'Actual Node test worker must have started');await dead(Number(match[1]));assert(performance.now()-start<3500);
});
