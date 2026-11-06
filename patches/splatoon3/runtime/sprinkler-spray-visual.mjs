// Sprinkler spray: presentation only (owner request 2026-11-05: the drops paint
// and damage correctly but are almost invisible).
//
// Each logical drop that kit-sprinkler.mjs emits (owner and replica alike) gets
// one cosmetic FX droplet launched from the same nozzle point with the same
// initial velocity and the same gravity, so the visible arc follows the drop
// that actually paints / damages. The FX droplet never paints (no F_PAINT) and
// never touches st.drops, contacts, damage, network or the paint map; its
// landing is the FX pool's own transient ripple / ring / beads.
//
// Variation without new random state: a satellite micro-droplet and the
// nozzle mist use the drop's existing deterministic seed (hash), so direction
// and speed vary per drop and per spray while Math.random is not consumed by
// the decision itself.
//
// Budget (iPad mini 6): only within `nearDistance` of the camera; satellites
// scale with the FX quality factor; at most 3 + 3 + 1 sprites per spray
// (phase 0 cadence 4F -> <= 105 spawns/s per Sprinkler, FX lifetime ~1 s).
// The Splatoon 3 look is a thin fan of small ink drops from the spinning head;
// sizes and counts here are INKWAVE choices, not extracted values.
export const SPRINKLER_SPRAY_VISUAL = Object.freeze({
  nearDistance: 38,
  size: .075, satelliteSize: .034, life: 1.15, stretch: 1.7,
  // FX gravity is 17 u/s^2 times this scale; the logical drop uses 24.
  baseFxGravity: 17,
  satelliteChance: .55, satelliteSpeed: [.72, .95], satelliteSpread: .9,
  mistEvery: 2, mistSize: .17, mistAlpha: .2,
});

function hash01(seed, salt) {
  let n = Math.imul((Math.floor(seed * 4294967296) ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0, 0x85ebca6b) >>> 0;
  n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35) >>> 0; n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}

const _vel = { x: 0, y: 0, z: 0 }, _pos = { x: 0, y: 0, z: 0 };

/**
 * Cosmetic spray for one emitted drop. Returns the number of FX sprites asked
 * for (0 when skipped). `drop` is { pos, vel, seed } as kit-sprinkler pushes it.
 */
export function sprinklerSprayVisual(G, bomb, drop, spec, arm, sequence) {
  const fx = G?.fx, V = SPRINKLER_SPRAY_VISUAL;
  if (!fx || typeof fx.drop !== 'function' || !drop?.pos || !drop?.vel) return 0;
  if (typeof fx._near === 'function' && !fx._near(drop.pos, V.nearDistance)) return 0;
  const color = G.teamColors?.[bomb?.team];
  if (!color) return 0;
  const gravityScale = (Number.isFinite(spec?.dropletGravity) ? spec.dropletGravity : 24) / V.baseFxGravity;
  let spawned = 0;
  fx.drop(drop.pos, drop.vel, color, { size: V.size, life: V.life, gravity: gravityScale, stretch: V.stretch });
  spawned++;
  const seed = Number.isFinite(drop.seed) ? drop.seed : .5;
  const quality = Number.isFinite(fx.q) ? Math.max(0, Math.min(1, fx.q)) : 1;
  if (hash01(seed, 1) < V.satelliteChance * quality) {
    const [lo, hi] = V.satelliteSpeed, k = lo + (hi - lo) * hash01(seed, 2);
    _vel.x = drop.vel.x * k + (hash01(seed, 3) - .5) * 2 * V.satelliteSpread;
    _vel.y = drop.vel.y * k + (hash01(seed, 4) - .5) * V.satelliteSpread;
    _vel.z = drop.vel.z * k + (hash01(seed, 5) - .5) * 2 * V.satelliteSpread;
    fx.drop(drop.pos, _vel, color, { size: V.satelliteSize, life: V.life * .8, gravity: gravityScale, stretch: 1.3, quiet: true });
    spawned++;
  }
  if (arm === 0 && sequence % V.mistEvery === 0 && typeof fx.mist === 'function') {
    _pos.x = drop.pos.x; _pos.y = drop.pos.y; _pos.z = drop.pos.z;
    _vel.x = drop.vel.x * .12; _vel.y = drop.vel.y * .12; _vel.z = drop.vel.z * .12;
    fx.mist(_pos, _vel, color, V.mistSize, V.mistAlpha);
    spawned++;
  }
  return spawned;
}
