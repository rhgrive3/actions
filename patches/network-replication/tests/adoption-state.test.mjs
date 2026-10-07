import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

const DT = 1 / 60;
const ADOPTION_TAG = 'inkwave-adoption-v1';
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

test('native Super Jump transfers its exact flight and lands continuously at 30/60/120 render cadence', async () => {
  for (const renderHz of [30, 60, 120]) {
    const owner = await runtimeFixture();
    const source = makeActor(owner, { nid: 7, owner: 'p2', team: 0 });
    const sender = owner.makeNetMatch(owner.makeSession('p2', 'p2', [['p2', 'Owner'], ['host', 'Host']]));
    bindActors(owner, sender, [source]);
    const destination = new owner.THREE.Vector3(14.25, 0, -3.5);
    assert.equal(source.superJump(destination), true);
    let chargeTicks = 0;
    while (source.superJumpState?.phase === 'charge' && chargeTicks++ < 240) tick(owner, source);
    assert.equal(source.superJumpState?.phase, 'flight', 'a native launch reached flight');
    for (let i = 0; i < 18; i++) tick(owner, source);
    const ownerState = source.superJumpState;
    assert.ok(ownerState.t > 0 && ownerState.t < ownerState.dur);
    const packet = sendTick(sender);
    assert.equal(packet.a[0].length, 23, 'legacy special count remains at index 21 and adoption state uses index 22');
    assert.equal(packet.a[0][21], source.stats.specials);
    assert.equal(packet.a[0][22][0], ADOPTION_TAG);
    assert.deepEqual(packet.a[0][22][5].slice(6, 9), [destination.x, destination.y, destination.z]);
    delete packet.e; // the exact destination must arrive in the actor row, without a Super Jump hint event.

    const host = await runtimeFixture();
    const local = makeActor(host, { nid: 8, owner: 'host', team: 1 });
    const remote = makeActor(host, { nid: 7, owner: 'p2', remote: true, team: 0 });
    const receiver = host.makeNetMatch(host.makeSession('host', 'host', [['host', 'Host'], ['p2', 'Owner']]));
    bindActors(host, receiver, [local, remote]);
    receiveTick(host, receiver, [remote], packet);
    assert.equal(remote.superJumpState?.phase, 'flight');
    assert.ok(remote.net.sjTo.distanceTo(destination) < 1e-8);
    assert.ok(remote.pos.distanceTo(source.pos) < 1e-8, 'remote proxy follows the native flight sample');
    const hp = remote.hp;
    remote.invuln = 0;
    assert.equal(remote.damage(20, local, 'shooter'), false, 'native flight damage guard rejects a hit after invulnerability is cleared');
    assert.equal(remote.hp, hp);

    receiver.onLeave('p2', false);
    assert.equal(remote.owner, 'host');
    assert.equal(remote.remote, false);
    assert.equal(remote.isBot, true);
    assert.equal(remote.superJumpState?.phase, 'flight', 'host adoption restored the accepted native flight');
    assert.ok(remote.superJumpState.to.distanceTo(destination) < 1e-8);

    let accumulator = 0, landedTicks = 0;
    for (let render = 0; remote.superJumpState && render < 6 * renderHz; render++) {
      accumulator += 1 / renderHz;
      while (accumulator + 1e-10 >= DT && remote.superJumpState) {
        tick(owner, source); tick(host, remote); accumulator -= DT; landedTicks++;
        assert.equal(!!remote.superJumpState, !!source.superJumpState, `flight phase differs at ${renderHz}Hz`);
        assert.ok(remote.pos.distanceTo(source.pos) < 1e-7, `adopted trajectory diverged at ${renderHz}Hz`);
      }
    }
    assert.ok(landedTicks > 0);
    assert.equal(remote.superJumpState, null, 'native trajectory completed');
    assert.equal(remote.grounded, true, 'native landing resolved against the floor');
    assert.ok(remote.pos.distanceTo(destination) < 1e-8, 'the adopted actor landed at the transmitted destination');
  }
});

