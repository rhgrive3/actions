import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {verifyRuntimeBuild,hash,sampleStats} from '../scripts/lib/inkwave-runtime-evidence.mjs';

const root=path.resolve(import.meta.dirname,'..'),baseRoot='/workspace/actions-native-base';
const get=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const loops=Number(get('--loops','4')),rounds=Number(get('--rounds','2'));
assert.ok(Number.isSafeInteger(loops)&&loops>0&&loops<=100&&Number.isSafeInteger(rounds)&&rounds>0&&rounds<=10);
const out=root+'/.ci-scratch/coverage-component';fs.mkdirSync(out,{recursive:true});
const inputPath=root+'/.ci-scratch/coverage-capture/ownership.json',input=fs.readFileSync(inputPath),capture=JSON.parse(input);
const beforeBuild=verifyRuntimeBuild(baseRoot+'/_site',baseRoot,'5637c8038e00466a8022c4d2b705ec9e5dc1c8d2');
const afterBuild=verifyRuntimeBuild(root+'/_site',root,capture.sourceSha);
assert.equal(afterBuild.contentHash,capture.contentHash);
const beforePath=baseRoot+'/_site/patches/splatoon3/runtime/scoring.mjs',afterPath=root+'/_site/patches/splatoon3/runtime/scoring.mjs';
const before=await import(pathToFileURL(beforePath)),after=await import(pathToFileURL(afterPath));
const decode=(text,Type)=>{const bytes=Buffer.from(text,'base64');return new Type(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));};
const initialGrid=decode(capture.grid,Uint8Array),cells=decode(capture.cells,Int32Array),weights=decode(capture.weights,Float64Array);
assert.equal(cells.length,capture.eligibleCells);assert.equal(weights.length,cells.length);assert.equal(initialGrid.length,capture.gridLength);
const events=capture.events.map(event=>({...event,writes:Int32Array.from(event.writes)}));
const finalGrid=initialGrid.slice();for(const event of events)for(let k=0;k<event.writes.length;k+=2)finalGrid[event.writes[k]]=event.writes[k+1];
const change=cell=>{const value=finalGrid[cell]===1?2:1;finalGrid[cell]=value;return [cell,value];};
const early=cells[0],late=cells.at(-1),middle=cells[Math.floor(cells.length/2)];
events.push({kind:'wall',writes:Int32Array.from(change(early)),usesOut:false,label:'silent early turf edit followed by known wall publication'},
  {kind:'turf',writes:Int32Array.from(change(late)),usesOut:true,label:'later known turf writer must observe the earlier silent edit'},
  {kind:'unknown',writes:Int32Array.from(change(middle)),usesOut:false,label:'unknown public version invalidates the complete scan'},
  {kind:'turf',writes:new Int32Array(),usesOut:true,label:'known turf publication with unchanged ownership'});
