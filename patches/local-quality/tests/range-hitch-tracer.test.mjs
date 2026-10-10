import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createGpuRenderTimer, installHitchTracer } from '../range-hitch-tracer.mjs';
import { createFrameTimingProbe } from '../range-frame-profiler.mjs';
import { profileRangeAcceptanceSnapshot } from '../../../scripts/inkwave-range-profile-acceptance.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

function fakeWebGL() {
  const events = [];
  let ready = false, disjoint = false, qid = 0;
  const ext = {TIME_ELAPSED_EXT:0x88BF,GPU_DISJOINT_EXT:0x8FBB};
  const gl = {
    QUERY_RESULT_AVAILABLE:0x8867,QUERY_RESULT:0x8866,
    getExtension(name) { return name==='EXT_disjoint_timer_query_webgl2' ? ext:null; },
    createQuery() { const q={id:++qid};events.push(['create',q.id]);return q; },
    beginQuery(_t,q) { events.push(['begin',q.id]); },
    endQuery() { events.push(['end']); },
    getParameter() {return disjoint;},
    getQueryParameter(q,name) {
      events.push(['query',q.id,name]);
      if(name===this.QUERY_RESULT_AVAILABLE)return ready;
      if(!ready)throw Error('blocking result fetched without ready!');
      return 9_000_000;
    },
    deleteQuery(q) {events.push(['delete',q.id]);},
  };
  return {gl,events,renderer:{capabilities:{isWebGL2:true},getContext:()=>gl},
    setReady(v){ready=v;},setDisjoint(v){disjoint=v;}};
}
test('GPU timer uses EXT_disjoint_timer_query_webgl2 only, does not read unavailable results or block',()=>{
  const f=fakeWebGL(),t=createGpuRenderTimer(f.renderer,{every:1,maxPending:2});
  assert.equal(t.status,'sampling');
  assert.equal(t.begin(17),true);t.end();
  assert.deepEqual(t.poll(),[]);
  assert.ok(!f.events.some(x=>x[0]==='query'&&x[2]===f.gl.QUERY_RESULT));
  assert.ok(!f.events.some(x=>x[0]==='finish'||x[0]==='readPixels'));
  f.setReady(true);
  assert.deepEqual(t.poll(),[{id:17,ms:9}]);
  assert.equal(f.events.filter(x=>x[0]==='delete').length,1);
  t.dispose();
});
test('GPU timer discards disjoint timing, bounds pending query count and degrades gracefully',()=>{
  const f=fakeWebGL(),t=createGpuRenderTimer(f.renderer,{every:1,maxPending:2});
  for(let i=0;i<3;i++){const ok=t.begin(i);if(ok)t.end();}
  assert.equal(f.events.filter(x=>x[0]==='create').length,2,'max pending bounds memory');
  f.setDisjoint(true);
  assert.deepEqual(t.poll(),[]);
  assert.equal(t.status,'disjoint');
  assert.equal(f.events.filter(x=>x[0]==='delete').length,2);
  f.setDisjoint(false);f.setReady(true);
  assert.equal(t.begin(100),true);t.end();
  assert.deepEqual(t.poll(),[{id:100,ms:9}]);
  t.dispose();
  assert.equal(createGpuRenderTimer({capabilities:{isWebGL2:false}}).status,'unsupported');
  assert.equal(createGpuRenderTimer({capabilities:{isWebGL2:true},getContext(){throw Error('context lost');}}).status,'unsupported');
});
function worldFixture() {
  let now=10;
  const order=[];
  const task=(name,ms=1)=>({
    update(dt){order.push([name,dt]);now+=ms;},
  });
  const G={projectiles:task('projectiles',.3),env:task('environment',.4),
    fx:task('fx',.5),paint:{flush(dt){order.push(['paint',dt]);now+=2;}}};
  const gl=fakeWebGL();gl.setReady(true);
  const game={
    _frame(dt) {
      this.match.update(dt);G.projectiles.update(dt);G.paint.flush(dt);
      G.env.update(dt);G.fx.update(dt);this.rig.update(dt);
      this.R.render();this.showcase.render();this._updateHud(dt);
    },
    match:task('simulation',4),
    rig:task('camera',.5),
    showcase:{render(){order.push(['showcase']);now+=.5;}},
    _updateHud(dt){order.push(['hud',dt]);now+=.6;},
    R:{renderer:gl.renderer,dynScale:1,
      render(){order.push(['render']);now+=7;},
      setDynamicScale(x){order.push(['resolution',x]);now+=5;this.dynScale=x;}
    },
  };
  const env={__G:G};
  return {game,env,gl,order,now:()=>now,tick(ms){now+=ms;}};
}
test('native Game._frame runs in identical order with stage timing enabled and restores methods',()=>{
  const a=worldFixture(),b=worldFixture();
  const oldFrame=b.game._frame,oldRender=b.game.R.render,oldPaint=b.env.__G.paint.flush;
  const tracer=installHitchTracer(b.game,{env:b.env,now:b.now,gpuEvery:1});
  a.game._frame(.016);b.game._frame(.016);
  assert.deepEqual(b.order,a.order);
  tracer.record(b.now(),b.now()-10,{frameRateHz:60,phase:'practice',scale:1});
  const result=tracer.snapshot();
  assert.equal(result.capturedFrames,1);
  assert.equal(result.gpu,'sampling');
  assert.ok(result.latest);
  assert.equal(result.latest.mode,'practice');
  assert.ok(result.latest.stages.simulation>=4);
  assert.ok(result.latest.stages.paint>=2);
  assert.ok(result.latest.stages.render>=7);
  assert.equal(result.latest.gpuCommandsMs,9);
  assert.equal(result.latest.gpuPaintCommandsMs,9,'paint GPU query is sampled separately');
  assert.equal(result.gpuPaintSamples,1);
  assert.match(result.latest.cause,/CPU/);
  const text=tracer.report();
  assert.match(text,/"source": "local debug capture, no upload"/);
  assert.ok(!text.includes('userAgent'));
  tracer.dispose();
  assert.strictEqual(b.game._frame,oldFrame);
  assert.strictEqual(b.game.R.render,oldRender);
  assert.strictEqual(b.env.__G.paint.flush,oldPaint);
});
test('renderer resize before Game._frame gets attributed on the next frame, not lost',()=>{
  const f=worldFixture();
  const tracer=installHitchTracer(f.game,{env:f.env,now:f.now});
  f.game._frame(.016);
  tracer.record(f.now(),18,{frameRateHz:60,phase:'practice'});
  f.game.R.setDynamicScale(.75);
  f.game._frame(.016);
  tracer.record(f.now(),18,{frameRateHz:60,phase:'practice',scale:.75});
  const rec=tracer.snapshot().latest;
  assert.equal(rec.scale,.75);
  assert.deepEqual(rec.events.map(e=>e.event),['render-target-resize']);
  assert.equal(rec.events[0].cpuMs,5);
  tracer.dispose();
});
test('long task observer is optional; sustained frame spikes are captured with bounded rings',()=>{
  const f=worldFixture();
  let cb;
  class LongTasks {
    static supportedEntryTypes=['longtask'];
    constructor(fn){cb=fn;}
    observe(){ }
    disconnect(){this.stopped=true;}
  }
  f.env.PerformanceObserver=LongTasks;
  const tracer=installHitchTracer(f.game,{env:f.env,now:f.now,maxFrames:30,gpuEvery:10});
  for(let i=0;i<90;i++){
    f.tick(17);
    f.game._frame(.016);
    tracer.record(f.now(),i===49?56:18,{frameRateHz:60,phase:'practice'});
  }
  cb({getEntries(){return[{startTime:f.now()-5,duration:65}];}});
  f.tick(17);f.game._frame(.016);tracer.record(f.now(),60,{frameRateHz:60,phase:'practice'});
  const report=tracer.snapshot();
  assert.equal(report.capturedFrames,30);
  assert.ok(report.hitchCount<=40);
  assert.equal(report.longTaskObserver,'available');
  assert.equal(report.longTaskCount,1);
  assert.ok(report.recentHitches.length<=12);
  tracer.reset();
  assert.equal(tracer.snapshot().capturedFrames,0);
  tracer.dispose();
});
test('opt-in profileRange=1 dynamically attaches tracer to existing page recorder, no normal runtime import',async()=>{
  const f=worldFixture(),handlers={};
  const nodes=[];
  const doc={body:{appendChild(x){nodes.push(x);}},
    createElement(name){return {nodeName:name,style:{},setAttribute(){},
      addEventListener(event,fn){handlers[event]=fn;},remove(){},focus(){},select(){}}}};
  f.env.document=doc;
  f.env.navigator={clipboard:{writeText:async text=>{f.copied=text;}}};
  const p=createFrameTimingProbe({env:f.env,game:f.game,now:f.now});
  const tracer=await p.ready;
  assert.ok(tracer);
  f.game._frame(.016);
  p.record(f.now(),18,{phase:'practice',frameRateHz:60});
  const snap=p.snapshot();
  assert.equal(snap.trace.capturedFrames,1);
  assert.ok(snap.trace.latest.stages.paint>=2);
  assert.equal(typeof p.report(),'string');
  await handlers.click();
  assert.match(f.copied,/"schema": "inkwave-frame-trace-v1"/);
  assert.equal(nodes.filter(n=>n.nodeName==='button').length,1);
  p.dispose();
  assert.strictEqual(f.env.__inkwaveRangePerf,undefined);
  const off=createFrameTimingProbe({env:{},now:f.now});
  assert.equal(await off.ready,null);
  assert.equal(off.snapshot().gpuTimeMs,'unmeasured');
});
test('final shipped six-layer main connects live Game only to opt-in on-demand profiler',()=>{
  const raw=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');
  const main=adaptBuildSource('src/main.js',raw);
  assert.match(main,/createFrameTimingProbe\(\{ env: globalThis, game: this \}\)/);
  assert.match(main,/if \(enabled\) import\('\.\.\/patches\/local-quality\/range-frame-profiler\.mjs'\)/);
  assert.ok(!main.includes("from '../patches/local-quality/range-hitch-tracer.mjs'"),
    'GPU profiler must not enter static game imports');
  assert.doesNotThrow(()=>new vm.SourceTextModule(main));
});

