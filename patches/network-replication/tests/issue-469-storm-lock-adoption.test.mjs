import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { installStormPower } from '../../splatoon3/runtime/storm-power.mjs';

const DT = 1 / 60;
const close = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

async function runtimeFixture({ flow = false } = {}) {
  const f = await fixture({ network: true, flow, fullRuntime: true });
  const paints = [];
  const oldPhysics = f.G.physics;
  f.G.physics = {
    ...oldPhysics,
    groundProbe(_x, y, _z, up, down, _radius, out) {
      out.hit = y + up >= -1e-6 && y - down <= 1e-6;
      out.y = 0; out.normal.set(0, 1, 0); out.face = 0; out.block = -1;
      out.u = out.v = 0; out.center = true; out.grate = false;
      return out;
    },
    collideBody() { return { ceiling: false, wall: false, wallNormal: new f.THREE.Vector3() }; },
    raycast(_origin, _direction, _range, out) { out.hit = false; return out; },
  };
  f.G.level = { blocks: [], groundHeight: () => 0, pointInside: () => false,
    spawnPads: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }] };
  f.G.paint = { sample: () => 1, splat(...args) { paints.push(args); return 0; } };
  f.G.fx = null; f.G.audio = null; f.G.time = 0;
  f.G.match = { playing: () => true, canRespawn: () => false };
  return { ...f, paints };
}

function makeActor(f, { nid, owner, remote = false, team = 0, weapon = 'shooter', x = 0, z = 0 } = {}) {
  class NativeVisual {
    constructor() { this.root = new f.THREE.Object3D(); this.events = []; }
    trigger(...args) { this.events.push(args); }
    getMuzzle(out) { return out.copy(this.root.position).add(new f.THREE.Vector3(0, 1.1, 0.35)); }
    setVisible(value) { this.root.visible = value; }
    setHurt() {}
    setWeapon() {}
    update() {}
  }
  const a = new f.Actor({ team, name: `actor-${nid}`, weapon, isLocal: !remote, CharacterClass: NativeVisual });
  a.nid = nid; a.owner = owner; a.remote = remote; a.isBot = false;
  a.spawnAt(new f.THREE.Vector3(x, 0, z), 0);
  a.invuln = 0;
  return a;
}

function bindActors(f, nm, actors, mode = 'turf') {
  const match = f.bind(nm, actors);
  match.mode = mode; match.opts = {}; match.playing = () => true; match.canRespawn = () => false;
  f.G.match = match; f.G.actors = actors;
  return match;
}

function sendTick(nm) {
  let packet = null;
  nm.s.tr.broadcast = value => { packet = structuredClone(value); };
  nm._sendTick();
  assert.ok(packet, 'native NetMatch produced a snapshot');
  return packet;
}

function receiveTick(f, nm, actors, packet, from = 'p2') {
  nm.onMessage(from, structuredClone(packet));
  const peer = nm.peers.get(from);
  if (!peer || !Number.isFinite(packet.ts)) return;
  peer.tr = packet.ts;
  peer.sim = packet.u;
  for (const a of actors) if (a.remote && a.owner === from && a.net.buf.length) {
    nm._sample(a, packet.ts, DT);
    nm.applyRemote(a, DT);
  }
}

function tick(f, a) { f.G.time += DT; a.update(DT); }

async function launched({dead=false,duration=8}={}) {
  const f=await runtimeFixture(),a=makeActor(f,{nid:7,owner:'p2',team:0,weapon:'charger'});
  const nm=f.makeNetMatch(f.makeSession('p2','p2',[['p2','Owner'],['host','Host']]));bindActors(f,nm,[a]);
  installStormPower(f);a.s3.modifiers.stormDuration=duration;
  a.special=a.specialCost();a._startSpecial();a.intent.sub=true;tick(f,a);a.intent.sub=false;tick(f,a);
  assert.equal(a.specialActive.phase,'throw');assert.equal(a.stormGaugeDuration,duration);
  for(let i=0;i<120;i++)tick(f,a);
  if(dead)a.splat(null,'water');
  const packet=sendTick(nm);delete packet.e;
  return {f,a,nm,packet};
}
async function receive(packet) {
  const f=await runtimeFixture(),a=makeActor(f,{nid:7,owner:'p2',remote:true,team:0,weapon:'charger'});
  const nm=f.makeNetMatch(f.makeSession('host','host',[['p2','Owner'],['host','Host']]));bindActors(f,nm,[a]);
  // Death is a separate accepted event in the native protocol; deliver its
  // native state change before the subsequent dead-owner snapshot.
  if (!(packet.a[0][10] & 1)) nm._remoteSplat(a,null,'water');
  receiveTick(f,nm,[a],packet);return {f,a,nm};
}

