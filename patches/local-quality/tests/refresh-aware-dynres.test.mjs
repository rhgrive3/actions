import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptRefreshAwareDynRes} from '../refresh-aware-dynres-adapter.mjs';
import vm from 'node:vm';

// Exact Game._dynRes 2026-10-28 e67 body, with existing platform adapter's
// dynamic-resolution threshold unchanged. Keep as literal for a causal A/B.
const source = `
  _dynRes(dt) {
    if (dt <= 0 || dt > 0.25) return;
    const d = this._dyn || (this._dyn = {
      acc: 0, n: 0, t: 0, good: 0, cooldown: 0, failures: 0, probe: false,
      match: null, quality: null,
    });
    const match = this.match;
    const quality = this.settings.quality;
    if (d.match !== match || d.quality !== quality) {
      d.acc = 0; d.n = 0; d.t = 0; d.good = 0; d.cooldown = 0; d.failures = 0; d.probe = false;
      d.match = match; d.quality = quality;
    }
    d.acc += dt; d.n++; d.t += dt;
    if (d.t < 4) return;
    const avg = d.acc / Math.max(1, d.n);
    d.acc = 0; d.n = 0; d.t = 0;
    const live = quality !== 'ultra' && !document.hidden && match && !match.attract && match.state === 'playing';
    if (!live) { d.good = 0; d.probe = false; return; }
    if (d.cooldown > 0) d.cooldown--;
    const s = this.R.dynScale || 1;
    const floor = this.mobile?.touch ? 0.6 : 0.75;
    const budget = dynamicResolutionBudget(this.settings.frameRate === 'auto'
      && this.mobile?.touch ? this._iwLastCap : 60);
    const overloaded = avg > budget.overloadFrameSeconds;
    const headroom = avg < budget.headroomFrameSeconds;
    if (overloaded && s > floor + 0.01) {
      if (d.probe) {
        d.failures = Math.min(3, d.failures + 1);
        d.cooldown = Math.min(8, 1 << d.failures);
      }
      this.R.setDynamicScale(Math.max(floor, s - 0.125));
      d.good = 0; d.probe = false;
      return;
    }
    if (headroom && s < 0.99 && d.cooldown === 0) {
      if (++d.good >= 3) {
        this.R.setDynamicScale(Math.min(1, s + 0.125));
        d.good = 0;
        d.probe = true;
      }
    } else if (!headroom) {
      d.good = 0;
    }
    if (d.probe && headroom && s >= 0.99) {
      d.probe = false;
      d.failures = Math.max(0, d.failures - 1);
    }
  }
`;
function replaceOnce(code, a, b, why) {const i=code.indexOf(a);assert.ok(i>=0,why);assert.equal(code.indexOf(a,i+1),-1,why);return code.slice(0,i)+b+code.slice(i+a.length);}
function fn(modified) {const body=modified?adaptRefreshAwareDynRes('src/main.js',source,replaceOnce):source;return vm.runInNewContext(`({${body}})._dynRes`,{document:{hidden:false},dynamicResolutionBudget: hz=>({overloadFrameSeconds:1/(hz*5/6),headroomFrameSeconds:1/(hz*58/60)})});}
function simulate({modified=false,touch=true,hz=30,total=40,frameDt,frameRate='display',selectedCap=0}={}) {
  const run=fn(modified),transitions=[];let time=0;
  const R={dynScale:1,setDynamicScale(v){transitions.push({seconds:time,from:this.dynScale,to:v});this.dynScale=v;}};
  const g={R,mobile:{touch},settings:{quality:'high',frameRate},_iwLastCap:selectedCap,match:{state:'playing',attract:false}};
  // Timed windows must receive the same elapsed time as production, not a
  // synthetic count disconnected from the delivered rAF cadence.
  for(let i=0;time<total-1e-7;i++){
    const dt=frameDt?frameDt(R.dynScale,time):1/hz;
    assert.ok(dt>0&&dt<.25);time+=dt;run.call(g,dt);
    assert.ok(i<total*300,'no non-terminating loop');
  }
  return {scale:R.dynScale,transitions,game:g};
}
test('adapter only transforms main and uses unique anchors',()=>{
  assert.equal(adaptRefreshAwareDynRes('src/core/renderer.js',source,replaceOnce),source);
  const b=adaptRefreshAwareDynRes('src/main.js',source,replaceOnce);
  assert.equal((b.match(/_resolutionTrial = \{ avg, scale: s \}/g)||[]).length,1);
  assert.equal((b.match(/const overloaded =/g)||[]).length,1);
  assert.ok(b.includes('the next 4-second window gains meaningful')); 
});
for(const touch of [true,false]){
  test(`physical 30Hz (${touch?'touch':'desktop'}): unchanged refresh must not cause permanent quality loss`,()=>{
    const prior=simulate({hz:30,touch});const after=simulate({modified:true,hz:30,touch});
    assert.equal(prior.scale,touch?.6:.75);
    assert.equal(after.scale,1);
    assert.ok(after.transitions.some(x=>x.to<1),'real one-notch trial occurs');
    assert.ok(after.transitions.some(x=>x.to===1),'unproductive trial reverts');
    assert.ok(after.transitions.length<prior.transitions.length+8,'bounded rather than every frame');
  });
}
for(const hz of [60,90,120]){
  test(`unloaded ${hz}Hz: no render quality changes`,()=>{
    const prior=simulate({hz,total:32});const after=simulate({hz,total:32,modified:true});
    assert.equal(prior.scale,1);assert.equal(after.scale,1);
    assert.equal(after.transitions.length,0);
  });
}
test('genuine 60Hz GPU pressure: when a resolution reduction actually improves FPS, keep it',()=>{
  const after=simulate({modified:true,total:9,frameDt:scale=>scale<1?1/40:1/30});
  assert.ok(after.transitions.length>0);
  assert.ok(after.scale<1,`causal improvement should not be rolled back, got ${after.scale}`);
});
test('30fps CPU-bound workload: lowering pixel density cannot help and is reverted',()=>{
  const after=simulate({modified:true,total:15,frameDt:()=>1/30});
  assert.equal(after.scale,1);
});
test('new match resets a previous performance trial to avoid stale comparisons',()=>{
  const f=fn(true),g={R:{dynScale:1,setDynamicScale(v){this.dynScale=v;}},mobile:{touch:true},settings:{quality:'high'},match:{state:'playing'}};
  for(let i=0;i<121;i++)f.call(g,1/30);
  assert.ok(g._dyn._resolutionTrial);
  g.match={state:'playing'};
  f.call(g,1/30);
  assert.equal(g._dyn._resolutionTrial,null);
});

