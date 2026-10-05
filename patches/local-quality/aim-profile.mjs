// Splatoon 3 independent aim-control profiles for TV/Tabletop and Handheld modes.
//
// In Splatoon 3 (Ver. 11.3.0), the Options menu maintains two independent
// aim profiles: TV/Tabletop Mode and Handheld Mode.
// The following settings are stored independently per mode:
//   - Motion Controls ON/OFF (gyro)
//   - Motion-Control Sensitivity (gyroSens: -5..+5)
//   - Right Stick Sensitivity (padSensitivity)
//   - Right Stick Up/Down (invertY: Normal / Invert)
//   - Right Stick Left/Right (invertX: Normal / Invert)
//
// Non-aim settings (mouse sensitivity, touch swipe look, HUD layout, video,
// audio, matchmaking defaults) remain global and shared across both modes.

export const AIM_PROFILE_KEYS = ['gyro', 'gyroSens', 'padSensitivity', 'invertY', 'invertX'];
export const AIM_PROFILES = ['tv', 'handheld'];

export const DEFAULT_AIM_PROFILES = Object.freeze({
  tv: Object.freeze({
    gyro: false,
    gyroSens: 0,
    padSensitivity: 1.0,
    invertY: false,
    invertX: false,
  }),
  handheld: Object.freeze({
    gyro: false,
    gyroSens: 0,
    padSensitivity: 1.0,
    invertY: false,
    invertX: false,
  }),
});

export function createDefaultAimProfiles() {
  return {
    tv: {
      gyro: false,
      gyroSens: 0,
      padSensitivity: 1.0,
      invertY: false,
      invertX: false,
    },
    handheld: {
      gyro: false,
      gyroSens: 0,
      padSensitivity: 1.0,
      invertY: false,
      invertX: false,
    },
  };
}

export function sanitizeAimProfile(profile, fallback = {}) {
  return {
    gyro: profile?.gyro != null ? Boolean(profile.gyro) : (fallback.gyro ?? false),
    gyroSens: Number.isFinite(Number(profile?.gyroSens)) ? Number(profile.gyroSens) : (fallback.gyroSens ?? 0),
    padSensitivity: Number.isFinite(Number(profile?.padSensitivity)) ? Number(profile.padSensitivity) : (fallback.padSensitivity ?? 1.0),
    invertY: profile?.invertY != null ? Boolean(profile.invertY) : (fallback.invertY ?? false),
    invertX: profile?.invertX != null ? Boolean(profile.invertX) : (fallback.invertX ?? false),
  };
}

export function syncActiveAimValues(settings) {
  if (!settings || typeof settings !== 'object') return;
  const mode = settings.aimProfile === 'handheld' ? 'handheld' : 'tv';
  const active = settings.aimProfiles?.[mode];
  if (active) {
    settings.gyro = active.gyro;
    settings.gyroSens = active.gyroSens;
    settings.padSensitivity = active.padSensitivity;
    settings.invertY = active.invertY;
    settings.invertX = active.invertX;
  }
}

export function migrateAimProfiles(settings, defaults = {}) {
  if (!settings || typeof settings !== 'object') return settings;

  const hasExistingProfiles = Boolean(settings.aimProfiles && typeof settings.aimProfiles === 'object');
  const existingProfiles = hasExistingProfiles ? settings.aimProfiles : null;

  // Deep-owned container for profiles so instances and DEFAULT_SETTINGS never share pointers
  settings.aimProfiles = {};

  const userFlat = {
    gyro: settings.gyro,
    gyroSens: settings.gyroSens,
    padSensitivity: settings.padSensitivity,
    invertY: settings.invertY,
    invertX: settings.invertX,
  };

  const defaultProfiles = createDefaultAimProfiles();
  const baseForTv = sanitizeAimProfile(userFlat, defaultProfiles.tv);
  const baseForHh = sanitizeAimProfile(userFlat, defaultProfiles.handheld);

  if (existingProfiles) {
    settings.aimProfiles.tv = sanitizeAimProfile(existingProfiles.tv, baseForTv);
    settings.aimProfiles.handheld = sanitizeAimProfile(existingProfiles.handheld, baseForHh);
  } else {
    settings.aimProfiles.tv = sanitizeAimProfile(userFlat, defaultProfiles.tv);
    settings.aimProfiles.handheld = sanitizeAimProfile(userFlat, defaultProfiles.handheld);
  }

  // An explicit mode selector is required because browser form factors cannot
  // be reliably guessed as physical Switch console play modes.
  if (settings.aimProfile !== 'tv' && settings.aimProfile !== 'handheld') {
    settings.aimProfile = (defaults && defaults.aimProfile === 'handheld') ? 'handheld' : 'tv';
  }

  syncActiveAimValues(settings);
  return settings;
}

export function applyAimSettingsChange(settings, partial) {
  if (!settings || !partial || typeof partial !== 'object') return settings;
  if (!settings.aimProfiles) migrateAimProfiles(settings);

  // 1. Explicit profile selection or reset to defaults
  if (partial.aimProfiles === null) {
    const def = createDefaultAimProfiles();
    settings.aimProfiles = {
      tv: { ...def.tv },
      handheld: { ...def.handheld },
    };
    settings.aimProfile = 'tv';
  } else if (partial.aimProfile === 'tv' || partial.aimProfile === 'handheld') {
    settings.aimProfile = partial.aimProfile;
  }

  // 2. Direct per-profile updates if provided in partial.aimProfiles
  if (partial.aimProfiles && typeof partial.aimProfiles === 'object') {
    if (partial.aimProfiles.tv && typeof partial.aimProfiles.tv === 'object') {
      Object.assign(settings.aimProfiles.tv, sanitizeAimProfile(partial.aimProfiles.tv, settings.aimProfiles.tv));
    }
    if (partial.aimProfiles.handheld && typeof partial.aimProfiles.handheld === 'object') {
      Object.assign(settings.aimProfiles.handheld, sanitizeAimProfile(partial.aimProfiles.handheld, settings.aimProfiles.handheld));
    }
  }

  // 3. Flat aim keys in partial update the active profile
  const active = settings.aimProfiles[settings.aimProfile];
  for (const k of AIM_PROFILE_KEYS) {
    if (k in partial && !(partial.aimProfiles && partial.aimProfiles[settings.aimProfile] && k in partial.aimProfiles[settings.aimProfile])) {
      active[k] = partial[k];
    }
  }

  // 4. Non-aim settings apply globally to settings
  for (const [k, v] of Object.entries(partial)) {
    if (k !== 'aimProfiles' && !AIM_PROFILE_KEYS.includes(k) && k !== 'aimProfile') {
      settings[k] = v;
    }
  }

  // 5. Keep active flat values synchronized for existing consumers
  syncActiveAimValues(settings);
  return settings;
}
