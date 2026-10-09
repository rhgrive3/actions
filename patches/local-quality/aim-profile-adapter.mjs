// Build-only quality adapter for Splatoon 3 independent TV/Tabletop vs Handheld
// aim-control profiles (#503).
// Upstream inkwave-public/ remains byte-for-byte intact.

function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE quality patch conflict (aim profile: ${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

function replaceVariantOnce(code, variants, label) {
  const found = variants.filter(({ before }) => {
    const at = code.indexOf(before);
    return at >= 0 && code.indexOf(before, at + before.length) < 0;
  });
  if (found.length !== 1) {
    throw new Error(`INKWAVE quality patch conflict (aim profile: ${label}): expected exactly one composed connection`);
  }
  return replaceOnce(code, found[0].before, found[0].after, label);
}

export function adaptAimProfiles(rel, code) {
  if (rel === 'src/config.js') {
    // Reliability may already own an independent padInvertX default between
    // padSensitivity and invertY. Compose with either source shape without
    // deleting or duplicating that setting.
    const reliability = "  padSensitivity: 1.0,\n  padInvertX: false,\n  invertY: false,";
    const native = "  padSensitivity: 1.0,\n  invertY: false,";
    const before = code.includes(reliability) ? reliability : native;
    code = replaceOnce(
      code,
      before,
      before + "\n  invertX: false,\n  aimProfile: 'tv',\n  aimProfiles: null,",
      'config aim profiles default'
    );
    return code;
  }

  if (rel === 'src/main.js') {
    // Import helper functions
    code = "import { migrateAimProfiles, applyAimSettingsChange } from '../patches/local-quality/aim-profile.mjs';\n" + code;

    // Migrate on load
    code = replaceOnce(
      code,
      "this.settings = G.settings = loadJSON('inkwave.settings', DEFAULT_SETTINGS);",
      "this.settings = G.settings = migrateAimProfiles(loadJSON('inkwave.settings', DEFAULT_SETTINGS), DEFAULT_SETTINGS);\n    saveJSON('inkwave.settings', this.settings);",
      'main settings load migration'
    );

    // Apply aim settings in _setSettings and handle profile-induced gyro transitions
    const setSettingsHeadAnchor = "  _setSettings(partial) {\n" +
      "    Object.assign(this.settings, partial);\n" +
      "    saveJSON('inkwave.settings', this.settings);\n" +
      "    const mob = this.input?.mobile;\n" +
      "    if (mob) {\n" +
      "      mob.applySettings(this.settings);\n" +
      "      if ('gyro' in partial) {\n" +
      "        // turning gyro on from the settings toggle: that tap is the user gesture iOS needs for the permission prompt\n" +
      "        if (partial.gyro) {";

    const setSettingsHeadTarget = "  _setSettings(partial) {\n" +
      "    const prevProfile = this.settings?.aimProfile;\n" +
      "    applyAimSettingsChange(this.settings, partial);\n" +
      "    saveJSON('inkwave.settings', this.settings);\n" +
      "    const profileChanged = prevProfile !== this.settings.aimProfile;\n" +
      "    if (profileChanged) this._aimProfileEpoch = (this._aimProfileEpoch || 0) + 1;\n" +
      "    const profileEpoch = this._aimProfileEpoch || 0;\n" +
      "    const mob = this.input?.mobile;\n" +
      "    if (mob) {\n" +
      "      mob.applySettings(this.settings);\n" +
      "      const gyroTransition = ('gyro' in partial) || profileChanged;\n" +
      "      if (gyroTransition) {\n" +
      "        const turnOn = 'gyro' in partial ? !!partial.gyro : !!this.settings.gyro;\n" +
      "        if (turnOn) {";

    code = replaceOnce(code, setSettingsHeadAnchor, setSettingsHeadTarget, 'main _setSettings aim transition');

    // Scoped profile epoch guards deferred permission resolution
    if (code.includes('intent !== mob._gyroIntent')) {
      const gyroAdapterAskResolveAnchor = "            if (this.input?.mobile !== mob || mob._destroyed || intent !== mob._gyroIntent || !this.settings.gyro) return;\n" +
        "            if (!ok) {\n" +
        "              this.settings.gyro = false; saveJSON('inkwave.settings', this.settings);";
      const gyroAdapterAskResolveTarget = "            if (this.input?.mobile !== mob || mob._destroyed || intent !== mob._gyroIntent || profileEpoch !== (this._aimProfileEpoch || 0) || !this.settings.gyro) return;\n" +
        "            if (!ok) {\n" +
        "              applyAimSettingsChange(this.settings, { gyro: false }); saveJSON('inkwave.settings', this.settings);";
      code = replaceOnce(code, gyroAdapterAskResolveAnchor, gyroAdapterAskResolveTarget, 'main gyroAdapter ask resolve');
    } else {
      const rawAskResolveAnchor = "          const ask = mob.gyro.needsPermission ? mob.gyro.request() : Promise.resolve(mob.gyro.supported);\n" +
        "          ask.then((ok) => {\n" +
        "            if (!ok) {\n" +
        "              this.settings.gyro = false; saveJSON('inkwave.settings', this.settings);";
      const rawAskResolveTarget = "          const ask = mob.gyro.needsPermission ? mob.gyro.request() : Promise.resolve(mob.gyro.supported);\n" +
        "          ask.then((ok) => {\n" +
        "            if (profileEpoch !== (this._aimProfileEpoch || 0)) return;\n" +
        "            if (!ok) {\n" +
        "              applyAimSettingsChange(this.settings, { gyro: false }); saveJSON('inkwave.settings', this.settings);";
      code = replaceOnce(code, rawAskResolveAnchor, rawAskResolveTarget, 'main raw ask resolve');
    }

    // Startup gyro toggle handler
    code = replaceOnce(
      code,
      "this.settings.gyro = !!on;\n        saveJSON('inkwave.settings', this.settings);",
      "applyAimSettingsChange(this.settings, { gyro: !!on });\n        saveJSON('inkwave.settings', this.settings);",
      'main onGyroToggle aim update'
    );

    // Provide deep copy of aimProfiles in getSettings
    code = replaceOnce(
      code,
      "getSettings: () => ({ ...self.settings }),",
      "getSettings: () => ({ ...self.settings, aimProfiles: { tv: { ...(self.settings.aimProfiles?.tv || {}) }, handheld: { ...(self.settings.aimProfiles?.handheld || {}) } } }),",
      'main getSettings aim profile clone'
    );

    return code;
  }

  if (rel === 'src/game/player.js') {
    // Gyro stale delta discard on input ownership change to touch.
    // reliability/touch-gyro-owner may already have tightened the native branch
    // from touch-presence to current touch ownership; compose with either form.
    const gyroRaw = "    if (touch && touch.gyro.enabled) {";
    const gyroOwned = "    if (usingTouch && touch.gyro.enabled) {";
    const gyroAnchor = code.includes(gyroOwned) ? gyroOwned : code.includes(gyroRaw) ? gyroRaw : null;
    if (!gyroAnchor) throw new Error('INKWAVE quality patch conflict (aim profile: player gyro reset on ownership switch): branch not found');
    const gyroResetCode = "    if (this._lastOwnedInput !== inp.lastDevice) {\n" +
      "      if (this._lastOwnedInput && inp.lastDevice === 'touch') {\n" +
      "        const mob = touch || inp.mobile;\n" +
      "        mob?.gyro?.discard?.();\n" +
      "        mob?.gyro?.resync?.();\n" +
      "        if (this._gyro) { this._gyro.yaw = 0; this._gyro.pitch = 0; }\n" +
      "      }\n" +
      "      this._lastOwnedInput = inp.lastDevice;\n" +
      "    }\n" +
      gyroAnchor;
    code = replaceOnce(code, gyroAnchor, gyroResetCode, 'player gyro reset on ownership switch');

    // Right stick horizontal inversion (invertX). Reliability may already own
    // a global padInvertX multiplier, and map ownership may already suppress the
    // camera output while keeping the stick filter live. Compose with every
    // accepted predecessor shape without dropping either owner.
    if (!code.includes('const invX = s.invertX ? -1 : 1;')) {
      const yawPattern = /^([ \t]*)(?:if \(!mapUp\) )?rig\.yaw -= this\.padLook\.x[^;]*;$/gm;
      const matches = [...code.matchAll(yawPattern)];
      if (matches.length !== 1) {
        throw new Error(`INKWAVE quality patch conflict (aim profile: player pad invertX): expected exactly one padLook yaw line (${matches.length})`);
      }
      code = code.replace(yawPattern, (line, indent) => {
        const body = line.trimStart();
        const guarded = body.startsWith('if (!mapUp) ');
        const expr = guarded ? body.slice('if (!mapUp) '.length) : body;
        const rewritten = expr.replace(/;$/, ' * invX;');
        return indent + 'const invX = s.invertX ? -1 : 1;\n' + indent + (guarded ? 'if (!mapUp) ' : '') + rewritten;
      });
    }

    return code;
  }

  if (rel === 'src/core/mobile.js') {
    // Retain whatever gyro configure is present (raw with invX/invY or PR494 without) and prepend profile reset
    const profileResetPrefix = "    if (this._lastAimProfile !== s.aimProfile) {\n" +
      "      this._profileEpoch = (this._profileEpoch || 0) + 1;\n" +
      "      this._gyroIntent = (this._gyroIntent || 0) + 1;\n" +
      "      this.gyro?.discard?.();\n" +
      "      this.gyro?.resync?.();\n" +
      "      this._lastAimProfile = s.aimProfile;\n" +
      "    }\n";
    const rawGyroConfig = "    this.gyro.configure({ sens: s.gyroSens, invX: s.gyroInvertX, invY: s.gyroInvertY });";
    const pr496GyroConfig = "    this.gyro.configure({ sens: s.gyroSens });";

    if (code.includes(rawGyroConfig)) {
      code = replaceOnce(code, rawGyroConfig, profileResetPrefix + rawGyroConfig, 'mobile gyro configure raw');
    } else if (code.includes(pr496GyroConfig)) {
      code = replaceOnce(code, pr496GyroConfig, profileResetPrefix + pr496GyroConfig, 'mobile gyro configure pr496');
    } else {
      throw new Error('INKWAVE quality patch conflict (aim profile: mobile gyro configure): anchor not found');
    }

    // Scoped profile epoch in MobileInput.setGyro prevents deferred permission from activating a replaced profile
    if (code.includes('const intent = ++this._gyroIntent;')) {
      code = replaceOnce(
        code,
        "  setGyro(on, canStart = null) {\n    const intent = ++this._gyroIntent;",
        "  setGyro(on, canStart = null) {\n    const intent = ++this._gyroIntent;\n    const profileEpoch = this._profileEpoch || 0;",
        'mobile setGyro epoch capture adapted'
      );
      code = replaceOnce(
        code,
        "      if (this._destroyed || intent !== this._gyroIntent) return false;",
        "      if (this._destroyed || intent !== this._gyroIntent || profileEpoch !== (this._profileEpoch || 0)) return false;",
        'mobile setGyro finish epoch guard adapted'
      );
    } else {
      const rawSetGyroAnchor = "  setGyro(on) {\n" +
        "    if (!on) { this.gyro.stop(); this.s.gyro = false; this._gyroBtn(); return Promise.resolve(false); }\n" +
        "    const go = () => { this.gyro.start(); this.s.gyro = true; this._gyroBtn(); return true; };\n" +
        "    if (this.gyro.needsPermission) return this.gyro.request().then((ok) => (ok ? go() : (this._gyroBtn(), false)));\n" +
        "    if (!this.gyro.supported) return Promise.resolve(false);\n" +
        "    return Promise.resolve(go());\n" +
        "  }";
      const rawSetGyroTarget = "  setGyro(on) {\n" +
        "    const profileEpoch = this._profileEpoch || 0;\n" +
        "    if (!on) { this.gyro.stop(); this.s.gyro = false; this._gyroBtn(); return Promise.resolve(false); }\n" +
        "    const go = () => {\n" +
        "      if (profileEpoch !== (this._profileEpoch || 0)) return false;\n" +
        "      this.gyro.start(); this.s.gyro = true; this._gyroBtn(); return true;\n" +
        "    };\n" +
        "    if (this.gyro.needsPermission) return this.gyro.request().then((ok) => (ok ? go() : (this._gyroBtn(), false)));\n" +
        "    if (!this.gyro.supported) return Promise.resolve(false);\n" +
        "    return Promise.resolve(go());\n" +
        "  }";
      code = replaceOnce(code, rawSetGyroAnchor, rawSetGyroTarget, 'mobile setGyro raw');
    }

    return code;
  }

  if (rel === 'src/ui/menus.js') {
    // 1. Add aimProfile selector to TOUCH_TAB (leave gyroInvertX/Y solely to PR 496)
    const touchTabAnchor = "  { key: '_layout', label: 'Edit button layout', type: 'link', linkLabel: 'EDIT', help: 'Drag buttons where you want them and resize them. Saved per device.' },\n";
    const touchTabAimProfile = touchTabAnchor +
      "  { key: 'aimProfile', label: 'Aim control mode', type: 'seg', options: [['tv', 'TV / Tabletop'], ['handheld', 'Handheld']], help: 'Splatoon 3 stores independent aim settings for TV/Tabletop and Handheld modes. Select which profile is active.' },\n";
    code = replaceOnce(code, touchTabAnchor, touchTabAimProfile, 'menus TOUCH_TAB aimProfile');

    // 2. Update SETTINGS_TABS controls tab with independent aim settings
    const controlsOldRows = "    { key: 'padSensitivity', label: 'Controller sensitivity', type: 'slider', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + '×', help: 'Camera turn speed with the right stick.' },\n" +
      "    { key: 'invertY', label: 'Invert vertical look', type: 'toggle', help: 'Push up to look down, like a flight stick.' },";

    const controlsNewRows = "    { key: 'aimProfile', label: 'Aim control mode', type: 'seg', options: [['tv', 'TV / Tabletop'], ['handheld', 'Handheld']], help: 'Splatoon 3 stores independent aim settings for TV/Tabletop and Handheld modes. Select which profile is active.' },\n" +
      "    { key: 'gyro', label: 'Motion controls', type: 'toggle', help: 'Tilt and turn to aim with motion gyro. Stored per profile.' },\n" +
      "    { key: 'gyroSens', label: 'Motion sensitivity', type: 'slider', min: -5, max: 5, step: 0.5, fmt: sgnFmt, help: 'Motion-control aiming sensitivity for the selected profile.' },\n" +
      "    { key: 'padSensitivity', label: 'Right stick sensitivity', type: 'slider', min: -5, max: 5, step: 0.5, fmt: sgnFmt, help: 'S3 stick scale from −5 to +5; current INKWAVE speed curve is provisional. Stored per profile.' },\n" +
      "    { key: 'invertY', label: 'Right stick up/down', type: 'seg', options: [[false, 'Normal'], [true, 'Invert']], help: 'Push stick up to look down. Stored per profile.' },\n" +
      "    { key: 'invertX', label: 'Right stick left/right', type: 'seg', options: [[false, 'Normal'], [true, 'Invert']], help: 'Push stick left to look right. Stored per profile.' },";

    const padRow = "    { key: 'padInvertX', label: 'Invert right-stick horizontal look', type: 'toggle', help: 'Reverse controller left/right look only. Mouse, touch and gyro are unchanged.' },\n";
    code = replaceVariantOnce(code, [
      { before: controlsOldRows, after: controlsNewRows },
      {
        before: controlsOldRows.replace('\n', '\n' + padRow),
        after: controlsNewRows.replace("    { key: 'invertY'", padRow + "    { key: 'invertY'"),
      },
    ], 'menus SETTINGS_TABS controls rows');

    // 3. Update onSetting in _scr_settings to refresh all profile controls when aimProfile changes
    const onSettingAnchor = "        if (real !== value && controls.has(key)) { safeCall(() => controls.get(key).refresh(real)); value = real; }";
    const onSettingRefresh = onSettingAnchor + "\n" +
      "        if (key === 'aimProfile') {\n" +
      "          for (const k of ['gyro', 'gyroSens', 'padSensitivity', 'invertY', 'invertX']) {\n" +
      "            const c = controls.get(k);\n" +
      "            if (c) safeCall(() => c.refresh(this._settings()[k]));\n" +
      "          }\n" +
      "        }";
    code = replaceOnce(code, onSettingAnchor, onSettingRefresh, 'menus onSetting refresh controls on aimProfile change');

    return code;
  }

  if (rel === 'src/ui/menu-art.js') {
    code = replaceOnce(
      code,
      "case 'invertY': return previewInvert(ctx);",
      "case 'invertY': case 'invertX': return previewInvert(ctx);",
      'menu-art invertX preview'
    );
    return code;
  }

  return code;
}
