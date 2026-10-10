import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptMatchHitIdentity } from '../hit-round-adapter.mjs';

const template = `class NetMatch {
  constructor(id, send) {
    this.cfg = { id }; this.hitNextSeq = 0; this.hitPending = new Map();
    this.hits = []; this.acks = [];
    this.s = { tr: { sendTo(to, d) { send(d); }, broadcast(d) { send(d); } } };
  }
  sendHit(attacker, victim, dmg, wid) {
    const message = { k: 'hit', v: victim.nid, a: attacker.nid, d: dmg, w: wid,
      seq: ++this.hitNextSeq };
    this.hitPending.set(message.seq, { message });
    this.s.tr.sendTo(victim.owner, message);
    return true;
  }
  sendAck() {
    const ack = { k: 'hit_ack', h: 1 };
    if (typeof this.s.tr?.broadcast === 'function') this.s.tr.broadcast(ack);
  }
  _hit(d, from) { this.hits.push([d, from]); }
  _hitAck(d, from) { this.acks.push([d, from]); }
  onMessage(from, d) {
    switch (d.k) {
      case 'hit': this._hit(d, from); break;
      case 'hit_ack': this._hitAck(d, from); break;
    }
  }
}`;
const NetMatch = new Function(adaptMatchHitIdentity('src/net/netmatch.js', template) + '\nreturn NetMatch;')();

test('#1185 old-match and untagged hits/ACKs never mutate the new match', () => {
  const sent = [];
  const old = new NetMatch('round-old', d => sent.push(d));
  old.sendHit({ nid: 1 }, { nid: 2, owner: 'victim' }, 36, 'shooter');
  old.sendAck();
  const fresh = new NetMatch('round-new', () => {});
  for (const packet of sent) fresh.onMessage('sender', packet);
  fresh.onMessage('sender', { k: 'hit', seq: 1 });
  fresh.onMessage('sender', { k: 'hit_ack', h: 1 });
  assert.equal(fresh.hits.length, 0);
  assert.equal(fresh.acks.length, 0);
  assert.equal(fresh.hitPending.size, 0);
  assert.deepEqual(sent.map(p => p.m), ['round-old', 'round-old']);
});

test('#1185 matching in-round traffic remains accepted, distinct instance can reuse sequence 1', () => {
  const sent = [];
  const owner = new NetMatch('round-new', d => sent.push(d));
  owner.sendHit({ nid: 1 }, { nid: 2, owner: 'victim' }, 36, 'shooter');
  owner.sendAck();
  for (const packet of sent) owner.onMessage('sender', packet);
  assert.equal(owner.hits.length, 1);
  assert.equal(owner.acks.length, 1);
  assert.equal(owner.hits[0][0].seq, 1);
  assert.equal(owner.acks[0][0].h, 1);
});

test('#1185 unrelated packets and unrelated source paths are untouched', () => {
  assert.equal(adaptMatchHitIdentity('src/main.js', 'original'), 'original');
  const x = new NetMatch('r', () => {});
  x.onMessage('peer', { k: 't' });
  assert.equal(x.hits.length, 0);
  assert.equal(x.acks.length, 0);
});
