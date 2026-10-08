// Issue #477 — build-only adapter:
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
//   4. Motion phase is 'startup' with tumble = 0; actual bounded native tuck/pose is applied.
//   5. Authoritative chosen roll direction and monotonic roll token are preserved deterministically.
// - Movement phase:
//   After 4F startup (at tick 5), dodgeVel() first owns horizontal velocity, phase becomes 'roll',
//   and the 12F roll movement runs with exact 12F duration and unaltered total displacement.
// - Post-roll:
//   At completion, lockT = w.lockTime (32F turret) and s3Turret is engaged.
//   Post-roll firing remains its own 4F gate (w.lockInterval = 4/60 s) and is not folded into startup.
// - Remote replication:
//   Replicates authoritative roll token/phase/time via OPTIONAL NAMED sidecar ('rl') on owner snapshot.
//   Preserves existing mandatory named 'l' life, sender/ownership/timestamp admission.
//   No actor tuple extension (DraftPR328 reserves slot 21 for stats.specials; OwnPR495 reserves flagbit 20 for ready).
//   Late packet displays current moving phase without fresh anticipation; stale packet cannot restart phase;
//   chained rolls each carry genuine new startup token; remote presentation never applies gameplay damage/movement.
// - Cancellation:
//   Special activation only clears current Dualies dodge on successful special admission, preserving
//   other weapons and failed special states. No broad reset.
// - Physical measurement disclaimer:
//   physicalNintendoanglesunmeasured: exact Nintendo Splatoon 3 joint angles remain unmeasured;
//   existing rig calibrated tuck is applied.

export const DUALIES_STARTUP_FRAMES = 4;
export const DUALIES_STARTUP_SECONDS = 4 / 60; // 0.06666666666666667
export const DUALIES_ROLL_FRAMES = 12;
export const DUALIES_ROLL_SECONDS = 0.2; // 12 / 60
export const DUALIES_LOCK_FRAMES = 32;
export const DUALIES_LOCK_SECONDS = 32 / 60;
export const DUALIES_POST_ROLL_FIRE_GATE_FRAMES = 4;
export const DUALIES_POST_ROLL_FIRE_GATE_SECONDS = 4 / 60;
export const PHYSICAL_NINTENDO_ANGLES_UNMEASURED = true;

