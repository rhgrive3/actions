import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
function world() {
  const { G, THREE } = f;
  G.projectiles.clear(); G.scene ||= new THREE.Scene(); G.actors = []; G.netm = null; G.time = 0;
  G.match = { state: 'playing', mode: 'turf', playing: () => true, actors: G.actors };
  const owner = f.make('support'), target = f.make();
  Object.assign(owner, { nid: 7, owner: 'A', remote: true });
  Object.assign(target, { nid: 2, owner: 'me', team: 1 });
  G.match.actors = G.actors;
  const s = { myId: 'me', hostId: 'B', isHost: false, _members: new Set(['me', 'A', 'B']),
    tr: { broadcast() { return true; }, sendTo() { return true; } } };
  const n = new f.NetMatch(s, { id: 'support-owner-era', mode: 'turf', map: 'reef' });
  n.match = G.match; n.byNid = new Map([[7, owner], [2, target]]); n._setupActor(owner); G.netm = n;
  return { owner, target, n };
}

for (const returnToFirstOwner of [false, true]) test(`sensor mark resolves its own owner era even when serial 1 is reused; return=${returnToFirstOwner}`, () => {
  const { owner, target, n } = world();
  const birth = (from, x) => {
    owner.pos.x = x;
    n._play(from, [1, 'ks', 'p', 7, 1, x, .7, 0, 0, 0, 0, 0]);
  };
  try {
    birth('A', 0); n.onLeave('A', false); assert.equal(owner.owner, 'B');
    birth('B', 12);
    if (returnToFirstOwner) { n.s.hostId = 'A'; n.onLeave('B', false); birth('A', 24); }
    target.pos.set(owner.pos.x, 0, 0);
    n._play(owner.owner, [1, 'ks', 'm', 7, 1, 2, 0, 480, 0, 'l']);
    assert.ok(target.s3.revealedUntil?.[0] > 0, 'an older same-serial field cannot shadow the current field');
    const active = f.G.projectiles._s3SupportSensors.find(s => s.pos.x === owner.pos.x);
    assert.equal(active.seen.get(target), 0, 'contact belongs to the newly admitted field');
    assert.ok(f.G.projectiles._s3SupportSensors.filter(s => s !== active).every(s => !s.seen.has(target)));
  } finally { n.dispose(); f.G.netm = null; }
});

test('same-owner simultaneous sensor fields keep their independent mark identities', () => {
  const { owner, target, n } = world();
  try {
    n._play('A', [1, 'ks', 'p', 7, 1, 0, .7, 0, 0, 0, 0, 0]);
    owner.pos.x = 12;
    n._play('A', [1, 'ks', 'p', 7, 2, 12, .7, 0, 0, 0, 0, 0]);
    target.pos.set(0, 0, 0);
    n._play('A', [1, 'ks', 'm', 7, 1, 2, 0, 480, 0, 'l']);
    assert.ok(target.s3.revealedUntil?.[0] > 0);
    assert.equal(f.G.projectiles._s3SupportSensors[1].seen.has(target), false);
  } finally { n.dispose(); f.G.netm = null; }
});
