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
    '  return [a.nid, r2(a.pos.x), r2(y), r2(a.pos.z)',
    '  const c1088Row = [a.nid, r2(a.pos.x), r2(y), r2(a.pos.z)',
    'preserve the existing snapshot columns before optional presentation');
  code = once(code,
    'packAdoptionState(a)];',
    'packAdoptionState(a)];\n  const c1088Surge = packC1088SurgePresentation(a);\n  if (c1088Surge) c1088Row.push(c1088Surge);\n  return c1088Row;',
    'owner-only packed presentation sidecar');
  code = once(code,
    'adoption: s[23] };',
    'adoption: s[23], surgePresentation: s[24] ?? null, surgeSampleTime: ts };
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
    '    if (!a.alive) { a.respawnTimer -= dt; return; }',
    '    if (!a.alive) { clearRemoteC1088Surge(a); a.respawnTimer -= dt; return; }\n    applyRemoteC1088Surge(a, S.surgePresentation, S.surgeSampleTime, this._peer(a.owner).tr, S.surgeOwner, a.owner);',
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
