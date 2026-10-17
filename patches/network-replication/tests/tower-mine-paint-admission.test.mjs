import test from 'node:test';
import assert from 'node:assert/strict';
import { RankedEngine } from '../../splatoon3/runtime/ranked/engine.mjs';
import { installRankedNetwork } from '../../splatoon3/runtime/ranked/network.mjs';
import { mineTowerPaintReference, mineTowerPaintBirth, mineTowerPaintCoreMatches } from '../tower-paint-support.mjs';
import { fixture } from './robustness-fixture.mjs';

const stage = { id: 'tower-paint-stage', tower: { path: [[0,0,-10],[0,0,0],[10,0,0]], centerIndex: 1,
  checkpoints: [[],[]], speed: 1.2, halfSize: 1.4 } };
const json = value => JSON.parse(JSON.stringify(value));
const v = (x,y,z) => ({ x,y,z });
function move(engine, revision, progress) {
  const at = progress * 20, position = at <= 10 ? [0,0,at-10] : [at-10,0,0];
  Object.assign(engine.rule.state, { progress, pathDistance: at, position });
  engine.revision = revision;
}
function syncWorld(world, engine) {
  const p = engine.rule.state.position, turn = engine.rule.state.progress > .5;
  world.towerBlock = { tag: 'ranked-tower', center: v(p[0],p[1]-.12,p[2]),
    axes: turn ? [v(0,0,-1),v(0,1,0),v(1,0,0)] : [v(1,0,0),v(0,1,0),v(0,0,1)], half: v(1.4,.12,1.4) };
}
function setup(host = false) {
  const packets = [];
  class NetMatch {
    constructor() {
      this.cfg = { id: 'tower-paint' }; this.s = { hostId: 'a', isHost: host, tr: { broadcast: d => packets.push(d) } };
      this.match = { mode: 'tower', state: 'playing', ranked: new RankedEngine('tower',stage), rankedGains:[0,0], actors:[] };
      this.match.rankedWorld = { mode:'tower', update(engine) { syncWorld(this,engine); } };
      this.match.rankedWorld.update(this.match.ranked);
    }
    get isHost() { return this.s.isHost; }
    _sendNow(d) { packets.push(json(d)); }
    _sendTick() { this.s.tr.broadcast({ k:'t' }); }
    onMessage() {} onLeave() {} dispose() {} _hostClock() {}
  }
  const G = { time:0, netm:null }; installRankedNetwork({ NetMatch,G,emit() {} });
  const nm = G.netm = new NetMatch();
  return { nm, G, packets, engine:nm.match.ranked };
}
function statePacket(nm, engine) { return { k:'rkstate', rk:{ match:nm.cfg.id,host:nm.s.hostId,state:engine.snapshot(),gains:[0,0] } }; }
function birth(reference, position) { return { ...reference, x:position.x,y:position.y,z:position.z }; }

test('host publishes the exact 60Hz pose before a Mine reference; follower accepts only the current host and a synchronized collider', () => {
  const h = setup(true), f = setup();
  move(h.engine,7,.25); h.nm.match.rankedWorld.update(h.engine);
  const ref = mineTowerPaintReference(h.nm,v(.4,0,-4.8));
  assert.ok(ref); assert.equal(ref.supportRevision,7); assert.equal(h.packets.length,1);
  assert.equal(h.packets[0].k,'rkstate');
  mineTowerPaintReference(h.nm,v(.4,0,-4.8)); assert.equal(h.packets.length,1,'same revision does not publish twice');
  f.nm.onMessage('intruder',json(h.packets[0])); assert.equal(mineTowerPaintReference(f.nm,v(.4,0,-4.8)),null);
  const wrong = json(h.packets[0]); wrong.rk.match='old-match'; f.nm.onMessage('a',wrong);
  assert.equal(mineTowerPaintReference(f.nm,v(.4,0,-4.8)),null);
  f.nm.onMessage('a',json(h.packets[0]));
  assert.deepEqual(mineTowerPaintReference(f.nm,v(.4,0,-4.8)),ref);
  f.nm.match.rankedWorld.towerBlock.center.x += .02;
  assert.equal(mineTowerPaintReference(f.nm,v(.4,0,-4.8)),null,'predicted/interpolated geometry does not widen the permit');
  h.nm.match.rankedWorld.towerBlock.center.x += .02; move(h.engine,8,.3);
  assert.equal(mineTowerPaintReference(h.nm,v(.4,0,-3.8)),null);
  assert.equal(h.packets.length,1,'unsynchronized local host geometry cannot publish an invented pose');
});