for(const selectedCap of [45,48]){
  test(`intentional ${selectedCap}Hz Auto touch cap is not mistaken for a GPU overload`,()=>{
    const h=simulate({modified:true,frameRate:'auto',selectedCap,hz:selectedCap,touch:true,total:32});
    assert.equal(h.scale,1);assert.equal(h.transitions.length,0);
  });
}

// In a complete checkout this also asserts the exact *composition order* of
// the current main + existing range-frame pacing adapter. The portable replay
// above runs in the source-only change-overlay used for offline review.
import fs from 'node:fs';
const mainUrl = new URL('../../../inkwave-public/src/main.js', import.meta.url);
const rangeUrl = new URL('../range-frame-pacing-adapter.mjs', import.meta.url);
test('full checkout: existing frame-pacing transform composes before 30Hz guard',
  {skip: !fs.existsSync(mainUrl) || !fs.existsSync(rangeUrl)},async()=>{
    const {adaptRangeFramePacing}=await import(rangeUrl.href);
    const source=fs.readFileSync(mainUrl,'utf8');
    const result=adaptRefreshAwareDynRes('src/main.js',adaptRangeFramePacing('src/main.js',source),replaceOnce);
    assert.ok(result.includes('const budget = dynamicResolutionBudget'));
    assert.ok(result.includes('d._resolutionTrial = { avg, scale: s };'));
    assert.ok(result.includes('createRefreshProbe'));
    assert.equal((result.match(/if \(d\._resolutionTrial\)/g)||[]).length,1);
  });
