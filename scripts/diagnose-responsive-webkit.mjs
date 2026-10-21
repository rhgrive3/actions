#!/usr/bin/env node
// Observation-only, one existing small-phone core case. No retry or gate changes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
const arg = key => { const i=process.argv.indexOf(key); assert(i>=0 && process.argv[i+1]); return path.resolve(process.argv[i+1]); };
const source=arg('--source'), out=arg('--evidence-dir'), profile=arg('--profile-dir');
fs.mkdirSync(out,{recursive:true});
const pins=JSON.parse(fs.readFileSync(new URL('./responsive-ffdb-input-pins.json',import.meta.url)));
for(const [p,h] of Object.entries(pins.sourceHashes)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(source,p))).digest('hex'),h,'Exact prior failed-case input '+p);
for(const [p,h] of Object.entries(pins.runnerHashes)) if(!['check-inkwave-responsive.mjs','check-inkwave-responsive-core.mjs'].includes(p)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(p,import.meta.url))).digest('hex'),h,'Unmodified fixture '+p);
const started=Date.now(),samples=[]; let stdout='',stderr='',stderrChars=0,stdoutChars=0,spawnError=null,timedOut=false;
const child=spawn(process.execPath,[new URL('./check-inkwave-responsive.mjs',import.meta.url).pathname,'--source',source,'--engine','webkit','--cases','small-phone','--section','core','--animation-probe','--evidence-dir',out,'--profile-dir',profile],{env:{...process.env,DEBUG:'pw:browser'},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',b=>{stdoutChars+=b.toString().length;stdout=(stdout+b.toString()).slice(-65536);});
child.stderr.on('data',b=>{stderrChars+=b.toString().length;stderr=(stderr+b.toString()).slice(-65536);});
child.on('error',e=>{spawnError=String(e.message);});
const readSmall=p=>{try{return fs.readFileSync(p,'utf8').slice(0,2048);}catch{return null;}};
function sample(){
  try {
    const rows=execFileSync('ps',['-e','-o','pid=,ppid=,rss=,comm='],{encoding:'utf8',timeout:2000,maxBuffer:1024*1024}).trim().split('\n').map(l=>{const [pid,ppid,rss,...comm]=l.trim().split(/\s+/);return{pid:+pid,ppid:+ppid,rssKiB:+rss,comm:comm.join(' ').slice(0,80)};});
    const ids=new Set([child.pid]);let changed=true;while(changed){changed=false;for(const r of rows)if(ids.has(r.ppid)&&!ids.has(r.pid)){ids.add(r.pid);changed=true;}}
    samples.push({ms:Date.now()-started,processes:rows.filter(r=>ids.has(r.pid)).slice(0,48),memoryEvents:readSmall('/sys/fs/cgroup/memory.events'),memoryCurrent:readSmall('/sys/fs/cgroup/memory.current'),memoryPressure:readSmall('/proc/pressure/memory')});
    if(samples.length>1202)samples.shift();
  }catch(e){samples.push({ms:Date.now()-started,error:String(e.message).slice(0,300)});if(samples.length>1202)samples.shift();}
}
sample(); const interval=setInterval(sample,1000);
// Same 20-minute SIGTERM request as the existing isolated driver.
// A child ignoring termination may outlive it; the workflow remains bounded separately.
const timeout=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},20*60*1000);
const terminal=await new Promise(resolve=>child.on('close',(exitCode,signal)=>resolve({exitCode,signal})));
clearInterval(interval);clearTimeout(timeout);sample();
fs.writeFileSync(path.join(out,'browser-stderr-tail.txt'),stderr);
fs.writeFileSync(path.join(out,'child-stdout-tail.txt'),stdout);
const report={kind:'single-case-observation-only',sourceHead:pins.sourceHead,buildArtifact:pins.artifactId,elapsedMs:Date.now()-started,...terminal,spawnError,timedOut,stderrChars,stderrRetainedChars:stderr.length,stdoutChars,samples,notes:['Process snapshots are sampled, not proof of absent spikes.','Animation console probing adds observation overhead.','Page crash and browser-process exit are distinct events.','A passing diagnostic run does not erase the original failed mandatory run.']};
fs.writeFileSync(path.join(out,'process-diagnostics.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({exitCode:terminal.exitCode,signal:terminal.signal,timedOut,spawnError,samples:samples.length,stderrChars}));
if(terminal.exitCode!==0||terminal.signal||timedOut||spawnError)process.exitCode=1;
else { const result=JSON.parse(fs.readFileSync(path.join(out,'responsive-result.json')));assert.equal(result.status,'passed');assert.equal(result.cases.length,1);assert.equal(result.cases[0].name,'small-phone');assert.equal(result.cases[0].engine,'webkit');assert.deepEqual(result.errors,[]);assert.deepEqual(result.sourceHashes,pins.sourceHashes); }