test('fixed local attachment follows a canonical corner and keeps the Mine raw paint offset; teleport and malformed deck attachments fail', () => {
  const f=setup(), host=new RankedEngine('tower',stage);
  move(host,10,.25);f.nm.onMessage('a',statePacket(f.nm,host));
  const ref=mineTowerPaintReference(f.nm,v(.4,0,-4.8)), attachment=mineTowerPaintBirth(f.nm,birth(ref,v(.4,0,-4.8)));
  assert.ok(attachment);
  for(const payload of [birth({...ref,supportX:2},v(2,0,-4.8)),birth({...ref,supportY:2},v(.4,1.88,-4.8)),
    birth(ref,v(10,0,-4.8)),birth({...ref,supportRevision:999},v(.4,0,-4.8))])assert.equal(mineTowerPaintBirth(f.nm,payload),null);
  move(host,20,.75);f.nm.onMessage('a',statePacket(f.nm,host));
  assert.equal(mineTowerPaintCoreMatches(f.nm,attachment,20,[5.2,.45,-.4],.45),true);
  for(const [revision,point] of [[20,[8,.45,-.4]],[20,[5.2,3,-.4]],[20,[5.2,.45,.4]],[999,[5.2,.45,-.4]],[9,[5.2,.45,-.4]]])
    assert.equal(mineTowerPaintCoreMatches(f.nm,attachment,revision,point,.45),false);
});

test('duplicate or reordered host snapshots cannot replace a pose; bounded history, host handoff and match epochs retire references', () => {
  const f=setup(),host=new RankedEngine('tower',stage);
  move(host,1,.25);f.nm.onMessage('a',statePacket(f.nm,host));
  const ref=mineTowerPaintReference(f.nm,v(.4,0,-4.8)), attachment=mineTowerPaintBirth(f.nm,birth(ref,v(.4,0,-4.8)));
  move(host,1,.75);f.nm.onMessage('a',statePacket(f.nm,host));
  assert.equal(mineTowerPaintReference(f.nm,v(5.2,0,-.4)),null,'equal revision cannot replace accepted proof');
  assert.equal(mineTowerPaintCoreMatches(f.nm,attachment,1,[.4,.45,-4.8],.45),true);
  for(let revision=2;revision<=258;revision++){move(host,revision,.75);f.nm.onMessage('a',statePacket(f.nm,host));}
  assert.equal(mineTowerPaintCoreMatches(f.nm,attachment,1,[.4,.45,-4.8],.45),false,'old core pose evicted');
  assert.equal(mineTowerPaintCoreMatches(f.nm,attachment,258,[5.2,.45,-.4],.45),true,'stored attachment survives birth-pose eviction');
  move(host,1,.25);f.nm.onMessage('a',statePacket(f.nm,host));
  assert.equal(mineTowerPaintCoreMatches(f.nm,attachment,1,[.4,.45,-4.8],.45),false,'reordered snapshot does not resurrect evicted proof');
  f.nm.s.hostId='b';f.nm.onLeave('a',true);
  assert.equal(mineTowerPaintCoreMatches(f.nm,attachment,258,[5.2,.45,-.4],.45),false);
  f.nm.s.hostId='a';move(host,259,.75);f.nm.onMessage('a',statePacket(f.nm,host));
  assert.equal(mineTowerPaintCoreMatches(f.nm,attachment,259,[5.2,.45,-.4],.45),false,'returning host does not revive a prior generation');
  const next=mineTowerPaintBirth(f.nm,birth({...ref,supportRevision:259,supportX:.4,supportZ:.2},v(5.2,0,-.4)));
  assert.ok(next);f.nm.cfg.id='next-match';
  assert.equal(mineTowerPaintCoreMatches(f.nm,next,259,[5.2,.45,-.4],.45),false);
});

