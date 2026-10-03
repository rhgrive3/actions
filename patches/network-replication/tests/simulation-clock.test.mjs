import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';

// A render hitch can execute several 60 Hz physics ticks at one wall timestamp.
// The event's tick identifies its birth within that batch, not receipt age.
test('multi-tick render hitch retains owner birth and completed physics steps',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'me',vertical:true});f.bind(nm,[a]);
 f.G.time=10;f.projectiles.fireFlick(a,a.weapon);const p=f.projectiles.list[0],birth=JSON.parse(JSON.stringify(nm.out[0]));
 for(let i=0;i<5;i++){f.G.time=10+i/60;f.projectiles.update(1/60);}
 const position=p.pos.clone(),velocity=p.vel.clone(),age=p.age;let packet;nm.s.tr.broadcast=m=>packet=JSON.parse(JSON.stringify(m));nm._sendTick();
 assert.equal(packet.u,604);assert.equal(birth.at(-2),600);f.projectiles.clear();a.remote=true;a.owner='p2';nm.peers.clear();nm.onMessage('p2',packet);const peer=nm.peers.get('p2');peer.tr=packet.ts;nm.update(0);f.projectiles.update(1/60);
 const q=f.projectiles.list[0];assert(q.ghost);assert.equal(q._netSteps,5);assert.equal(q.age,age);assert(q.pos.distanceTo(position)<.001);assert(q.vel.distanceTo(velocity)<.01);
 // Advancing the recipient alone cannot invent an owner physics tick.
 const frozen=q.pos.clone();for(let i=0;i<30;i++){f.clock.advance(1/60);nm.update(1/60);f.projectiles.update(1/60);}assert.equal(q._netSteps,5);assert.deepEqual(q.pos.toArray(),frozen.toArray());
});
test('invalid timestamp cannot poison timeline or hide a later legitimate event',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'p2',remote:true});f.bind(nm,[a]);
 nm.onMessage('p2',{k:'t',ts:NaN,u:3,e:[[NaN,'p',0]]});assert.equal(nm.peers.size,0);
 nm.onMessage('p2',{k:'t',ts:1000,u:0,r:2,e:[[NaN,'p',0,0,1]]});assert.equal(nm.peers.get('p2').events.length,0);
});
test('owner actor hit retires ghost at hit tick and keeps remote damage zero',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'p2',remote:true,roller:false});f.bind(nm,[a]);
 const peer={tr:1000.2,sim:6};nm.peers.set('p2',peer);let bursts=0;f.G.fx={burst(){bursts++;}};
 const birth=[1000,'p',0,'shot','shooter',0,3,0,0,0,60,0,1,99,.1,.1,0,0,0,0,.1,.8,1.3,.03,26,.3,3,0,.123,1];birth._netTick=0;nm._play('p2',birth);
 const p=f.projectiles.list[0];assert.equal(p.damage,0);const end=[1000.05,'pe',0,1,1,0,3,4];end._netTick=3;nm._play('p2',end);f.projectiles.update(1/60);
 assert.equal(p._netSteps,4);assert.equal(bursts,1);assert.equal(f.projectiles.list.length,0);
});

test('slam visual event retains owner position/radius and duplicate playback is harmless',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'p2',remote:true,roller:false});f.bind(nm,[a]);nm.peers.set('p2',{tr:1000});
 const explosions=[];f.G.fx={explosion(pos,_color,radius){explosions.push({pos:[...pos.toArray()],radius});}};
 nm._rec(['ev','special:slam',{actor:{n:0},pos:[1,2,3],radius:7}]);const e=nm.out.pop();nm._play('p2',e);nm._play('p2',e);
 assert.equal(explosions.length,1);assert.deepEqual(explosions[0],{pos:[1,2.3,3],radius:7});
});

// Wall timestamps alone put the terminal at tick 4 on interpolated tick 2.
test('render-batch terminal waits for its owner physics tick before playback',async()=>{
 const f=await fixture(),nm=f.makeNetMatch(f.makeSession()),a=f.makeActor({nid:0,owner:'p2',remote:true});f.bind(nm,[a]);
 const peer={tr:1000.02,sim:2,events:[]};nm.peers.set('p2',peer);const e=[1000.02,'pe',0,1,0];e._netTick=4;peer.events.push(e);
 let played=0;nm._play=()=>played++;nm._playEvents();assert.equal(played,0);assert.equal(peer.events.length,1);
 peer.sim=4;nm._playEvents();assert.equal(played,1);assert.equal(peer.events.length,0);
});
