import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(process.env.TARGET_DIR || 'target');
const outputFile = path.resolve(process.env.OUTPUT_FILE || 'final/result.json');
const caseDir = path.resolve(process.env.CASE_DIR || 'case-results');
const targetSha = String(process.env.TARGET_SHA || '');
const workers = Number(process.env.WORKERS || '8');
const caseTimeoutMs = Number(process.env.CASE_TIMEOUT_MS || '120000');
const softDeadlineMs = Number(process.env.SOFT_DEADLINE_MS || '690000');
const startIndex = Number(process.env.START_INDEX || '0');
const limit = Number(process.env.LIMIT || '0');

if (!Number.isSafeInteger(workers) || workers < 1 || workers > 16) throw new Error('invalid-workers');
if (!Number.isSafeInteger(caseTimeoutMs) || caseTimeoutMs < 1000 || caseTimeoutMs > 900000) throw new Error('invalid-case-timeout');
if (!Number.isSafeInteger(softDeadlineMs) || softDeadlineMs < caseTimeoutMs) throw new Error('invalid-soft-deadline');
if (!Number.isSafeInteger(startIndex) || startIndex < 0) throw new Error('invalid-start-index');
if (!Number.isSafeInteger(limit) || limit < 0) throw new Error('invalid-limit');

const manifestFile = path.join(repo, 'benchmarks/public/codefuse-arm64/manifest.json');
const suiteRoot = path.dirname(manifestFile);
const caseRunner = path.join(repo, 'tools/validation/public-benchmark/run-case.mjs');
const { loadManifest, verifyInputs } = await import(pathToFileURL(path.join(repo, 'tools/validation/public-benchmark/manifest.mjs')));
const { classifySubjectResult, SUBJECT_RESULT_SCHEMA, SUBJECT_RESULT_STATES } = await import(pathToFileURL(path.join(repo, 'tools/validation/public-benchmark/outcome.mjs')));

function gitHead() {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['rev-parse', 'HEAD'], { cwd:repo, stdio:['ignore','pipe','pipe'] });
    let out=''; let err='';
    child.stdout.on('data', b => out += b);
    child.stderr.on('data', b => err += b);
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(`git-head:${code}:${err}`)));
  });
}
function pctl(values, p) {
  if (!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1, Math.max(0, Math.ceil(sorted.length*p/100)-1))];
}
function readSubject(file) {
  if (!fs.existsSync(file)) return { schema:SUBJECT_RESULT_SCHEMA, state:'ERROR', reason:'result-missing', functions:[] };
  try {
    const row=JSON.parse(fs.readFileSync(file,'utf8'));
    if (!row || row.schema !== SUBJECT_RESULT_SCHEMA || !SUBJECT_RESULT_STATES.has(row.state) || !Array.isArray(row.functions)) {
      return { schema:SUBJECT_RESULT_SCHEMA, state:'ERROR', reason:'result-invalid', functions:[] };
    }
    return classifySubjectResult(row);
  } catch {
    return { schema:SUBJECT_RESULT_SCHEMA, state:'ERROR', reason:'result-invalid-json', functions:[] };
  }
}
async function runCase(entry, index) {
  const out=path.join(caseDir, `${Buffer.from(entry.id).toString('hex')}.json`);
  fs.rmSync(out,{force:true});
  const started=Date.now();
  return await new Promise(resolve => {
    let settled=false;
    let stderr='';
    let child;
    const finish=(kind, code=null, signal=null, error=null)=>{
      if (settled) return;
      settled=true;
      clearTimeout(timer);
      let subject=readSubject(out);
      if (kind==='outer-timeout') subject={schema:SUBJECT_RESULT_SCHEMA,state:'TIMEOUT',reason:'outer-runner-timeout',functions:[]};
      else if (kind==='error') subject={schema:SUBJECT_RESULT_SCHEMA,state:'ERROR',reason:`outer-runner-error:${error?.code || error?.name || 'unknown'}`,functions:[]};
      else if (signal) subject={schema:SUBJECT_RESULT_SCHEMA,state:'CRASH',reason:`case-runner-signal:${signal}`,functions:[]};
      const fstates=subject.functionStateCounts || {};
      const artifactDigest=fs.existsSync(out) ? crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex') : null;
      resolve({
        index,
        id:entry.id,
        state:subject.state,
        reason:subject.reason ?? null,
        elapsedMs:Date.now()-started,
        functionCount:subject.functions?.length ?? 0,
        functionStates:fstates,
        runnerExitCode:code,
        runnerSignal:signal,
        artifactDigest,
        stderr:stderr.slice(-2000),
      });
    };
    try {
      child=spawn(process.execPath,[caseRunner,entry.path,out,String(caseTimeoutMs)],{
        cwd:repo,
        stdio:['ignore','ignore','pipe'],
        env:{...process.env,HEX_PUBLIC_BENCH_OFFLINE:'1'},
      });
    } catch (error) {
      resolve({index,id:entry.id,state:'ERROR',reason:`spawn-error:${error?.code || error?.name || 'unknown'}`,elapsedMs:Date.now()-started,functionCount:0,functionStates:{},runnerExitCode:null,runnerSignal:null,artifactDigest:null,stderr:''});
      return;
    }
    child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-8192);});
    child.once('error',error=>finish('error',null,null,error));
    child.once('close',(code,signal)=>finish('close',code,signal));
    var timer=setTimeout(()=>{
      try { child.kill('SIGKILL'); } catch {}
      finish('outer-timeout',null,'SIGKILL');
    },caseTimeoutMs+10000);
  });
}

