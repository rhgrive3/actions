import test from 'node:test';import assert from 'node:assert/strict';
import {installMusicIdle} from '../music-idle.mjs';
function fixture(){let starts=0,stops=0;class Music {constructor(){this.ctx={};this.players=[];this.current=null;this.time=0;}now(){return this.time;}play(){} _tick(){for(const p of this.players)p.pump?.();} _startTimer(){starts++;this.worker={terminate(){stops++;}};}dispose(){}}installMusicIdle(Music,{clearInterval(){}});return{Music,starts:()=>starts,stops:()=>stops};}
test('healthy streamed-only playback owns no procedural clock; procedural reentry restarts it immediately',()=>{
 const f=fixture(),m=new f.Music(),stream={element:{paused:false},disposed:false,stopAt:Infinity,pump(){throw Error('no scheduled pump should be needed');}};m.players.push(stream);m.current=stream;m._startTimer();assert.equal(f.starts(),0);assert.equal(m.worker??null,null);
 const procedural={disposed:false,pump(){}};m.players.push(procedural);m._startTimer();assert.equal(f.starts(),1);
 m.players.pop();stream.pump=()=>{};m._tick();assert.equal(f.stops(),1);assert.equal(m.worker,null);assert.equal(m.current,stream);
});
test('retired stream releases only after pause and audio fade time, while primed START media stays owned',()=>{
 const f=fixture(),m=new f.Music();let disposed=0;const p={element:{paused:false},stopAt:2,dispose(){this.disposed=true;disposed++;}};m.players.push(p);m.current=p;m.time=3;
 assert.equal(m.retireStream(p),false);p.element.paused=true;m.time=1;assert.equal(m.retireStream(p),false);m.time=2;
 m._preloadedFile={player:p};assert.equal(m.retireStream(p),false);m._preloadedFile=null;assert.equal(m.retireStream(p),true);assert.equal(disposed,1);assert.equal(m.players.length,0);assert.equal(m.current,null);assert.equal(m.retireStream(p),false);
});
