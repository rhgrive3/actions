import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompactProfilerReport } from '../range-frame-profiler.mjs';

test('compact share report keeps diagnostic signals and bounds hitch detail', () => {
  const hitches = Array.from({length:12},(_,i)=>({
    id:i+1,gapMs:40+i,workMs:18+i,cause:'CPU / simulation',
    sourceBVH:{queries:100+i,triangleTests:2000+i},
    methodCalls:{'source-ray':300,'physics-ray':300,'source-box':0,'source-sweep':12},
    stages:{simulation:8,render:3,'source-ray':2,'actor-0':1,fx:.2,paint:.1},
    topNativeScopes:[{name:'actor-0',ms:4}],
    sourceCallers:{'source-ray':[{caller:'engine.mjs:raycast',samples:2,sampleStride:512}]},
    workTiming:{consistent:true},fixedClock:{ticks:3,queuedAfterSeconds:.01},
  }));
  const raw={gpu:'sampling',gpuPaint:'sampling',gpuSamples:30,gpuPaintSamples:30,
    gpuP95Ms:22,gpuMaxMs:25,latestGPUCommandsMs:21,latestGPUPaintMs:4,
    capturedFrames:240,hitchCount:40,longTaskCount:2,longTaskObserver:'available',
    recentHitches:hitches,latest:hitches[11]};
  const ab={status:'compared',idle:{status:'ok',frames:100,observedFPS:30,
    frameGapMs:{p50:33,p95:40},gameFrameWorkMs:{mean:10},ownerMeanMs:{simulation:5},
    callsPerFrame:{'source-ray':400}},fire:{status:'ok',frames:100,observedFPS:20,
    frameGapMs:{p50:50,p95:70},gameFrameWorkMs:{mean:20},ownerMeanMs:{simulation:8},
    callsPerFrame:{'source-ray':800}},delta:{fps:-10,avgGameFrameWorkMs:10}};
  const text=buildCompactProfilerReport(raw,ab);
  const report=JSON.parse(text);
  assert.equal(report.schema,'inkwave-v1');
  assert.equal(report.frames.captured,240);
  assert.equal(report.gpu.p95,22);
  assert.equal(report.hitches.length,8);
  assert.equal(report.hitches[0].bvh.queries,104);
  assert.equal(report.hitches[0].calls['source-ray'],300);
  assert.equal(report.hitches[0].calls['physics-ray'],300);
  assert.equal(report.hitches[0].stages.simulation,8);
  assert.equal(report.hitches[0].callers['source-ray'][0].sampleStride,512);
  assert.equal(report.ab.delta.avgGameFrameWorkMs,10);
  assert.ok(text.length < JSON.stringify({raw,ab},null,2).length);
  assert.equal(report.hitches[0].calls['source-box'],undefined);
});
