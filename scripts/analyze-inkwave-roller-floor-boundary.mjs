// No runtime mutation. Replays the exact emitted floor evaluator, then rejects
// bounded boundary-only proposals that violate floor or native handoff limits.
import fs from 'node:fs';import path from'node:path';import assert from'node:assert/strict';import{gunzipSync}from'node:zlib';
import*as T from'../inkwave-public/vendor/three/build/three.module.js';import{floorEvaluator}from'./lib/inkwave-roller-floor-constraints.mjs';
const input=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const p=read(input),events=tick=>p.layerEvents.filter(x=>x.tick===tick),entry=tick=>events(tick).find(x=>x.stage==='rollerIKIn'&&x.side==='R'),
 selected=tick=>events(tick).find(x=>x.stage==='nativeIKIn'&&x.side==='R').quaternion;
const q=a=>new T.Quaternion().fromArray(a),at=(e,a)=>new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),a).multiply(q(e.quaternion)).toArray(),angle=(a,b)=>q(a).angleTo(q(b));
let count=0,maxError=0,maxQComponentDifference=0;const started=performance.now();
for(let tick=35;tick<=58;tick++){const e=entry(tick);assert(e&&!e.constraints.contacting);let before;
 for(const x of events(tick)){if(x.stage==='floorIn')before=x;if(x.stage==='floorOut'){
  const r=floorEvaluator(e.constraints,before.target)(before.quaternion);count++;
  maxError=Math.max(maxError,Math.abs(r.error-x.floorError));maxQComponentDifference=Math.max(maxQComponentDifference,...r.q.map((v,i)=>Math.abs(v-x.quaternion[i])));
 }}}
const replayMilliseconds=performance.now()-started;assert(maxError<1e-12&&maxQComponentDifference<1e-12);
const rows=[];for(let tick=40;tick<=56;tick++){const e=entry(tick),evaluate=floorEvaluator(e.constraints,e.target),samples=[];
 for(let step=0;step<=30;step++){const a=step*.05;const r=evaluate(at(e,a));samples.push({a,...r,admissible:r.error<=.003});}
 rows.push({tick,baseline:evaluate(e.quaternion),priorOutputInCurrentConstraints:evaluate(selected(tick-1)),samples});
}
const e49=entry(49),evaluate49=floorEvaluator(e49.constraints,e49.target),left=evaluate49(at(e49,1.25)),right=evaluate49(at(e49,1.5)),
 midpointScalar=evaluate49(at(e49,1.375)),midpointQuaternion=evaluate49(q(left.q).slerp(q(right.q),.5).toArray());
assert(left.error<=.003&&right.error<=.003);assert(midpointScalar.error>.003&&midpointQuaternion.error>.003);
// Refine the two already-bracketed transitions, not a larger SO(3) search.
// Thirty iterations reuses the old per-axis loop bound; this is offline only.
let boundaryQueries=0;function refine(lo,hi){const admissible=a=>{boundaryQueries++;return evaluate49(at(e49,a)).error<=.003;};let loValid=admissible(lo);assert(loValid!==admissible(hi));
 for(let i=0;i<30;i++){const mid=(lo+hi)/2;if(admissible(mid)===loValid)lo=mid;else hi=mid;}return[lo,hi];}
const forbiddenInterval={lower:refine(1.25,1.3),upper:refine(1.45,1.5)};
const slerpCounterexample={left,right,midpointScalar,midpointQuaternion,forbiddenInterval,boundaryQueries};
// Prototype A: admit the original search when base floor clears, retaining its
// existing early exit, six axes, coefficients and angle grid. This is only one
// boundary query replay; nothing is installed into Character or a real frame.
function admittedExistingLoop(e,previousA,earlyBreak){const evaluate=floorEvaluator(e.constraints,e.target),base=evaluate(e.quaternion);let best={...base,axis:-1,sign:0,a:0,cost:base.error*30+.1*previousA},queries=1;
 for(let axis=0;axis<3;axis++)for(const sign of[-1,1]){
  if(!earlyBreak&&(axis!==2||sign!==1))continue;
  const v=new T.Vector3(...[[1,0,0],[0,1,0],[0,0,1]][axis]);
  for(let step=1;step<=30;step++){const a=step*.05,r=evaluate(new T.Quaternion().setFromAxisAngle(v,sign*a).multiply(q(e.quaternion)).toArray());queries++;
   const cost=r.error*30+a*.06+.1*(axis===2&&sign===1?Math.abs(a-previousA):a+previousA);
   if(cost<best.cost)best={...r,axis,sign,a,cost};if(earlyBreak&&r.error<=.003)break;
  }}return{...best,queries};}
const simpleAdmission=admittedExistingLoop(e49,1.3,true);simpleAdmission.stepFromPrior=angle(selected(48),simpleAdmission.q);
const sticky=[];let previousA=1.3;
for(let tick=49;tick<=55;tick++){const r=admittedExistingLoop(entry(tick),previousA,false);sticky.push({tick,...r});previousA=r.a;}
const nativeHandoff={tick:56,remainingCorrection:previousA,orientationStep:angle(sticky.at(-1).q,selected(56))};
assert(simpleAdmission.stepFromPrior>1,'gate-only admission still jumps');assert(sticky.every(r=>r.error<=.003),'prototype remains floor admissible');assert(nativeHandoff.remainingCorrection>1,'old costs retain a nonzero correction at the native deadline');
const benchmarkEntry=entry(49),benchmark=floorEvaluator(benchmarkEntry.constraints,benchmarkEntry.target),begin=performance.now();let checksum=0;
for(let iteration=0;iteration<20;iteration++)for(let step=0;step<=30;step++)checksum+=benchmark(at(benchmarkEntry,step*.05)).error;
const boundedProbeMilliseconds=performance.now()-begin;
const result={schema:1,status:'diagnostic only; no accepted production candidate',scope:'Exact INKWAVE emitted evaluator inputs, not retail animation or proof of absence of every 3D path',
 identity:{inputHash:p.inputHash,contentHash:p.contentHash,scriptSha256:p.scriptSha256},
 replay:{count,maxError,maxQComponentDifference,replayMilliseconds},requiredWitnesses:{landing40:rows[0],recovery49:rows.find(r=>r.tick===49)},
 slerpCounterexample,proposals:{simpleAdmission,previousBranchCostContinuation:sticky,nativeHandoff},rows,
 operation:{newRuntimeModules:0,newRuntimeQueries:0,offlineRootQueries:boundaryQueries,boundedProbeQueries:620,boundedProbeMilliseconds,checksum},
 conclusion:'Previous pose hold violates floor. Valid scalar or quaternion endpoints do not imply a valid connecting path. Merely admitting the existing search still jumps; preserving its branch with its existing cost sticks until native handoff. A constraint-valid path with an endpoint condition remains unproved; no curve, visual parameter or larger runtime search has been added.'};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({replay:result.replay,forbiddenInterval,proposals:{simpleAdmissionStep:simpleAdmission.stepFromPrior,simpleAdmissionAngle:simpleAdmission.a,nativeHandoff},operation:result.operation},null,2));
