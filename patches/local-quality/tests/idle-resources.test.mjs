import { syncPortraitFrame } from '../portrait-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { idleFixture, audioFixture, compose } from './idle-fixture.mjs';
import { environmentBudget, refreshEnvironmentBudget, pausedWorldFrame, idleAttractMenuBudget } from '../idle-resources.mjs';

test('cloud and far budgets are explicit for every effective device/quality tier',()=>{
  for(const quality of ['low','medium','high','ultra']) for(const touch of [false,true]) {
    const b=environmentBudget({quality},{touch}), small=quality==='low'||touch;
    assert.deepEqual(b,small?{cloudWidth:1024,cloudHeight:320,farSize:256}:{cloudWidth:2048,cloudHeight:640,farSize:512});
    assert.equal(b.cloudWidth*b.cloudHeight*8,small?2621440:10485760);
  }
});

test('actual Environment cloud target and uniform obey budget, strips cover complete target',async()=>{
  const {G,THREE,Environment}=await idleFixture();
  for(const quality of ['low','high']) for(const touch of [false,true]){
    G.settings={quality};G.game={mobile:{touch}};
    const e=Object.create(Environment.prototype);e.U={uCloudTex:{value:null}};e._initCloudBake();
    const q=environmentBudget(G.settings,G.game.mobile),rt=e._cloudRT;
    assert.equal(rt.width,q.cloudWidth);assert.equal(rt.height,q.cloudHeight);
    assert.equal(rt.texture.type,THREE.HalfFloatType);assert.equal(rt.texture.generateMipmaps,false);assert.equal(rt.depthBuffer,false);assert.equal(rt.stencilBuffer,false);
    assert.deepEqual(Array.from(e._cloudMat.uniforms.uRes.value.toArray()),[q.cloudWidth,q.cloudHeight]);
    const strips=[]; e.renderer={autoClear:true,xr:{enabled:true},getRenderTarget:()=>null,setRenderTarget(){},setClearColor(){},clear(){},render(){strips.push(rt.scissor.toArray());}};
    e._bakeClouds({sunColor:'#ffffff',sunIntensity:2.75});
    assert.equal(strips.length,10);assert.equal(strips.reduce((n,s)=>n+s[2]*s[3],0),q.cloudWidth*q.cloudHeight);
    assert.equal(rt.scissorTest,false);assert.equal(e.renderer.autoClear,true);assert.equal(e.renderer.xr.enabled,true);
    rt.dispose();e._cloudMat.dispose();
  }
});

test('budget refresh resizes and rebakes once only, preserves texture reference and no depth/mips',async()=>{
  const {G,Environment}=await idleFixture();G.settings={quality:'high'};G.game={mobile:{touch:false}};
  const e=Object.create(Environment.prototype);e.U={uCloudTex:{value:null}};e._initCloudBake();e.theme='golden';let baked=0,disposed=0;
  e.setTheme=n=>{assert.equal(n,'golden');baked++;};e._cloudRT.addEventListener('dispose',()=>disposed++);
  const tex=e.U.uCloudTex.value;
  for(let i=0;i<20;i++){
    assert.equal(refreshEnvironmentBudget(e,{quality:'low'},{touch:false}),true);
    assert.equal(refreshEnvironmentBudget(e,{quality:'high'},{touch:true}),false);
    assert.equal(refreshEnvironmentBudget(e,{quality:'high'},{touch:false}),true);
  }
  assert.equal(baked,40);assert.equal(disposed,40);assert.equal(e.U.uCloudTex.value,tex);
});

test('actual far target releases once on exit, clears sampler and recreates for re-entry at budget',async()=>{
  const {G,THREE,Environment}=await idleFixture();G.settings={quality:'low'};G.game={mobile:{touch:true}};
  const e=Object.create(Environment.prototype);e.U={uFarOn:{value:0},uFarCube:{value:null}};e._marina=true;
  e.scene=new THREE.Scene();e.root=new THREE.Group();e.scene.add(e.root);e.bounds={minX:0,maxX:4,minZ:0,maxZ:4};e.sun={shadow:{map:{}}};
  // Keep real CubeCamera / RenderTarget; stand in only for WebGL drawing.
  e.renderer={coordinateSystem:THREE.WebGLCoordinateSystem ?? (await idleFixture({baseline:true})).THREE.WebGLCoordinateSystem,xr:{enabled:false},shadowMap:{autoUpdate:true,needsUpdate:false},autoClear:true,
    getRenderTarget:()=>null,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,getClearColor:c=>c.set(0),getClearAlpha:()=>1,setClearColor(){},setRenderTarget(){},render(){}};
  for(let i=0;i<8;i++){
    e._marina=true;e._bakeFarReflection();const rt=e._farRT;assert.equal(rt.width,256);assert.equal(e.U.uFarCube.value,rt.texture);assert.equal(e.U.uFarOn.value,1);
    let disposed=0;rt.addEventListener('dispose',()=>disposed++);
    e._marina=false;e._bakeFarReflection();e._bakeFarReflection();assert.equal(disposed,1);assert.equal(e._farRT,null);assert.equal(e._farCam,null);assert.equal(e.U.uFarCube.value,null);assert.equal(e.U.uFarOn.value,0);
  }
});

