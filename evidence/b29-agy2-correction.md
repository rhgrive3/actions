# INKWAVE #503 Targeted Correction Evidence

**Issue**: #503 (Split TV/Tabletop and Handheld Aim Profiles)  
**Lane**: `/mnt/workspace/inkwave-batch-c/lanes/b29-agy2`  
**Reference Baseline**: Nintendo Switch Splatoon 3 (Ver. 11.3.0) Options specification  
**Upstream**: `inkwave-public/` (unmodified byte-for-byte; all modifications isolated in build-only adapter)  
**Date**: 2026-10-05  

---

## 1. Executive Summary of Corrections

Following parent audit of the initial commit (`0c2e233`), four targeted runtime and startup gaps were identified and resolved without expanding scope or touching unrelated subsystems:

1. **Native `loadJSON` Shallow Merge Fix**: Native `loadJSON` performs `{ ...def, ...v }`. Having nested default `aimProfiles: { tv, handheld }` in `DEFAULT_SETTINGS` meant legacy flat saves inherited the default profile objects, causing `migrateAimProfiles` to ignore the user's legacy distinctive choices (`gyroSens: 3.5, padSensitivity: 2.2, invertY: true`) and reset them to defaults. Furthermore, multiple cold instances shared the same nested object pointer.  
   *Correction*: `DEFAULT_SETTINGS.aimProfiles` is set to `null`. Fresh deep-owned profile objects are instantiated during migration and populated with the user's distinctive legacy flat values. Exact composed `loadJSON` + constructor load regression confirms deep ownership, mutation isolation, and zero `DEFAULT_SETTINGS` contamination.
2. **Native `_setSettings` Gyro Handling & Scoped Profile Epoch**: Native `_setSettings` previously only evaluated `if ('gyro' in partial)` using `partial.gyro`. Profile switches with differing gyro states updated sensitivity but never invoked `setGyro(true)` / `setGyro(false)` or requested permission. Additionally, deferred asynchronous permission could resolve after a profile switch and activate gyro on the wrong profile.  
   *Correction*: Added profile-induced gyro transition detection (`gyroTransition = ('gyro' in partial) || (profileChanged && prevGyro !== !!this.settings.gyro)`), routing through native settings flow. A scoped `_aimProfileEpoch` guards asynchronous permission callbacks in both `main.js` and `MobileInput.setGyro`, preventing stale in-flight requests from activating a replaced profile.
3. **Removal of Duplicated Issue #439 (PR 494 Parity)**: The initial commit duplicated pending Ready PR 494 by removing Touch tab `gyroInvertX`/`gyroInvertY` rows and stripping `invX`/`invY` from `this.gyro.configure`.  
   *Correction*: Removed issue #439 changes from #503 diff. `aim-profile-adapter.mjs` strictly preserves whatever `this.gyro.configure(...)` is already present (raw with `invX`/`invY` or PR 494 without) while only prepending profile resets and epoch tracking. Dual composition tests prove clean adapter behavior against both raw and exact PR 494 source.
4. **Controls Tooltip & Reporting Fidelity**: Replaced copied angle constants (`132°`, `110°`, `278°`) in the Controls tab tooltip with a concise explanation (`Motion-control aiming sensitivity for the selected profile.`). Documented that right stick sensitivity uses INKWAVE's legacy scale `0.2..3.0×` (not Nintendo's `-5..+5` response curve). Added interactive `onSetting` callback execution tests verifying UI control refresh on profile change. Documented that helper isolation does not constitute a loaded native PracticeSession proof.

---

## 2. Technical Root Causes and Exact Solutions

### 2.1 Native `loadJSON` Shallow Merge & Instance Pointer Sharing

