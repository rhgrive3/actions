import test from 'node:test';
import assert from 'node:assert/strict';
import { installMusicIdle } from '../music-idle.mjs';

function fixture() {
  const timers=new Map(),listeners=new Set();let sequence=0,starts=0;
  class Music {
    constructor(){this.time=100;this.ctx={state:'suspended',addEventListener:(t,f)=>listeners.add(f),removeEventListener:(t,f)=>listeners.delete(f)};this.players=[];}
    now(){return this.time;}play(){} _tick(){} _startTimer(){starts++;}dispose(){for(const p of this.players)p.dispose();this.players=[];}
  }
  installMusicIdle(Music,{setTimeout:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),clearInterval(){}});
  const m=new Music();
  const stream=()=>({element:{paused:true},_pausedAfterFade:true,stopAt:101,disposed:false,disposals:0,dispose(){this.disposed=true;this.disposals++;}});
  return {m,stream,timers,listeners,starts:()=>starts,state(s){m.ctx.state=s;for(const f of [...listeners])f();},fire(){const [id,t]=timers.entries().next().value;timers.delete(id);t.fn();}};
}
test('suspended faded recording retires after resumed audio deadline without any BGM action or note clock',()=>{
  const f=fixture(),p=f.stream();f.m.players.push(p);f.m.current=null;
  assert.equal(f.m.retireStream(p),false);assert.equal(f.timers.size,0);assert.equal(f.listeners.size,1);
  f.state('running');assert.equal(f.timers.size,1);assert.equal(p.disposals,0);
  f.m.time=100.5;f.fire();assert.equal(p.disposals,0);assert.equal(f.timers.size,1);
  f.state('suspended');assert.equal(f.timers.size,0);
  f.m.time=101.1;f.state('running');assert.equal(p.disposals,1);assert.equal(f.m.players.length,0);
  assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);assert.equal(f.starts(),0);
});
test('new current and primed recording stay owned; dispose cancels late retirement callbacks',()=>{
  const f=fixture(),old=f.stream(),current=f.stream(),primed=f.stream();
  current.element.paused=false;current._pausedAfterFade=false;current.stopAt=Infinity;
  f.m.players.push(old,current,primed);f.m.current=current;f.m._preloadedFile={player:primed};
  f.m.retireStream(old);f.m.time=102;f.state('running');assert.equal(old.disposals,1);
  assert.equal(current.disposals,0);assert.equal(primed.disposals,0);assert.equal(f.m.current,current);
  const pending=f.stream();pending.stopAt=105;f.m.players.push(pending);f.m.retireStream(pending);
  const late=[...f.timers.values()][0].fn;f.m.dispose();late();
  assert.equal(pending.disposals,1);assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
});
test('a closed AudioContext cannot retain a faded paused stream or state listener',()=>{
  const f=fixture(),old=f.stream(),primed=f.stream();f.m.players.push(old,primed);f.m._preloadedFile={player:primed};
  f.m.retireStream(old);f.state('closed');
  assert.equal(old.disposals,1);assert.equal(primed.disposals,0);assert.equal(f.listeners.size,0);assert.equal(f.timers.size,0);
});
