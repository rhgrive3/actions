import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { emptyLoadout } from '../runtime/gear.mjs';

// Actual shipped adapters, Actor, Match.playRankedEvents and NetMatch.onMessage.
// Display/audio are fixture sinks. No browser or retail hardware claim.
const near = (a, b, why = '') => assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} != ${b}`);
const stage = { id: 'ranked-scu-consumer', zones: [{ center: [0, 0, 0], size: [8, 8] }],
  clams: { spawns: [], goals: [[0, 0, 10], [0, 0, -10]] } };
async function boot() {
  const f = await fixture({ fullRuntime: true, realProjectiles: true, adaptNative: adaptBuildSource, adaptRuntime: adaptBuildSource,
    extraExports: `export { Match } from './inkwave-public/src/game/match.js';
      export { installRanked } from './patches/splatoon3/runtime/ranked/install.mjs';
      export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';` });
  f.context.structuredClone = structuredClone;
  f.installRanked({ ...f.installedRuntime, structuredClone });
  return f;
}
function equip(a, ap) {
  const l = emptyLoadout();
  for (let main = 0; main <= 3; main++) {
    const subs = (ap - main * 10) / 3;
    if (!Number.isInteger(subs) || subs < 0 || subs > 9) continue;
    for (let i = 0; i < main; i++) l[i].main = 'specialCharge';
    for (let i = 0; i < subs; i++) l[Math.floor(i / 3)].subs[i % 3] = 'specialCharge';
    a.s3.loadout = l; a.s3RefreshGear(); return;
  }
  throw Error('Invalid AP topology');
}
function world(f, mode = 'zones') {
  const a = f.make(); Object.assign(a, { nid: 1, owner: 'viewer', slot: 0, invuln: 0 });
  const m = { actors: [a], local: a, follower: true, mode, ranked: new f.RankedEngine(mode, stage),
    rankedGains: [0, 0], rankedBarrierHits: [], rankedEffects: { event() {} }, rankedWorld: { update() {} },
    state: 'playing', time: 300, duration: 300, playing: () => true, canRespawn: () => false };
  const nm = new f.NetMatch({ myId: 'viewer', hostId: 'host', isHost: false, _members: new Set(['host', 'viewer']),
    tr: { sendTo() {}, broadcast() {} } }, { id: 'ranked-scu', mode });
  nm.bind(m); f.G.match = m; f.G.netm = nm; f.G.actors = [a];
  const host = new f.RankedEngine(mode, stage);
  function receive(total, { from = 'host', match = 'ranked-scu', revision = host.revision + 1 } = {}) {
    host.revision = revision;
    const packet = { k: 'rkstate', rk: { match, host: 'host', state: host.snapshot(), gains: [total, 0] } };
    nm.onMessage(from, JSON.parse(JSON.stringify(packet))); return packet;
  }
  const award = points => { m.ranked.special(0, points); f.Match.prototype.playRankedEvents.call(m, m.ranked.events.splice(0)); };
  return { a, m, nm, host, receive, award };
}

test('ranked host and authenticated follower baseline points stay SCU-independent in all four modes', async () => {
  const f = await boot();
  for (const mode of ['zones', 'tower', 'rainmaker', 'clams']) for (const ap of [0, 3, 10, 30, 57]) {
    const w = world(f, mode); equip(w.a, ap); w.a.special = 0;
    w.award(45); near(w.a.specialFrac(), .225, `${mode}/${ap} host`);
    near(w.m.rankedGains[0], 45, 'wire total is baseline points');
    w.a.special = 0; w.m.rankedGains = [0, 0];
    w.receive(45); near(w.a.specialFrac(), .225, `${mode}/${ap} follower`);
    w.receive(45); near(w.a.specialFrac(), .225, 'same cumulative total never awards twice');
    w.a.special = 0; const turf = w.a.stats.turf;
    w.a.addTurf(45); near(w.a.specialFrac(), .225 * w.a.s3.modifiers.specialCharge, 'paint retains SCU');
    near(w.a.stats.turf - turf, 45, 'paint score is unscaled');
    const before = w.a.special;
    f.emit('splatted', { attacker: w.a, victim: { team: 1 } });
    near(w.a.special, before, 'kill receipt itself has no direct special-point award');
  }
});