**Root Cause**:
In `inkwave-public/src/main.js`:
```javascript
function loadJSON(key, def) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ? { ...def, ...v } : { ...def };
  } catch {
    return { ...def };
  }
}
```
If `DEFAULT_SETTINGS` in `src/config.js` defines:
```javascript
aimProfiles: {
  tv: { gyro: false, gyroSens: 0, padSensitivity: 1.0, invertY: false, invertX: false },
  handheld: { gyro: false, gyroSens: 0, padSensitivity: 1.0, invertY: false, invertX: false },
}
```
Then for a user with a legacy flat save `v = { gyroSens: 3.5, padSensitivity: 2.2, invertY: true }`:
1. `v.aimProfiles` is undefined.
2. Shallow merge `{ ...def, ...v }` copies `def.aimProfiles` by reference.
3. `result.aimProfiles.tv` already has `padSensitivity: 1.0`, `gyroSens: 0`, `invertY: false`.
4. `migrateAimProfiles` inspected `result.aimProfiles.tv` and found valid numbers, ignoring the user's legacy distinctive flat values.
5. In addition, two consecutive `loadJSON` calls returned the same shared object pointer from `DEFAULT_SETTINGS.aimProfiles`.

**Solution**:
1. In `src/config.js`, `DEFAULT_SETTINGS.aimProfiles` is configured as `null`:
```javascript
  padSensitivity: 1.0,
  invertY: false,
  invertX: false,
  aimProfile: 'tv',
  aimProfiles: null,
```
2. When `loadJSON` executes, `{ ...def, ...v }.aimProfiles` remains `null`.
3. In `patches/local-quality/aim-profile.mjs`:
```javascript
export function migrateAimProfiles(settings, defaults = {}) {
  if (!settings || typeof settings !== 'object') return settings;

  const hasExistingProfiles = Boolean(settings.aimProfiles && typeof settings.aimProfiles === 'object');
  const existingProfiles = hasExistingProfiles ? settings.aimProfiles : null;

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
    // Legacy save with no aimProfiles: both profiles inherit the user's legacy flat settings
    settings.aimProfiles.tv = sanitizeAimProfile(userFlat, defaultProfiles.tv);
    settings.aimProfiles.handheld = sanitizeAimProfile(userFlat, defaultProfiles.handheld);
  }

  if (settings.aimProfile !== 'tv' && settings.aimProfile !== 'handheld') {
    settings.aimProfile = (defaults && defaults.aimProfile === 'handheld') ? 'handheld' : 'tv';
  }

  syncActiveAimValues(settings);
  return settings;
}
```
4. If `partial.aimProfiles === null` is passed (e.g. from UI "Reset to defaults"), `applyAimSettingsChange` resets both profiles to default structures and resets mode to `tv`.

---

### 2.2 Native `_setSettings` Profile-Induced Gyro Lifecycle & Scoped Epoch

**Root Cause**:
In `inkwave-public/src/main.js`:
```javascript
  _setSettings(partial) {
    Object.assign(this.settings, partial);
    saveJSON('inkwave.settings', this.settings);
    const mob = this.input?.mobile;
    if (mob) {
      mob.applySettings(this.settings);
      if ('gyro' in partial) {
        if (partial.gyro) {
          const ask = ...;
          ask.then((ok) => { ... });
        } else mob.setGyro(false);
      }
    }
  }
```
When changing mode (`partial = { aimProfile: 'handheld' }`):
- `'gyro' in partial` was `false`.
- If switching from TV (`gyro: false`) to Handheld (`gyro: true`), gyro was never started.
- If switching from Handheld (`gyro: true`) to TV (`gyro: false`), gyro was never stopped.
- If permission was requested under TV mode and user switched to Handheld before the iOS prompt resolved, the resolution callback would execute with stale context and could activate or corrupt the wrong profile.

