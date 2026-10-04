// Issue #477 — build-only adapter and runtime helper:
// Splat Dualies 4F pre-roll startup before 12F roll movement.
//
// Reference: Splatoon 3 Ver. 11.3.0
// Community sequence: input recognition -> 4F pre-roll startup -> 12F roll movement -> post-roll turret recovery.
//
// Architectural rules:
// - Build-only adapter: original files in inkwave-public/ and game/ are untouched.
// - Scope: Splat Dualies roll startup only. No retune of other weapons, rollDist, rollTime, or lockTime.
// - During startup:
//   1. 12F movement clock (d.t) does NOT advance (held at 0).
//   2. dodgeVel() does NOT own horizontal velocity (returns false) and does NOT apply roll displacement.
//   3. Prior walk velocity is arrested upon initiating the roll; intent.move is zero-masked during startup.
//   4. Motion phase is 'startup' with tumble = 0 (tumble rotation does not advance).
//   5. The authoritative chosen roll direction is preserved deterministically.
// - Movement phase:
//   After 4F startup (at tick 5), dodgeVel() first owns horizontal velocity, phase becomes 'roll',
//   and the 12F roll movement runs with exact 12F duration and unaltered total displacement.
// - Post-roll:
//   At completion, lockT = w.lockTime (32F turret) and s3Turret is engaged.
//   Post-roll firing remains its own 4F gate (w.lockInterval = 4/60 s) and is not folded into startup.
// - Remote replication:
//   Remote proxy uses single clock advancement: initializes with 4F startup and advances startup
//   before roll time, without double-advancement or skipping startup.
// - Cancellation:
//   Splat, special, super jump, and weapon change cancel startup and clear runner dodge state.

export const DUALIES_STARTUP_FRAMES = 4;
export const DUALIES_STARTUP_SECONDS = 4 / 60; // 0.06666666666666667
export const DUALIES_ROLL_FRAMES = 12;
export const DUALIES_ROLL_SECONDS = 0.2; // 12 / 60
export const DUALIES_LOCK_FRAMES = 32;
export const DUALIES_LOCK_SECONDS = 32 / 60;
export const DUALIES_POST_ROLL_FIRE_GATE_FRAMES = 4;
export const DUALIES_POST_ROLL_FIRE_GATE_SECONDS = 4 / 60;

const EPS = 1e-10;

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-477 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptIssue477Weapons(code) {
  // 1. tryDodge: verify grounded condition
  code = replaceOnce(
    code,
    '  tryDodge(move) {\n    const a = this.a, w = a.weapon;\n    if (w.kind !== \'dualies\' || this.dodge || !a.alive || a.form === \'squid\' || this.aimingSub || !move) return false;',
    '  tryDodge(move) {\n    const a = this.a, w = a.weapon;\n    if (w.kind !== \'dualies\' || this.dodge || !a.alive || a.form === \'squid\' || !a.grounded || this.aimingSub || !move) return false;',
    'weapons tryDodge grounded check'
  );

  // 2. tryDodge: attach 4F startup to runner.dodge and arrest prior walk velocity
  code = replaceOnce(
    code,
    '    this._dodgeDir.set(move.x / ml, 0, move.z / ml);\n    this.dodge = { t: 0, dur: w.rollTime };',
    '    this._dodgeDir.set(move.x / ml, 0, move.z / ml);\n    this.dodge = { t: 0, dur: w.rollTime, startup: 4 / 60, startupDur: 4 / 60 };\n    if (a.vel) { a.vel.x = 0; a.vel.z = 0; }',
    'weapons tryDodge 4F startup initialization'
  );

  // 3. dodgeVel: do not own horizontal velocity or apply displacement curve during startup
  code = replaceOnce(
    code,
    '  dodgeVel(vel) {\n    const d = this.dodge;\n    if (!d) return false;',
    '  dodgeVel(vel) {\n    const d = this.dodge;\n    if (!d || (d.startup !== undefined && d.startup > 1e-10)) return false;',
    'weapons dodgeVel startup gate'
  );

  // 4. _dualies: countdown startup before advancing 12F movement clock; suppress trail paint during startup
  code = replaceOnce(
    code,
    '    if (this.dodge) {\n      const d = this.dodge;\n      d.t += dt;',
    '    if (this.dodge) {\n      const d = this.dodge;\n      if (d.startup !== undefined && d.startup > 1e-10) {\n        d.startup = Math.max(0, d.startup - dt);\n        a.fireFacing = 0.5; this.firingT = 0.35;\n        return;\n      }\n      d.t += dt;',
    'weapons _dualies startup countdown'
  );

  // 5. _dualies: exact 12F duration float tolerance and post-roll cooldown gate
  code = replaceOnce(
    code,
    '      if (d.t >= d.dur) { this.dodge = null; this.lockT = w.lockTime; }',
    '      if (d.t >= d.dur - 1e-5) { this.dodge = null; this.lockT = w.lockTime; if (this.cooldown < 0) this.cooldown = 0; }',
    'weapons _dualies exact 12F duration float tolerance'
  );

  return code;
}

