export function adaptRollerContact(rel, code, once) {
  const patch = (before, after, label) => {
    code = once(code, before, after, rel + ': Roller contact ' + label);
  };
  if (rel === 'src/game/actor.js') {
    code = "import { clearRemoteRollerSuspension } from '../../patches/network-replication/roller-contact.mjs';\n" + code;
    patch('  setWeapon(id) {',
      '  setWeapon(id) {\n    clearRemoteRollerSuspension(this, true);', 'weapon-switch invalidation');
  }
  if (rel !== 'src/net/netmatch.js') return code;
  code = "import { packRollerSuspensionFlag, clearRemoteRollerSuspension, applyRemoteRollerSuspension, remoteRollerContactAudible } from '../../patches/network-replication/roller-contact.mjs';\n" + code;
  patch('  if (wr.rolling) f |= F.rolling;',
    '  if (wr.rolling) f |= F.rolling;\n  f |= packRollerSuspensionFlag(a);', 'optional owner presentation bit');
  patch('      snap.surgeOwner = from;',
    '      snap.surgeOwner = from;\n      snap.rollerContactOwner = from;\n      snap.rollerContactEpoch = a.net.rollerContactEpoch ?? null;', 'accepted owner and weapon epoch');
  patch('  applyRemote(a, dt) {',
    '  applyRemote(a, dt) {\n    clearRemoteRollerSuspension(a);', 'clear before every early return');
  patch('    wr.rolling = !!(f & F.rolling); wr.streaming = !!(f & F.streaming); wr.burstFrac = f & F.streaming ? S.ch : 0;',
    '    wr.rolling = !!(f & F.rolling); wr.streaming = !!(f & F.streaming); wr.burstFrac = f & F.streaming ? S.ch : 0;\n    applyRemoteRollerSuspension(a, S, F);', 'sampled presentation without changing held or grounded');
  patch("h = this._voiceLoop(a, near, 'roll', wr.rolling && a.grounded, 'roll');",
    "h = this._voiceLoop(a, near, 'roll', wr.rolling && a.grounded && remoteRollerContactAudible(a, F), 'roll');", 'sampled remote loop contact gate');
  for (const [method, actor] of [['_remoteSplat(victim, attacker, cause)', 'victim'],
    ['_remoteRespawn(a)', 'a'], ['_remove(a)', 'a'], ['_adopt(a)', 'a']]) {
    patch('  ' + method + ' {',
      '  ' + method + ' {\n    clearRemoteRollerSuspension(' + actor + ');', method + ' clear');
  }
  patch('      if (a.owner !== id) continue;',
    '      if (a.owner !== id) continue;\n      clearRemoteRollerSuspension(a);', 'owner handoff clear');
  patch('  dispose() {',
    '  dispose() {\n    for (const actor of this.byNid.values()) clearRemoteRollerSuspension(actor);', 'dispose clear');
  return code;
}
