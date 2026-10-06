// S3 ShotGuideFrame aiming guide — #769 (Heavy Splatling) and #459 (Splattershot).
//
// The pinned Ver. 11.3.0 WeaponParam.ShotGuideFrame was already mirrored in
// profile.json's weaponsFidelityCompletion table (shooter 8, splatling 11) but
// never reached the live weapon profile, so nothing downstream could consume it
// and the reticle stayed on the generic screen-centre anchor.
//
// Rules this module keeps:
//  * The live `shotGuideFrame` value must equal the pinned source value, or the
//    install fails closed. The field is promoted, not invented.
//  * The guide is a pure dry prediction. It reuses the installed projectile
//    motion law (advanceFidelityProjectile + the installed move record) and the
//    installed muzzle/aim/launch-speed law, advances exactly ShotGuideFrame
//    fixed 60 Hz steps, and consumes no random draw. There is no second
//    projectile engine and no spread sample.
//  * Authoritative state is untouched: camera aim, aimPoint, onTarget, inRange,
//    launch direction, damage, trajectory and the PRNG stream are not modified.
//    The guide never steers a projectile toward a screen point.
import { advanceFidelityProjectile, fidelityMoveFor, splatlingLaunchSpeed } from './weapons-fidelity.mjs';

const HZ = 60;
// Screen inset used when a guide point leaves the viewport. This mirrors the
// existing ally-marker clamp in main.js; it is an INKWAVE presentation choice
// and is not claimed as an unpublished Nintendo screen-pixel value.
const EDGE_MARGIN = 40;

let api;

export function shotGuideFrames(weapon) {
  const frames = weapon?.shotGuideFrame;
  return Number.isInteger(frames) && frames > 0 ? frames : null;
}

function scratch() {
  return api._shotGuide || (api._shotGuide = {
    muzzle: new api.THREE.Vector3(), dir: new api.THREE.Vector3(), projected: new api.THREE.Vector3(),
    probe: {
      pos: new api.THREE.Vector3(), prev: new api.THREE.Vector3(), vel: new api.THREE.Vector3(),
      age: 0, life: 1, straight: 0, grav: 0, drag: 0, fidelityMove: null, fidelityPhase: 0, fidelityPrevAge: 0,
    },
    state: { x: 0, y: 0, z: 0, frames: 0 },
  });
}

// Deterministic no-spread launch state for one weapon, exactly as the installed
// launch path would build it before the random cone is applied.
function launchState(actor, weapon, out) {
  const projectiles = api.G.projectiles;
  const probe = out.probe, runner = actor.weaponRunner;
  const charge = runner?.fidelitySplatlingCharge ?? runner?.charge ?? 0;
  projectiles._muzzle(actor, out.muzzle);
  // _aimFrom is the installed launch direction law. _ballistic is already the
  // installed identity (gravity acts on the bullet), and _spread is skipped on
  // purpose: the guide point is not a sampled bullet.
  projectiles._aimFrom(actor, out.muzzle, out.dir);
  const speed = weapon.kind === 'splatling' ? splatlingLaunchSpeed(weapon, charge) : weapon.projSpeed;
  if (!Number.isFinite(speed) || speed <= 0) return null;
  const move = fidelityMoveFor(weapon);
  probe.pos.copy(out.muzzle); probe.prev.copy(out.muzzle);
  probe.vel.copy(out.dir).multiplyScalar(speed);
  probe.age = 0; probe.fidelityPhase = 0; probe.fidelityPrevAge = 0;
  probe.straight = weapon.straightTime; probe.grav = weapon.referenceGravity;
  probe.drag = move ? move.freeDrag * HZ : 0;
  probe.fidelityMove = move;
  // Exactly the requested age, so the installed lifetime clamp never truncates
  // the guide short of ShotGuideFrame.
  probe.life = Number.MAX_SAFE_INTEGER;
  return probe;
}

// World point the weapon's own projectile passes through after ShotGuideFrame
// fixed steps. Returns the shared state object, or null when the weapon has no
// guide frame / no installed launch path.
export function computeShotGuide(actor) {
  const s = scratch(), weapon = actor?.weapon, frames = shotGuideFrames(weapon);
  s.state.frames = 0;
  if (frames === null || !api.G.projectiles) return null;
  const probe = launchState(actor, weapon, s);
  if (!probe) return null;
  for (let i = 0; i < frames; i++) advanceFidelityProjectile(probe, 1 / HZ);
  s.state.x = probe.pos.x; s.state.y = probe.pos.y; s.state.z = probe.pos.z; s.state.frames = frames;
  return s.state;
}

// Called from the installed camera aim path. Writes the HUD-only guide state on
// the controller; the authoritative aim fields are not read back or changed.
export function updateShotGuide(controller) {
  if (!controller) return null;
  controller.shotGuide = controller.enabled ? computeShotGuide(controller.a) : null;
  return controller.shotGuide;
}

// World point -> screen pixels for the HUD only. Behind-camera and off-viewport
// results are clamped to the viewport edge so the guide stays reachable.
export function projectShotGuide(state, camera, width, height) {
  if (!state || !camera || !(width > 0) || !(height > 0)) return null;
  const s = scratch();
  s.projected.set(state.x, state.y, state.z).project(camera);
  if (!Number.isFinite(s.projected.x) || !Number.isFinite(s.projected.y)) return null;
  let x = (s.projected.x * 0.5 + 0.5) * width, y = (-s.projected.y * 0.5 + 0.5) * height;
  if (s.projected.z > 1) { x = width - x; y = height - y; }
  const clamp = (v, limit) => Math.min(limit - EDGE_MARGIN, Math.max(EDGE_MARGIN, v));
  return { x: clamp(x, width), y: clamp(y, height), frames: state.frames };
}

// HUD reticle placement, relative to the screen-centre anchor the reticle already
// uses. Weapons without a guide frame (and frames without a projected point) keep
// the existing centre placement untouched.
export function applyShotGuide(hud, projected, width, height) {
  const ret = hud?.ret;
  if (!ret) return null;
  const x = projected && width > 0 ? projected.x - width / 2 : 0;
  const y = projected && height > 0 ? projected.y - height / 2 : 0;
  const L = hud._L || (hud._L = {});
  const key = `${x.toFixed(1)}|${y.toFixed(1)}`;
  if (L.guideKey !== key) { L.guideKey = key; ret.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`; }
  return L.guideKey;
}

export function installShotGuide(context, profile) {
  api = context;
  const completion = profile.weaponsFidelityCompletion;
  if (!completion || completion.schema !== 1) throw new Error('Missing completion source table');
  // Promoted live field must agree with the pinned 11.3.0 source, per weapon.
  for (const [id, weapon] of Object.entries(context.WEAPONS)) {
    const live = weapon.shotGuideFrame;
    if (live == null) continue;
    if (!Number.isInteger(live) || live <= 0) throw new RangeError(`INKWAVE shot guide: ${id} shotGuideFrame must be a positive integer`);
    const pinned = completion.weapons[id]?.WeaponParam?.ShotGuideFrame;
    if (live !== pinned) throw new Error(`INKWAVE shot guide: ${id} live shotGuideFrame ${live} does not match pinned source ${pinned}`);
  }
}
