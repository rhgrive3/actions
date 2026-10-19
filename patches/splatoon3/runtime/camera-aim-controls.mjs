import * as THREE from 'three';

// Engineering corrections, not a claim that the retail camera solver has been
// recovered. See reports/camera-aim-controls-2026-10-11.md for source confidence.
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp01 = n => Math.max(0, Math.min(1, finite(n)));
const D2R = Math.PI / 180;
const dir = new THREE.Vector3(), origin = new THREE.Vector3();
const right = new THREE.Vector3(), up = new THREE.Vector3(), front = new THREE.Vector3();
const shift = new THREE.Vector3(), rotation = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const lensHit = { hit: false, dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3() };
const muzzleHit = { hit: false, dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3() };
const corners = [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]];

/** Exact integral of an exponentially filtered, constant input over one step.
 * Returns displacement in input-seconds and updates state[axis]. No allocation.
 * The 60/s filter and response curve are existing INKWAVE tuning, not extracted
 * Nintendo constants. Unlike endpoint * dt, this has the semigroup property.
 */
export function integrateLookAxis(state, axis, target, dt, rate = 60) {
  if (!(Number.isFinite(dt) && dt > 0)) return 0;
  target = Math.max(-1, Math.min(1, finite(target)));
  const old = finite(state[axis]);
  if (!(Number.isFinite(rate) && rate > 0)) { state[axis] = target; return target * dt; }
  const k = -Math.expm1(-rate * dt);
  state[axis] = old + (target - old) * k;
  return target * dt + (old - target) * k / rate;
}

export function isScopedCharger(weapon) {
  if ((weapon?.behaviorKind || weapon?.kind) !== 'charger') return false;
  return weapon.scopedCharge === true || weapon.catalogRecord?.parameters?.WeaponScopeParam != null;
}

/** Sparse-table presence is a capability, even when the override object is {}.
 * E-liter Scope's 20 degree CameraFovy is explicit in the pinned 11.3.0 table.
 * Splatterscope's override object is empty, i.e. the class default: Inkipedia's
 * Splatoon 3 Data section (citing Leanny's 11.x parameter database) gives
 * 28.0 degrees, and the same page set gives 20.0 for E-liter, matching the
 * pinned raw value. See reports/inkwave-splatoon3-behavior-2026-10-02.md.
 */
export const SCOPE_DEFAULT_CAMERA_FOVY = 28;
export function scopeVerticalFov(weapon) {
  const source = weapon?.catalogRecord?.parameters?.WeaponScopeParam?.CameraFovy;
  const value = Number.isFinite(source) ? source : weapon?.scopeFov;
  return Number.isFinite(value) && value >= 5 && value <= 55 ? value : SCOPE_DEFAULT_CAMERA_FOVY;
}
/** The rig's un-zoomed vertical FOV (its Hor+ 16:9 reference), in degrees. */
export function rigVerticalBaseFov(rig) {
  const h = finite(rig?.baseFov, 82) * Math.PI / 360;
  return 2 * Math.atan(Math.tan(h) / (16 / 9)) * 180 / Math.PI;
}

export function updateScopeZoom(rig, actor, dt) {
  const active = actor?.alive !== false && actor.form !== 'squid' && isScopedCharger(actor.weapon);
  // An unscoped weapon must never inherit the preceding weapon's zoom tail.
  if (!active) { rig.zoom = 0; rig.scopeCharge = 0; rig.scopeFullZoom = 0; if (rig.target === actor) syncScopeOverlay(0); return 0; }
  const charge = actor.weaponRunner?.charging ? clamp01(actor.weaponRunner.charge) : 0;
  rig.scopeCharge = charge;
  // Wiki scope descriptions: zoom begins after half charge. The smoothing
  // curve/time constant remain INKWAVE tuning, not measured retail timing.
  const zoomCharge = clamp01((charge - .5) * 2);
  const envelope = zoomCharge * zoomCharge * (3 - 2 * zoomCharge);
  // Full zoom lands exactly on CameraFovy whatever the player's FOV setting
  // (cameraRig: fov = base + (kick - zoom) * 0.8). The old fixed 55 degree base
  // overshot by the setting difference.
  const fullZoom = Math.max(0, rigVerticalBaseFov(rig) - scopeVerticalFov(actor.weapon)) / 0.8;
  const target = fullZoom * envelope;
  const k = -Math.expm1(-8 * Math.max(0, finite(dt)));
  rig.zoom = finite(rig.zoom) + (target - finite(rig.zoom)) * k;
  rig.scopeFullZoom = fullZoom;
  syncScopeOverlay(scopeOverlayStrength(rig, fullZoom));
  return charge;
}