test('native music plays/pumps when audible, mute owns no scheduler/players, SFX context stays running',async()=>{
  const f=audioFixture(), {MusicEngine}=await idleFixture({globals:f.globals});const m=new MusicEngine();
  m._init(f.ctx,f.ctx.createGain());assert.equal(f.workers.size,0);
  m.play('title',{fade:0});assert.equal(f.workers.size,1);assert.equal(m.players.length,1);assert.ok(f.counts.starts>0);
  const saved=f.counts.starts;m.setMusicEnabled(false);
  assert.equal(f.workers.size,0);assert.equal(m.players.length,0);assert.equal(m.current,null);
  for(let i=0;i<400;i++){f.ctx.currentTime+=.025;m._tick();}assert.equal(f.counts.starts,saved);assert.equal(f.counts.suspended,0);
  m.play('battle');m.play('menu');m.setMusicEnabled(true);assert.equal(m.track,'menu');assert.equal(f.workers.size,1);
  for(let i=0;i<20;i++){m.setMusicEnabled(false);m.setMusicEnabled(true);assert.equal(f.workers.size,1);assert.equal(m.players.length,1);}
  m.dispose();assert.equal(f.workers.size,0);
});

test('actual audio pre-init zero never pumps music and leaves SFX callable; unmute honors latest track',async()=>{
  const f=audioFixture(),{AudioEngine,music}=await idleFixture({globals:f.globals});const a=new AudioEngine({context:f.ctx});
  a.setVolumes({music:0,sfx:1});music.play('title');a.init();
  assert.equal(music.players.length,0);assert.equal(f.workers.size,0);assert.equal(f.counts.starts,0);
  const before=f.counts.starts;a.play('jump');assert.ok(f.counts.starts>before);assert.equal(a.vol.sfx,1);assert.equal(f.counts.suspended,0);
  music.play('battle');a.setVolumes({music:.5});assert.equal(music.track,'battle');assert.equal(f.workers.size,1);
  a.setVolumes({music:0});music.stop();a.setVolumes({music:.6});assert.equal(music.track,null);assert.equal(f.workers.size,0);
  assert.match(compose('src/main.js'),/this\._applyAudioVolumes\(\); G\.audio\?\.init/);
});

test('interval fallback idles and restarts without duplicate timers',async()=>{
  const f=audioFixture();f.globals.Worker=class{constructor(){throw Error('no worker');}};
  const {MusicEngine}=await idleFixture({globals:f.globals});const m=new MusicEngine();m._init(f.ctx,f.ctx.createGain());m.play('menu');
  assert.equal(f.intervals.size,1);m.setMusicEnabled(false);assert.equal(f.intervals.size,0);m.setMusicEnabled(true);assert.equal(f.intervals.size,1);m.dispose();assert.equal(f.intervals.size,0);
});

test('paused backdrop draws once, invalidates on resize/quality/context restore/stage and stays live online',()=>{
  let lost=false;const G={level:{},env:{theme:'day'},renderer:{getContext:()=>({isContextLost:()=>lost})}};
  const game={match:{paused:true,attract:false},settings:{quality:'high'},showcase:{fullFrame:false}};
  const view={innerWidth:800,innerHeight:600,devicePixelRatio:1};
  let f=pausedWorldFrame(game,G,view);assert.equal(f.draw,true);f.commit();
  for(let i=0;i<300;i++)assert.equal(pausedWorldFrame(game,G,view).draw,false);
  for(const change of [()=>view.innerWidth++,()=>game.settings.quality='low',()=>G.env.theme='dusk',()=>G.level={}]){change();f=pausedWorldFrame(game,G,view);assert.equal(f.draw,true);f.commit();assert.equal(pausedWorldFrame(game,G,view).draw,false);}
  lost=true;assert.equal(pausedWorldFrame(game,G,view).draw,false);lost=false;assert.equal(pausedWorldFrame(game,G,view).draw,true);
  G.netm={};assert.equal(pausedWorldFrame(game,G,view).paused,false);delete G.netm;
  game.match.paused=false;assert.equal(pausedWorldFrame(game,G,view).draw,true);game.match.paused=true;assert.equal(pausedWorldFrame(game,G,view).draw,true);
});

