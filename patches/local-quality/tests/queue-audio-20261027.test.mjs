import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { audioLoopPositionChanged, installMusicPlatform } from '../platform-audio.mjs';
import { RealS3SampleLoader } from '../../splatoon3/runtime/audio/real-s3-loader.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

test('guarded loop distance preserves hypot at threshold ULPs, extremes and accumulated moves',()=>{
 const step=Number.EPSILON*.001;
 for(let i=-2000;i<=2000;i++)for(const axis of [0,1,2]){
  const p=[0,0,0];p[axis]=.001+i*step;
  assert.equal(audioLoopPositionChanged(...p),Math.hypot(...p)>.001);
 }
 let seed=1234567;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let i=0;i<100000;i++){
  const a=rand()*Math.PI*2,z=rand()*2-1,r=.001*(1+(rand()-.5)*1e-13),h=Math.sqrt(1-z*z);
  const p=[r*h*Math.cos(a),r*h*Math.sin(a),r*z];
  assert.equal(audioLoopPositionChanged(...p),Math.hypot(...p)>.001);
 }
 for(const p of [[0,0,0],[Number.MIN_VALUE,0,0],[Infinity,0,0],[Number.MAX_VALUE,Number.MAX_VALUE,0]])assert.equal(audioLoopPositionChanged(...p),Math.hypot(...p)>.001);
});

test('queued speculative audio cancellation retains shared and required consumers and resolves every promise',async()=>{
 const bank={ctx:{state:'running'},authorized:{maxBytes:1,loaded:new Map(),key:(...x)=>x.join(':'),load:async()=>({loaded:1})}};
 const l=new RealS3SampleLoader(bank);l.getManifest=async()=>({});l._select=(id,event)=>[{id,event,variant:0}];
 let unblock;const gate=new Promise(r=>unblock=r),seen=[];
 bank.authorized.load=async data=>{seen.push(data.clips[0].id);if(seen.length===1)await gate;return{loaded:1};};
 const first=l.ensure('first','fire');await Promise.resolve();await Promise.resolve();
 const old={},other={},gone=l.ensure('old','fire',{owner:old}),shared=l.ensure('shared','fire',{owner:old});
 assert.equal(l.ensure('shared','fire',{owner:other}),shared);
 const needed=l.ensure('needed','fire',{owner:old});assert.equal(l.ensure('needed','fire'),needed);
 l.cancelOwner(old);assert.equal((await gone).cancelled,true);
 assert.equal(l.pendingJobs.some(r=>r.key==='old:fire'),false);
 const newest=l.ensure('new','fire',{priority:true,owner:other});
 unblock();await Promise.all([first,shared,needed,newest]);
 assert.deepEqual(seen,['first','new','shared','needed']);assert.equal(l.inFlight.size,0);assert.equal(l.pendingJobs.length,0);
});

function eventTarget(){const map=new Map();return{addEventListener(k,f){if(!map.has(k))map.set(k,new Set());map.get(k).add(f);},removeEventListener(k,f){map.get(k)?.delete(f);},send(k){for(const f of map.get(k)||[])f({isTrusted:true});}};}
test('paused current streamed music rearms once, waits for gesture after denial, never restarts retiring or hidden streams',async()=>{
 const document=Object.assign(eventTarget(),{hidden:false,hasFocus:()=>true});const env=Object.assign(eventTarget(),{document,screen:{orientation:eventTarget()}});
 class Music{constructor(){this.ctx={state:'running',currentTime:0};this._desiredTrack='battle';this.players=[];}play(id){this._desiredTrack=id;} _startTimer(){} _tick(){} dispose(){}}
 installMusicPlatform(Music,env);const m=new Music();let attempts=0,resolve,deny=true;
 const media={paused:true,play(){attempts++;if(deny)return Promise.reject(Object.assign(new Error('gesture'),{name:'NotAllowedError'}));return new Promise(r=>{resolve=()=>{this.paused=false;r();};});}};
 const current=m.current={id:'battle',element:media,stopAt:Infinity,failed:false,disposed:false};
 m.play('battle');await new Promise(r=>setImmediate(r));assert.equal(attempts,1);
 m.play('battle');assert.equal(attempts,1);deny=false;env.send('touchend');env.send('click');assert.equal(attempts,2);resolve();await new Promise(r=>setImmediate(r));
 media.paused=true;current.stopAt=2;m.play('battle');assert.equal(attempts,2);
 current.stopAt=Infinity;document.hidden=true;document.send('visibilitychange');env.send('touchend');assert.equal(attempts,2);
 m.dispose();document.hidden=false;document.send('visibilitychange');env.send('touchend');assert.equal(attempts,2);
});

