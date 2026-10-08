// Offscreen (frustum-culled) Character visual budget — issue #845.
//
// Native `Character.update(dt, s)` only treats a kid as drawn when the scene
// graph says so:
//
//   const shown = this.root.visible && (!this.root.parent || this.root.parent.visible !== false);
//   if (this.kidScale > 0.001 && shown) { this._updateFeet(dt, s); this._buildPose(dt, s); this._applyPose(dt, s); }
//
// Being outside the camera frustum does not change `root.visible`, so three.js
// skips the draw while INKWAVE still runs the full procedural path every
// simulation tick — foot-IK `_ground()` physics raycasts, `_buildPose()` and
// `_applyPose()` (which owns the hair spring integration).
//
// Validated against the actual native source (inkwave-public/src/game/character.js):
//   * `_camHook` (installed on `S.list[0]` of every LOD tier set) is an
//     `onBeforeRender` hook that records `this._camFrame = renderer.info.render.frame`
//     only when this Character's mesh is really submitted for drawing.
//   * `renderer.info.render.frame` on `G.renderer` is the matching current frame
//     counter, so "not drawn for N renderer frames" is an objective signal and
//     not a scene-graph `visible` check.
//   * `Character.update(dt, s)` receives the **Actor** as `s`
//     (Actor._finishFrame -> `ch.update(dt, this)`), so owner detection reads
//     `s.isLocal`.
//   * `_ground(x, z, n)` returns `root.position.y` with an upward normal whenever
//     `this.phys` is unset. That native fallback is reused verbatim for the
//     budgeted tick, so the physics raycast disappears without inventing a height.
//   * The not-drawn branch of native `update()` invalidates exactly
//     `feetValid / headInit / _headSet`; replaying that on the return-to-view
//     tick is what makes the first visible frame replant and re-init.
//
// Rendering-only: nothing here writes an authoritative Actor field. Movement,
// weapons, hitboxes, ink, damage, networking and bot AI keep their fixed
// simulation; only the visual recomputation for pixels nobody is drawing is
// deferred, and it is always caught up before the next draw.
//
// No Nintendo timing value is invented: the grace below is counted in
// *renderer frames* (a presentation cadence owned by this layer), not in any
// gameplay frame budget.

const INSTALLED = Symbol.for('inkwave.local-quality.offscreen-visual-budget.v1');
const CHAINED = Symbol.for('inkwave.local-quality.offscreen-visual-budget.render-hook.v1');

/** Renderer frames a Character may go undrawn before its visual work is budgeted. */
export const GRACE_FRAMES = 2;

/** Budgeted only after this many consecutive "outside the view volume" verdicts. */
export const OUTSIDE_STREAK = 2;

/**
 * Conservative bound around the kid, larger than the native LOD mesh bound
 * (`new THREE.Sphere(new THREE.Vector3(0, 0.75, 0), 1.3)`). Our view-volume
 * test must report "outside" only where the renderer's own per-mesh test is
 * outside too, so the budget switches off *before* the mesh can be drawn.
 */
const CENTER_Y = 1.0;
const REACH = 3.0;

const DEG = Math.PI / 180;

/** Sphere margin projected onto a plane with gradient magnitude `g`. */
const R_MARGIN = (r, g) => r * Math.sqrt(1 + g * g);

/**
 * Conservative frustum membership for a Character under `cam`.
 * Returns `true` (may be drawn), `false` (provably outside) or `null` when no
 * usable perspective camera exists — `null` always means "full rate".
 *
 * Plain math on purpose: this layer must stay loadable without a `three`
 * dependency, and the test only reads the camera's own projection parameters
 * and world matrix.
 */
