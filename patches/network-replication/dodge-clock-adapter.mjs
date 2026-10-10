// #1163: bind the presentation trigger and optional recovery sidecar to the
// owner's accepted Dualies action epoch. No gameplay runner state is advanced.
function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1)
    throw Error(`Issue #1163 adapter anchor mismatch (${label})`);
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptIssue1163RemoteDodgeClock(code) {
  code = "import { acceptRemoteDodgeClock, interruptRemoteDodgeClock, clearRemoteDodgeClock, syncRemoteDodgeClock } from '../../patches/splatoon3/runtime/remote-dodge-clock.mjs';\n" + code;

  code = replaceOnce(code,
    '  _rec(e) {',
    `  _rec(e) {
    const at = r3(now());
    let payload = e;
    if (e[0] === 'tr' && e[2] === 'dodge') {
      const actor = this.byNid.get(e[1]), action = actor?.weaponRunner?.dodge;
      const life = actor?.netLife, tp = actor?.netTp ?? 0;
      const startupDur = action?.startupDur, duration = action?.dur, lockDur = actor?.weapon?.lockTime;
      if (actor && !actor.remote && actor.owner === this.myId
        && Number.isSafeInteger(action?.token) && action.token > 0
        && Number.isSafeInteger(life) && life >= 0 && Number.isSafeInteger(tp) && tp >= 0
        && Number.isFinite(startupDur) && startupDur >= 0
        && Number.isFinite(duration) && duration > 0
        && Number.isFinite(lockDur) && lockDur >= 0) {
        const meta = { token: action.token, start: at, life, tp, startupDur, dur: duration, lockDur };
        payload = [...e];
        payload[3] = { ...(e[3] && typeof e[3] === 'object' ? e[3] : {}), ...meta };
        actor.net._remoteDodge = meta;
      }
    } else if (e[0] === 'tr' && e[2] === 'spawn') {
      const actor = this.byNid.get(e[1]), life = actor?.netLife, tp = actor?.netTp ?? 0;
      if (actor && !actor.remote && actor.owner === this.myId
        && Number.isSafeInteger(life) && life >= 0 && Number.isSafeInteger(tp) && tp >= 0) {
        payload = [...e];
        payload[3] = { ...(e[3] && typeof e[3] === 'object' ? e[3] : {}), life, tp };
      }
    }
`, 'accepted dodge event metadata');
  code = replaceOnce(code,
    'const event = [r3(now()), ...e, tick, seq];',
    'const event = [at, ...payload, tick, seq];', 'accepted dodge event timestamp');

  code = replaceOnce(code,
    `      dur: r3(x.weaponRunner.dodge.dur || 0.2),
      ...(x.weaponRunner._dodgeDir && Number.isFinite(x.weaponRunner._dodgeDir.x) && Number.isFinite(x.weaponRunner._dodgeDir.z)
        ? { dir: [r2(x.weaponRunner._dodgeDir.x), r2(x.weaponRunner._dodgeDir.z)] }
        : {})`,
    `      dur: r3(x.weaponRunner.dodge.dur || 0.2),
      ...(x.net?._remoteDodge && x.net._remoteDodge.token === x.weaponRunner.dodge.token
        && x.net._remoteDodge.life === (x.netLife ?? 0) && x.net._remoteDodge.tp === (x.netTp ?? 0)
        ? { start: x.net._remoteDodge.start, life: x.net._remoteDodge.life, tp: x.net._remoteDodge.tp,
          startupDur: x.net._remoteDodge.startupDur, lockDur: x.net._remoteDodge.lockDur }
        : {}),
      ...(x.weaponRunner._dodgeDir && Number.isFinite(x.weaponRunner._dodgeDir.x) && Number.isFinite(x.weaponRunner._dodgeDir.z)
        ? { dir: [r2(x.weaponRunner._dodgeDir.x), r2(x.weaponRunner._dodgeDir.z)] }
        : {})`, 'snapshot carries the exact accepted action epoch');

  code = replaceOnce(code,
    'function unpackActor(s, ts) {\n  return { t: ts,',
    'function unpackActor(s, ts) {\n  return { t: ts, stateAt: ts,', 'snapshot keeps discrete-state time');

  code = replaceOnce(code,
    '        Number.isFinite(rl.dur) && rl.dur > 0 &&\n        (rl.phase === \'startup\' || rl.phase === \'roll\');',
    `        Number.isFinite(rl.dur) && rl.dur > 0 &&
        Number.isFinite(rl.start) && Number.isSafeInteger(rl.life) && rl.life === currentLife &&
        Number.isSafeInteger(rl.tp) && rl.tp === S.tp && Number.isFinite(rl.startupDur) && rl.startupDur >= 0 &&
        Number.isFinite(rl.lockDur) && rl.lockDur >= 0 &&
        (rl.phase === 'startup' || rl.phase === 'roll');`, 'sidecar requires accepted epoch and lifecycle');

  code = replaceOnce(code,
    `      } else {
        if (!wr.dodge) wr.dodge = { token: 0, t: 0, dur: a.weapon?.rollTime || 0.2 };
        wr.dodge.startup = 0; wr.dodge.startupDur = 0;
        wr.dodge.t = Math.min(wr.dodge.dur, wr.dodge.t + dt);
      }
    } else {`,
    `      } else {
        // F.dodge alone has no accepted-action epoch and cannot start a proxy pose.
        wr.dodge = null;
      }
    } else {`, 'legacy snapshot bit is not a start time');

  code = replaceOnce(code,
    '    wr.lockT = S.lock;',
    `    wr.lockT = S.lock;
    if (a.remote) {
      const interrupted = !!(f & (F.squid | F.subAim | F.special | F.sjCharge | F.sjFlight));
      syncRemoteDodgeClock(a, this._peer(a.owner).tr, S, !!(f & F.dodge), interrupted);
    }`, 'sync action clock on sender playback timeline');

  code = replaceOnce(code,
    '        a.character._netTrig?.(e[3], unpackTrig(e[4]));',
    `        const name = e[3], data = unpackTrig(e[4]);
        if (name === 'dodge') {
          if (!acceptRemoteDodgeClock(a, from, e[0], data, this._peer(from).tr)) break;
        } else if (name === 'spawn' && a.owner === from) {
          const life = data?.life, tp = data?.tp;
          const previousLife = Math.max(-1, ...[a.net.remoteDodgeLife, a.net.lastLife].filter(value => Number.isSafeInteger(value) && value >= 0));
          const previousTp = Math.max(-1, ...[a.net.remoteDodgeTp, a.net.buf?.at(-1)?.tp, a.net.tp, a.netTp]
            .filter(value => Number.isSafeInteger(value) && value >= 0));
          if (Number.isSafeInteger(life) && life >= 0 && Number.isSafeInteger(tp) && tp >= 0
            && (life > previousLife || life === previousLife && tp >= previousTp)) {
            a.net.remoteDodgeLife = life;
            a.net.remoteDodgeTp = tp;
          }
          clearRemoteDodgeClock(a);
        }
        else if (['movement_cancel', 'land', 'jump', 'special_leap'].includes(name)) interruptRemoteDodgeClock(a, from, e[0]);
        a.character._netTrig?.(name, data);`, 'accept or retire timestamped trigger');

  code = replaceOnce(code,
    '        const actor = this.byNid.get(e[3]?.actor?.n);',
    `        const actor = this.byNid.get(e[3]?.actor?.n);
        if (actor && actor.owner === from && e[2] === 'respawn') clearRemoteDodgeClock(actor);
        else if (actor && ['actor:jump', 'superjump', 'special:use'].includes(e[2])) interruptRemoteDodgeClock(actor, from, e[0]);`,
    'retire action on forwarded jump or special');

  code = replaceOnce(code,
    '    clearRemoteSquidroll(victim);',
    '    clearRemoteSquidroll(victim);\n    clearRemoteDodgeClock(victim);', 'death retires remote action epoch');
  code = replaceOnce(code,
    '  _remoteRespawn(a) {',
    '  _remoteRespawn(a) {\n    clearRemoteDodgeClock(a);', 'respawn retires remote action epoch');
  code = replaceOnce(code,
    '  dispose() {',
    '  dispose() {\n    for (const a of this.byNid.values()) clearRemoteDodgeClock(a, true);', 'dispose clears remote action epochs');
  code = replaceOnce(code,
    '      if (a.owner !== id) continue;',
    '      if (a.owner !== id) continue;\n      clearRemoteDodgeClock(a, true);', 'owner leave clears old action epoch');
  code = replaceOnce(code,
    '  _remove(a) {',
    '  _remove(a) {\n    clearRemoteDodgeClock(a, true);', 'actor removal clears remote action epoch');
  code = replaceOnce(code,
    '    a.remote = false;',
    '    a.remote = false;\n    clearRemoteDodgeClock(a, true);', 'adoption clears remote action epoch');

  return code;
}
