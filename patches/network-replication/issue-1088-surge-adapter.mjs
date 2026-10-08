function once(code, before, after, label) {
  const first = code.indexOf(before);
  if (first < 0 || code.indexOf(before, first + before.length) >= 0) {
    throw new Error('C1088 Squid Surge presentation anchor mismatch: ' + label);
  }
  return code.slice(0, first) + after + code.slice(first + before.length);
}

export function adaptIssue1088SurgePresentation(code) {
  code = "import { packC1088SurgePresentation, applyRemoteC1088Surge, clearRemoteC1088Surge, resetC1088SurgePresentation } from '../../patches/network-replication/issue-1088-surge-presentation.mjs';\n" + code;
  code = once(code,
    'n ? r2(n.z) : 0, r2(wr.lockT || 0), a.stats.specials || 0];',
    'n ? r2(n.z) : 0, r2(wr.lockT || 0), a.stats.specials || 0, packC1088SurgePresentation(a)];',
    'owner-only packed presentation sidecar');
  code = once(code,
    'function unpackActor(s, ts) {\n  return { t: ts, x: s[1], y: s[2], z: s[3], vx: s[4], vy: s[5], vz: s[6], yaw: s[7], aimYaw: s[8], aimPitch: s[9], f: s[10], hp: s[11], ink: s[12], sp: s[13], ch: s[14], turf: s[15], tp: s[16], wx: s[17], wy: s[18], wz: s[19], lock: s[20] };\n}',
    'function unpackActor(s, ts) {\n  return { t: ts, x: s[1], y: s[2], z: s[3], vx: s[4], vy: s[5], vz: s[6], yaw: s[7], aimYaw: s[8], aimPitch: s[9], f: s[10], hp: s[11], ink: s[12], sp: s[13], ch: s[14], turf: s[15], tp: s[16], wx: s[17], wy: s[18], wz: s[19], lock: s[20], surgePresentation: s[22] ?? null, surgeSampleTime: ts };\n}',
    'optional tagged sidecar sample reconstruction');
  code = once(code,
    '      const snap = unpackActor(s, d.ts);',
    '      const snap = unpackActor(s, d.ts);\n      snap.surgeOwner = from;',
    'authorized sender identity on buffered sample');
  code = once(code,
    'if (!n.ready) { a.character.root.visible = false; return; }',
    'if (!n.ready) { resetC1088SurgePresentation(a); a.character.root.visible = false; return; }',
    'unready and reconnect presentation cleanup');
  code = once(code,
    '    const S = n.cur;\n    if (!a.alive) { a.respawnTimer -= dt; return; }',
    '    const S = n.cur;\n    if (!a.alive) { clearRemoteC1088Surge(a); a.respawnTimer -= dt; return; }\n    applyRemoteC1088Surge(a, S.surgePresentation, S.surgeSampleTime, this._peer(a.owner).tr, S.surgeOwner, a.owner);',
    'owner-authorized life/epoch/phase application on the playback timeline');
  code = once(code,
    '  _remoteSplat(victim, attacker, cause) {',
    '  _remoteSplat(victim, attacker, cause) {\n    clearRemoteC1088Surge(victim);',
    'remote death pose cleanup');
  code = once(code,
    '  _remoteRespawn(a) {',
    '  _remoteRespawn(a) {\n    clearRemoteC1088Surge(a);',
    'remote respawn pose cleanup');
  code = once(code,
    '      a.owner = this.s.hostId;',
    '      clearRemoteC1088Surge(a);\n      a.owner = this.s.hostId;',
    'remote ownership change cleanup');
  code = once(code,
    '  _adopt(a) {',
    '  _adopt(a) {\n    resetC1088SurgePresentation(a);',
    'owner adoption epoch reset');
  return code;
}
