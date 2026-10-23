import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));
async function world(){
 let wall=1000,packet;
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>wall*1000},
  extraExports:"export {applyCatalogueChoice} from './patches/splatoon3/runtime/catalogue.mjs';"});
 const owner=f.make(),proxy=f.make();Object.assign(owner,{nid:1,owner:'A'});Object.assign(proxy,{nid:1,owner:'A',remote:true});
 assert.ok(f.applyCatalogueChoice(owner,{sub:'torpedo',special:'zipcaster'},f));
 const session=id=>({myId:id,isHost:false,_members:new Map([['A',{}],['B',{}]]),tr:{broadcast:m=>{packet=clone(m);return true;},sendTo:()=>true}});
 const sender=new f.NetMatch(session('A'),{id:'sidecar-review'}),receiver=new f.NetMatch(session('B'),{id:'sidecar-review'});
 sender.bind({actors:[owner],playing:()=>true});f.G.time=10;sender._sendTick();
 // Reproduce an owner row reaching the exposed prebind NetMatch. Setup alone
 // does not grant a match timeline; the native startup gate must still reject.
 receiver._setupActor(proxy);receiver.byNid.set(1,proxy);
 const snapshot=()=>({kit:[proxy.weapon.sub,proxy.weapon.special],body:clone(proxy.net.buf),pos:proxy.pos.toArray(),peer:receiver.peers.has('A')?clone({lastTs:receiver.peers.get('A').lastTs,lastReceiveAt:receiver.peers.get('A').lastReceiveAt,physicsPoints:receiver.peers.get('A').physicsPoints}):null});
 const bind=()=>{receiver.bind({actors:[proxy],playing:()=>true});f.G.match=receiver.match;f.G.netm=receiver;};
 const send=(p,from='A')=>receiver.onMessage(from,clone(p));
 const later=(dt=.05)=>{wall+=dt;f.G.time+=dt;f.G.netm=sender;f.G.match=sender.match;sender._sendTick();f.G.netm=receiver;f.G.match=receiver.match;return clone(packet);};
 return{f,owner,proxy,sender,receiver,get packet(){return clone(packet)},snapshot,bind,send,later,close(){sender.dispose();receiver.dispose();f.G.projectiles.clear();}};
}
function bomb(p){p.ck[1][1]='bomb';return p;}

test('legacy production prebind native rejection cannot apply a catalogue sidecar',async()=>{
 const w=await world();try{const start=w.snapshot();w.send(w.packet);assert.deepEqual(w.snapshot(),start,'unbound rejection preserves kit/body/clock');assert.equal(w.receiver.match,null);assert.equal(w.receiver.stats.in,0);}finally{w.close();}
});
test('legacy production future14second rejection preserves kit/body/clock then a genuine kit tick recovers',async()=>{
 const w=await world();try{
  w.bind();w.send(w.packet);assert.equal(w.receiver.peers.get('A').lastTs,w.packet.ts);assert.equal(w.proxy.weapon.sub,'torpedo');assert.equal(w.proxy.weapon.special,'zipcaster');assert.equal(w.proxy.net.buf.length,1);
  const accepted=w.snapshot(),received=w.receiver.stats.in,future=bomb(w.packet);future.ts+=14;future.a[0][1]=77;w.send(future);
  assert.deepEqual(w.snapshot(),accepted,'rejected future tick cannot replace kit, append body or advance peer clock');assert.equal(w.receiver.stats.in,received);
  assert.ok(w.f.applyCatalogueChoice(w.owner,{sub:'bomb',special:'zipcaster'},w.f));
  const genuine=w.later();assert.equal(genuine.ck[1][1],'bomb','genuine sender serializes its changed kit');w.send(genuine);assert.equal(w.receiver.peers.get('A').lastTs,genuine.ts);assert.equal(w.proxy.weapon.sub,'bomb');assert.equal(w.proxy.net.buf.length,2);assert.equal(w.proxy.net.buf.at(-1).x,genuine.a[0][1]);
 }finally{w.close();}
});
test('legacy stale foreign and malformed whole-envelope rejection retain the accepted catalogue state',async()=>{
 const w=await world();try{
  w.bind();w.send(w.packet);const accepted=w.snapshot();
  w.send(bomb(w.packet));assert.deepEqual(w.snapshot(),accepted,'stale whole tick unchanged');
  w.send(bomb(w.later()),'foreign');assert.deepEqual(w.snapshot(),accepted,'foreign whole tick unchanged');
  const malformed=bomb(w.later());malformed.e={invalid:true};malformed.a[0][1]=77;w.send(malformed);assert.deepEqual(w.snapshot(),accepted,'invalid event envelope unchanged');
 }finally{w.close();}
});
test('malformed optional ck drops only its feature while the valid native body and clock still advance',async()=>{
 const w=await world();try{
  w.bind();w.send(w.packet);
  for(const malformed of [null,[],{1:[w.packet.ck[1][0],'missing-sub','zipcaster']},{1:[w.packet.ck[1][0]+1,'bomb','zipcaster']}]){
   const p=w.later();p.ck=malformed;p.a[0][1]=2;const count=w.proxy.net.buf.length;w.send(p);
   assert.equal(w.proxy.weapon.sub,'torpedo');assert.equal(w.proxy.weapon.special,'zipcaster');assert.equal(w.receiver.peers.get('A').lastTs,p.ts);assert.equal(w.proxy.net.buf.length,count+1);assert.equal(w.proxy.net.buf.at(-1).x,2);
  }
  assert.ok(w.f.applyCatalogueChoice(w.owner,{sub:'bomb',special:'zipcaster'},w.f));
  const p=w.later();assert.equal(p.ck[1][1],'bomb');w.send(p);assert.equal(w.proxy.weapon.sub,'bomb');assert.equal(w.receiver.peers.get('A').lastTs,p.ts);
 }finally{w.close();}
});