test('actual composed Game._frame skips only offline paused world; UI/net/input remain live',()=>{
  const source=compose('src/main.js'), start=source.indexOf('  _frame(dt) {'), end=source.indexOf('\n  // continuous sounds',start);
  assert.ok(start>=0&&end>start);
  const calls={}, count=k=>()=>{calls[k]=(calls[k]||0)+1;};
  const vector={copy(){},set(){},getWorldDirection(){return this;}};
  const G={time:1,level:{},teamColors:[{},{}],renderer:{info:{reset:count('info'),render:{calls:0,triangles:0}},shadowMap:{needsUpdate:false}},
    env:{theme:'day',update:count('env')},fx:{update:count('fx')},projectiles:{updateArc:count('arc')},paint:{flush:count('paint')},camera:{position:vector,up:vector}};
  const Frame=new Function('syncPortraitFrame','G','runSimulation','pausedWorldFrame','idleAttractMenuBudget','performance','damp','clamp','THREE',
    'return class Frame {\n'+source.slice(start,end)+'\n}')
  const Frame=new Function('syncPortraitFrame','G','runSimulation','pausedWorldFrame','idleAttractMenuBudget','performance','damp','clamp','THREE',
  const f=new Frame();f.settings={quality:'high'};f.match={paused:true,attract:false,state:'playing',local:null};
  f.showcase={fullFrame:false,mode:null,update:count('showcase'),render:count('showcaseRender')};
  f.R={render:count('worldRender'),grade:{uniforms:{uHurt:{value:0}}}};f.decor={update:count('decor')};f.props={update:count('props')};
  f.levelMat={userData:{uniforms:{uTime:{value:0},uSeeOn:{value:0},uSeeA: {value:vector},uSeeB:{value:vector}}}};f.rig={update:count('rig'),setMap(){},mapK:0};f._dioFog=count('fog');f.menus={update:count('ui')};f.screenfx={update:count('screenfx')};
  f._updateLocalLoops=count('loops');f._updateAmbience=count('ambience');
  for(let i=0;i<120;i++)f._frame(1/60);
  assert.equal(calls.worldRender,1);assert.equal(calls.ui,120);assert.equal(calls.simulation,120);assert.equal(calls.env,undefined);assert.equal(calls.paint,undefined);assert.equal(calls.rig,undefined);assert.equal(G.renderer.shadowMap.needsUpdate,false);
  f._skipRender=true;f.settings.bloom=true;f._frame(1/60);assert.equal(calls.worldRender,1);f._skipRender=false;f._frame(1/60);assert.equal(calls.worldRender,2);
  G.netm={};f._frame(1/60);assert.equal(calls.worldRender,3);assert.equal(calls.env,1);assert.equal(calls.paint,1);assert.equal(calls.rig,1);assert.equal(G.renderer.shadowMap.needsUpdate,true);
  delete G.netm;f.match.paused=false;f._frame(1/60);assert.equal(calls.worldRender,4);
});

test('unpatched public negative controls retain 10 MiB cloud and music work when zero',async()=>{
  const f=audioFixture(), {G,Environment,MusicEngine}=await idleFixture({baseline:true,globals:f.globals});G.settings={quality:'low'};G.game={mobile:{touch:true}};
  const e=Object.create(Environment.prototype);e.U={uCloudTex:{value:null}};e._initCloudBake();assert.equal(e._cloudRT.width*e._cloudRT.height*8,10485760);
  const m=new MusicEngine();m._init(f.ctx,f.ctx.createGain());m.play('title');assert.equal(f.workers.size,1);assert.equal(m.setMusicEnabled,undefined);
  const starts=f.counts.starts;f.ctx.currentTime+=1;m._tick();assert.ok(f.counts.starts>starts);m.dispose();
});

test('muted track requests retain null and director remapping; every installed track can restart',async()=>{
  const f=audioFixture(),{MusicEngine}=await idleFixture({globals:f.globals});const m=new MusicEngine();m._init(f.ctx,f.ctx.createGain());
  for(const track of m.tracks){m.setMusicEnabled(false);m.play(track,{fade:0});assert.equal(m.players.length,0);m.setMusicEnabled(true);assert.equal(m.track,track);assert.equal(m.players.length,1);}
  m.setMusicEnabled(false);m.remap=id=>id==='battle'?'menu':id;m.play('battle');m.setMusicEnabled(true);assert.equal(m.track,'menu');
  m.setMusicEnabled(false);m.play(null);m.setMusicEnabled(true);assert.equal(m.track,null);assert.equal(m.players.length,0);assert.equal(f.workers.size,0);m.dispose();
});

test('context restoration invalidates paused backdrop even with no RAF during loss; canvas listeners stay bounded',()=>{
 const mk=()=>({events:new Map(),addEventListener(k,v){this.events.set(k,v);},removeEventListener(k,v){if(this.events.get(k)===v)this.events.delete(k);}});
 const canvas=mk(),G={renderer:{domElement:canvas}},game={match:{paused:true,attract:false},settings:{}};
 let f=pausedWorldFrame(game,G);f.commit();assert.equal(canvas.events.size,2);
 for(let i=0;i<100;i++)assert.equal(pausedWorldFrame(game,G).draw,false);
 canvas.events.get('webglcontextrestored')();assert.equal(pausedWorldFrame(game,G).draw,true);
 G.renderer.domElement=mk();pausedWorldFrame(game,G);assert.equal(canvas.events.size,0);assert.equal(G.renderer.domElement.events.size,2);
});
