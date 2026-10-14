import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

async function rig() {
  const f = await fixture({ productionComposition: true, extraExports:
    `export * from './patches/splatoon3/runtime/combat-info.mjs';
     export { installHealthBarHud } from './patches/splatoon3/runtime/health-bars.mjs';` });
  class HUD { update() {} dispose() {} }
  f.installHealthBarHud({ ...f, HUD });
  const viewer = f.make(), enemy = f.make(); viewer.team = 0; enemy.team = 1;
  enemy.invuln = 0; enemy.netLife = 1;
  const show = (now, visible = true) => { f.G.time = now; return f.healthActorVisible(enemy, viewer, { now, visible }); };
  return { ...f, viewer, enemy, show };
}
function expired(f) {
  assert.equal(f.show(0), false); f.enemy.damage(50, f.viewer, 'shooter');
  assert.equal(f.show(0), true); assert.equal(f.show(3), false);
}

test('#716 real heal then smaller accepted damage refreshes even when final HP exceeds last HUD sample', async () => {
  const f = await rig(); expired(f);
  f.enemy.lastDamage = 99; f.updateHealthRecovery(f.enemy, 1 / 60, false, true);
  assert.ok(f.enemy.hp > 51); f.G.time = 3.01; f.enemy.damage(1, f.viewer, 'storm');
  assert.ok(f.enemy.hp > 50); assert.equal(f.enemy.lastDamage, 0);
  assert.equal(f.show(3.01), true); assert.equal(f.show(6.01), false);
});

test('#716 heal-only and recovery-clock resets do not restart an expired bar', async () => {
  const f = await rig(); expired(f);
  f.enemy.lastDamage = 99; f.updateHealthRecovery(f.enemy, 1 / 60, false, true);
  assert.equal(f.show(3.01), false); f.enemy.lastDamage = 0;
  assert.equal(f.show(3.02), false);
});

test('#716 large hits, repeated same-frame hits and later hits use latest accepted damage time', async () => {
  const f = await rig(); expired(f); f.G.time = 4;
  f.enemy.damage(5, f.viewer, 'shooter'); f.enemy.damage(5, f.viewer, 'shooter');
  assert.equal(f.show(4), true); assert.equal(f.show(6.999), true); assert.equal(f.show(7), false);
  f.enemy.damage(5, f.viewer, 'shooter'); assert.equal(f.show(7), true); assert.equal(f.show(10), false);
});

test('#716 invulnerability and zero-damage admission cannot refresh the hit clock', async () => {
  const f = await rig(); expired(f); f.G.time = 4; f.enemy.invuln = 10;
  f.enemy.damage(5, f.viewer, 'shooter'); assert.equal(f.enemy.hp, 50); assert.equal(f.show(4), false);
  f.enemy.invuln = 0; f.enemy.damage(0, f.viewer, 'shooter'); assert.equal(f.show(4), false);
});

test('#716 observer preserves concealment, reveal expiry, ally visibility and full-health clearing', async () => {
  const f = await rig(); expired(f); f.G.time = 4; f.enemy.damage(5, f.viewer, 'shooter');
  assert.equal(f.show(4, false), false);
  f.enemy.submerged = true; assert.equal(f.show(4), false);
  f.enemy.s3.revealedUntil = { 0: 5 }; assert.equal(f.show(4, false), true);
  assert.equal(f.show(5, false), false); f.enemy.team = 0; assert.equal(f.show(8, false), true);
  f.enemy.hp = 100; assert.equal(f.show(8), false);
});

test('#716 reset and unobserved life changes clear stale windows but retain fresh damage', async () => {
  const f = await rig(); expired(f); f.G.time = 4; f.enemy.damage(5, f.viewer, 'shooter');
  f.enemy.reset(); f.enemy.invuln = 0; f.enemy.hp = 60;
  assert.equal(f.show(4), false); f.enemy.damage(5, f.viewer, 'shooter'); assert.equal(f.show(4), true);
  f.enemy.netLife++; assert.equal(f.show(4), false);
  f.enemy.damage(5, f.viewer, 'shooter'); assert.equal(f.show(4), true);
});

function remote(f) {
  f.enemy.remote = true;
  f.enemy.net = { ready: true, err: new f.THREE.Vector3(), prevGrounded: true, prevVy: 0, cur: {
    life: f.enemy.netLife, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, aimYaw: 0, aimPitch: 0,
    f: f.NET_FLAGS.alive | f.NET_FLAGS.grounded, hp: f.enemy.hp, ink: 100, sp: 0, turf: 0, ch: 0, lock: 0,
  } };
  f.enemy.owner = 'owner'; f.enemy.nid = 2;
  return new f.NetMatch({ myId: 'viewer', isHost: true, hostId: 'viewer', _members: new Map([['viewer', {}], ['owner', {}]]), tr: { broadcast() {}, sendTo() {} } }, { id: 'health-test', map: 'map' });
}