test('native recovery age transfers early-hit, already-elapsed, and clamped finite values', async () => {
  const owner = await runtimeFixture();
  const delay = owner.profile.resources.regenDelay;
  const ages = [0.2, delay + 0.2, 1e9];
  const sources = ages.map((age, index) => {
    const a = makeActor(owner, { nid: 20 + index, owner: 'p2', team: 0 });
    a.damage(40, null, 'shooter');
    a.lastDamage = age;
    return a;
  });
  const sender = owner.makeNetMatch(owner.makeSession('p2', 'p2'));
  bindActors(owner, sender, sources);
  const packet = sendTick(sender);
  assert.deepEqual(packet.a.map(row => row[22][4]), [0.2, delay + 0.2, 60]);

  const host = await runtimeFixture();
  const local = makeActor(host, { nid: 29, owner: 'host', team: 1 });
  const remotes = ages.map((_, index) => makeActor(host, { nid: 20 + index, owner: 'p2', remote: true, team: 0 }));
  const receiver = host.makeNetMatch(host.makeSession('host', 'host'));
  bindActors(host, receiver, [local, ...remotes]);
  receiveTick(host, receiver, remotes, packet);
  for (let i = 0; i < remotes.length; i++) close(remotes[i].lastDamage, Math.min(ages[i], 60));
  receiver.onLeave('p2', false);

  const hpBefore = remotes.map(a => a.hp);
  for (const a of remotes) tick(host, a);
  assert.equal(remotes[0].hp, hpBefore[0], 'an early hit keeps the existing HP-drop recovery guard');
  assert.ok(remotes[1].hp > hpBefore[1], 'an already elapsed recovery delay continues recovering');
  assert.ok(remotes[2].hp > hpBefore[2] && Number.isFinite(remotes[2].lastDamage), 'large finite age is bounded without NaN');
});

test('accepted lethal hit transfers once with life, sequence, cause, splat and first-splat authority', async () => {
  const owner = await runtimeFixture();
  const victim = makeActor(owner, { nid: 37, owner: 'p2', team: 0 });
  const attacker = makeActor(owner, { nid: 38, owner: 'host', remote: true, team: 1 });
  const sender = owner.makeNetMatch(owner.makeSession('p2', 'p2', [['p2', 'Owner'], ['host', 'Host']]));
  bindActors(owner, sender, [victim, attacker]);
  victim.hp = 10;
  assert.equal(victim.damage(30, attacker, 'shooter'), true);
  assert.equal(victim.alive, true, 'accepted lethal decision is still pending for the native next tick');
  const packet = sendTick(sender);
  const row = packet.a.find(value => value[0] === victim.nid);
  assert.equal(row[22][6][3], 'shooter');

  const host = await runtimeFixture({ flow: true });
  const hostAttacker = makeActor(host, { nid: 38, owner: 'host', team: 1 });
  const remoteVictim = makeActor(host, { nid: 37, owner: 'p2', remote: true, team: 0 });
  const receiver = host.makeNetMatch(host.makeSession('host', 'host', [['host', 'Host'], ['p2', 'Owner']]));
  bindActors(host, receiver, [hostAttacker, remoteVictim]);
  let claims = 0, splatEvents = 0;
  const splatCauses = [];
  const claim = receiver.claimFirstSplat.bind(receiver);
  receiver.claimFirstSplat = (...args) => { claims++; return claim(...args); };
  const off = host.on('splatted', event => { splatEvents++; splatCauses.push(event.cause); });
  receiveTick(host, receiver, [remoteVictim], packet);
  assert.ok(remoteVictim.hp <= 0 && remoteVictim.alive);

  const duplicate = structuredClone(packet);
  receiver.onMessage('p2', duplicate);
  const malformed = structuredClone(packet);
  malformed.ts += 0.01; malformed.a[0][22][4] = NaN;
  receiver.onMessage('p2', malformed);
  const newLifeMismatch = structuredClone(packet);
  newLifeMismatch.ts += 0.02; newLifeMismatch.l[victim.nid]++;
  newLifeMismatch.a[0][22][2]++;
  receiver.onMessage('p2', newLifeMismatch);
  const outOfOrder = structuredClone(packet);
  outOfOrder.ts += 0.03; outOfOrder.a[0][22][2]--;
  receiver.onMessage('p2', outOfOrder);
  assert.equal(remoteVictim.net.buf.length, 1, 'duplicate, NaN, new-life mismatch and stale sequence rows were rejected');
  assert.equal(remoteVictim.net.lastLife, packet.l[victim.nid], 'invalid metadata did not advance the accepted life');

  receiver.onLeave('p2', false);
  assert.equal(remoteVictim.remote, false);
  assert.ok(host.hasPendingLethal(remoteVictim), 'the accepted lethal decision is restored for the new owner');
  const lateOldOwner = structuredClone(packet);
  lateOldOwner.ts += 0.04;
  receiver.onMessage('p2', lateOldOwner);
  assert.equal(remoteVictim.net.buf.length, 0, 'the departed owner cannot write after reassignment');

  tick(host, remoteVictim);
  tick(host, remoteVictim);
  off();
  assert.equal(remoteVictim.alive, false);
  assert.equal(remoteVictim.stats.deaths, 1);
  assert.equal(hostAttacker.stats.splats, 1);
  assert.equal(splatEvents, 1, 'the transferred hit splatted once');
  assert.deepEqual(splatCauses, ['shooter'], 'accepted-hit cause was preserved');
  assert.equal(claims, 1, 'first-splat authority was claimed once');
  assert.equal(receiver._firstSplatState.claimed, true);
});