export function adaptIssue477Actor(code) {
  // 1. Suppress walk input acceleration during Dualies startup
  code = replaceOnce(
    code,
    '    const mv = this.grounded && this.weaponRunner.lockT > 0 ? _ZERO_MOVE : this.intent.move;',
    '    const mv = this.grounded && (this.weaponRunner.lockT > 0 || (this.weaponRunner.dodge && this.weaponRunner.dodge.startup > 1e-10)) ? _ZERO_MOVE : this.intent.move;',
    'actor _horizontal startup _ZERO_MOVE mask'
  );

  // 2. Clear dodge and reset weapon runner on special activation
  code = replaceOnce(
    code,
    '    this.form = \'kid\';\n    this._setClimb(false);\n    emit(\'special:use\', { actor: this, id });',
    '    this.form = \'kid\';\n    this._setClimb(false);\n    this.weaponRunner.reset();\n    emit(\'special:use\', { actor: this, id });',
    'actor _startSpecial reset weaponRunner'
  );

  return code;
}

export function adaptIssue477DualiesMotion(code) {
  // In dualies-motion prepare: distinguish 'startup' from 'roll'
  code = replaceOnce(
    code,
    '    s.progress = mapped ? clamp01((d ? d.t : previewAge) / duration) : 0;\n    s.phase = mapped && active && (d || preview && previewAge < duration) ? \'roll\'\n      : active && ch.grounded && (runner ? runner.lockT > 0 || runner.s3Turret\n        : preview && previewAge < duration + .5) ? \'plant\' : null;',
    '    const inStartup = d && (d.startup > 1e-10 || (d.startupDur > 0 && d.t <= 1e-10));\n    s.progress = mapped ? clamp01((d ? d.t : previewAge) / duration) : 0;\n    s.phase = mapped && active && (d || preview && previewAge < duration)\n      ? (inStartup ? \'startup\' : \'roll\')\n      : active && ch.grounded && (runner ? runner.lockT > 0 || runner.s3Turret\n        : preview && previewAge < duration + .5) ? \'plant\' : null;',
    'dualies-motion prepare startup phase separation'
  );
  return code;
}

export function adaptIssue477Net(code) {
  // Remote proxy: replicate 4F startup on first reception, avoid double-advancement
  code = replaceOnce(
    code,
    '    if (f & F.dodge) { if (!wr.dodge) wr.dodge = { t: 0, dur: a.weapon.rollTime || 0.3 }; wr.dodge.t += dt; } else wr.dodge = null;',
    '    if (f & F.dodge) {\n      if (!wr.dodge) wr.dodge = { t: 0, dur: a.weapon.rollTime || 0.2, startup: 4 / 60, startupDur: 4 / 60 };\n      if (wr.dodge.startup > 1e-10) wr.dodge.startup = Math.max(0, wr.dodge.startup - dt);\n      else wr.dodge.t += dt;\n    } else wr.dodge = null;',
    'netmatch applyRemote dodge startup synchronization'
  );
  return code;
}