/** The boom's collision result is a hard bound, never an allowed penetration. */
export function enforceBoomClearance(boom, hard) {
  hard = Math.max(0, finite(hard));
  if (boom.x > hard) { boom.x = hard; boom.v = Math.min(0, finite(boom.v)); }
  const minimum = Math.min(0.45, hard);
  if (boom.x < minimum) { boom.x = minimum; boom.v = Math.max(0, finite(boom.v)); }
  return boom.x;
}

/** Sweep the centre and the four visible near-plane corners after ALL follow
 * translations, mode blending and shake. Soft outer boom probes alone cannot
 * guarantee that a shifted lens remains outside geometry. Return clamps only
 * inward; the existing boom spring still controls the outward recovery.
 * Five rays, pooled scratch storage; no per-frame heap allocation.
 */
export function constrainCameraLens(rig, physics, referenceFov) {
  // The scope rim belongs to the follow camera's zoom only (map, death, spectate).
  if (rig.mode !== 'follow' || !rig.target) syncScopeOverlay(0);
  if (rig.mode !== 'follow' || !rig.target || !physics?.raycast) return;
  const cam = rig.camera, pivot = rig.pivot;
  dir.copy(cam.position).sub(pivot);
  const length = dir.length();
  if (!(Number.isFinite(length) && length > 1e-7)) return;
  dir.multiplyScalar(1 / length);
  const near = Math.max(0.001, finite(cam.near, 0.15));
  const hh = near * Math.tan(Math.max(5, Math.min(120, finite(referenceFov, 55))) * D2R / 2);
  const hw = hh * 16 / 9; // visible battle frame, excluding the black crop
  right.set(1, 0, 0).applyQuaternion(cam.quaternion);
  up.set(0, 1, 0).applyQuaternion(cam.quaternion);
  front.set(0, 0, -1).applyQuaternion(cam.quaternion);
  let safe = length;
  for (let i = 0; i < corners.length; i++) {
    origin.copy(pivot);
    if (i) origin.addScaledVector(right, corners[i][0] * hw)
      .addScaledVector(up, corners[i][1] * hh).addScaledVector(front, near);
    const h = physics.raycast(origin, dir, length + 0.02, lensHit, true);
    if (h?.hit && Number.isFinite(h.dist)) safe = Math.min(safe, Math.max(0, h.dist - 0.02));
  }
  if (safe < length) cam.position.copy(pivot).addScaledVector(dir, safe);
  rig.cameraClearanceCorrection = length - safe;
}

function aimBase(q, yaw, pitch) {
  return q.setFromEuler(euler.set(finite(pitch), finite(yaw) + Math.PI, 0, 'YXZ'));
}

/** Record the rendering pose BEFORE map diorama changes, including recoil. */
export function recordAimPose(rig) {
  let frame = rig._s3AimFrame;
  if (!frame) frame = rig._s3AimFrame = { pivot: new THREE.Vector3(), actorPos: new THREE.Vector3(),
    inverseBase: new THREE.Quaternion(), target: null };
  frame.pivot.copy(rig.pivot);
  if (rig.target?.pos) frame.actorPos.copy(rig.target.pos);
  frame.target = rig.target;
  aimBase(frame.inverseBase, rig.yaw, rig.pitch).invert();
}

/** Bring the most recent optical pose to the CURRENT simulation input without
 * stepping the follow/recoil springs twice or modifying the rendered camera.
 * Catch-up ticks at 30Hz therefore do not keep firing down an old camera ray.
 * Mouse/touch displacement is still consumed once by the fixed-clock owner.
 */
