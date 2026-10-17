import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {readSplashdownSnapshot,interpolateSplashdownSnapshot} from '../runtime/splashdown-network.mjs';

let seconds=100;
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>seconds*1000}});
function room(){
  const {G}=f;G.time=0;G.netm=null;G.net=null;G.actors=[];G.projectiles.clear();
  const owner=f.make(),viewer=f.make();
  for(const a of [owner,viewer]){
    Object.assign(a,{nid:77,owner:'owner',netLife:3,invuln:0});
    a.weapon={...a.weapon,special:'tripleSplashdown',specialCost:100};a.special=100;
    a._resolve=()=>{};
  }
  const match={id:'splashdown-network',state:'playing',actors:[owner],playing:()=>true,canRespawn:()=>false};G.match=match;
  const makeNet=(id,actors)=>{
    const session={myId:id,hostId:'owner',isHost:id==='owner',_members:new Map([['owner','Owner'],['viewer','Viewer']]),tr:{broadcast(){},sendTo(){}}};
    const net=new f.NetMatch(session,{id:match.id,map:'map'});net.bind({...match,actors});return net;
  };
  const sender=makeNet('owner',[owner]),receiver=makeNet('viewer',[viewer]);
  const send=(time)=>{seconds=time;G.time=time-100;let packet;sender.s.tr.broadcast=p=>packet=JSON.parse(JSON.stringify(p));sender._sendTick();assert.equal(packet?.k,'t');return packet;};
  const receive=(packet,from='owner',renderTime=packet.ts)=>{
    receiver.onMessage(from,JSON.parse(JSON.stringify(packet)));
    const peer=receiver.peers.get('owner');if(!peer)return;
    peer.tr=renderTime;receiver._sample(viewer,renderTime,1/60);receiver.applyRemote(viewer,1/60);
  };
  receive(send(100));return {G,owner,viewer,sender,receiver,send,receive};
}

test('current Triple Splashdown clocks cross actual JSON NetMatch snapshots without legacy Slam or duplicate fists',()=>{
  for(const hz of [30,60,120]){
    const x=room();x.owner._startSpecial();assert.equal(x.G.projectiles._catalogueFists.length,2);
    for(let i=0;i<hz/2;i++)x.owner._updateSpecial(1/hz);
    const a=x.send(100.5);assert.equal(a.wp,undefined,'current ID never enters legacy wp');
    assert.ok(a.pg);assert.deepEqual(a.pg[77].slice(0,3),[3,x.owner.specialActive.activation,1]);x.receive(a);
    assert.equal(x.viewer.specialActive.id,'tripleSplashdown');assert.equal(x.viewer.specialActive.phase,'rise');
    assert.ok(Math.abs(x.viewer.specialActive.age-.5)<1e-8);const token=x.viewer.specialActive;
    assert.equal(x.G.projectiles._catalogueFists.length,2,'snapshot playback does not spawn fists');
    for(let i=0;i<hz/2+1;i++)x.owner._updateSpecial(1/hz);
    const b=x.send(101+1/hz);x.receive(b);
    assert.equal(x.viewer.specialActive,token,'same activation retains its Character motion token');
    assert.equal(token.phase,'drop');assert.ok(Math.abs(token.age-(1+1/hz))<1e-8);
    assert.equal(x.viewer.invuln,.1,'source-protected body advertises authoritative invulnerability');
    assert.deepEqual(Array.from(x.viewer.pos.toArray()),b.a[0].slice(1,4),'only native quantized position samples move the remote body');
    x.owner.specialActive=null;x.owner.special=0;x.receive(x.send(101.2));assert.equal(x.viewer.specialActive,null);
  }
});

test('current Splashdown sidecar rejects malformed/old-life/other-owner/other-special samples and preserves legacy wp',()=>{
  const x=room();x.owner._startSpecial();x.owner._updateSpecial(.5);
  const packet=x.send(100.5);
  const bad=JSON.parse(JSON.stringify(packet));bad.pg[77][0]=2;x.receive(bad);
  assert.equal(x.viewer.specialActive?.age,undefined,'old-life sidecar cannot supply a clock');
  // A fresh timestamp and source simulation tick makes this an admitted actor
  // row, so each negative assertion exercises the sidecar rather than replay drop.
  x.owner._updateSpecial(1/60);const malformed=x.send(100.5+1/60);malformed.pg[77][3]=Infinity;x.receive(malformed);
  assert.equal(x.viewer.specialActive?.age,undefined);
  x.owner._updateSpecial(1/60);const wrongOwner=x.send(100.5+2/60);x.receive(wrongOwner,'stranger');
  assert.equal(x.viewer.specialActive?.age,undefined);
  x.owner.specialActive=null;x.owner.weapon={...x.owner.weapon,special:'slam'};x.owner.special=100;x.owner._startSpecial();Object.assign(x.owner.specialActive,{phase:'hang',t:.2});
  x.viewer.weapon={...x.viewer.weapon,special:'slam'};x.viewer.specialActive=null;
  const legacy=x.send(100.6);assert.equal(legacy.pg,undefined);assert.deepEqual(legacy.wp[77].slice(1),[2,.2]);x.receive(legacy);
  assert.equal(x.viewer.specialActive.id,'slam');assert.equal(x.viewer.specialActive.phase,'hang');assert.equal(x.viewer.specialActive.t,.2);
});

test('Splashdown clock interpolation cannot blend activations, phases or lives',()=>{
  const a=readSplashdownSnapshot([3,4,1,.3,0],3,true),b=readSplashdownSnapshot([3,4,1,.5,0],3,true);
  assert.equal(interpolateSplashdownSnapshot(a,b,.5).age,.4);
  for(const changed of [{...b,life:4},{...b,activation:5},{...b,phase:'drop'}])assert.equal(interpolateSplashdownSnapshot(a,changed,.5),a);
  for(const row of [[3,4,1,.5,1],[3,4,2,2.6,0],[3,0,1,0,0],[3,4,1,NaN,0]])assert.equal(readSplashdownSnapshot(row,3,true),null);
  assert.equal(readSplashdownSnapshot([3,4,1,.5,0],3,false),null,'another special cannot borrow current Splashdown clocks');
});
