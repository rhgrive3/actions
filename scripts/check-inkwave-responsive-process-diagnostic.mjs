#!/usr/bin/env node
// Diagnostic-only wrapper: run one unchanged production responsive child. It
// observes browser process activity; it never decides animation readiness.
import fs from 'node:fs';
import {createHmac,randomBytes} from 'node:crypto';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const CHILD_TIMEOUT_MS=20*60*1000;
export const LOG_LIMIT=1024*1024;
export function childInvocation({sourceRoot,site,evidence,profile}) {
 return {file:process.execPath,args:[path.join(sourceRoot,'scripts/check-inkwave-responsive.mjs'),
  '--source',site,'--section','all','--engine','webkit','--cases','small-phone',
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
 .map(m=>({pid:+m[1],ppid:+m[2],pgid:+m[3],rssKiB:+m[4],vszKiB:+m[5],state:m[6],command:['node','bash','MiniBrowser','WPENetworkProce','WPEWebProcess','gst-plugin-scan'].includes(m[7])?m[7]:'other'}));
 const ids=new Set([root]);let changed=true;while(changed){changed=false;for(const r of rows)if(ids.has(r.ppid)&&!ids.has(r.pid)){ids.add(r.pid);changed=true;}}
 return rows.filter(r=>ids.has(r.pid)).sort((a,b)=>a.pid-b.pid);
}
function readLimited(file) {try {return fs.readFileSync(file,'utf8').slice(0,4096).trim()}catch{return null}}
export function procIdentity(pid) {
 try {const raw=fs.readFileSync('/proc/'+pid+'/stat','utf8');const fields=raw.slice(raw.lastIndexOf(')')+2).split(' ');const ppid=Number(fields[1]),pgid=Number(fields[2]),start=fields[19];if(!Number.isSafeInteger(ppid)||!Number.isSafeInteger(pgid)||!/^\d+$/.test(start))return null;return {pid,ppid,pgid,start};}catch{return null}
}
// Collect process-only numeric metrics for previously selected descendants. Do
// not read cmdline, environ, open files, or persist unrelated ps rows.
export function processMetrics(pid,expectedStart) {
 try {
  const before=procIdentity(pid);if(!before||before.start!==expectedStart)return null;
  const raw=fs.readFileSync('/proc/'+pid+'/stat','utf8');const fields=raw.slice(raw.lastIndexOf(')')+2).split(' ');
  const cpuUserTicks=fields[11],cpuSystemTicks=fields[12];
  if(!/^\d+$/.test(cpuUserTicks)||!/^\d+$/.test(cpuSystemTicks))return null;
  let pssKiB=null;try {const rollup=fs.readFileSync('/proc/'+pid+'/smaps_rollup','utf8');const match=rollup.match(/^Pss:\s+(\d+)\s+kB$/m);if(match)pssKiB=Number(match[1]);}catch{}
  const after=procIdentity(pid);if(!after||after.start!==expectedStart)return null;
  return {cpuUserTicks,cpuSystemTicks,pssKiB};
 }catch{return null}
}
export function cgroupV2Directory(text,base='/sys/fs/cgroup') {
 const row=text.split('\n').find(x=>x.startsWith('0::'));if(!row)return null;
 const part=row.slice(3);if(!part.startsWith('/')||part.split('/').includes('..'))return null;
 const resolved=path.resolve(base,'.'+part),root=path.resolve(base);
 return resolved===root||resolved.startsWith(root+path.sep)?resolved:null;
}
export function verifiedProcessTree(rows,root,expected,lookup=procIdentity) {
 if(!expected||expected.pid!==root||expected.pgid!==root)return null;
 const same=(a,b)=>!!a&&a.pid===b.pid&&a.ppid===b.ppid&&a.pgid===b.pgid&&a.start===b.start;
 if(!same(lookup(root),expected))return null;
 const eligible=new Map([[root,expected]]),accepted=[];
 for(const row of rows)if(row.pid===root){if(row.ppid!==expected.ppid||row.pgid!==expected.pgid)return null;accepted.push({...row,start:expected.start});}
 if(!accepted.length)return null;
 let pending=rows.filter(r=>r.pid!==root),progress=true;
 while(progress){progress=false;const rest=[];for(const row of pending){const parent=eligible.get(row.ppid);if(!parent){rest.push(row);continue}const a=lookup(row.pid),b=lookup(row.pid);if(a&&same(a,b)&&a.ppid===row.ppid&&a.pgid===row.pgid&&same(lookup(row.ppid),parent)){eligible.set(row.pid,a);accepted.push({...row,start:a.start});progress=true}}pending=rest}
 if(!same(lookup(root),expected))return null;
 return accepted.sort((a,b)=>a.pid-b.pid);
}
export function browserEvent(line) {
 const launch=line.match(/pw:browser <launched> pid=(\d+)\s*$/);if(launch)return {kind:'launch',pid:Number(launch[1])};
 const exit=line.match(/pw:browser \[pid=(\d+)\] <process did exit: exitCode=(-?\d+|null), signal=([A-Z0-9]+|null)>\s*$/);
 return exit?{kind:'exit',pid:Number(exit[1]),code:exit[2]==='null'?null:Number(exit[2]),signal:exit[3]==='null'?null:exit[3]}:null;
}
// Only categories and observation times are retained, never line contents.
export function diagnosticCategories(line) {
 const tests={oom:/\b(?:out of memory|cannot allocate memory|oom[- ]kill(?:er)?)\b/i,segfault:/\b(?:sigsegv|segmentation fault)\b/i,crash:/\b(?:crash(?:ed)?|sigabrt|abort(?:ed)?)\b/i,graphics:/\b(?:libegl|egl|mesa|zink|vulkan|opengl)\b/i};
 return Object.entries(tests).filter(([,re])=>re.test(line)).map(([name])=>name);
}
export function resourceSample(root,now=Date.now(),expected=null) {
 let all=null;try {all=processTree(execFileSync('ps',['-eo','pid=,ppid=,pgid=,rss=,vsz=,stat=,comm='],{encoding:'utf8',timeout:3000,maxBuffer:2*1024*1024}),root)}catch{}
 const verified=all?verifiedProcessTree(all,root,expected):null;
 const processes=verified?.slice(0,16).map(r=>({...r,metrics:processMetrics(r.pid,r.start)})) ?? null;
 const readGroup=file=>{try{const v=fs.readFileSync(file,'utf8');return v.length<=4096?v.trim():null}catch{return null}};
 const groupText=readGroup('/proc/self/cgroup');const dir=groupText?cgroupV2Directory(groupText):null;
 // The observer may differ from a moved browser; compare owned child only,
 // retain a boolean rather than either cgroup path.
 let childSameCgroup=null;if(verified&&expected){const a=procIdentity(root),child=readGroup('/proc/'+root+'/cgroup'),b=procIdentity(root);if(a&&b&&a.start===expected.start&&b.start===expected.start&&a.pgid===expected.pgid&&b.pgid===expected.pgid&&a.ppid===expected.ppid&&b.ppid===expected.ppid&&groupText&&child)childSameCgroup=child===groupText;}
 const read=file=>dir?readLimited(path.join(dir,file))?.slice(0,512)??null:null;
 return {at:now,processes,omittedProcesses:verified?Math.max(0,verified.length-16):null,cgroup:{scope:'observer',childSameCgroup,resolvedV2:!!dir,current:read('memory.current'),max:read('memory.max'),events:read('memory.events'),eventsLocal:read('memory.events.local'),pressure:read('memory.pressure')},meminfo:readLimited('/proc/meminfo')?.split('\n').filter(s=>/^(MemTotal|MemAvailable|SwapTotal|SwapFree):/.test(s)).join('\n') ?? null};
}
export async function runDiagnostic({sourceRoot,site,evidence,profile,output,spawnChild=spawn,sample=resourceSample,intervalMs=1000,timeoutMs=CHILD_TIMEOUT_MS,graceMs=5000,forceCloseMs=10000}) {
 fs.mkdirSync(output,{recursive:true});fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(profile,{recursive:true});
 const invocation=childInvocation({sourceRoot,site,evidence,profile}); const started=Date.now();
 // Signals only the owned group at the same 20-minute budget. Descendants
 // that escape the group or close pipes while continuing are not guaranteed
 // reaped; never signal unrelated PIDs. Hosted runner teardown is the backstop.
 const options={cwd:sourceRoot,env:{...process.env,DEBUG:'pw:browser'},stdio:['ignore','pipe','pipe'],detached:true};
 const child=spawnChild(invocation.file,invocation.args,options);let stdoutBytes=0,stderrBytes=0,error=null,exit=null,timedOut=false,forcedClose=false,killEvents=[];const browserEvents=[],diagnosticEvents=[],diagnosticCounts={oom:0,segfault:0,crash:0,graphics:0};let eventOverflow=0,diagnosticOverflow=0,unknownLines=0,truncatedLineBuffers=0,lineBuffer='';
 child.stdout.on('data',x=>{stdoutBytes+=x.length});child.stderr.on('data',x=>{stderrBytes+=x.length;lineBuffer+=x.toString('utf8');if(lineBuffer.length>16384){lineBuffer=lineBuffer.slice(-16384);truncatedLineBuffers++}const lines=lineBuffer.split('\n');lineBuffer=lines.pop();for(const line of lines){const event=browserEvent(line);if(event){if(browserEvents.length<256)browserEvents.push({...event,at:Date.now()});else eventOverflow++}const cats=diagnosticCategories(line);if(!event&&!cats.length)unknownLines++;for(const kind of cats){diagnosticCounts[kind]++;if(diagnosticEvents.length<256)diagnosticEvents.push({kind,at:Date.now()});else diagnosticOverflow++}}});
 let sampleCount=0,droppedSamples=0;const samples=[],known=new Map();const own=procIdentity(child.pid);if(own&&own.pgid===child.pid)known.set(own.pid,own.start);const sampleFile=path.join(output,'resources.json');
 const flush=()=>{try{fs.writeFileSync(sampleFile+'.pending',JSON.stringify({sampleCount,droppedSamples,samples})+'\n');fs.renameSync(sampleFile+'.pending',sampleFile)}catch{}};
 const take=()=>{try{let row=sample(child.pid,Date.now(),own);let encoded=JSON.stringify(row);if(Buffer.byteLength(encoded)>16384)row={at:Date.now(),sampleTooLarge:true,originalBytes:Buffer.byteLength(encoded)};for(const r of row.processes||[])if(r.pgid===child.pid&&r.start)known.set(r.pid,r.start);samples.push(row);sampleCount++;if(sampleCount===1)fs.writeFileSync(path.join(output,'initial-resource.json'),JSON.stringify(row)+'\n');if(samples.length>300){samples.shift();droppedSamples++}if(sampleCount%5===1)flush()}catch{}};take();const timer=setInterval(take,intervalMs);
 child.on('error',e=>{if(!error)error=String(e.message)});child.on('exit',(code,signal)=>{exit={at:Date.now(),code,signal}});
 const signalGroup=signal=>{const matched=[...known].some(([pid,start])=>{const r=procIdentity(pid);return r&&r.pgid===child.pid&&r.start===start});if(!matched){killEvents.push({at:Date.now(),signal,group:true,ok:false,error:'no-verified-group-member'});return}try{process.kill(-child.pid,signal);killEvents.push({at:Date.now(),signal,group:true,ok:true})}catch(e){killEvents.push({at:Date.now(),signal,group:true,ok:false,error:e.code||'unknown'})}};
 let escalation,hardClose,resolveEscalation;const escalationDone=new Promise(resolve=>{resolveEscalation=resolve});
 const deadline=setTimeout(()=>{timedOut=true;signalGroup('SIGTERM');escalation=setTimeout(()=>{signalGroup('SIGKILL');resolveEscalation()},graceMs);hardClose=setTimeout(()=>{forcedClose=true;child.stdout.destroy();child.stderr.destroy();child.unref();finish({at:Date.now(),code:null,signal:null,forced:true})},forceCloseMs)},timeoutMs);
 let finish;const close=await new Promise(resolve=>{let done=false;finish=value=>{if(!done){done=true;resolve(value)}};child.on('close',(code,signal)=>finish({at:Date.now(),code,signal}))});
 if(timedOut)await escalationDone;clearTimeout(deadline);clearTimeout(escalation);clearTimeout(hardClose);clearInterval(timer);take();flush();
 const receipt={kind:'diagnostic-not-acceptance',sourceRoot,site,invocation:{file:invocation.file,args:invocation.args,debug:'pw:browser',timeoutMs,processGroup:true},cleanupScope:'owned-process-group-only; escaped or pipe-closing descendants not guaranteed reaped; hosted-runner teardown is the backstop',startedAt:started,pid:child.pid,exit,close,error,timedOut,forcedClose,killEvents,stdoutBytes,stderrBytes,browserEvents,eventOverflow,diagnosticCounts,diagnosticEvents,diagnosticOverflow,unknownLines,truncatedLineBuffers,pendingStderrChars:lineBuffer.length,rawOutputStored:false,sampleCount,droppedSamples};
 fs.writeFileSync(path.join(output,'process-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}

// Serialize only explicitly whitelisted scalar diagnostics from the unchanged
// acceptance runner; do not publish its arbitrary page/error/console strings.
export function sanitizeCase(result,progress) {
 const safeNumber=x=>Number.isFinite(x)&&x>=0?x:null;
 const eventTypes=new Set(['page-crash','first-error','context-close-start','page-close','context-close','browser-disconnected','context-close-complete','stage-complete','operation-before','operation-after','animation-snapshot','diagnostic-skipped','case-start','console-warning','console-error','fatal-pageerror-context-closing','diagnostic-error','context-close-error']);
 const operations=new Set(['setup-stage-count','setup-stage-read-id','setup-stage-scroll','setup-stage-tap','setup-stage-verify-id','setup-stage-settle','setup-stage-name','setup-stage-caption','setup-repeat-read-id','setup-repeat-scroll','setup-repeat-tap','setup-repeat-verify-id','setup-dusk-tap','setup-dusk-verify','setup-loadout-tap','setup-loadout-wait','setup-loadout-show','setup-loadout-capture','continuation-read-callback','continuation-tap-change','continuation-wait-loadout','continuation-settle-loadout','continuation-ready-loadout','continuation-read-weapon','continuation-list-weapons','continuation-select-weapon','continuation-verify-weapon','continuation-scroll-action','continuation-settle-action','continuation-visible-action','continuation-label-action','continuation-capture-action','before-await','after-await']);
 const stages=new Set(['scorch','hagglefish','inkblot','mako','brinewater','airport','barnacle','bluefin','crableg','eeltail','flounder','hammerhead','humpback','manta','mincemeat','museum','robo','shipshape','sturgeon','umami','undertow','urchin','wahoo']);
 const genericStages=new Set(['loading','title','main','setup','online','lobby','drawer','boss-lobby','mode','news']);
 const stage=x=>genericStages.has(x)?x:typeof x==='string'&&x.startsWith('setup-stage:')&&stages.has(x.slice(12))?x:'other';
 const d=progress?.diagnostics||{};let omittedEvents=0;
 const digestKey=randomBytes(32); // Never persisted: prevents cross-run low-entropy dictionary matching.
 const digest=x=>typeof x==='string'?{bytes:Buffer.byteLength(x),hmacSha256:createHmac('sha256',digestKey).update(x).digest('hex')}:null;
 const events=(Array.isArray(d.events)?d.events:[]).slice(0,300).map(e=>{const type=eventTypes.has(e?.type)?e.type:'other';if(type==='other')omittedEvents++;let detail='other';if(type==='stage-complete')detail=stage(e.detail);else if(operations.has(e.detail))detail=e.detail;return {ms:safeNumber(e?.ms),type,detail,typeDigest:type==='other'?digest(e?.type):null,detailDigest:detail==='other'?digest(e?.detail):null};});
 const snapshots=(Array.isArray(d.animationSnapshots)?d.animationSnapshots:[]).slice(0,16).map(x=>({phase:['before-await','after-await'].includes(x?.phase)?x.phase:'other',finiteCount:safeNumber(x?.finiteCount),pendingCount:safeNumber(x?.pendingCount),omittedCount:safeNumber(x?.omittedCount)}));
 const c=Array.isArray(result?.cases)?result.cases[0]:null;
 const status=['passed','failed'].includes(result?.status)?result.status:'unknown';
 const message=String(d.firstError?.message||'');const errorKind=/Target page, context or browser has been closed/.test(message)?'target-closed':/timed? ?out|timeout/i.test(message)?'timeout':d.firstError?'other':'none';
 return {kind:'sanitized-responsive-case',status,engine:c?.engine==='webkit'?'webkit':'other',name:c?.name==='small-phone'?'small-phone':'other',viewport:{width:safeNumber(c?.viewport?.width),height:safeNumber(c?.viewport?.height)},lastCompletedStage:stage(d.lastCompletedStage),pendingOperation:operations.has(d.pendingOperation)?d.pendingOperation:'other',errorKind,errorMessageDigest:digest(d.firstError?.message),errorStackDigest:digest(d.firstError?.stack),resultErrorDigest:digest(result?.error),caseErrorDigest:digest(c?.error),pageUnavailable:d.pageUnavailable===true,droppedEvents:safeNumber(d.droppedEvents),omittedEvents,truncatedEvents:Math.max(0,(Array.isArray(d.events)?d.events.length:0)-300),truncatedSnapshots:Math.max(0,(Array.isArray(d.animationSnapshots)?d.animationSnapshots.length:0)-16),events,snapshots,rawPageStringsStored:false};
}
export function writeSanitizedCase(evidence,output) {
 const load=name=>{try {const p=path.join(evidence,name);if(fs.statSync(p).size>1048576)return null;return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return null}};
 const result=load('responsive-result.json'),progress=load('webkit-small-phone-diagnostic-progress.json');
 fs.mkdirSync(output,{recursive:true});const receipt={...sanitizeCase(result,progress),resultAvailable:!!result,progressAvailable:!!progress};
 fs.writeFileSync(path.join(output,'sanitized-case-receipt.json'),JSON.stringify(receipt,null,2)+'\n');return !!result&&!!progress;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])) {
 if(process.argv[2]==='--sanitize') {if(process.argv.length!==5)throw Error('sanitize evidence output required');if(!writeSanitizedCase(path.resolve(process.argv[3]),path.resolve(process.argv[4])))process.exitCode=1;}
 else {if(process.argv.length!==7)throw Error('sourceRoot site evidence profile output required');
 const [sourceRoot,site,evidence,profile,output]=process.argv.slice(2).map(x=>path.resolve(x));
 const result=await runDiagnostic({sourceRoot,site,evidence,profile,output});console.log(JSON.stringify(result));
 if(result.error||result.timedOut||result.forcedClose||result.close.code!==0||result.close.signal)process.exitCode=1;}
}
