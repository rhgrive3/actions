import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedSubReadyCost } from '../runtime/sub-ready.mjs';
import { adaptSixFollowup } from '../../reliability/inkwave-six-followup-adapter.mjs';
import {
  installDisconnectFidelity,
  deactivateDisconnectedActor,
  disconnectStartsNoContest,
  matchElapsed,
  NO_CONTEST_DELAY,
} from '../runtime/disconnect-fidelity.mjs';
import {
  slosherIntermediateSpec,
  installSlosherIntermediatePaint,
} from '../runtime/slosher-intermediate-paint.mjs';
import { advanceSplashDrops } from '../runtime/blaster-flight-paint.mjs';

test('#1000: selected sub readiness uses Curling 65% and applies saver once', () => {
  const SUB = {
    bomb: { inkCost: 70 },
    curling: { inkCost: 65 },
    suction: { inkCost: null, inkCostFallback: 70 },
  };
  const a = { weapon: { sub: 'curling' }, s3: { modifiers: { inkSaverSub: 1 } } };
  assert.equal(selectedSubReadyCost(a, SUB), 65);
  a.s3.modifiers.inkSaverSub = .65;
  assert.equal(selectedSubReadyCost(a, SUB), 42.25);
  a.weapon.sub = 'suction';
  assert.equal(selectedSubReadyCost(a, SUB), 45.5);
});

test('#1003: composed session source refuses solo Turf even when bots are enabled', () => {
  const src = `class NetSession {
  canStart() {
    if (!this.isHost || this.state !== 'lobby') return false;
    return !this.startBlock() && this.lobby.players.every((p) => p.ready || p.id === this.myId);
  }
  start() {
    if (!this.isHost || this.state !== 'lobby' || !this.tr || this.startBlock()) return false;
  }
}`;
  const out = adaptSixFollowup('src/net/session.js', src);
  assert.match(out, /this\.lobby\.mode !== 'turf' \|\| this\.lobby\.players\.length >= 2/);
  assert.match(out, /this\.lobby\.mode === 'turf' && this\.lobby\.players\.length < 2/);
});

class FakeNetMatch {
  constructor(session = {}) {
    this.s = session;
    this.myId = session.myId || 'me';
    this.byNid = new Map();
    this.match = null;
    this.sent = [];
    this.remoteCalls = 0;
    this.updateCalls = 0;
    this.playCalls = 0;
    this.tickCalls = 0;
    this.messageCalls = 0;
    this.clockT = 1;
  }
  get isHost() { return this.s.hostId === this.myId; }
  bind(match) {
    this.match = match;
    for (const a of match.actors) this.byNid.set(a.nid, a);
    return match;
  }
  onLeave() {}
  _sendNow(v) { this.sent.push(v); }
  _stopLoops() {}
  _remove(a) {
    this.byNid.delete(a.nid);
    const i = this.match.actors.indexOf(a);
    if (i >= 0) this.match.actors.splice(i, 1);
  }
  applyRemote() { this.remoteCalls++; }
  shouldApplyHit() { return 'local'; }
  onMessage() { this.messageCalls++; }
  _tick() { this.tickCalls++; }
  _play() { this.playCalls++; }
  update() { this.updateCalls++; }
}
function fakeActor(nid, owner = 'gone') {
  return {
    nid, owner, name: 'Guest', team: 1, alive: true, hp: 100, isBot: false, remote: true,
    stats: { turf: 12, splats: 1, deaths: 2 },
    s3: {}, intent: { move: { set() {} }, fire: true, squid: false, sub: false, jump: false, special: false },
    weaponRunner: { reset() {}, cancelPendingInput() {} },
    character: { root: { visible: true }, setVisible() {} },
    net: { buf: [{ t: 1 }], spawnPending: true, handoff: true },
  };
}
function fakeMatch(state = 'playing', elapsed = 61, actors = []) {
  return {
    state, duration: 180, time: 180 - elapsed, actors, follower: true, paused: false,
    teamSummary() {
      return [0, 1].map(team => ({ players: this.actors.filter(a => a.team === team).map(a => ({
        name: a.name, alive: a.alive, respawn: 3,
      })) }));
    },
  };
}

