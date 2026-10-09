// Host-authoritative Boss timeline admission (issue #569) against the ACTUAL
// adapted NetMatch: only the session's current host may add a hazard move
// ('bm') or a crablet burst ('bc') through a peer's event queue. recBoss()
// records those two kinds only on the host, so a guest-originated record that
// reaches Boss.onMove / Boss._crabBurst would either turn into authoritative
// hazard damage on the simulating host or desync every guest's crablet state.
// The fixture composes the real adapter chain; { network: false } omits the
// network adapter so the same sources reproduce the reported baseline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

const MOVE = { id: 'slam', t0: 1000, s: 0, d: [1.15, 1.9, 1], p: { x: 0, y: 0, z: 0 } };

// Native Boss.onMove / Boss._crabBurst admission, recorded instead of drawn:
// the contract under test is whether NetMatch hands the record over at all.
function bossStub(sim) {
  return {
    sim, net: { buf: [] }, crabs: new Map(),
    hz: { moves: [], add(m) { this.moves.push(m); } },
    bursts: [],
    onMove(m) { if (m && typeof m.t0 === 'number') this.hz.add(m); },
    _crabBurst(id, x, y, z, killed) { this.bursts.push([id, x, y, z, !!killed]); },
  };
}

// myId 'me' hosting: every peer id is a guest.
function hostMatch(f) {
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me'], ['p2', 'P2'], ['p3', 'P3']]));
  f.bind(nm, []);
  nm.match.boss = bossStub(true);
  return nm;
}

// myId 'p2' as a guest: the current host is 'host', 'p3' is another guest.
function guestMatch(f) {
  const nm = f.makeNetMatch(f.makeSession('p2', 'host', [['host', 'Host'], ['p2', 'P2'], ['p3', 'P3']]));
  f.bind(nm, []);
  nm.match.boss = bossStub(false);
  nm.peers.set('host', { tr: 1000 });
  nm.peers.set('p3', { tr: 1000 });
  return nm;
}

test('a guest cannot push a hazard move into the simulating host', async () => {
  const f = await fixture();
  const nm = hostMatch(f);
  nm._play('p2', [1000, 'bm', MOVE]);
  nm._play('p3', [1000, 'bm', { ...MOVE, t0: 1001 }]);
  assert.equal(nm.match.boss.hz.moves.length, 0, 'a guest Boss move reached the simulating host');
});

test('negative control: without the network adapter the same guest record mutates the host', async () => {
  const f = await fixture({ network: false });
  const nm = hostMatch(f);
  nm._play('p2', [1000, 'bm', MOVE]);
  assert.equal(nm.match.boss.hz.moves.length, 1, 'the baseline does not reproduce the reported root');
});

test('a guest applies Boss records only from the current host, exactly once', async () => {
  const f = await fixture();
  const nm = guestMatch(f);
  const move = [1000, 'bm', MOVE], burst = [1000, 'bc', 3, 1, 0, 2, 0];
  move._netSeq = 1; burst._netSeq = 2;
  nm._play('host', move);
  nm._play('host', burst);
  assert.equal(nm.match.boss.hz.moves.length, 1, 'the host move record did not apply');
  assert.deepEqual(nm.match.boss.bursts, [[3, 1, 0, 2, false]], 'the host crablet burst did not apply');
  // the exact record replayed: the sequence gate must keep it single-shot
  nm._play('host', move);
  assert.equal(nm.match.boss.hz.moves.length, 1, 'a duplicate host move applied twice');
  // an equal-shaped record from a peer that is not the host
  nm._play('p3', [1000, 'bm', { ...MOVE, t0: 1001 }]);
  nm._play('p3', [1000, 'bc', 4, 1, 0, 2, 1]);
  assert.equal(nm.match.boss.hz.moves.length, 1, 'a non-host peer added a hazard move');
  assert.equal(nm.match.boss.bursts.length, 1, 'a non-host peer added a crablet burst');
});

test('negative control: without the network adapter a peer that is not the host applies both', async () => {
  const f = await fixture({ network: false });
  const nm = guestMatch(f);
  nm._play('p3', [1000, 'bm', MOVE]);
  nm._play('p3', [1000, 'bc', 4, 1, 0, 2, 1]);
  assert.equal(nm.match.boss.hz.moves.length, 1, 'the baseline does not reproduce the guest root');
  assert.equal(nm.match.boss.bursts.length, 1, 'the baseline does not reproduce the crablet root');
});

test('a host handoff retires the former host\'s Boss authority', async () => {
  const f = await fixture();
  const nm = guestMatch(f);
  nm._play('host', [1000, 'bm', MOVE]);
  assert.equal(nm.match.boss.hz.moves.length, 1);
  nm.s.hostId = 'p3';                                  // the session moved to a new host
  nm._play('host', [1001, 'bm', { ...MOVE, t0: 1001 }]);
  assert.equal(nm.match.boss.hz.moves.length, 1, 'the former host still holds Boss authority');
  nm._play('p3', [1001, 'bm', { ...MOVE, t0: 1001 }]);
  assert.equal(nm.match.boss.hz.moves.length, 2, 'the new host could not move the boss');
});

test('malformed Boss records are dropped before they can mutate Boss state', async () => {
  const f = await fixture();
  const nm = guestMatch(f);
  for (const bad of [null, 7, 'slam', { id: 'slam' }, { t0: NaN }]) nm._play('host', [1000, 'bm', bad]);
  nm._play('host', [1000, 'bc', '3', 1, 0, 2, 0]);
  nm._play('host', [1000, 'bc', 5, NaN, 0, 2, 0]);
  assert.equal(nm.match.boss.hz.moves.length, 0, 'a malformed move record was applied');
  assert.equal(nm.match.boss.bursts.length, 0, 'a malformed crablet burst was applied');
});

test('player, projectile and paint replay stay outside the Boss admission gate', async () => {
  const f = await fixture();
  const nm = guestMatch(f);
  const theirs = f.makeActor({ nid: 8, owner: 'host', remote: true, roller: false });
  f.bind(nm, [theirs]);
  nm.match.boss = bossStub(false);
  let splats = 0;
  f.G.paint.splat = () => { splats++; return 0; };
  // paint: no actor ownership, unchanged by the Boss gate
  nm._play('p3', [1000, 's', 0, 0, 0, 1, 1, 0.5, 0]);
  assert.equal(splats, 1, 'remote paint replay was blocked');
  // projectile: still owned by its sender
  const before = f.projectiles.list.length;
  nm._play('host', [1000, 'p', 8, 'shot', 'shooter', 0, 0, 2, 0, 0, 0, 0, 1, 0, 0.1, 0.1, 1, 0, 0, 0, 0.1, 0.8, 1.3, 0.03, 26, 0.3, 3, 0, 0.5, 11]);
  assert.equal(f.projectiles.list.length, before + 1, 'a legitimate ghost projectile was blocked');
});
