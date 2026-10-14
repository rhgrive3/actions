import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { createRankedEffects } from '../runtime/ranked/combat.mjs';

async function makeHarness() {
  const f = await fixture();
  const { G, THREE } = f;
  const calls = { damage: [], rings: [], paints: [], packets: [], sceneAdds: [], sceneRemoves: [] };
  G.scene = {
    add(value) { calls.sceneAdds.push(value); },
    remove(value) { calls.sceneRemoves.push(value); },
  };
  G.fx = { ring(...args) { calls.rings.push(args); } };
  G.paint = { splat(...args) { calls.paints.push(args); return 0; } };
  G.physics.los = () => true;
  G.physics.segment = (_start, _end, hit) => {
    hit.hit = false;
    hit.dist = 0;
    return hit;
  };
  G.netm = null;

  const match = { state: 'playing', actors: [], ranked: { revision: 0 } };
  const api = {
    G,
    THREE,
    Hit: f.Hit,
    emit(name, event) { calls[name] ||= []; calls[name].push(event); },
  };
  const effects = createRankedEffects(api, match);
  function actor(nid, team, pos, extra = {}) {
    return {
      nid, slot: 0, team, remote: false, alive: true,
      pos: new THREE.Vector3(...pos),
      damage(amount, attacker, source) {
        calls.damage.push({ victim: this, amount, attacker, source });
        return false;
      },
      ...extra,
    };
  }
  return { ...f, calls, match, effects, actor };
}

function fullShot(actorId, team = 0) {
  return {
    kind: 'rainmaker-shot', id: 0, actorId, team,
    pos: [0, 0, 0], aim: [0, 0, 1], charge: 1,
    damage: 60, blastDamage: 180, outerDamage: 40,
    radius: 1.4, nearRadius: 0.92, paintRadius: 5, speed: 18,
  };
}

test('Rainmaker timeout uses the real Actor.splat path for a local carrier', async () => {
  const f = await fixture();
  const { G, THREE } = f;
  G.scene = { add() {}, remove() {} };
  G.paint = { splat: () => 0 };
  G.physics.los = () => true;
  G.fx = undefined;
  const carrier = f.make('shooter');
  carrier.nid = 'local-carrier';
  carrier.pos.set(1, 0, 2);
  const match = { state: 'playing', actors: [carrier], ranked: { revision: 0 } };
  const effects = createRankedEffects({ G, THREE, Hit: f.Hit, emit() {} }, match);

  effects.event({ kind: 'rainmaker-timeout', id: carrier.nid, pos: carrier.pos.toArray(), team: 0 });

  assert.equal(carrier.alive, false);
  assert.equal(carrier.hp, 0);
  assert.equal(carrier.stats.deaths, 1);
  assert.equal(carrier.respawnTimer, f.PLAYER.respawnTime);
  effects.dispose();
});

test('swept Rainmaker shot resolves its actorId rather than the projectile sequence id', async () => {
  const h = await makeHarness();
  const shooter = h.actor('host-actor-17', 0, [0, 0, 0]);
  const victim = h.actor('target-actor-8', 1, [0, 0.3, 2]);
  h.match.actors = [shooter, victim];

  h.effects.event(fullShot(shooter.nid));
  assert.equal(h.calls.sceneAdds.length, 1, 'event id 0 is a projectile sequence, not an actor identity');
  h.effects.update(0.2);

  assert.ok(h.calls.damage.some(hit => hit.victim === victim && hit.attacker === shooter && hit.source === 'rainmaker'));
  h.effects.dispose();
});

test('partial Rainmaker shot with zero blast damage cannot splash a nearby opponent', async () => {
  const h = await makeHarness();
  const shooter = h.actor('partial-shooter', 0, [0, 0, 0]);
  // Outside the swept projectile's .85 collision sphere, but inside a full
  // Rainmaker blast's near radius. A truthy fallback for blastDamage/radius
  // would incorrectly damage this opponent.
  const victim = h.actor('off-axis-target', 1, [0, 0.88, 2.8]);
  h.match.actors = [shooter, victim];
  h.G.physics.segment = (_start, _end, hit) => {
    hit.hit = true;
    hit.dist = 2.8;
    hit.point.set(0, 0.68, 2.8);
    return hit;
  };

  h.effects.event({
    ...fullShot(shooter.nid), charge: 20 / 60, damage: 30,
    blastDamage: 0, outerDamage: 0, radius: 0, nearRadius: 0,
    effectiveRange: 2, speed: 14.4, paintRadius: 1.8,
  });
  h.effects.update(0.2);

  assert.deepEqual(h.calls.damage, []);
  h.effects.dispose();
});

test('nearest world hit occludes a farther actor and blocks the terminal blast through the wall', async () => {
  const h = await makeHarness();
  const shooter = h.actor('occlusion-shooter', 0, [0, 0, 0]);
  const victim = h.actor('behind-wall', 1, [0, 0.3, 2.5]);
  h.match.actors = [shooter, victim];
  h.G.physics.segment = (_start, _end, hit) => {
    hit.hit = true;
    hit.dist = 1;
    hit.point.set(0, 0.95, 1);
    return hit;
  };
  h.G.physics.los = () => false;

  h.effects.event(fullShot(shooter.nid));
  h.effects.update(0.2);

  assert.deepEqual(h.calls.damage, []);
  assert.equal(h.calls.sceneRemoves.length, 0, 'full shot waits at the world impact');
  h.effects.update(.2);
  assert.equal(h.calls.sceneRemoves.length, 1);
  assert.deepEqual(h.calls.damage, []);
  h.effects.dispose();
});