test('native Splatling handoff refunds exactly the prepaid unspent rounds without replay', async () => {
  const owner = await runtimeFixture();
  const source = makeActor(owner, { nid: 47, owner: 'p2', team: 0, weapon: 'splatling' });
  const sender = owner.makeNetMatch(owner.makeSession('p2', 'p2'));
  bindActors(owner, sender, [source]);
  let chargeTicks = 0;
  while (source.weaponRunner.charge < 1 - 1e-9 && chargeTicks++ < 360)
    source.weaponRunner.update(DT, { fire: true, firePressed: chargeTicks === 1, sub: false, subReleased: false });
  assert.equal(source.weaponRunner.charge, 1, 'native Splatling reached full charge');
  source.weaponRunner.update(DT, { fire: false, firePressed: false, sub: false, subReleased: false });
  assert.equal(source.weaponRunner.streaming, true);
  for (let i = 0; i < 60 && source.weaponRunner.s3Spin.emitted < 4; i++)
    source.weaponRunner.update(DT, { fire: false, firePressed: false, sub: false, subReleased: false });
  const reservation = owner.exportSplatlingReservation(source.weaponRunner);
  assert.ok(reservation && reservation[3] >= 4 && reservation[4] > reservation[3]);
  const packet = sendTick(sender);
  const row = packet.a.find(value => value[0] === source.nid);
  assert.equal(row[22][7].length, reservation.length);
  assert.ok(row[22][7].every((value, index) => value === reservation[index]),
    'wire carries paid amount, remaining round count/progress, and exact tank value');

  const host = await runtimeFixture();
  const local = makeActor(host, { nid: 48, owner: 'host', team: 1 });
  const remote = makeActor(host, { nid: 47, owner: 'p2', remote: true, team: 0, weapon: 'splatling' });
  const receiver = host.makeNetMatch(host.makeSession('host', 'host'));
  bindActors(host, receiver, [local, remote]);
  receiveTick(host, receiver, [remote], packet);
  const projectilesBefore = host.projectiles.list.length;
  const paintBefore = host.paints.length;
  receiver.onLeave('p2', false);
  const expectedInk = Math.min(host.PLAYER.inkMax, reservation[7] + reservation[1]);
  close(remote.ink, expectedInk);
  assert.equal(remote.weaponRunner.streaming, false, 'host chose the exact-refund path and retired the paid stream');
  assert.equal(remote._s3SplatlingRefund.emitted, reservation[3]);
  assert.equal(remote._s3SplatlingRefund.shots, reservation[4]);
  assert.equal(remote._s3SplatlingRefund.elapsed, reservation[2]);
  assert.equal(host.refundSplatlingReservation(remote.weaponRunner, reservation,
    row[22][1], row[22][2], host.PLAYER.inkMax), false, 'repeated refund is idempotently rejected');
  for (let i = 0; i < 24; i++) tick(host, remote);
  assert.equal(host.projectiles.list.length, projectilesBefore, 'adoption did not emit another paid round or ghost projectile');
  assert.equal(host.paints.length, paintBefore, 'adoption did not replay paint');
  assert.equal(remote.stats.splats, 0);
});

test('Practice Range and native noBots stages remove leavers instead of adopting bots', async () => {
  for (const map of ['range', 'cargo']) {
    const f = await runtimeFixture();
    const actor = makeActor(f, { nid: 57, owner: 'p2', remote: true });
    const nm = f.makeNetMatch(f.makeSession('host', 'host'), { map });
    const match = bindActors(f, nm, [actor]);
    nm.onLeave('p2', false);
    assert.equal(nm.byNid.has(actor.nid), false, `${map} dropped the departed actor`);
    assert.equal(match.actors.includes(actor), false);
    assert.equal(actor.isBot, false);
  }
});
