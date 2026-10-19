// Presentation-only response to the requested size increase. Nintendo's
// Gachi King rule_step02_img_asari is a COMPOSITED explanatory illustration:
// its projected ratios (.38 small/.86 power per actor-height) are only a
// provisional readability target, not measurements of in-game dimensions.
// The available gameplay clip has occlusion/perspective; retail scale is open.
// Geometry, rule positions, pickup radii, launch speed and scoring are untouched.
export const CLAM_VISUAL_SCALE = Object.freeze({ small: 1.4, power: 1.2 });
export const CLAM_VISUAL_HALF_HEIGHT = Object.freeze({ small: .066 * 1.4, power: .255 * 1.2 });
export const CLAM_FRAGMENT_COUNT = 8;
export const CLAM_BREAK_VISUAL_SECONDS = .55;
const TAU = Math.PI * 2;
const unit = n => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

export function createClamPose(THREE) {
  const axis = new THREE.Vector3(1, 0, 0), direction = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  return (mesh, clam, drillDirection = null) => {
    const power = clam.kind === 'power';
    mesh.scale.setScalar(power ? CLAM_VISUAL_SCALE.power : CLAM_VISUAL_SCALE.small);
    const p = clam.pos;
    // Rule flight/contact positions are sphere centers; only resting clams
    // need their visual half-height lifted above the floor.
    mesh.position.set(p[0], p[1] + (clam.grounded !== false && !clam.drilling
      ? power ? CLAM_VISUAL_HALF_HEIGHT.power : CLAM_VISUAL_HALF_HEIGHT.small : 0), p[2]);
    const age = Number.isFinite(clam.age) ? Math.max(0, clam.age) : 0;
    const velocity = drillDirection || clam.velocity;
    if (clam.drilling || clam.grounded === false) {
      direction.set(velocity?.[0] || 0, velocity?.[1] || 0, velocity?.[2] || 0);
      if (direction.lengthSq() < 1e-10) direction.set(0, 0, 1);
      direction.normalize();
      // The football's long axis is local X. Flight and barrier drilling roll
      // around that axis, not around a global clock-driven yaw or screen Z.
      mesh.quaternion.setFromUnitVectors(axis, direction);
      spin.setFromAxisAngle(axis, age * (clam.drilling ? 24 : power ? 18 : 10));
      mesh.quaternion.multiply(spin);
    } else mesh.rotation.set(0, 0, 0);
    mesh.userData.clamPhase = clam.drilling ? 'drilling' : clam.grounded === false ? 'flight' : 'grounded';
  };
}

// A fixed one-draw, eight-segment shell. Repeated breaks only update matrices;
// no particles, timers, geometries or materials are allocated per event/frame.
// The effect follows the existing rule's closed -> open edge. Its .55s visual
// tail is a local readability choice, not a retail frame measurement.
export function createClamBarrier(THREE, color) {
  const geometry = new THREE.SphereGeometry(1.3, 4, 10, 0, TAU / CLAM_FRAGMENT_COUNT);
  const material = new THREE.MeshStandardMaterial({ color, transparent: true,
    opacity: .18, metalness: .05, roughness: .5, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  const mesh = new THREE.InstancedMesh(geometry, material, CLAM_FRAGMENT_COUNT);
  mesh.name = 'clam-barrier-shell';
  mesh.position.y = .8;
  mesh.frustumCulled = false; // bounded animated shards leave the closed sphere
  const transform = new THREE.Object3D();
  let initialized = false, wasOpen = false, wasDrilling = false, breakAge = Infinity;
  const update = (state = {}, dt = 0) => {
    const open = !!state.barrierOpen;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (initialized && !wasOpen && open) breakAge = 0;
    else if (Number.isFinite(breakAge)) breakAge += step;
    if (!open) breakAge = Infinity;
    const breaking = open && breakAge < CLAM_BREAK_VISUAL_SECONDS;
    if (initialized && !wasDrilling && !state.pendingBreak && !breaking && wasOpen === open) {
      mesh.visible = !open; mesh.userData.clamBarrierPhase = open ? 'open' : 'closed';
      material.opacity = .18; return;
    }
    const t = breaking ? unit(breakAge / CLAM_BREAK_VISUAL_SECONDS) : 0;
    const pending = state.pendingBreak;
    const drill = !!pending && !open;
    // Keep the authority's 1.2s pendingBreak untouched and use its remaining
    // value only to make contact feedback progress; no independent score timer.
    const progress = drill ? unit(1 - pending.remaining / 1.2) : 0;
    const pulse = drill ? Math.sin(progress * Math.PI * 12) * .018 * progress : 0;
    const spread = breaking ? .8 * t + .55 * t * t : 0;
    const shrink = breaking ? 1 - unit((t - .7) / .3) : 1;
    for (let i = 0; i < CLAM_FRAGMENT_COUNT; i++) {
      const yaw = i * TAU / CLAM_FRAGMENT_COUNT, middle = yaw + Math.PI / CLAM_FRAGMENT_COUNT;
      transform.position.set(-Math.cos(middle) * spread, breaking ? .4 * t - 1.1 * t * t : 0, Math.sin(middle) * spread);
      transform.rotation.set(breaking ? Math.sin(middle) * t * .9 : 0, yaw, breaking ? Math.cos(middle) * t * .9 : 0);
      transform.scale.setScalar((1 + pulse) * Math.max(.001, shrink));
      transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    material.opacity = breaking ? .65 * (1 - t) : drill ? .22 + .2 * progress : .18;
    mesh.visible = !open || breaking;
    mesh.userData.clamBarrierPhase = breaking ? 'breaking' : open ? 'open' : drill ? 'drilling' : 'closed';
    mesh.userData.breakProgress = t;
    initialized = true; wasOpen = open; wasDrilling = drill;
  };
  update(); initialized = false;
  return { mesh, update };
}
