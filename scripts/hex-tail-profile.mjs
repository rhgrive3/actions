#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import inspector from 'node:inspector';
import { pathToFileURL } from 'node:url';

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}
function round(v, n = 2) { return Number.isFinite(v) ? Number(v.toFixed(n)) : null; }
function post(session, method, params = {}) {
  return new Promise((resolve, reject) => session.post(method, params, (err, value) => err ? reject(err) : resolve(value)));
}
function makeProbe() {
  const passes = [];
  return {
    calls: 0, ms: 0, memoHits: 0, settleRechecks: 0, settleMs: 0,
    obs: new WeakMap(), obsList: [], callers: new Map(),
    capturePassStateMs: 0, capturePassStateCalls: 0, capturePassStateRecords: 0,
    recordPasses(metrics, total) { passes.push({ metrics, total }); },
    recordCapturePassState(ms, records) { this.capturePassStateMs += ms; this.capturePassStateCalls++; this.capturePassStateRecords += records; },
    passes,
  };
}
function summarizeProbe(probe, elapsedMs) {
  const passRun = probe.passes[0] ?? null;
  const passMs = Number(passRun?.total ?? 0);
  const phases = (passRun?.metrics ?? []).filter(x => !x.skipped).map(x => ({ name: x.name, ms: round(x.elapsedMs), ok: x.ok !== false })).sort((a,b)=>(b.ms??0)-(a.ms??0));
  const observations = (probe.obsList ?? []).map(x => ({ calls:x.calls, ms:round(x.ms), origin:x.origin ?? null })).sort((a,b)=>(b.ms??0)-(a.ms??0)).slice(0,10);
  const duplicateCalls = (probe.obsList ?? []).reduce((n,x)=>n+Math.max(0,(x.calls??0)-1),0);
  return {
    passManagerMs: round(passMs), outsidePassManagerMs: round(Math.max(0, elapsedMs-passMs)), outsideRatio: round(Math.max(0, elapsedMs-passMs)/(elapsedMs||1),4),
    capturePassState: { calls: probe.capturePassStateCalls, ms: round(probe.capturePassStateMs), records: probe.capturePassStateRecords },
    phases: phases.slice(0,20),
    verification: { calls: probe.calls, ms: round(probe.ms), memoHits: probe.memoHits, settleRechecks: probe.settleRechecks, settleMs: round(probe.settleMs), duplicateCalls, observations },
  };
}
function summarizeCpu(profile) {
  const nodes = new Map((profile.nodes ?? []).map(n => [n.id, n]));
  const selfUs = new Map();
  const samples = profile.samples ?? [], deltas = profile.timeDeltas ?? [];
  for (let i=0;i<samples.length;i++) selfUs.set(samples[i], (selfUs.get(samples[i])??0) + Number(deltas[i]??0));
  const totalUs = [...selfUs.values()].reduce((a,b)=>a+b,0);
  return [...selfUs.entries()].map(([id,us]) => {
    const n=nodes.get(id), f=n?.callFrame ?? {};
    return { functionName:f.functionName||'(anonymous)', url:f.url||'', line:(f.lineNumber??-1)+1, selfMs:round(us/1000), share:round(us/(totalUs||1),4) };
  }).filter(row => row.functionName !== '(idle)' && !row.url.startsWith('node:inspector'))
    .sort((a,b)=>(b.selfMs??0)-(a.selfMs??0)).slice(0,30);
}

const a=argsOf(process.argv.slice(2));
for (const k of ['target-root','binary','address','out','cpu-out']) if (!a[k]) throw new Error(`missing-${k}`);
const targetRoot=path.resolve(a['target-root']);
const binary=path.resolve(a.binary);
const address=Number(a.address);
if (!Number.isSafeInteger(address) || address < 0) throw new Error('invalid-address');
const profileName=a.profile || 'fast';
const runs=Math.max(1,Math.min(3,Number(a.runs||1)));
const { openProduct } = await import(pathToFileURL(path.join(targetRoot,'tools/validation/public-benchmark/product-host.mjs')).href);
const product=await openProduct(binary);
if (product.unsupported) throw new Error(`unsupported:${product.reason}`);
const records=[];
try {
  for(let run=0;run<runs;run++) {
    const snapshotStart=performance.now();
    const snapshot=await product.query.snapshot();
    const snapshotMs=performance.now()-snapshotStart;
    const probe=makeProbe();
    globalThis.__hexPerfProbe=probe;
    const session=new inspector.Session(); session.connect();
    await post(session,'Profiler.enable'); await post(session,'Profiler.start');
    const beforeMem=process.memoryUsage();
    const started=performance.now();
    let status=null;
    try {
      const response=await product.query.decompile(snapshot,address,{profile:profileName});
      status={ completeness:response?.status?.completeness??null, reason:response?.status?.reason??null, hasValue:!!response?.value };
    } catch(e) {
      status={ completeness:'CRASH', reason:String(e?.message||e).slice(0,300), hasValue:false };
    }
    const elapsedMs=performance.now()-started;
    const afterMem=process.memoryUsage();
    const { profile }=await post(session,'Profiler.stop');
    session.disconnect(); globalThis.__hexPerfProbe=null;
    const cpuPath=runs===1?a['cpu-out']:a['cpu-out'].replace(/\.cpuprofile$/i,`.run${run}.cpuprofile`);
    fs.mkdirSync(path.dirname(cpuPath),{recursive:true}); fs.writeFileSync(cpuPath,JSON.stringify(profile));
    records.push({run,elapsedMs:round(elapsedMs),snapshotMs:round(snapshotMs),status,memoryDelta:{rss:afterMem.rss-beforeMem.rss,heapUsed:afterMem.heapUsed-beforeMem.heapUsed},probe:summarizeProbe(probe,elapsedMs),cpuTop:summarizeCpu(profile),cpuProfile:path.basename(cpuPath)});
  }
} finally { globalThis.__hexPerfProbe=null; await product.close?.(); }
const out={schema:'hex-tail-focused-profile/v1',targetSha:a['target-sha']??null,caseId:a['case-id']??null,name:a.name??null,address,binary:path.basename(binary),profile:profileName,runs:records};
fs.mkdirSync(path.dirname(a.out),{recursive:true}); fs.writeFileSync(a.out,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({caseId:out.caseId,name:out.name,address,profile:profileName,elapsedMs:records.map(r=>r.elapsedMs),outsideRatio:records.map(r=>r.probe.outsideRatio),topCpu:records[0]?.cpuTop?.slice(0,5)},null,2));
