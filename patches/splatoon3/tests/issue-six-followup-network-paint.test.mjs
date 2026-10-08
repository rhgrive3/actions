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
  onMessage() {}
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
  assert.ok(Math.abs(spec.targetLength - 1.2) < 1e-12);
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
  const G = {
    physics: { raycast(_p, _d, _n, hit) { hit.hit = true; hit.point.set(_p.x, 0, _p.z); hit.normal.set(0, 1, 0); return hit; } },
    paint: { splat(p, radius, team, opts) { splats.push({ p: new Vec3().copy(p), radius, team, opts }); return 5; } },
  };
  installSlosherIntermediatePaint(
    { Projectiles, G, THREE: { Vector3: Vec3 }, Hit: FakeHit },
    { weaponsFidelityCompletion: { worldUnitsPerSourceUnit: 1 } },
  );
  const p = {
    type: 'slosh', ghost: false, fidelitySloshUnit: unit2, fidelitySloshIndex: 3,
    seed: .5, pos: new Vec3(), vel: new Vec3(1, 0, 0), team: 0, trailEvery: 1.4,
    owner: { addTurf(v) { turf += v; } },
  };
  const ps = new Projectiles();
  ps._step(p, 1 / 60);
  assert.equal(splats.length, 0);
  ps._step(p, 1 / 60);
  assert.equal(splats.length, 1);
  assert.equal(splats[0].radius, .7);
  assert.equal(splats[0].opts.stretchAmt, 2);
  assert.equal(p.trailEvery, 0);
  assert.equal(turf, 5);
  ps._step(p, 1 / 60);
  assert.equal(splats.length, 1, 'SpawnNum/TotalNum cap is one');
});
