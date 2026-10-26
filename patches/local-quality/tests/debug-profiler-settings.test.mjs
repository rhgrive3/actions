import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {adaptSettingsUi} from '../settings-ui-adapter.mjs';
import {adaptRangeFramePacing} from '../range-frame-pacing-adapter.mjs';
import {installDebugAB} from '../debug-ab-runtime.mjs';
import {createFrameTimingProbe} from '../range-frame-profiler.mjs';

const read = path => fs.readFileSync(fileURLToPath(new URL('../../../'+path,import.meta.url)),'utf8');
function once(source,before,after,label) {
  const at=source.indexOf(before);
  if(at<0||source.indexOf(before,at+before.length)!==-1)throw Error('source anchor '+label);
  return source.slice(0,at)+after+source.slice(at+before.length);
}
test('debug setting defaults off; repeated injection fails closed',()=>{
  const src=read('inkwave-public/src/config.js');
  const output=adaptSettingsUi('src/config.js',src,once);
  assert.match(output,/showFps: false,\s*debugMode: false,/);
  assert.throws(()=>adaptSettingsUi('src/config.js',output,once),/already installed/);
});
test('instrumentation toggles live and tears down without repeated URL allocations',()=>{
  const src=read('inkwave-public/src/main.js');
  const output=adaptRangeFramePacing('src/main.js',src);
  for(const symbol of ['settings?.debugMode === true','_iwProfilerEpoch === epoch',
    '_rangeFrameProbe?.dispose?.()','_iwProfilerQueryFlag ??='])
    assert.ok(output.includes(symbol),symbol);
});
function makeFixture() {
  let time=0, latest=null;
  const game={settings:{quality:'low',shadows:false,bloom:false,frameRate:'display'},
    match:{mode:'practice',actors:[{}],local:{weapon:{id:'shooter'}}},
    R:{_w:400,_h:300,renderer:{info:{memory:{geometries:3,textures:4},programs:[1]}}},
    perf:{calls:10,tris:300}};
  const env={__G:{level:{layout:{id:'range'}},match:game.match,paint:{size:2048}}};
  const ab=installDebugAB({probe:{},tracer:{lastFrameMetrics:()=>latest,pollGpu(){}},
    game,env,now:()=>time});
  const run=(kind,dt)=>{
    assert.equal(ab.start(kind),true);
    for(let i=0;i<Math.ceil(6100/dt);i++){
      time+=dt;
      latest={frameGapMs:dt,workMs:kind==='idle'?7:18,scale:1,
        cpu:{render:2,projectiles:kind==='fire'?3:0,
          'shooter-hud-preview':kind==='fire'?2:0.1,
          'paint-atlas-submit':kind==='fire'?4:0},
        calls:{'shooter-fire':kind==='fire'?1:0,'paint-stamp':kind==='fire'?3:0},
        gpuMs:null,gpuPaintMs:null};
      ab.frame();
    }
  };
  return {game,ab,run};
}
test('idle and firing receive equal instrumentation and correct 5-second receipts',()=>{
  const {ab,run}=makeFixture();
  run('idle',12.5);run('fire',25);
  const c=ab.comparison();
  assert.equal(c.status,'compared');
  assert.equal(c.idle.observedFPS,80);
  assert.equal(c.fire.observedFPS,40);
  assert.equal(c.delta.medianFrameGapMs,12.5);
  assert.ok(c.idle.frames>300 && c.fire.frames>150);
  assert.equal(c.fire.callsPerFrame['paint-stamp'],3);
  assert.equal(c.fire.resourcesAtStart.paintAtlasSize,2048);
  assert.ok(c.cautions.some(s=>s.includes('GPU')));
  ab.dispose();assert.equal(ab.start('idle'),false);
});
test('changing graphic quality invalidates strict A/B parity',()=>{
  const {game,ab,run}=makeFixture();
  run('idle',12.5);
  game.settings.quality='high';run('fire',25);
  assert.equal(ab.comparison().status,'conditions-differ');
  ab.dispose();
});
test('disabled measurement adds no game probe and reports unavailable timers',async()=>{
  const probe=createFrameTimingProbe({env:{},game:null});
  assert.equal(await probe.ready,null);
  assert.equal(probe.beginTrial('fire'),false);
  const data=JSON.parse(probe.report());
  assert.equal(data.shooterAB.status,'unavailable');
  assert.match(data.debugModePrivacy,/Device-local/);
  probe.dispose();
});
