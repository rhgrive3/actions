// Final production-only INKWAVE Issue Queue guards.
// This pass runs after the existing camera, network, result and reliability
// overlays; no upstream exact-matching adapters are invalidated.
function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0)
    throw new Error('INKWAVE queue patch conflict (' + label + '): expected one anchor');
  return code.slice(0, at) + after + code.slice(at + before.length);
}
function requireOwner(code, anchor, count, label) {
  const found = code.split(anchor).length - 1;
  if (found !== count)
    throw new Error('INKWAVE queue patch conflict (' + label + '): expected ' + count + ', found ' + found);
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
    // The network owner also checks registered weapons, modes and host-owned
    // bots before START/READY. Do not import a second, weaker same-name guard.
    requireOwner(code, 'if (!validStartRoster(cfg?.roster, this.myId, WEAPONS, cfg?.mode, this.hostId))', 1, 'session roster owner');
    return code;
  }
  if (rel === 'src/net/netmatch.js') {
    // Earlier network overlays replace the raw _play switch with this owner.
    // Harden its order admission without sacrificing deadline-paint ownership.
    const begin = code.indexOf('  _applyRemoteSplatEvent(e, commitReplay = true) {');
    const end = code.indexOf('\n  commitDeadlinePaint()', begin);
    if (begin < 0 || end < 0) throw new Error('INKWAVE queue patch conflict: deadline paint owner missing');
    let method = code.slice(begin, end);
    // readPaintOrder owns membership/team, Float32, source-kind/capability,
    // epoch and replay admission. A second legacy-kind list drops real ink.
    requireOwner(method, '    const order = readPaintOrder(this, e._netPeer, e);', 1, 'remote paint admission owner');
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
  // All of these guards were composed by queue-recovery before this final
  // pass. Verify their ownership instead of replaying raw-upstream patches.
  for (const [anchor, count, label] of [
    ["this.profile = normalizeQueueProfile(loadJSON('inkwave.profile', DEFAULT_PROFILE), WEAPONS);", 1, 'persisted profile owner'],
    ['getLoadout: () => ({ weapon: safeWeaponId(self.profile.weapon, WEAPONS) })', 1, 'loadout getter owner'],
    ['if (!validWeaponId(weapon, WEAPONS)) return;', 1, 'loadout admission owner'],
    ['weapon: safeWeaponId(this.profile.weapon, WEAPONS),', 1, 'offline loadout owner'],
    ['if (!validStartRoster(cfg?.roster, G.net?.myId, WEAPONS, cfg?.mode, G.net?.hostId))', 1, 'online roster owner'],
    ['if (!a?.weapon || !a.weaponRunner) return;', 1, 'HUD local actor owner'],
    ['normalizeQueueProfile(p, WEAPONS);', 2, 'result profile owner'],
    ['settleProgression(p, PROGRESSION);', 2, 'bounded progression owner'],
    ['const privateBattle = !!G.netm;', 1, 'private battle XP owner'],
  ]) requireOwner(code, anchor, count, label);
  code = "import { sanitizeSettings, sanitizeSettingsChange } from './core/save-validation.mjs';\n" + code;
  code = once(code, 'DEFAULT_SETTINGS, effectiveQuality,',
    'DEFAULT_SETTINGS, QUALITY, effectiveQuality,', 'quality import');
  code = once(code,
    "normalizeViewSettings(loadJSON('inkwave.settings', initialGyroDefaults(DEFAULT_SETTINGS, this.mobile)), DEFAULT_SETTINGS)",
    "normalizeViewSettings(sanitizeSettings(loadJSON('inkwave.settings', initialGyroDefaults(DEFAULT_SETTINGS, this.mobile)), DEFAULT_SETTINGS, QUALITY), DEFAULT_SETTINGS)",
    'finite settings before aim migration');
  code = once(code, '    partial = normalizeViewSettings({ ...partial }, this.settings);',
    '    partial = normalizeViewSettings(sanitizeSettingsChange(partial, this.settings, QUALITY), this.settings);',
    'finite partial before aim owner');
  return code;
}
