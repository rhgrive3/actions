import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {TURF_INTRO_FRAMES} from '../../patches/splatoon3/runtime/turf-intro-camera.mjs';
import {nativeIntroMethods, installNativeIntroFixture} from './fixtures/inkwave-projectile-native-intro.mjs';
import {installProjectileCaptureUiGate,withProjectileCaptureUi} from '../lib/inkwave-projectile-capture-ui.mjs';
import {completeNativeTurfIntro} from '../lib/inkwave-projectile-ci-intro.mjs';
import {nativeTurfIntroWithUiFunction} from '../lib/inkwave-projectile-intro-ui.mjs';
import {atomicIntroFunction,requireAtomicIntro} from '../lib/inkwave-projectile-atomic-intro.mjs';

// Deterministic platform fixture. The native source methods and candidate
// helpers are real; DOM, CSS interpolation, WebGL and elapsed time are modeled.
function fixture() {
  let now=0,id=0;const timers=new Map(),rafs=new Map();
  class Node {
    constructor(tag='DIV'){this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;this.isConnected=true;this.id='';this.width=1280;this.height=720;this.dataset={};this.animation=[];
      this.style={opacity:'1',display:'block',visibility:'visible',setProperty(k,v){this[k]=v;}};
      const names=new Set();this.classList={values:names,contains:k=>names.has(k),add:(...a)=>a.forEach(k=>names.add(k)),remove:(...a)=>a.forEach(k=>names.delete(k)),toggle:(k,on)=>{on??=!names.has(k);on?names.add(k):names.delete(k);return on;}};
      Object.defineProperty(this,'className',{get:()=>[...names].join(' '),set:s=>{names.clear();s.split(/\s+/).filter(Boolean).forEach(k=>names.add(k));}});
    }
    get childElementCount(){return this.children.length;}
    getBoundingClientRect(){return{x:0,y:0,width:1280,height:720,right:1280,bottom:720};}
    getAnimations(){return this.animation;}
    getContext(){return{drawingBufferWidth:1280,drawingBufferHeight:720};}
    setAttribute(k,v){if(k==='class')this.className=v;else this[k]=v;}
    append(...kids){for(let k of kids){if(typeof k!=='object')k=Object.assign(new Node('#text'),{textContent:k});k.parentElement=this;this.children.push(k);}}
    appendChild(k){this.append(k);return k;}
    remove(){if(this.parentElement){this.parentElement.children.splice(this.parentElement.children.indexOf(this),1);this.parentElement=null;this.isConnected=false;}}
    addEventListener(){}
    querySelectorAll(q){return this.children.flatMap(n=>[...(matches(n,q)?[n]:[]),...n.querySelectorAll(q)]);}
    querySelector(q){return this.querySelectorAll(q)[0]||null;}
  }
  const matches=(n,selector)=>selector.split(',').some(sel=>{sel=sel.trim();if(sel.startsWith('#'))return n.id===sel.slice(1);if(!sel.startsWith('.'))return n.tagName===sel.toUpperCase();const [cl,group]=sel.slice(1).split('[data-g="');return cl.split('.').every(c=>n.classList.contains(c))&&(!group||n.dataset.g===group.slice(0,-2));});
  const root=new Node('HTML'),body=new Node('BODY'),ui=new Node(),canvas=new Node('CANVAS'),hud=new Node(),over=new Node();
  canvas.id='game-canvas';ui.id='ui-root';hud.className='iw-hud is-hidden';over.className='iw-hud-over';root.append(body);body.append(canvas,ui);ui.append(hud,over);
  const document={visibilityState:'visible',hidden:false,createElement:t=>new Node(t),querySelector:q=>root.querySelector(q),querySelectorAll:q=>root.querySelectorAll(q)};
  const window={};const context=vm.createContext({window,document,innerWidth:1280,innerHeight:720,console,URLSearchParams,location:{search:''},
    Date:{now:()=>now},performance:{now:()=>now},setTimeout:(fn,ms)=>{const k=++id;timers.set(k,{fn,due:now+ms});return k;},clearTimeout:k=>timers.delete(k),
    requestAnimationFrame:fn=>{const k=++id;rafs.set(k,fn);return k;},
    getComputedStyle:el=>({...el.style,...(el.classList.contains('is-hidden')?{opacity:'0',visibility:'hidden'}:{})}),
  });
  const run=fn=>vm.runInContext('('+fn.toString()+')()',context);
  context.methods=nativeIntroMethods;vm.runInContext('('+installNativeIntroFixture.toString()+')(methods)',context);run(installProjectileCaptureUiGate);
  const tick=async ms=>{now+=ms;for(const [k,fn] of [...rafs])if(rafs.delete(k))fn(now);for(const [k,t]of [...timers])if(t.due<=now&&timers.delete(k))t.fn();for(let i=0;i<8;i++)await Promise.resolve();};
  const drive=async promise=>{let done=false,value,error;promise.then(v=>{done=true;value=v;},e=>{done=true;error=e;});for(let i=0;i<1000&&!done;i++)await tick(50);assert(done,'bounded fixture driver');if(error)throw error;return value;};
  return{window,game:window.__inkwave,G:window.__G,match:window.__G.match,calls:window.calls,hud,ui,over,canvas,Node,run,tick,drive,now:()=>now,read:o=>window.__iwProjectileCaptureUiGate(o)};
}
const admission=()=>window.__G.mode==='match'&&window.__inkwave.match===window.__G.match&&['intro','playing'].includes(window.__G.match.state);
const playing=()=>window.__G.mode==='match'&&window.__inkwave.match===window.__G.match&&window.__G.match.state==='playing';
const callback=deadline=>atomicIntroFunction(nativeTurfIntroWithUiFunction(completeNativeTurfIntro,deadline),
  withProjectileCaptureUi(playing,{phase:'playing',settled:false}),withProjectileCaptureUi(admission,{phase:'admission',allowIntro:true,settled:false,cinematicAdmission:true}),{asyncIntro:true});

