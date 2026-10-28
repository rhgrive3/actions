import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import baseline from './fixtures/visual-audio-baseline.mjs';
import { nonWailVfxTicks } from '../runtime/nonwail-vfx-clock.mjs';
const root=new URL('../../../',import.meta.url);
const source=rel=>adaptBuildSource(rel,fs.readFileSync(new URL('inkwave-public/'+rel,root),'utf8'));
function methods(code,names){let found=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type==='MethodDefinition'&&names.includes(n.key.name))found.push(code.slice(n.start,n.end));for(const [k,v]of Object.entries(n))if(k!=='start'&&k!=='end')if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(code,{ecmaVersion:'latest',sourceType:'module'}));return found.join('\n');}
function hud(){let id=0;const pending=new Map();const env={performance:{now:()=>1000},requestAnimationFrame:fn=>{pending.set(++id,fn);return id;},cancelAnimationFrame:i=>pending.delete(i),console};let h=vm.runInNewContext('new(class {'+methods(source('src/ui/hud.js'),['paused','_addFx','_fxLoop','setWorldPaused'])+'})',env);Object.assign(h,{timeScale:1,_fxTime:0,_fxMap:new Map(),el:{classList:{toggle(){}}},overLayer:{classList:{toggle(){}}}});h._fxLoop=h._fxLoop.bind(h);return {h,pending,run(){const [i,fn]=pending.entries().next().value;pending.delete(i);fn(1016);}};}
test('HUD scheduling retains historical canonical methods except exact reviewed pause ownership corrections',()=>{
 let actual=methods(source('src/ui/hud.js'),['paused','_addFx','_fxLoop','setWorldPaused']);
 // The queue's five exact pause/RAF ownership edits are independently
 // verified below. Revert only these text fragments, then retain the full
 // byte-for-byte historical method comparison (including every other token).
 const changes=[
  ['      if (!this.paused && this._fxMap?.size && !this._rafId) {','      if (this._fxMap?.size && !this._rafId) {'],
  ['    if (!this._rafId && !this._worldPaused && !this.paused) { this._lastFx = performance.now(); this._rafId = requestAnimationFrame(this._fxLoop); }','    if (!this._rafId && !this._worldPaused) { this._lastFx = performance.now(); this._rafId = requestAnimationFrame(this._fxLoop); }'],
  ['_fxLoop(t) {\n    this._rafId = 0;','_fxLoop(t) {'],
  ['    if (this.paused) { this._rafId = 0; return; }','    if (this.paused) { this._rafId = this._fxMap.size ? requestAnimationFrame(this._fxLoop) : 0; return; }'],
  ['    if (this._fxMap.size && !this.paused && !this._worldPaused) { if (!this._rafId) this._rafId = requestAnimationFrame(this._fxLoop); }\n    else { cancelAnimationFrame(this._rafId); this._rafId = 0; }','    this._rafId = this._fxMap.size ? requestAnimationFrame(this._fxLoop) : 0;'],
 ];
 for(const [changed,original] of changes){
   assert.equal(actual.split(changed).length,2,'one exact reviewed HUD queue correction');
   actual=actual.replace(changed,original);
 }
 assert.equal(actual,baseline['hud.js'].methods,'unrelated HUD method edits remain rejected');
});
test('HUD synchronous pause/resume inside effect must not duplicate RAF ownership',()=>{const {h,pending,run}=hud();h._addFx('x',()=>{h.paused=true;h.paused=false;});run();assert.equal(pending.size,1);});
test('menu binding is once per element, latest callback and modal ownership govern clicks',()=>{const p=vm.runInNewContext('({'+methods(source('src/ui/menus.js'),['_bind'])+'})',{performance:{now:()=>100}});const listeners={};const el={dataset:{},tagName:'BUTTON',addEventListener:(k,f)=>(listeners[k]||=[]).push(f)};let old=0,next=0;const m={_binds:new WeakMap(),_setFocus(){}};const click=()=>listeners.click.forEach(f=>f({target:{closest:()=>false}}));p._bind.call(m,el,{accept:()=>old++});p._bind.call(m,el,{accept:()=>next++});click();assert.equal(old,0);assert.equal(next,1);assert.equal(listeners.click.length,1);m._modal={contains:()=>false};click();assert.equal(next,1);m._modal=null;p._bind.call(m,el,{accept:()=>next++,click:false});click();assert.equal(next,1);});
test('geometry consume is opt-in; singleton retained, merged temporaries disposed, failed merges retained',()=>{const build=vm.runInNewContext('({'+methods(source('src/game/lobbySet-geo.js'),['build'])+'})',{mergeGeometries:list=>list[0].fail?null:{merged:true}}).build;let disposals=0;const g=()=>({dispose:()=>disposals++});let one=g(),a=g(),b=g(),fail={fail:true};const owner={buckets:new Map([['single',[one]],['merged',[a,b]],['failed',[fail,g()]]])};build.call(owner);assert.equal(disposals,0);assert.equal(owner.buckets.size,3);let out=build.call(owner,{consume:true});assert.equal(out.single,one);assert.equal(disposals,2);assert.equal(owner.buckets.size,1);assert.ok(owner.buckets.has('failed'));});
test('audio admission rejects silence, absent/closed context, capacity; prunes dead loops',()=>{const can=vm.runInNewContext('({'+methods(source('src/audio/audio.js'),['canRearmLoop'])+'})',{MAX_LOOPS:2}).canRearmLoop;const a={ctx:{state:'running'},loops:new Set([{playing:false}]),_sfxSilent:()=>false};assert.equal(can.call(a),true);assert.equal(a.loops.size,0);a.loops.add({playing:true});a.loops.add({playing:true});assert.equal(can.call(a),false);a.loops.clear();a._sfxSilent=()=>true;assert.equal(can.call(a),false);a._sfxSilent=()=>false;a.ctx.state='closed';assert.equal(can.call(a),false);a.ctx=null;assert.equal(can.call(a),false);});
test('real loop provider plus main consumer preserves parked requests and rearms dead handles once',()=>{let liveStarts=0;const p=vm.runInNewContext('new(class {'+methods(source('src/audio/audio.js'),['canRearmLoop','loop','_requestSfxLoop','_activateSfxReq','_suspendSfxReqs','_resumeSfxReqs','stopAll','dispose'])+'})',{MAX_LOOPS:2,NOOP_HANDLE:{playing:false,stop(){},set(){}},Promise});const a=Object.assign(p,{ctx:{state:'running',currentTime:0},loops:new Set(),_sfxReq:new Set(),silent:false,_sfxSilent(){return this.silent;},_def:()=>({}),_loopLive(){liveStarts++;const h={playing:true,set(){},stop(){this.playing=false;a.loops.delete(this);}};a.loops.add(h);return h;}});const main=vm.runInNewContext('new(class {'+methods(source('src/main.js'),['_updateAmbience','_updateLocalLoops'])+'})',{G:{audio:a},damp:(x,y)=>y})._updateAmbience;const m={_audioOn:true,showcase:{fullFrame:true}};main.call(m,1/60);assert.equal(liveStarts,1);const first=m._amb;for(let i=0;i<3;i++){a.silent=true;a._suspendSfxReqs();for(let j=0;j<3;j++)main.call(m,1/60);assert.equal(m._amb,first);assert.equal(m._amb._sfxDeferred,true);a.silent=false;a._resumeSfxReqs();assert.equal(m._amb.playing,true);}assert.equal(a._sfxReq.size,1);[...a.loops][0].stop();main.call(m,1/60);assert.notEqual(m._amb,first);assert.equal(a._sfxReq.size,1);const count=liveStarts;main.call(m,1/60);assert.equal(liveStarts,count);a.voices=[];a.byName=new Map();a.stopAll();main.call(m,1/60);assert.equal(m._amb.playing,true);a.opts={context:true};a.last=new Map();a._warned=new Set();a.dispose();assert.equal(a.ctx,null);assert.equal(a._sfxReq.size,0);assert.equal(a.canRearmLoop(),false);a.dispose();main.call(m,1/60);assert.equal(liveStarts,count+1);});

