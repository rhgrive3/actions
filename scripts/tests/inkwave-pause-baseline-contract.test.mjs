import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {PAUSE_BASELINE_SHA,verifyPauseBaselineProvenance} from '../lib/inkwave-pause-baseline-contract.mjs';
const actualRunner=fs.readFileSync(new URL('../check-inkwave-pause-gpu.mjs',import.meta.url),'utf8');
const bStart=actualRunner.indexOf('    if(baseline) {'),bEnd=actualRunner.indexOf('    } else {',bStart);
assert(bStart>=0&&bEnd>bStart);
const baselineAssertions=new Function('row','assert',actualRunner.slice(bStart+'    if(baseline) {'.length,bEnd));
const verifyPauseBaselineMeasurement=row=>{assert.equal(row.stateUnchanged,true);assert.equal(row.glError,0);assert.equal(row.glProbe.error,0);baselineAssertions(row,assert);return true;};
const digest='6995326cb014958afebdaef1453e933f6fda836b2bc7b5b4c3aec763ba9c327a';
const manifest=()=>({files:{'local-quality/idle-adapter.mjs':digest},build:{quality:{'idle-adapter.mjs':digest}}});
const row=()=>({counts:{world:0,hud:0,minimap:0,tank:0,presents:0,captures:0},stateUnchanged:true,paused:true,menu:'pause',glError:0,glProbe:{lit:0,brightness:0,error:0},animations:[{playState:'paused'}],preservedEntryPhases:true,unchangedAnimationTimes:true,retained:false});
test('fixed baseline proves already-HUD-optimized owner and rejects wrong/missing/mixed identity',()=>{
 assert.equal(verifyPauseBaselineProvenance(manifest(),PAUSE_BASELINE_SHA).hudAlreadyOptimized,true);
 assert.throws(()=>verifyPauseBaselineProvenance(manifest(),'1'.repeat(40)));
 for(const mutate of [m=>delete m.files,m=>m.files['local-quality/idle-adapter.mjs']='x',m=>m.build.quality['idle-adapter.mjs']='x',m=>m.files['local-quality/pause-frame-retention.mjs']='candidate']){const m=manifest();mutate(m);assert.throws(()=>verifyPauseBaselineProvenance(m,PAUSE_BASELINE_SHA));}
});
test('baseline keeps HUD frozen while requiring the actual black-buffer sensitivity',()=>{
 assert.equal(verifyPauseBaselineMeasurement(row()),true);
 for(const mutate of [r=>r.counts.hud=120,r=>r.counts.world=1,r=>r.counts.presents=120,r=>r.counts.captures=1,r=>r.retained=true,r=>r.glProbe.lit=3,r=>r.glProbe.brightness=1,r=>r.glProbe.error=1280,r=>r.glError=1280,r=>r.stateUnchanged=false,r=>r.animations[0].playState='running',r=>r.preservedEntryPhases=false,r=>r.unchangedAnimationTimes=false]){const r=row();mutate(r);assert.throws(()=>verifyPauseBaselineMeasurement(r));}
});
test('real runner and workflow use the fixed contract without relaxing the candidate',()=>{
 const runner=fs.readFileSync(new URL('../check-inkwave-pause-gpu.mjs',import.meta.url),'utf8');
 assert.match(runner,/baseline\?verifyPauseBaselineProvenance\(manifest,process.env.PAUSE_BASELINE_SHA\)/);assert.match(runner,/baseline cleared GL buffer stays black/);
 assert.match(runner,/presents:120,captures:0/);assert.match(runner,/row.glProbe.lit>=3 && row.glProbe.brightness>120/);assert.match(runner,/assert.equal\(lifecycle.snapshotReleased,true\)/);
 const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-pause-gpu.yml',import.meta.url),'utf8');assert(workflow.includes('ref: '+PAUSE_BASELINE_SHA));assert(workflow.includes('git -C baseline rev-parse HEAD'));assert(workflow.includes('PAUSE_BASELINE_SHA: '+PAUSE_BASELINE_SHA));assert(workflow.includes('scripts/tests/inkwave-pause-baseline-contract.test.mjs'));assert.match(workflow,/timeout-minutes: 25/);
});

import {observePausedRafFrames,verifyPausedRafFrames} from '../lib/inkwave-pause-baseline-contract.mjs';
async function mockRaf({baseline=false,throwAt=-1}={}){
 const old=Object.fromEntries(['window','document','requestAnimationFrame'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));let tick=-1,presents=0;
 const animation={playState:'paused',currentTime:42,effect:{target:{}}},root={contains:()=>true};
 const R={render(){throw Error('world render must remain idle');}};if(!baseline){R._pauseSnapshot={};R.presentPausedFrame=()=>{presents++;};R.capturePausedFrame=()=>{throw Error('recapture');};}
 const original=R.presentPausedFrame,g={R,hud:{el:root,overLayer:root},menus:{current:'pause'},_frame(){R.presentPausedFrame?.();}},G={game:g,match:{time:10,paused:true,actors:[{hp:100,ink:50,pos:{toArray:()=>[0,0,0]}}]},renderer:{getContext:()=>({drawingBufferWidth:10,drawingBufferHeight:10,RGBA:1,UNSIGNED_BYTE:2,isContextLost:()=>false,getError:()=>0,readPixels(_x,_y,_w,_h,_a,_b,p){if(tick===throwAt)throw Error('capture context lost');p.fill(baseline?0:80);}})}};
 globalThis.window={__G:G};globalThis.document={hidden:false,getAnimations:()=>[animation]};globalThis.requestAnimationFrame=cb=>{tick++;queueMicrotask(()=>cb((tick+1)*16));};
 try{const r=await observePausedRafFrames();assert.equal(R.presentPausedFrame,original);assert.equal(Object.hasOwn(R,'render'),true);return {r,presents};}finally{for(const [k,d]of Object.entries(old))if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
}
test('actual RAF observer captures 120 distinct callbacks for both lanes and restores wrappers',async()=>{
 for(const baseline of [true,false]){const {r,presents}=await mockRaf({baseline});assert.equal(verifyPausedRafFrames(r,{baseline}),true);assert.equal(presents,baseline?0:120);assert.equal(r.frames.at(-1).timestamp-r.frames[0].timestamp,119*16);}
});
test('actual RAF capture failure preserves completed frame evidence and cleanup',async()=>{
 const {r}=await mockRaf({throwAt:8});assert.equal(r.status,'failed');assert.equal(r.failedFrame,8);assert.equal(r.frames.length,8);assert.match(r.error,/capture context lost/);assert.throws(()=>verifyPausedRafFrames(r));
});
test('RAF gate rejects synchronous/hidden/black/live-world/state/GL/lifetime regressions',async()=>{
 const {r}=await mockRaf();
 for(const mutate of [x=>x.frames.pop(),x=>x.frames[1].timestamp=x.frames[0].timestamp,x=>x.frames[1].deltaMs=0,x=>x.frames[1].visible=false,x=>x.frames[1].world=1,x=>x.frames[1].presents=0,x=>x.frames[1].captures=1,x=>x.frames[1].lit=0,x=>x.frames[1].brightness=0,x=>x.frames[1].retained=false,x=>x.frames[1].contextLost=true,x=>x.frames[1].glError=1280,x=>x.frames[1].stateUnchanged=false,x=>x.frames[1].hudUnchanged=false,x=>x.frames[1].paused=false]){const bad=structuredClone(r);mutate(bad);assert.throws(()=>verifyPausedRafFrames(bad));}
 assert.throws(()=>verifyPausedRafFrames(r,{baseline:true}));
});