test('actual composed intro, lineup and match methods pass phase-correct helper without rendering early cinematic',async()=>{
  const f=fixture();const early=f.read({phase:'admission',allowIntro:true,settled:false,cinematicAdmission:true});
  assert.equal(early.ready,true);assert.equal(early.captureReady,false);assert(early.captureFailed.includes('hud'));assert(early.captureFailed.includes('lineup'));assert.equal(early.hud.flag,false);assert.equal(early.ui.lineupCount,1);assert.equal(f.read().ready,false);
  const pending=f.run(callback(10000));f.window.startNativeLoop();
  const result=await f.drive(pending);
  assert.equal(result.playingReady,true);assert.equal(result.intro.frames,TURF_INTRO_FRAMES.go);assert.equal(result.intro.matchTimeBefore,180);assert.equal(result.intro.matchTimeAfter,180);
  assert.equal(f.calls.renderedIntroFrames,0);assert.equal(f.calls.skippedLiveFrames,0);assert.equal(f.calls.freeze,2);assert.equal(f.calls.unfreeze,2);
  assert.equal(f.window.__iwProjectileIntroUiReceipt.initialUi.hud.flag,false);assert(f.window.__iwProjectileIntroUiReceipt.initialUi.captureFailed.includes('hud'));assert.equal(f.window.__iwProjectileIntroUiReceipt.uiReadyAtMs,50);assert.equal(f.game.frozen,false);assert.equal(f.game._skipRender,false);
  assert.equal(f.read().ready,false,'GO is still mandatory to settle');
  await f.tick(4000);assert.equal(f.read().ready,true);assert.equal(f.calls.skippedLiveFrames,0);
});

test('negative control executes actual native HUD timer after immediate completion and proves permanent hidden HUD',async()=>{
  const f=fixture();f.run(completeNativeTurfIntro);await f.tick(3500);
  assert.equal(f.match.state,'playing');assert.equal(f.game.hud._visible,true);assert.equal(f.read().ready,false);
});

test('structural mode cannot authorize capture, playing, duplicate/missing HUD, multiple lineups or wrong renderer',()=>{
  for(const mutate of [f=>f.hud.remove(),f=>f.ui.append(Object.assign(new f.Node(),{className:'iw-hud'})),f=>f.G.renderer={...f.G.renderer},f=>{for(let i=0;i<2;i++)f.over.append(Object.assign(new f.Node(),{className:'iw-lineup'}));}]){
    const f=fixture();mutate(f);assert.equal(f.read({phase:'admission',allowIntro:true,settled:false,cinematicAdmission:true}).ready,false);assert.equal(f.calls.frames,0);
  }
  for(const phase of ['capture','settled','before-screenshot','playing']){const f=fixture();assert.equal(f.read({phase,allowIntro:true,settled:false,cinematicAdmission:true}).ready,false);}
  const f=fixture();f.run(completeNativeTurfIntro);assert.equal(f.read({phase:'admission',allowIntro:true,settled:false,cinematicAdmission:true}).captureReady,false);
});

for(const fault of ['HUD hidden','lineup remains','CSS pending','CSS paused','wrong renderer','touch orientation','menu reappears','wipe restarts'])test(fault+' remains fail-closed after structural admission and restores native controls',async()=>{
  const f=fixture(),pending=f.run(callback(3800));
  if(fault==='HUD hidden')f.game.hud=null;
  if(fault==='lineup remains')f.over.append(Object.assign(new f.Node(),{className:'iw-lineup'}));
  if(fault==='CSS pending')f.hud.animation=[{pending:true,playState:'running',effect:{target:f.hud}}];
  if(fault==='CSS paused')f.hud.animation=[{pending:false,playState:'paused',effect:{target:f.hud}}];
  if(fault==='wrong renderer')f.G.renderer={...f.G.renderer};
  if(fault==='touch orientation')f.match.controller.orientationBlocked=true;
  if(fault==='menu reappears')f.game.menus.current='pause';
  if(fault==='wipe restarts')f.game.menus.wipe.running=true;
  await assert.rejects(f.drive(pending),/deadline|ownership/);
  assert.equal(f.calls.frames,TURF_INTRO_FRAMES.ready);assert.equal(f.calls.liveFrames,0);assert.equal(f.match.state,'intro');assert.equal(f.match.time,180);assert.equal(f.game.frozen,false);assert.equal(f.game._skipRender,false);
  assert.equal(f.window.__iwProjectileIntroUiReceipt.outcome,'failed');
});

