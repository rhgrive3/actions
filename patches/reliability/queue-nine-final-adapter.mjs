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
    // The earlier network-replication queue owner already validates the
    // recipient's unique human, team/slot/nid, mode, and registered weapon.
    // Do not insert a second validStartRoster import or START transition:
    // the two libraries have different signatures, and duplicate ESM names
    // make every session fail before the lobby can start.
    if (!code.includes("import { validStartRoster } from '../../patches/network-replication/queue-recovery.mjs';") ||
        !code.includes('if (!validStartRoster(cfg?.roster, this.myId, WEAPONS, cfg?.mode, this.hostId))'))
      throw new Error('INKWAVE queue patch conflict (composed START guard missing)');
    return code;
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
      "      ['shot', 'line', 'blast', 'bomb', 'trail', 'drop', 'roll', 'rollFloor', 'speck',\n" +
      "       'source-shot','source-splash','ink-shot','ink-slosh','ink-brush','ink-flick',\n" +
      "       'ink-contact','ink-charger-a','ink-charger-b','ink-charger-c',\n" +
      "       'ink-blast','ink-blast-rectified'].includes(kind)))) return false;\n" +
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
  // The earlier network layer already installs safeWeaponId, the full START
  // roster admission, and constant-time settleProgression. Keep those owners.
  // This late source pass adds only complementary settings/profile sanitizers
  // and HUD protection, without duplicate bindings or progression mutations.
  code = "import { sanitizeSettings, sanitizeProfile } from './core/save-validation.mjs';\n" + code;
  code = once(code, 'DEFAULT_SETTINGS, effectiveQuality,',
    'DEFAULT_SETTINGS, QUALITY, effectiveQuality,', 'quality import');
  const settingsAssign = /^    this\\.settings = G\\.settings = [^\\n]+;$/gm;
  const settingsMatches = [...code.matchAll(settingsAssign)];
  if (settingsMatches.length !== 1) throw new Error('INKWAVE queue patch conflict: settings assignment not unique');
  code = code.replace(settingsAssign, value =>
    value + '\n    this.settings = G.settings = sanitizeSettings(this.settings, DEFAULT_SETTINGS, QUALITY);');
  const profileAssign = /^    this\\.profile = [^\\n]+;$/gm;
  const profileMatches = [...code.matchAll(profileAssign)];
  if (profileMatches.length !== 1) throw new Error('INKWAVE queue patch conflict: profile boot assignment not unique (' + profileMatches.length + ')');
  code = code.replace(profileAssign, line =>
    line + '\n    this.profile = sanitizeProfile(this.profile, DEFAULT_PROFILE, WEAPONS);');
  code = once(code, '    applyAimSettingsChange(this.settings, partial);',
    '    applyAimSettingsChange(this.settings, partial);\n' +
    '    Object.assign(this.settings, sanitizeSettings(this.settings, DEFAULT_SETTINGS, QUALITY));',
    'live settings admission');
  // Earlier network-replication/queue-recovery supplies these checks and
  // is deliberately prior in the composer order. Assert rather than patch
  // the same statements for a second time.
  for(const [text,label] of [
    ["getLoadout: () => ({ weapon: safeWeaponId(self.profile.weapon, WEAPONS) })",'loadout getter'],
    ["if (!validWeaponId(weapon, WEAPONS)) return;",'loadout validation'],
    ["mode: opts.mode, weapon: safeWeaponId(this.profile.weapon, WEAPONS)",'offline loadout'],
    ["if (!validStartRoster(cfg?.roster, G.net?.myId, WEAPONS, cfg?.mode, G.net?.hostId))",'main START guard']
  ]) if(!code.includes(text))throw new Error('INKWAVE queue patch conflict (composed '+label+' missing)');
  if(code.split('settleProgression(p, PROGRESSION);').length!==3)
    throw new Error('INKWAVE queue patch conflict (two bounded result progressions missing)');
  code = once(code, '  _updateHud(dt) {',
    '  _updateHud(dt) {\n    if (!this.match?.local) return;', 'orphan HUD guard');
  return code;
}
