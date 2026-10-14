#!/usr/bin/env node
// Same-input ray component in the normal Node realm, without per-call timers.
// Full hit verification and instrumented Math counts are outside timing trials.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import os from 'node:os';
import {performance,PerformanceObserver} from 'node:perf_hooks';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
import {SOURCE_STAGES} from '../patches/native-stages/runtime/source-catalog.mjs';
import {convertSource} from '../patches/native-stages/runtime/source-convert.mjs';
const args=process.argv.slice(2),get=(n,d)=>{const i=args.indexOf(n);return i<0?d:args[i+1];};
const root=new URL('../',import.meta.url),dir=get('--source-dir',new URL('.codex-stage-sources/scorch-source',root).pathname);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const stage=SOURCE_STAGES.find(s=>s.id==='scorch'),obj=fs.readFileSync(dir+'/Vss_Yunohana.obj'),mtl=fs.readFileSync(dir+'/Vss_Yunohana.mtl'),tree=JSON.parse(fs.readFileSync(dir+'/tree.json'));
assert.equal(sha(obj),stage.sourceSha256);assert.equal(tree.sha,stage.tree);assert.equal(tree.truncated,false);
const files={};for(const row of tree.tree)if(row.type==='blob')files[row.path]={bytes:row.size,gitSha1:row.sha};
assert.equal(crypto.createHash('sha1').update('blob '+mtl.length+'\0').update(mtl).digest('hex'),files['Vss_Yunohana.mtl'].gitSha1);
const data=convertSource(stage,obj.toString(),mtl.toString(),files),input=fs.readFileSync(get('--queries')),rows=JSON.parse(input),f=await fixture(),{THREE}=f;
const queries=rows.map(([o,d,far,opts])=>{assert.ok(Number.isFinite(far));return [new THREE.Vector3(...o),new THREE.Vector3(...d),far,opts];});
const before=fs.readFileSync(new URL('patches/native-stages/tests/fixtures/triangle-world-e57.mjs.txt',root),'utf8'),after=fs.readFileSync(new URL('patches/native-stages/runtime/triangle-world.mjs',root),'utf8');
assert.equal(sha(before),'76206bdf0a42a5122759ca0914435e3a3f89da590740253e8c4f18d6127af92f');
const load=(s,math=Math)=>new (new Function('THREE','Math',s.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+';return TriangleWorld;')(THREE,math))(data);
const worlds={baseline:load(before),candidate:load(after)},flat=h=>h?{...h,point:h.point.toArray(),normal:h.normal.toArray()}:null;
let hits=0;for(const q of queries){const a=worlds.baseline.ray(...q),b=worlds.candidate.ray(...q);assert.deepEqual(flat(a),flat(b));if(a)hits++;assert.equal(worlds.baseline.triangleTests,worlds.candidate.triangleTests);assert.equal(worlds.baseline.queryCount,worlds.candidate.queryCount);}
const work={};for(const [v,s] of [['baseline',before],['candidate',after]]){const count={min:0,max:0},math=Object.create(Math);for(const k of ['min','max'])math[k]=(...a)=>{count[k]++;return Math[k](...a);};const w=load(s,math);for(const q of queries)w.ray(...q);work[v]={...count,rays:w.queryCount,triangles:w.triangleTests};}
const gcEntries=[],observer=new PerformanceObserver(list=>gcEntries.push(...list.getEntries()));observer.observe({entryTypes:['gc']});
const run=(v,loops)=>{let hits=0;for(let i=0;i<loops;i++)for(const q of queries)if(worlds[v].ray(...q))hits++;return hits;};
for(const v of ['baseline','candidate','candidate','baseline'])run(v,2);
const results=[],loops=Number(get('--loops',4));
for(const variant of ['baseline','candidate','candidate','baseline','baseline','candidate','candidate','baseline','baseline','candidate','candidate','baseline']){
 const w=worlds[variant],q0=w.queryCount,t0=w.triangleTests,memory0=process.memoryUsage(),cpu0=process.cpuUsage(),start=performance.now();
 const hits=run(variant,loops),end=performance.now(),cpu=process.cpuUsage(cpu0),memory1=process.memoryUsage();
 results.push({variant,start,end,ms:end-start,cpu,memory:{before:memory0,after:memory1},hits,rays:w.queryCount-q0,triangleTests:w.triangleTests-t0});
}
await new Promise(resolve=>setImmediate(resolve));gcEntries.push(...observer.takeRecords());observer.disconnect();
for(const r of results){const events=gcEntries.filter(e=>e.startTime>=r.start&&e.startTime<r.end);r.gc={count:events.length,ms:events.reduce((n,e)=>n+e.duration,0)};}
const result={schema:1,component:'All recorded native rays in normal Node realm',sourceSha256:stage.sourceSha256,inputSha256:sha(input),harnessSha256:sha(fs.readFileSync(new URL(import.meta.url))),baselineSha256:sha(before),candidateSha256:sha(after),queries:queries.length,hits,exactDown:queries.filter(q=>q[1].x===0&&q[1].z===0&&q[1].y===-1).length,loops,work,environment:{node:process.version,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length},results,limits:['Normal-realm Node ray component, not whole-game/browser/device FPS.','No timing wrappers or forced GC. GC and memory observations include allocation work.','Shared-host scheduler and V8 helper threads can affect timings. All trials retained.']};
fs.writeFileSync(get('--out'),JSON.stringify(result,null,2));console.log(JSON.stringify({queries:result.queries,work,results:results.map(({variant,ms,cpu,gc})=>({variant,ms,cpu,gc}))}));