export function adaptIssue477Source(rel, code) {
  const normalized = rel.replace(/^inkwave-public\//, '');
  if (normalized === 'src/game/weapons.js') return adaptIssue477Weapons(code);
  if (normalized === 'src/game/actor.js') return adaptIssue477Actor(code);
  if (normalized === 'src/net/netmatch.js') return adaptIssue477Net(code);
  if (normalized === 'patches/splatoon3/runtime/dualies-motion.mjs') return adaptIssue477DualiesMotion(code);
  return code;
}

const INSTALLED = Symbol.for('inkwave.issue477.dualiesStartup');

export function installIssue477DualiesStartup(context) {
  const { WeaponRunner, Actor, Character } = context;
  if (!WeaponRunner) return;
  const proto = WeaponRunner.prototype;
  if (proto[INSTALLED]) return;
  Object.defineProperty(proto, INSTALLED, { value: true });

  // If already adapted via source, methods already include startup handling
  if (proto.tryDodge && proto.tryDodge.toString().includes('startupDur')) {
    return;
  }

  const originalTryDodge = proto.tryDodge;
  const originalDodgeVel = proto.dodgeVel;
  const originalDualies = proto._dualies;

  proto.tryDodge = function (move) {
    if (this.a && !this.a.grounded) return false;
    const success = originalTryDodge.call(this, move);
    if (success && this.dodge) {
      this.dodge.startup = DUALIES_STARTUP_SECONDS;
      this.dodge.startupDur = DUALIES_STARTUP_SECONDS;
      if (this.a?.vel) {
        this.a.vel.x = 0;
        this.a.vel.z = 0;
      }
    }
    return success;
  };

  proto.dodgeVel = function (vel) {
    const d = this.dodge;
    if (!d || (d.startup !== undefined && d.startup > EPS)) return false;
    return originalDodgeVel.call(this, vel);
  };

  proto._dualies = function (dt, inp, w) {
    if (this.dodge) {
      const d = this.dodge;
      if (d.startup !== undefined && d.startup > EPS) {
        d.startup = Math.max(0, d.startup - dt);
        this.a.fireFacing = 0.5;
        this.firingT = 0.35;
        return;
      }
    }
    const res = originalDualies.call(this, dt, inp, w);
    if (this.dodge && this.dodge.t >= this.dodge.dur - 1e-5) {
      this.dodge = null;
      this.lockT = w.lockTime;
      if (this.cooldown < 0) this.cooldown = 0;
    }
    return res;
  };

  if (Actor) {
    const actorProto = Actor.prototype;
    const origStartSpecial = actorProto._startSpecial;
    if (origStartSpecial && !actorProto._startSpecial.toString().includes('weaponRunner.reset')) {
      actorProto._startSpecial = function () {
        this.weaponRunner?.reset();
        return origStartSpecial.apply(this, arguments);
      };
    }
  }

  if (Character) {
    const chProto = Character.prototype;
    const originalUpdateStates = chProto._updateStates;
    const INSTALL_KEY = Symbol.for('inkwave.splatoon3.dualies-motion.v1');
    if (originalUpdateStates) {
      chProto._updateStates = function (dt, input) {
        const result = originalUpdateStates.call(this, dt, input);
        const installation = this.constructor?.prototype?.[INSTALL_KEY];
        const s = installation?.states?.get(this);
        const runner = this._runner?.(input);
        const d = runner?.dodge;
        if (s && d && (d.startup > EPS || (d.startupDur > 0 && d.t <= EPS))) {
          s.phase = 'startup';
          s.progress = 0;
          this.tumble = 0;
          this.tumbleDrop = 0;
          this.lockW = 0;
        }
        return result;
      };
    }
  }
}