test('#1025: bind removes a roster owner who vanished during loading on every stage', () => {
  const G = { game: {} };
  installDisconnectFidelity({ NetMatch: FakeNetMatch, G });
  const a = fakeActor(1);
  const match = fakeMatch('init', 0, [a]);
  const nm = new FakeNetMatch({ myId: 'me', hostId: 'me', _members: new Map([['me', true]]) });
  nm.bind(match);
  assert.equal(nm.byNid.has(1), false);
  assert.equal(match.actors.length, 0);
});

test('#201: late disconnect preserves stats/identity but cannot simulate, hit or become a bot', () => {
  const a = fakeActor(2);
  const match = fakeMatch('playing', 61, [a]);
  const G = { game: { hud: { banner() {} } } };
  installDisconnectFidelity({ NetMatch: FakeNetMatch, G });
  const nm = new FakeNetMatch({ myId: 'me', hostId: 'me', _members: new Map([['me', true]]) });
  nm.bind(match);
  nm.onLeave('gone', false);
  assert.equal(match.actors.length, 1, 'result/stat identity stays in roster');
  assert.equal(a.s3.disconnected, true);
  assert.equal(a.isBot, false);
  assert.equal(a.bot, null);
  assert.equal(a.alive, false);
  assert.equal(a.stats.turf, 12);
  assert.equal(a.stats.splats, 1);
  nm.applyRemote(a, 1 / 60);
  assert.equal(nm.remoteCalls, 0, 'stale snapshots cannot resurrect the slot');
  assert.equal(nm.shouldApplyHit(a, fakeActor(9, 'me')), 'drop');
  assert.equal(nm.shouldApplyHit(fakeActor(9, 'me'), a), 'drop');
  assert.equal(nm.s3NoContestRemaining, 0, '61s disconnect does not cancel the match');
  const summary = match.teamSummary();
  assert.equal(summary[1].players[0].disconnected, true);
  assert.match(summary[1].players[0].name, /DISCONNECTED/);
});

test('#905 live owner-leave retires only the disconnected Storm, on host and peer, once', () => {
  for (const host of [true, false]) {
    const actor = fakeActor(41), other = fakeActor(42, 'connected');
    const ownCloud = { owner: actor }, otherCloud = { owner: other };
    const ownStorm = { owner: actor, kind: 'storm' };
    const ownNormalBomb = { owner: actor, kind: 'bomb' };
    const otherStorm = { owner: other, kind: 'storm' };
    const released = [];
    const G = { game: { hud: { banner() {} } }, projectiles: {
      clouds: [ownCloud, otherCloud],
      bombs: [ownStorm, ownNormalBomb, otherStorm],
      _releaseCloud(c) { released.push(['cloud', c]); },
      _releaseBomb(b) { released.push(['bomb', b]); },
    } };
    installDisconnectFidelity({ NetMatch: FakeNetMatch, G });
    const members = new Map([['me', true], ['gone', true], ['connected', true]]);
    const nm = new FakeNetMatch({ myId: 'me', hostId: host ? 'me' : 'connected', _members: members });
    nm.bind(fakeMatch('playing', 75, [actor, other]));
    nm.onLeave('gone', false);
    assert.deepEqual(G.projectiles.clouds, [otherCloud], 'orphan Storm cloud no longer damages without turf authority');
    assert.deepEqual(G.projectiles.bombs, [ownNormalBomb, otherStorm], 'only disconnected Storm devices retire');
    assert.deepEqual(released, [['cloud', ownCloud], ['bomb', ownStorm]]);
    assert.equal(actor.isBot, false, 'the current #201 no-bot disconnect policy is preserved');
    assert.equal(actor.s3.disconnected, true);
    assert.equal(actor.stats.turf, 12, 'historical contribution is preserved');
    nm.onLeave('gone', false);
    assert.equal(released.length, 2, 'duplicate leaves cannot double-release scene resources');
  }
});

