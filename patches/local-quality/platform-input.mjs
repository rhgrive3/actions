// Only boundary resets and held-pad suppression. No action buffering changes.
const INSTALLED = Symbol.for('inkwave.platform.input.v1');
export function resetPlatformInput(input, controller) {
  if (!input) return;
  input.keys?.clear(); input.pressed?.clear(); input.padPressed?.clear(); input.padMenuPressed?.clear();
  if (input.mouse) Object.assign(input.mouse, { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false });
  input.mobile?.reset?.(); input.mobile?.gyro?.resync?.();
  input._platformPadRebase = true; input._platformPadAxes = true;
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
    if (actor._prevIntent) for (const key of ['fire', 'jump', 'squid', 'sub', 'special']) actor._prevIntent[key] = false;
  }
}
export function installInputPlatform(Input) {
  const P = Input.prototype;
  if (Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  const poll = P.pollPad, axis = P.padAxis, stick = P.padStick;
  P.pollPad = function (...args) {
    const result = poll.apply(this, args);
    if (this._platformPadRebase) {
      this._platformPadRebase = false;
      this.padPressed.clear(); this.padMenuPressed?.clear();
      // Match the canonical trigger threshold used by Input.pollPad and gameplay.
      const held = (button, i) => i === 6 || i === 7 ? button.value > 0.3 : !!button.pressed;
      this.padPrev = this.pad ? this.pad.buttons.map(held) : [];
      this.pad?.buttons.forEach((button, i) => { if (held(button, i)) this.padMenuBlocked.add(i); });
    }
    if (this._platformPadAxes && (!this.pad || this.pad.axes.every(value => Math.abs(value) <= .14))) this._platformPadAxes = false;
    return result;
  };
  P.padAxis = function (...args) { return this._platformPadAxes ? 0 : axis.apply(this, args); };
  P.padStick = function (x, y, out, ...args) {
    if (this._platformPadAxes) { out.x = out.y = out.mag = 0; return out; }
    return stick.call(this, x, y, out, ...args);
  };
}
