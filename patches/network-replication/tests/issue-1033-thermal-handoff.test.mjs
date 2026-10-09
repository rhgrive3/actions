import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

async function appliedHit(ackOwner) {
  const f = await fixture({ fullRuntime: true, productionComposition: true,
    extraExports: "export * from './patches/splatoon3/runtime/private-tracking.mjs';" });
  const attacker = f.make('shooter'), victim = f.make('shooter');
  Object.assign(attacker, { nid: 1, owner: 'S', remote: false, isLocal: true, team: 0, netLife: 2, alive: true });
  Object.assign(victim, { nid: 2, owner: 'OLD', remote: true, isLocal: false, team: 1, netLife: 5, alive: true, hp: 100 });
  attacker.s3.loadout[1].main = 'thermalInk';
  f.G.match = { mode: 'turf', state: 'playing', playing: () => true, local: attacker, actors: [attacker, victim] };
  f.G.actors = [attacker, victim];
  const sent = [], acks = [], confirmations = [];
  function net(myId, packets) {
    const nm = Object.create(f.NetMatch.prototype);
    Object.assign(nm, { myId, cfg: { map: 'normal' }, byNid: new Map([[1, attacker], [2, victim]]),
      hitNextSeq: 0, hitPending: new Map(), _hitSeq: 0, _pendingHits: new Map(), peers: new Map(),
      s: { hostId: 'H', _members: new Set(['S', 'OLD', 'NEW']),
        tr: { sendTo(to, data) { packets.push({ to, data }); return true; } } } });
    return nm;
  }
  const sender = net('S', sent);
  f.on('combat:confirmed', e => { if (e.attacker === attacker && e.victim === victim) confirmations.push(e); });
  f.withMainDirectDamage(attacker, victim, () => sender.sendHit(attacker, victim, 10, 'shooter'));
  const hit = sent[0].data;
  function apply(owner, packet) {
    attacker.remote = true; victim.remote = false;
    f.G.netm = net(owner, acks);
    f.G.projectiles = { applyHit: (a, v, damage, source) => v.damage(damage, a, source) };
    f.G.netm._hit(packet, 'S');
    attacker.remote = false; victim.remote = true;
    return acks.at(-1).data;
  }
  let ack;
  if (ackOwner === 'OLD') ack = apply('OLD', hit);
  victim.owner = 'NEW';
  sender.onMessage('__relay__', { k: 'hit_nack', seq: hit.seq, to: 'OLD' });
  assert.equal(sent.at(-1).to, 'NEW');
  if (ackOwner === 'NEW') ack = apply('NEW', sent.at(-1).data);
  assert.equal(victim.hp, 90, 'the owning peer applied one actual hit');
  assert.equal(ack.d, 10);
  return { f, attacker, victim, sender, ack, confirmations };
}

test('#1033 new owner authoritative ACK retains the Thermal Ink mark after routed delivery', async () => {
  const hit = await appliedHit('NEW');
  hit.sender.onMessage('NEW', hit.ack);
  assert.equal(hit.confirmations.length, 1);
  assert.equal(hit.confirmations[0].damage, 10);
  assert.equal(!!hit.f.thermalTrackingRecord(hit.victim, hit.attacker), true);
});

test('#1033 delayed superseded owner ACK settles its same-life hit and creates the shooter-private mark', async () => {
  const hit = await appliedHit('OLD');
  hit.sender.onMessage('OLD', hit.ack);
  assert.equal(hit.confirmations.length, 1);
  assert.equal(hit.confirmations[0].damage, 10);
  assert.equal(!!hit.f.thermalTrackingRecord(hit.victim, hit.attacker), true);
  assert.equal(hit.sender._pendingHits.size, 0);
  assert.equal(hit.sender.hitPending.size, 0);
});

test('#1033 an unauthenticated sender cannot turn a predecessor receipt into a Thermal Ink mark', async () => {
  const hit = await appliedHit('OLD');
  hit.sender.onMessage('INTRUDER', hit.ack);
  assert.equal(hit.confirmations.length, 0);
  assert.equal(hit.f.thermalTrackingRecord(hit.victim, hit.attacker), null);
  assert.equal(hit.sender._pendingHits.size, 1, 'a bogus sender cannot settle the receipt');
});

test('#1033 a zero-damage receipt does not create a Thermal Ink mark', async () => {
  const hit = await appliedHit('OLD');
  hit.sender.onMessage('OLD', { ...hit.ack, d: 0, kld: 0 });
  assert.equal(hit.confirmations.length, 0);
  assert.equal(hit.f.thermalTrackingRecord(hit.victim, hit.attacker), null);
  assert.equal(hit.sender._pendingHits.size, 0, 'the authenticated zero-damage receipt is retired');
});

test('#1033 a valid predecessor receipt for a stale victim life cannot create a Thermal Ink mark', async () => {
  const hit = await appliedHit('OLD');
  hit.victim.netLife++;
  hit.sender.onMessage('OLD', hit.ack);
  assert.equal(hit.confirmations.length, 0);
  assert.equal(hit.f.thermalTrackingRecord(hit.victim, hit.attacker), null);
  assert.equal(hit.sender._pendingHits.size, 0, 'the obsolete-life receipt is retired');
});

test('#1033 replaying a confirmed predecessor receipt cannot recreate an expired Thermal Ink mark', async () => {
  const hit = await appliedHit('OLD');
  hit.sender.onMessage('OLD', hit.ack);
  const record = hit.f.thermalTrackingRecord(hit.victim, hit.attacker);
  assert.ok(record);
  hit.f.G.time = record.until;
  hit.sender.onMessage('OLD', hit.ack);
  assert.equal(hit.confirmations.length, 1, 'the duplicate receipt emits no second confirmation');
  assert.equal(hit.f.thermalTrackingRecord(hit.victim, hit.attacker), null,
    'the duplicate cannot restamp the expired private mark');
});
