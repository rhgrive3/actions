import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';
import {createFlow, advanceFlow} from '../runtime/flow.mjs';
import {FixedClock} from '../runtime/clock.mjs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
const cfg = JSON.parse(fs.readFileSync(new URL('../profile.json', import.meta.url))).flow;
const scale = cfg.threshold / cfg.progress.referenceThreshold;
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
const inactive = (fp=50,idleTime=4.5) => ({...createFlow(),score:fp*scale,idleTime});
async function world(legacy=false) {
  const f=await fixture({adaptRuntime:(rel,s)=>legacy&&rel.endsWith('/runtime/flow.mjs')
    ? s.replace('if (wasActive || !cfg?.progress) return;', 'if (wasActive || !alive || !cfg?.progress) return;'):s});
  f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3(0,0,20)];
  f.G.physics.groundProbe=(_x,_y,_z,_r,_d,_foot,h)=>{h.hit=false;return h;};
  f.G.match.canRespawn=()=>false;
  const a=f.make(),enemy=f.make();enemy.team=1;return {...f,a,enemy};
}
test('dead inactive decay splits the existing fast boundary and clamps without changing invalid-time behavior',()=>{
  const s=inactive(50,4.75);advanceFlow(s,.5,cfg,false);
  near(s.score,(50-.25*cfg.progress.decayPerSecond-.25*cfg.progress.fastDecayPerSecond)*scale);near(s.idleTime,5.25);
  advanceFlow(s,100,cfg,false);near(s.score,0);
  const before={...s};for(const dt of [0,-1,NaN,Infinity])advanceFlow(s,dt,cfg,false);assert.deepEqual(s,before);
});
test('actual death penalizes once, advances dead progress, and respawn preserves the same state',async()=>{
  for(const cause of ['weapon','water','fall']){
    const f=await world(),a=f.a;a.s3.flow=inactive();const state=a.s3.flow;
    const penalty=cause==='weapon'?cfg.progress.deathPenalty:cfg.progress.environmentDeathPenalty;
    a.splat(f.enemy,cause);a.splat(f.enemy,cause);near(state.score,(50-penalty)*scale);
    f.tick(a,60);near(state.score,(50-penalty-.5*cfg.progress.decayPerSecond-.5*cfg.progress.fastDecayPerSecond)*scale);near(state.idleTime,5.5);
    a.respawn();assert.equal(a.s3.flow,state);near(state.idleTime,5.5);
  }
});
test('negative control: the former dead guard freezes both score and idle clock',async()=>{
  const f=await world(true),a=f.a;a.s3.flow=inactive();a.splat(f.enemy,'weapon');const before={...a.s3.flow};f.tick(a,60);
  assert.deepEqual(a.s3.flow,before);
});
test('dead actors receive no turf, damage, splat or assist Flow gains',async()=>{
  const f=await world(),a=f.a,killer=f.make();a.s3.flow=inactive();a.splat(f.enemy,'weapon');f.tick(a,60);const before={...a.s3.flow};
  f.emit('turf',{actor:a,area:10000});f.emit('damage',{attacker:a,victim:f.enemy,amount:100,source:'shooter'});
  f.emit('splatted',{attacker:a,victim:f.enemy,cause:'weapon'});
  f.emit('splatted',{attacker:killer,victim:f.enemy,cause:'weapon',assists:[a]});
  assert.deepEqual(a.s3.flow,before);
});
test('active duration still advances through death and cannot be extended by dead awards',async()=>{
  const f=await world(),a=f.a;a.s3.flow={...createFlow(),active:true,remaining:2};a.splat(f.enemy,'weapon');
  f.tick(a,60);near(a.s3.flow.remaining,1);near(a.s3.flow.idleTime,0);
  f.emit('splatted',{attacker:a,victim:f.enemy,cause:'weapon'});near(a.s3.flow.remaining,1);
  f.tick(a,61);assert.equal(a.s3.flow.active,false);near(a.s3.flow.remaining,0);
});
test('30/60/120 Hz fixed schedules share the same dead inactive trace',async()=>{
  const traces=[];for(const hz of [30,60,120]){
    const f=await world(),a=f.a,clock=new FixedClock(),trace=[];a.s3.flow=inactive();a.splat(f.enemy,'weapon');
    for(let i=0;i<hz*6;i++)clock.advance(1/hz,()=>{f.tick(a);trace.push([a.s3.flow.score,a.s3.flow.idleTime]);});traces.push(trace);
  }assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});
test('native Match dispatch advances the owner once while the dead proxy uses applyRemote',async()=>{
  const f=await world(),owner=f.a,proxy=f.make();owner.s3.flow=inactive();owner.splat(f.enemy,'weapon');proxy.alive=false;proxy.remote=true;proxy.s3.flow={...owner.s3.flow};
  proxy.net={ready:true,cur:{}};proxy.anim={};proxy.respawnTimer=10;
  const root=new URL('../../../inkwave-public/',import.meta.url);
  const match=fs.readFileSync(new URL('src/game/match.js',root),'utf8');
  const dispatch=match.match(/for \(const a of this\.actors\) \{ if \(a\.remote && nm\) nm\.applyRemote\(a, dt\); else a\.update\(dt\); \}/)?.[0];assert.ok(dispatch);
  const net=fs.readFileSync(new URL('src/net/netmatch.js',root),'utf8');
  const ast=parse(net,{ecmaVersion:'latest',sourceType:'module'});let method;
  function walk(n){if(!n||typeof n!=='object')return;if(n.type==='MethodDefinition'&&n.key.name==='applyRemote')method=net.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}
  walk(ast);assert.ok(method);
  const nm=new Function('G',`return {${method}}`)(f.G),tick=new Function('nm','dt',dispatch),before={...proxy.s3.flow};
  for(let i=0;i<60;i++)tick.call({actors:[owner,proxy]},nm,1/60);
  near(owner.s3.flow.idleTime,5.5);assert.deepEqual(proxy.s3.flow,before);near(proxy.respawnTimer,9);
  const once=owner.s3.flow.score;proxy.s3.flow={...owner.s3.flow};near(proxy.s3.flow.score,once);
});