test('Playwright polls an entirely synchronous, completed Practice Range trace', () => {
  const source = fs.readFileSync(new URL('../../../scripts/check-inkwave-range.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('page.waitForFunction(profileRangeAcceptanceSnapshot,'), 'browser gate must use synchronous inspector');
  assert.equal(profileRangeAcceptanceSnapshot.constructor.name, 'Function');
  assert.strictEqual(profileRangeAcceptanceSnapshot({}), false);
  const trace = { capturedFrames: 11, gpu: 'unsupported', gpuSamples: 0,
    latest: { stages: { paint: 1.4, render: 3.6 } } };
  const env = {
    __G: { match: { range: {}, state: 'playing' } },
    __inkwaveRangePerf: { snapshot: () => ({ mode: 'practice', trace }),
      report: () => JSON.stringify({ schema: 'inkwave-frame-trace-v1' }) },
    document: { querySelector: () => ({}) },
    performance: { getEntriesByType: () => [{ name: '/patches/local-quality/range-hitch-tracer.mjs' }] },
  };
  assert.strictEqual(profileRangeAcceptanceSnapshot(env), false, 'must wait for twelve frames');
  trace.capturedFrames = 12;
  const found = profileRangeAcceptanceSnapshot(env);
  assert.equal(found.collected, 12);
  assert.equal(found.reportSchema, 'inkwave-frame-trace-v1');
  assert.deepEqual(found.stageNames, ['paint', 'render']);
  assert.equal(found.profileButton, true);
  assert.equal(found.tracerFileLoaded, true);
  assert.equal(found.then, undefined, 'never return a Promise to Playwright waitForFunction');
  env.__G.match.state = 'intro';
  assert.strictEqual(profileRangeAcceptanceSnapshot(env), false, 'requires live playing range');
  env.__G.match.state = 'playing';
  env.__inkwaveRangePerf.snapshot = () => ({ traceError: 'failed dynamic import' });
  assert.deepEqual(profileRangeAcceptanceSnapshot(env), { traceError: 'failed dynamic import' });
});
