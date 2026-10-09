import test from 'node:test';
import assert from 'node:assert/strict';
import {pair,advanceMillis} from './hidden-host-harness.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('Refs878 same host resumes after 0.1/5/20/120 seconds without physics or G.time catch-up',async()=>{
 for(const seconds of [.1,5,20,120]){const p=await pair();try{const before=p.host.snapshot(),time=p.host.f.G.time;p.host.hide(true);p.frames(seconds);assert.equal(p.host.m.time,seconds>=10?0:10);assert.equal(p.host.snapshot().physics,before.physics);assert.equal(p.host.snapshot().raf,0);if(seconds>=10){assert.equal(p.guest.m.time,0);assert.equal(p.host.m.state,'finish','hidden authoritative host ends at its deadline');assert.equal(p.guest.m.state,'finish','existing host event reaches guest before visibility resume');}p.host.hide(false);close(p.host.m.time,Math.max(0,10-seconds));assert.equal(p.host.m.state,seconds>=10?'finish':'playing');if(seconds>=10)assert.equal(p.guest.m.state,'finish','native host-state event reaches follower on resume');assert.equal(p.host.f.G.time,time);assert.equal(p.host.snapshot().physics,before.physics);assert.equal(p.host.game.s3Clock?.accumulator??0,0);}finally{p.close();}}
});
test('Refs878 repeated short switches and duplicate visibility delivery consume each interval once',async()=>{const p=await pair();try{for(let i=0;i<3;i++){p.host.hide(true);advanceMillis(100);p.host.hide(false);const t=p.host.m.time;p.host.hide(false);p.host.env.dispatchEvent(new Event('focus'));close(p.host.m.time,t);}close(p.host.m.time,9.7);assert.equal(p.host.game.platform.hiddenHostClock,null);}finally{p.close();}});
test('Refs878 already-finished match is never re-timed on resume',async()=>{const p=await pair();try{p.host.hide(true);p.host.m.setState('finish');advanceMillis(5000);p.host.hide(false);assert.equal(p.host.m.state,'finish');assert.equal(p.host.m.time,10);}finally{p.close();}});
test('Refs878 replacement match or NetMatch is not touched by an old suspended record',async()=>{for(const kind of ['match','net']){const p=await pair();try{p.host.hide(true);advanceMillis(5000);if(kind==='match')p.host.game.match=new p.host.f.Match({duration:90});else p.host.f.G.netm={};p.host.hide(false);assert.equal(p.host.m.time,10);if(kind==='match')assert.equal(p.host.game.match.time,90);}finally{p.close();}}});
test('Refs878 owner change and real relay disconnect/migration invalidate the old host record',async()=>{const p=await pair();try{p.host.hide(true);p.frames(5);p.host.socket.close();p.frames(6);assert.equal(p.guest.s.isHost,true);assert.equal(p.guest.m.follower,false);assert.equal(p.guest.m.state,'finish');p.host.hide(false);assert.equal(p.host.m.time,10);assert.equal(p.host.s.state,'error');assert.equal(p.host.snapshot().aborted,1);}finally{p.close();}const q=await pair();try{q.host.hide(true);advanceMillis(5000);q.host.s.hostId=q.guest.s.myId;q.host.hide(false);assert.equal(q.host.m.time,10);}finally{q.close();}});
test('Refs878 excludes guest, offline, Boss, attract and paused scopes',async()=>{for(const kind of ['guest','offline','boss','attract','paused']){const p=await pair();try{const h=kind==='guest'?p.guest:p.host;if(kind==='offline')h.s.state='offline';if(kind==='boss')h.m.mode='boss';if(kind==='attract')h.m.attract=true;if(kind==='paused')h.m.paused=true;h.hide(true);advanceMillis(5000);h.hide(false);assert.equal(h.m.time,10,kind);}finally{p.close();}}});
test('Refs878 invalid/reversed monotonic time cannot increase or invent elapsed time',async()=>{for(const kind of ['reverse','invalid']){const p=await pair();try{p.host.hide(true);if(kind==='reverse')advanceMillis(-1000);else p.host.env.performance.now=()=>NaN;p.host.hide(false);assert.equal(p.host.m.time,10);}finally{p.close();}}});
test('Refs878 legitimate separate clock advance cannot be rolled back or subtracted twice',async()=>{const p=await pair();try{p.host.hide(true);p.host.m.time=3;advanceMillis(1000);p.host.hide(false);assert.equal(p.host.m.time,3);p.host.hide(false);assert.equal(p.host.m.time,3);}finally{p.close();}});

test('Refs878 hidden deadline is invalidated by replacement, pause, mode and host identity',async()=>{for(const kind of ['match','net','paused','range','owner','menu']){const p=await pair();try{p.host.hide(true);if(kind==='match')p.host.game.match=new p.host.f.Match({duration:90});if(kind==='net')p.host.f.G.netm={};if(kind==='paused')p.host.m.paused=true;if(kind==='range')p.host.m.mode='range';if(kind==='owner')p.host.s.hostId=p.guest.s.myId;if(kind==='menu')p.host.f.G.mode='menu';p.frames(11,[]);assert.equal(p.host.m.state,'playing',kind);assert.equal(p.host.m.time,10,kind);assert.equal(p.guest.m.state,'playing',kind);}finally{p.close();}}});
test('Refs878 early timer delivery re-arms only the remaining deadline and disposal clears it',async()=>{const p=await pair();try{p.host.hide(true);const saved=p.host.game.platform.hiddenHostClock;p.host.env.performance.now=()=>saved.at+5000;p.frames(10,[]);assert.equal(p.host.m.state,'playing');assert.equal(p.host.timerCount(),1);p.host.env.performance.now=()=>saved.at+15000;p.frames(5.1,[]);assert.equal(p.host.m.state,'finish');assert.equal(p.guest.m.state,'finish');assert.equal(p.host.timerCount(),0);}finally{p.close();}const q=await pair();q.host.hide(true);assert.equal(q.host.timerCount(),1);q.close();assert.equal(q.host.timerCount(),0);});

test('Refs878 visible follower ends at its authoritative clock zero for 5/20/120s host hiddens even when the hidden host never delivers a deadline',async()=>{
 for(const seconds of [5,20,120]){const p=await pair();try{
  const hostBefore=p.host.snapshot(),guestBefore=p.guest.snapshot();
  p.host.env.setTimeout=()=>0;                 // hidden host page cannot schedule or deliver its own deadline
  p.host.hide(true);
  p.frames(Math.max(11,seconds));
  assert.equal(p.guest.m.time,0,`${seconds}s guest clock reaches the authoritative zero`);
  assert.equal(p.guest.m.state,'finish',`${seconds}s visible follower ends at the authoritative end epoch`);
  assert.equal(p.guest.m.follower,true);assert.equal(p.guest.s.isHost,false);
  assert.ok(p.guest.snapshot().physics>guestBefore.physics,'visible follower keeps its own bounded frame physics');
  assert.equal(p.host.m.state,'playing',`${seconds}s frozen hidden host never delivered finish`);
  assert.equal(p.host.m.time,10);
  assert.equal(p.host.snapshot().physics,hostBefore.physics,'hidden host advances no physics');
  p.host.hide(false);
  assert.equal(p.host.m.time,0);assert.equal(p.host.m.state,'finish');
  assert.equal(p.host.snapshot().physics,hostBefore.physics,'host resume does not replay the hidden interval');
  assert.equal(p.guest.m.state,'finish','follower finish survives the host resume');
 }finally{p.close();}}
});
