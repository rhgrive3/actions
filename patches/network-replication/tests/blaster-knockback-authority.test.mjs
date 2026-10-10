import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

function damageActor(actor) {
  actor.netLife = 0;
  actor.damage = function (amount) { if (this.invuln > 0) return false; this.hp -= amount; return false; };
  return actor;
}
async function view(id) {
  const f = await fixture();
  const sent = [], nm = f.makeNetMatch(f.makeSession(id, 'p1', [['p1','attacker'],['p2','victim']]));
  // The real relay reports successful admission explicitly. Capturing a packet
  // without returning true instead simulates a rejected send and correctly
  // retires the pending hit before any acknowledgement can arrive.
  nm.s.tr.sendTo = (to, packet) => { sent.push({ to, packet: structuredClone(packet) }); return true; };
  // Production victim-owner receipts are broadcast to current participants.
  // The socket-free fixture must observe that authenticated ACK channel too.
  nm.s.tr.broadcast = packet => { sent.push({ to: 'broadcast', packet: structuredClone(packet) }); return true; };
  const attacker = damageActor(f.makeActor({ nid: 1, owner: 'p1', remote: id !== 'p1', team: 0, roller: false }));
  const victim = damageActor(f.makeActor({ nid: 2, owner: 'p2', remote: id !== 'p2', team: 1, roller: false }));
  attacker.weapon = f.WEAPONS.blaster;
  f.bind(nm, [attacker, victim]); f.G.actors = [attacker, victim];
  victim.pos.set(2, 0, 0); victim.vel.set(0, 0, 0);
  const p = { type: 'blast', wid: 'blaster', s3Weapon: attacker.weapon, owner: attacker, team: 0, ghost: id !== 'p1' };
  return { ...f, sent, nm, attacker, victim, p, burst: () => f.projectiles._blastBurst(p, new f.THREE.Vector3(0,.7,0), null) };
}

test('#574 attacker routes geometry; recipient applies one impulse and ghost/repeated packet cannot duplicate it', async () => {
  const a = await view('p1'), b = await view('p2');
  try {
    a.burst();
    const packets = a.sent.filter(x => x.packet.k === 'hit');
    assert.equal(packets.length, 1); const packet = packets[0].packet;
    assert.deepEqual(packet.kb, [2, 0, 0]);
    assert.equal(a.victim.hp, 100); assert.equal(a.victim.vel.length(), 0);
    b.nm.onMessage('p1', packet);
    assert.ok(b.victim.hp < 100); assert.ok(b.victim.vel.x > 0);
    const hp = b.victim.hp, velocity = b.victim.vel.clone();
    b.nm.onMessage('p1', packet); b.burst();
    assert.equal(b.victim.hp, hp); assert.deepEqual(b.victim.vel.toArray(), velocity.toArray());
    assert.deepEqual(b.packActor(b.victim).slice(4,7), Array.from(velocity.toArray()).map(x => Math.round(x*1000)/1000));
    assert.equal(a.nm._s3BlasterKnockback, undefined, 'scoped send metadata is restored');
  } finally { a.nm.dispose(); b.nm.dispose(); }
});

test('#574 network annulus keeps zero HP damage, one bounded impulse, retry metadata and an ordinary zero-damage acknowledgement', async () => {
  const a = await view('p1'), b = await view('p2');
  try {
    a.victim.pos.x = 3.4; a.burst();
    const packet = a.sent.find(x => x.packet.k === 'hit').packet;
    assert.equal(packet.d, 0); assert.deepEqual(packet.kb, [3.4, 0, 0]);
    const pending = a.nm.hitPending.get(packet.seq);
    assert.ok(pending, 'accepted relay send retains a retryable delivery record');
    // Compare element values: the structured-clone packet and the live record may come from different realms.
    assert.deepEqual([...pending[0].kb], [...packet.kb], 'retry retains exactly the original bounded knockback geometry');
    b.nm.onMessage('p1', packet); b.nm.onMessage('p1', packet);
    assert.equal(b.victim.hp, 100); assert.ok(b.victim.vel.x > 0);
    const ack = b.sent.find(x => x.packet.k === 'hit_ack').packet;
    assert.equal(ack.d, 0); assert.equal(ack.kld, 0);
    a.nm.onMessage('p2', ack); assert.equal(a.nm._pendingHits.size, 0);
  } finally { a.nm.dispose(); b.nm.dispose(); }
});

test('#574 malformed geometry, negative/ordinary zero damage, wrong sender, stale life, friendly/dead/invulnerable victims cannot push', async () => {
  const f = await view('p2');
  try {
    let h = 0;
    // #1185: a hit is admitted only with the creating match id; the hand-built packets must carry it.
    const base = () => ({ k:'hit', m:f.nm.cfg.id, v:2, a:1, d:50, w:'blaster', l:0, h:++h, kb:[2,0,0] });
    const invalid = [
      { kb:[Infinity,0,0] }, { kb:[NaN,0,0] }, { kb:[3.5,0,0] }, { kb:[1,0] },
      { kb:[0,0,0] }, { kb:'2,0,0' }, { kb:[100,0,0] }, { d:-1 },
      { d:0, kb:undefined }, { w:'shooter', d:0 }, { l:1 },
    ];
    for (const fields of invalid) f.nm.onMessage('p1', { ...base(), ...fields });
    f.nm.onMessage('impostor', base());
    f.victim.team=0; f.nm.onMessage('p1', base()); f.victim.team=1;
    f.victim.alive=false; f.nm.onMessage('p1', base()); f.victim.alive=true;
    f.victim.invuln=1; f.nm.onMessage('p1', base()); f.nm.onMessage('p1', { ...base(), d:0 });
    assert.equal(f.victim.hp, 100); assert.equal(f.victim.vel.length(), 0);
    f.victim.invuln=0;
    f.nm.onMessage('p1', { ...base(), kb:undefined });
    assert.equal(f.victim.hp, 50, 'ordinary/direct Blaster hit remains independently admitted');
    assert.equal(f.victim.vel.length(), 0, 'no speculative direct-hit knockback');
    f.nm.onMessage('p1', base()); assert.ok(f.victim.vel.x > 0);
  } finally { f.nm.dispose(); }
});

test('#574 scoped wire metadata restores after send failure and cannot leak to a later hit', async () => {
  const f = await view('p1');
  try {
    const send = f.nm.sendHit;
    f.nm.sendHit = () => { throw new Error('send failure'); };
    assert.throws(f.burst, /send failure/);
    assert.equal(f.nm._s3BlasterKnockback, undefined);
    f.nm.sendHit = send;
    f.projectiles.applyHit(f.attacker, f.victim, 10, 'blaster');
    assert.equal(f.sent.find(x => x.packet.k === 'hit').packet.kb, undefined);
  } finally { f.nm.dispose(); }
});