function paintLevel(THREE) {
  const face={paintable:true,su:40,sv:40,turf:true,wall:false,origin:new THREE.Vector3(-20,0,-20),
    u:new THREE.Vector3(1,0,0),v:new THREE.Vector3(0,0,1),n:new THREE.Vector3(0,1,0)};
  const block={aabbMin:new THREE.Vector3(-20,-.1,-20),aabbMax:new THREE.Vector3(20,.1,20),faces:[0,-1,-1,-1,-1,-1]};
  face.block=block;return {faces:[face],blocks:[block],pointInside:()=>false,queryBlocks:()=>[0]};
}
function renderer(THREE) {
  let target=null,clear=new THREE.Color(),alpha=1;
  return {capabilities:{getMaxAnisotropy:()=>1},getRenderTarget:()=>target,setRenderTarget:v=>{target=v;},
    getClearColor:out=>out.copy(clear),getClearAlpha:()=>alpha,setClearColor:(v,a)=>{if(v?.isColor)clear.copy(v);alpha=a;},clear(){},render(){}};
}
async function wireClient(id) {
  const f=await fixture({productionComposition:true,rankedNetwork:true}), packets=[];
  const session=f.makeSession(id,'a',[['a','A'],['b','B'],['c','C']]);session.tr.broadcast=d=>packets.push(json(d));
  const nm=f.makeNetMatch(session,{id:'tower-paint'});
  const actors=['a','b','c'].map((owner,nid)=>f.makeActor({nid,owner,remote:id!==owner,team:nid%2,roller:false}));
  const match=f.bind(nm,actors);Object.assign(match,{mode:'tower',ranked:new RankedEngine('tower',stage),rankedGains:[0,0]});
  const level=paintLevel(f.THREE);
  match.rankedWorld={mode:'tower',towerBlockId:1,update(engine){
    const prior=this.towerBlock;syncWorld(this,engine);const next=this.towerBlock;
    const block=prior||{id:1,tag:'ranked-tower',center:new f.THREE.Vector3(),half:new f.THREE.Vector3(),
      axes:[new f.THREE.Vector3(),new f.THREE.Vector3(),new f.THREE.Vector3()]};
    block.center.copy(next.center);block.half.copy(next.half);block.axes.forEach((axis,i)=>axis.copy(next.axes[i]));
    this.towerBlock=level.blocks[1]=block;
  }};match.rankedWorld.update(match.ranked);
  Object.assign(f.G,{match,time:12,level,paint:new f.PaintSystem(renderer(f.THREE),level,{atlasSize:1024,maxDensity:30,cell:.25})});
  actors[0].weapon={...actors[0].weapon,sub:'inkMine'};actors[0].netLife=0;actors[0].net.lastLife=0;
  return {f,nm,actors,packets};
}
function play(c,from,e) { c.nm._peer(from);c.nm._play(from,c.f.parseWire(JSON.stringify(e))); }

