import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const json=x=>JSON.parse(JSON.stringify(x));
async function pair(legacy){
 let clock=100;
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>clock*1000}});
 f.G.level=new f.Level({bounds:{minX:-40,maxX:40,minZ:-40,maxZ:40},spawnPads:[[-30,0,0],[30,0,0]],spawnBarrier:0,
  half:[],single:[{kind:'box',min:[-40,-.5,-40],max:[40,0,40]}]});
 f.G.physics=new f.Physics(f.G.level);
 const owner=f.make(),proxy=f.make();
 for(const actor of [owner,proxy]){
  Object.assign(actor,{nid:77,owner:'A',netLife:0});
  actor.weapon={...actor.weapon,special:'tripleSplashdown',specialCost:100};actor.special=100;actor._resolve=()=>{};
 }
 proxy.remote=true;
 const sent=[],session=myId=>({myId,hostId:'A',isHost:myId==='A',_members:new Map([['A',{}],['B',{}]]),
  tr:{broadcast:p=>sent.push(json(p)),sendTo(){}}});
 const sender=new f.NetMatch(session('A'),{id:'special-legacy-native',map:'reef'}),receiver=new f.NetMatch(session('B'),{id:'special-legacy-native',map:'reef'});
 const match={state:'playing',time:180,actors:[owner],playing:()=>true};
 sender.bind(match);receiver.bind({...match,actors:[proxy]});receiver.byNid.set(77,proxy);
 const select=n=>{f.G.netm=n;f.G.match=n.match;};
 const receive=(p,from='A')=>{select(receiver);receiver.onMessage(from,json(p));const peer=receiver.peers.get(from);if(peer){peer.tr=p.ts;receiver._playEvents();}};
 select(sender);sender._sendTick();receive(sent.at(-1));clock+=.1;f.G.time=.1;
 select(sender);owner._startSpecial();sender._sendTick();const native=json(sent.at(-1));
 assert.ok(native.e.some(e=>e[1]==='ev'&&e[2]==='special:use'));
 assert.ok(native.e.some(e=>e[1]==='ac'&&e[5].action==='activate'));
 const wire=p=>{const value=json(p);if(legacy){delete value.r;value.e=value.e.map(e=>e.slice(0,-2));}return value;};
 const fresh=events=>{clock+=.1;f.G.time+=.1;select(sender);sender._sendTick();const p=json(sent.at(-1));p.e=json(events);return p;};
 const fists=()=>f.G.projectiles._catalogueFists.filter(o=>o.owner===proxy);
 return{f,owner,proxy,sender,receiver,native,wire,fresh,receive,fists,close(){receiver.dispose();sender.dispose();f.G.projectiles.clear();}};
}

for(const legacy of [false,true]){
 const label=legacy?'legacy FIFO':'R2 sequence';
 test(`${label}: actual native use and catalogue producer create two fists and cannot authorize a replayed second activation`,async()=>{
  const p=await pair(legacy);try{
   assert.equal(p.fists().length,0);const packet=p.wire(p.native);p.receive(packet);
   assert.equal(p.receiver.peers.get('A').lastTs,packet.ts);assert.equal(p.fists().length,2);
   p.receive(packet);assert.equal(p.fists().length,2,'duplicate owner packet does not replay the birth');
   const repeated=json(p.native.e);repeated.find(e=>e[1]==='ac')[5].activation++;
   const retry=p.wire(p.fresh(repeated));p.receive(retry);
   assert.equal(p.receiver.peers.get('A').lastTs,retry.ts,'replay control reaches a fresh accepted owner frame');
   assert.equal(p.fists().length,2,'repeated native use cannot issue another receipt');
  }finally{p.close();}
 });
 test(`${label}: catalogue action without native use and foreign owner cannot create fists`,async()=>{
  const p=await pair(legacy);try{
   const noUse=p.wire({...p.native,e:p.native.e.filter(e=>e[1]!=='ev')});p.receive(noUse);assert.equal(p.fists().length,0);
  }finally{p.close();}
  const q=await pair(legacy);try{
   const packet=q.wire(q.native);q.receive(packet,'foreign');assert.equal(q.fists().length,0);
   q.receive(packet);assert.equal(q.fists().length,2,'foreign rejection does not reserve the rightful owner receipt');
  }finally{q.close();}
 });
 test(`${label}: native owner respawn cannot transfer an old-life use receipt to the new life`,async()=>{
  const p=await pair(legacy);try{
   const use=p.native.e.filter(e=>e[1]==='ev');p.receive(p.wire({...p.native,e:use}));assert.equal(p.fists().length,0);
   p.proxy.spawnAt(p.proxy.pos.clone(),0);p.owner.spawnAt(p.owner.pos.clone(),0);
   assert.equal(p.proxy.netLife,1);assert.equal(p.owner.netLife,1);
   const events=p.native.e.filter(e=>e[1]==='ac');events[0][4]=1;
   const packet=p.wire(p.fresh(events));p.receive(packet);
   assert.equal(p.receiver.peers.get('A').lastTs,packet.ts);assert.equal(p.fists().length,0,'new envelope life cannot inherit the prior receipt');
  }finally{p.close();}
 });
 test(`${label}: malformed native use does not poison its corrected accepted retry`,async()=>{
  const p=await pair(legacy);try{
   const bad=json(p.native.e.filter(e=>e[1]==='ev'));bad[0][3].actor.n=-1;
   p.receive(p.wire({...p.native,e:bad}));assert.equal(p.fists().length,0);
   assert.equal(p.receiver.peers.get('A')._lastEventSeq||0,0,'malformed use consumes no native sequence');
   const corrected=p.wire(p.fresh(p.native.e));p.receive(corrected);
   assert.equal(p.receiver.peers.get('A').lastTs,corrected.ts);assert.equal(p.fists().length,2);
  }finally{p.close();}
 });
}

test('legacy direct playback and sender annotations cannot manufacture an accepted FIFO frame',async()=>{
 const p=await pair(true);try{
  const packet=p.wire(p.native),use=packet.e.find(e=>e[1]==='ev');
  Object.assign(use,{_netSeq:1,_netTick:0,_legacyOrder:1,_accepted:true});
  // No private accepted frame exists: a direct invocation cannot correlate an
  // unsequenced use with the later, genuinely received catalogue action.
  delete use._netSeq;delete use._netTick;
  p.receiver._play('A',use);
  p.receive({...packet,e:packet.e.filter(e=>e[1]!=='ev')});assert.equal(p.fists().length,0);
 }finally{p.close();}
});