const EPS = 1e-10;

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-477 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptIssue477Weapons(code) {
  // Keep the current admission owner, including SubAction's held-sub exclusion.
  // Only genuinely reduced fixtures may omit this method; a real unknown guard
  // must fail closed instead of silently dropping the entire startup phase.
  const prefix = "  tryDodge(move) {\n    const a = this.a, w = a.weapon;\n    if (w.kind !== 'dualies' || this.dodge || !a.alive || a.form === 'squid' || ";
  const suffix = "this.aimingSub || ";
  const guards = [prefix + suffix + '!move) return false;', prefix + suffix + 'a.intent.sub || !move) return false;',
    prefix + '!a.grounded || ' + suffix + '!move) return false;', prefix + '!a.grounded || ' + suffix + 'a.intent.sub || !move) return false;'];
  const matches = guards.filter(anchor => code.includes(anchor));
  if (matches.length !== 1) {
    if (!code.includes('  tryDodge(move) {')) return code;
    throw new Error('INKWAVE issue-477 patch conflict: current tryDodge admission');
  }
  code = replaceOnce(code, matches[0], matches[0], 'existing tryDodge admission owner');

  // 2. tryDodge: attach 4F startup to runner.dodge, monotonic authoritative roll token, and arrest prior walk velocity
  code = replaceOnce(
    code,
    '    this._dodgeDir.set(move.x / ml, 0, move.z / ml);\n    this.dodge = { t: 0, dur: w.rollTime };',
    '    this._dodgeDir.set(move.x / ml, 0, move.z / ml);\n    this._rollToken = (this._rollToken || 0) + 1;\n    this.dodge = { token: this._rollToken, t: 0, dur: w.rollTime, startup: 4 / 60, startupDur: 4 / 60 };\n    if (a.vel) { a.vel.x = 0; a.vel.z = 0; }',
    'weapons tryDodge 4F startup initialization'
  );

  // Modern movement delegates to the shared interval integrator. Its startup
  // gate is connected below, including Actor's direct integration entry.
  const movementDodgeVel = '  dodgeVel(vel, dt = 1 / 60) {\n    return writeDodgeVelocity(this, vel, dt);\n  }';
  if (code.includes(movementDodgeVel)) {
    code = replaceOnce(code, movementDodgeVel, movementDodgeVel, 'weapons shared dodge velocity owner');
  } else {
    code = replaceOnce(code,
      '  dodgeVel(vel) {\n    const d = this.dodge;\n    if (!d) return false;',
      '  dodgeVel(vel) {\n    const d = this.dodge;\n    if (!d || (d.startup !== undefined && d.startup > 1e-10)) return false;',
      'weapons dodgeVel startup gate');
  }

  // 4. _dualies: countdown startup before advancing 12F movement clock; suppress trail paint during startup
  code = replaceOnce(
    code,
    '    if (this.dodge) {\n      const d = this.dodge;\n      d.t += dt;',
    '    if (this.dodge) {\n      const d = this.dodge;\n      if (d.startup !== undefined && d.startup > 1e-10) {\n        d.startup = Math.max(0, d.startup - dt);\n        a.fireFacing = 0.5; this.firingT = 0.35;\n        return;\n      }\n      d.t += dt;',
    'weapons _dualies startup countdown'
  );

  // Preserve the installed movement owner's exact end and recovery carry.
  const movementEnd = '      if (d.t + MOVEMENT_EPSILON >= d.dur) { this.dodge = null; this.lockT = Math.max(0, w.lockTime - Math.max(0, d.t - d.dur)); }';
  if (code.includes(movementEnd)) {
    code = replaceOnce(code, movementEnd,
      movementEnd.replace(' }', ' if (this.cooldown < 0) this.cooldown = 0; }'),
      'weapons shared dodge end and recovery carry');
  } else {
    code = replaceOnce(code,
      '      if (d.t >= d.dur) { this.dodge = null; this.lockT = w.lockTime; }',
      '      if (d.t >= d.dur - 1e-5) { this.dodge = null; this.lockT = w.lockTime; if (this.cooldown < 0) this.cooldown = 0; }',
      'weapons _dualies exact 12F duration float tolerance');
  }

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

  // 2. Clear current Dualies dodge only on special activation after successful special admission.
  // Preserves other weapons and failed special native states (no blanket weaponRunner.reset()).
  code = replaceOnce(
    code,
    '    this.form = \'kid\';\n    this._setClimb(false);\n    emit(\'special:use\', { actor: this, id });',
    '    this.form = \'kid\';\n    this._setClimb(false);\n    if (this.weaponRunner?.dodge) this.weaponRunner.dodge = null;\n    emit(\'special:use\', { actor: this, id });',
    'actor _startSpecial cancel current dualies dodge only'
  );

  // 3. Clear roll admission on Actor reset()
  code = replaceOnce(
    code,
    '    this.weaponRunner?.reset();',
    '    this.weaponRunner?.reset();\n    if (this.net) { delete this.net.lastRollToken; delete this.net.rollOwner; delete this.net.rollLife; }',
    'actor reset roll admission reset'
  );

  return code;
}

