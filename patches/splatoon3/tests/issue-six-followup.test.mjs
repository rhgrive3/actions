import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedSubReadyCost } from '../runtime/sub-ready.mjs';
import {
  installIssueSixFollowup,
  privateTurfHasMinimum,
  S3_PAD_MAX_YAW_RATE,
  S3_PAD_SENSITIVITY_CAP,
} from '../runtime/issue-six-followup.mjs';

const DT = 1 / 60;
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} != ${b}`);

test('#1000: Curling release readiness uses selected 65% cost and actor saver once', () => {
  const SUB = { bomb: { inkCost: 70 }, curling: { inkCost: 65 }, suction: { inkCost: null, inkCostFallback: 70 } };
  const a = { weapon: { sub: 'curling' }, s3: { modifiers: { inkSaverSub: 1 } } };
  assert.equal(selectedSubReadyCost(a, SUB), 65);
  a.s3.modifiers.inkSaverSub = .65;
  near(selectedSubReadyCost(a, SUB), 42.25, '57AP-equivalent Curling cost');
  a.weapon.sub = 'suction';
  near(selectedSubReadyCost(a, SUB), 45.5, '57AP-equivalent Suction fallback cost');
});

test('#1003: private Turf requires two connected human lobby members even when bots are enabled', () => {
  class Session {
    constructor(players, mode = 'turf') {
      this.lobby = { players: Array.from({ length: players }, (_, i) => ({ id: String(i) })), mode, bots: true };
      this.isHost = true; this.state = 'lobby'; this.tr = {};
    }
    canStart() { return true; }
    start() { return true; }
  }
  installIssueSixFollowup({}, null, { NetSession: Session });
  const solo = new Session(1);
  assert.equal(privateTurfHasMinimum(solo), false);
  assert.equal(solo.canStart(), false);
  assert.equal(solo.start(), false);
  const pair = new Session(2);
  assert.equal(pair.canStart(), true);
  assert.equal(pair.start(), true);
  const boss = new Session(1, 'boss');
  assert.equal(boss.canStart(), true, 'separate boss roster rule stays independent');
});

test('#1012: pad rim hold has no 1.55x boost and current exposed max stays strictly below 360deg/s', () => {
  class Controller {
    constructor(a, rig, input) { this.a = a; this.rig = rig; this.input = input; this.edgeT = .5; }
    update(dt) {
      if (this.input.pad && this.input.lastDevice === 'pad') {
        this.edgeT = Math.min(.5, this.edgeT + dt);
        const boost = 1 + .55 * Math.max(0, Math.min(1, (this.edgeT - .16) / .3));
        this.rig.yaw += 3.6 * G.settings.padSensitivity * boost * dt;
      }
    }
  }
  const G = { settings: { padSensitivity: 3 } };
  installIssueSixFollowup({ PlayerController: Controller, G });
  const c = new Controller({ intent: {}, _prevIntent: {} }, { yaw: 0 }, { pad: {}, lastDevice: 'pad' });
  c.update(DT);
  const rate = c.rig.yaw / DT;
  assert.ok(rate <= S3_PAD_MAX_YAW_RATE + 1e-12, `rate ${rate}`);
  assert.ok(rate < Math.PI * 2, 'strictly below 360deg/s');
  near(S3_PAD_SENSITIVITY_CAP * 3.6, S3_PAD_MAX_YAW_RATE, 'cap conversion');
  assert.equal(c.edgeT, 0, 'legacy rim timer is not retained');
  assert.equal(G.settings.padSensitivity, 3, 'persistent user setting is not rewritten');
});

test('#1024: pad -> null cancels held fire/sub without synthesizing release edges', () => {
  class Input {
    constructor() { this.pad = null; this.nextPad = null; this.lastDevice = 'pad'; }
    pollPad() { this.pad = this.nextPad; }
  }
  class Controller {
    constructor(a, input) { this.a = a; this.input = input; this.edgeT = 0; }
    update() {
      const p = this.input.pad;
      this.a.intent.fire = !!(p?.buttons?.[7]?.value > .3);
      this.a.intent.sub = !!p?.buttons?.[5]?.pressed;
      this.a.intent.squid = !!(p?.buttons?.[6]?.value > .3);
    }
  }
  const runner = {
    charging: true, aimingSub: true, s3SubReady: { pending: false }, s3SubFromSquid: true, cancels: 0,
    cancelPendingInput() { this.cancels++; this.charging = false; },
  };
  const a = {
    intent: { fire: true, sub: true, squid: false, jump: false, special: false },
    _prevIntent: { fire: true, sub: true, squid: false, jump: false, special: false },
    weaponRunner: runner, fireBuffer: .1,
  };
  installIssueSixFollowup({ PlayerController: Controller, G: { settings: { padSensitivity: 1 } } }, null, { Input });
  const input = new Input();
  input.nextPad = { buttons: Array.from({ length: 12 }, (_, i) => ({
    pressed: i === 5, value: i === 7 ? 1 : 0,
  })) };
  input.pollPad(); // establish pad-owned held state
  const controller = new Controller(a, input);
  input.nextPad = null;
  input.pollPad(); // physical device disappears without a button-up
  controller.update(DT);
  assert.equal(runner.cancels, 1);
  assert.equal(runner.charging, false);
  assert.equal(runner.aimingSub, false);
  assert.equal(runner.s3SubReady, null);
  assert.equal(a._prevIntent.fire, false, 'Actor cannot derive a fake fire release');
  assert.equal(a._prevIntent.sub, false, 'Actor cannot derive a fake sub release');
  assert.equal(a.fireBuffer, 0);
});

test('#1025: bind reconciles a loading-time missing owner instead of leaving a dead remote slot', () => {
  class NM {
    constructor() {
      this.myId = 'me';
      this.s = { hostId: 'me', _members: new Map([['me', true]]) };
      this.byNid = new Map();
      this.left = [];
    }
    bind(match) { this.match = match; for (const a of match.actors) this.byNid.set(a.nid, a); return match; }
    onLeave(owner) {
      this.left.push(owner);
      for (const a of this.byNid.values()) if (a.owner === owner) a.owner = this.s.hostId;
    }
  }
  installIssueSixFollowup({ NetMatch: NM });
  const gone = { nid: 1, owner: 'gone' }, mine = { nid: 2, owner: 'me' };
  const nm = new NM();
  nm.bind({ actors: [gone, mine] });
  assert.deepEqual(nm.left, ['gone']);
  assert.equal(gone.owner, 'me', 'existing live leave policy receives the missing owner at bind');
});

test('#1016: Shooter cancel edge gates sub for 3F and squid for 4F', () => {
  class Runner {
    constructor(a) { this.a = a; this.s3ShooterHeld = true; this.s3ShooterPendingFirst = false; this.aimingSub = false; }
    reset() {}
    cancelPendingInput() {}
    busy() { return false; }
    update(_dt, input) {
      this.lastInput = input;
      if (!input.fire) this.s3ShooterHeld = false;
      if (input.sub) this.aimingSub = true;
    }
  }
  class Actor {
    constructor() {
      this.weapon = { kind: 'shooter' }; this.alive = true; this.specialActive = null; this.superJumpState = null;
      this.form = 'kid'; this.intent = { fire: true, sub: false, squid: false };
      this._prevIntent = { fire: true, sub: false, squid: false };
      this.weaponRunner = new Runner(this);
    }
    update(dt) {
      if (this.intent.squid && !this.weaponRunner.busy()) this.form = 'squid';
      const subReleased = !this.intent.sub && this._prevIntent.sub;
      this.weaponRunner.update(dt, { fire: this.intent.fire, firePressed: false, sub: this.intent.sub, subReleased });
      this._prevIntent = { ...this._prevIntent, ...this.intent };
    }
  }
  installIssueSixFollowup({ Actor, WeaponRunner: Runner });

  const squid = new Actor();
  squid.intent.squid = true; // newer ZL edge while the continuous ZR action is live
  squid.update(DT);
  assert.equal(squid.form, 'kid', 'cancel tick blocked');
  for (let i = 1; i <= 3; i++) { squid.update(DT); assert.equal(squid.form, 'kid', `C+${i} blocked`); }
  squid.update(DT);
  assert.equal(squid.form, 'squid', 'C+4 admits squid');

  const sub = new Actor();
  sub.intent.sub = true; // R cancellation edge
  sub.update(DT);
  assert.equal(sub.weaponRunner.aimingSub, false, 'C blocked');
  sub.update(DT); assert.equal(sub.weaponRunner.aimingSub, false, 'C+1 blocked');
  sub.update(DT); assert.equal(sub.weaponRunner.aimingSub, false, 'C+2 blocked');
  sub.update(DT);
  assert.equal(sub.weaponRunner.aimingSub, true, 'C+3 admits sub preparation');
  assert.equal(sub.weaponRunner.lastInput.fire, false, 'main fire stays cancelled while R owns the action');
});