export function inViewVolume(ch, cam) {
  if (!ch?.root || !cam || cam.isPerspectiveCamera !== true) return null;
  // Shifted/offset views change the projection in ways this test does not model.
  if (cam.view && cam.view.enabled) return null;
  // `matrixWorld` is only a rigid camera transform when the camera has no parent.
  if (cam.parent) return null;
  const fov = cam.fov, aspect = cam.aspect, near = cam.near, far = cam.far;
  if (!Number.isFinite(fov) || !Number.isFinite(aspect) || aspect <= 0) return null;
  if (!Number.isFinite(near) || !Number.isFinite(far)) return null;
  if (!(near > 0) || !(far > near)) return null;
  // three.js scales the frustum by `zoom` and shifts it sideways by `filmOffset`
  // (both live on the camera itself). A projection we do not model must never be
  // reported "provably outside", because `zoom < 1` / a positive `filmOffset`
  // makes the real frustum *larger* than the plain-fov one computed below — that
  // is exactly the unsafe-culling direction. `null` keeps the actor full rate.
  if (cam.zoom !== undefined && cam.zoom !== 1) return null;
  if (cam.filmOffset !== undefined && cam.filmOffset !== 0) return null;
  if (typeof cam.updateMatrixWorld === 'function') cam.updateMatrixWorld();
  const e = cam.matrixWorld?.elements;
  if (!e || e.length < 16) return null;

  // world position of the kid (root may sit under an identity scene transform)
  const p = ch.root.position;
  if (!p || !Number.isFinite(p.x + p.y + p.z)) return null;
  let wx = p.x, wy = p.y, wz = p.z;
  const parent = ch.root.parent, m = parent?.matrixWorld?.elements;
  if (m && m.length >= 16) {
    wx = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
    wy = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
    wz = m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14];
  }

  // world -> view (rigid camera: view = R^T * (w - t), columns of R are e[0..2],
  // e[4..6], e[8..10]; translation is e[12..14])
  const dx = wx - e[12], dy = wy - e[13], dz = wz - e[14];
  const vx = dx * e[0] + dy * e[1] + dz * e[2];
  const vy = dx * e[4] + dy * e[5] + dz * e[6];
  const vz = dx * e[8] + dy * e[9] + dz * e[10];
  const d = -vz;                              // view depth, positive in front

  const t = Math.tan(fov * 0.5 * DEG);        // vertical half-tangent
  const k = t * aspect;                       // horizontal half-tangent
  const side = R_MARGIN(REACH, k), vert = R_MARGIN(REACH, t);
  // Side planes pass through the eye: f = vx - d*k, |grad| = sqrt(1 + k^2).
  // The sphere is entirely outside only when the centre distance exceeds REACH.
  if (vx - d * k > side) return false;
  if (-vx - d * k > side) return false;
  if (vy - d * t > vert) return false;
  if (-vy - d * t > vert) return false;
  if (d < near - REACH) return false;         // behind the near plane
  if (d > far + REACH) return false;          // beyond the far plane
  return true;
}

function gameCamera(G) {
  return G?.rig?.gameCam || G?.camera || null;
}

/**
 * Finish the presentation a budgeted tick deferred, **before this Character is
 * actually submitted for drawing**.
 *
 * `main.js::_frame` runs `m.update(dt)` *before* `this.rig.update(dt)`, so the
 * budget decision always reads the previous frame's camera while the render that
 * follows already uses the freshly-turned one. A previously off-screen actor can
 * therefore become visible on a tick whose decision still said "budgeted", and
 * its `_buildPose` / `_applyPose` were skipped for that frame.
 *
 * `S.list[0].onBeforeRender` (the same mesh hook the native `_camHook` hangs on)
 * fires with the final camera of the frame and *before* the draw call, so this
 * is the one place that can still catch up in time. It replays exactly what the
 * native not-drawn branch replants and then runs exactly the two calls the
 * budget suppressed, so the first visible frame has coherent pose, feet and hair.
 *
 * Idempotent: `_ovbWasBudgeted` is cleared, so shadow/main/multi-part passes all
 * do the work at most once per budgeted tick, and only when something was
 * actually deferred.
 */
export function catchUpBeforeVisible(ch) {
  if (!ch || !ch._ovbWasBudgeted) return false;
  const dt = ch._ovbLastDt, s = ch._ovbLastActor;
  if (!(dt > 0)) { ch._ovbWasBudgeted = false; return false; }
  if (!ch.inWorld) { ch._ovbWasBudgeted = false; return false; }
  ch._ovbBudget = false;                 // un-guard the native methods for this call only
  // exactly the invalidation `Character.update` applies on its not-drawn branch
  ch.feetValid = false;
  ch.headInit = false;
  ch._headSet = false;
  if (ch.kidScale > 0.001 && typeof ch._buildPose === 'function') {
    // the return-to-view frame: replant feet, rebuild and write the pose
    if (typeof ch._updateFeet === 'function') ch._updateFeet(dt, s);
    ch._buildPose(dt, s);
    if (typeof ch._applyPose === 'function') ch._applyPose(dt, s);
  }
  ch._ovbWasBudgeted = false;
  ch._ovbCatchUps = (ch._ovbCatchUps || 0) + 1;
  return true;
}

/** Chain the pre-submission catch-up onto a tier set's first mesh (once). */
function chainRenderCatchup(ch, S) {
  const m = S && S.list && S.list[0];
  if (!m || m[CHAINED]) return;
  m[CHAINED] = true;
  const inner = m.onBeforeRender;
  m.onBeforeRender = function ovbRenderHook(renderer, scene, camera, geometry, material, group) {
    catchUpBeforeVisible(ch);
    if (typeof inner === 'function') return inner.call(this, renderer, scene, camera, geometry, material, group);
  };
}

/**
 * Decide whether this Character's visual recomputation may be budgeted.
 * Pure and side-effect free apart from the per-Character streak counter, so the
 * decision itself is directly testable.
 * @returns {boolean}
 */