export function adaptIssue477DualiesMotion(code) {
  // 1. In dualies-motion prepare: distinguish 'startup' from 'roll'
  code = replaceOnce(
    code,
    '    s.progress = mapped ? clamp01((d ? d.t : previewAge) / duration) : 0;\n    s.phase = mapped && active && (d || preview && previewAge < duration) ? \'roll\'\n      : active && ch.grounded && (runner ? runner.lockT > 0 || runner.s3Turret\n        : preview && previewAge < duration + .5) ? \'plant\' : null;',
    '    const inStartup = d && (d.startup > 1e-10 || (d.startupDur > 0 && d.t <= 1e-10));\n    s.progress = mapped ? clamp01((d ? d.t : previewAge) / duration) : 0;\n    s.phase = mapped && active && (d || preview && previewAge < duration)\n      ? (inStartup ? \'startup\' : \'roll\')\n      : active && ch.grounded && (runner ? runner.lockT > 0 || runner.s3Turret\n        : preview && previewAge < duration + .5) ? \'plant\' : null;',
    'dualies-motion prepare startup phase separation'
  );

  // 2. In _poseDodge: apply actual bounded native tuck during startup without movement or tumble
  // Note: exact Nintendo Splatoon 3 joint angles remain unmeasured; uses calibrated tuck
  code = replaceOnce(
    code,
    '    if (s?.phase !== \'roll\') {\n      // Native D..D+.28 recovery was still layering foot/hip offsets over the\n      // planted weapon pose and the first actual post-roll recoil impulses.\n      this.tumble = this.tumbleDrop = 0;\n      return;\n    }',
    '    if (s?.phase !== \'roll\' && s?.phase !== \'startup\') {\n      this.tumble = this.tumbleDrop = 0;\n      return;\n    }\n    if (s?.phase === \'startup\') {\n      const { turnStart } = DUALIES_MOTION_CALIBRATION;\n      const tuckTime = turnStart * this.dodgeDur;\n      const result = dodge.call(this, P, tuckTime);\n      this.tumble = 0;\n      this.tumbleDrop = 0;\n      return result;\n    }',
    'dualies-motion _poseDodge startup anticipation tuck'
  );

  // 3. In _poseLook: ensure unposed startup triggers fallback pose before gaze/head
  code = replaceOnce(
    code,
    '    if (enabled(this) && s?.phase === \'roll\' && !s.posed) this._poseDodge(this.P, 0);',
    '    if (enabled(this) && (s?.phase === \'roll\' || s?.phase === \'startup\') && !s.posed) this._poseDodge(this.P, 0);',
    'dualies-motion _poseLook startup fallback check'
  );

  return code;
}

