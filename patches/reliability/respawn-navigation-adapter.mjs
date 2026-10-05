// Navigation remains live during death; Actor admission never becomes permissive.
import { replaceOnce } from './input-adapter.mjs';
export function adaptRespawnNavigation(rel, code) {
  const patch = (before, after, label) => { code = replaceOnce(code, before, after, 'respawn navigation: ' + label); };
  if (rel === 'src/core/input.js') {
    // Device presentation keeps its existing acquisition policy. Navigation records
    // deliberate input separately so an unchanged held axis cannot revoke a choice.
    patch('  set lastDevice(v) {', `  get navigationDevice() { return this._navigationDevice ?? this.lastDevice; }
  set lastDevice(v) {
    if (v !== 'pad' || !this._navigationPolling || this.padPressed.size ||
        this.pad?.index !== this._navigationPadIndex || this.pad?.id !== this._navigationPadId ||
        navigationAxisZones(this.pad).some((zone, i) => zone !== this._navigationAxisZones?.[i])) this._navigationDevice = v;`, 'explicit navigation owner');
    code += `
function navigationAxisZones(pad) {
  return Array.from({length: 4}, (_, i) => Math.abs(pad?.axes?.[i] || 0) > 0.3 ? Math.sign(pad.axes[i]) : 0);
}
const navigationPollPad = Input.prototype.pollPad;
Input.prototype.pollPad = function (...args) {
  // The same threshold as native acquisition, without changing axis filtering.
  this._navigationPolling = true;
  try { return navigationPollPad.apply(this, args); }
  finally {
    this._navigationPolling = false;
    this._navigationPadIndex = this.pad?.index; this._navigationPadId = this.pad?.id;
    this._navigationAxisZones = navigationAxisZones(this.pad);
  }
};
`;
  }
  if (rel === 'src/game/match.js') {
    patch('    this.controller.update(dt);',
      "    this.controller.navigationEnabled = this.state === 'playing' && !this.paused && !this.attract && !this.controller.menuBlocked;\n    this.controller.update(dt);", 'navigation permission separate from body');
  }
  if (rel === 'src/game/player.js') {
    patch('    const it = a.intent;', '    const it = a.intent;\n    if (this.updateRespawnNavigation()) return;', 'dead navigation precedes body return');
    patch('      selected = true; inp.padPressed.delete(directions[i]);', '      selected = true; this.pendingRespawnJump = null; inp.padPressed.delete(directions[i]);', 'new selection cancels older queued choice');
    patch('    if (!a.canSuperJump() || !target || this.padJumpIndex < 0) return;', '    if (!this.canRequestMapJump() || !target || this.padJumpIndex < 0) return;', 'shared pad admission');
    patch('    if (a.superJump(destination)) {', '    if (this.requestMapJump(destination) && !this.pendingRespawnJump) {', 'pad queue does not close itself');
    patch('  updatePadMapSelection(standardPad) {', `${METHODS}\n  updatePadMapSelection(standardPad) {`, 'shared navigation methods');
  }
  if (rel === 'src/ui/hud.js' || rel === 'src/ui/diorama.js') {
    const isHud = rel === 'src/ui/hud.js';
    const request = "me && G.match?.controller?.a === me ? G.match.controller.canRequestMapJump() : !!me?.canSuperJump?.()";
    patch(isHud ? '    const canJump = this.lab ? true : !!(me && me.canSuperJump && me.canSuperJump());' : '    const canJump = !!(me.alive && me.canSuperJump && me.canSuperJump());',
      isHud ? `    const canJump = this.lab ? true : (${request});` : `    const canJump = ${request};`, 'present selectable targets');
    patch('    if (!me || !me.canSuperJump || !me.canSuperJump()) {', `    if (!(${request})) {`, 'click navigation eligibility');
    if (isHud) patch('    const ok = tg.home ? me.superJump(tg.pad.clone()) : me.superJump(tg.actor);',
      '    const target = tg.home ? tg.pad.clone() : tg.actor;\n    const ok = me && G.match?.controller?.a === me ? G.match.controller.requestMapJump(target) : me.superJump(target);', 'HUD routes one request');
    else {
      patch("    if (i === 3) { const pad = G.level?.spawnPads?.[me.team]; ok = pad ? me.superJump(pad.clone()) : false; }\n    else if (p.target && p.target.alive && !p.target.superJumpState) ok = me.superJump(p.target);",
        "    const request = target => me && G.match?.controller?.a === me ? G.match.controller.requestMapJump(target) : me.superJump(target);\n    if (i === 3) { const pad = G.level?.spawnPads?.[me.team]; ok = pad ? request(pad.clone()) : false; }\n    else if (p.target && p.target.alive && !p.target.superJumpState) ok = request(p.target);", 'diorama routes one request');
      patch("(inp.locked && inp.mouse.leftPressed) || inp.padPressed?.has?.(0)", "(inp.locked && inp.mouse.leftPressed) || (inp.pad?.mapping !== 'standard' && inp.padPressed?.has?.(0))", 'standard pad retains sole A confirmation owner');
    }
  }
  return code;
}
const METHODS = `  canRequestMapJump() {
    if (this.menuBlocked || this.navigationEnabled === false) return false;
    return !!(this.a.canSuperJump() || (this.navigationEnabled && this.mapHeld && !this.a.alive));
  }

  validMapJumpTarget(target) {
    if (target?.pos?.isVector3) return target !== this.a && target.team === this.a.team &&
      G.actors.includes(target) && target.alive && !target.superJumpState;
    return !!(target?.isVector3 && [target.x, target.y, target.z].every(Number.isFinite));
  }

  requestMapJump(target) {
    if (!this.canRequestMapJump()) return false;
    if (!this.validMapJumpTarget(target)) {
      if (this._respawnNavigationActive) this.pendingRespawnJump = null;
      return false;
    }
    if (!this.a.alive || (this._respawnNavigationActive && !this.a.grounded)) {
      // A fresh explicit choice belongs to the device that made that choice.
      this._respawnNavigationOwner = this.input.navigationDevice ?? this.input.lastDevice;
      this.pendingRespawnJump = target.pos?.isVector3 ? { actor: target } : { point: target.clone() };
      return true;
    }
    return this.a.superJump(target);
  }

  clearRespawnNavigation() {
    this.pendingRespawnJump = null;
    this.padJumpTarget = null; this.padJumpIndex = -1;
    this._respawnNavigationActive = false; this._respawnNavigationOwner = null; this._respawnNavigationLife = null;
  }

  respawnMapOpen() {
    const inp = this.input;
    const touch = inp.mobile?.active && inp.mobile.root ? inp.mobile : null;
    return !!(inp.down('Tab') || inp.down('KeyM') ||
      (inp.lastDevice === 'pad' && (inp.pad?.mapping === 'standard' ? this.padMapOpen : inp.padButton(8))) || touch?.mapOpen);
  }

  updateRespawnNavigation() {
    const a = this.a, inp = this.input;
    const permitted = this.navigationEnabled && !this.menuBlocked;
    if (!permitted) {
      if (this._respawnNavigationActive) {
        this.clearRespawnNavigation(); this.padMapOpen = this.mapHeld = false;
        inp.mobile?.setMap?.(false);
      }
      return false;
    }
    const standard = inp.lastDevice === 'pad' && inp.pad?.mapping === 'standard';
    if (this._respawnNavigationActive || !a.alive) {
      if (!standard) this.padMapOpen = false;
      if (standard && inp.padPressed.has(3)) { this.padMapOpen = !this.padMapOpen; inp.padPressed.delete(3); }
    }
    if (a.alive) {
      if (this._respawnNavigationActive) {
        if (!this.respawnMapOpen() || (inp.navigationDevice ?? inp.lastDevice) !== this._respawnNavigationOwner) this.clearRespawnNavigation();
        else if (a.grounded) {
          const pending = this.pendingRespawnJump;
          this.clearRespawnNavigation();
          const target = pending?.actor || pending?.point;
          if (target && this.requestMapJump(target)) {
            this.padMapOpen = this.mapHeld = false; inp.mobile?.setMap?.(false);
            a.intent.move.set(0, 0, 0);
            a.intent.fire = a.intent.jump = a.intent.squid = a.intent.sub = a.intent.special = false;
            return true;
          }
        }
      }
      return false;
    }
    if (this._respawnNavigationActive && this._respawnNavigationLife !== (a.netTp || 0)) this.clearRespawnNavigation();
    if (!this._respawnNavigationActive) this._respawnNavigationLife = a.netTp || 0;
    if (this._respawnNavigationActive && (inp.navigationDevice ?? inp.lastDevice) !== this._respawnNavigationOwner) {
      this.pendingRespawnJump = null; this.padJumpTarget = null; this.padJumpIndex = -1;
    }
    this._respawnNavigationActive = true; this._respawnNavigationOwner = inp.navigationDevice ?? inp.lastDevice;
    const it = a.intent, touch = inp.mobile?.active && inp.mobile.root ? inp.mobile : null;
    it.move.set(0, 0, 0); it.fire = it.jump = it.squid = it.sub = it.special = false;
    this.padLook.x = this.padLook.y = 0; this.edgeT = 0; this.assist.has = this.assist.prevValid = false;
    inp.mobile?.gyro?.discard?.();
    if (inp.mobile) { inp.mobile.lookDX = inp.mobile.lookDY = 0; inp.mobile.pressed?.delete('cameraReset'); }
    // Gameplay actions cannot build a delayed press while navigation is active.
    for (const key of ['Space','KeyE','KeyF','KeyQ']) inp.pressed.delete(key);
    for (const i of [2,4,5,6,7,11]) inp.padPressed.delete(i);
    if (touch) for (const id of ['fire','jump','sub','special','squid']) touch.pressed.delete(id);
    this.mapHeld = this.respawnMapOpen();
    if (!this.mapHeld) { this.pendingRespawnJump = null; this.padJumpTarget = null; this.padJumpIndex = -1; return true; }
    if (this.pendingRespawnJump && !this.validMapJumpTarget(this.pendingRespawnJump.actor || this.pendingRespawnJump.point)) this.pendingRespawnJump = null;
    this.updatePadMapSelection(standard);
    const allies = G.actors.filter(o => o.team === a.team && o !== a);
    // Mobile's normal consume method closes the map. A deferred choice stays visible/cancellable.
    const touchIndex = touch?.jumpTarget ?? -1; if (touch) touch.jumpTarget = -1;
    for (let i = 0; i < 4; i++) {
      const key = 'Digit' + (i + 1), direction = [14,12,15,13][i];
      const rawPad = !standard && inp.lastDevice === 'pad' && inp.padPressed.has(direction);
      if (inp.wasPressed(key) || rawPad || touchIndex === i) {
        const target = i === 3 ? G.level.spawnPads?.[a.team]?.clone() : allies[i];
        this.requestMapJump(target); inp.pressed.delete(key); if (rawPad) inp.padPressed.delete(direction);
      }
    }
    return true;
  }
`;