export function offscreenBudgeted(ch, s, G) {
  if (!ch || !s) return false;
  // Any reason to stay at full rate also restarts the outside streak, so the
  // budget can only start from two uninterrupted "outside" verdicts.
  const reset = () => { ch._ovbOutsideStreak = 0; return false; };
  // Owner / local actor is always full rate: death camera, super-jump target,
  // spectate and imminent first-person visibility all live here.
  if (s.isLocal || ch.isLocal) return reset();
  if (G?.match?.local && s === G.match.local) return reset();
  // Practice Range is isolated from this presentation budget.
  if (G?.match?.opts?.range) return reset();
  // Only characters in the live match scene. Menus, showcase portraits, labs and
  // audits render through other cameras and are left alone.
  if (!ch.inWorld) return reset();
  if (ch.lod && ch.lod.force >= 0) return reset();
  // Objective draw signal: `_camFrame` is written by the native `_camHook`
  // (onBeforeRender). Before the first real draw we cannot tell "culled" from
  // "hook not installed", so we stay at full rate.
  const last = ch._camFrame;
  if (!Number.isFinite(last) || last < 0) return reset();
  const frame = G?.renderer?.info?.render?.frame;
  if (Number.isFinite(frame) && frame - last < GRACE_FRAMES) return reset();
  const inside = inViewVolume(ch, gameCamera(G));
  if (inside === null) return reset();         // unknown camera -> full rate
  if (inside) return reset();
  // Consecutive outside verdicts under different camera poses: main.js runs
  // `rig.update(dt)` *after* `match.update(dt)`, so the camera that will draw
  // this frame is only known one frame late. Two verdicts plus the oversized
  // REACH bound keep the budget off until the actor is safely off-screen.
  const streak = (ch._ovbOutsideStreak || 0) + 1;
  ch._ovbOutsideStreak = streak;
  return streak >= OUTSIDE_STREAK;
}

/**
 * Install the budget on the composed Character prototype.
 * @param {{Character: Function}} api composed patch api (same shape as installQuality)
 * @param {object} G                  shared game context (renderer / rig / match)
 * @returns {boolean} whether the wrapper was installed by this call
 */
export function installOffscreenVisualBudget(api, G) {
  const proto = api?.Character?.prototype;
  if (!proto || Object.hasOwn(proto, INSTALLED)) return false;
  Object.defineProperty(proto, INSTALLED, { value: true });

  const nativeUpdate = proto.update;
  const nativeBuildPose = proto._buildPose;
  const nativeApplyPose = proto._applyPose;
  const nativeGround = proto._ground;

  // Observability for the focused tests; no behaviour depends on these.
  proto._ovbBudget = false;
  proto._ovbTicks = 0;
  proto._ovbBudgetTicks = 0;
  proto._ovbRaycastsSkipped = 0;
  proto._ovbPoseSkips = 0;
  proto._ovbWasBudgeted = false;
  proto._ovbOutsideStreak = 0;
  proto._ovbCatchUps = 0;
  proto._ovbLastDt = 0;
  proto._ovbLastActor = null;

  // 0) Pre-submission catch-up. `_tierSet` builds the body meshes once per tier
  //    per Character and is where the native `_camHook` is chained onto
  //    `S.list[0].onBeforeRender`, so it is the one place we can reliably hook
  //    the actual "about to be drawn" moment with the frame's final camera.
  const nativeTierSet = proto._tierSet;
  if (nativeTierSet) {
    proto._tierSet = function _ovbTierSet(...args) {
      const set = nativeTierSet.apply(this, args);
      try { chainRenderCatchup(this, set); } catch { /* never break mesh building */ }
      return set;
    };
  }

  // 1) Foot-IK ground query: reuse the native no-physics fallback instead of the
  //    `phys.raycast`. Only reachable while a budgeted tick is running.
  proto._ground = function _ovbGround(x, z, n) {
    if (this._ovbBudget) {
      this._ovbRaycastsSkipped++;
      if (n) n.set(0, 1, 0);
      return this.root.position.y;
    }
    return nativeGround.call(this, x, z, n);
  };

  // 2) Pose rebuild + hair integration: the CPU bulk. Skipped only while the
  //    actor cannot be drawn this frame.
  if (nativeBuildPose) {
    proto._buildPose = function _ovbBuildPose(...args) {
      if (this._ovbBudget) { this._ovbPoseSkips++; return undefined; }
      return nativeBuildPose.apply(this, args);
    };
  }
  if (nativeApplyPose) {
    proto._applyPose = function _ovbApplyPose(...args) {
      if (this._ovbBudget) { this._ovbPoseSkips++; return undefined; }
      return nativeApplyPose.apply(this, args);
    };
  }

  proto.update = function _ovbUpdate(dt, s) {
    const budget = offscreenBudgeted(this, s, G);
    const returning = !budget && this._ovbWasBudgeted;
    this._ovbWasBudgeted = budget;
    this._ovbBudget = budget;
    this._ovbTicks++;
    // remembered so the pre-submission catch-up can replay the deferred work
    // with this tick's own dt / Actor even though `_ovbBudget` is cleared below.
    this._ovbLastDt = dt;
    this._ovbLastActor = s;
    if (budget) this._ovbBudgetTicks++;
    if (returning) {
      // Exactly the invalidation native `Character.update` applies on its own
      // not-drawn branch, replayed one tick earlier so the first visible frame
      // replants the feet and re-inits head/hair history — no stale pose, no
      // foot teleport, no explosive hair when the actor re-enters the frustum.
      this.feetValid = false;
      this.headInit = false;
      this._headSet = false;
    }
    try {
      return nativeUpdate.call(this, dt, s);
    } finally {
      this._ovbBudget = false;
    }
  };
  return true;
}
