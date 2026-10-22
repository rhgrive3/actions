import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
let wall=100;
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>wall*1000},extraExports:`
 export {NetSession} from './inkwave-public/src/net/session.js';
 export {Transport} from './inkwave-public/src/net/transport.js';
 export {nativeChargerInputStatus,validNativeChargerInputPacket} from './patches/splatoon3/runtime/native-charger-input.mjs';
`});
f.context.crypto=webcrypto;
function setup(count=1){
 f.G.projectiles.clear();f.G.actors=[];f.G.time=0;wall=100;
 const actors=Array.from({length:count},(_,i)=>Object.assign(f.make('charger'),{nid:77+i,owner:'A',netLife:3}));
 const s=new f.NetSession();Object.assign(s,{myId:'A',hostId:'A',state:'match'});s._members.set('A',{});s._members.set('B',{});
 const n=new f.NetMatch(s,{id:'input-test',map:'reef'}),m={id:'input-test',state:'playing',time:180,actors,playing:()=>true,canRespawn:()=>false};n.bind(m);s.match=n;f.G.netm=n;f.G.match=m;
 const tr=new f.Transport(),frames=[];s.tr=tr;tr.ws={readyState:1,bufferedAmount:0,send(raw){frames.push(raw)},close(){}};
 let errors=0;s.on('error',()=>errors++);f.G.game={netMatchAborted(){}};
 const step=(dt=1/60,inputs={})=>{f.G.time+=dt;wall+=dt;for(const a of actors){Object.assign(a.intent,{fire:false,sub:false,squid:false,jump:false,special:false},inputs);a.update(dt);}};
 const packets=()=>frames.filter(x=>x.startsWith('b|')).map(x=>JSON.parse(x.slice(2))).filter(x=>x.k==='t');
 return {actors,a:actors[0],s,n,tr,frames,step,packets,errors:()=>errors,status:()=>f.nativeChargerInputStatus(n,f.G),send:()=>n._sendTick(),close(){n.dispose();s.dispose?.();f.G.projectiles.clear();}};
}
for(const hz of [30,60,120])test(`actual ${hz}Hz source frames retain exact dt and order through native send`,()=>{
 const w=setup();try{
  const expected=[];for(let i=0;i<12;i++){w.step(1/hz,{fire:i<2});expected.push(f.G.time);if(i%3===2)assert.equal(w.send(),true);}
  const rows=w.packets().flatMap(p=>p.ci?.slice(1).flatMap(b=>b[3])||[]);
  assert.equal(rows.length,12);assert.deepEqual(rows.map(r=>r[0]),Array.from({length:12},(_,i)=>i+1));assert.deepEqual(rows.map(r=>r[1]),Array(12).fill(1/hz));assert.deepEqual(rows.map(r=>r[2]),expected);
  assert.equal(rows[0][3]&1,1);assert.equal(rows[2][3]&1,0);assert.ok(rows.every(r=>r[14]===1&&r[4]!==null));assert.equal(w.status().frames,0);assert.ok(w.packets().every(p=>f.validNativeChargerInputPacket(p.ci)));
 }finally{w.close();}
});
test('16.7ms R tap between 20Hz snapshots survives failed sends and one accepted retry',()=>{
 const w=setup();try{
  w.step(1/120,{sub:true});w.step(1/120,{sub:true});w.step(1/120);const before=w.status();assert.equal(before.frames,3);
  w.tr.ws.bufferedAmount=524289;assert.equal(w.send(),false);assert.equal(w.status().frames,3);
  w.step(1/120);w.tr.ws.bufferedAmount=0;assert.equal(w.send(),true);const rows=w.packets().flatMap(p=>p.ci.slice(1).flatMap(b=>b[3]));
  assert.deepEqual(rows.map(r=>r[3]&4),[4,4,0,0]);assert.deepEqual(rows.map(r=>r[0]),[1,2,3,4]);assert.equal(w.status().frames,0);
 }finally{w.close();}
});
test('partial native send retains input prefix and simultaneous source frames appended during broadcast',()=>{
 const w=setup();try{
  for(let i=0;i<3;i++)w.step();const send=w.tr.broadcast;let attempt=0;
  w.tr.broadcast=function(d){if(attempt++===0)return false;const result=send.call(this,d);if(attempt===2)w.step();return result;};
  assert.equal(w.send(),false);assert.equal(w.status().frames,3);assert.equal(w.send(),true);assert.equal(w.status().frames,1);assert.equal(w.send(),true);
  assert.deepEqual(w.packets().flatMap(p=>p.ci.slice(1).flatMap(b=>b[3].map(r=>r[0]))),[1,2,3,4]);
 }finally{w.close();}
});
test('32 local actors use bounded fair batches without starving a channel',()=>{
 const w=setup(32);try{
  for(let i=0;i<9;i++)w.step(1/120);assert.equal(w.status().frames,288);assert.equal(w.send(),true);
  const first=w.packets()[0].ci;assert.equal(first.length,33);assert.ok(first.slice(1).every(b=>b[3].length>=7));assert.ok(JSON.stringify(first).length<=24*1024);
  while(w.status().frames)assert.equal(w.send(),true);const counts=new Map();for(const p of w.packets())for(const b of p.ci.slice(1))counts.set(b[0],(counts.get(b[0])||0)+b[3].length);
  assert.equal(counts.size,32);assert.ok([...counts.values()].every(c=>c===9));
 }finally{w.close();}
});
test('input plus large event envelope reduces retained prefixes until final packet fits',()=>{
 const w=setup(32);try{
  for(let i=0;i<12;i++)w.step(1/120);for(let i=0;i<200;i++)w.n._rec(['tr',77,'jump',{payload:'x'.repeat(260)}]);
  let attempts=0;while(w.status().frames||w.n.out.length){assert.ok(++attempts<20);w.send();}
  assert.equal(w.errors(),0);assert.ok(w.packets().every(p=>Buffer.byteLength('b|'+JSON.stringify(p))<=65536));assert.equal(w.packets().reduce((c,p)=>c+(p.e?.length||0),0),200);
  assert.equal(w.packets().reduce((c,p)=>c+(p.ci?.slice(1).reduce((s,b)=>s+b[3].length,0)||0),0),384);
 }finally{w.close();}
});
test('native input overflow aborts once rather than silently dropping a source-frame gap',()=>{
 const w=setup();try{
  for(let i=0;i<520;i++)w.step(1/120);assert.equal(w.status().frames,512);assert.match(w.status().error,/backlog/);assert.equal(w.send(),false);assert.equal(w.errors(),1);assert.equal(w.n.s.match,null);assert.equal(w.send(),false);assert.equal(w.errors(),1);
 }finally{w.close();}
});
for(const change of ['life','weapon','owner','world','clear'])test(`native input lifecycle retires obsolete ${change} prefix`,()=>{
 const w=setup();try{
  w.step();assert.equal(w.status().frames,1);
  if(change==='life')w.a.netLife++;if(change==='weapon')w.a.weapon=f.WEAPONS.shooter;if(change==='owner')w.a.remote=true;if(change==='world')f.G.level={...f.G.level};if(change==='clear')f.G.projectiles.clear();
  assert.equal(w.status().frames,0);w.send();assert.equal(w.packets().at(-1).ci,undefined);
  if(change==='life'){w.step();w.send();const b=w.packets().at(-1).ci[1];assert.equal(b[1],4);assert.equal(b[3][0][0],1);}
 }finally{w.close();}
});
test('accepted send cannot consume source inputs belonging to a replacement session',()=>{
 const w=setup();try{
  w.step();const send=w.tr.broadcast;w.tr.broadcast=function(d){const accepted=send.call(this,d);w.n.s={...w.s,tr:w.tr,match:w.n};return accepted;};
  assert.equal(w.send(),false);assert.equal(w.errors(),0);assert.equal(w.packets()[0].ci[1][3].length,1);
 }finally{w.close();}
});
test('input schema rejects malformed or unbounded batches before owner timeline watermark changes',()=>{
 const w=setup();try{
  w.step();w.send();const packet=w.packets()[0],base=packet.ci;assert.equal(f.validNativeChargerInputPacket(base),true);
  for(const mutate of [p=>p[1][3][0][1]=1,p=>p[1][3][0][3]=32,p=>p[1][3][0][12]=2,p=>p[1][3].push([...p[1][3][0]]),p=>p.push(p[1]),p=>p[1][2]='shooter']){
   const ci=structuredClone(base);mutate(ci);assert.equal(f.validNativeChargerInputPacket(ci),false);
   const before=w.n.peers.get('B');w.n.onMessage('B',{...packet,ts:200,ci});assert.equal(w.n.peers.get('B'),before);
  }
 }finally{w.close();}
});
