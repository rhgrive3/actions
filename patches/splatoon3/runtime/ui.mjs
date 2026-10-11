import { updateHealthBars } from './combat-info.mjs';
const HEALTH_UI = Symbol.for('inkwave.s3.health-ui.install');
// Some public mirrors call the menu fitter without defining it. Restore its
// advertised shrink-to-fit behavior while keeping the original UI intact.
// The HUD ink tank is a 2D canvas redrawn on every frame it animates. Each
// redraw reads the canvas client size (a forced layout after the frame's HUD
// DOM writes) and repaints gradients/clips; the profile showed it as the top
// single cost while firing. Its slosh/level physics keep running every frame in
// HUD.update; only the repaint is limited to 30 Hz, with the elapsed time
// carried so the bubbles advance by the same total.
export const TANK_REDRAW_INTERVAL = 1 / 30;
const TANK_THROTTLE = Symbol.for('inkwave.s3.hud-tank-throttle.v1');
export function installTankThrottle(HUD) {
  if (!HUD?.prototype?._drawTank || Object.hasOwn(HUD.prototype, TANK_THROTTLE)) return false;
  const drawTank = HUD.prototype._drawTank;
  Object.defineProperty(HUD.prototype, TANK_THROTTLE, { value: drawTank });
  HUD.prototype._drawTank = function (dt, ...rest) {
    this._s3TankElapsed = (this._s3TankElapsed || 0) + (Number.isFinite(dt) && dt > 0 ? dt : 0);
    if (this._s3TankDrawn && this._s3TankElapsed + 1e-9 < TANK_REDRAW_INTERVAL) return undefined;
    const elapsed = this._s3TankElapsed;
    this._s3TankElapsed = 0; this._s3TankDrawn = true;
    return drawTank.call(this, elapsed, ...rest);
  };
  return true;
}

export function installUi({ Menus, HUD }) {
  installTankThrottle(HUD);
  if (HUD && !Object.hasOwn(HUD.prototype, HEALTH_UI)) {
    const update = HUD.prototype.update;
    Object.defineProperty(HUD.prototype, HEALTH_UI, { value: true });
    HUD.prototype.update = function (dt, frame) {
      const result = update.call(this, dt, frame);
      updateHealthBars(this, frame?.healthMarkers);
      return result;
    };
  }
  if (typeof Menus.prototype._fitAll === 'function') return;
  Menus.prototype._fitAll = function (root) {
    for (const el of root.querySelectorAll('[data-fit]')) {
      el.style.fontSize = '';
      const base = parseFloat(getComputedStyle(el).fontSize), width = el.clientWidth;
      if (!width || !base || el.scrollWidth <= width) continue;
      let low = base * .6, high = base;
      for (let i = 0; i < 6; i++) {
        const size = (low + high) / 2; el.style.fontSize = size + 'px';
        if (el.scrollWidth > width) high = size; else low = size;
      }
      el.style.fontSize = low + 'px';
    }
  };
}

// Boot-time warm-up for presentation work that upstream first pays at the
// moment of firing. Measured in Chromium (production build, profiler):
//   - ScreenFX: its post-process pass is disabled while idle, so the large
//     `InkwaveScreenFX` program is compiled the first time an effect (the
//     firing punch/flash) enables it. The boot `compileAsync(scene)` cannot see
//     it because the pass is not part of the scene.
//   - Lens ink: same, for the first ink droplet on the camera lens.
// Both are warmed by enabling them, imperceptibly, for the few frames the boot
// sequence renders behind the loading screen, so the program cache key is the
// exact one the live pass uses (same render targets, same TAPS define).
// Gameplay state is not touched.

export const SCREEN_FX_WARM_SECONDS = 0.12;
export const SCREEN_FX_WARM_FLASH = 0.0025;   // uFlash.w: far below visibility

export function warmScreenFX(fx) {
  if (!fx?.pass || !fx.s) return false;
  fx.debugHold = Math.max(fx.debugHold || 0, SCREEN_FX_WARM_SECONDS);
  fx.force = { ...(fx.force || {}), flash: SCREEN_FX_WARM_FLASH };
  try { fx.lens?.droplet?.(0, 0.5, 0.5, 0.0005, { life: 0.05 }); } catch { /* optional */ }
  return true;
}
