import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
async function client(id){
 let time=1000,packet;const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>time*1000}});
 const {paint}=makePaintWorld(f);f.G.match={state:'playing',time:180,playing:()=>true,canRespawn:()=>false};
 const owner=f.make(),jumper=f.make();Object.assign(owner,{nid:1,owner:'B',netLife:0,team:0,isLocal:id==='B'});Object.assign(jumper,{nid:2,owner:'A',netLife:0,team:0,isLocal:id==='A'});
 owner.pos.set(20,0,30);jumper.pos.set(-20,0,30);owner.weapon={...owner.weapon,sub:'beakon'};owner.weaponRunner.reset();jumper.weapon={...jumper.weapon,sub:'burst'};jumper.weaponRunner.reset();
 for(let i=0;i<8;i++)owner.weaponRunner.update(1/60,{sub:true});owner.weaponRunner.update(1/60,{sub:false,subReleased:true});owner.weaponRunner.update(1/60,{sub:false});
 const beacon=f.G.projectiles._s3SubObjects.find(o=>o.subId==='beakon');assert(beacon);assert.equal(beacon.phase,'deployed');
 const s={myId:id,hostId:'B',isHost:id==='B',_members:new Map([['A',{}],['B',{}]]),tr:{broadcast:p=>{packet=clone(p);return true;},sendTo:()=>true}};
 const nm=new f.NetMatch(s,{id:'beakon-admission',map:'reef'}),match={actors:[owner,jumper],mode:'turf',state:'playing',time:180,playing:()=>true,canRespawn:()=>false};f.G.match=match;nm.bind(match);
 if(id==='A')beacon.ghost=true;
 const events=[],jumpers=[jumper];f.on('all:sub',e=>events.push({...e,actor:e.actor?.nid}));
 assert.equal(f.NET_FLAGS.alive,1);assert.equal(f.NET_FLAGS.grounded,16);
 return{f,nm,owner,jumper,jumpers,beacon,events,
  tick(dt=1/60){time+=dt;f.G.time+=dt;for(const actor of jumpers)if(!actor.remote)actor.update(dt);f.G.projectiles.update(dt);paint.advanceSimulation(dt);},
  advance(dt=1/60){time+=dt;f.G.time+=dt;},
  send(){nm._sendTick();return clone(packet);},
  receive(p){nm.onMessage('A',clone(p));const peer=nm.peers.get('A');if(peer)for(const row of peer.events.splice(0))nm._play('A',row);},
  close(){nm.dispose();f.G.projectiles.clear();}
 };
}
async function pair(){const a=await client('A'),b=await client('B');b.receive(a.send());return {a,b,close(){a.close();b.close();}};}
function start(a){const target=a.f.G.bigBubblerJumpTargets(0).find(t=>t.beakon);assert(target);assert.equal(a.jumper.superJumpToBubbler(target),true);return target;}
function proposal(a,stage,reservationId=901,extra={}){return {v:1,phase:'beakonUseProposal',subId:'beakon',seq:a.beacon.seq,eventSeq:reservationId,life:0,sourceLife:a.beacon.sourceLife,targetOwnerId:1,targetLife:a.beacon.sourceLife,targetOwnerLife:0,targetSeq:a.beacon.seq,reservationId,stage,jumpEpoch:1,actor:a.jumper,...extra};}
function sendProposal(p,stage,id,extra){p.a.advance();p.b.advance();p.a.f.emit('all:sub',proposal(p.a,stage,id,extra));p.b.receive(p.a.send());}

for(const hz of [30,60,120])test(`native producer and admitted owner timeline consume one remote Beakon use at ${hz} Hz`,async()=>{
 const p=await pair();try{const {a,b}=p;start(a);a.advance(1/hz);b.advance(1/hz);const first=a.send();b.receive(first);
  assert.equal(b.beacon.reservations?.size,1,'accepted native charge authorizes exactly one reservation');assert.equal(b.beacon.usesLeft,2);
  let landPacket=null,frames=0;
  for(;frames<hz*5&&a.jumper.superJumpState;frames++){a.tick(1/hz);b.advance(1/hz);const packet=a.send();b.receive(packet);if(!a.jumper.superJumpState)landPacket=packet;}
  assert(frames<hz*5);assert.equal(a.jumper.superJumpState,null);assert.equal(a.jumper.grounded,true);assert(landPacket);assert.equal(b.beacon.usesLeft,1);assert.equal(b.beacon.reservations.size,0);
  const landed=a.events.find(e=>e.phase==='beakonUseProposal'&&e.stage==='land');assert.equal(landed.jumpEpoch,1,'producer retains epoch after native state is cleared');
  const count=b.events.filter(e=>e.phase==='beakonUses').length;b.receive(landPacket);assert.equal(b.beacon.usesLeft,1);assert.equal(b.events.filter(e=>e.phase==='beakonUses').length,count);
  sendProposal(p,'reserve',992);sendProposal(p,'land',992);assert.equal(b.beacon.usesLeft,1,'new catalogue identity cannot reuse a consumed native epoch');
 }finally{p.close();}
});

test('bare legal owner reserve/land rows and direct receiver calls cannot mint a jump',async()=>{
 const p=await pair();try{const {a,b}=p;const before=b.events.length;
  for(const id of [901,902]){sendProposal(p,'reserve',id);sendProposal(p,'land',id);}
  assert.equal(b.beacon.usesLeft,2);assert.equal(b.beacon.reservations?.size||0,0);assert.equal(b.events.length,before);
  const direct={...proposal(a,'reserve',903),actor:b.jumper};b.jumper.superJumpState={phase:'flight',sjEpoch:1,t:4,dur:1,to:b.beacon.pos};
  assert.equal(b.f.installedRuntime.replaySub(direct),false,'mutable interpolated/presentation actor state is not admission');assert.equal(b.beacon.usesLeft,2);
 }finally{p.close();}
});