test('#469 actual post-throw Storm lock survives owner packet and adoption, then unlocks on its remaining tick',async()=>{
  const owner=await launched(),host=await receive(owner.packet);
  assert.equal(owner.packet.a[0][13],0);assert.equal(owner.packet.a[0][23].length,10);
  assert.equal(owner.packet.sg[7][0],owner.packet.a[0][23][1]);assert.equal(owner.packet.sg[7][1],owner.packet.a[0][23][2]);
  close(owner.packet.sg[7][2],6);assert.equal(owner.packet.sg[7][3],8);
  host.nm.onLeave('p2',false);assert.equal(host.a.remote,false);close(host.a.stormGaugeLock,6);close(host.a.stormGaugeDuration,8);
  assert.equal(host.a.specialActive,null,'no old throw action is replayed');
  for(let i=0;i<359;i++){host.a.addTurf(1);assert.equal(host.a.special,0);tick(host.f,host.a);}
  assert.ok(host.a.stormGaugeLock>0);host.a.addTurf(1);assert.equal(host.a.special,0);
  tick(host.f,host.a);assert.equal(host.a.stormGaugeLock,0);host.a.addTurf(10);assert.equal(host.a.special,10);
});

test('#469 legacy adoption packets reproduce missing lock but remain protocol compatible',async()=>{
  for(const length of [8,9,10]){
    const owner=await launched();owner.packet.a[0][23].length=length;delete owner.packet.sg;
    const host=await receive(owner.packet);assert.equal(host.a.net.buf.length,1);
    host.nm.onLeave('p2',false);assert.equal(host.a.stormGaugeLock,0);
    host.a.addTurf(10);assert.equal(host.a.special,10,'legacy rows contain no recoverable Storm clock');
  }
});

test('#469 dead-owner lock continues through adoption and reset; expiry snapshot clears older lock',async()=>{
  const owner=await launched({dead:true,duration:10}),host=await receive(owner.packet);
  host.nm.onLeave('p2',false);close(host.a.stormGaugeLock,8);assert.equal(host.a.alive,false);
  for(let i=0;i<60;i++)tick(host.f,host.a);close(host.a.stormGaugeLock,7);
  host.a.reset();close(host.a.stormGaugeLock,7);close(host.a.stormGaugeDuration,10);host.a.addTurf(10);assert.equal(host.a.special,0);
  const ended=await launched(),fresh=await receive(ended.packet);
  for(let i=0;i<360;i++)tick(ended.f,ended.a);ended.f.clock.advance(6);
  const packet=sendTick(ended.nm);delete packet.e;fresh.nm.onMessage('p2',packet);
  close(fresh.a.net.cur.adoption.stormGauge[0],6);
  assert.equal(fresh.a.net.buf.at(-1).adoption.stormGauge,null,'latest accepted owner says the lock ended');
  fresh.nm.onLeave('p2',false);assert.equal(fresh.a.stormGaugeLock,0);assert.equal(fresh.a.stormGaugeDuration,0);
});

test('#469 malformed Storm extension never replaces the last accepted adoption state',async()=>{
  const owner=await launched(),host=await receive(owner.packet),saved=host.a.net.buf.at(-1);
  let attempt=0;
  for(const row of [[],[6],[6,8,0],[0,8],[-1,8],[9,8],[6,0],[6,Infinity],[NaN,8],['6',8],[6,61],{},true]){
    const bad=structuredClone(owner.packet);bad.ts+=++attempt;bad.a[0][23][2]+=attempt;bad.sg[7]=Array.isArray(row)?[bad.a[0][23][1],bad.a[0][23][2],...row]:row;
    host.nm.onMessage('p2',bad);assert.equal(host.a.net.buf.at(-1),saved);
  }
  host.nm.onLeave('p2',false);close(host.a.stormGaugeLock,6);
});

test('#469 adoption cannot restart elapsed extrapolated time or accept wrong owner/life Storm state',async()=>{
  const owner=await launched(),host=await receive(owner.packet);
  const packet=structuredClone(owner.packet);packet.ts+=1;packet.a[0][23][2]+=1;packet.sg[7]=[packet.a[0][23][1],packet.a[0][23][2],8,8];
  const saved=host.a.net.buf.at(-1);host.nm.onMessage('other',packet);assert.equal(host.a.net.buf.at(-1),saved);
  packet.sg[7][0]+=1;host.nm.onMessage('p2',packet);assert.equal(host.a.net.buf.at(-1),saved);
  host.nm._peer('p2').sim=host.a.net.buf.at(-1).adoption.tick+120;
  host.nm._sample(host.a,owner.packet.ts+2,DT);
  host.nm.onLeave('p2',false);close(host.a.stormGaugeLock,4);close(host.a.stormGaugeDuration,8);
});