test('JSON Mine birth/core replay paints the moved Tower location once; owner/life/epoch, foreign support, radius and teleport claims stay closed', async () => {
  const sender=await wireClient('a'), receiver=await wireClient('c');
  const engine=sender.nm.match.ranked;
  move(engine,10,.25);sender.nm.match.rankedWorld.update(engine);
  const owner=sender.actors[0];owner.pos.set(.4,0,-4.8);owner.grounded=true;
  owner.ground={block:1,normal:new sender.f.THREE.Vector3(0,1,0)};
  const mine=sender.f.G.projectiles.throwBomb(owner);assert.ok(mine?.s3TowerPaintBirthRef);
  const birthRow=sender.nm.out.find(row=>row[1]==='ac'&&row[5].phase==='spawn');
  assert.ok(birthRow);assert.equal(birthRow[5].supportRevision,10);
  assert.equal(sender.packets.at(-1).k,'rkstate','actual Mine placement publishes the host revision first');
  receiver.nm.onMessage('a',receiver.f.parseWire(JSON.stringify(sender.packets.at(-1))));
  const placement=sender.nm.out.filter(row=>row[1]==='s');assert.equal(placement.length,1);
  move(engine,20,.75);sender.nm.match.rankedWorld.update(engine);
  sender.actors[1].pos.set(5.2,0,-.4);sender.actors[1].damage=()=>false;
  sender.f.G.actors=[owner,sender.actors[1]];sender.f.G.time=13;sender.f.G.projectiles.update(1/60);
  assert.equal(mine.dead,true,'real Mine proximity route detonates after attachment movement');
  receiver.nm.onMessage('a',receiver.f.parseWire(JSON.stringify(sender.packets.at(-1))));
  const core=sender.nm.out.find(row=>row[1]==='s'&&row[5]===5);assert.ok(core);
  assert.equal(core[15].length,7);assert.equal(core[15][6],20);
  const baseSeq=core.at(-1),proofSeq=birthRow.at(-1);
  // Each rejected claim has a fresh causal birth/sequence, so rejection does
  // not merely rely on the successful claim's one-use bit or packet ordering.
  let sequence=baseSeq+10;
  for(const kind of ['owner','life','epoch','birth-life','foreign-support','offset','missing-revision','radius','teleport','height','static-seven']){
    const b=json(birthRow),e=json(core);b[b.length-1]=sequence++;e[e.length-1]=sequence++;e[15][4]=b.at(-1);
    if(kind==='owner')e[15][2]=1;
    if(kind==='life')e[15][3]=1;
    if(kind==='epoch')e[15][1]='another-match';
    if(kind==='birth-life'){b[4]=1;b[5].life=b[5].sourceLife=1;}
    if(kind==='foreign-support')b[5].support=2;
    if(kind==='offset')b[5].supportX=2;
    if(kind==='missing-revision')e[15][6]=9;
    if(kind==='radius')e[5]=5.01;
    if(kind==='teleport')e[2]+=2;
    if(kind==='height')e[3]+=2;
    if(kind==='static-seven')for(const key of ['support','supportRevision','supportX','supportY','supportZ'])delete b[5][key];
    play(receiver,'a',b);play(receiver,'a',e);
    assert.ok(receiver.f.G.paint.grid.every(value=>value===0),kind);
  }
  const b=json(birthRow),e=json(core);b[b.length-1]=sequence++;
  const placed=placement.map(row=>{const p=json(row);p[p.length-1]=sequence++;return p;});
  e[e.length-1]=sequence++;e[15][4]=b.at(-1);
  play(receiver,'a',b);
  for(const p of placed)play(receiver,'a',p);
  // Already accepted Mine deployment remains valid after its owner's death,
  // matching the pre-existing persistent Mine/bomb lifecycle contract.
  receiver.actors[0].alive=false;receiver.actors[0].netLife=1;receiver.actors[0].net.lastLife=1;
  play(receiver,'a',e);
  assert.ok(receiver.f.G.paint.grid.some(value=>value!==0),JSON.stringify({birth:b,core:e,last:receiver.nm._peer('a')._lastEventSeq,ranked:receiver.nm.match.ranked.revision}));
  assert.deepEqual(Array.from(receiver.f.G.paint.grid),Array.from(sender.f.G.paint.grid));
  assert.deepEqual(Array.from(receiver.f.G.paint.counts),Array.from(sender.f.G.paint.counts));
  const before=Array.from(receiver.f.G.paint.grid),growth=receiver.f.G.paint.growing.length;
  const replay=json(e);replay[replay.length-1]=sequence++;replay[2]+=.05;
  play(receiver,'a',replay);play(receiver,'b',replay);play(receiver,'a',e);
  assert.deepEqual(Array.from(receiver.f.G.paint.grid),before);assert.equal(receiver.f.G.paint.growing.length,growth);
  assert.ok(proofSeq>0);
});