test('#716 actual remote application observes heal then damage between HUD frames, repeats never refresh', async () => {
  const f = await rig(); expired(f); const nm = remote(f); f.G.time = 4;
  f.enemy.net.cur.hp = 70; nm.applyRemote(f.enemy, 1 / 60);
  f.enemy.net.cur.hp = 60; nm.applyRemote(f.enemy, 1 / 60);
  assert.equal(f.enemy.hp, 60); assert.equal(f.show(4), true);
  f.G.time = 6; nm.applyRemote(f.enemy, 1 / 60); assert.equal(f.show(7), false);
  f.enemy.net.cur.hp = 80; nm.applyRemote(f.enemy, 1 / 60); assert.equal(f.show(7), false);
});

test('#716 unready remote sample cannot record damage; remote respawn clears prior observation', async () => {
  const f = await rig(); expired(f); const nm = remote(f); f.G.time = 4;
  f.enemy.net.ready = false; f.enemy.net.cur.hp = 20; nm.applyRemote(f.enemy, 1 / 60);
  assert.equal(f.enemy.hp, 50); assert.equal(f.show(4), false);
  f.enemy.net.ready = true; nm.applyRemote(f.enemy, 1 / 60); assert.equal(f.show(4), true);
  nm._remoteRespawn(f.enemy); assert.equal(f.show(4), false);
});

test('#716 ACK-only arrivals cannot fabricate damage windows, regardless of accepted or rejected status', async () => {
  const f = await rig(); expired(f); f.G.time = 4;
  const { viewer: a, enemy: b } = f;
  a.owner = 'local'; a.nid = 1; a.netLife = 2; b.owner = 'enemy'; b.nid = 2; b.netLife = 3; b.remote = true;
  // New-life baseline is already damaged. ACKs have no safe one-to-one
  // correlation with snapshots, so only applied HP owns this display clock.
  assert.equal(f.show(4), false);
  const nm = new f.NetMatch({ myId: 'local', tr: { sendTo: () => true } }, { id: 'round-1' });
  nm.byNid = new Map([[1, a], [2, b]]);
  nm.sendHit(a, b, 10, 'shooter'); assert.equal(f.show(4), false, 'prediction');
  const receipt = { m: 'round-1', h: nm._hitSeq, a: 1, v: 2, d: 10, kld: 0, vl: 3 };
  nm._hitAck(receipt, 'forged'); assert.equal(f.show(4), false, 'wrong sender');
  nm._hitAck({ ...receipt, m: 'other-round' }, 'enemy'); assert.equal(f.show(4), false, 'wrong match');
  nm._hitAck(receipt, 'enemy'); assert.equal(f.show(4), false, 'ACK alone has no HP observation');
  f.G.time = 6; nm._hitAck(receipt, 'enemy'); assert.equal(f.show(7), false, 'duplicate receipt');
  nm.sendHit(a, b, 10, 'shooter');
  nm._hitAck({ ...receipt, h: nm._hitSeq, d: 0 }, 'enemy'); assert.equal(f.show(7), false, 'armor-only receipt');
  nm.sendHit(a, b, 10, 'shooter'); const oldLife = { ...receipt, h: nm._hitSeq };
  b.netLife = 4; nm._hitAck(oldLife, 'enemy'); assert.equal(f.show(7), false, 'old life');
});

