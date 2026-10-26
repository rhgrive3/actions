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

import { installPlatformGame } from '../platform-game.mjs';

function platformFixture(search='') {
  let frames=0, installed=0, disposed=0;
  const pending=[], active=[], warnings=[];
  const listener={addEventListener(){},removeEventListener(){}};
  const env={
    ...listener,document:{...listener,hidden:false,hasFocus(){return true}},
    location:{search},navigator:{},screen:{orientation:listener},
    performance:{now:()=>0},Date:{now:()=>0},
    requestAnimationFrame(){return 1;},cancelAnimationFrame(){},
    console:{warn:(...args)=>warnings.push(args)},
  };
  class Game {
    _setSettings(partial){Object.assign(this.settings,partial);return 'settings-applied';}
    _frame(){frames++;}
    _dynRes(){}
  }
  const G={mode:'menu'};
  installPlatformGame(Game,G,env,{
    importProfiler:()=>new Promise(resolve=>pending.push(resolve))
  });
  const game=new Game();
  game.settings={debugMode:false,frameRate:'display'};
  game.fpsAcc=0;game.fpsN=0;
  game.menus={setPlatformDriven(){}};
  const createFrameTimingProbe=()=>{
    installed++;
    const probe={callback(){},skipped(){},record(){},dispose(){disposed++;}};
    active.push(probe);
    return probe;
  };
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const deliver=async()=>{
    assert.ok(pending.length>0,'the lazy profiler import is requested');
    pending.shift()({createFrameTimingProbe});
    await flush();
  };
  const counters=()=>({frames,installed,disposed,pending:pending.length,warnings:warnings.length});
  return {game,env,pending,flush,deliver,counters};
}

test('platform-owned profiler enable/disable is immediate while paused and disposes all hooks',async()=>{
  const f=platformFixture();
  f.game._loop();
  assert.equal(f.game._rangeFrameProbe,null,'OFF never imports or installs instrumentation');
  await f.flush();assert.equal(f.counters().pending,0);
  assert.equal(f.game._setSettings({debugMode:true}),'settings-applied');
  await f.flush();assert.equal(f.counters().pending,1);
  f.game._setSettings({debugMode:false});
  await f.deliver();
  assert.deepEqual(f.counters(),{frames:0,installed:0,disposed:0,pending:0,warnings:0},
    'stale import must not reactivate the disabled profiler');
  f.game._setSettings({debugMode:true});
  await f.flush();await f.deliver();
  assert.equal(f.counters().installed,1);
  assert.ok(f.game._rangeFrameProbe);
  f.game._setSettings({debugMode:false});
  assert.deepEqual([f.game._rangeFrameProbe,f.counters().disposed],[null,1],
    'OFF immediately releases the current profiler before a new frame');
  f.game.disposePlatform();
  assert.equal(f.counters().disposed,1,'teardown is idempotent');
});

test('legacy profileRange opt-in remains available, but explicit OFF has priority',async()=>{
  const f=platformFixture('?profileRange=1');
  f.game._loop();
  await f.flush();assert.equal(f.counters().pending,1);
  await f.deliver();assert.equal(f.counters().installed,1);
  f.game._setSettings({debugMode:false});
  assert.equal(f.game.platform.profilerUrlOptIn,false);
  assert.equal(f.counters().disposed,1);
  assert.equal(f.game._rangeFrameProbe,null);
  f.game.platform.syncProfiler();
  await f.flush();assert.equal(f.counters().pending,0,'OFF must not retry URL opt-in');
  f.game._setSettings({debugMode:true});
  await f.flush();await f.deliver();
  assert.equal(f.counters().installed,2,'turning the setting ON still works');
  f.game.disposePlatform();
  assert.equal(f.counters().disposed,2);
});

test('disposing a platform invalidates pending imports across new runtime ownership',async()=>{
  const f=platformFixture();
  f.game.settings.debugMode=true;
  f.game._loop();
  await f.flush();assert.equal(f.counters().pending,1);
  f.game.disposePlatform();
  await f.deliver();
  assert.equal(f.counters().installed,0,'disposed owner must reject imported module');
  f.game._loop();
  await f.flush();assert.equal(f.counters().pending,1);
  await f.deliver();
  assert.equal(f.counters().installed,1,'new owner may opt in after reinstallation');
  f.game.disposePlatform();
  assert.equal(f.counters().disposed,1);
});