async function movingPeerRows() {
  const sender=await wireClient('b'),receiver=await wireClient('c'),host=new RankedEngine('tower',stage);
  for(const c of [sender,receiver]){
    const a=c.actors[1];a.weapon={...a.weapon,sub:'inkMine'};a.netLife=0;a.net.lastLife=0;
  }
  move(host,10,.25);const first=statePacket(sender.nm,host);
  sender.nm.onMessage('a',sender.f.parseWire(JSON.stringify(first)));
  const owner=sender.actors[1];owner.pos.set(.4,0,-4.8);owner.grounded=true;
  owner.ground={block:1,normal:new sender.f.THREE.Vector3(0,1,0)};
  const mine=sender.f.G.projectiles.throwBomb(owner);assert.ok(mine?.s3TowerPaintBirthRef);
  const placementCount=sender.f.G.paint.counts[1];assert.ok(placementCount>0);
  move(host,20,.75);const last=statePacket(sender.nm,host);
  sender.nm.onMessage('a',sender.f.parseWire(JSON.stringify(last)));
  sender.actors[0].pos.set(5.2,0,-.4);sender.actors[0].damage=()=>false;
  sender.f.G.actors=[owner,sender.actors[0]];sender.f.G.time=13;sender.f.G.projectiles.update(1/60);
  assert.equal(mine.dead,true);
  const rows=json(sender.nm.out),core=rows.find(row=>row[1]==='s'&&Array.isArray(row[15]));assert.equal(core[15].length,7);
  return {sender,receiver,first,last,rows,core,placementCount};
}
function proof(c,packet,from='a') { c.nm.onMessage(from,c.f.parseWire(JSON.stringify(packet))); }
function peerPacket(c,rows,ts=1000.1) {
  c.nm._tick('b',c.f.parseWire(JSON.stringify({k:'t',r:2,ts,u:10000,a:[],e:rows})));
}
function drainPeer(c) { const p=c.nm._peer('b');for(const row of p.events.splice(0))c.nm._play('b',row); }
function samePaint(a,b) {
  assert.deepEqual(Array.from(a.f.G.paint.grid),Array.from(b.f.G.paint.grid));
  assert.deepEqual(Array.from(a.f.G.paint.counts),Array.from(b.f.G.paint.counts));
}

test('cross-peer JSON birth/core waits for later genuine host proofs, and duplicate proofs do not consume twice',async()=>{
  for(const missing of ['birth-and-core','core']){
    const w=await movingPeerRows(),{receiver:c}=w;
    if(missing==='core')proof(c,w.first);
    peerPacket(c,w.rows);drainPeer(c);
    assert.equal(c.f.G.paint.counts[1],missing==='core'?w.placementCount:0);
    const wrong=json(w.first);wrong.rk.match='foreign';proof(c,wrong);proof(c,w.first,'b');
    assert.equal(c.f.G.paint.counts[1],missing==='core'?w.placementCount:0,'invalid host/match proof cannot flush paint');
    c.f.clock.advance(.25);proof(c,w.first);drainPeer(c);
    assert.equal(c.f.G.paint.counts[1],w.placementCount,'birth proof admits only ordinary placement; core still awaits its own pose');
    proof(c,w.first);drainPeer(c);assert.equal(c.f.G.paint.counts[1],w.placementCount);
    proof(c,w.last);drainPeer(c);samePaint(c,w.sender);
    const growth=c.f.G.paint.growing.length;proof(c,w.last);drainPeer(c);peerPacket(c,w.rows,1000.2);drainPeer(c);
    samePaint(c,w.sender);assert.equal(c.f.G.paint.growing.length,growth);
  }
});

