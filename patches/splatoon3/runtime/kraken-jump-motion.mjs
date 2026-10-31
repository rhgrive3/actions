// Nintendo's Kraken Royale demo describes B as a spinning jump attack.
// This is a procedural pose for INKWAVE's upright (+Y mantle) model, not an
// extracted Nintendo joint curve. The duration and squash are calibration.
import { specialPresentationToken } from './special-presentation-owner.mjs';
export const KRAKEN_JUMP_MOTION = Object.freeze({ turn: .45, landing: .16, replayWindow: 1.2 });
const smooth = t => t * t * (3 - 2 * t);

// Only the local gameplay emitter / accepted remote replay may feed this
// observer. Raw network rows and optional VFX marks are not animation authority.
export function createKrakenJumpObserver(G) {
  let marks = new WeakMap();
  return {
    observe(e) {
      const a = e?.actor, token = specialPresentationToken(a);
      if (e?.id !== 'krakenRoyale' || !a?.alive || token?.id !== e.id
        || !Number.isSafeInteger(e.activation) || e.activation < 1) return;
      const old = marks.get(a);
      if (token.activation != null && token.activation !== e.activation) return;
      if (old?.token === token && e.activation < old.activation) return;
      if (e.action === 'end') { marks.delete(a); return; }
      if (e.action === 'activate') {
        if (old?.token === token && old.activation === e.activation) return;
        marks.set(a, { token, activation: e.activation, index: -1, at: -Infinity });
      } else if (e.action === 'jump' && Number.isSafeInteger(e.index) && e.index >= 0) {
        if (old?.token === token && (old.activation !== e.activation || e.index <= old.index)) return;
        marks.set(a, { token, activation: e.activation, index: e.index, at: Number.isFinite(G.time) ? G.time : 0 });
      }
    },
    get: a => marks.get(a),
    forget(a, token) { if (marks.get(a)?.token === token) marks.delete(a); },
    clear() { marks = new WeakMap(); },
  };
}

// Mutates only the device's private pose state. Never writes Actor fields,
// attack duration, damage, paint, collision, velocity or the network protocol.
export function advanceKrakenJumpMotion(s, a, state, phase, dt, now, mark) {
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  const token = specialPresentationToken(a);
  if (s.krakenJumpToken !== token) {
    s.krakenJumpToken = token;
    s.krakenJumpLive = false;
    s.krakenJumpAge = 0;
    s.krakenJumpMark = null;
    s.krakenLandAge = KRAKEN_JUMP_MOTION.landing;
    s.krakenSpin = s.krakenTakeoff = s.krakenLanding = 0;
  }
  const replayAge = now - (mark?.at ?? -Infinity);
  const replay = a?.remote === true && mark?.token === token && mark.index >= 0
    && Number.isFinite(replayAge) && replayAge >= 0 && replayAge <= KRAKEN_JUMP_MOTION.replayWindow;
  const allowed = a?.alive === true && token?.id === 'krakenRoyale'
    && phase !== 'startup' && phase !== 'finish' && phase !== 'dash';
  const attacking = allowed && a.grounded === false && !a.climbing
    && (a.remote ? replay : state?.id === 'krakenRoyale' && state.jumpAttack === true);
  if (attacking) {
    // A takeoff event can distinguish two jumps even when no grounded frame
    // was drawn between them. Duplicate accepted indices cannot rewind a turn.
    const newJump = !s.krakenJumpLive || (mark && mark !== s.krakenJumpMark);
    if (newJump) { s.krakenJumpAge = 0; s.krakenJumpMark = mark || null; }
    s.krakenJumpLive = true;
    s.krakenLandAge = KRAKEN_JUMP_MOTION.landing;
    s.krakenJumpAge = Math.min(KRAKEN_JUMP_MOTION.turn, s.krakenJumpAge + step);
    const progress = s.krakenJumpAge / KRAKEN_JUMP_MOTION.turn;
    s.krakenSpin = progress < 1 ? Math.PI * 2 * smooth(progress) : 0;
    s.krakenTakeoff = s.krakenJumpAge > 0 && progress < 1 ? Math.exp(-10 * s.krakenJumpAge) : 0;
  } else {
    if (s.krakenJumpLive && allowed && a.grounded === true && !a.climbing) s.krakenLandAge = 0;
    s.krakenJumpLive = false;
    s.krakenSpin = s.krakenTakeoff = 0;
    s.krakenLandAge = allowed ? Math.min(KRAKEN_JUMP_MOTION.landing, s.krakenLandAge + step) : KRAKEN_JUMP_MOTION.landing;
  }
  const landing = s.krakenLandAge / KRAKEN_JUMP_MOTION.landing;
  s.krakenLanding = landing < 1 ? Math.sin(Math.PI * landing) : 0;
  return s;
}
