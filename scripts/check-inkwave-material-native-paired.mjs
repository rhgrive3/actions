#!/usr/bin/env node
// Fixed-step full native practice-range pilot. No whole-device/GPU acceptance.
import {createHash} from 'node:crypto';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const [site,source,overlay,rootArg,mode]=process.argv.slice(2),root=path.resolve(rootArg);
fs.mkdirSync(root,{recursive:true});
const print=x=>{const bytes=Buffer.from(JSON.stringify(x)+'\n');let p=0;while(p<bytes.length)p+=fs.writeSync(1,bytes,p,bytes.length-p);};

function requireSameReplay(actual,expected){assert.deepEqual(actual,expected,'same observed native render history and provenance; no counter/seed alignment');}
function requireReplayPixels(actual,expected){assert.ok(Buffer.isBuffer(actual)&&Buffer.isBuffer(expected));assert.ok(actual.equals(expected),'same capture ordinal whole-frame PNG bytes');}
function requireSettledMaterialEntry(observation, actualOrdinal, expectedOrdinal) {
 if(!Number.isInteger(expectedOrdinal)||expectedOrdinal<1||actualOrdinal!==expectedOrdinal)throw Error('Native frame ordinal mismatch');
 const {rig,input,jobs}=observation;
 if(rig.mode!=='follow'||!rig.target?.local||rig.blend?.active)throw Error('Native camera transition incomplete');
 if(input.mouse&&(input.mouse.dx!==0||input.mouse.dy!==0||input.mouse.left||input.mouse.right||input.mouse.leftPressed||input.mouse.rightPressed)||input.keys.length||input.pressed.length)throw Error('Non-neutral native input');
 if(jobs.lobby&&(!jobs.lobby.ready||jobs.lobby.failed))throw Error('Existing native lobby job incomplete');
 if(['hasJob','hasTask','hasActiveCharacter','hasPreparedCharacter'].some(k=>jobs.portrait[k]!==false)||jobs.portrait.inFlight!==0||jobs.portrait.queued!==0||jobs.portrait.warmState!=='done')throw Error('Existing native presentation work incomplete');
 return true;
}

