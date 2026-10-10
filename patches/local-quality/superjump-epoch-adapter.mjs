// #1110: finite owner-authored Super Jump action epochs for remote pose replay.
// Runs last, after gameplay, network replication and quality source overlays.
// Source-locked substitutions reject unexpected composition changes.
function once(code, before, after, label) {
  const start = code.indexOf(before);
  if (start < 0 || code.indexOf(before, start + before.length) >= 0)
    throw Error('Super Jump epoch source drift: ' + label);
  return code.slice(0, start) + after + code.slice(start + before.length);
}

export function adaptSuperJumpEpoch(rel, code) {
  if (rel === 'src/game/actor.js') {
    const created = "    this.superJumpState = { wallSupport: this.climbing ? this.wallN.clone() : null, phase: 'charge', startForm: this.form, t: 0, target, from: new THREE.Vector3(), to: destination, marker: 0 };";
    code = once(code, created, `    // Only successful Super Jump admission advances the owner's action identity.
    this._s3SuperJumpEpoch = Number.isSafeInteger(this._s3SuperJumpEpoch) && this._s3SuperJumpEpoch >= 0 &&
      this._s3SuperJumpEpoch < Number.MAX_SAFE_INTEGER ? this._s3SuperJumpEpoch + 1 : 1;
    this.superJumpState = { wallSupport: this.climbing ? this.wallN.clone() : null, phase: 'charge', startForm: this.form, t: 0, target, from: new THREE.Vector3(), to: destination, marker: 0, sjEpoch: this._s3SuperJumpEpoch };`,
      'owner action epoch');
    return code;
  }
  if (rel !== 'src/net/netmatch.js') return code;
  code = "import { applyRemoteSuperJumpEpoch, endRemoteSuperJumpEpoch } from '../../patches/network-replication/superjump-epoch.mjs';\n" + code;
  code = once(code,
    '    this.stats.out++;\n    this.s.tr?.broadcast(msg);',
    `    msg.sjEpochs = Object.create(null);
    for (const actor of this.byNid.values()) if (!actor.remote && Number.isSafeInteger(actor.nid)) {
      const epoch = actor._s3SuperJumpEpoch;
      msg.sjEpochs[actor.nid] = Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0;
    }
    this.stats.out++;
    this.s.tr?.broadcast(msg);`, 'owner epoch sidecar');
  code = once(code,
    '      const snap = unpackActor(s, d.ts);',
    `      const snap = unpackActor(s, d.ts);
      const sjEpoch = d.sjEpochs && typeof d.sjEpochs === 'object' && !Array.isArray(d.sjEpochs)
        ? d.sjEpochs[s[0]] : null;
      snap.sjEpoch = Number.isSafeInteger(sjEpoch) && sjEpoch >= 0 ? sjEpoch : null;`,
    'validated owner action snapshot');
  code = once(code,
    '  const sameJumpPhase = (a.f & (F.sjCharge | F.sjFlight)) === (b.f & (F.sjCharge | F.sjFlight));\n  o.sjT = sameJumpPhase ? Math.max(0, a.sjT + (b.sjT - a.sjT) * u) : Math.max(0, a.sjT);',
    `  const sameJumpPhase = (a.f & (F.sjCharge | F.sjFlight)) === (b.f & (F.sjCharge | F.sjFlight));
  const sameJumpEpoch = sameJumpPhase && a.sjEpoch === b.sjEpoch;
  o.sjT = sameJumpEpoch ? Math.max(0, a.sjT + (b.sjT - a.sjT) * u) : Math.max(0, a.sjT);`,
    'no cross-action interpolation');
  code = once(code,
    `    const jumpPhase = f & F.sjFlight ? 'flight' : 'charge';
    if (f & (F.sjCharge | F.sjFlight)) {
      const age = Number.isFinite(S.sjT) ? Math.max(0, S.sjT) : 0;
      if (!a.superJumpState || !a.superJumpState.net || a.superJumpState.phase !== jumpPhase)
        a.superJumpState = { phase: jumpPhase, net: true, t: age };
      else a.superJumpState.t = Math.max(Number.isFinite(a.superJumpState.t) ? a.superJumpState.t : 0, age);
    } else a.superJumpState = null;`,
    `    const jumpPhase = f & (F.sjCharge | F.sjFlight) ? (f & F.sjFlight ? 'flight' : 'charge') : null;`,
    'owner timeline phase');
  code = once(code,
    '    applyAdoptionSample(this, a, S);',
    '    applyAdoptionSample(this, a, S);\n    applyRemoteSuperJumpEpoch(a, S, jumpPhase);',
    'reconcile after adoption');
  code = once(code,
    '    victim.specialActive = null; victim.superJumpState = null;',
    '    victim.specialActive = null; endRemoteSuperJumpEpoch(victim);',
    'death retires old action');
  code = once(code,
    '  _remoteRespawn(a) {',
    '  _remoteRespawn(a) {\n    endRemoteSuperJumpEpoch(a);',
    'respawn retires old action');
  return code;
}
