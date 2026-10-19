import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { validForwardedEventPayload } from '../snapshot-guard.mjs';

const slam = (overrides = {}) => ({
  actor: { n: 17 }, pos: [2, 0, 3], radius: 5.2, ...overrides,
});

test('#1283 native Slam wire schema accepts owner-produced data and rejects poisonous fields', () => {
  assert.equal(validForwardedEventPayload('special:slam', slam()), true);
  assert.equal(validForwardedEventPayload('superjump', { actor: { n: 17 }, to: [2, 0, 3] }), true);
  assert.equal(validForwardedEventPayload('weapon:fire', { actor: { n: 17 }, dir: [0, 0, 1] }), true);
  for (const bad of [
    { pos: undefined }, { pos: null }, { pos: [] }, { pos: [1, 2] },
    { pos: [1, 2, 3, 4] }, { pos: [1, '2', 3] },
    { pos: [NaN, 0, 0] }, { pos: [Infinity, 0, 0] }, { pos: [1e100, 0, 0] },
    { pos: { x: 2, y: 0, z: 3 } }, { radius: 0 }, { radius: -1 },
    { radius: NaN }, { radius: Infinity }, { radius: 1e100 },
    { actor: null }, { actor: { n: '17' } }, { actor: { n: -1 } },
    { actor: { n: 17.5 } },
  ]) assert.equal(validForwardedEventPayload('special:slam', slam(bad)), false,
    'malformed Slam accepted: ' + JSON.stringify(bad));
  for (const bad of [null, [], 'wire', 22]) {
    assert.equal(validForwardedEventPayload('special:slam', bad), false);
  }
  assert.equal(validForwardedEventPayload('superjump', { actor: { n: 17 }, to: [0, Infinity, 0] }), false);
  assert.equal(validForwardedEventPayload('weapon:fire', { actor: { n: 17 }, dir: [0, NaN, 1] }), false);
});

test('#1283 malformed owner Slam does not block subsequent valid Slam, trigger, paint and projectile', async () => {
  const f = await fixture();
  const members = [['me', 'Me'], ['p2', 'P2']];
  const receiver = f.makeNetMatch(f.makeSession('me', 'me', members));
  const remote = f.makeActor({ nid: 17, owner: 'p2', remote: true, roller: false });
  const local = f.makeActor({ nid: 19, owner: 'me', remote: false, roller: false });
  f.bind(receiver, [remote, local]);

  const seen = { slam: 0, audio: 0, triggers: [], paint: 0 };
  f.G.fx = { explosion(pos, _color, radius) {
    assert.equal(pos.x, 2); assert.equal(pos.y, .3); assert.equal(pos.z, 3);
    assert.equal(radius, 5.2); seen.slam++;
  }, muzzle() {} };
  f.G.audio = { play(name) { if (name === 'special_slam') seen.audio++; } };
  f.G.paint = { splat() { seen.paint++; return 0; } };
  remote.character._netTrig = name => { seen.triggers.push(name); };

  const bad = [1000, 'ev', 'special:slam', { actor: { n: 17 }, radius: 5.2 }, 100, 1];
  f.clock.set(1000);
  receiver.onMessage('p2', { k: 't', ts: 1000, u: 100, r: 2, e: [bad] });
  const peer = receiver._peer('p2');
  assert.equal(peer.events.length, 0, 'malformed Slam must not enter the playback queue');
  assert.equal(peer._lastEventSeq ?? 0, 0, 'malformed Slam must not consume replay identity');
  assert.equal(seen.slam, 0);

  f.clock.advance(0.05); f.G.time = 103 / 60;
  const sender = f.makeNetMatch(f.makeSession('p2', 'me', members));
  sender._rec(['ev', 'special:slam', slam()]);
  sender._rec(['tr', 17, 'jump', null]);
  const owner = f.makeActor({ nid: 17, owner: 'p2', remote: false, roller: false });
  owner.character.getMuzzle = out => out.copy(owner.pos).setY(30);
  sender.byNid.set(owner.nid,owner);
  sender.recSplat(new f.THREE.Vector3(1, 0, 1), 0.4, 0, { seed: .31,claimOwner:owner });
  f.G.netm = sender;
  f.projectiles.fireShooter(owner, owner.weapon, 0);
  const projectile = sender.out.filter(e => e[1] === 'p');
  assert.equal(projectile.length, 1, 'native owner emits one replayable projectile birth');
  const legitimate = structuredClone(sender.out);
  f.projectiles.clear();
  f.G.netm = receiver;

  assert.doesNotThrow(() => receiver.onMessage('p2', {
    k: 't', ts: 1000.05, u: 103, r: 2, e: legitimate,
  }));
  peer.tr = 1000.05; peer.sim = 103;
  assert.doesNotThrow(() => receiver._playEvents());
  assert.equal(peer.events.length, 0);
  assert.equal(peer._lastEventSeq, legitimate.at(-1).at(-1));
  assert.equal(seen.slam, 1, 'valid native Slam keeps its explosion');
  assert.equal(seen.audio, 1, 'valid native Slam keeps its sound');
  assert.deepEqual(seen.triggers, ['jump']);
  assert.equal(seen.paint, 1, 'valid paint after malformed Slam still applies');
  assert.equal(f.projectiles.list.filter(p => p.ghost).length, 1, 'valid projectile still replays');

  peer.tr = 1001; peer.sim = 1000;
  receiver._playEvents();
  assert.equal(seen.slam, 1, 'already-replayed Slam stays exactly once');
  assert.equal(seen.paint, 1, 'paint remains exactly once');
});

test('#1283 direct replay rejects malformed or wrong-owner Slam before consuming sequence', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me'], ['p2', 'P2'], ['p3', 'P3']]));
  const remote = f.makeActor({ nid: 17, owner: 'p2', remote: true, roller: false });
  f.bind(nm, [remote]);
  const peer = nm._peer('p2');
  const invalid = [1000, 'ev', 'special:slam', { actor: { n: 17 }, radius: 5.2 }, 100, 1];
  invalid._netSeq = 1; invalid._netTick = 100;
  assert.doesNotThrow(() => nm._play('p2', invalid));
  assert.equal(peer._lastEventSeq ?? 0, 0);
  assert.doesNotThrow(() => nm._playEvent('special:slam', null));
  assert.doesNotThrow(() => nm._playEvent('special:slam', { actor: { n: 17 }, pos: null, radius: 5.2 }));
  assert.equal(peer._lastEventSeq ?? 0, 0);

  const forged = [1000, 'ev', 'special:slam', slam(), 100, 1];
  forged._netSeq = 1; forged._netTick = 100;
  nm._peer('p3');
  assert.doesNotThrow(() => nm._play('p3', forged));
  assert.equal(nm._peer('p3')._lastEventSeq ?? 0, 0, 'foreign owner cannot claim a valid Slam');

  let explosions = 0;
  f.G.fx = { explosion() { explosions++; } };
  const legitimate = [1000, 'ev', 'special:slam', slam(), 100, 1];
  legitimate._netSeq = 1; legitimate._netTick = 100;
  assert.doesNotThrow(() => nm._play('p2', legitimate));
  assert.equal(explosions, 1);
  assert.equal(peer._lastEventSeq, 1);
});