function runReplayDiagnostic(){
 const sourceSha='429cc1352d9b13ffe83c579ed714b84acf6139ed',labels=['unpainted','painted','repeat','repeat2'];
 const sha=x=>createHash('sha256').update(x).digest('hex'),rows=[],checks=[];
 const check=(name,fn)=>{try{fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.message.slice(0,2048),errorTruncated:e.message.length>2048});}};
 const negative={rendererFrame:123,captureOrdinal:1,rngState:7,clocks:{game:.05},atlasHash:'atlas',sourceSha,style:{hair:0}};
 requireSameReplay(structuredClone(negative),negative);
 for(const bad of [{...negative,rendererFrame:124},{...negative,captureOrdinal:2},{...negative,rngState:8},
  {...negative,clocks:{game:.06}},{...negative,atlasHash:'other'},{...negative,sourceSha:'other'},{...negative,style:{hair:1}}])
  assert.throws(()=>requireSameReplay(bad,negative),assert.AssertionError);
 requireReplayPixels(Buffer.from([1,2,3]),Buffer.from([1,2,3]));
 assert.throws(()=>requireReplayPixels(Buffer.from([1,2,4]),Buffer.from([1,2,3])),assert.AssertionError);
 print({phase:'replay-negative-controls',status:'passed',diagnosticOnly:true,rejected:['renderer frame','capture ordinal','RNG state','clock','atlas','source','style','one-byte image difference']});
 // Three fresh browsers only. Save B even when the inherited sequential zero-repeat gate rejects A.
 // Each short diagnostic is bounded to five minutes; no 120-frame measurement or timeout extension.
 for(const [lane,variant]of [['A1','A'],['A2','A'],['B1','B']]){
  const out=path.join(root,lane);let childError=null;
  try{execFileSync(process.execPath,['scripts/check-inkwave-material-native-frame.mjs',site,source,overlay,out,variant,'--diagnostic'],{stdio:'inherit',timeout:300000});}
  catch(e){childError={message:e.message,status:e.status,signal:e.signal,code:e.code};}
  const row={lane,variant,out,childError};rows.push(row);
  check(lane+' evidence integrity',()=>{
   const receipt=JSON.parse(fs.readFileSync(path.join(out,'receipt.json'),'utf8')),e=JSON.parse(fs.readFileSync(path.join(out,'pixel-diagnostic.json'),'utf8'));
   row.receipt=receipt;row.evidence=e;
   assert.equal(receipt.sourceSha,sourceSha);assert.equal(receipt.variant,variant);assert.equal(receipt.diagnosticOnly,true);assert.equal(receipt.performanceAccepted,false);
   assert.deepEqual(receipt.errors,[]);assert.ok(['passed','failed'].includes(receipt.status));
   if(receipt.status==='passed')assert.equal(childError,null,'passed receipt requires successful child completion');
   else{if(/Native entry readiness failed:/.test(receipt.error)){assert.equal(e.entryReadiness?.passed,false);assert.ok(receipt.error.includes('Native entry readiness failed: '+e.entryReadiness.error));}else assert.match(receipt.error,/Paint visibility or frozen-repeat gate failed:/);assert.equal(childError?.status,1);assert.ok(!childError.signal&&!childError.code,'expected rejection must not be a signal/timeout/launch error');}
   assert.equal(e.diagnosticOnly,true);assert.equal(e.performanceAccepted,false);assert.equal(e.width,960);assert.equal(e.height,600);assert.equal(e.glError,0);
   assert.ok(e.paintSignal.changed>1000);assert.match(e.atlasHash,/^[a-f0-9]{64}$/);
   assert.deepEqual(e.renderStates.map(x=>[x.label,x.captureOrdinal]),labels.map((x,i)=>[x,i]));
   for(const capture of e.renderStates)for(const key of ['before','afterRender','after']){
    const state=capture[key];assert.equal(state.entryObservation?.truncated,false);assert.ok(state.entryObservation.geometries.length>0);assert.ok(state.entryObservation.owners.length>0);assert.ok(state.entryObservation.geometries.every(x=>/^[a-f0-9]{64}$/.test(x.contentSha256)));assert.ok(Number.isInteger(state.rendererFrame));assert.ok(Number.isInteger(state.rngState));
    assert.equal(state.character.nodesTruncated,false);assert.equal(state.character.materialsTruncated,false);
    assert.equal(state.character.boneMatrices.truncated,false);assert.equal(state.presentation.lightsTruncated,false);
    assert.ok(state.character.materials.every(m=>m.uniformCount<=128));
   }
   assert.deepEqual(e.images.map(x=>x.file),labels.map(x=>x+'.png'));
   row.images=e.images.map(x=>{assert.equal(x.width,960);assert.equal(x.height,600);const bytes=fs.readFileSync(path.join(out,x.file));
    assert.equal(sha(bytes),x.sha256);assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
    assert.equal(bytes.toString('ascii',12,16),'IHDR');assert.equal(bytes.readUInt32BE(16),960);assert.equal(bytes.readUInt32BE(20),600);return bytes;});
   const bound=receipt.overlay,target='_versions/'+bound.revision+'/src/world/inkShading.js';
   assert.equal(bound.sourceSha,sourceSha);assert.equal(bound.inputHash,receipt.inputHash);assert.equal(bound.contentHash,receipt.contentHash);
   const loaded=new Map(receipt.loaded);assert.equal(loaded.get(target),variant==='A'?bound.baselineEmittedSha256:bound.candidateEmittedSha256);
   row.condition={sourceSha,inputHash:receipt.inputHash,contentHash:receipt.contentHash,overlay:bound,environment:receipt.environment,
    loadedExceptMaterial:[...loaded].filter(([k])=>k!==target).sort((a,b)=>a[0].localeCompare(b[0])),
    entryConditionTrace:e.entryConditionTrace,entryReadiness:e.entryReadiness,initial:e.initial,atlasHash:e.atlasHash,atlasConditions:e.atlasConditions,fixture:e.fixture,state:e.state,placements:e.placements,renderStates:e.renderStates};
   assert.ok(row.condition.initial&&row.condition.fixture&&row.condition.renderStates.length===4);
   row.integrity=true;
  });
  check(lane+' native entry settled',()=>{assert.ok(row.integrity);const e=row.evidence;assert.deepEqual(e.entryConditionTrace.map(x=>x.ordinal),[0,1,2,3]);requireSettledMaterialEntry(e.entryConditionTrace.at(-1).state,e.entryReadiness.actualNativeFrames,e.entryReadiness.expectedNativeFrames);assert.equal(e.entryReadiness.expectedNativeFrames,3);assert.equal(e.entryReadiness.passed,true);assert.equal(e.entryReadiness.error,null);});
  print({phase:'replay-lane-recorded',lane,variant,integrity:!!row.integrity,childError,sequentialStatus:row.receipt?.status,
   sequentialError:row.receipt?.error,paintSignal:row.evidence?.paintSignal,repeatSignal:row.evidence?.repeatSignal,repeat2Signal:row.evidence?.repeat2Signal,
   entryReadiness:row.evidence?.entryReadiness,imageHashes:row.evidence?.images,diagnosticOnly:true,performanceAccepted:false});
  if(childError?.code==='ETIMEDOUT'){checks.push({name:'bounded child completion',passed:false,error:lane+' timed out; stop instead of launching more browsers after an uncertain shutdown'});break;}
 }
 const [a1,a2,b1]=rows;
 check('A1/A2 observed history and provenance',()=>{assert.ok(a1?.integrity&&a2?.integrity);requireSameReplay(a2.condition,a1.condition);});
 check('A1/A2 all four exact capture ordinals',()=>{assert.ok(a1?.integrity&&a2?.integrity);for(let i=0;i<4;i++)requireReplayPixels(a2.images[i],a1.images[i]);});
 check('B1 observed history and provenance',()=>{assert.ok(a1?.integrity&&b1?.integrity);requireSameReplay(b1.condition,a1.condition);});
 const aaChecks=checks.filter(x=>x.name.startsWith('A1/A2'));
 const sequentialZeroRepeatAccepted=rows.length===3&&rows.every(x=>x.integrity&&x.receipt.status==='passed'&&x.evidence.repeatSignal.changed===0);
 const report={status:checks.every(x=>x.passed)&&sequentialZeroRepeatAccepted?'diagnostic-recorded':'failed',
  sourceSha,diagnosticOnly:true,performanceAccepted:false,observedHistoryAAReplayEqual:aaChecks.length===2&&aaChecks.every(x=>x.passed),
  sequentialZeroRepeatAccepted,candidateBBReplayMeasured:false,checks,
  lanes:rows.map(x=>({lane:x.lane,variant:x.variant,directory:x.out,integrity:!!x.integrity,status:x.receipt?.status,error:x.receipt?.error,
   entryReadiness:x.evidence?.entryReadiness,childError:x.childError,paintSignal:x.evidence?.paintSignal,repeatSignal:x.evidence?.repeatSignal,repeat2Signal:x.evidence?.repeat2Signal,imageHashes:x.evidence?.images})),
  limitations:['B1 is an observation, not a B/B reproducibility proof or accepted improvement.',
   'Bounded CPU state includes cached private uniforms, not complete shader/GPU state; no cause is inferred.',
   'Existing spawn barrier remains visible; not a pure retail floor-lighting comparison.',
   'No performance samples, physical GPU/iPad measurements, or few-percent budget acceptance.']};
 fs.writeFileSync(path.join(root,'replay-diagnostic.json'),JSON.stringify(report,null,2));print({phase:'replay-diagnostic-summary',...report});
 if(report.status==='failed')process.exitCode=1;
}
assert.ok(mode===undefined||mode==='--replay-diagnostic');
if(mode==='--replay-diagnostic'){runReplayDiagnostic();process.exit(process.exitCode||0);}