export function adaptIssue477Net(code) {
  code = replaceOnce(code,
    "import { G, emit, on } from '../core/ctx.js';",
    "import { G, emit, on } from '../core/ctx.js';\nimport { acceptDodgeEpoch, calibrateDodgeEpoch, dodgeClockAt, sampleForAcceptedDodgeEvent, DUALIES_DODGE_STARTUP_SECONDS } from '../../patches/splatoon3/runtime/dualies-dodge-clock.mjs';",
    'accepted Dualies event clock helper');

  // 1. Owner tick: replicate authoritative roll token/phase/time via OPTIONAL NAMED sidecar 'rl'
  // Attaches msg.rl at unique broadcast boundary, preserving any existing 'l' (combat-life),
  // 'sc' (special-charge PR495), and reserved slot 21 / flag 20.
  code = replaceOnce(
    code,
    '    this.stats.out++;\n    this.s.tr?.broadcast(msg);',
    `    msg.rl = Object.fromEntries([...this.byNid.values()].filter(x => !x.remote && x.weaponRunner?.dodge).map(x => [x.nid, {
      token: x.weaponRunner.dodge.token || 1,
      phase: (x.weaponRunner.dodge.startup > 1e-10 || x.weaponRunner.dodge.startupDur > 0 && x.weaponRunner.dodge.t <= 1e-10 ? 'startup' : 'roll'),
      time: r3(x.weaponRunner.dodge.startup > 1e-10 || x.weaponRunner.dodge.startupDur > 0 && x.weaponRunner.dodge.t <= 1e-10 ? Math.max(0, (x.weaponRunner.dodge.startupDur || (4 / 60)) - x.weaponRunner.dodge.startup) : x.weaponRunner.dodge.t),
      dur: r3(x.weaponRunner.dodge.dur || 0.2),
      ...(x.weaponRunner._dodgeDir && Number.isFinite(x.weaponRunner._dodgeDir.x) && Number.isFinite(x.weaponRunner._dodgeDir.z)
        ? { dir: [r2(x.weaponRunner._dodgeDir.x), r2(x.weaponRunner._dodgeDir.z)] }
        : {})
    }]));
    this.stats.out++;
    this.s.tr?.broadcast(msg);`,
    'netmatch sendTick roll sidecar'
  );

  // 2. Incoming tick: unpack optional named roll sidecar onto snapshot with packet origin timestamp
  code = replaceOnce(
    code,
    '      if (buf.length && snap.t <= buf[buf.length - 1].t) continue;\n',
    `      if (buf.length && snap.t <= buf[buf.length - 1].t) continue;
      const _rl = d.rl?.[a.nid] ?? d.roll?.[a.nid];
      snap.roll = (_rl && typeof _rl === 'object') ? { ..._rl, origT: snap.t } : null;
      if (snap.roll && a.net.rollEventEpoch && (snap.f & F.dodge)) {
        a.net.rollEventEpoch = calibrateDodgeEpoch(a.net.rollEventEpoch, {
          owner: from, life: snap.life ?? a.net.lastLife ?? 0, token: snap.roll.token,
          teleport: snap.tp, sampleTime: snap.t, phase: snap.roll.phase, time: snap.roll.time
        });
      }
`,
    'netmatch _tick unpack roll sidecar'
  );

  // 3. applyRemote: replicate authoritative roll state.
  // Phase time is derived purely from owner state + peer.playback tr (existing native owner clock)
  // minus accepted packet timestamp, bounded by existing extrapolation .18s.
  // Cannot double-advance repeatedly on the same playback TR.
  // Last roll token is scoped to current owner + accepted snapshot life.
  // Invalid/legacy scalar data gracefully falls back and cannot poison lastRollToken.
  const netDodgeOld = '    if (f & F.dodge) { if (!wr.dodge) wr.dodge = { t: 0, dur: a.weapon.rollTime || 0.3 }; wr.dodge.t += dt; } else wr.dodge = null;';
  const netDodgeNew = `    if (f & F.dodge) {
      const rl = S.roll;
      const currentLife = S.life ?? a.net.lastLife ?? 0;
      if (a.net.rollOwner !== a.owner || a.net.rollLife !== currentLife) {
        a.net.rollOwner = a.owner;
        a.net.rollLife = currentLife;
        a.net.lastRollToken = 0;
      }
      const isValid = rl && typeof rl === 'object' &&
        Number.isSafeInteger(rl.token) && rl.token > 0 &&
        Number.isFinite(rl.time) && rl.time >= 0 &&
        Number.isFinite(rl.dur) && rl.dur > 0 &&
        (rl.phase === 'startup' || rl.phase === 'roll');
      if (isValid) {
        const lastTk = a.net.lastRollToken || 0;
        if (rl.token >= lastTk) {
          if (rl.token > lastTk) a.net.lastRollToken = rl.token;
          const tk = rl.token;
          const peer = this._peer(a.owner);
          const tr = (peer && Number.isFinite(peer.tr)) ? peer.tr : S.t;
          const origT = (rl.origT !== undefined && Number.isFinite(rl.origT)) ? rl.origT : S.t;
          const phaseAge = Math.min(Math.max(0, tr - origT), 0.18);
          const epoch = a.net.rollEventEpoch;
          const epochMatches = a.weapon?.kind === 'dualies' && epoch
            && epoch.owner === a.owner && epoch.life === currentLife && epoch.token === tk
            && epoch.teleport === S.tp;
          if (epoch && !epochMatches) a.net.rollEventEpoch = null;
          if (epochMatches) {
            const clock = dodgeClockAt(epoch, tr, rl.dur);
            if (clock) wr.dodge = { token: tk, ...clock };
          } else {
            const startupDur = DUALIES_DODGE_STARTUP_SECONDS;
            const startupRemainingAtOrig = Math.max(0, startupDur - rl.time);
            if (rl.phase === 'startup') {
              if (phaseAge <= startupRemainingAtOrig + 1e-10) {
                wr.dodge = {
                  token: tk,
                  t: 0,
                  dur: rl.dur,
                  startup: Math.max(0, startupRemainingAtOrig - phaseAge),
                  startupDur: startupDur
                };
              } else {
                wr.dodge = {
                  token: tk,
                  t: Math.min(rl.dur, phaseAge - startupRemainingAtOrig),
                  dur: rl.dur,
                  startup: 0,
                  startupDur: 0
                };
              }
            } else {
              wr.dodge = {
                token: tk,
                t: Math.min(rl.dur, rl.time + phaseAge),
                dur: rl.dur,
                startup: 0,
                startupDur: 0
              };
            }
          }
          if (rl.dir && Array.isArray(rl.dir) && Number.isFinite(rl.dir[0]) && Number.isFinite(rl.dir[1])) {
            if (!wr._dodgeDir) wr._dodgeDir = new THREE.Vector3();
            wr._dodgeDir.set(rl.dir[0], 0, rl.dir[1]);
          }
        }
      } else {
        a.net.rollEventEpoch = null;
        if (!wr.dodge) wr.dodge = { token: 0, t: 0, dur: a.weapon?.rollTime || 0.2 };
        wr.dodge.startup = 0; wr.dodge.startupDur = 0;
        wr.dodge.t = Math.min(wr.dodge.dur, wr.dodge.t + dt);
      }
    } else {
      a.net.rollEventEpoch = null;
      wr.dodge = null;
    }`;
  code = replaceOnce(code, netDodgeOld, netDodgeNew, 'netmatch applyRemote authoritative roll sidecar');

  // 4. Host adoption: clear roll admission tracking
  code = replaceOnce(
    code,
    '    a.net.buf.length = 0;\n    if (a.alive && a.net.spawnPending)',
    '    delete a.net.lastRollToken; delete a.net.rollOwner; delete a.net.rollLife; delete a.net.rollEventEpoch;\n    a.net.buf.length = 0;\n    if (a.alive && a.net.spawnPending)',
    'netmatch _adopt roll admission reset'
  );

  return code;
}

