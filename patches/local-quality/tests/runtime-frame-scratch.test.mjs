import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptRuntimeFrameScratch } from '../runtime-frame-scratch-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8');
const unique = (source, before, after, why) => {
  assert.equal(source.split(before).length - 1, 1, why + ' unique anchor');
  return source.replace(before, after);
};
const MAIN = read('src/main.js');
const ENV = read('src/world/environment.js');
const patchedMain = adaptRuntimeFrameScratch('src/main.js', MAIN, unique);
const patchedEnv = adaptRuntimeFrameScratch('src/world/environment.js', ENV, unique);

test('production-adapted main/environment use source-only scratch and compile', () => {
  const main = adaptBuildSource('src/main.js', MAIN);
  const env = adaptBuildSource('src/world/environment.js', ENV);
  assert.match(main, /requestAnimationFrame\(this\._iwRafCallback/);
  assert.match(env, /const hide = this\._iwReflHide/);
  assert.match(env, /const vis = this\._iwReflVis/);
  assert.match(env, /hide\.length = 0;\s+vis\.length = 0;/);
  assert.equal(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/runtime-frame-scratch-adapter.mjs'), true);
  assert.doesNotThrow(() => new vm.SourceTextModule(main));
  assert.doesNotThrow(() => new vm.SourceTextModule(env));
  assert.equal(adaptRuntimeFrameScratch('src/config.js', ENV, unique), ENV);
  assert.throws(() => adaptRuntimeFrameScratch('src/main.js', patchedMain, unique));
  assert.throws(() => adaptRuntimeFrameScratch('src/world/environment.js', patchedEnv, unique));
});

const method = (source, name) => {
  const start = source.indexOf('  ' + name + '(');
  assert.ok(start >= 0, 'found native method ' + name);
  const end = source.indexOf('\n  }', start);
  assert.ok(end > start, 'method body end ' + name);
  return source.slice(start, end + 4);
};
const makeLoop = source => new Function('requestAnimationFrame','createRefreshProbe','evenTouchAutoHz','location','document','performance',
  'return function ' + method(source, '_loop'))(
    cb => { throw Error('replace requestAnimationFrame with a local fixture'); },
    () => ({ sample: () => 90, rate: 90, reset(){} }),
    hz => hz === 90 ? 45 : 60,
    { search: '' }, { hidden: false }, { now: () => 0 }
  );
function driveLoop(source,{touch=false,frameRate='display',frozen=false}={}) {
  const queued=[],frames=[],requests=[];
  const loop = new Function('requestAnimationFrame','createRefreshProbe','evenTouchAutoHz','location','document','performance',
    'return function ' + method(source, '_loop'))(
      fn => { queued.push(fn); requests.push(fn); },
      () => ({ sample: () => 90, rate: 90, reset(){} }),
      hz => hz === 90 ? 45 : 60,
      {search:''},{hidden:false},{now:()=>0});
  const game = { _loop:loop, settings:{frameRate,quality:'high'},mobile:{touch},
    timer:{update(){},getDelta:()=>1/90},
    frozen, fpsAcc:0,fpsN:0,fps:60,_dynRes(){},
    _frame(dt){frames.push(dt);}, R:{dynScale:1},
  };
  let cb=()=>game._loop();
  for(let i=0;i<180;i++){
    cb();
    cb=queued.shift();
    assert.equal(typeof cb,'function');
  }
  return {frames,requests,fps:game.fps,acc:game._frameCapAcc,sim:game._frameCapElapsed};
}
test('steady RAF callback identity is reused without changing frame delta or FPS budget',()=>{
  for(const opts of [{},{touch:true,frameRate:'auto'},{touch:true,frameRate:60},{frozen:true}]) {
    const before=driveLoop(MAIN,opts),after=driveLoop(patchedMain,opts);
    assert.deepEqual(after.frames,before.frames,JSON.stringify(opts));
    assert.equal(after.fps,before.fps);
    assert.equal(after.requests.length,before.requests.length);
    assert.equal(new Set(before.requests).size,before.requests.length,'old loop allocates every rAF');
    assert.equal(new Set(after.requests).size,1,'one callback reused for the entire game');
  }
});
const reflectionSegment = source => {
  const a = source.indexOf('  _renderReflection(renderer, scene, camera) {');
  const start = source.indexOf('    const hide = ', a);
  const end = source.indexOf('    U.uReflOn.value = 1;',start);
  assert.ok(a>=0 && start>a && end>start);
  return source.slice(start,end);
};
function invokeReflection(source,{ultra=false,throws=false,repeat=1}={}) {
  const f=new Function('renderer','scene','rc','rt','q','xr','sAuto','sNeed','_rCol','ca','G',reflectionSegment(source));
  const all=Array.from({length:15},(_,i)=>({id:'object'+i,visible:i%4!==0}));
  const env={sea:all[0],sky:all[1],lhBeam:null,city:all[2],terrain:all[3],
    staticScenery:all[4],ferris:all[5],trees:all[6],sailInst:all[7],gullInst:all[8],
    _reflSkips(){return [all[13],all[14]];}};
  const G={actors:[{character:{root:all[9]}},{character:{root:all[10]}},{character:null}]};
  const events=[],passes=[],before=all.map(o=>o.visible);
  const renderTarget={id:'reflection'};
  const renderer={xr:{enabled:true},shadowMap:{autoUpdate:true,needsUpdate:true},autoClear:true,
    setRenderTarget(t){events.push('rt:'+(t?.id??'null'));},
    setClearColor(x,a){events.push('clearColor:'+String(x)+':'+a);},
    clear(a,b,c){events.push('clear:'+a+b+c);},
    render(){passes.push(all.map(x=>x.visible));if(throws)throw Error('expected render failure');}};
  const rows=[];
  for(let i=0;i<repeat;i++){
    let thrown=null;
    try{f.call(env,renderer,{id:'scene'},{id:'camera'},renderTarget,
      ultra?'ultra':'high',true,true,true,{id:'color'},.6,G);}
    catch(e){thrown=e.message;}
    rows.push({events:events.splice(0),passes:passes.splice(0),thrown,
      restored:all.map(o=>o.visible)});
    assert.deepEqual(all.map(o=>o.visible),before,'original visibility restored');
    assert.equal(renderer.xr.enabled,true);
    assert.equal(renderer.shadowMap.autoUpdate,true);
    assert.equal(renderer.shadowMap.needsUpdate,true);
    assert.equal(env._reflBusy,false);
    if(env._iwReflHide)assert.equal(env._iwReflHide.length,0,'no stale scene references');
    if(env._iwReflVis)assert.equal(env._iwReflVis.length,0,'no stale visibility data');
  }
  return {rows,env};
}
test('marina reflection native visibility and renderer command sequences match exactly',()=>{
  for(const ultra of [false,true]){
    const original=invokeReflection(ENV,{ultra,repeat:7});
    const changed=invokeReflection(patchedEnv,{ultra,repeat:7});
    assert.deepEqual(changed.rows,original.rows,'quality '+ultra);
    assert.ok(changed.env._iwReflHide&&changed.env._iwReflVis);
    assert.equal(changed.env._iwReflHide.length,0);
  }
});
test('renderer exception still restores all hidden actors and releases scratch references',()=>{
  const before=invokeReflection(ENV,{throws:true,repeat:3});
  const after=invokeReflection(patchedEnv,{throws:true,repeat:3});
  assert.deepEqual(after.rows,before.rows);
  assert.deepEqual(after.rows.map(r=>r.thrown),Array(3).fill('expected render failure'));
  assert.equal(after.env._iwReflHide.length,0);
  assert.equal(after.env._iwReflVis.length,0);
});