// #905 residual (see reports/inkwave-splatoon3-behavior-2026-10-02.md): after the
// owner leaves, its late packets are fenced in _tick/_play on host and peer, and
// the retirement result does not depend on the fixed-step render rate at leave time.
test('#905 owner-leave retirement is fenced for late owner packets and invariant at 30/60/120 Hz', () => {
  const seen = new Map();
  for (const hz of [30, 60, 120]) for (const host of [true, false]) {
    const actor = fakeActor(41), other = fakeActor(42, 'connected');
    const released = [];
    const G = { game: { hud: { banner() {} } }, projectiles: {
      clouds: [{ owner: actor }, { owner: other }],
      bombs: [{ owner: actor, kind: 'storm' }, { owner: other, kind: 'storm' }],
      _releaseCloud(c) { released.push(['cloud', c.owner.nid]); },
      _releaseBomb(b) { released.push(['bomb', b.owner.nid]); },
    } };
    installDisconnectFidelity({ NetMatch: FakeNetMatch, G });
    const members = new Map([['me', true], ['gone', true], ['connected', true]]);
    const nm = new FakeNetMatch({ myId: 'me', hostId: host ? 'me' : 'connected', _members: members });
    nm.bind(fakeMatch('playing', 75, [actor, other]));
    for (let i = 0; i < hz; i++) nm.update(1 / hz);
    assert.equal(nm.updateCalls, hz, `the ${hz} Hz fixed-step loop ran`);
    nm.onLeave('gone', false);
    const playAfterLeave = nm.playCalls, tickAfterLeave = nm.tickCalls;
    nm._tick('gone', {});
    nm._play('gone', [0, 's']);
    assert.equal(nm.tickCalls, tickAfterLeave, 'late tick packets from the departed owner are dropped');
    assert.equal(nm.playCalls, playAfterLeave, 'late Storm/paint playback from the departed owner is dropped');
    nm._play('connected', [0, 's']);
    assert.equal(nm.playCalls, playAfterLeave + 1, 'a connected owner still plays back');
    assert.deepEqual(G.projectiles.clouds.map(c => c.owner.nid), [42], 'only the connected owner keeps its Storm cloud');
    assert.deepEqual(G.projectiles.bombs.map(b => b.owner.nid), [42], 'only the connected owner keeps its Storm device');
    const signature = JSON.stringify(released);
    if (!seen.has(host)) seen.set(host, signature);
    assert.equal(signature, seen.get(host), `retirement at ${hz} Hz matches the first run on host=${host}`);
    assert.deepEqual(released, [['cloud', 41], ['bomb', 41]], 'the departed owner retires its cloud and Storm exactly once');
  }
});

test('#201: first-minute disconnect starts 6s no-contest and bypasses normal result path', () => {
  const a = fakeActor(3);
  let ended = 0;
  const match = fakeMatch('playing', 30, [a]);
  const G = { game: { hud: { banner() {} }, netMatchEnd() { ended++; } } };
  installDisconnectFidelity({ NetMatch: FakeNetMatch, G });
  const nm = new FakeNetMatch({ myId: 'me', hostId: 'me', _members: new Map([['me', true]]) });
  nm.bind(match);
  nm.onLeave('gone', false);
  assert.equal(disconnectStartsNoContest(match), true);
  assert.equal(matchElapsed(match), 30);
  assert.equal(nm.s3NoContestRemaining, NO_CONTEST_DELAY);
  assert.deepEqual(nm.sent.at(-1), { k: 'nc', r: 6 });
  nm.update(6);
  assert.equal(match.s3NoContestFinished, true);
  assert.equal(match.paused, true);
  assert.equal(ended, 1);
  assert.deepEqual(nm.sent.at(-1), { k: 'ncend' });
});