test('a native charge reservation permits cancellation but not early or wrong-destination landing',async()=>{
 const p=await pair();try{const {a,b}=p;start(a);a.advance();b.advance();b.receive(a.send());assert.equal(b.beacon.reservations.size,1);
  const id=a.jumper.s3SubBeaconUse.reservationId;
  sendProposal(p,'land',id);assert.equal(b.beacon.usesLeft,2,'charge does not prove completed flight');
  sendProposal(p,'cancel',id);assert.equal(b.beacon.reservations.size,0);assert.equal(b.beacon.usesLeft,2);
  sendProposal(p,'reserve',id+1);assert.equal(b.beacon.reservations.size,0,'cancelled epoch cannot select a second token');
 }finally{p.close();}
});

test('three concurrent native remote jumps retain all reservations until actual arrivals',async()=>{
 const p=await pair();try{const {a,b}=p;
  for(const c of [a,b])for(const nid of [3,4]){const actor=c.f.make();Object.assign(actor,{nid,owner:'A',netLife:0,team:0,isLocal:c===a});actor.pos.set(-20-(nid-2)*5,0,30);actor.weapon={...actor.weapon,sub:'burst'};actor.weaponRunner.reset();c.nm.byNid.set(nid,actor);c.nm._setupActor(actor);c.nm.match.actors.push(actor);c.jumpers.push(actor);}
  const target=a.f.G.bigBubblerJumpTargets(0).find(t=>t.beakon);
  for(const actor of a.jumpers)assert.equal(actor.superJumpToBubbler(target),true);
  a.advance();b.advance();b.receive(a.send());assert.equal(b.beacon.reservations.size,3);assert.equal(b.beacon.usesLeft,2);
  for(let i=0;i<360&&a.jumpers.some(x=>x.superJumpState);i++){a.tick();b.advance();b.receive(a.send());}
  assert(a.jumpers.every(x=>!x.superJumpState&&x.grounded));assert.equal(b.beacon.dead,true);
  assert.deepEqual(b.events.filter(e=>e.phase==='beakonUses').map(e=>e.usesLeft),[1,0]);
 }finally{p.close();}
});

test('native landing receipt waits for a separately arriving accepted endpoint sample',async()=>{
 const p=await pair();try{const {a,b}=p;start(a);a.advance();b.advance();b.receive(a.send());
  let land;
  for(let i=0;i<360&&a.jumper.superJumpState;i++){a.tick();b.advance();const packet=a.send();if(a.jumper.superJumpState)b.receive(packet);else land=packet;}
  assert(land?.e?.some(e=>e[1]==='ac'&&e[5]?.stage==='land'));
  const eventsOnly=clone(land);eventsOnly.a=[];b.receive(eventsOnly);assert.equal(b.beacon.usesLeft,2,'native landing event alone does not prove endpoint body');
  a.advance();b.advance();b.receive(a.send());assert.equal(b.beacon.usesLeft,1,'later accepted body commits pending native landing once');
  a.advance();b.advance();b.receive(a.send());assert.equal(b.beacon.usesLeft,1);
 }finally{p.close();}
});

for(const delay of [0,.1,.3,.8])test(`normal owner packets delayed by ${delay*1000} ms retain Beakon consumption`,async()=>{
 const p=await pair();try{const {a,b}=p;start(a);const fifo=[],frames=Math.ceil(delay*60);
  for(let i=0;i<360+frames;i++){a.tick();b.advance();fifo.push(a.send());if(fifo.length>frames)b.receive(fifo.shift());}
  for(const packet of fifo)b.receive(packet);assert.equal(a.jumper.superJumpState,null);assert.equal(b.beacon.usesLeft,1);
  assert.deepEqual(b.events.filter(e=>e.phase==='beakonUses').map(e=>e.usesLeft),[1]);
 }finally{p.close();}
});

test('native jump destination, actor life, owner identity and receiver lifetime cannot be substituted',async()=>{
 const p=await pair();try{const {a,b}=p;
  assert.equal(a.jumper.superJump(new a.f.THREE.Vector3(28,0,30)),true);sendProposal(p,'reserve',701);assert.equal(b.beacon.reservations?.size||0,0,'different native destination is not this Beakon');
  a.jumper.reset();a.jumper.pos.set(-20,0,30);a.jumper.netLife++;start(a);a.advance();b.advance();b.receive(a.send());
  assert.equal(b.jumper.net.lastLife,1);assert.equal(b.beacon.reservations.size,1,'new accepted life works before presentation netLife catches up');
  const id=a.jumper.s3SubBeaconUse.reservationId,epoch=a.jumper.s3SubBeaconUse.jumpEpoch;
  for(const extra of [{life:0,jumpEpoch:epoch},{life:1,jumpEpoch:epoch-1},{life:1,jumpEpoch:epoch,targetOwnerLife:1}])sendProposal(p,'land',id,extra);
  assert.equal(b.beacon.usesLeft,2);
  b.jumper.owner='outsider';sendProposal(p,'land',id,{life:1,jumpEpoch:epoch});assert.equal(b.beacon.usesLeft,2,'ownership change invalidates private actor receipt');
  b.jumper.owner='A';b.nm.dispose();
  const direct={...proposal(a,'land',id,{life:1,jumpEpoch:epoch}),actor:b.jumper};assert.equal(b.f.installedRuntime.replaySub(direct),false);assert.equal(b.beacon.usesLeft,2);
 }finally{p.close();}
});