**Solution**:
In `src/main.js` via `patches/local-quality/aim-profile-adapter.mjs`:
```javascript
  _setSettings(partial) {
    const prevProfile = this.settings?.aimProfile;
    const prevGyro = !!this.settings?.gyro;
    applyAimSettingsChange(this.settings, partial);
    saveJSON('inkwave.settings', this.settings);
    const profileChanged = prevProfile !== this.settings.aimProfile;
    if (profileChanged) this._aimProfileEpoch = (this._aimProfileEpoch || 0) + 1;
    const profileEpoch = this._aimProfileEpoch || 0;
    const mob = this.input?.mobile;
    if (mob) {
      mob.applySettings(this.settings);
      const gyroTransition = ('gyro' in partial) || (profileChanged && prevGyro !== !!this.settings.gyro);
      if (gyroTransition) {
        const turnOn = 'gyro' in partial ? !!partial.gyro : !!this.settings.gyro;
        if (turnOn) {
          const ask = mob.setGyro(true, () => this.input?.mobile === mob && G.mode === 'match' && this.match?.state === 'playing');
          const intent = mob._gyroIntent;
          ask.then((ok) => {
            if (this.input?.mobile !== mob || mob._destroyed || intent !== mob._gyroIntent || profileEpoch !== (this._aimProfileEpoch || 0) || !this.settings.gyro) return;
            if (!ok) {
              applyAimSettingsChange(this.settings, { gyro: false }); saveJSON('inkwave.settings', this.settings);
              this.menus?.refreshSetting?.('gyro');
              mob.toast(t(mob.gyro.supported ? 'Gyro permission was denied. Allow motion access in Safari settings.' : 'Gyro is not available on this device.'), 3.2);
            }
          });
        } else mob.setGyro(false);
      }
    }
    if ('quality' in partial || 'shadows' in partial || 'bloom' in partial) this.R?.applySettings(this.settings);
  }
```

In `src/core/mobile.js`:
- `applySettings` increments `this._profileEpoch = (this._profileEpoch || 0) + 1;` when `this._lastAimProfile !== s.aimProfile`.
- `setGyro` captures `const profileEpoch = this._profileEpoch || 0;` and checks `profileEpoch !== (this._profileEpoch || 0)` inside `finish(ok)` to ensure a deferred request started under an older profile cannot activate a replaced profile.

---

### 2.3 PR 494 (Issue #439) Separation

