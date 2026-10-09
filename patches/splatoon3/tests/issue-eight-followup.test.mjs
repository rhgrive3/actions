import test from 'node:test';
import assert from 'node:assert/strict';

import { VERIFIED_KITS } from '../runtime/kit-composition.mjs';
import { CURLING, resolveSubAtCharge, kitBombAttach, kitGhostBombAttach } from '../runtime/kit-subs.mjs';
import { rollerStationaryRecoveryEligible } from '../runtime/resources.mjs';
import {
  installIssueEightFollowup,
  rollerDashClockEligible,
  DUALIES_ROLL_SUB,
} from '../runtime/issue-eight-followup.mjs';
import { adaptEightFollowup } from '../../reliability/inkwave-eight-followup-adapter.mjs';

const DT = 1 / 60;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

function runtimeFixture(kind = 'roller') {
  class Runner {
    constructor(a) {
      this.a = a;
      this.rollT = 0;
      this.rolling = false;
      this.dodge = null;
      this.aimingSub = false;
      this.s3DualiesRollSubRemaining = 0;
    }
    _roller(dt, input) {
      const can = !!input.fire && this.a.grounded;
      this.rollT = can ? this.rollT + dt : 0;
      this.rolling = can;
    }
    tryDodge() { this.dodge = { t: 0 }; return true; }
    reset() { this.aimingSub = false; this.dodge = null; }
    update(_dt, input) {
      this.lastInput = input;
      if (input.sub) this.aimingSub = true;
    }
  }
  class Actor {
    constructor() {
      this.weapon = kind === 'roller'
        ? { kind, rollBaseSpeed: 6.48, rollSpeed: 7.92, rollDashTime: 1.5 }
        : { kind };
      this.grounded = true;
      this.form = 'kid';
      this.alive = true;
      this.specialActive = null;
      this.superJumpState = null;
      this.intent = { move: { x: 0, z: 0 }, sub: false };
      this.vel = { x: 0, z: 0 };
      this.weaponRunner = new Runner(this);
    }
    update(dt) {
      this.weaponRunner.update(dt, {
        fire: false, firePressed: false,
        sub: !!this.intent.sub, subReleased: false,
      });
    }
  }
  class Projectiles {
    constructor() { this.bursts = 0; this.nativeSteps = 0; }
    _step(p, dt) {
      this.nativeSteps++;
      p.age += dt;
      p.pos.x += 60 * dt;
      if (p.age > p.life) {
        if (p.type === 'blast') this._blastBurst(p, p.pos, null);
        return true;
      }
      return false;
    }
    _blastBurst() { this.bursts++; }
  }
  installIssueEightFollowup({ Actor, WeaponRunner: Runner, Projectiles });
  return { Actor, Runner, Projectiles };
}

// PR1188: #1132 applied Ver.7.2.0 (200 -> 210) but missed official Ver.11.1.0
// (210 -> 200); the pinned 11.3.0 WeaponInfoMain row is 200 as well.
test('#1132/PR1188: Splattershot base special cost is 200p in 11.3.0; Roller/Charger controls stay 180/190', () => {
  assert.equal(VERIFIED_KITS.shooter.specialCost, 200);
  assert.equal(VERIFIED_KITS.roller.specialCost, 180);
  assert.equal(VERIFIED_KITS.charger.specialCost, 190);
});

test('#1127: stationary ZR cannot precharge Roller dash, 90 eligible ticks can, slowdown resets it', () => {
  const { Actor } = runtimeFixture('roller');
  const a = new Actor(), r = a.weaponRunner, w = a.weapon;
  r.rolling = true;

  for (let i = 0; i < 120; i++) r._roller(DT, { fire: true }, w);
  assert.equal(r.rollT, 0, 'stationary held-ZR must not charge dash');

  a.intent.move.x = 1;
  a.vel.x = w.rollBaseSpeed;
  assert.equal(rollerDashClockEligible(r), true);
  for (let i = 0; i < 89; i++) r._roller(DT, { fire: true }, w);
  near(r.rollT, 89 / 60);
  assert.ok(r.rollT < w.rollDashTime);
  r._roller(DT, { fire: true }, w);
  near(r.rollT, w.rollDashTime);

  a.vel.x = 0;
  r._roller(DT, { fire: true }, w);
  assert.equal(r.rollT, 0, 'obstacle/slowdown revokes dash clock even with ZR held');
});

test('#1115: 13F Blaster lifetime bursts on the 13th segment and never advances a 14th', () => {
  const { Projectiles } = runtimeFixture('blaster');
  const ps = new Projectiles();
  const p = { type: 'blast', ghost: false, age: 0, life: 13 / 60, pos: { x: 0 } };
  let dead = false, ticks = 0;
  while (!dead && ticks < 20) { dead = ps._step(p, DT); ticks++; }
  assert.equal(ticks, 13);
  assert.equal(ps.nativeSteps, 13);
  assert.equal(ps.bursts, 1);
  near(p.age, 13 / 60);
  near(p.pos.x, 13);
});