const actualSha=await gitHead();
if (actualSha !== targetSha) throw new Error(`head-mismatch:${actualSha}`);
const manifestBytes=fs.readFileSync(manifestFile);
const manifestSha256=crypto.createHash('sha256').update(manifestBytes).digest('hex');
const manifest=loadManifest(manifestFile);
const allInputs=verifyInputs(manifest,suiteRoot);
if (allInputs.length !== 160 || manifest.cases.length !== 160 || manifest.denominatorFrozen !== true) throw new Error('manifest-integrity');
const inputs = limit > 0 ? allInputs.slice(startIndex, startIndex + limit) : allInputs.slice(startIndex);

fs.rmSync(caseDir,{recursive:true,force:true});
fs.mkdirSync(caseDir,{recursive:true});
const started=Date.now();
const results=new Array(inputs.length);
let next=0;
let launched=0;

async function worker(workerIndex) {
  while (true) {
    const index=next++;
    if (index >= inputs.length) return;
    const entry=inputs[index];
    if (Date.now()-started >= softDeadlineMs) {
      results[index]={index,id:entry.id,state:'NOT_RUN',reason:'soft-deadline',elapsedMs:0,functionCount:0,functionStates:{},runnerExitCode:null,runnerSignal:null,artifactDigest:null,stderr:''};
      continue;
    }
    if (entry.state !== 'READY') {
      results[index]={index,id:entry.id,state:entry.state,reason:null,elapsedMs:0,functionCount:0,functionStates:{},runnerExitCode:null,runnerSignal:null,artifactDigest:null,stderr:''};
      continue;
    }
    launched++;
    const row=await runCase(entry,index);
    results[index]=row;
    console.log(`[w${workerIndex}] ${entry.id}: ${row.state} functions=${row.functionCount} elapsed=${row.elapsedMs}ms`);
  }
}
await Promise.all(Array.from({length:workers},(_,i)=>worker(i)));

const finished=Date.now();
const states={}; const functionStates={};
for (const row of results) {
  states[row.state]=(states[row.state]||0)+1;
  for (const [k,v] of Object.entries(row.functionStates||{})) functionStates[k]=(functionStates[k]||0)+Number(v||0);
}
const caseTimes=results.filter(r=>r.elapsedMs>0).map(r=>r.elapsedMs);
const functionCount=results.reduce((n,r)=>n+Number(r.functionCount||0),0);
const completedCases=results.filter(r=>r.state!=='NOT_RUN').length;
const wallMs=finished-started;
const summary={
  schema:'hex-pr9263-fresh-benchmark-final/v2',
  targetSha,
  actualSha,
  manifestSha256,
  manifestCases:manifest.cases.length,
  selectedStartIndex:startIndex,
  selectedCases:inputs.length,
  denominatorFrozen:manifest.denominatorFrozen===true,
  execution:{
    workers,
    hostLogicalCpus:os.cpus().length,
    hostParallelism:os.availableParallelism?.() ?? os.cpus().length,
    caseTimeoutMs,
    softDeadlineMs,
    startedAt:new Date(started).toISOString(),
    finishedAt:new Date(finished).toISOString(),
    wallMs,
    launched,
  },
  totalCaseRows:results.length,
  completedCases,
  notRun:Number(states.NOT_RUN||0),
  states,
  functionStates,
  functionCount,
  performance:{
    wallMs,
    caseP50Ms:pctl(caseTimes,50),
    caseP90Ms:pctl(caseTimes,90),
    caseMaxMs:caseTimes.length?Math.max(...caseTimes):null,
    sumCaseMs:caseTimes.reduce((a,b)=>a+b,0),
    functionsPerSecond:wallMs>0?functionCount/(wallMs/1000):null,
    casesPerSecond:wallMs>0?completedCases/(wallMs/1000):null,
  },
  results,
};
summary.complete=results.length===inputs.length && summary.notRun===0 && actualSha===targetSha;
fs.mkdirSync(path.dirname(outputFile),{recursive:true});
fs.writeFileSync(outputFile,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({complete:summary.complete,workers,hostLogicalCpus:summary.execution.hostLogicalCpus,completedCases,states,functionStates,functionCount,performance:summary.performance},null,2));
process.exitCode=summary.complete?0:2;
