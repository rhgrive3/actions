// Read-only summary of the retained diagnostic JSON. No production imports.
// Usage: node summarize.mjs whole-game-measure.json > measurement-summary.json
import fs from 'node:fs';
import crypto from 'node:crypto';
const bytes=fs.readFileSync(process.argv[2]),d=JSON.parse(bytes);
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const pairs=[[0,1],[3,2],[5,4],[6,7]];
const keys=['submit','completed','pacing','gpuWholeRun'];
const intervals={};
if(d.mode==='measure'&&d.trials.length===8&&d.trials.every(t=>t.status==='complete')){
 for(const key of keys){
  const mean=t=>key==='gpuWholeRun'?t.gpu.rows.reduce((s,r)=>s+r.milliseconds,0)/t.gpu.rows.length:t[key]?.mean;
  if(key==='gpuWholeRun'&&!d.gpuComparable)continue;
  const rows=pairs.map(([a,b])=>({A:a,B:b,costChangePercent:100*(mean(d.trials[b])/mean(d.trials[a])-1)}));
  if(!rows.every(r=>Number.isFinite(r.costChangePercent)))continue;
  const values=rows.map(r=>r.costChangePercent),m=values.reduce((s,v)=>s+v,0)/values.length;
  const sd=Math.sqrt(values.reduce((s,v)=>s+(v-m)**2,0)/(values.length-1)),margin=3.182446305*sd/2;
  intervals[key]={pairs:rows,meanPairedCostChangePercent:m,ci95:[m-margin,m+margin]};
 }
}
const summary={schema:1,sourceFileSha256:sha256,status:d.status,mode:d.mode,provenance:d.provenance,
 harnessSha256:d.harnessSha256,runtimeEvidenceLibSha256:d.runtimeEvidenceLibSha256,
 calibrationEvidenceSha256:d.calibrationEvidenceSha256,settings:d.settings,environment:d.environment,
 scope:d.scope,limitations:d.limitations,summary:d.summary,
 aggregateCostChangePercent:Object.fromEntries(keys.filter(k=>d.summary?.A[k]&&d.summary?.B[k]).map(k=>[k,100*(d.summary.B[k].mean/d.summary.A[k].mean-1)])),
 pairedTrialIntervals:intervals,
 intervalMethod:'Four adjacent AB/BA trial pairs; cost increase is positive. Two-sided Student t interval, df=3. Assumes independent approximately normal pair effects; chronological/system variation may violate this. Frame samples are not treated as independent trials.',
 comparability:d.comparability,stateDifferences:d.stateDifferences,visualValidation:d.visualValidation,
 drawCallsComparable:d.drawCallsComparable,drawCallComparability:d.drawCallComparability,
 resourceValidation:d.resourceValidation,backgroundComparable:d.backgroundComparable,gpuComparable:d.gpuComparable,
 gameplayComparable:d.gameplayComparable,guardCoverage:d.guardCoverage,
 performanceNondegradationEstablished:false,
 adoption:'UNQUALIFIED until all CPU/GPU/tail/resource and scenario gates are independently assessed. A diagnostic passed label only describes the recorded comparability guard.',
 loadedArtifactBytes:d.loadedArtifactBytes,
 trials:d.trials.map(t=>({ordinal:t.ordinal,variant:t.variant,status:t.status,setupElapsedMs:t.setupElapsedMs,
  submit:t.submit,completed:t.completed,pacing:t.pacing,gpu:t.gpu,
  resourcesBefore:t.resourcesBefore,resourcesAfter:t.resourcesAfter,
  metricsBefore:t.metricsBefore,metricsAfter:t.metricsAfter,systemBefore:t.systemBefore,systemAfter:t.systemAfter,
  frames:t.frames,pixelSha256:t.pixelSha256,invariants:t.invariants,errors:t.errors}))};
console.log(JSON.stringify(summary,null,2));
