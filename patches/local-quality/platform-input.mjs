// Only boundary resets and held-pad suppression. No action buffering changes.
import { getPlatformLifecycle } from './platform-lifecycle.mjs';
const INSTALLED = Symbol.for('inkwave.platform.input.v1');
export function resetPlatformInput(input, controller) {
  if (!input) return;
  input.keys?.clear(); input.pressed?.clear(); input.padPressed?.clear(); input.padMenuPressed?.clear();
  if (input.mouse) Object.assign(input.mouse, { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false });
  input.mobile?.reset?.(); input.mobile?.gyro?.resync?.();
  input._platformPadRebase = true; input._platformPadAxes = true;
  // Neutralize analog trigger authority until a physical release after resume.
  input._platformPadHeldTriggers?.clear();
  input.padPrev = []; input.pad = null; input.padMenuBlocked?.clear();
  if (!controller) return;
  controller.clearRespawnNavigation?.();
  controller.padMapOpen = controller.mapHeld = false; controller.edgeT = 0;
  if (controller.padLook) controller.padLook.x = controller.padLook.y = 0;
  if (controller.assist) Object.assign(controller.assist, { target: null, has: false, prevValid: false });
  if (controller._gyro) controller._gyro.yaw = controller._gyro.pitch = 0;
  const actor = controller.a;
  if (actor?.intent) {
    actor.intent.move?.set(0, 0, 0);
    for (const key of ['fire', 'jump', 'squid', 'sub', 'special']) actor.intent[key] = false;
  }
  if (actor) {
    for (const key of ['jumpBuffer', 'fireBuffer']) if (key in actor) actor[key] = 0;
    const weapon = actor.weaponRunner;
    if (weapon?.charging) {
      weapon.charging = false; weapon.charge = 0; weapon.chargeDinged = false;
      weapon.chargeLoop?.stop?.(.05); weapon.chargeLoop = null;
    }
    if (weapon) weapon.aimingSub = false;
    // Deferred shots are derived from the input just neutralized; do not let
    // them survive a platform boundary and synthesize a later fire (#991).
    weapon?.cancelPendingInput?.();
    if (actor._prevIntent) for (const key of ['fire', 'jump', 'squid', 'sub', 'special']) actor._prevIntent[key] = false;
  }
}
export function installInputPlatform(Input, env = globalThis) {
  const P = Input.prototype;
  if (Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  const owner = getPlatformLifecycle(env), initialBlur = owner.metrics.blurs, initiallyFocused = owner.focused;
  const poll = P.pollPad, axis = P.padAxis, stick = P.padStick, value = P.padValue, button = P.padButton;
  P.pollPad = function (...args) {
    // Remember initial unfocus even if focus arrives before the first poll.
    if (this._platformPadBlurEpoch === undefined && !initiallyFocused) {
      this._platformPadBlurEpoch = initialBlur;
      this._padEpoch = (this._padEpoch || 0) + 1;
      this._platformPadFocusRebase = true;
      this._platformPadRebase = this._platformPadAxes = true;
    }
    // Visible blur does not suspend simulation. Retire pad authority for the
    // whole unfocused interval, including new input after the initial reset.
    if ((this._platformPadBlurEpoch ?? initialBlur) !== owner.metrics.blurs) {
      this._platformPadBlurEpoch = owner.metrics.blurs;
      this._padEpoch = (this._padEpoch || 0) + 1;
      this._platformPadFocusRebase = true;
    }
    if (!owner.focused) {
      this.pad = null; this.padPrev = [];
      this.padPressed.clear(); this.padMenuPressed?.clear(); this.padMenuBlocked?.clear();
      this._platformPadRebase = this._platformPadAxes = true;
      return;
    }
    const result = poll.apply(this, args);
    if (this._platformPadRebase) {
      this._platformPadRebase = false;
      this._platformPadHeldTriggers ||= new Set();
      this._platformPadHeldTriggers.clear();
      this.padPressed.clear(); this.padMenuPressed?.clear();
      // Match the canonical trigger threshold used by Input.pollPad and gameplay.
      const held = (button, i) => i === 6 || i === 7 ? button.value > 0.3 : !!button.pressed;
      this.padPrev = this.pad ? this.pad.buttons.map(held) : [];
      this.pad?.buttons.forEach((button, i) => {
        if (!held(button, i)) return;
        this.padMenuBlocked.add(i);
        if (i === 6 || i === 7) this._platformPadHeldTriggers.add(i);
      });
    }
    // `padValue` drives FIRE/SQUID directly and bypasses padPrev/menu edge masking.
    // Keep a pre-resume trigger inert until its canonical analog value is neutral.
    for (const i of this._platformPadHeldTriggers || []) {
      if (!(this.pad?.buttons?.[i]?.value > 0.3)) this._platformPadHeldTriggers.delete(i);
    }
    if (this._platformPadAxes && (!this.pad || this.pad.axes.every((value, i) => i >= 4 || Math.abs(value || 0) <= .14))) this._platformPadAxes = false;
    return result;
  };
  P.padButton = function (i) {
    if ((i === 6 || i === 7) && this._platformPadHeldTriggers?.has(i)) return false;
    return button.call(this, i);
  };
  P.padValue = function (i) {
    if ((i === 6 || i === 7) && this._platformPadHeldTriggers?.has(i)) return 0;
    return value.call(this, i);
  };
  P.padAxis = function (...args) { return this._platformPadAxes ? 0 : axis.apply(this, args); };
  P.padStick = function (x, y, out, ...args) {
    if (this._platformPadAxes) { out.x = out.y = out.mag = 0; return out; }
    return stick.call(this, x, y, out, ...args);
  };
}
