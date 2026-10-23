import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
  extraExports: "export { inkVacActorContact, inkVacAbsorbCandidate, inkVacState, advanceInkVacReplica, INK_VAC_EVENTS } from './patches/splatoon3/runtime/kit-ink-vac.mjs';" });
function world() {
  const { G, THREE } = f;
  G.projectiles.clear(); G.scene ||= new THREE.Scene(); G.actors = []; G.netm = null; G.time = 0;
  G.match = { state: 'playing', mode: 'turf', actors: G.actors, playing: () => true };
  G.physics = { los: () => true, raycast(_o, _d, _l, h) { h.hit = false; return h; }, segment(_a, _b, h) { h.hit = false; return h; } };
  const owner = f.make('charger'), target = f.make();
  owner.weapon = { ...owner.weapon, special: 'inkVac' };
  Object.assign(owner, { nid: 7, owner: 'A', remote: true });
  Object.assign(target, { nid: 2, owner: 'me', team: 1 }); target.pos.set(0, 0, 3);
  owner.aimDir.set(0, 0, 1); G.match.actors = G.actors;
  const s = { myId: 'me', hostId: 'B', isHost: false, _members: new Set(['me', 'A', 'B']),
    tr: { broadcast() { return true; }, sendTo() { return true; } } };
  const n = new f.NetMatch(s, { id: 'vac-replica-review', mode: 'turf', map: 'reef' });
  n.match = G.match; n.byNid = new Map([[7, owner], [2, target]]); n._setupActor(owner); G.netm = n;
  owner.net.cur = { f: 4096 };
  const event = (name, serial, from = owner.owner) => n.replayKitEvent(f.INK_VAC_EVENTS[name],
    { actor: owner, kit: 'inkVac', serial, charge: 0 }, from);
  return { owner, target, n, event };
}
function expand(w, hz) {
  w.event('activation', 50); w.owner.specialActive = { id: 'inkVac', net: true };
  for (let i = 0; i < hz; i++) f.advanceInkVacReplica(w.owner, 1 / hz);
  assert.equal(f.inkVacActorContact(w.owner, w.target), true, 'control: expanded live cone contacts the enemy');
}

for (const hz of [30, 60, 120]) test(`a missing Ink Vac end packet retires the entire replica at its bounded fallback, ${hz}Hz`, () => {
  const w = world();
  try {
    expand(w, hz);
    for (let i = 0; i < hz * 15; i++) f.advanceInkVacReplica(w.owner, 1 / hz);
    assert.ok(f.inkVacState(w.owner) === null);
    assert.equal(w.owner.specialActive, null, 'fallback must also release the stale native special token');
    assert.equal(f.inkVacActorContact(w.owner, w.target), false);
  } finally { w.n.dispose(); f.G.netm = null; }
});

test('native owner departure retires an active Ink Vac replica immediately and resets its sender ledger', () => {
  const w = world();
  try {
    expand(w, 60); w.n.onLeave('A', false);
    assert.equal(w.owner.owner, 'B');
    assert.ok(f.inkVacState(w.owner) === null, 'departed cone cannot drain ink while the new owner has no activation');
    w.event('activation', 1, 'B');
    assert.equal(f.inkVacState(w.owner)?.serial, 1, 'new sender need not exceed the former sender serial');
    w.event('dispose', 1, 'B');
    w.n.s.hostId = 'A'; w.n.onLeave('B', false); w.event('activation', 1, 'A');
    assert.equal(f.inkVacState(w.owner)?.serial, 1, 'returning name starts a new era, not its old tombstone');
  } finally { w.n.dispose(); f.G.netm = null; }
});

for (const transition of ['owner', 'life', 'local-adoption', 'match']) test(`a stale replica cannot contact or absorb after ${transition}`, () => {
  const w = world();
  try {
    expand(w, 60);
    const start = new f.THREE.Vector3(0, 1, 4), end = new f.THREE.Vector3(0, 1, 2);
    const shot = { team: 1, owner: w.target, damage: 30, pos: start.clone(), vel: end.clone().sub(start) };
    const candidate = f.inkVacAbsorbCandidate(w.owner, start, end, shot);
    assert.ok(candidate, 'control: live cone admits a real incoming shot');
    if (transition === 'owner') w.owner.owner = 'B';
    if (transition === 'life') w.owner.net.lastLife = 1;
    if (transition === 'local-adoption') w.owner.remote = false;
    if (transition === 'match') f.G.match = { state: 'playing', playing: () => true };
    assert.equal(f.inkVacActorContact(w.owner, w.target), false, 'old cone has no gameplay contact');
    assert.equal(f.inkVacAbsorbCandidate(w.owner, start, end, shot), null, 'no new absorption candidate');
    candidate.onHit(); assert.equal(shot.damage, 30, 'previously admitted callback cannot neutralize a shot in another era');
    f.advanceInkVacReplica(w.owner, 1 / 60);
    assert.ok(f.inkVacState(w.owner) === null, 'next replica advance retires its resources');
  } finally { w.n.dispose(); f.G.netm = null; }
});

test('same-sender Ink Vac tombstones still reject delayed activations', () => {
  const w = world();
  try {
    w.event('dispose', 1); w.event('activation', 1);
    assert.ok(f.inkVacState(w.owner) === null);
    w.event('activation', 2); assert.equal(f.inkVacState(w.owner)?.serial, 2);
    w.event('activation', 1, 'foreign'); assert.equal(f.inkVacState(w.owner)?.serial, 2);
  } finally { w.n.dispose(); f.G.netm = null; }
});
