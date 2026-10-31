import * as THREE from 'three';
import { Physics, Hit } from '../../../src/game/physics.js';
import { Level } from '../../../src/world/level.js';

const ids = [], below = new THREE.Vector3(), above = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0), hit = new Hit();
// Exact existing numerical parallel test in Physics.raycast, not a rain range.
const RAY_PARALLEL = 1e-9;
const finiteVector = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
function knownBlock(b) {
  return b && finiteVector(b.center) && finiteVector(b.half) &&
    b.half.x >= 0 && b.half.y >= 0 && b.half.z >= 0 &&
    Array.isArray(b.axes) && b.axes.length === 3 && b.axes.every(finiteVector);
}
// Native slab entry is max(axis lower bounds). Its maximum over the whole
// sphere's XZ disc is analytic: max_k(lower_k(center) + r*|gradient_k|).
// A common exit above that maximum certifies every vertical column, not just
// sampled points. One lower plane must also put every body origin outside.
function separatesWholeSphere(block, shape, topY, physics) {
  const bodyTop = shape.pos.y + shape.r;
  if (!(bodyTop < topY)) return false;
  const dx = shape.pos.x - block.center.x, dz = shape.pos.z - block.center.z;
  let maxEntry = -Infinity, minExit = Infinity, separated = false;
  let criticalX = shape.pos.x, criticalZ = shape.pos.z;
  for (let k = 0; k < 3; k++) {
    const a = block.axes[k], half = k === 0 ? block.half.x : k === 1 ? block.half.y : block.half.z;
    const horizontal = Math.hypot(a.x, a.z);
    const offset = dx * a.x + dz * a.z - block.center.y * a.y;
    if (Math.abs(a.y) < RAY_PARALLEL) {
      // Native parallel rays test the origin, so cover the entire sphere,
      // including lower body points, not only a disc at bodyTop.
      const origin = offset + shape.pos.y * a.y;
      if (Math.abs(origin) + shape.r * Math.hypot(a.x, a.y, a.z) > half) return false;
      continue;
    }
    let lo = (-half - offset) / a.y, hi = (half - offset) / a.y;
    if (lo > hi) { const t = lo; lo = hi; hi = t; }
    const span = shape.r * horizontal / Math.abs(a.y);
    if (![lo, hi, span].every(Number.isFinite)) return false;
    if (lo - span > bodyTop) separated = true;
    if (lo + span > maxEntry) {
      maxEntry = lo + span;
      if (horizontal > 0) {
        const scale = -shape.r * Math.sign(a.y) / horizontal;
        criticalX = shape.pos.x + scale * a.x;
        criticalZ = shape.pos.z + scale * a.z;
      } else { criticalX = shape.pos.x; criticalZ = shape.pos.z; }
    }
    minExit = Math.min(minExit, hi - span);
  }
  if (!separated || !Number.isFinite(maxEntry) || !(maxEntry < minExit && maxEntry < topY)) return false;
  // Query the exact native owner at the analytically latest-entry column.
  // Nearest must be this certified block: otherwise an unrelated occluder
  // could make LOS false while this block lies in the native endpoint skin.
  // Calling existing LOS preserves its endpoint skin without a new cutoff.
  below.set(criticalX, bodyTop, criticalZ); above.set(criticalX, topY, criticalZ);
  physics.raycast(below, up, topY - bodyTop, hit, true);
  return hit.hit && hit.block === block.id && !physics.los(below, above);
}

// true certifies full cover; false/null retain existing rain. Deliberately
// bounded to native OBB Physics/Level, not triangle worlds or custom queries.
// This does not define a new rain height, weak-point rule or general LOS model.
export function bossRainFullyCovered(shapes, physics, bottomY, topY) {
  if (!Array.isArray(shapes) || !shapes.length || !Number.isFinite(bottomY) || !Number.isFinite(topY) || bottomY > topY ||
      !physics || Object.getPrototypeOf(physics) !== Physics.prototype || physics.raycast !== Physics.prototype.raycast || physics.los !== Physics.prototype.los) return null;
  const level = physics.level;
  if (!level || Object.getPrototypeOf(level) !== Level.prototype || level.queryBlocks !== Level.prototype.queryBlocks ||
      level._hxi !== Level.prototype._hxi || level._hzi !== Level.prototype._hzi ||
      level._nextQueryStamp !== Level.prototype._nextQueryStamp || !Array.isArray(level.blocks)) return null;
  let contacts = 0;
  for (const shape of shapes) {
    if (shape?.active === false) continue;
    if (shape?.active !== true || !finiteVector(shape.pos) || !Number.isFinite(shape.r) || shape.r < 0) return null;
    if (shape.pos.y + shape.r < bottomY || shape.pos.y - shape.r > topY) continue;
    contacts++;
    const p = shape.pos, r = shape.r;
    level.queryBlocks(p.x - r, p.z - r, p.x + r, p.z + r, ids);
    let whole = false;
    for (const id of ids) {
      const b = level.blocks[id];
      if (!b || !b.solid || b.grate) continue;
      if (b.id !== id || !knownBlock(b)) return null;
      if (separatesWholeSphere(b, shape, topY, physics)) { whole = true; break; }
    }
    if (!whole) return false;

  }
  return contacts > 0 ? true : null;
}
