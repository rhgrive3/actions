// Five queued critical reports on current INKWAVE, composed after the
// existing source / quality / network transforms. Anchor drift fails closed.
export function adaptQueuedBugRecovery(rel, input, once) {
  let code = input;
  const patch = (before, after, label) => { code = once(code, before, after, rel + ': queued ' + label); };
  if (rel === 'src/main.js') {
    code = "import { normalizeQueueProfile, safeWeaponId, validWeaponId, settleProgression, validStartRoster } from '../patches/network-replication/queue-recovery.mjs';\n" + code;
    patch("    this.profile = loadJSON('inkwave.profile', DEFAULT_PROFILE);",
      "    this.profile = normalizeQueueProfile(loadJSON('inkwave.profile', DEFAULT_PROFILE), WEAPONS);\n    saveJSON('inkwave.profile', this.profile);",
      'normalize and persist saved profile at boot');
    patch("getLoadout: () => ({ weapon: self.profile.weapon || 'shooter' })",
      "getLoadout: () => ({ weapon: safeWeaponId(self.profile.weapon, WEAPONS) })",
      'loadout agrees with runtime');
    patch("        if (!WEAPONS[weapon]) return;",
      "        if (!validWeaponId(weapon, WEAPONS)) return;",
      'loadout cannot accept inherited keys');

    // The existing reliability start/attract adapters already reserve an
    // operation identity before their first await and guard stale menu fades.
    // Preserve those verified guards rather than creating a competing epoch.
    patch("mode: opts.mode, weapon: this.profile.weapon || 'shooter',",
      "mode: opts.mode, weapon: safeWeaponId(this.profile.weapon, WEAPONS),",
      'offline match uses validated weapon even after mutable profile edit');
    patch("  async startNetMatch(cfg, nm) {",
      "  async startNetMatch(cfg, nm) {\\n    if (!validStartRoster(cfg?.roster, G.net?.myId, WEAPONS, cfg?.mode, G.net?.hostId)) throw new Error('Invalid online match roster');",
      'validate direct online START before allocating a match');

    patch("    const m = this.match, a = m.local, cam = G.camera;",
      "    const m = this.match, a = m?.local, cam = G.camera;\n    if (!a?.weapon || !a.weaponRunner) return;",
      'null-local or unsupported HUD must not throw');
    patch("    const m = this.match, R = m.result, bo = R.boss || {};",
      "    const m = this.match;\n    if (!m?.local?.stats) { if (G.netm) await this.netMatchEnd(); return; }\n    const R = m.result, bo = R.boss || {};",
      'Boss results cannot use missing local actor');
    patch("  async _judge() {\n    const m = this.match;\n    const judgeEpoch =",
      "  async _judge() {\n    const m = this.match;\n    if (!m?.local?.stats) { if (G.netm) await this.netMatchEnd(); return; }\n    const judgeEpoch =",
      'Turf results cannot use missing local actor');

    patch("    const local = m.local, p = this.profile;",
      "    const local = m.local, p = this.profile;\n    normalizeQueueProfile(p, WEAPONS);",
      'sanitize profile before Boss XP ledger');
    patch("    const p = this.profile;\n    const turf = Math.round(local.stats.turf);",
      "    const p = this.profile;\n    normalizeQueueProfile(p, WEAPONS);\n    const turf = Math.round(local.stats.turf);",
      'sanitize profile before Turf XP ledger');
    const oldLoop = "while (p.xp >= PROGRESSION.xpForLevel(p.level)) { p.xp -= PROGRESSION.xpForLevel(p.level); p.level++; }";
    const count = code.split(oldLoop).length - 1;
    if (count !== 2) throw new Error('Queued progression guard requires exactly two native result loops; found ' + count);
    code = code.split(oldLoop).join("settleProgression(p, PROGRESSION);");
  }
  if (rel === 'src/net/session.js') {
    code = "import { validStartRoster } from '../../patches/network-replication/queue-recovery.mjs';\n" + code;
    patch("  async _begin(cfg) {\n    this._startCfg = cfg;",
      "  async _begin(cfg) {\n    if (!validStartRoster(cfg?.roster, this.myId, WEAPONS, cfg?.mode, this.hostId)) {\n      this._emit('error', { message: 'Invalid match roster: own player missing or roster malformed' });\n      return false;\n    }\n    this._startCfg = cfg;",
      'reject missing local roster before starting state/READY');
  }
  if (rel === 'src/game/match.js') {
    code = "import { WEAPONS as queueWEAPONS } from '../config.js';\nimport { safeWeaponId } from '../../patches/network-replication/queue-recovery.mjs';\n" + code;
    patch("      if (first) { out.push(first); if (!independent) pool.splice(pool.indexOf(first), 1); }",
      "      if (first) {\n        const weapon = safeWeaponId(first, queueWEAPONS);\n        out.push(weapon);\n        if (!independent) {\n          const index = pool.indexOf(weapon);\n          if (index >= 0) pool.splice(index, 1);\n        }\n      }",
      'unknown weapon cannot enter pickTeam or splice last pool member');
  }
  return code;
}