test('#201: No Contest wins against the ordinary timeout/judge and late host results', () => {
  const a = fakeActor(30);
  const match = fakeMatch('playing', 59, [a]);
  // A one-minute Turf variant reproduces the exact race: the first-minute
  // disconnect occurs one second before the regular match timeout.
  match.duration = 60;
  match.time = 1;
  match.follower = false;
  let judged = 0, ended = 0;
  match.setState = function (next) { this.state = next; };
  match._judge = () => { judged++; match.setState('judge'); };
  match.update = function (dt) {
    this.time = Math.max(0, this.time - dt);
    if (this.time === 0) this.setState('finish');
  };
  const G = { game: { hud: { banner() {} }, netMatchEnd() { ended++; } } };
  installDisconnectFidelity({ NetMatch: FakeNetMatch, G });
  const nm = new FakeNetMatch({ myId: 'me', hostId: 'me', _members: new Map([['me', true]]) });
  nm.bind(match);
  nm.onLeave('gone', false);
  assert.equal(nm.s3NoContestRemaining, 6);
  match.update(2); // 1s remaining became 0 while the six-second notice is still active
  match._judge();
  assert.equal(match.state, 'playing', 'normal finish state cannot override a pending No Contest');
  assert.equal(judged, 0, 'ordinary winner/scoring must not run');
  const previous = nm.messageCalls;
  for (const k of ['res', 'end']) nm.onMessage('me', { k });
  for (const s of ['finish', 'judge', 'results']) nm.onMessage('me', { k: 'st', s });
  assert.equal(nm.messageCalls, previous, 'delayed authoritative result packets are suppressed');
  nm.update(6);
  assert.equal(match.s3NoContestFinished, true);
  assert.equal(ended, 1);
});

test('#201: departed senders lose queued paint and cannot replay delayed tick events', () => {
  const a = fakeActor(31);
  const match = fakeMatch('playing', 70, [a]);
  const G = { game: { hud: { banner() {} } } };
  installDisconnectFidelity({ NetMatch: FakeNetMatch, G });
  const nm = new FakeNetMatch({ myId: 'me', hostId: 'me', _members: new Map([['me', true]]) });
  nm.peers = new Map([['gone', { tr: 0, events: [[0, 's', 1, 2, 3]] }]]);
  nm.bind(match);
  nm.onLeave('gone', false);
  assert.equal(nm.peers.get('gone').events.length, 0, 'no sender-free paint may remain queued');
  nm._tick('gone', { k: 't', e: [[0, 's']] });
  nm._play('gone', [0, 's']);
  assert.equal(nm.tickCalls, 0);
  assert.equal(nm.playCalls, 0);
  nm._tick('me', {});
  nm._play('me', []);
  assert.equal(nm.tickCalls, 1, 'live transport peers retain normal playback');
  assert.equal(nm.playCalls, 1);
});

test('#201: disconnected actor deactivation is idempotent and keeps statistics', () => {
  const a = fakeActor(4);
  const nm = { match: fakeMatch('playing', 70, [a]), _stopLoops() {} };
  const first = deactivateDisconnectedActor(nm, a);
  const second = deactivateDisconnectedActor(nm, a);
  assert.equal(first, second);
  assert.deepEqual(a.stats, { turf: 12, splats: 1, deaths: 2 });
  assert.equal(a.owner, null);
  assert.equal(a.character.root.visible, false);
});

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const d = Math.sqrt(this.lengthSq()) || 1; this.x /= d; this.y /= d; this.z /= d; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
}
class FakeHit {
  constructor() { this.hit = false; this.point = new Vec3(); this.normal = new Vec3(0, 1, 0); }
}
const unit2 = {
  SplashAndSplashWallHitSpawnPrm: {
    Combination: [{ OrderNum: 3, SplashArrayOrderNum: 0, SplashWallHitArrayOrderNum: 0, TotalNum: 1 }],
    SplashParam: [{
      SpawnParam: { FirstSplashRateForLengthMin: .7, FirstSplashRateForLengthMax: .9, SpawnBetweenLength: 1.5, SpawnNum: 1 },
      DrawSizeCollisionPaintParam: {
        CollisionParam: { EndRadiusForPlayer: 0 },
        PaintDepthScale: 2, PaintWidthHalf: .7,
      },
    }],
  },
};

test('#1002: Unit-2 order 3 resolves exactly one paint-only source splash', () => {
  const p = { fidelitySloshUnit: unit2, fidelitySloshIndex: 3, seed: .5 };
  const spec = slosherIntermediateSpec(p, 1);
  assert.ok(spec);
  assert.ok(Math.abs(spec.targetLength - 1.2) < 1e-12, `target length ${spec.targetLength}`);
  assert.equal(spec.widthHalf, .7);
  assert.equal(spec.depthScale, 2);
  assert.equal(spec.spawnNum, 1);
  assert.equal(slosherIntermediateSpec({ ...p, fidelitySloshIndex: 2 }, 1), null);
});