test('composed Boss loops cancel expiry and background polling, then resume one follower',async()=>{
 const listeners=new Map(),timers=new Map(),intervals=new Map();let seq=0,client,stops=0;
 const lifecycle={active:true,subscribe(c){client=c;return()=>{};}};
 const G={audio:{loop(){return{stop(){stops++;},set(){}};}},music:{play(){}},match:{mode:'boss'}};
 const on=(k,f)=>listeners.set(k,f),emit=(k,e)=>listeners.get(k)?.(e);
 const context=vm.createContext({console,performance:{now:()=>0},setTimeout:f=>{timers.set(++seq,f);return seq;},clearTimeout:n=>timers.delete(n),setInterval:f=>{intervals.set(++seq,f);return seq;},clearInterval:n=>intervals.delete(n)});
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/audio/bossAudio.js',import.meta.url),'utf8');
 const source=adaptBuildSource('src/audio/bossAudio.js',raw),module=new vm.SourceTextModule(source,{context});
 const deps=new vm.SyntheticModule(['G','on','getPlatformLifecycle'],function(){this.setExport('G',G);this.setExport('on',on);this.setExport('getPlatformLifecycle',()=>lifecycle);},{context});
 await module.link(()=>deps);await module.evaluate();module.namespace.installBossAudio();
 const boss={pos:{x:0,y:0,z:0}};emit('boss:spawn',{boss});emit('boss:move',{id:'sweep',phase:'act',dur:2,boss});
 assert.equal(timers.size,1);assert.equal(intervals.size,1);
 lifecycle.active=false;client.suspend();assert.equal(intervals.size,0);assert.equal(timers.size,1);
 lifecycle.active=true;client.resume();client.resume();assert.equal(intervals.size,1);
 emit('boss:move',{id:'sweep',phase:'rec',boss});assert.equal(timers.size,0);assert.equal(intervals.size,0);assert.equal(stops,1);
});

test('lightmap decode overlaps navigation, joins before publish, and releases on construction failure',async()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8'),code=adaptBuildSource('src/main.js',raw);
 const start=code.indexOf('    let level, lightmap, physics, nav, pendingLightmap;'),end=code.indexOf('    const { nextTexlib, oldTexlib }',start);
 assert(start>=0&&end>start);
 const run=new Function('Level','Physics','NavGraph','MAP_LAYOUTS','layoutId','colliders','lightmapMetadata','worldCurrent','props','return (async()=>{'+code.slice(start,end)+'return {level,lightmap,nav};}).call(this)');
 for(const failing of [false,true]){
  let resolveLight,resolveNav,disposed=0,propsDisposed=0,lightStarted=0,navStarted=0;
  const texture={dispose(){disposed++;}},owner={_loadLightmap(){lightStarted++;return new Promise(r=>resolveLight=r);}},error=Error('nav failed');
  const nav={createLegacy(){navStarted++;assert.equal(lightStarted,1);return new Promise((resolve,reject)=>resolveNav=()=>failing?reject(error):resolve({valid:true}));}};
  const pending=run.call(owner,class{},class{},nav,{fixture:{}},'fixture',[],null,()=>true,{dispose(){propsDisposed++;}});
  assert.equal(navStarted,1);let settled=false;pending.then(()=>settled=true,()=>settled=true);resolveNav();await Promise.resolve();assert.equal(settled,false,'unfinished texture task is owned until settlement');
  resolveLight(texture);
  if(failing){await assert.rejects(pending,e=>e===error);assert.equal(disposed,1);assert.equal(propsDisposed,1);}
  else{assert.equal((await pending).lightmap,texture);assert.equal(disposed,0);assert.equal(propsDisposed,0);}
 }
});

test('full production audio composition retains existing emitter cleanup and recorded-score shortcut owners',()=>{
 const compose=rel=>adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'));
 const audio=compose('src/audio/audio.js'),music=compose('src/audio/music.js');
 assert.doesNotThrow(()=>new vm.SourceTextModule(audio));assert.doesNotThrow(()=>new vm.SourceTextModule(music));
 const dispose=audio.slice(audio.indexOf('    v.ondispose = () => {'),audio.indexOf('    v.finish();',audio.indexOf('    v.ondispose = () => {')));
 assert.match(dispose,/at = list.indexOf\(voice\)/);assert.match(dispose,/this.byName.get\(emitterKey\) === list\) this.byName.delete\(emitterKey\)/);
 assert.doesNotMatch(dispose,/this.byName.get\(name\)/);
 assert.match(music,/const song = !this.offline && typeof window !== 'undefined' && FILE_TRACK_URLS\[track\] \? \{ \.\.\.SONGS\[track\], id: track \} : getSong\(track\)/);
});