export function simulationAimCamera(controller, physics = null) {
  const rig = controller.rig, actor = controller.a, source = rig?.gameCam || rig?.camera;
  if (!source || rig.mode !== 'follow' || rig.target !== actor || actor.alive === false) return source;
  const frame = rig._s3AimFrame;
  if (!frame || frame.target !== actor) return source;
  const cam = rig._s3SimulationAimCam || (rig._s3SimulationAimCam = new THREE.PerspectiveCamera());
  aimBase(rotation, rig.yaw, rig.pitch).multiply(frame.inverseBase);
  shift.copy(actor.pos).sub(frame.actorPos);
  cam.position.copy(source.position).sub(frame.pivot).applyQuaternion(rotation).add(frame.pivot).add(shift);
  cam.quaternion.copy(rotation).multiply(source.quaternion);
  cam.fov = source.fov; cam.aspect = source.aspect; cam.near = source.near; cam.far = source.far;
  cam.projectionMatrix.copy(source.projectionMatrix);
  cam.projectionMatrixInverse.copy(source.projectionMatrixInverse);
  if (physics && (shift.lengthSq() > 1e-20 || rotation.x * rotation.x + rotation.y * rotation.y + rotation.z * rotation.z > 1e-20)) {
    // A same-tick turn can put the rotated optical origin through a wall even
    // before the next rendered follow step. Keep that origin collision-safe too.
    const lens = rig._s3SimulationLensRig || (rig._s3SimulationLensRig = {
      mode: 'follow', camera: cam, pivot: new THREE.Vector3(), target: actor
    });
    lens.target = actor; lens.pivot.copy(frame.pivot).add(shift);
    constrainCameraLens(lens, physics, rig.camera?.userData?.s3ReferenceVerticalFov ?? source.fov);
  }
  cam.updateMatrixWorld(true);
  return cam;
}

/** Clamp even the fallback muzzle to the actor side of a nearby solid surface.
 * A blocked animation muzzle must not teleport 0.3m through a thin wall.
 */
export function constrainMuzzle(physics, anchor, out) {
  if (!physics?.raycast) return out;
  dir.copy(out).sub(anchor);
  const length = dir.length();
  if (!(Number.isFinite(length) && length > 1e-7)) return out;
  dir.multiplyScalar(1 / length);
  const h = physics.raycast(anchor, dir, length, muzzleHit, true);
  if (h?.hit && Number.isFinite(h.dist)) out.copy(anchor).addScaledVector(dir, Math.max(0, h.dist - 0.02));
  return out;
}

// Scope rim shown while a scoped Charger zooms (owner report 2026-10-18: the
// rim was missing). Presentation only. Its strength follows the same charge
// envelope as the CameraFovy zoom (scoped view from 50% charge, full at 100%).
// The rim's radius, width and darkness are INKWAVE calibration: no Nintendo
// layout value for the scope frame is available, so they are not source data.

export const SCOPE_RIM = Object.freeze({ clear: 0.43, edge: 0.47, outside: 0.78, edgeAlpha: 0.62, outsideAlpha: 0.82 });
let element = null, shown = -1, frameKey = '';
// Same centred 16:9 battle frame as battle-framing.mjs battleFrame (kept local:
// this module's importers are pinned by input-composition fixtures).
function scopeFrame(width, height) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  const fw = Math.min(w, h * 16 / 9), fh = fw * 9 / 16;
  return { x: (w - fw) / 2, y: (h - fh) / 2, width: fw, height: fh };
}

/** Strength 0..1 of the scope rim for a camera rig and its current zoom. */
export function scopeOverlayStrength(rig, fullZoom) {
  if (!rig || rig.mode !== 'follow' || !rig.target?.isLocal || !(fullZoom > 0) || rig.mapOpen || rig.mapK > 1e-4) return 0;
  const z = Number.isFinite(rig.zoom) ? rig.zoom : 0;
  return Math.max(0, Math.min(1, z / fullZoom));
}

export function syncScopeOverlay(strength) {
  const doc = globalThis.document;
  if (!doc?.body) return;
  const s = Math.round(Math.max(0, Math.min(1, Number.isFinite(strength) ? strength : 0)) * 100) / 100;
  if (!element) {
    if (s <= 0) return;
    element = doc.createElement('div');
    element.id = 's3-scope-rim';
    element.setAttribute('aria-hidden', 'true');
    Object.assign(element.style, { position: 'fixed', pointerEvents: 'none', zIndex: '1', opacity: '0', left: '0', top: '0', width: '0', height: '0' });
    doc.body.appendChild(element);
  }
  const f = scopeFrame(globalThis.innerWidth, globalThis.innerHeight);
  const key = Math.round(f.x) + ',' + Math.round(f.y) + ',' + Math.round(f.width) + ',' + Math.round(f.height);
  if (key !== frameKey) {
    frameKey = key;
    const r = SCOPE_RIM, h = f.height;
    Object.assign(element.style, { left: f.x + 'px', top: f.y + 'px', width: f.width + 'px', height: f.height + 'px',
      background: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) ${(r.clear * h).toFixed(1)}px, rgba(0,0,0,${r.edgeAlpha}) ${(r.edge * h).toFixed(1)}px, rgba(0,0,0,${r.outsideAlpha}) ${(r.outside * h).toFixed(1)}px)` });
  }
  if (s !== shown) { shown = s; element.style.opacity = String(s); element.style.visibility = s > 0 ? 'visible' : 'hidden'; }
}