test('#1002: intermediate splash paints once, scores once and disables legacy trail duplication', () => {
  class Projectiles {
    _step(p) { p.pos.x += .7; return false; }
  }
  const splats = [];
  let turf = 0;
  // PR1188: the splash falls (shared queue) to a floor at y=0 before painting.
  const G = {
    physics: { segment(a, b, hit) { hit.hit = b.y <= 0 && a.y > 0; if (hit.hit) { hit.point.set(b.x, 0, b.z); hit.normal.set(0, 1, 0); hit.face = 0; } return hit; } },
    paint: { splat(p, radius, team, opts) { splats.push({ p: new Vec3().copy(p), radius, team, opts }); return 5; } },
  };
  installSlosherIntermediatePaint(
    { Projectiles, G, THREE: { Vector3: Vec3 }, Hit: FakeHit },
    { weaponsFidelityCompletion: { worldUnitsPerSourceUnit: 1 } },
  );
  const p = {
    type: 'slosh', ghost: false, fidelitySloshUnit: unit2, fidelitySloshIndex: 3,
    seed: .5, pos: new Vec3(0, 1, 0), vel: new Vec3(1, 0, 0), team: 0, trailEvery: 1.4,
    owner: { addTurf(v) { turf += v; } },
  };
  const ps = new Projectiles();
  G.projectiles = ps;
  ps._step(p, 1 / 60);
  assert.equal((ps._s3SplashDrops || []).length, 0);
  ps._step(p, 1 / 60);
  assert.equal(ps._s3SplashDrops.length, 1, 'one source splash released');
  assert.equal(splats.length, 0, 'it paints where it lands, not at release');
  for (let i = 0; i < 120 && ps._s3SplashDrops.length; i++) advanceSplashDrops(ps, 1 / 60, G);
  assert.equal(splats.length, 1);
  assert.equal(splats[0].radius, .7);
  assert.ok(Math.abs(splats[0].opts.stretchAmt - 1.6) < 1e-12, 'PaintDepthScale 2 -> equal-length/area smear');
  assert.equal(splats[0].opts.face, 0, 'paints the struck face');
  assert.equal(p.trailEvery, 0);
  assert.equal(turf, 5);
  ps._step(p, 1 / 60);
  assert.equal(ps._s3SplashDrops.length, 0, 'SpawnNum/TotalNum cap is one');
});

test('#1002: Slosher flight caches the source spec across ticks and invalidates on seed change', () => {
  const group = {
    ...unit2.SplashAndSplashWallHitSpawnPrm,
    Combination: [...unit2.SplashAndSplashWallHitSpawnPrm.Combination],
  };
  let lookups = 0;
  group.Combination.find = function (predicate) {
    lookups++;
    return Array.prototype.find.call(this, predicate);
  };
  class Projectiles {
    _step(p) { p.pos.x += .4; return false; }
  }
  class MissHit extends FakeHit {}
  const G = { physics: { raycast(_p, _d, _dist, hit) { hit.hit = false; return hit; } } };
  installSlosherIntermediatePaint(
    { Projectiles, G, THREE: { Vector3: Vec3 }, Hit: MissHit },
    { weaponsFidelityCompletion: { worldUnitsPerSourceUnit: 1 } },
  );
  const p = {
    type: 'slosh', ghost: false,
    fidelitySloshUnit: { SplashAndSplashWallHitSpawnPrm: group },
    fidelitySloshIndex: 3, seed: .5,
    pos: new Vec3(), vel: new Vec3(1, 0, 0),
  };
  const ps = new Projectiles();
  for (let i = 0; i < 5; i++) ps._step(p, 1 / 60);
  assert.equal(lookups, 1, 'no per-fixed-tick Combination scan while source is unchanged');
  p.seed = .7;
  ps._step(p, 1 / 60);
  assert.equal(lookups, 2, 'pooled projectile new seed invalidates source-dependent spec');
});
