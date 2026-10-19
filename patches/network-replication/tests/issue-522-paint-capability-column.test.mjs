import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

// CPU PaintSystem and actual composed NetMatch. Socket/rendering are controlled.
// Capability validation composes with explicit actor ownership admission.
function world(f) {
  const V=f.THREE.Vector3;
  const face={origin:new V(-5,0,-5),u:new V(1,0,0),v:new V(0,0,1),n:new V(0,1,0),su:10,sv:10,paintable:true,turf:true,block:0};
  const level={faces:[face],blocks:[{aabbMin:new V(-5,-.1,-5),aabbMax:new V(5,0,5),faces:[0,-1,-1,-1,-1,-1]}],pointInside(){return false;},queryBlocks(_a,_b,_c,_d,out){out.length=0;out.push(0);return out;},groundHeight(){return 0;}};
  const renderer={capabilities:{getMaxAnisotropy:()=>1},getRenderTarget:()=>null,getClearColor:c=>c.set(0),getClearAlpha:()=>1,setRenderTarget(){},setClearColor(){},clear(){},render(){}};
  f.G.paint=new f.PaintSystem(renderer,level,{atlasSize:256,maxDensity:8,cell:.25});
  const actor=f.makeActor({nid:7,owner:'p2',remote:true,team:1,roller:false});
  const receiver=f.makeNetMatch(f.makeSession('host','host',[['host','Host'],['p2','P2']]),{id:'paint-522'});
  f.G.match=f.bind(receiver,[actor]);f.G.time=12;
  let packet;
  const session=f.makeSession('p2','host',[['host','Host'],['p2','P2']]);session.tr.broadcast=p=>{packet=structuredClone(p);};
  const sender=new f.NetMatch(session,{id:'paint-522'});sender.match=receiver.match;sender.byNid.set(actor.nid,actor);
  actor.remote=false;
  try { sender.recSplat(new V(0,0,0),2,1,{kind:'shot',seed:.4,face:0,claimOwner:actor});sender._sendTick(); }
  finally { actor.remote=true; }
  assert.equal(packet.e.length,1);assert.equal(packet.e[0].length,17);
  const peer=receiver._peer('p2');
  return {f,receiver,sender,packet,peer,actor,paint:f.G.paint,close(){sender.dispose();receiver.dispose();f.G.projectiles.clear();f.G.paint.dispose?.();}};
}
function state(h) {
  return {grid:Array.from(h.paint.grid),counts:Array.from(h.paint.counts),coverage:Array.from(h.paint.coverage()),growing:h.paint.growing.length,
    event:h.peer._lastEventSeq??0,paint:h.peer._lastPaintSeq??0,clock:h.receiver._paintClockState.clock,
    applied:Array.from(h.receiver._paintClockState.applied),stats:{...h.actor.stats}};
}
function receive(h,p,drain=true) {
  h.receiver.onMessage('p2',p);
  if(drain){h.peer.tr=p.ts+1;h.peer.sim=Number.MAX_SAFE_INTEGER;h.receiver._playEvents();}
}
function recover(h) {
  receive(h,{...structuredClone(h.packet),ts:h.packet.ts+.1});
  assert.ok(h.paint.coverage()[1]>0,'same sequence remains usable after malformed row rejection');
  assert.equal(h.peer._lastEventSeq,h.packet.e[0].at(-1));
  const applied=state(h);receive(h,{...structuredClone(h.packet),ts:h.packet.ts+.2});
  assert.deepEqual(state(h),applied,'duplicate cannot paint or advance causal identity twice');
}
test('optional non-array capability columns fail closed without poisoning same-sequence recovery',async()=>{
  const f=await fixture({productionComposition:true});
  for(const value of [{nid:7,life:999,shot:999},null,'malformed',123,true,false]) {
    const h=world(f);
    try { const before=state(h),bad=structuredClone(h.packet);bad.e[0].splice(15,0,value);
      assert.equal(bad.e[0].length,18);receive(h,bad);
      assert.deepEqual(state(h),before,JSON.stringify(value));recover(h);
    } finally { h.close(); }
  }
});
test('overflow paint admission rejects a malformed capability before direct PaintSystem application',async()=>{
  const f=await fixture({productionComposition:true}),h=world(f);
  try { const before=state(h);h.peer.events=Array.from({length:512},()=>[0,'unused']);
    const bad=structuredClone(h.packet);bad.e[0].splice(15,0,{nid:7});receive(h,bad,false);
    assert.equal(h.peer.events.length,512);assert.deepEqual(state(h),before);
    h.peer.events.length=0;recover(h);
  } finally { h.close(); }
});
test('owned canonical paint applies once; legacy rows reject without reserving sequence',async()=>{
  const f=await fixture({productionComposition:true});
  for(const legacy of [false,true]) { const h=world(f);
    try { const canonical=structuredClone(h.packet);if(legacy)h.packet.e[0].splice(14,1);assert.equal(h.packet.e[0].length,legacy?16:17);
      if(legacy){const before=state(h);receive(h,h.packet);assert.deepEqual(state(h),before);canonical.ts+=.1;h.packet=canonical;}
      receive(h,h.packet);assert.ok(h.paint.coverage()[1]>0);const applied=state(h);
      receive(h,{...structuredClone(h.packet),ts:h.packet.ts+.1});assert.deepEqual(state(h),applied);
    } finally { h.close(); }
  }
});
test('team epoch and unknown-array capability rejection retain sequence recovery',async()=>{
  const f=await fixture({productionComposition:true});
  for(const kind of ['team','epoch','unknown-array','empty-array','victim-empty','victim-unknown']) { const h=world(f);
    try { const before=state(h),bad=structuredClone(h.packet),e=bad.e[0];
      if(kind==='team')e[6]=0;else if(kind==='epoch')e[14][1]='stale';else {
        const empty=kind==='empty-array'||kind==='victim-empty';e.splice(15,0,empty?[]:['unknown-capability','paint-522',7,0,1]);
        if(kind.startsWith('victim-')){e[5]=5;e[6]=0;e[7]=0;e[8]=0;e[9]=e[10]=e[11]=e[12]=0;e[13]=-1;}
      }
      receive(h,bad);assert.deepEqual(state(h),before,kind);recover(h);
    } finally { h.close(); }
  }
});

test('victim death signature without death authority is rejected even after owner death',async()=>{
  const f=await fixture({productionComposition:true}),h=world(f);
  try { const e=h.packet.e[0];e[5]=5;e[6]=0;e[7]=0;e[8]=0;e[9]=e[10]=e[11]=e[12]=0;e[13]=-1;
    h.actor.alive=false;h.actor.netLife=1;h.actor.net.lastLife=1;
    const before=state(h);receive(h,h.packet);assert.deepEqual(state(h),before);
    const applied=state(h);receive(h,{...structuredClone(h.packet),ts:h.packet.ts+.1});assert.deepEqual(state(h),applied);
  } finally {h.close();}
});
