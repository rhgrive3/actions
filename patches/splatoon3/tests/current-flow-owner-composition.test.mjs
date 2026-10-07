import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';import {adaptIssue427} from '../issue-427-adapter.mjs';
const ready=()=>fixture({adaptRuntime:adaptIssue427});
const actors=f=>{const a=f.make(),v=f.make(),h=f.make();a.team=h.team=0;v.team=1;v.remote=true;a.netLife=h.netLife=2;v.netLife=3;f.G.match.mode='turf';return{a,v,h};};
const ack=(f,a,v,o={})=>f.emit('combat:confirmed',{attacker:a,victim:v,damage:0,killed:true,victimLife:3,helperLife:2,...o});
test('current Flow keeps cap/decay/local death persistence while accepted ACK awards one local splat',async()=>{
 const f=await ready(),{a,v}=actors(f);f.emit('turf',{actor:a,area:1e9});assert.equal(a.s3.flow.score,6);ack(f,a,v);assert.equal(a.s3.flow.active,true);const remain=a.s3.flow.remaining;ack(f,a,v);assert.equal(a.s3.flow.remaining,remain,'duplicate cannot extend active Flow');
 const x=f.make();x.s3.flow.score=2;x.s3.flow.idleTime=0;f.advanceFlow(x.s3.flow,1,f.profile.flow);assert.ok(x.s3.flow.score<2);const before=x.s3.flow.score;f.G.level.spawnPads=[new f.THREE.Vector3(),new f.THREE.Vector3()];f.G.physics.groundProbe=(...args)=>Object.assign(args.at(-1),{hit:false});x.respawn();assert.equal(x.s3.flow.score,before,'respawn preserves current progress');f.emit('splatted',{victim:x,attacker:null,cause:'water'});assert.ok(x.s3.flow.score<before,'local environmental death penalty stays installed');
});
test('stale victim/helper epochs and remote proxy ACKs cannot change progress',async()=>{
 const f=await ready(),{a,v}=actors(f);for(const o of [{victimLife:2},{helperLife:1}])ack(f,a,v,o);assert.equal(a.s3.flow.score,0);a.remote=true;ack(f,a,v);f.emit('turf',{actor:a,area:1e6});assert.equal(a.s3.flow.score,0);a.remote=false;ack(f,a,v);assert.equal(a.s3.flow.score,f.profile.flow.weights.splat);ack(f,a,v);assert.equal(a.s3.flow.score,f.profile.flow.weights.splat);
});
test('terminal-before-ACK and ACK-before-terminal award a local helper once and preserve authoritative assist stats',async()=>{
 for(const order of ['terminal-first','ack-first']){
  const f=await ready(),{a,v,h}=actors(f);f.emit('damage',{victim:v,attacker:h,amount:5,source:'shooter'});
  const terminal=()=>f.emit('combat:terminal',{victim:v,attacker:a,victimLife:3});
  if(order==='terminal-first')terminal();ack(f,a,v);v.stats.deaths++;terminal();ack(f,a,v);
  assert.equal(h.stats.assists,1,order);assert.equal(h.s3.flow.score,f.profile.flow.weights.assist,order);assert.equal(a.s3.flow.score,f.profile.flow.weights.splat,order);
 }
});
test('accepted native assists count for a dead local helper without granting dead Flow or proxy progression',async()=>{
 const f=await ready(),{a,v,h}=actors(f);a.nid=11;v.nid=12;h.nid=13;h.alive=false;
 // An unqualified helper list is no longer an accepted life receipt.
 f.emit('splatted',{victim:v,attacker:a,assists:[h],cause:'shooter'});assert.equal(h.stats.assists,0);assert.equal(h.s3.flow.score,0);
 const proxy=f.make();proxy.nid=14;proxy.netLife=2;proxy.remote=true;
 const sender=Object.create(f.NetMatch.prototype);let payload;sender._rec=row=>{payload=JSON.parse(JSON.stringify(row[2]));};
 f.G.netm=sender;v.remote=false;
 try{sender._onLocalEvent('splatted',{victim:v,attacker:a,assists:[h,h,proxy],cause:'shooter'});}finally{v.remote=true;f.G.netm=null;}
 assert.deepEqual(payload.assists,[13,13,14]);assert.equal(payload.assistLives[13],h.netLife);assert.equal(payload.assistLives[14],proxy.netLife);
 const receiver=Object.create(f.NetMatch.prototype);receiver.byNid=new Map([[11,a],[12,v],[13,h],[14,proxy]]);v.net={buf:[],tp:0};
 receiver._playEvent('splatted',payload);assert.equal(h.stats.assists,1);assert.equal(h.s3.flow.score,0);assert.equal(proxy.stats.assists,0);assert.equal(proxy.s3.flow.score,0);
 receiver._playEvent('splatted',payload);f.emit('splatted',{victim:v,attacker:a,assists:[h],assistLives:payload.assistLives,cause:'shooter'});assert.equal(h.stats.assists,1,'native and direct consumer replay cannot duplicate accepted assist stats');
});
test('respawn retirement admits a new accepted victim life and rejects the previous one',async()=>{
 const f=await ready(),{a,v}=actors(f);ack(f,a,v);const first=a.s3.flow.score;v.netLife=4;f.emit('combat:respawn',{actor:v});ack(f,a,v);assert.equal(a.s3.flow.score,first);ack(f,a,v,{victimLife:4});assert.equal(a.s3.flow.score,first+f.profile.flow.weights.splat);
});
test('modern adapter keeps cap/death/assist owners and remains fail-closed on repeat',()=>{
 const raw=fs.readFileSync(new URL('../runtime/flow.mjs',import.meta.url),'utf8'),code=adaptIssue427('patches/splatoon3/runtime/flow.mjs',raw);for(const keep of ['Math.min(cap, state.score + gain)','respawning.get(this)','penalizeFlowDeath(state(victim), cause, cfg)','Array.isArray(event.assists)'])assert.ok(code.includes(keep));assert.throws(()=>adaptIssue427('patches/splatoon3/runtime/flow.mjs',code),/patch conflict/);
});
