import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateIdleResult } from '../check-inkwave-idle-resources.mjs';
import { assertValidateWorkflowContract } from '../ci/inkwave-validate-contract.mjs';
import './inkwave-idle-evaluate-deadline.test.mjs';
import './inkwave-cloud-theme-deadlines.test.mjs';
import './inkwave-results-work-progress.test.mjs';
import './inkwave-idle-gpu-identity.test.mjs';
import './inkwave-idle-artifact-transport.test.mjs';
const sample=()=>({
  coldBoot:{quality:'high',touch:true,gamePublishedAtAllocation:false,marina:true,cloud:[1024,320],farSize:256,sameTargetsAfterBoot:true},
  clouds:['day','sunset','golden'].map(theme=>({theme,highBytes:10485760,lowBytes:2621440,meanByteError:1,largeErrorFraction:.001,highRepeatChanged:0,nonzero:1000})),
  far:Array.from({length:4},()=>({size:256,disposes:1,deleted:true,cleared:true,sameEnvironment:true})),
  pause:{renders:1,environment:0,paint:0,shadowMarks:0,menuTicks:120,matchUnchanged:true,resizeRenders:1,resumedRenders:1,onlineRenders:3},
  audio:{running:true,initialPlayers:0,initialScheduler:false,mutedTicks:0,mutedNodes:0,mutedPlayers:0,mutedScheduler:false,sfxPlayed:true,resumedTrack:'battle',toggleMaxPlayers:1},
  resultsWork:{frames:120,playing:{actorUpdates:480,projectileUpdates:120,paintFlushes:120,fxUpdates:120,worldRenders:120,gpuDrawSubmissions:1200,cpuSubmissionMs:25,gpuBackpressureEvery:8,gpuSyncCalls:15,gpuSyncWallMs:1,maxGpuSyncWallMs:.1},results:{actorUpdates:0,projectileUpdates:0,paintFlushes:0,fxUpdates:0,worldRenders:120,gpuDrawSubmissions:1200,cpuSubmissionMs:20,gpuBackpressureEvery:8,gpuSyncCalls:15,gpuSyncWallMs:1,maxGpuSyncWallMs:.1}},
  errors:[],gpu:{webgl:'WebGL 2.0 fixture',renderer:'schema-only'}
});
test('acceptance schema can represent all required observations, not a GPU claim',()=>assert.equal(validateIdleResult(sample()).farTransitions,4));
test('transport and browser errors remain fatal even when all resource observations pass',()=>{
 for(const error of ['cold boot route: read ECONNRESET','cold boot console: Failed to load resource: net::ERR_FAILED','Loaded byte mismatch _versions/test/src/fx/fxHooks.js']){
  const r=sample();r.errors.push(error);assert.throws(()=>validateIdleResult(r),/Browser\/GPU errors/);
 }
});
for(const [name,mutate] of [
 ['missing RESULT evidence',r=>delete r.resultsWork],['RESULT simulation continues',r=>r.resultsWork.results.actorUpdates=1],['RESULT paint keeps flushing',r=>r.resultsWork.results.paintFlushes=120],['RESULT presentation freezes',r=>r.resultsWork.results.worldRenders=0],['missing GPU submission counts',r=>r.resultsWork.results.gpuDrawSubmissions=0],['missing GPU completion barriers',r=>r.resultsWork.results.gpuSyncCalls=0],['invalid GPU sync cost',r=>r.resultsWork.playing.gpuSyncWallMs=NaN],['invalid CPU comparison',r=>r.resultsWork.playing.cpuSubmissionMs=NaN],
 ['late mobile budget',r=>r.coldBoot.gamePublishedAtAllocation=true],['oversized cold cloud',r=>r.coldBoot.cloud=[2048,640]],['oversized cold cube',r=>r.coldBoot.farSize=512],['late replacement hides cold budget',r=>r.coldBoot.sameTargetsAfterBoot=false],
 ['missing cloud theme',r=>r.clouds.pop()],['NaN appearance',r=>r.clouds[0].meanByteError=NaN],['banding outlier',r=>r.clouds[1].largeErrorFraction=.2],['blank clouds',r=>r.clouds[0].nonzero=0],
 ['unallocated cube',r=>r.far[0].deleted=false],['stale sampler',r=>r.far[2].cleared=false],['duplicate dispose',r=>r.far[1].disposes=2],
 ['paused CPU work',r=>r.pause.environment=1],['paused rendering',r=>r.pause.renders=120],['frozen online',r=>r.pause.onlineRenders=0],['music wakeup',r=>r.audio.mutedTicks=1],['muted voices',r=>r.audio.mutedNodes=1],['silent SFX',r=>r.audio.sfxPlayed=false]
])test('rejects '+name,()=>{const r=sample();mutate(r);assert.throws(()=>validateIdleResult(r));});
test('idle GPU and WebAudio retain exact-source mandatory evidence in parallel resource lane',()=>{
 const w=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
 const resource=w.slice(w.indexOf('  resource_paint_continuation:'));
 const active=w.slice(w.indexOf('  browser:'),w.indexOf('  render-diagnostic:'));
 assert.match(resource,/node scripts\/check-inkwave-idle-resources\.mjs[^\n]+--exact-source/);
 assert.match(resource,/assert\.equal\(report\.status,'passed'\)/);
 assert.match(resource,/assert\.equal\(report\.sourceSha,process\.env\.SOURCE_SHA\)/);
 assert.match(resource,/assert\.equal\(report\.contentHash,build\.contentHash\)/);
 assert.match(resource,/name: inkwave-idle-resource-\$\{\{ env\.SOURCE_SHA \}\}/);
 assert.doesNotMatch(active,/idle-resources\/idle-resources-result.json/);
 // The final gate now includes admission_preflight; validate its exact YAML
 // dependency/result contract instead of the obsolete seven-job text list.
 assertValidateWorkflowContract(w);
 assert.match(w,/test "\$RESOURCE_RESULT" = success/);
 for(const name of ['motion-detail','wall','flow','responsive','identity-touch'])assert.ok(w.includes(name));
});

test('idle resource lane cannot lose its admitted final-gate dependency or exact result binding',()=>{
 const w=fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml',import.meta.url),'utf8');
 const {finalNeeds}=assertValidateWorkflowContract(w);
 const needLine='    needs: ['+finalNeeds.join(', ')+']';
 assert.equal(w.split(needLine).length,2,'one exact final gate dependency owner');
 for(const missing of ['admission_preflight','resource_paint_continuation']) {
  const changed=w.replace(needLine,'    needs: ['+finalNeeds.filter(name=>name!==missing).join(', ')+']');
  assert.throws(()=>assertValidateWorkflowContract(changed),/final gate must collect every required job/);
 }
 const binding='RESOURCE_RESULT: ${{ needs.resource_paint_continuation.result }}';
 assert.equal(w.split(binding).length,2);
 assert.throws(()=>assertValidateWorkflowContract(w.replace(binding,'RESOURCE_RESULT: ${{ needs.browser.result }}')),/unbound result for resource_paint_continuation/);
 const success='test "$RESOURCE_RESULT" = success';
 assert.equal(w.split(success).length,2);
 assert.throws(()=>assertValidateWorkflowContract(w.replace(success,'true # removed required resource check')),/missing success check for resource_paint_continuation/);
});
