import test from 'node:test';
import assert from 'node:assert/strict';
import { installRankedBots } from '../runtime/ranked/bots.mjs';

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  length() { return Math.sqrt(this.lengthSq()); }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
}

class FakeBotBrain {
  constructor(actor) {
    this.a = actor;
    this.path = null; this.pi = 0; this.repath = 0; this.jumpCd = 0;
    this.mvYaw = actor.yaw; this.mvMag = 0; this.noProg = 0;
    this.pathCalls = []; this.tailCalls = [];
    this.routeWorks = true;
  }
  update(dt) {
    this.a.intent.fire = false;
    this.a.intent.sub = true; // ranked actions must suppress native bomb throws
    this._tail(dt, this._steer(dt), 0, 0, 6, false);
    return 'native-update';
  }
  _pathTo(target, maxUp) {
    this.pathCalls.push({ target: { x: target.x, y: target.y, z: target.z }, maxUp });
    if (!this.routeWorks) { this.path = null; this.repath = 1; return false; }
    this.path = [0]; this.pi = 0; this.repath = 1; return true;
  }
  _steer() { return new Vec3(0, 0, 0); }
  _tail(dt, move, yaw, pitch, aimDist, wantMove) {
    this.tailCalls.push({ dt, move: { x: move.x, y: move.y, z: move.z }, yaw, pitch, aimDist, wantMove });
    this.a.intent.move.copy(move);
  }
}

function setup(mode, action, pos = [4, 0, 0], actorOptions = {}) {
  const initialPos = actorOptions.pos instanceof Vec3 ? actorOptions.pos : new Vec3(...(actorOptions.pos || [0, 0, 0]));
  const actor = {
    team: 0, slot: 1, nid: null, alive: true, grounded: true, remote: false,
    superJumpState: false, form: 'human', groundTeam: 0, ink: 100, yaw: 0,
    pos: initialPos, aimPoint: new Vec3(),
    weapon: { weight: 'middle', kind: 'shooter' }, weaponRunner: { charging: false },
    intent: { move: new Vec3(), fire: false, sub: false, jump: false, squid: false, special: false, throw: false },
    ...actorOptions,
  };
  const goal = { pos, action };
  const seen = [];
  const engine = {
    mode,
    frame: { actors: [{ id: '0:1', team: 0, pos: [actor.pos.x, actor.pos.y, actor.pos.z], alive: true, grounded: true, remote: false, weight: 'middle' }], inputs: {} },
    stage: { tower: { halfSize: 1.4 } },
    rule: { botGoal(frameActor, frame) { seen.push({ actor: frameActor, frame }); return goal; } },
  };
  const match = { ranked: engine, playing: () => true };
  class LocalBotBrain extends FakeBotBrain {}
  installRankedBots({ G: { match }, BotBrain: LocalBotBrain });
  return { actor, brain: new LocalBotBrain(actor), engine, goal, seen };
}

test('ranked bots path to rule-owned paint goals and keep the normal aim/movement tail', () => {
  const { actor, brain, goal, seen } = setup('zones', 'paint', [5, 0, 0]);
  assert.equal(brain.update(1 / 60), 'native-update');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].actor.id, '0:1');
  assert.deepEqual(brain.pathCalls[0].target, { x: 5, y: 0, z: 0 });
  assert.equal(brain.tailCalls.length, 1);
  assert.equal(brain.mode, 'ranked');
  assert.equal(actor.intent.fire, true);
  assert.equal(actor.intent.sub, false);
  assert.ok(brain.tailCalls[0].yaw > 0);
  assert.equal(brain.tailCalls[0].wantMove, false);
  assert.equal(goal.action, 'paint');
});

test('ranked bot keeps a world-space aim point near the origin', () => {
  const { brain, goal } = setup('zones', 'paint', [1, 0, 0]);
  goal.aim = { x: 0, y: 0, z: 1 };

  brain.update(1 / 60);

  assert.ok(brain.tailCalls[0].aimDist < 2,
    'a world point one unit from the actor must not become a sixteen-unit direction ray');
  assert.equal(brain.tailCalls[0].yaw, 0);
});

test('Tower Control bots jump onto the moving deck, then hold position while riding', () => {
  const { actor, brain, engine } = setup('tower', 'ride', [1, 1, 0], { pos: new Vec3(0, 0, 0) });
  brain.update(1 / 60);
  assert.equal(brain.pathCalls[0].maxUp, 4.2);
  assert.equal(actor.intent.jump, true);
  assert.equal(brain.tailCalls.length, 1);

  actor.pos.set(0.9, 0.8, 0);
  engine.frame.actors[0].pos = [actor.pos.x, actor.pos.y, actor.pos.z];
  actor.intent.jump = false;
  brain.update(1 / 60);
  assert.equal(actor.intent.jump, false);
  assert.deepEqual(actor.intent.move, new Vec3(0, 0, 0));
});