test('#716 observers install independently/idempotently and preserve return values and exceptions', async () => {
  const f = await rig(), G = { time: 4 }, token = {}, failure = new Error('original failure');
  class Actor {
    constructor() { this.alive = true; this.hp = 70; this.netLife = 1; }
    damage(amount) { if (amount === 'throw') throw failure; this.hp -= amount; return token; }
    reset(mode) { if (mode === 'throw') throw failure; this.hp = 100; return token; }
  }
  class NetMatch {
    applyRemote(actor, hp, life = actor.netLife) { if (hp === 'throw') throw failure; actor.hp = hp; actor.netLife = life; return token; }
    _remoteRespawn(actor, mode) { if (mode === 'throw') throw failure; actor.hp = 100; return token; }
  }
  let subscriptions = 0; const on = () => { subscriptions++; };
  f.installHealthHitObserver({ Actor, G });
  const wrappedDamage = Actor.prototype.damage;
  f.installHealthHitObserver({ Actor, NetMatch, G, on });
  const wrappedApply = NetMatch.prototype.applyRemote;
  f.installHealthHitObserver({ Actor, NetMatch, G, on });
  assert.equal(Actor.prototype.damage, wrappedDamage); assert.equal(NetMatch.prototype.applyRemote, wrappedApply); assert.equal(subscriptions, 0, 'no independent event clock can double-count the same HP change');
  const actor = new Actor(), nm = new NetMatch();
  assert.equal(actor.damage(1), token); assert.equal(f.healthHitAge(actor, 4), 0);
  assert.throws(() => actor.damage('throw'), e => e === failure);
  assert.equal(actor.reset(), token); assert.equal(f.healthHitAge(actor, 4), Infinity);
  assert.throws(() => actor.reset('throw'), e => e === failure);
  assert.equal(nm.applyRemote(actor, 60), token); assert.equal(f.healthHitAge(actor, 4), 0);
  assert.throws(() => nm.applyRemote(actor, 'throw'), e => e === failure);
  assert.equal(nm._remoteRespawn(actor), token); assert.equal(f.healthHitAge(actor, 4), Infinity);
  assert.throws(() => nm._remoteRespawn(actor, 'throw'), e => e === failure);
  nm.applyRemote(actor, 50, 2); assert.equal(f.healthHitAge(actor, 4), Infinity, 'new-life snapshot is a baseline, not an artificial hit');
  nm.applyRemote(actor, 45, 2); assert.equal(f.healthHitAge(actor, 4), 0, 'new same-life damage is observed');
});

test('#716 real dead Actor and reset do not resurrect a stale bar; fresh post-reset damage does', async () => {
  const f = await rig(); expired(f); f.G.time = 4; f.enemy.damage(1, f.viewer, 'shooter');
  f.enemy.splat(null, 'test'); assert.equal(f.show(4), false);
  f.enemy.reset(); f.enemy.invuln = 0; assert.equal(f.show(4), false);
  f.enemy.damage(1, f.viewer, 'shooter'); assert.equal(f.show(4), true);
});

for (const ackFirst of [false, true]) test(`#716 paired accepted ACK/snapshot order ackFirst=${ackFirst} has only the applied-HP clock`, async () => {
  const f = await rig(), { viewer: a, enemy: b } = f;
  a.owner = 'local'; a.nid = 1; a.netLife = 2; b.owner = 'enemy'; b.nid = 2; b.netLife = 3; b.remote = true; b.hp = 50;
  remote(f); b.owner = 'enemy';
  const nm = new f.NetMatch({ myId: 'local', isHost: true, hostId: 'local',
    _members: new Map([['local', {}], ['enemy', {}]]), tr: { sendTo: () => true, broadcast() {} } }, { id: 'round-1' });
  nm.byNid = new Map([[1, a], [2, b]]);
  let confirmations = 0; f.on('combat:confirmed', () => confirmations++);
  assert.equal(f.show(0), false); f.G.time = 4; nm.sendHit(a, b, 10, 'shooter');
  const receipt = { m: 'round-1', h: nm._hitSeq, a: 1, v: 2, d: 10, kld: 0, vl: 3 };
  assert.ok(nm._pendingHits.has(receipt.h));
  const ack = () => nm._hitAck(receipt, 'enemy');
  const snapshot = () => { b.net.cur.hp = 40; nm.applyRemote(b, 1 / 60); };
  if (ackFirst) ack(); else snapshot();
  assert.equal(f.show(4), !ackFirst, 'ACK does not guess HP damage before an applied sample');
  f.G.time = 4.2; if (ackFirst) snapshot(); else ack();
  assert.equal(confirmations, 1, 'the real transport admitted exactly one positive receipt');
  assert.equal(nm._pendingHits.has(receipt.h), false);
  const snapshotAt = ackFirst ? 4.2 : 4;
  assert.ok(Math.abs(f.healthHitAge(b, 4.2) - (4.2 - snapshotAt)) < 1e-9);
  assert.equal(f.show(snapshotAt + 2.999), true);
  assert.equal(f.show(snapshotAt + 3), false);
});

test('#716 observing the same completed HP change through damage then remote application cannot refresh twice', async () => {
  const f = await rig(); expired(f); f.G.time = 4;
  f.enemy.damage(5, f.viewer, 'shooter'); assert.equal(f.show(4), true);
  const nm = remote(f); f.G.time = 4.2; nm.applyRemote(f.enemy, 1 / 60);
  assert.ok(Math.abs(f.healthHitAge(f.enemy, 4.2) - .2) < 1e-9);
  assert.equal(f.show(7), false);
});
