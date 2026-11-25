// Offscreen & far-distance Character.update staggered rate throttling.
//
// In live 4v4 matches, Character.update (pose/motion/IK/hair/materials) for 7 bots
// or remote actors accounts for ~50% of total simulation CPU time (~6.2 ms/tick).
// This outermost wrapper staggers visual updates for non-local actors while
// preserving full 60 Hz fidelity for:
//   - the local player, Practice Range, menus/showcase, forced LOD, uninitialized rigs
//   - onscreen active firing / sub-firing / special / charging frames (exact rig-bone muzzles)
//   - form transitions (kid <-> squid), death/respawn, and return-to-view frames
//
// Throttling cadence (staggered per actor slot so frame times stay flat):
//   - Provably outside camera frustum (non-combat): 1 in 4 ticks (15 Hz, max accumulated dt = 67 ms < 100 ms)
//   - Provably outside camera frustum (firing/sub/special/charge): 1 in 2 ticks (30 Hz, accumulated dt = 33 ms)
//   - Inside frustum & >= 14 m from camera: 1 in 2 ticks (30 Hz, accumulated dt = 33 ms)
//   - Inside frustum & < 14 m from camera (or onscreen combat): every tick (60 Hz)
//
// Root position and rotation are owned by Actor before Character.update is called,
// so locomotion remains smooth at 60 fps while skipped ticks accumulate dt cleanly.

import { inViewVolumeDistSq } from './offscreen-visual-budget.mjs';

const INSTALLED = Symbol.for('inkwave.local-quality.distance-offscreen-throttle.v1');
const FAR_DIST_SQ = 14 * 14;       // 14 meters
const OFFSCREEN_STRIDE = 4;        // 15 Hz
const OFFSCREEN_COMBAT_STRIDE = 2; // 30 Hz
const FAR_STRIDE = 2;              // 30 Hz

let nextSlot = 0;

function gameCamera(G) {
  return G?.rig?.gameCam || G?.camera || null;
}

/**
 * Returns the update stride (1 = full 60Hz, 2 = 30Hz far/offscreen-combat, 4 = 15Hz offscreen)
 * for this Character tick. Pure decision helper (no side effects).
 */
export function computeCharacterThrottleStride(ch, s, G) {
  if (!ch || !s || ch.s3DistanceThrottle === false) return 1;
  // Local player is always full 60 Hz.
  if (s.isLocal || ch.isLocal) return 1;
  if (G?.match?.local && s === G.match.local) return 1;
  // Only bots and remote replicas in live matches (never Practice Range, menus, showcase, or labs).
  if (s.isBot !== true && s.remote !== true) return 1;
  if (!G?.match || G.match.opts?.range || G.match.attract) return 1;
  if (G.match.state !== 'playing' || !Array.isArray(G.match.actors) || G.match.actors.length < 4) return 1;
  if (!ch.inWorld || !ch.rootInit) return 1;
  if (ch.lod && ch.lod.force >= 0) return 1;
  // Immediate full-rate on form swaps or death/respawn.
  if (s.alive === false || s.dead === true) return 1;
  if ((s.form || 'kid') !== ch.form) return 1;

  const distSq = inViewVolumeDistSq(ch, gameCamera(G));
  if (distSq === -2) return 1;
  const combatActive = !!(s.firing || s.subFiring || s.specialActive || (s.charge > 0.01));
  if (distSq === -1) return combatActive ? OFFSCREEN_COMBAT_STRIDE : OFFSCREEN_STRIDE;
  if (combatActive) return 1;
  if (distSq >= FAR_DIST_SQ) return FAR_STRIDE;
  return 1;
}

export function installDistanceOffscreenThrottle(api, G) {
  const proto = api?.Character?.prototype;
  if (!proto || Object.hasOwn(proto, INSTALLED)) return false;
  Object.defineProperty(proto, INSTALLED, { value: true });

  const nativeUpdate = proto.update;
  proto._dotDeferredDt = 0;
  proto._dotTick = 0;
  proto._dotSkipped = 0;

  proto.update = function _dotUpdate(dt, s) {
    if (this._dotSlot === undefined) this._dotSlot = nextSlot++;
    const tick = (this._dotTick = (this._dotTick + 1) | 0);
    const stride = computeCharacterThrottleStride(this, s, G);
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;

    if (stride > 1 && ((tick + this._dotSlot) % stride) !== 0 && (this._dotDeferredDt + safeDt) < 0.095) {
      this._dotDeferredDt += safeDt;
      this._dotSkipped++;
      return undefined;
    }

    const owed = this._dotDeferredDt;
    if (owed > 0) {
      this._dotDeferredDt = 0;
      dt = safeDt + owed;
      if (Number.isFinite(dt)) {
        let slices = 0;
        while (dt > 0.1 && slices < 31) {
          nativeUpdate.call(this, 0.1, s);
          dt -= 0.1;
          slices++;
        }
        if (dt > 0.1) {
          this._dotDeferredDt = dt - 0.1;
          dt = 0.1;
        }
      }
    }
    return nativeUpdate.call(this, dt, s);
  };
  return true;
}