const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length%2?s[(s.length-1)/2]:(s[s.length/2-1]+s[s.length/2])/2;};
const stats=a=>{assert.ok(a.length&&a.every(Number.isFinite));const m=median(a);return{n:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,median:m,mad:median(a.map(x=>Math.abs(x-m))),min:Math.min(...a),max:Math.max(...a),p95:[...a].sort((x,y)=>x-y)[Math.ceil(.95*a.length)-1]};};
const requireSameCondition=(actual,expected)=>assert.deepEqual(actual,expected,'same native world/camera/paint/clocks/workload across all lanes');
const requireMaterialSignal=(before,after)=>assert.notEqual(before,after,'actual painted material sensitivity');
// Negative controls exercise the exact acceptance predicates before launching browsers.
const control={clocks:{game:3,paint:3},atlasHash:'painted-atlas',camera:[0,1,2]};
requireSameCondition(structuredClone(control),control);
for(const bad of [{...control,clocks:{game:4,paint:3}},{...control,atlasHash:'wrong-atlas'},{...control,camera:[0,1,3]}])
 assert.throws(()=>requireSameCondition(bad,control),assert.AssertionError);
requireMaterialSignal('original-painted','candidate-painted');
assert.throws(()=>requireMaterialSignal('same-painted','same-painted'),assert.AssertionError);
print({phase:'condition-negative-controls',status:'passed',rejected:['clock drift','atlas mismatch','camera mismatch','zero material signal']});
const blocks=[];let reference=null;
for(let block=0;block<3;block++){
 const rows=[];
 for(const [order,variant]of ['A','B','B','A'].entries()){
  const out=path.join(root,block+'-'+order+'-'+variant);
  execFileSync(process.execPath,['scripts/check-inkwave-material-native-frame.mjs',site,source,overlay,out,variant],{stdio:'inherit',timeout:900000});
  const row=JSON.parse(fs.readFileSync(path.join(out,'receipt.json'),'utf8'));assert.equal(row.status,'passed');assert.equal(row.variant,variant);
  assert.equal(row.sourceSha,'429cc1352d9b13ffe83c579ed714b84acf6139ed');assert.equal(row.result.samples.length,120);
  const r=row.result,condition={inputHash:row.inputHash,contentHash:row.contentHash,environment:row.environment,initial:r.initial,placements:r.placements,atlasHash:r.atlasHash,beforeWarm:r.beforeWarm,before:r.before,after:r.after,conditions:r.conditions,gpu:r.gpu};
  if(!reference)reference=condition;else requireSameCondition(condition,reference);
  const cost=r.samples.map(({frame,renderCalls,webglPasses,drawCalls,triangles,resources})=>({frame,renderCalls,webglPasses,drawCalls,triangles,resources}));
  if(rows.length)assert.deepEqual(cost,rows[0].cost,'same per-frame render burden');
  const metrics=Object.fromEntries(['frameCpuMs','renderCpuMs','webglSubmitMs'].map(k=>[k,stats(r.samples.map(s=>s[k]))]));
  metrics.completedTransactionMsPerFrame={mean:r.completedTransactionMsPerFrame,n:1,scope:'whole 120-frame transaction plus final completion wait, normalized per frame; not GPU time'};
  rows.push({variant,order,directory:out,metrics,cost,pixels:r.pixels,completionDrainMs:r.completionDrainMs});
  print({phase:'native-observation',block,order,variant,sourceSha:row.sourceSha,conditions:r.conditions,initial:r.initial,before:r.before,after:r.after,paint:{samples:r.placements.length,atlasHash:r.atlasHash,pixels:r.pixels},metrics,completionDrainMs:r.completionDrainMs,gpu:r.gpu,allocations:r.allocations,scope:r.scope});
 }
 assert.equal(rows[0].pixels.unpainted,rows[1].pixels.unpainted,'unpainted original/candidate must match');
 assert.equal(rows[0].pixels.painted,rows[3].pixels.painted,'A repeat pixels');assert.equal(rows[1].pixels.painted,rows[2].pixels.painted,'B repeat pixels');
 requireMaterialSignal(rows[0].pixels.painted,rows[1].pixels.painted);
 const paired=Object.fromEntries(['frameCpuMs','renderCpuMs','webglSubmitMs','completedTransactionMsPerFrame'].map(k=>{
  const before=(rows[0].metrics[k].mean+rows[3].metrics[k].mean)/2,after=(rows[1].metrics[k].mean+rows[2].metrics[k].mean)/2;
  assert.ok(before>0&&after>0&&Number.isFinite(before)&&Number.isFinite(after));
  return[k,{beforeMeanMs:before,afterMeanMs:after,deltaMs:after-before,deltaPercent:(after/before-1)*100}];
 }));
 blocks.push({block,rows,paired});print({phase:'paired-native-block',block,paired});
}
const summary=Object.fromEntries(['frameCpuMs','renderCpuMs','webglSubmitMs','completedTransactionMsPerFrame'].map(k=>[k,{beforeMeanMs:stats(blocks.map(b=>b.paired[k].beforeMeanMs)),afterMeanMs:stats(blocks.map(b=>b.paired[k].afterMeanMs)),deltaMs:stats(blocks.map(b=>b.paired[k].deltaMs)),deltaPercent:stats(blocks.map(b=>b.paired[k].deltaPercent))}]));
const report={status:'passed',sourceSha:'429cc1352d9b13ffe83c579ed714b84acf6139ed',scenario:'native practice range',blocks,summary,
 performanceAccepted:false,scope:'3 ABBA blocks; 12 observations x120 full native fixed frames, not independent 1440 benchmark repeats',
 rangeObservedWithinThreePercent:summary.frameCpuMs.deltaPercent.max<=3&&summary.completedTransactionMsPerFrame.deltaPercent.max<=3,
 limitations:['Object-stage scenario still required.','Three paired blocks describe observed spread, not a device-level confidence bound.','SwiftShader CPU submission is not physical GPU time or iPad performance.','Live presented FPS and allocation rate are unmeasured.','Frame/readback sensitivity validates workload, not retail fidelity.']};
fs.writeFileSync(path.join(root,'paired-result.json'),JSON.stringify(report,null,2));print({status:report.status,sourceSha:report.sourceSha,summary,performanceAccepted:false,rangeObservedWithinThreePercent:report.rangeObservedWithinThreePercent,limitations:report.limitations});
