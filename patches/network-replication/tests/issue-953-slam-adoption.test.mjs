import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

const DT = 1 / 60;
const ADOPTION_TAG = 'inkwave-adoption-v1';
const HIT_AUTHORITY_TAG = 'inkwave-hit-authority-v1';
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

async function started(phase) {
  const f=await runtimeFixture(), a=makeActor(f,{nid:7,owner:'p2',weapon:'shooter',x:20});
  const nm=f.makeNetMatch(f.makeSession('p2','p2'));
  bindActors(f,nm,[a]);a.special=a.specialCost();a.intent.special=true;tick(f,a);a.intent.special=false;
  for(let i=0;a.specialActive?.phase!==phase&&i<180;i++)tick(f,a);
  assert.equal(a.specialActive?.phase,phase,'native action reaches requested phase');
  return {f,a,nm};
}
async function receiving(packet) {
  const f=await runtimeFixture(), a=makeActor(f,{nid:7,owner:'p2',remote:true,weapon:'shooter'});
  const local=makeActor(f,{nid:8,owner:'host',team:1,x:40});
  const nm=f.makeNetMatch(f.makeSession('host','host'));
  bindActors(f,nm,[local,a]);receiveTick(f,nm,[a],packet);return {f,a,nm};
}

for(const phase of ['rise','hang','fall'])for(const hz of [30,60,120])test(`#953 ${phase} Slam survives adoption and impacts once at ${hz}Hz`,async()=>{
  const owner=await started(phase), packet=sendTick(owner.nm);
  const row = packet.a[0];
  assert.equal(row.length, 26, 'native tick keeps adoption at index 23 and appends hit authority at 25');
  assert.equal(row[25][0], HIT_AUTHORITY_TAG, 'accepted-hit metadata must not replace adoption state');
  const tag = row[23]; assert.equal(tag[0], ADOPTION_TAG); assert.equal(tag.length, 10);
  const host=await receiving(packet);
  const victim=host.f.G.actors.find(a=>a!==host.a);victim.pos.set(21,0,0);
  let hits=0;const applyHit=host.f.G.projectiles.applyHit;
  host.f.G.projectiles.applyHit=function(attacker,target,...args){if(attacker===host.a&&target===victim)hits++;return applyHit.call(this,attacker,target,...args);};
  let impacts=0;host.f.on('special:slam',e=>{if(e.actor===host.a)impacts++;});
  const special=owner.a.special;
  host.nm.onLeave('p2',false);
  assert.equal(host.a.remote,false);assert.equal(host.a.owner,'host');
  assert.equal(host.a.specialActive?.phase,phase);assert.equal(host.a.specialActive.net,undefined);
  close(host.a.specialActive.t,owner.a.specialActive.t);close(host.a.special,special);
  assert.ok(host.a.pos.distanceTo(owner.a.pos)<1e-9);assert.ok(host.a.vel.distanceTo(owner.a.vel)<1e-9);
  // Repeat leave delivery must not restore or repeat the already transferred action.
  host.nm.onLeave('p2',false);
  let acc=0;
  for(let i=0;i<3*hz;i++){
    acc+=1/hz;
    while(acc+1e-10>=DT){tick(owner.f,owner.a);tick(host.f,host.a);acc-=DT;
      assert.equal(host.a.specialActive?.phase,owner.a.specialActive?.phase);
      assert.ok(host.a.pos.distanceTo(owner.a.pos)<1e-7,'native trajectory continues');
      close(host.a.special,owner.a.special,1e-7);
    }
  }
  assert.equal(impacts,1);assert.equal(host.a.specialActive,null);assert.equal(host.a.special,0);
  assert.equal(hits,1);assert.ok(victim.hp<100,'native impact damages its victim once');
  assert.ok(host.f.paints.length>0,'native impact paints');
});

test('#953 malformed and wrong-life Slam payloads never grant authority',async()=>{
  const owner=await started('rise'),packet=sendTick(owner.nm);
  for(const mutate of [
    p=>p.a[0][23][9][0]=9,
    p=>p.a[0][23][9][1]=-1,
    p=>p.a[0][23][9][11]=null,
    p=>p.a[0][23][9][7]=1e9,
    p=>p.a[0][23][1]++,
  ]){
    const changed=structuredClone(packet);mutate(changed);
    const host=await receiving(changed);assert.equal(host.a.net.buf.length,0);
    host.nm.onLeave('p2',false);assert.equal(host.a.specialActive,null);
  }
});

test('#953 a newer completed snapshot cannot revive an older displayed Slam',async()=>{
  const owner=await started('rise'), first=sendTick(owner.nm),host=await receiving(first);
  while(owner.a.specialActive)tick(owner.f,owner.a);
  owner.f.clock.advance(1);
  const done=sendTick(owner.nm);host.nm.onMessage('p2',structuredClone(done));
  assert.equal(host.a.net.buf.at(-1).adoption.slam,null);
  host.nm.onLeave('p2',false);assert.equal(host.a.specialActive,null);
});

for (const length of [8,9]) test(`legacy ${length}-field adoption remains readable without manufacturing Slam authority`,async()=>{
  const owner=await started('rise'),packet=sendTick(owner.nm);
  const row = packet.a[0];
  assert.equal(row[25][0], HIT_AUTHORITY_TAG, 'later extension stays intact during legacy adoption coverage');
  row[23].length = length;
  const host=await receiving(packet);
  assert.ok(host.a.net.buf.length>0,'accepted legacy packet');
  assert.equal(host.a.net.buf.at(-1).adoption.slam,null);
  host.nm.onLeave('p2',false);
  assert.ok(!host.a.specialActive || host.a.specialActive.net,'missing state cannot become native Slam authority');
});