test('showcase jumpout preserves canonical method and emission RNG at 30/60/120Hz and reentry',()=>{
function simulate(code,hz){const fn=vm.runInNewContext('new(class {'+code+'})',{G:{audio:{play(){}}},nonWailVfxTicks})._lobIdle;let random=0;const self={rand(){random++;return .9;}};const m={c:{trigger(){},root:{}},a:{},pos:{x:0,y:0,z:0},act:{kind:'jumpout',t0:0,flag:0},q:[],gT:Infinity,idleT:Infinity};const fx={crown(){},ripple(){},drop(){}};let count=0;for(let i=0;i<200&&m.act;i++){fn.call(self,m,i/hz,1/hz,fx);count++;}return {random,count,phase:m.phase,visible:m.c.root.visible};}
const old=baseline['showcase.js'].methods,now=methods(source('src/game/showcase.js'),['_lobIdle']);
 const oldDrop='          if (this.rand() < 0.8) fx.drop(P.x + (this.rand() - 0.5) * 0.14, P.y + y - 0.2, P.z + (this.rand() - 0.5) * 0.14, (this.rand() - 0.5) * 0.5, -1, (this.rand() - 0.5) * 0.5, 0.012 + this.rand() * 0.016, 1, 2);';
 const newDrop='          for (let trial=0,count=nonWailVfxTicks(A,dt);trial<count;trial++)\n            if (this.rand() < 0.8) fx.drop(P.x + (this.rand() - 0.5) * 0.14, P.y + y - 0.2, P.z + (this.rand() - 0.5) * 0.14, (this.rand() - 0.5) * 0.5, -1, (this.rand() - 0.5) * 0.5, 0.012 + this.rand() * 0.016, 1, 2);';
 assert.equal(now.split(newDrop).length,2,'one reviewed 60Hz VFX cadence replacement');
 assert.equal(old.split(oldDrop).length,2,'historical Splat jumpout uses original RNG point');
 assert.equal(now.replace(newDrop,oldDrop),old,'all unrelated showcase bytes stay identical');
 const results={};
 for(const hz of [30,60,120]){
  const a=simulate(now,hz),prior=simulate(old,hz);
  assert.equal(a.phase,'launched');assert.equal(a.visible,false);
  if(hz===60)assert.deepEqual(a,prior,'60Hz original emission RNG and lifetime');
  assert.deepEqual(simulate(now,hz),a,'fresh action resets carry');
  results[hz]={before:prior.random,after:a.random};
 }
 // The cosmetic reference clock issues exactly one RNG trial per 60Hz frame.
 for(const hz of [30,60,120]){
  const record={};let n=0;
  for(let i=0;i<hz;i++)n+=nonWailVfxTicks(record,1/hz);
  assert.equal(n,60,'source-gated nonwail emits exactly 60 trials per second at '+hz+'Hz');
 }
 console.log('actual jumpout trial counts (before/after)',results);
});
test('music event recovery honors visibility, trusted gesture, track ownership and cancellation/reentry',()=>{function target(){const handlers=new Map();return {handlers,hidden:false,addEventListener(k,f){let s=handlers.get(k);if(!s)handlers.set(k,s=new Set());s.add(f);},removeEventListener(k,f){handlers.get(k)?.delete(f);},emit(type,isTrusted=false){for(const f of [...handlers.get(type)||[]])f({type,isTrusted});},size(){return [...handlers.values()].reduce((n,s)=>n+s.size,0);}};}const win=target(),doc=target();let plays=0,resumes=0;const p=vm.runInNewContext('new(class {'+methods(source('src/audio/music.js'),['_clearFileRecovery','_armFileRecovery','_cancelFileRetry'])+'})',{window:win,document:doc,clearTimeout(){}});Object.assign(p,{_desiredTrack:'battle',ctx:{state:'running',resume(){resumes++;}},_fileFailures:new Set(['battle']),play(){plays++;}});p._armFileRecovery('battle',{});p._armFileRecovery('battle',{});assert.equal(win.size()+doc.size(),5);doc.hidden=true;doc.emit('visibilitychange');assert.equal(plays,0);doc.hidden=false;doc.emit('visibilitychange');assert.equal(plays,1);assert.equal(win.size()+doc.size(),0);p._armFileRecovery('battle',{name:'NotAllowedError'});win.emit('online');win.emit('pointerdown');assert.equal(plays,1);win.emit('pointerdown',true);assert.equal(plays,2);p._armFileRecovery('battle',{});const stale=[...win.handlers.get('focus')][0];p._cancelFileRetry();stale({type:'focus'});assert.equal(plays,2);assert.equal(win.size()+doc.size(),0);p._armFileRecovery('battle',{});p.ctx=null;win.emit('focus');assert.equal(plays,2);p._cancelFileRetry();p.ctx={state:'running'};p._armFileRecovery('battle',{code:4});assert.equal(win.size()+doc.size(),0);assert.equal(resumes,2);});
test('movement loop consumer retains deferred silence, rearms dead active loops and releases on pause',()=>{let created=0,stopped=0;let admitted=true;const audio={canRearmLoop:()=>admitted,loop(){created++;return {playing:true,set(){},stop(){stopped++;this.playing=false;}};}};const consumer=vm.runInNewContext('new(class {'+methods(source('src/main.js'),['_wantLocalLoop','_updateLocalLoops'])+'})',{G:{audio},damp:(x,y)=>y});const method=consumer._updateLocalLoops;const m=Object.assign(consumer,{match:{local:{alive:true,anim:{form:'swim'},vel:{x:1,z:0,y:0},grounded:false}}});method.call(m,1/60);assert.equal(created,1);m._loops.swim.playing=false;m._loops.swim._sfxDeferred=true;method.call(m,1/60);assert.equal(created,1);m._loops.swim._sfxDeferred=false;admitted=false;method.call(m,1/60);assert.equal(created,1);admitted=true;method.call(m,1/60);assert.equal(created,2);m.match.paused=true;method.call(m,1/60);assert.equal(m._loops.swim,null);m.match.paused=false;method.call(m,1/60);assert.equal(created,3);assert.equal(stopped,2);});