**Root Cause**:
The initial commit removed `gyroInvertY` and `gyroInvertX` from `src/ui/menus.js` and stripped `invX`/`invY` from `this.gyro.configure(...)` in `src/core/mobile.js`. Those changes belong strictly to Ready PR 494 (issue #439).

**Solution**:
1. Removed all `gyroInvertY`/`gyroInvertX` removal lines from `aim-profile-adapter.mjs`.
2. In `src/core/mobile.js`, the adapter detects whether raw or PR 494 code is present:
```javascript
    const rawGyroConfig = "    this.gyro.configure({ sens: s.gyroSens, invX: s.gyroInvertX, invY: s.gyroInvertY });";
    const pr494GyroConfig = "    this.gyro.configure({ sens: s.gyroSens });";
    if (code.includes(rawGyroConfig)) {
      code = replaceOnce(code, rawGyroConfig, profileResetPrefix + rawGyroConfig, 'mobile gyro configure raw');
    } else if (code.includes(pr494GyroConfig)) {
      code = replaceOnce(code, pr494GyroConfig, profileResetPrefix + pr494GyroConfig, 'mobile gyro configure pr494');
    }
```
If raw source is present, `invX`/`invY` are preserved intact. If PR 494 is applied, `{ sens: s.gyroSens }` is preserved intact.

---

### 2.4 Controls Tooltip & Scale Fidelity

1. **Tooltip Simplification**: In `src/ui/menus.js`, replaced:
   `help: 'Same scale as the Switch game: 0 = 132° of device turn per 360°, +5 = 110°, −5 = 278°. Stored per profile.'`
   with:
   `help: 'Motion-control aiming sensitivity for the selected profile.'`
2. **Right Stick Scale**: Confirmed to use INKWAVE's legacy scale:
   `{ key: 'padSensitivity', label: 'Right stick sensitivity', type: 'slider', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + '×', help: 'Camera turn speed with the right stick. Stored per profile.' }`
3. **Interactive UI Verification**: In `aim-profile.test.mjs`, verified actual `onSetting` callback invocation and synchronous `.refresh()` dispatch across controls map.

---

## 3. Test Verification Results

### 3.1 Focused Aim Profile Regression Suite
**Command**: `node --experimental-vm-modules --test patches/local-quality/tests/aim-profile.test.mjs`

```
✔ DEFAULT_SETTINGS in composed config.js sets aimProfiles to null with tv default selector (9.13ms)
✔ exact composed native loadJSON merges legacy flat save without overwriting user choices (3.61ms)
✔ two cold loads prove deep ownership: no shared nested pointers and zero DEFAULT_SETTINGS mutation (3.38ms)
✔ native _setSettings: profile switch OFF->ON starts gyro and ON->OFF stops gyro (0.97ms)
✔ native _setSettings: permission denied on OFF->ON reverts active profile and notifies UI (0.59ms)
✔ scoped profile epoch guards deferred permission: switching profiles/back prevents activation on replaced profile (0.36ms)
✔ MobileInput.setGyro scoped profile epoch prevents deferred request from activating replaced profile (0.57ms)
✔ adapter composition retains existing gyro configure for both raw and PR494 applied sources (11.25ms)
✔ PlayerController applies independent padSensitivity, invertY, invertX and resets stale gyro on native touch transition (9.42ms)
✔ UI interactive settings change callback refreshes all aim controls on profile switch (5.22ms)
✔ Controls tooltip uses simple selected profile sensitivity explanation and legacy stick scale (5.71ms)
✔ two independent profiles can hold distinct values simultaneously and persist separately (0.40ms)
✔ globals remain shared across profile switches and are not duplicated (0.23ms)
✔ Practice and match helper instances remain isolated without global state bleed (0.19ms)
✔ save and reload preserves independent profiles and active mode (1.19ms)
✔ re-migration is idempotent and preserves already split profiles without overwriting (0.20ms)
ℹ tests 16
ℹ suites 0
ℹ pass 16
ℹ fail 0
ℹ duration_ms 201.51ms
```

### 3.2 Full Local-Quality Suite Confirmation
**Command**: `node --experimental-vm-modules --test patches/local-quality/tests/*.test.mjs`

```
ℹ tests 69
ℹ suites 0
ℹ pass 69
ℹ fail 0
ℹ duration_ms 34798.68ms
```
All existing quality adapters (`idle`, `lobby-resources`, `minimap-resources`, `landing-rigidity`, `first-touch`, `touch-relayout`, `walk`, `roller`, `levelMaterial`) remain 100% passing and mutually compatible.

---

## 4. Verification Checkpoint

| Requirement | Audit Status | Evidence |
|---|---|---|
| 1. Native loadJSON shallow merge fix + cold load isolation | Verified | `DEFAULT_SETTINGS.aimProfiles === null`; exact composed native `loadJSON` preserves legacy 3.5/2.2/true; two cold loads show independent object identities; zero default mutation |
| 2. Native `_setSettings` profile transition + scoped epoch | Verified | Profile switch TV->Handheld starts gyro; Handheld->TV stops gyro; permission denied reverts profile; deferred permission guarded by `_aimProfileEpoch` across switches and back; `MobileInput.setGyro` own deferred request guarded |
| 3. Removal of duplicate #439; dual raw vs PR494 support | Verified | #503 diff contains no `gyroInvertX/Y` hiding; raw keeps `invX`/`invY`; PR 494 composition drops `invX`/`invY`; adapter handles both fail-closed |
| 4. Controls tooltip simplified & legacy stick scale reported | Verified | Angle constants removed from Controls tooltip; 0.2..3.0× scale verified; behavior report updated with non-claimed notes |
| 5. Interactive UI `onSetting` callback tested | Verified | `onSetting('aimProfile')` dispatches `.refresh()` to all 5 aim controls with active profile values |
| 6. PlayerController native transition tested | Verified | `lastDevice: 'touch'` triggers `discard()`, `resync()`, and resets `_gyro` yaw/pitch in real controller update |
