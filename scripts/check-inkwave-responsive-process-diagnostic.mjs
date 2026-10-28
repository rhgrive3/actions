#!/usr/bin/env node
// Diagnostic-only wrapper: run one unchanged production responsive child. It
// observes browser process activity; it never decides animation readiness.
import fs from 'node:fs';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const CHILD_TIMEOUT_MS=20*60*1000;
export const LOG_LIMIT=1024*1024;
export function childInvocation({sourceRoot,site,evidence,profile}) {
 return {file:process.execPath,args:[path.join(sourceRoot,'scripts/check-inkwave-responsive.mjs'),
  '--source',site,'--section','all','--engine','webkit','--cases','phone-landscape',
  '--evidence-dir',evidence,'--profile-dir',profile]};
}
export function appendTail(previous,chunk,limit=LOG_LIMIT) {
 const b=Buffer.concat([previous,Buffer.from(chunk)]);return b.length>limit?b.subarray(b.length-limit):b;
}
export function appendHead(previous,chunk,limit=LOG_LIMIT) {
 return Buffer.concat([previous,Buffer.from(chunk)]).subarray(0,limit);
}
export function processTree(ps,root) {
 const rows=ps.trim().split('\n').map(s=>s.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/)).filter(Boolean)
 .map(m=>({pid:+m[1],ppid:+m[2],pgid:+m[3],rssKiB:+m[4],vszKiB:+m[5],state:m[6],command:m[7].slice(0,80)}));
 const ids=new Set([root]);let changed=true;while(changed){changed=false;for(const r of rows)if(ids.has(r.ppid)&&!ids.has(r.pid)){ids.add(r.pid);changed=true;}}
 return rows.filter(r=>ids.has(r.pid)).sort((a,b)=>a.pid-b.pid);
}
function readLimited(file) {try {return fs.readFileSync(file,'utf8').slice(0,4096).trim()}catch{return null}}
export function procIdentity(pid) {
 try {const raw=fs.readFileSync('/proc/'+pid+'/stat','utf8');const fields=raw.slice(raw.lastIndexOf(')')+2).split(' ');const pgid=Number(fields[2]),start=fields[19];if(!Number.isSafeInteger(pgid)||!/^\d+$/.test(start))return null;return {pid,pgid,start};}catch{return null}
}
export function resourceSample(root,now=Date.now()) {
 let all=null;try {all=processTree(execFileSync('ps',['-eo','pid=,ppid=,pgid=,rss=,vsz=,stat=,comm='],{encoding:'utf8',timeout:3000,maxBuffer:2*1024*1024}),root)}catch{}
 // Bound each observation; record omissions, never claim complete coverage.
 const processes=all?.slice(0,16).map(r=>({...r,start:procIdentity(r.pid)?.start??null})) ?? null;
 const read=file=>readLimited(file)?.slice(0,512) ?? null;
 return {at:now,processes,omittedProcesses:all?Math.max(0,all.length-16):null,cgroup:{self:read('/proc/self/cgroup'),current:read('/sys/fs/cgroup/memory.current'),max:read('/sys/fs/cgroup/memory.max'),events:read('/sys/fs/cgroup/memory.events'),eventsLocal:read('/sys/fs/cgroup/memory.events.local'),pressure:read('/sys/fs/cgroup/memory.pressure')},meminfo:readLimited('/proc/meminfo')?.split('\n').filter(s=>/^(MemTotal|MemAvailable|SwapTotal|SwapFree):/.test(s)).join('\n') ?? null};
}
export async function runDiagnostic({sourceRoot,site,evidence,profile,output,spawnChild=spawn,sample=resourceSample,intervalMs=1000,timeoutMs=CHILD_TIMEOUT_MS,graceMs=5000,forceCloseMs=10000}) {
 fs.mkdirSync(output,{recursive:true});fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(profile,{recursive:true});
 const invocation=childInvocation({sourceRoot,site,evidence,profile}); const started=Date.now();
 // Signals only the owned group at the same 20-minute budget. Descendants
 // that escape the group or close pipes while continuing are not guaranteed
 // reaped; never signal unrelated PIDs. Hosted runner teardown is the backstop.
 const options={cwd:sourceRoot,env:{...process.env,DEBUG:'pw:browser'},stdio:['ignore','pipe','pipe'],detached:true};
 const child=spawnChild(invocation.file,invocation.args,options);let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),stderrHead=Buffer.alloc(0),stdoutBytes=0,stderrBytes=0,error=null,exit=null,timedOut=false,forcedClose=false,killEvents=[];
 child.stdout.on('data',x=>{stdoutBytes+=x.length;stdout=appendTail(stdout,x)});child.stderr.on('data',x=>{stderrBytes+=x.length;stderr=appendTail(stderr,x);stderrHead=appendHead(stderrHead,x)});
 let sampleCount=0,droppedSamples=0;const samples=[],known=new Map();const own=procIdentity(child.pid);if(own&&own.pgid===child.pid)known.set(own.pid,own.start);const sampleFile=path.join(output,'resources.json');
 const flush=()=>{try{fs.writeFileSync(sampleFile+'.pending',JSON.stringify({sampleCount,droppedSamples,samples})+'\n');fs.renameSync(sampleFile+'.pending',sampleFile)}catch{}};
 const take=()=>{try{let row=sample(child.pid);let encoded=JSON.stringify(row);if(Buffer.byteLength(encoded)>4096)row={at:Date.now(),sampleTooLarge:true,originalBytes:Buffer.byteLength(encoded)};for(const r of row.processes||[])if(r.pgid===child.pid&&r.start)known.set(r.pid,r.start);samples.push(row);sampleCount++;if(sampleCount===1)fs.writeFileSync(path.join(output,'initial-resource.json'),JSON.stringify(row)+'\n');if(samples.length>300){samples.shift();droppedSamples++}if(sampleCount%5===1)flush()}catch{}};take();const timer=setInterval(take,intervalMs);
 child.on('error',e=>{if(!error)error=String(e.message)});child.on('exit',(code,signal)=>{exit={at:Date.now(),code,signal}});
 const signalGroup=signal=>{const matched=[...known].some(([pid,start])=>{const r=procIdentity(pid);return r&&r.pgid===child.pid&&r.start===start});if(!matched){killEvents.push({at:Date.now(),signal,group:true,ok:false,error:'no-verified-group-member'});return}try{process.kill(-child.pid,signal);killEvents.push({at:Date.now(),signal,group:true,ok:true})}catch(e){killEvents.push({at:Date.now(),signal,group:true,ok:false,error:e.code||'unknown'})}};
 let escalation,hardClose,resolveEscalation;const escalationDone=new Promise(resolve=>{resolveEscalation=resolve});
 const deadline=setTimeout(()=>{timedOut=true;signalGroup('SIGTERM');escalation=setTimeout(()=>{signalGroup('SIGKILL');resolveEscalation()},graceMs);hardClose=setTimeout(()=>{forcedClose=true;child.stdout.destroy();child.stderr.destroy();child.unref();finish({at:Date.now(),code:null,signal:null,forced:true})},forceCloseMs)},timeoutMs);
 let finish;const close=await new Promise(resolve=>{let done=false;finish=value=>{if(!done){done=true;resolve(value)}};child.on('close',(code,signal)=>finish({at:Date.now(),code,signal}))});
 if(timedOut)await escalationDone;clearTimeout(deadline);clearTimeout(escalation);clearTimeout(hardClose);clearInterval(timer);take();flush();
 fs.writeFileSync(path.join(output,'child-stdout-tail.txt'),stdout);fs.writeFileSync(path.join(output,'browser-debug-stderr-head.txt'),stderrHead);fs.writeFileSync(path.join(output,'browser-debug-stderr-tail.txt'),stderr);
 const receipt={kind:'diagnostic-not-acceptance',sourceRoot,site,invocation:{file:invocation.file,args:invocation.args,debug:'pw:browser',timeoutMs,processGroup:true},cleanupScope:'owned-process-group-only; escaped or pipe-closing descendants not guaranteed reaped; hosted-runner teardown is the backstop',startedAt:started,pid:child.pid,exit,close,error,timedOut,forcedClose,killEvents,stdoutBytes,stdoutRetained:stdout.length,stderrBytes,stderrHeadRetained:stderrHead.length,stderrTailRetained:stderr.length,sampleCount,droppedSamples};
 fs.writeFileSync(path.join(output,'process-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
 if(process.argv.length!==7)throw Error('sourceRoot site evidence profile output required');
 const [sourceRoot,site,evidence,profile,output]=process.argv.slice(2).map(x=>path.resolve(x));
 const result=await runDiagnostic({sourceRoot,site,evidence,profile,output});console.log(JSON.stringify(result));
 if(result.error||result.timedOut||result.forcedClose||result.close.code!==0||result.close.signal)process.exitCode=1;
}
