import test from 'node:test';
import assert from 'node:assert/strict';
import {startMusicClock,stopMusicClock,MUSIC_TICK_MS} from '../music-clock.mjs';
import {installMusicIdle} from '../music-idle.mjs';
function fixture({failConstruct=false,failPost=false,noWorker=false}={}){
 let next=0;const workers=[],urls=new Set(),intervals=new Map(),timeouts=new Map();
 class Worker {
  constructor(url){if(failConstruct)throw Error('construct');this.url=url;this.terminated=0;this.messages=[];workers.push(this);}
  postMessage(value){this.messages.push(value);if(failPost&&value>0)throw Error('post');}
  terminate(){this.terminated++;}
 }
 const env={Worker:noWorker?undefined:Worker,Blob:class{},URL:{createObjectURL(){const u='blob:'+next++;urls.add(u);return u;},revokeObjectURL(u){urls.delete(u);}},
  setInterval(fn,ms){assert.equal(ms,25);const id=next++;intervals.set(id,fn);return id;},clearInterval(id){intervals.delete(id);},
  setTimeout(fn,ms){assert.equal(ms,5000);const id=next++;timeouts.set(id,fn);return id;},clearTimeout(id){timeouts.delete(id);}};
 const engine={worker:null,timer:null,ticks:0,_tick(){this.ticks++;}};
 return {env,engine,workers,urls,intervals,timeouts};
}
test('healthy Worker preserves 25 ms message and five-second URL grace',()=>{
 const f=fixture();startMusicClock(f.engine,f.env);const w=f.workers[0];
 assert.equal(MUSIC_TICK_MS,25);assert.deepEqual(w.messages,[25]);assert.equal(f.urls.size,1);
 w.onmessage();assert.equal(f.engine.ticks,1);assert.equal(f.intervals.size,0);
 [...f.timeouts.values()][0]();assert.equal(f.urls.size,0);assert.equal(w.terminated,0);
 stopMusicClock(f.engine);assert.equal(w.terminated,1);assert.equal(f.timeouts.size,0);
});
test('error terminates old Worker before one fallback, rejects duplicate errors and late ticks',()=>{
 const f=fixture();startMusicClock(f.engine,f.env);const w=f.workers[0],error=w.onerror,oldTick=w.onmessage;
 error();assert.equal(w.terminated,1);assert.equal(f.engine.worker,null);
 assert.equal(w.onmessage,null);assert.equal(w.onerror,null);assert.equal(f.urls.size,0);assert.equal(f.intervals.size,1);
 error();oldTick();assert.equal(f.engine.ticks,0);assert.equal(f.intervals.size,1);assert.equal(w.terminated,1);
 stopMusicClock(f.engine);oldTick();error();assert.equal(f.engine.ticks,0);assert.equal(f.intervals.size,0);
});
for(const reason of ['construct','post','unsupported'])test('exception-safe fallback: '+reason,()=>{
 const f=fixture({failConstruct:reason==='construct',failPost:reason==='post',noWorker:reason==='unsupported'});
 startMusicClock(f.engine,f.env);assert.equal(f.intervals.size,1);assert.equal(f.urls.size,0);
 for(const w of f.workers){assert.equal(w.terminated,1);assert.equal(w.onmessage,null);}
 [...f.intervals.values()][0]();assert.equal(f.engine.ticks,1);
 stopMusicClock(f.engine);assert.equal(f.intervals.size,0);assert.equal(f.engine.timer,null);
});
test('old generation cannot stop or replace a new engine clock',()=>{
 const f=fixture();startMusicClock(f.engine,f.env);const old=f.workers[0],error=old.onerror,tick=old.onmessage;
 stopMusicClock(f.engine);startMusicClock(f.engine,f.env);const live=f.workers[1];
 error();tick();assert.equal(f.engine.worker,live);assert.equal(live.terminated,0);assert.equal(f.intervals.size,0);
 live.onmessage();assert.equal(f.engine.ticks,1);stopMusicClock(f.engine);
});
test('idle installer still stops on mute, empty players and dispose without changing pumps',()=>{
 const f=fixture();
 class Engine {
  constructor(){this.ctx={};this.players=[];this.worker=null;this.timer=null;this.ticks=0;this.offline=false;}
  _startTimer(){throw Error('unsafe scheduler must be replaced');}
  _tick(){this.ticks++;}
  play(id){this.current={id};this.players.push({dispose(){}});}
  dispose(){this.players.length=0;this.ctx=null;}
 }
 installMusicIdle(Engine,f.env);const m=new Engine();m.play('battle');
 const error=m.worker.onerror;m.worker.onmessage();assert.equal(m.ticks,1);
 m.setMusicEnabled(false);error();assert.equal(m.worker,null);assert.equal(f.intervals.size,0);
 m.setMusicEnabled(true);assert.equal(m.current.id,'battle');assert(m.worker);
 m.players.length=0;m.worker.onmessage();assert.equal(m.worker,null);
 m.play('menu');const late=m.worker.onerror;m.dispose();late();assert.equal(f.intervals.size,0);assert.equal(f.urls.size,0);
});
test('offline scheduling remains caller-driven',()=>{
 const f=fixture();class Offline{constructor(){this.ctx={};this.players=[{}];this.offline=true;}play(){}_tick(){this.ticks=(this.ticks||0)+1;}dispose(){}}
 installMusicIdle(Offline,f.env);const m=new Offline();m._startTimer();m._tick();
 assert.equal(f.workers.length,0);assert.equal(f.intervals.size,0);assert.equal(m.ticks,1);
});