test('remote Rainmaker shot damage uses the newest net.lastLife token', async () => {
  const h = await makeHarness();
  const shooter = h.actor('networked-shooter', 0, [0, 0, 0]);
  const victim = h.actor('remote-victim', 1, [0, 0.3, 2], {
    remote: true,
    net: { lastLife: 13 },
    netLife: 2,
  });
  h.match.actors = [shooter, victim];
  h.G.netm = {
    cfg: { id: 'ranked-match' },
    rankedDamageNext: 0,
    _sendNow(packet) { h.calls.packets.push(packet); },
  };

  h.effects.event(fullShot(shooter.nid));
  h.effects.update(0.2);

  const directHit = h.calls.packets.find(packet => packet.k === 'rkdamage' && packet.damage === 60);
  assert.ok(directHit, 'direct swept hit is sent to the remote victim owner');
  assert.equal(directHit.victim, victim.nid);
  assert.equal(directHit.life, 13, 'net.lastLife takes precedence over a stale netLife fallback');
  h.effects.dispose();
});

test('full shot damages directly before its delayed ground blast; partial impact never plays an explosion', async () => {
  const h = await makeHarness(), shooter = h.actor('fuse', 0, [0, 0, 0]), victim = h.actor('target', 1, [0, .3, 2]);
  h.match.actors = [shooter, victim]; h.effects.event(fullShot(shooter.nid)); h.effects.update(.2);
  assert.deepEqual(h.calls.damage.map(d => d.amount), [60]);
  h.effects.update(.19); assert.equal(h.calls.damage.length, 1);
  h.effects.update(.01); assert.deepEqual(h.calls.damage.map(d => d.amount), [60, 180]);
  const rings = h.calls.rings.length;
  h.effects.event({ ...fullShot(shooter.nid), charge: .5, blastDamage: 0, outerDamage: 0, radius: 0, damage: 33.75 });
  h.effects.update(.2); h.effects.update(.4);
  assert.equal(h.calls.rings.length, rings, 'partial shot has paint and direct damage only'); h.effects.dispose();
});

test('shot follows charge-dependent reach and paints the first floor below its flight without special credit', async () => {
  const h = await makeHarness(), shooter = h.actor('trail', 0, [0, 0, 0]); h.match.actors = [shooter];
  h.G.physics.segment = (start, end, hit) => {
    hit.hit = end.y < start.y - 20; hit.dist = start.y;
    if (hit.hit) hit.point.set(start.x, 0, start.z);
    return hit;
  };
  h.effects.event({ ...fullShot(shooter.nid), directRange: 2, charge: .5, blastDamage: 0, trailRadius: .39 });
  h.effects.update(.1); h.effects.update(.1);
  assert.equal(h.calls.sceneAdds[0].position.z, 2, 'range is no longer an ignored event field');
  assert.ok(h.calls.paints.length > 3);
  assert.ok(h.calls.paints.every(p => p[3].claimMode === 'no-special'));
  h.effects.dispose();
});

for (const kind of ['ultra-stamp-guard', 'ink-vac', 'shield']) test(`defense first-contact handles ${kind} before an actor`, async () => {
  const h = await makeHarness(), shooter = h.actor('defense', 0, [0, 0, 0]), target = h.actor('rear', 1, [0, .3, 2]);
  h.match.actors = [shooter, target]; let contacts = 0;
  h.G.projectiles = { kitDefenseCandidate: () => ({ distance: .5, kind, onHit: p => { contacts++; assert.equal(p.owner, shooter); } }) };
  h.effects.event(fullShot(shooter.nid)); h.effects.update(.2); h.effects.update(.3);
  assert.equal(contacts, 1); assert.equal(h.calls.sceneRemoves.length, 1);
  assert.equal(h.calls.rings.length, kind === 'shield' ? 1 : 0);
  assert.ok(!h.calls.damage.some(d => d.amount === 60)); h.effects.dispose();
});

test('water removes a charged projectile without explosion, paint, or damage', async () => {
  const h = await makeHarness(), shooter = h.actor('water', 0, [0, 0, 0]); h.match.actors = [shooter];
  h.match.rankedWorld = { floorAt: () => null };
  h.effects.event({ ...fullShot(shooter.nid), aim: [0, -1, 0] }); h.effects.update(.2); h.effects.update(.3);
  assert.equal(h.calls.sceneRemoves.length, 1); assert.deepEqual(h.calls.rings, []); assert.deepEqual(h.calls.paints, []); assert.deepEqual(h.calls.damage, []);
  h.effects.dispose();
});

test('a follower replays recoil for its local carrier and never creates authoritative ink or damage', async () => {
  const h = await makeHarness(), shooter = h.actor('follower', 0, [0, 0, 0], { vel: new h.THREE.Vector3() }), target = h.actor('enemy', 1, [0, .3, 2]);
  h.match.actors = [shooter, target]; h.effects.event({ ...fullShot(shooter.nid), recoil: 1.44 }, true); h.effects.update(.2); h.effects.update(.2);
  assert.equal(shooter.vel.z, -1.44); assert.deepEqual(h.calls.damage, []); assert.deepEqual(h.calls.paints, []); assert.equal(h.calls.rings.length, 1);
  h.effects.dispose();
});