const eventSummary={};let writePairs=0;
for(const event of events){eventSummary[event.kind]=(eventSummary[event.kind]||0)+1;writePairs+=event.writes.length/2;}
function maker(api){class Paint{}api.installScoring({PaintSystem:Paint});return label=>{
  const grid=initialGrid.slice(),dead=new Uint8Array(grid.length),faces=[];
  const p=Object.assign(new Paint(),{grid,dead,paintFaces:faces,version:0,
    _s3CoverageIndex:{grid,dead,faces,cells,weights,area:capture.area}});
  return {label,api,p,out:[0,0]};
};}
const baseline=maker(before),candidate=maker(after);
const variants={'baseline-a':baseline('baseline-a'),candidate:candidate('candidate'),'baseline-b':baseline('baseline-b')};
function reset(v,verify=true){v.p.grid.set(initialGrid);v.p.version++;const actual=v.p.coverage(v.out);if(verify)assert.deepEqual(actual,capture.initialResult);}
function apply(v,event){
  for(let k=0;k<event.writes.length;k+=2)v.p.grid[event.writes[k]]=event.writes[k+1];
  if(event.kind==='turf')v.api.notePaintMutation(v.p,true);
  else if(event.kind==='wall')v.api.notePaintMutation(v.p,false);
  else if(event.kind==='unknown')v.p.version++;
}
const bits=values=>{const b=Buffer.allocUnsafe(16);b.writeDoubleLE(values[0],0);b.writeDoubleLE(values[1],8);return b.toString('hex');};
const expected=[],counts={};
for(const v of Object.values(variants)){
  reset(v);const values=[],work={coverageCalls:0,fullScans:0,partialScans:0,unchangedVerified:0,prefixGroupsCompared:0,suffixEligibleCells:0,weightedAdditions:0};
  for(let i=0;i<events.length;i++){
    const event=events[i];apply(v,event);let start=0,scan=event.kind==='turf'||event.kind==='unknown';
    if(scan){
      const replay=v.p._s3CoverageIndex.replay;
      if(event.kind!=='unknown'&&replay?.valid){
        let first=0;
        for(;first<replay.groups.length;first++){
          work.prefixGroupsCompared++;const group=replay.groups[first],value=group<0?v.p.grid[~group]:replay.words[group];
          if(value!==replay.ownership[first])break;
        }
        if(first===replay.groups.length){start=cells.length;work.unchangedVerified++;}
        else{start=replay.checkpoints[first>>>8];work.partialScans++;}
      }else work.fullScans++;
      work.suffixEligibleCells+=cells.length-start;
      for(let k=start;k<cells.length;k++){const team=v.p.grid[cells[k]];if(team===1||team===2)work.weightedAdditions++;}
    }
    const actual=event.usesOut?v.p.coverage(v.out):v.p.coverage();work.coverageCalls++;
    if(event.expected)assert.deepEqual(actual,event.expected,'native captured result '+i);
    const value={index:i,label:event.label||null,value:[...actual],bits:bits(actual)};
    if(v.label==='baseline-a')expected.push(value);else assert.equal(value.bits,expected[i].bits,v.label+' bit parity '+i);
    values.push(value);
  }
  counts[v.label]=work;
  fs.writeFileSync(out+'/'+v.label+'-values.json',JSON.stringify(values)+'\n');
}
const replay=v=>{
  let checksum=0;
  for(const event of events){apply(v,event);const value=event.usesOut?v.p.coverage(v.out):v.p.coverage();checksum+=value[0]+value[1];}
  return checksum;
};
const expectedChecksum=expected.reduce((sum,event)=>sum+(event.value[0]+event.value[1]),0);
let batchChecksum=0;for(let i=0;i<loops;i++)batchChecksum+=expectedChecksum;
// Work accounting and bit comparisons above are entirely outside these runs.
for(const label of ['baseline-a','candidate','baseline-b','candidate','baseline-b','baseline-a']){
  const v=variants[label];reset(v);assert.equal(replay(v),expectedChecksum);
}
const result={schema:1,status:'running',component:'Emitted coverage cache publication and ownership-array replay in Node',
  input:{path:inputPath,sha256:hash(input),captureSourceSha:capture.sourceSha,captureContentHash:capture.contentHash,nativeSourceSha256:capture.nativeSourceSha256,
    nativeEvents:capture.events.length,adversarialEvents:events.length-capture.events.length,events:events.length,eventSummary,writePairs,
    gridCells:initialGrid.length,eligibleCells:cells.length,area:capture.area},
  source:{baseline:'5637c8038e00466a8022c4d2b705ec9e5dc1c8d2',candidate:capture.sourceSha,baselineContentHash:beforeBuild.contentHash,candidateContentHash:afterBuild.contentHash,
    baselineEmittedSha256:hash(fs.readFileSync(beforePath)),candidateEmittedSha256:hash(fs.readFileSync(afterPath)),harnessSha256:hash(fs.readFileSync(import.meta.filename))},
  environment:{node:process.version,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,cpuQuota:fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8').trim()},
  allValuesBitIdentical:true,counts,loops,rounds,memory:{},runs:[],
  limits:['Captured native eligible ownership writes and publication/call classes, not full actor/browser execution or FPS.',
    'Each timed replay includes sparse writes, version publication and the original output allocation choice. Intermediate replay resets copy the initial grid and force one full initial scan; they are identical for all variants.',
    'All exact-result checks, workload counts, build verification and warmups are outside timed windows. No forced GC.',
    'Static cells/weights are shared immutable data among fixtures; ownership grids and incremental snapshots are independent.',
    'Observed process memory is not peak memory. Typed-buffer byteLength totals exclude JS object and first-build transient array overhead.',
    'Wall/process CPU values are affected by the shared executor; baseline A/A controls accompany all candidate results.']};
for(const [label,v]of Object.entries(variants)){
  const r=v.p._s3CoverageIndex.replay;
  result.memory[label]={gridBytes:v.p.grid.byteLength,deadBytes:v.p.dead.byteLength,sharedIndexBytes:cells.byteLength+weights.byteLength,
    additionalTypedBytes:r?r.groups.byteLength+r.ownership.byteLength+r.checkpoints.byteLength+r.prefix0.byteLength+r.prefix1.byteLength:0,
    groups:r?.groups.length??0,checkpoints:r?.checkpoints.length??0};
}
const save=()=>fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2)+'\n');save();
const schedule=['baseline-a','candidate','candidate','baseline-a','candidate','baseline-b','baseline-b','candidate'];
for(let round=0;round<rounds;round++)for(const label of schedule){
  const v=variants[label];reset(v);const beforeMemory=process.memoryUsage(),cpu0=process.cpuUsage(),start=performance.now();let checksum=0;
  for(let loop=0;loop<loops;loop++){if(loop)reset(v,false);checksum+=replay(v);}
  const ms=performance.now()-start,cpu=process.cpuUsage(cpu0),afterMemory=process.memoryUsage();assert.equal(checksum,batchChecksum);
  const row={round,label,replays:loops,wallMs:ms,msPerReplay:ms/loops,cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000,
    cpuMsPerReplay:(cpu.user+cpu.system)/1000/loops,checksum,memory:{before:beforeMemory,after:afterMemory}};
  result.runs.push(row);save();console.log(JSON.stringify(row));
}
result.statistics=Object.fromEntries(Object.keys(variants).map(label=>[label,{wallMsPerReplay:sampleStats(result.runs.filter(r=>r.label===label).map(r=>r.msPerReplay)),
  processCpuMsPerReplay:sampleStats(result.runs.filter(r=>r.label===label).map(r=>r.cpuMsPerReplay))}]));
result.status='passed';save();console.log(JSON.stringify({status:result.status,statistics:result.statistics}));
