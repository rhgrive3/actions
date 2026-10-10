import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { installRespawnLifecycle } from '../../splatoon3/runtime/respawn-lifecycle.mjs';

const DT = 1 / 60;
const ADOPTION_TAG = 'inkwave-adoption-v1';
const close = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

async function runtimeFixture({ flow = false } = {}) {
  const f = await fixture({ network: true, flow, fullRuntime: true });
  installRespawnLifecycle(f, f.profile);
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

async function pair() {
  const owner=await runtimeFixture(),host=await runtimeFixture();
  const source=makeActor(owner,{nid:7,owner:'p2'}),local=makeActor(host,{nid:8,owner:'host',team:1}),remote=makeActor(host,{nid:7,owner:'p2',remote:true});
  const sender=owner.makeNetMatch(owner.makeSession('p2','p2',[['p2','Owner'],['host','Host']]));
  const receiver=host.makeNetMatch(host.makeSession('host','host',[['host','Host'],['p2','Owner']]));
  bindActors(owner,sender,[source]);bindActors(host,receiver,[local,remote]);
  const send=()=>{owner.clock.advance(.05);owner.G.time+=.05;const p=sendTick(sender);receiveTick(host,receiver,[remote],p);return p;};
  return {owner,host,source,local,remote,sender,receiver,send};
}
test('#958 adopted owner keeps the complete finite invulnerability timer and expiry',async()=>{
  for(const hz of [30,60,120]){
    const f=await pair();f.source.invuln=1.6;f.source.s3.spawnArmorManaged=false;
    f.send();close(f.remote.invuln,.1);f.receiver.onLeave('p2',false);
    close(f.remote.invuln,1.6);assert.equal(f.remote.remote,false);
    const hp=f.remote.hp;f.remote.damage(10,f.local,'shooter');assert.equal(f.remote.hp,hp);
    let debt=0;for(let frame=0;frame<hz;frame++){debt+=1/hz;while(debt+1e-10>=DT){tick(f.host,f.remote);debt-=DT;}}
    close(f.remote.invuln,.6);
    for(let n=0;n<37;n++)tick(f.host,f.remote);
    f.remote.damage(10,f.local,'shooter');assert.ok(f.remote.hp<hp);
  }
});
test('#958 adoption resumes accepted breakable armor, not its proxy boolean or old visual sample',async()=>{
  const f=await pair();f.source.invuln=0;f.source.s3.spawnArmorManaged=true;
  f.source.s3.spawnArmor={hp:30,remaining:2.8,breakRemaining:null};f.send();
  const delayed=f.remote.net.cur.adoption;
  f.source.s3.spawnArmor={hp:0,remaining:2.5,breakRemaining:.12};f.send();
  f.remote.net.cur.adoption=delayed;f.receiver.onLeave('p2',false);
  assert.equal(f.remote.s3.spawnArmor.hp,0);close(f.remote.s3.spawnArmor.remaining,2.5);close(f.remote.s3.spawnArmor.breakRemaining,.12);
  const hp=f.remote.hp;f.remote.damage(10,f.local,'shooter');assert.equal(f.remote.hp,hp);
  for(let i=0;i<8;i++)tick(f.host,f.remote);assert.equal(f.remote.s3.spawnArmor,null);
  f.remote.damage(10,f.local,'shooter');assert.ok(f.remote.hp<hp);
});
test('#958 latest expired armor cannot be rearmed by a delayed protected sample',async()=>{
  const f=await pair();f.source.s3.spawnArmorManaged=true;f.source.s3.spawnArmor={hp:30,remaining:1,breakRemaining:null};f.send();const stale=f.remote.net.cur.adoption;
  f.source.s3.spawnArmor=null;f.source.invuln=0;f.send();f.remote.net.cur.adoption=stale;f.receiver.onLeave('p2',false);assert.equal(f.remote.s3.spawnArmor,null);assert.equal(f.remote.invuln,0);
});
test('#958 malformed/stale/foreign protection cannot replace accepted ownership state; old age rows stay compatible',async()=>{
  const f=await pair();f.source.invuln=.8;const packet=f.send();assert.equal(packet.a[0][23][0],ADOPTION_TAG);
  const state=f.remote.net.buf.at(-1).adoption;close(state.protection.invuln,.8);
  for(const value of [NaN,Infinity,-1,11]){
    const bad=structuredClone(packet);bad.ts+=.1;bad.u++;bad.a[0][23][3]=bad.u;bad.a[0][23][2]++;bad.a[0][23][4][2]=value;f.receiver.onMessage('p2',bad);
    close(f.remote.net.buf.at(-1).adoption.protection.invuln,.8);
  }
  const foreign=structuredClone(packet);foreign.ts+=.2;foreign.u++;foreign.a[0][23][3]=foreign.u;foreign.a[0][23][2]++;foreign.a[0][23][4][2]=9;f.receiver.onMessage('intruder',foreign);assert.equal(f.remote.net.buf.length,1);
  const legacy=structuredClone(packet);legacy.ts+=.3;legacy.u++;legacy.a[0][23][3]=legacy.u;legacy.a[0][23][2]++;legacy.a[0][23][4]=.7;f.receiver.onMessage('p2',legacy);
  close(f.remote.net.buf.at(-1).adoption.recoveryAge,.7);assert.equal(f.remote.net.buf.at(-1).adoption.protection,null);
});
