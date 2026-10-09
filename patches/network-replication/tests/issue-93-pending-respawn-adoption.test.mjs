import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const NETMATCH_EXPORT = "export { NetMatch } from './inkwave-public/src/net/netmatch.js';";

async function rig({ mode = 'turf', range = false, map = 'normal' } = {}) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, extraExports: NETMATCH_EXPORT });
  const level = new f.Level({
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawnPads: [[0, 2.2, 0], [0, 2.2, 18]], spawnBarrier: 4.2,
    single: [{ kind: 'box', min: [-6, -1, -12], max: [6, 0, 12] }], half: [],
  });
  f.G.level = level;
  f.G.physics = new f.Physics(level);
  f.G.match = { mode, opts: range ? { range: true } : {}, playing: () => true, canRespawn: () => false };
  f.G.projectiles = { list: [], bombs: [], clouds: [], beams: [], beamPool: [], sights: new Map(), scene: { remove() {} }, _releaseBomb() {}, _releaseCloud() {} };

  const actor = f.make();
  actor.nid = 7; actor.owner = 'departing'; actor.remote = true; actor.isBot = false; actor.isLocal = false;
  actor.net = { buf: [], tp: 3, spawnPending: false, err: new f.THREE.Vector3(), errV: new f.THREE.Vector3() };
  actor.s3 ||= {};
  actor.s3.spawnArmorManaged = true;
  actor.s3.spawnArmor = null;

  const removed = [];
  const nm = Object.create(f.NetMatch.prototype);
  Object.assign(nm, {
    cfg: { difficulty: 'normal', map }, myId: 'host', byNid: new Map([[actor.nid, actor]]), peers: new Map(),
    s: { hostId: 'host', myId: 'host', isHost: true, _members: new Set(['host']) },
    match: { follower: true, removeActor(value) { removed.push(value); } },
    _stopLoops() {},
  });

  let respawns = 0, splats = 0;
  f.on('respawn', ({ actor: value }) => { if (value === actor) respawns++; });
  f.on('splatted', ({ victim }) => { if (victim === actor) splats++; });
  return { f, actor, nm, removed, counts: () => ({ respawns, splats }) };
}

function reproducePendingRespawn({ actor, nm }) {
  nm._remoteSplat(actor, null, 'shooter');
  actor.special = 73.25; // finalized owner gauge carried by the last accepted life sample
  nm._remoteRespawn(actor);
  assert.equal(actor.alive, true);
  assert.equal(actor.net.spawnPending, true);
}

test('#93 pending remote respawn adopted before its first snapshot enters the real Turf Squid Spawn path once', async () => {
  const r = await rig(), { actor, nm, f } = r;
  reproducePendingRespawn(r);
  const finalizedSpecial = actor.special, deaths = actor.stats.deaths, oldTp = actor.net.tp;

  nm._adopt(actor);

  assert.equal(actor.remote, false);
  assert.equal(actor.isBot, true);
  assert.equal(actor.net.spawnPending, false);
  assert.equal(actor.s3.squidSpawn?.phase, 'flight', 'adopted bot launches through the production Squid Spawn wrapper');
  assert.equal(actor.s3.spawnArmor.hp, f.profile.spawnArmor.hp);
  assert.equal(actor.s3.spawnArmor.remaining, f.profile.spawnArmor.duration);
  assert.equal(actor.s3.spawnArmor.breakRemaining, null);
  assert.equal(actor.special, finalizedSpecial, 'the already-finalized special gauge survives spawnAt reset');
  assert.equal(actor.netTp, oldTp + 1, 'the completed respawn advances the existing teleport counter once');
  assert.equal(actor.stats.deaths, deaths, 'ownership adoption cannot splat the same life again');
  assert.deepEqual(r.counts(), { respawns: 1, splats: 0 }, 'one new-owner respawn event and no duplicate splat event');
});

test('#93 normal alive adoption does not start a second respawn or move the actor', async () => {
  const r = await rig(), { actor, nm } = r;
  actor.alive = true; actor.remote = true; actor.net.spawnPending = false;
  actor.pos.set(8, 1.5, -3); actor.net.tp = 9;
  const position = actor.pos.clone();

  nm._adopt(actor);

  assert.equal(actor.isBot, true);
  assert.equal(actor.alive, true);
  assert.equal(actor.s3.squidSpawn, undefined);
  assert.deepEqual(actor.pos.toArray(), position.toArray());
  assert.equal(actor.netTp, 9);
  assert.deepEqual(r.counts(), { respawns: 0, splats: 0 });
});

test('#93 keeps Range and non-Turf pending adoption on legacy respawn and leaves Range/noBots removal isolated', async () => {
  for (const options of [{ mode: 'turf', range: true }, { mode: 'boss' }]) {
    const r = await rig(options);
    reproducePendingRespawn(r);
    r.nm._adopt(r.actor);
    assert.equal(r.actor.s3.squidSpawn, undefined);
    assert.equal(r.actor.s3.spawnArmor.hp, r.f.profile.spawnArmor.hp);
    assert.equal(r.actor.s3.spawnArmor.remaining, r.f.profile.spawnArmor.duration);
    assert.equal(r.actor.s3.spawnArmor.breakRemaining, null);
  }

  for (const map of ['range', 'cargo']) {
    const r = await rig({ map, range: map === 'range' });
    reproducePendingRespawn(r);
    let adoptCalls = 0;
    const adopt = r.nm._adopt;
    r.nm._adopt = function (actor) { adoptCalls++; return adopt.call(this, actor); };
    r.nm.onLeave('departing', false);
    assert.equal(adoptCalls, 0, `${map} disconnect removes the actor without adoption`);
    assert.deepEqual(r.removed, [r.actor]);
    assert.equal(r.nm.byNid.has(r.actor.nid), false);
  }
});