test('ranked passive consumers preserve equal 30/60/120 Hz fixed-tick gauge increments', async () => {
  const f = await boot();
  for (const hz of [30, 60, 120]) for (const ap of [0, 3, 10, 30, 57]) {
    const w = world(f); equip(w.a, ap); w.a.special = 0; const clock = new f.FixedClock();
    for (let i = 0; i < hz * 10; i++) clock.advance(1 / hz, dt => w.award(4.5 * dt));
    assert.equal(clock.ticks, 600); near(w.a.specialFrac(), .225, `${hz}Hz/${ap}AP`);
    near(w.m.rankedGains[0], 45);
    // Receive one cumulative host snapshot per render partition, including
    // duplicate snapshots and 120Hz frames that contain no simulation tick.
    w.a.special = 0; w.m.rankedGains = [0, 0];
    const followerClock = new f.FixedClock(); let total = 0;
    for (let i = 0; i < hz * 10; i++) {
      followerClock.advance(1 / hz, dt => { total += 4.5 * dt; });
      w.receive(total); w.receive(total, { revision: w.host.revision });
    }
    assert.equal(followerClock.ticks, 600);
    near(w.a.specialFrac(), .225, `${hz}Hz/${ap}AP follower`);
    near(w.m.rankedGains[0], 45, 'follower cumulative baseline');
  }
});

test('follower authority, revision and match gates cannot grant SCU-compensated points from rejected state', async () => {
  const f = await boot(), w = world(f); equip(w.a, 57); w.a.special = 0;
  w.receive(45, { from: 'intruder' }); near(w.a.special, 0, 'non-host');
  w.receive(45, { match: 'old-match' }); near(w.a.special, 0, 'old match');
  w.receive(45); near(w.a.specialFrac(), .225, 'current host');
  const acceptedRevision = w.m.ranked.revision;
  w.receive(45, { revision: acceptedRevision }); near(w.a.specialFrac(), .225, 'duplicate packet');
  w.receive(90, { revision: acceptedRevision - 1 }); near(w.a.specialFrac(), .225, 'stale revision');
  w.receive(90, { revision: acceptedRevision + 1 }); near(w.a.specialFrac(), .45, 'new baseline delta');
  w.nm.s.hostId = 'new-host'; w.receive(135); near(w.a.specialFrac(), .45, 'old host after handoff');
});

test('dynamic SCU changes preserve filled fraction and death consumes skipped passive points before respawn', async () => {
  const f = await boot(), w = world(f), a = w.a;
  f.G.level.spawnPads = [new f.THREE.Vector3(), new f.THREE.Vector3()];
  f.G.physics.groundProbe = (_x, _y, _z, _u, _d, _r, hit) => { hit.hit = false; return hit; };
  a.special = 0; w.receive(20); near(a.specialFrac(), .1);
  equip(a, 57); near(a.specialFrac(), .1, 'gear refresh keeps fraction');
  w.receive(40); near(a.specialFrac(), .2, 'new award uses new AP');
  a.splat(null, 'water'); near(a.specialFrac(), .1, 'ordinary 0AP saver halves gauge');
  w.receive(60); near(a.specialFrac(), .1, 'dead actor receives no points');
  a.respawn(); near(a.specialFrac(), .1, 'respawn retains death-adjusted fraction');
  w.receive(60); near(a.specialFrac(), .1, 'dead interval was consumed');
  w.receive(80); near(a.specialFrac(), .2, 'post-respawn delta only');
  equip(a, 0); near(a.specialFrac(), .2); w.award(20); near(a.specialFrac(), .3);
  equip(a, 57); a.special = a.specialCost() - 1; w.award(50); near(a.specialFrac(), 1, 'cap remains actor-local');
});