test('#1104: Splat Dualies suppress sub through 19F and admit it at the 20F boundary', () => {
  const { Actor } = runtimeFixture('dualies');
  const a = new Actor(), r = a.weaponRunner;
  assert.equal(r.tryDodge(), true);
  near(r.s3DualiesRollSubRemaining, DUALIES_ROLL_SUB);
  a.intent.sub = true;
  for (let i = 0; i < 19; i++) {
    a.update(DT);
    assert.equal(r.aimingSub, false, `sub admitted early on tick ${i + 1}`);
  }
  a.update(DT);
  assert.equal(r.s3DualiesRollSubRemaining, 0);
  assert.equal(r.aimingSub, true, 'sub is admitted at 20F');
});

test('#1106: camera adapter scopes generic charging zoom to Charger only', () => {
  const source = '    const charging = a.weaponRunner?.charging ? a.weaponRunner.charge : 0;\n';
  const out = adaptEightFollowup('src/game/cameraRig.js', source);
  assert.match(out, /a\.weapon\?\.kind === 'charger'/);
  assert.doesNotMatch(out, /^    const charging = a\.weaponRunner/m);
});

test('#1103: lobby adapter invalidates ready on weapon/team/settings mutations', () => {
  const source = `class Session {
  _applyMe(id, o) {
    const p = this.lobby.players.find((x) => x.id === id);
    if (!p) return;
    if (o.weapon) p.weapon = o.weapon;
    if (o.team !== undefined) p.team = o.team;
    this._fixTeams();
    this._broadcastLobby();
  }

  setSettings(s = {}) {
    if (!this.isHost) return;
    const l = this.lobby, wasMap = l.map;
    if (s.map) l.map = s.map;
    l.bots = mapNoBots(l.map) ? false : (this._botsPref ?? l.bots);
    this._broadcastLobby();
  }
}`;
  const out = adaptEightFollowup('src/net/session.js', source);
  assert.match(out, /const beforeWeapon = p\.weapon/);
  assert.match(out, /p\.weapon !== beforeWeapon\) p\.ready = false/);
  assert.match(out, /x\.team !== beforeTeams\.get\(x\.id\)/);
  assert.match(out, /const beforeSettings = \[/);
  assert.match(out, /afterSettings\.some/);
  assert.match(out, /p\.id !== this\.hostId\) p\.ready = false/);
});

test('#1093: only a truly stationary held Roller qualifies for refill while rolling stays presented', () => {
  const a = {
    weapon: { kind: 'roller' },
    weaponRunner: { rolling: true },
    s3: { rollerRefillMode: true },
    intent: { move: { x: 0, z: 0 } },
    vel: { x: 0, z: 0 },
  };
  assert.equal(rollerStationaryRecoveryEligible(a), true);
  a.intent.move.x = .2;
  assert.equal(rollerStationaryRecoveryEligible(a), false);
  a.intent.move.x = 0; a.vel.x = .2;
  assert.equal(rollerStationaryRecoveryEligible(a), false);
  a.vel.x = 0; a.weaponRunner.rolling = false;
  assert.equal(rollerStationaryRecoveryEligible(a), false);
});

test('#1099: Curling fuse resolves 210F tap -> 90F full and starts on release for owner/ghost', () => {
  const tap = resolveSubAtCharge(CURLING, 0);
  const full = resolveSubAtCharge(CURLING, 1);
  const half = resolveSubAtCharge(CURLING, .5);
  near(tap.fuse, 210 / 60);
  near(full.fuse, 90 / 60);
  near(half.fuse, 150 / 60);

  const SUB = { curling: CURLING, bomb: { inkCost: 70 } };
  const bomb = {
    fuse: -1,
    vel: { clone() { return {}; }, copy() {} },
  };
  const actor = {
    remote: false,
    weapon: { sub: 'curling' },
    weaponRunner: { s3Sub: CURLING },
    s3: { modifiers: {} },
  };
  const projectiles = {
    bombs: [bomb],
    throwVelocity() { return null; },
  };
  kitBombAttach(SUB, projectiles, actor, { id: 'curling', __hold: CURLING.maxChargeTime, __charge: 1 });
  near(bomb.fuse, 90 / 60);
  near(bomb.s3FuseTotal, 90 / 60);

  const ghost = { ghost: true, kind: 'bomb', fuse: -1 };
  kitGhostBombAttach(SUB, {}, ghost, 'curling', 1);
  near(ghost.fuse, 90 / 60);
  near(ghost.s3FuseTotal, 90 / 60);
});