for(const fault of ['identity','paused','state','clock','unfreeze','network','boss','range','ranked'])test('native '+fault+' changes after presentation reject before another intro or live step',async()=>{
  const f=fixture(),pending=f.run(callback(5000));
  if(fault==='identity')f.G.match={};if(fault==='paused')f.match.paused=true;if(fault==='state')f.match.state='playing';if(fault==='clock')f.match.time=179;if(fault==='unfreeze')f.game.frozen=false;if(fault==='network')f.G.netm={};
  if(fault==='boss')f.match.boss={};if(fault==='range')f.match.opts={range:true};if(fault==='ranked')f.match.mode='zones';
  await assert.rejects(f.drive(pending),/ownership changed/);assert.equal(f.calls.frames,TURF_INTRO_FRAMES.ready);assert.equal(f.calls.liveFrames,0);assert.equal(f.game._skipRender,false);assert.equal(f.game.frozen,false);
});

test('expired callback does not mutate cinematic and a late UI receipt can never satisfy original host deadline',async()=>{
  const f=fixture();await f.tick(100);await assert.rejects(f.run(callback(99)),/deadline expired/);assert.equal(f.calls.freeze,0);assert.equal(f.calls.frames,0);
  assert.equal(f.window.__iwProjectileIntroUiReceipt.outcome,'failed');
  const g=fixture(),receipt={};const evaluation=g.run(callback(10000));
  const result=await g.drive(evaluation);assert.equal(result.playingReady,true);
  await g.tick(3501);
  await assert.rejects(requireAtomicIntro({evaluate:async()=>result},()=>{},3500,{now:g.now,receipt}),/expired/);assert.equal(receipt.outcome,'expired-before-evaluation');
});

test('native helper exception restores controls and preserves original exception',async()=>{
  const f=fixture(),original=new Error('native frame');f.game._frame=()=>{throw original;};
  await assert.rejects(f.drive(f.run(callback(5000))),e=>e===original);assert.equal(f.window.__iwProjectileIntroUiReceipt.outcome,'failed');assert.equal(f.game.frozen,false);assert.equal(f.game._skipRender,false);
});

test('already-playing match is never frozen, stepped or render-suppressed by the new helper',async()=>{
  const f=fixture();await f.tick(3500);f.run(completeNativeTurfIntro);const before={...f.calls};
  const result=await f.run(callback(10000));assert.equal(result.intro.method,'natural');assert.deepEqual({...f.calls},before);assert.equal(f.window.__iwProjectileIntroUiReceipt.outcome,'natural');
});

for(const fault of ['frozen','render suppressed','boss','range','ranked'])test('preexisting '+fault+' is rejected without acquiring cinematic ownership',async()=>{
  const f=fixture();if(fault==='frozen')f.game.frozen=true;if(fault==='render suppressed')f.game._skipRender=true;if(fault==='boss')f.match.boss={};if(fault==='range')f.match.opts={range:true};if(fault==='ranked')f.match.mode='zones';
  await assert.rejects(f.run(callback(10000)),/initialized unpaused offline Turf/);assert.equal(f.calls.frames,0);assert.equal(f.calls.freeze,0);
});

test('a foreign Match-clock presentation cannot authorize even one intro frame',async()=>{
 for(const key of ['match','flow']){
  const f=fixture();f.game._introPresentation[key]={};
  await assert.rejects(f.run(callback(10000)),/presentation ownership changed/);
  assert.equal(f.calls.frames,0);assert.equal(f.calls.liveFrames,0);
  assert.equal(f.game.frozen,false);assert.equal(f.game._skipRender,false);
 }
});
test('a stalled native presentation remains bounded and cannot consume a live frame',async()=>{
 const f=fixture();f.game._frame=()=>{f.calls.frames++;};
 await assert.rejects(f.run(callback(10000)),/presentation did not finish/);
 assert.equal(f.calls.frames,TURF_INTRO_FRAMES.ready+1);assert.equal(f.calls.liveFrames,0);
 assert.equal(f.match.time,180);assert.equal(f.match.state,'intro');
 assert.equal(f.game.frozen,false);assert.equal(f.game._skipRender,false);
});
