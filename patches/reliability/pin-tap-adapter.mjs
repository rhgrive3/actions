// Turf Map pins start a Super Jump on a completed tap, never on pointerdown: a cancelled touch / pen contact
// (palm rejection, app switch, premature capture loss) must not commit a forced relocation. Mouse and pad keep
// the snapping-cursor path.
import { replaceOnce } from './input-adapter.mjs';

const TAP_SLOP = 24; // px a contact may drift between down and up and still count as a tap on the same pin

export function adaptPinTap(rel, code) {
  if (rel !== 'src/ui/diorama.js') return code;
  code = replaceOnce(code, `      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' || !this.on || this.k < 0.7) return;
        e.preventDefault(); e.stopPropagation();
        this.hover = i;
        this._jump(i, G.match?.local);
      });`, `      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' || !this.on || this.k < 0.7) return;
        e.preventDefault(); e.stopPropagation();
        this.hover = i;
        const match = G.match, controller = match?.controller;
        if (controller?.mapHeld === false) return;
        const pin = this.pins[i], bubbler = pin?.bubblerTarget;
        if (!pin) return;
        // Pending tap owned by this pointer (captured so a pen that drifts off still reports up/cancel here); the jump waits for its pointerup.
        try { el.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer */ }
        (this._pinTaps || (this._pinTaps = new Map())).set(e.pointerId, { i, target: pin.target, bubblerId: bubbler?.id, bubblerSerial: bubbler?.serial, bubblerTeam: bubbler?.team, x: e.clientX, y: e.clientY, match, actor: match?.local, controller, mapEpoch: controller?._turfMapEpoch ?? 0 });
      });
      el.addEventListener('pointermove', (e) => {
        const tap = this._pinTaps?.get(e.pointerId);
        if (tap && tap.i === i && Math.hypot((e.clientX ?? tap.x) - tap.x, (e.clientY ?? tap.y) - tap.y) > ${TAP_SLOP})
          this._pinTaps.delete(e.pointerId);
      });
      el.addEventListener('pointerup', (e) => {
        const tap = this._pinTaps?.get(e.pointerId);
        if (!tap || tap.i !== i) return;
        this._pinTaps.delete(e.pointerId);
        e.preventDefault(); e.stopPropagation();
        const pin = this.pins[i], bubbler = pin?.bubblerTarget;
        if (!this.on || this.k < 0.7 || !pin || pin.target !== tap.target ||
          bubbler?.id !== tap.bubblerId || bubbler?.serial !== tap.bubblerSerial || bubbler?.team !== tap.bubblerTeam ||
          G.match !== tap.match || G.match?.local !== tap.actor || G.match?.controller !== tap.controller ||
          tap.controller?.mapHeld === false || (tap.controller?._turfMapEpoch ?? 0) !== tap.mapEpoch ||
          Math.hypot((e.clientX ?? tap.x) - tap.x, (e.clientY ?? tap.y) - tap.y) > ${TAP_SLOP}) return;
        this._jump(i, G.match?.local);
      });
      // pointercancel, or capture lost before pointerup, drops only this pointer's pending tap (lostpointercapture after a
      // completed pointerup finds nothing pending).
      for (const type of ['pointercancel', 'lostpointercapture']) el.addEventListener(type, (e) => {
        const tap = this._pinTaps?.get(e.pointerId);
        if (tap && tap.i === i) this._pinTaps.delete(e.pointerId);
      });`, 'map pin tap lifecycle');
  // Closing the map retires every pending pin tap.
  return replaceOnce(code, '      else if (G.rig) { G.rig.dioLook.x = 0; G.rig.dioLook.y = 0; }',
    '      else { this._pinTaps?.clear(); if (G.rig) { G.rig.dioLook.x = 0; G.rig.dioLook.y = 0; } }', 'map pin taps end with the map');
}