export function adaptIssue477MovementPhysics(code) {
  // Startup owns only the roll displacement. Native gravity, contact and
  // external velocity still run; admission already arrests previous walking.
  code = replaceOnce(code,
    '  const d = r.dodge;\n  if (!d) return false;',
    '  const d = r.dodge;\n  if (!d || d.startup > MOVEMENT_EPSILON) return false;',
    'shared dodge velocity waits for startup');
  return replaceOnce(code,
    '  if (!d || a.climbing || a.specialActive || a.superJumpState || !(dt > 0)) {',
    '  if (!d || d.startup > MOVEMENT_EPSILON || a.climbing || a.specialActive || a.superJumpState || !(dt > 0)) {',
    'Actor integration waits for startup');
}

export function adaptIssue477Source(rel, code) {
  const normalized = rel.replace(/^inkwave-public\//, '');
  if (normalized === 'src/game/weapons.js') return adaptIssue477Weapons(code);
  if (normalized === 'src/game/actor.js') return adaptIssue477Actor(code);
  if (normalized === 'src/net/netmatch.js') return adaptIssue477Net(code);
  if (normalized === 'patches/splatoon3/runtime/dualies-motion.mjs') return adaptIssue477DualiesMotion(code);
  if (normalized === 'patches/splatoon3/runtime/movement-physics.mjs') return adaptIssue477MovementPhysics(code);
  return code;
}
