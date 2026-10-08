export function adaptRespawnLifecycle(rel, code, replaceOnce) {
  const replace = (before, after, name) => { code = replaceOnce(code, before, after, 'respawn lifecycle: ' + name); };
  if (rel === 'src/game/match.js') {
    // Test fixtures deliberately pass empty, duplicated, or already-composed Match
    // sources through the full adapter to verify another structural owner. Only
    // claim the single native Match module here; upstream-lock compatibility
    // remains the fail-closed guard for production source drift.
    const matchOwners = code.split('export class Match').length - 1;
    if (matchOwners === 1 && !code.includes('beginInitialSquidSpawn')) {
      const before = "      a.spawnAt(_v, a.team === 0 ? 0 : Math.PI);\n      a.invuln = 0;";
      const after = "      if (!beginInitialSquidSpawn(a)) { a.spawnAt(_v, a.team === 0 ? 0 : Math.PI); a.invuln = 0; }";
      const count = code.split(before).length - 1;
      if (count !== 2) throw Error(`INKWAVE respawn lifecycle: expected 2 initial placement sites, found ${count}`);
      code = "import { beginInitialSquidSpawn } from '../../patches/splatoon3/runtime/respawn-lifecycle.mjs';\n" + code;
      code = code.split(before).join(after);
    }
  }
  if (rel === 'src/main.js') {
    replace("this.hud?.showSplatted({ by, byColor: attacker ? G.teamHex[attacker.team] : '#6fd0ff', respawn: PLAYER.respawnTime });",
      "this.hud?.showSplatted({ by, byColor: attacker ? G.teamHex[attacker.team] : '#6fd0ff', respawn: PLAYER.respawnTime, actor: victim });", 'authoritative HUD owner');
  }
  if (rel === 'src/ui/hud.js') {
    code = "import { sampleRespawnCountdown } from '../../patches/splatoon3/runtime/respawn-lifecycle.mjs';\n" + code;
    replace("  showSplatted({ by = null, byColor = '#2f5bff', respawn = 5 } = {}) {", "  showSplatted({ by = null, byColor = '#2f5bff', respawn = 5, actor = null } = {}) {", 'actor-scoped countdown');
    replace('    const st = { el, tint, end: this._fxTime + Math.max(0, respawn), num, last: Math.ceil(respawn) };',
      "    const st = { el, tint, end: this._fxTime + Math.max(0, respawn), num, last: Math.ceil(respawn), actor, total: 0, circumference: C, ring: ring.querySelector('.fg') };", 'actor-scoped ring');
    replace('      st.t = st.end - this._fxTime;', '      st.t = sampleRespawnCountdown(st, this._fxTime);', 'sample final actor timer each rendered FX frame');
  }
  if (rel === 'src/net/netmatch.js') {
    if (code.includes('SPAWN_ARMOR_FLAG')) throw Error('INKWAVE respawn lifecycle patch conflict: network already connected');
    code = "import { SPAWN_ARMOR_FLAG, spawnProtectionRemaining } from '../../patches/splatoon3/runtime/respawn-lifecycle.mjs';\n" + code;
    replace('  if (a.invuln > 0) f |= F.invuln;', '  if (a.invuln > 0) f |= F.invuln;\n  if (a.s3?.spawnArmorManaged && spawnProtectionRemaining(a) > 0) f |= SPAWN_ARMOR_FLAG;', 'spawn armor visual snapshot');
    replace('    a.invuln = f & F.invuln ? 0.1 : 0;', '    a.invuln = f & F.invuln ? 0.1 : 0;\n    a.s3 ||= {}; a.s3.spawnArmorManaged = !!(f & SPAWN_ARMOR_FLAG); a.s3.spawnArmorRemote = !!(f & SPAWN_ARMOR_FLAG);', 'separate proxy armor from binary invulnerability');
  }
  return code;
}