test('late host proofs expire closed after two seconds for both a missing birth pose and a missing core pose',async()=>{
  for(const missing of ['birth-and-core','core']){
    const w=await movingPeerRows(),{receiver:c}=w;
    if(missing==='core')proof(c,w.first);
    peerPacket(c,w.rows);drainPeer(c);c.f.clock.advance(2.01);
    proof(c,w.first);drainPeer(c);proof(c,w.last);drainPeer(c);
    assert.equal(c.f.G.paint.counts[1],w.placementCount,'ordinary prior-life placement survives; the wider core never gains a permit');
    const replay=json(w.core);replay[replay.length-1]=w.rows.at(-1).at(-1)+100;
    replay[14][3]+=100;peerPacket(c,[replay],1000.2);drainPeer(c);
    assert.equal(c.f.G.paint.counts[1],w.placementCount,'new event sequence cannot revive an expired claim');
  }
});

test('invalid canonical host proof, owner life changes and host handoff cannot authorize a pending Tower Mine',async()=>{
  for(const change of ['invalid-proof','life','handoff']){
    const w=await movingPeerRows(),{receiver:c}=w;peerPacket(c,w.rows);drainPeer(c);
    if(change==='invalid-proof'){
      const malformed=json(w.first);malformed.rk.state.rule.position[0]+=10;proof(c,malformed);
      assert.equal(c.f.G.paint.counts[1],0,'finite but contradictory host pose is not a proof');
      c.f.clock.advance(2.01);
    }
    if(change==='life'){c.actors[1].netLife=1;c.actors[1].net.lastLife=1;}
    if(change==='handoff'){
      c.nm.s.hostId='b';c.nm.onLeave('a',true);
      const promoted=json(w.first);promoted.rk.host='b';proof(c,promoted,'b');drainPeer(c);
      const final=json(w.last);final.rk.host='b';proof(c,final,'b');drainPeer(c);
    }else{proof(c,w.first);drainPeer(c);proof(c,w.last);drainPeer(c);}
    assert.ok(c.f.G.paint.counts[1]<=w.placementCount,change);
    assert.ok(c.f.G.paint.counts[1]<w.sender.f.G.paint.counts[1],change);
  }
});

test('older recovered birth envelopes retain original ts/u admission across later genuine host-proof retries',async()=>{
  for(const original of ['valid','stale-ts','future-tick']){
    const w=await movingPeerRows(),{receiver:c}=w;
    // The newer core envelope arrives first; only its exact missing birth may
    // be recovered from an older envelope through acceptPendingKitBirths.
    peerPacket(c,[w.core],1000.1);drainPeer(c);
    const born=json(w.rows.find(row=>row[1]==='ac'&&row[5].phase==='spawn'));
    if(original==='stale-ts')born[0]=1000.05; // exceeds original ts1000
    if(original==='future-tick')born[born.length-2]=10001; // exceeds original u10000
    c.nm._tick('b',c.f.parseWire(JSON.stringify({k:'t',r:2,ts:1000,u:10000,a:[],e:[born]})));
    drainPeer(c);assert.equal(c.f.G.paint.counts[1],0);
    assert.equal(c.nm._peer('b')._lastEventSeq??0,0,'unknown-proof birth cannot leave the bounded pending path early');
    proof(c,w.first);drainPeer(c);proof(c,w.last);drainPeer(c);
    if(original==='valid'){
      assert.ok(c.f.G.paint.counts[1]>400,'valid older birth plus genuine late proofs still recovers the wider Mine core');
      const before=Array.from(c.f.G.paint.grid);proof(c,w.last);drainPeer(c);
      assert.deepEqual(Array.from(c.f.G.paint.grid),before);
    }else{
      assert.equal(c.f.G.paint.counts[1],0,original+' cannot gain eligibility from context-free playback or host proof');
      c.f.clock.advance(2.01);peerPacket(c,[],1000.2);drainPeer(c);
      assert.equal(c.f.G.paint.counts[1],0,original+' remains rejected after expiry');
    }
  }
});