test('Rainmaker bots paint the shield, carry and charge toward the goal', () => {
  const shield = setup('rainmaker', 'barrier', [0, 0, -4]);
  shield.brain.update(1 / 60);
  assert.equal(shield.actor.intent.fire, true);
  assert.equal(shield.actor.intent.sub, false);

  const carrier = setup('rainmaker', 'carry', [8, 0, 0], { groundTeam: 1 });
  carrier.brain.update(1 / 60);
  assert.equal(carrier.actor.intent.fire, true);
  assert.equal(carrier.actor.intent.squid, true);
  assert.equal(carrier.brain.mode, 'ranked');
});

test('Rainmaker shield aim extends range while preserving the native smoothed angles', () => {
  const { actor, brain } = setup('rainmaker', 'barrier', [0, 0, -9]);
  const smoothedYaw = 0.37, smoothedPitch = -0.21;
  brain._tail = function (dt, move, yaw, pitch, aimDist, wantMove) {
    this.tailCalls.push({ dt, move: { x: move.x, y: move.y, z: move.z }, yaw, pitch, aimDist, wantMove });
    actor.aimYaw = smoothedYaw;
    actor.aimPitch = smoothedPitch;
    actor.intent.move.copy(move);
  };

  brain.update(1 / 60);

  const distance = brain.tailCalls[0].aimDist;
  const cp = Math.cos(smoothedPitch);
  const expected = new Vec3(
    actor.pos.x + Math.sin(smoothedYaw) * cp * distance,
    actor.pos.y + 1.1 + Math.sin(smoothedPitch) * distance,
    actor.pos.z + Math.cos(smoothedYaw) * cp * distance,
  );
  assert.ok(distance > 6, 'the shield is beyond BotBrain tail’s generic six-unit ray');
  assert.deepEqual(actor.aimPoint, expected, 'the extended aim point follows the tail’s smoothed yaw and pitch');
  assert.ok(Math.abs(Math.hypot(actor.aimPoint.x - actor.pos.x,
    actor.aimPoint.y - actor.pos.y - 1.1, actor.aimPoint.z - actor.pos.z) - distance) < 1e-9,
  'the projected smoothed ray retains the actual shield distance');
});

test('Rainmaker carrier releases the full charge, then starts the next charge cycle', () => {
  const carrier = setup('rainmaker', 'carry', [8, 0, 0]);
  carrier.engine.rule.state = { carrier: '0:1', charge: { seconds: 1 } };
  carrier.brain.update(1 / 60);
  assert.equal(carrier.actor.intent.fire, false, 'the charged input edge releases the dedicated Rainmaker shot');

  carrier.engine.rule.state.charge.seconds = 0;
  carrier.brain.update(1 / 60);
  assert.equal(carrier.actor.intent.fire, true, 'the bot starts charging again after the release frame');
});

test('Clam bots collect and throw on a dedicated edge without triggering bombs', () => {
  const pickup = setup('clams', 'collect', [4, 0, 0]);
  pickup.brain.update(1 / 60);
  assert.equal(pickup.actor.intent.fire, false);
  assert.ok(pickup.brain.pathCalls.length > 0);

  const thrower = setup('clams', 'throw', [4, 0, 0]);
  thrower.brain.update(1 / 60);
  assert.equal(thrower.actor.intent.throw, true);
  assert.equal(thrower.actor.intent.sub, false);
  assert.ok(thrower.brain.tailCalls[0].pitch < 0, 'the bot compensates for the throw loft when aiming at the basket');
  thrower.actor.intent.throw = false;
  thrower.brain.update(1 / 60);
  assert.equal(thrower.actor.intent.throw, false);
  thrower.brain.update(1);
  assert.equal(thrower.actor.intent.throw, true);
  assert.equal(thrower.actor.intent.sub, false);
});

test('Clam bots hold the power throw until the native aim spring reaches the target', () => {
  const { actor, brain } = setup('clams', 'throw', [4, 0, 0]);
  brain.aimYaw = 1.3;
  brain.aimPitch = 0.3;
  brain.update(1 / 60);
  assert.equal(actor.intent.throw, false, 'turning must not release a misaligned clam');
  assert.equal(brain._rankedThrowCd, 0, 'no cooldown before a real throw');
  brain.aimYaw = brain.tailCalls.at(-1).yaw;
  brain.aimPitch = brain.tailCalls.at(-1).pitch;
  brain.update(1 / 60);
  assert.equal(actor.intent.throw, true, 'aligned real aim can throw');
  assert.equal(brain._rankedThrowCd, 0.9);
});

test('Clam carrier keeps moving toward the basket until a throw can reach it', () => {
  const thrower = setup('clams', 'throw', [20, 0, 0]);
  thrower.brain.update(1 / 60);
  assert.equal(thrower.actor.intent.throw, false);
  assert.ok(thrower.brain.pathCalls.length > 0);
});

test('a bot uses a clear short route when a ranked objective has no static nav node', () => {
  const { actor, brain } = setup('tower', 'ride', [2, 1, 0]);
  brain.routeWorks = false;
  brain.update(1 / 60);
  assert.deepEqual(actor.intent.move, new Vec3(1, 0, 0));
  assert.equal(actor.intent.jump, true);
});
