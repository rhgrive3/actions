import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  detectStableDisplayHz, evenTouchAutoHz, createRefreshProbe,
} from '../range-frame-pacing.mjs';
import { createFrameTimingProbe } from '../range-frame-profiler.mjs';
import { adaptRangeFramePacing } from '../range-frame-pacing-adapter.mjs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';

const simulate = (hz, frames=180) => {
  const p=createRefreshProbe(), d=1/hz;
  for(let i=0;i<frames;i++) p.sample(d);
  return p;
};
test('actual 60/90/120/144 rAF cadence is detected without conflating FPS caps',()=>{
  for(const hz of [60,90,120,144,165]) {
    const p=simulate(hz);
    assert.equal(p.rate,hz,'refresh '+hz);
  }
  assert.equal(evenTouchAutoHz(0),60);
  assert.equal(evenTouchAutoHz(60),60);
  assert.equal(evenTouchAutoHz(90),45);
  assert.equal(evenTouchAutoHz(120),60);
  assert.equal(evenTouchAutoHz(144),48);
  assert.equal(evenTouchAutoHz(165),55);
});
test('sporadic slow frames cannot misidentify a 60Hz display as 90Hz',()=>{
  const p=createRefreshProbe();
  for(let i=0;i<200;i++)p.sample(i%19===0?1/30:1/60);
  assert.equal(p.rate,60);
  const bad=new Array(48).fill(0).map((_,i)=>i%3===0?1/60:i%3===1?1/90:1/120);
  assert.equal(detectStableDisplayHz(bad),0,'unstable refresh does not select a new cap');
  p.reset();assert.equal(p.rate,0);
});
function presentedGaps(panelHz, capHz, frames=600) {
  const out=[];
  let acc=0,last=0;
  const delta=1/panelHz,step=1/capHz;
  for(let n=1;n<=frames;n++) {
    acc+=delta;
    if(acc+1e-6<step)continue;
    acc=Math.min(step,Math.max(0,acc-step));
    const stamp=n*delta;
    if(last)out.push((stamp-last)*1000);
    last=stamp;
  }
  return out;
}
test('90Hz auto renders with uniform 2-rAF 45Hz spacing, not alternating 11/22ms',()=>{
  const before=presentedGaps(90,60);
  const after=presentedGaps(90,evenTouchAutoHz(90));
  assert.ok(Math.max(...before)-Math.min(...before)>10);
  assert.ok(Math.max(...after)-Math.min(...after)<0.001);
  assert.ok(Math.abs(after[0]-1000/45)<.001);
});
test('60Hz and 120Hz auto preserve 60fps and 144Hz uses uniform triple cadence',()=>{
  for(const hz of [60,120,144,165]){
    const gaps=presentedGaps(hz,evenTouchAutoHz(hz));
    assert.ok(gaps.length>80);
    assert.ok(Math.max(...gaps)-Math.min(...gaps)<.001,hz+' evenly paced');
  }
});
test('local opt-in samples genuine dropped frames, rAF and JS work separately',()=>{
  const dom={appendChild(n){this.child=n}};
  const env={document:{body:dom,createElement(){return{style:{},setAttribute(){},textContent:''}}}};
  const p=createFrameTimingProbe({env});
  assert.equal(env.__inkwaveRangePerf,p);
  let stamp=100;
  for(let i=0;i<120;i++){
    if(i===61)stamp+=70;else stamp+=1000/45;
    p.callback((i===61?70:1000/90)/1000);
    p.record(stamp,i===61?4:8,{frameRateHz:45,refreshHz:90,scale:.875,phase:'practice',stages:{sim:2,render:5}});
  }
  const snap=p.snapshot();
  assert.equal(snap.mode,'practice');
  assert.equal(snap.autoCapHz,45);
  assert.equal(snap.detectedRefreshHz,90);
  assert.ok(snap.frameMaxMs>=70,'a presenter gap cannot hide behind average FPS');
  assert.ok(snap.rafP99Ms>10);
  assert.ok(snap.frameP95Ms>0&&snap.workP95Ms>0);
  assert.equal(snap.gpuTimeMs,'unmeasured');
  assert.equal(snap.battery,'unmeasured');
  assert.match(dom.child.textContent,/frame diagnostic/);
  p.reset();assert.equal(p.snapshot().presented,0);
});
test('source adapters connect one real Game._loop and do not touch unrelated files',()=>{
  const source=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
  const out=adaptRangeFramePacing('src/main.js',source);
  assert.match(out,/evenTouchAutoHz\(this\._iwRefreshProbe\.sample\(rawDt\)\)/);
  assert.match(out,/import\('\.\.\/patches\/local-quality\/range-frame-profiler\.mjs'\)/,
    'diagnostic is on-demand, never a cold-offline preload');
  assert.match(out,/this\._rangeFrameProbe\.record/);
  assert.match(out,/fr === 'display' \? 0 : fr === 60 \? 60/);
  assert.equal((out.match(/createRefreshProbe\(\)/g)||[]).length,1);
  assert.equal(adaptRangeFramePacing('src/config.js',source),source);
  assert.throws(()=>adaptRangeFramePacing('src/main.js',out),/anchor mismatch/,'fail closed on duplicate patch');
  const composed=adaptQualitySource('src/main.js',
    adaptReliability('src/main.js',adaptTouchLayout('src/main.js',adaptSource('src/main.js',source))));
  assert.match(composed,/evenTouchAutoHz/);
  // VM parses the exact final composed source, including imports, without running browser globals.
  if(vm.SourceTextModule)assert.doesNotThrow(()=>new vm.SourceTextModule(composed));
});
