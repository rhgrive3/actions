// Final production-only INKWAVE Issue Queue guards.
// This pass runs after the existing camera, network, result and reliability
// overlays; no upstream exact-matching adapters are invalidated.
function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0)
    throw new Error('INKWAVE queue patch conflict (' + label + '): expected one anchor');
  return code.slice(0, at) + after + code.slice(at + before.length);
}
function all(code, before, after, count, label) {
  const parts = code.split(before);
  if (parts.length !== count + 1)
    throw new Error('INKWAVE queue patch conflict (' + label + '): expected ' + count + ', found ' + (parts.length - 1));
  return parts.join(after);
}
export function adaptQueueNine(rel, input) {
  let code = input;
  if (rel === 'src/config.js') {
    return once(code, "const name = QUALITY[settings?.quality] ? settings.quality : 'high';",
      "const name = typeof settings?.quality === 'string' && Object.hasOwn(QUALITY, settings.quality) ? settings.quality : 'high';",
      'quality preset own keys');
  }
  if (rel === 'src/world/paint.js') {
    return once(code,
      'if (opts.kind !== undefined) { const k = K[opts.kind]; if (k !== undefined && (k !== K_ROLL || st)) return k; }',
      "if (typeof opts.kind === 'string' && Object.hasOwn(K, opts.kind)) { const k = K[opts.kind]; if (k !== K_ROLL || st) return k; }",
      'paint kind own-key lookup');
  }
  if (rel === 'src/net/session.js') {
    code = "import { validStartRoster } from '../core/save-validation.mjs';\n" + code;
    return once(code, '  async _begin(cfg) {',
      '  async _begin(cfg) {\n' +
      '    // Do not enter START, send READY or build HUD without a local human.\n' +
      '    if (!validStartRoster(cfg?.roster, this.myId, cfg?.mode)) {\n' +
      "      this.error = 'Invalid match roster: recipient-owned player missing or duplicated';\n" +
      "      this._emit('error', { message: this.error });\n" +
      '      return;\n' +
      '    }', 'START roster admission');
  }
  if (rel === 'src/net/netmatch.js') {
    // Earlier network overlays replace the raw _play switch with this owner.
    // Harden its order admission without sacrificing deadline-paint ownership.
    const begin = code.indexOf('  _applyRemoteSplatEvent(e, commitReplay = true) {');
    const end = code.indexOf('\n  commitDeadlinePaint()', begin);
    if (begin < 0 || end < 0) throw new Error('INKWAVE queue patch conflict: deadline paint owner missing');
    let method = code.slice(begin, end);
    method = once(method,
      '    const order = readPaintOrder(this, e._netPeer, e);',
      '    // Validate before touching sequencing or replay suppression.\n' +
      '    const kind = e[8];\n' +
      "    if (!(kind === 0 || kind == null || (typeof kind === 'string' &&\n" +
      "      ['shot', 'line', 'blast', 'bomb', 'trail', 'drop', 'roll', 'speck'].includes(kind)))) return false;\n" +
      '    if (![2, 3, 4, 5, 7, 9, 10, 11, 12].every(i => Number.isFinite(e[i] ?? 0)) ||\n' +
      '      !(e[5] > 0 && e[5] <= 64) || (e[6] !== 0 && e[6] !== 1)) return false;\n' +
      '    const order = readPaintOrder(this, e._netPeer, e);', 'remote splat validation');
    method = once(method, '    this.applying = true;',
      '    const wasApplying = this.applying;\n    this.applying = true;', 'replay capture');
    method = once(method,
      '    } finally { this.applying = false; }',
      '    } catch (error) {\n' +
      '      if (!this._paintReplayWarned) {\n' +
      "        console.warn('[net] malformed remote splat discarded', error);\n" +
      '        this._paintReplayWarned = true;\n' +
      '      }\n' +
      '      return false;\n' +
      '    } finally { this.applying = wasApplying; }', 'replay restoration');
    return code.slice(0, begin) + method + code.slice(end);
  }
  if (rel !== 'src/main.js') return code;
  code = "import { sanitizeSettings, sanitizeProfile, awardProfileXP, validWeaponId, validStartRoster } from './core/save-validation.mjs';\n" + code;
  code = once(code, 'DEFAULT_SETTINGS, effectiveQuality,',
    'DEFAULT_SETTINGS, QUALITY, effectiveQuality,', 'quality import');
  const settingsAssign = /^    this\.settings = G\.settings = [^\n]+;$/gm;
  const matches = [...code.matchAll(settingsAssign)];
  if (matches.length !== 1) throw new Error('INKWAVE queue patch conflict: settings assignment not unique');
  code = code.replace(settingsAssign, value =>
    value + '\n    this.settings = G.settings = sanitizeSettings(this.settings, DEFAULT_SETTINGS, QUALITY);');
  // Existing gear/profile migration overlays may wrap the source load expression.
  // Sanitize the *already migrated* profile, instead of assuming its old literal.
  const profileAssignments = [...code.matchAll(/^    this\.profile = [^\n]+;$/gm)];
  if (profileAssignments.length !== 1) throw new Error('INKWAVE queue patch conflict: profile boot assignment not unique (' + profileAssignments.length + ')');
  code = code.replace(/^    this\.profile = [^\n]+;$/gm, line =>
    line + '\n    this.profile = sanitizeProfile(this.profile, DEFAULT_PROFILE, WEAPONS);');
  // Preserve the camera overlay's normalized partial update and side effects.
  // Validate the final settings before the existing persistence step.
  code = once(code, '    applyAimSettingsChange(this.settings, partial);',
    '    applyAimSettingsChange(this.settings, partial);\n' +
    '    Object.assign(this.settings, sanitizeSettings(this.settings, DEFAULT_SETTINGS, QUALITY));',
    'live settings admission');
  code = once(code, '  async startNetMatch(cfg, nm) {',
    '  async startNetMatch(cfg, nm) {\n' +
    "    if (!validStartRoster(cfg?.roster, G.net?.myId, cfg?.mode)) throw new Error('Invalid local START roster');",
    'secondary net START guard');
  code = once(code,
    "getLoadout: () => ({ weapon: self.profile.weapon || 'shooter' }),",
    "getLoadout: () => ({ weapon: validWeaponId(WEAPONS, self.profile.weapon) ? self.profile.weapon : 'shooter' }),",
    'loadout getter');
  code = once(code, '        if (!WEAPONS[weapon]) return;',
    '        if (!validWeaponId(WEAPONS, weapon)) return;', 'loadout validation');
  code = once(code, "weapon: this.profile.weapon || 'shooter',",
    "weapon: validWeaponId(WEAPONS, this.profile.weapon) ? this.profile.weapon : 'shooter',",
    'offline weapon');
  // The composed scoring and private-battle guard remain authoritative.
  code = all(code, 'p.xp += gained;', 'awardProfileXP(p, gained, PROGRESSION.xpForLevel);',
    2, 'bounded result XP');
  code = all(code,
    'while (p.xp >= PROGRESSION.xpForLevel(p.level)) { p.xp -= PROGRESSION.xpForLevel(p.level); p.level++; }',
    '/* Bounded XP calculation already advanced the level. */',
    2, 'remove non-terminating loops');
  code = once(code, '  _updateHud(dt) {',
    '  _updateHud(dt) {\n    if (!this.match?.local) return;', 'orphan HUD guard');
  return code;
}
