import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, emitMainShot } from '../../splatoon3/tests/source-fixture.mjs';

async function appliedHit(ackOwner) {
  const clock = { ms: 1000 };
  async function endpoint(myId, packets) {
    const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
      vmPerformance: { now: () => clock.ms },
      extraExports: "export * from './patches/splatoon3/runtime/private-tracking.mjs';" });
    const attacker = f.make('shooter'), victim = f.make('shooter');
    Object.assign(attacker, { nid: 1, owner: 'S', team: 0, netLife: 2, alive: true });
    Object.assign(victim, { nid: 2, owner: myId === 'NEW' ? 'NEW' : 'OLD', team: 1, netLife: 5, alive: true, hp: 100, invuln: 0 });
    attacker.pos.set(0, 0, 0); victim.pos.set(0, 0, 3); attacker.aimDir.set(0, 0, 1);
    attacker.s3.loadout[1].main = 'thermalInk';
    const match = { mode: 'turf', state: 'playing', time: 180, playing: () => true, actors: [attacker, victim] };
    const session = { myId, hostId: 'S', isHost: myId === 'S', _members: new Map([['S', {}], ['OLD', {}], ['NEW', {}]]),
      tr: { sendTo(to, data) { packets.push({ to, data: JSON.parse(JSON.stringify(data)) }); return true; },
        broadcast(data) { packets.push({ to: '*', data: JSON.parse(JSON.stringify(data)) }); return true; } } };
    const nm = new f.NetMatch(session, { id: 'match-1', map: 'normal' });
    nm.bind(match); session.match = nm; f.G.netm = nm; f.G.match = match; f.G.actors = match.actors;
    return { f, attacker, victim, nm };
  }
  const sent = [], acks = [], confirmations = [];
  const tx = await endpoint('S', sent), rx = await endpoint(ackOwner, acks);
  const { f, attacker, victim, nm: sender } = tx;
  f.on('combat:confirmed', e => { if (e.attacker === attacker && e.victim === victim) confirmations.push(e); });
  emitMainShot(f, attacker);
  assert.equal(sender._sendTick(), true, 'native owner tick is emitted');
  const tick = sent.find(p => p.data.k === 't')?.data;
  assert.ok(tick?.e.some(e => e[1] === 'p' || e[1] === 'ev' && e[2] === 'weapon:fire'), 'native main birth travels in owner tick');
  rx.nm.onMessage('S', tick);
  assert.ok(rx.nm._combatProvenance?.proofs.get('S')?.length, 'receiver accepted actual main birth proof');
  f.withMainDirectDamage(attacker, victim, () => sender.sendHit(attacker, victim, 10, 'shooter'));
  const hit = sent.find(p => p.data.k === 'hit').data;
  function apply(packet) {
    rx.nm.onMessage('S', packet);
    const ack = acks.find(p => p.data.k === 'hit_ack')?.data;
    assert.ok(ack, 'owning endpoint sends authoritative hit ACK');
    return ack;
  }
  let ack;
  if (ackOwner === 'OLD') ack = apply(hit);
  victim.owner = 'NEW';
  sender.onMessage('__relay__', { k: 'hit_nack', seq: hit.seq, to: 'OLD' });
  assert.equal(sent.at(-1).to, 'NEW');
  if (ackOwner === 'NEW') ack = apply(sent.at(-1).data);
  assert.equal(rx.victim.hp, 90, 'the owning peer applied one actual hit');
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
