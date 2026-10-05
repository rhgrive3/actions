// Build-only quality adapter for Splatoon 3 independent TV/Tabletop vs Handheld
// aim-control profiles (#503).
// Upstream inkwave-public/ remains byte-for-byte intact.

function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE aim profile patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptAimProfiles(rel, code) {
  if (rel === 'src/config.js') {
    code = replaceOnce(
      code,
      "  padSensitivity: 1.0,\n  invertY: false,",
      "  padSensitivity: 1.0,\n  invertY: false,\n  invertX: false,\n  aimProfile: 'tv',\n  aimProfiles: {\n    tv: { gyro: false, gyroSens: 0, padSensitivity: 1.0, invertY: false, invertX: false },\n    handheld: { gyro: false, gyroSens: 0, padSensitivity: 1.0, invertY: false, invertX: false },\n  },",
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

    // Apply aim settings in _setSettings
    code = replaceOnce(
      code,
      "  _setSettings(partial) {\n    Object.assign(this.settings, partial);\n    saveJSON('inkwave.settings', this.settings);",
      "  _setSettings(partial) {\n    applyAimSettingsChange(this.settings, partial);\n    saveJSON('inkwave.settings', this.settings);",
      'main _setSettings aim update'
    );

    // If gyro permission denied, revert using applyAimSettingsChange
    code = replaceOnce(
      code,
      "this.settings.gyro = false; saveJSON('inkwave.settings', this.settings);",
      "applyAimSettingsChange(this.settings, { gyro: false }); saveJSON('inkwave.settings', this.settings);",
      'main gyro permission denied revert'
    );

    // Startup gyro toggle handler
    code = replaceOnce(
      code,
      "        this.settings.gyro = !!on;\n        saveJSON('inkwave.settings', this.settings);\n        this.menus?.refreshSetting?.('gyro');",
      "        applyAimSettingsChange(this.settings, { gyro: !!on });\n        saveJSON('inkwave.settings', this.settings);\n        this.menus?.refreshSetting?.('gyro');",
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
    // Gyro stale delta discard on input ownership change to touch
    const gyroAnchor = "    // gyro: device turn → camera turn (its own invert settings; the Splatoon handheld feel)\n    if (touch && touch.gyro.enabled) {";
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

    // Right stick horizontal inversion (invertX)
    const stickLookAnchor = "      rig.yaw -= this.padLook.x * 3.6 * ps * boost * friction * dt;";
    const stickLookPatched = "      const invX = s.invertX ? -1 : 1;\n      rig.yaw -= this.padLook.x * 3.6 * ps * boost * friction * dt * invX;";
    code = replaceOnce(code, stickLookAnchor, stickLookPatched, 'player pad invertX');

    return code;
  }

  if (rel === 'src/core/mobile.js') {
    // Handle both cases (PR 494 applied vs not applied) fail-closed
    const rawGyroConfig = "    this.gyro.configure({ sens: s.gyroSens, invX: s.gyroInvertX, invY: s.gyroInvertY });";
    const pr494GyroConfig = "    this.gyro.configure({ sens: s.gyroSens });";
    const targetConfigure = "    if (this._lastAimProfile !== s.aimProfile) {\n" +
      "      this.gyro?.discard?.();\n" +
      "      this.gyro?.resync?.();\n" +
      "      this._lastAimProfile = s.aimProfile;\n" +
      "    }\n" +
      "    this.gyro.configure({ sens: s.gyroSens });";

    if (code.includes(rawGyroConfig)) {
      code = replaceOnce(code, rawGyroConfig, targetConfigure, 'mobile gyro configure raw');
    } else if (code.includes(pr494GyroConfig)) {
      code = replaceOnce(code, pr494GyroConfig, targetConfigure, 'mobile gyro configure pr494');
    } else {
      throw new Error('INKWAVE aim profile patch conflict (mobile gyro configure): anchor not found');
    }

    return code;
  }

  if (rel === 'src/ui/menus.js') {
    // 1. Hide touch gyro inversion rows if PR 494 was not applied yet
    const gyroInvYLine = "  { key: 'gyroInvertY', label: 'Gyro vertical', type: 'seg', options: [[false, 'Normal'], [true, 'Invert']], help: 'Normal: tilt the top toward you to look up (like a window). Invert flips it.' },\n";
    const gyroInvXLine = "  { key: 'gyroInvertX', label: 'Gyro horizontal', type: 'seg', options: [[false, 'Normal'], [true, 'Invert']], help: 'Normal: turn the device left to look left.' },\n";
    if (code.includes(gyroInvYLine)) {
      code = replaceOnce(code, gyroInvYLine, '', 'menus remove gyroInvertY');
    }
    if (code.includes(gyroInvXLine)) {
      code = replaceOnce(code, gyroInvXLine, '', 'menus remove gyroInvertX');
    }

    // 2. Add aimProfile selector to TOUCH_TAB
    const touchTabAnchor = "const TOUCH_TAB = { id: 'touch', label: 'Touch', icon: 'hand', rows: [\n";
    const touchTabAimProfile = touchTabAnchor +
      "  { key: 'aimProfile', label: 'Aim control mode', type: 'seg', options: [['tv', 'TV / Tabletop'], ['handheld', 'Handheld']], help: 'Splatoon 3 stores independent aim settings for TV/Tabletop and Handheld modes. Select which profile is active.' },\n";
    code = replaceOnce(code, touchTabAnchor, touchTabAimProfile, 'menus TOUCH_TAB aimProfile');

    // 3. Update SETTINGS_TABS controls tab with independent aim settings
    const controlsOldRows = "    { key: 'padSensitivity', label: 'Controller sensitivity', type: 'slider', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + '×', help: 'Camera turn speed with the right stick.' },\n" +
      "    { key: 'invertY', label: 'Invert vertical look', type: 'toggle', help: 'Push up to look down, like a flight stick.' },";

    const controlsNewRows = "    { key: 'aimProfile', label: 'Aim control mode', type: 'seg', options: [['tv', 'TV / Tabletop'], ['handheld', 'Handheld']], help: 'Splatoon 3 stores independent aim settings for TV/Tabletop and Handheld modes. Select which profile is active.' },\n" +
      "    { key: 'gyro', label: 'Motion controls', type: 'toggle', help: 'Tilt and turn to aim with motion gyro. Stored per profile.' },\n" +
      "    { key: 'gyroSens', label: 'Motion sensitivity', type: 'slider', min: -5, max: 5, step: 0.5, fmt: sgnFmt, help: 'Same scale as the Switch game: 0 = 132° of device turn per 360°, +5 = 110°, −5 = 278°. Stored per profile.' },\n" +
      "    { key: 'padSensitivity', label: 'Right stick sensitivity', type: 'slider', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + '×', help: 'Camera turn speed with the right stick. Stored per profile.' },\n" +
      "    { key: 'invertY', label: 'Right stick up/down', type: 'seg', options: [[false, 'Normal'], [true, 'Invert']], help: 'Push stick up to look down. Stored per profile.' },\n" +
      "    { key: 'invertX', label: 'Right stick left/right', type: 'seg', options: [[false, 'Normal'], [true, 'Invert']], help: 'Push stick left to look right. Stored per profile.' },";

    code = replaceOnce(code, controlsOldRows, controlsNewRows, 'menus SETTINGS_TABS controls rows');

    // 4. Update onSetting in _scr_settings to refresh all profile controls when aimProfile changes
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
