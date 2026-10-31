// Presentation for the per-weapon predictors. It never emits a projectile or
// advances the live world. The predictors own flight, contacts and termination;
// this layer only samples their polyline and marks a confirmed end position.
import { selectedSubReadyCost } from './sub-ready.mjs';
export const THROW_PREVIEW_INTERVAL = 1 / 30;
const INSTALL = Symbol.for('inkwave.s3.throw-prediction.v1');
const STATE = Symbol('inkwave.s3.throw-prediction.state');
const finite3 = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const UNKNOWN_END = new Set(['not-applicable', 'unsupported', 'target-dependent', 'out-of-bounds', 'timeout', 'horizon',
  'range-end', 'intercepted', 'invalid-placement', 'no-contact', 'action-dependent', 'unresolved', 'unavailable', 'lost', 'expired', 'hook-miss']);

function matchAllowsPreview(G) {
  const m = G?.match;
  if (!m) return true;
  if (m.paused || m.attract) return false;
  return !!m.range || m.state === 'playing' || m.playing?.() === true;
}

function releaseMarkers(system) {
  for (const marker of system._s3ThrowExtraMarkers || []) marker.removeFromParent();
  if (system._s3ThrowExtraMarkers) system._s3ThrowExtraMarkers.length = 0;
}

function releaseLines(system) {
  for (const line of system._s3ThrowExtraLines || []) {
    line.removeFromParent();
    // Each secondary trajectory owns its buffer, but shares the native material.
    line.geometry.dispose();
  }
  if (system._s3ThrowExtraLines) system._s3ThrowExtraLines.length = 0;
}

function hide(system, invalidate = true) {
  if (system.arcLine) system.arcLine.visible = false;
  if (system.arcRing) system.arcRing.visible = false;
  for (const marker of system._s3ThrowExtraMarkers || []) marker.visible = false;
  for (const line of system._s3ThrowExtraLines || []) line.visible = false;
  if (invalidate) {
    delete system[STATE];
    system._s3ThrowPrediction = null;
  }
}

// Discrete input/state changes invalidate immediately. Continuous movement,
// aiming and world contacts refresh on the bounded 30 Hz presentation clock.
// A stationary player still refreshes: platforms, targets and devices can move.
function readKey(actor, G, show, system) {
  const s = actor.specialActive, r = actor.weaponRunner, v = actor.vel, p = actor.pos;
  const specialState = actor._s3AllSpecialState;
  return {
    actor, physics: G.physics, level: G.level, match: G.match, net: G.netm,
    weapon: actor.weapon, sub: actor.weapon?.sub, special: s?.id, token: s,
    life: finite(actor.netLife), netLife: finite(actor.net?.lastLife),
    phase: s?.phase, statePhase: specialState?.phase, throwAt: specialState?.throwAt,
    markerQueued: specialState?.markerQueued, shots: specialState?.shots,
    subInput: !!actor.intent?.sub, squidInput: !!actor.intent?.squid,
    grounded: actor.grounded, form: actor.form,
    subPower: finite(actor.s3?.abilityPoints?.subPower),
    specialPower: finite(actor.s3?.abilityPoints?.specialPower),
    // Holding can cross a charge threshold without changing position or aim.
    hold: finite(r?.s3SubHold), charge: finite(actor._s3AllSpecialState?.charge),
    subChargeKey: s ? null : system.s3SubPredictionChargeKey?.(actor, { anticipateRelease: true }),
    show: !!show, px: p.x, py: p.y, pz: p.z,
    yaw: finite(actor.aimYaw), pitch: finite(actor.aimPitch),
    vx: finite(v?.x), vy: finite(v?.y), vz: finite(v?.z),
  };
}

function needsRefresh(previous, current, now, lastTime) {
  if (!previous || !Number.isFinite(lastTime) || now < lastTime || now - lastTime >= THROW_PREVIEW_INTERVAL - 1e-9) return true;
  for (const key of ['actor', 'physics', 'level', 'match', 'net', 'weapon', 'sub', 'special', 'token', 'life', 'netLife',
    'phase', 'statePhase', 'throwAt', 'markerQueued', 'shots', 'subInput', 'squidInput', 'subChargeKey',
    'grounded', 'form', 'subPower', 'specialPower', 'show']) if (previous[key] !== current[key]) return true;
  const dx = current.px - previous.px, dy = current.py - previous.py, dz = current.pz - previous.pz;
  const aim = Math.abs(Math.atan2(Math.sin(current.yaw - previous.yaw), Math.cos(current.yaw - previous.yaw)))
    + Math.abs(current.pitch - previous.pitch);
  return dx * dx + dy * dy + dz * dz > .25 || aim > .12
    || Math.abs(current.vy - previous.vy) > 4
    || current.hold < previous.hold
    || (previous.charge < 1) !== (current.charge < 1);
}

export function confirmedThrowEndpoint(prediction) {
  return !!prediction && prediction.complete === true && prediction.targetDependent !== true
    && !UNKNOWN_END.has(prediction.outcome) && finite3(prediction.endpoint);
}

function orientMarker(marker, point, normal, scratch, time) {
  scratch.normal.set(0, 1, 0);
  if (finite3(normal) && normal.x * normal.x + normal.y * normal.y + normal.z * normal.z > 1e-12)
    scratch.normal.copy(normal).normalize();
  // The endpoint is already the live projectile/contact center. Do not project
  // it onto a floor: that moves wall/air explosions onto unrelated storeys.
  marker.position.copy(point).addScaledVector(scratch.normal, .015);
  marker.quaternion.setFromUnitVectors(scratch.up, scratch.normal);
  marker.scale.setScalar(1 + Math.sin(time * 8) * .06);
}

// Spend the fixed vertex budget on bends, bounces and the arc apex. Uniform
// time samples can omit a wall contact and draw a shortcut through the wall.
const polylineWorkspaces = new WeakMap();
function newPolylineWorkspace() { return { indices: [], segments: [], records: [], used: 0 }; }
function addPolylineSegment(points, work, first, last) {
    if (last - first < 2) return;
    const a = points[first], b = points[last], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const length2 = dx * dx + dy * dy + dz * dz;
    let error = -1, at = Math.floor((first + last) / 2);
    for (let i = first + 1; i < last; i++) {
      const p = points[i], x = p.x - a.x, y = p.y - a.y, z = p.z - a.z;
      const t = length2 > 1e-20 ? Math.max(0, Math.min(1, (x * dx + y * dy + z * dz) / length2)) : 0;
      const ex = x - t * dx, ey = y - t * dy, ez = z - t * dz, e = ex * ex + ey * ey + ez * ez;
      if (e > error + 1e-12) { error = e; at = i; }
    }
    if (error < 1e-12) at = Math.floor((first + last) / 2);
    const record = work.records[work.used] ||= {};
    work.used++; record.first=first; record.last=last; record.at=at; record.error=error;
    work.segments.push(record);
}
function polylineIndices(points, budget, work = newPolylineWorkspace()) {
  const indices=work.indices, segments=work.segments;
  indices.length=segments.length=0; work.used=0;
  if (points.length <= budget) {
    indices.length=points.length;
    for(let i=0;i<points.length;i++) { if(i in points)indices[i]=i; else delete indices[i]; }
    return indices;
  }
  if (budget < 2) { indices.push(points.length - 1); return indices; }
  indices.push(0, points.length - 1);
  addPolylineSegment(points, work, 0, points.length - 1);
  while (indices.length < budget && segments.length) {
    let best = 0;
    for (let i = 1; i < segments.length; i++) {
      const s = segments[i], b = segments[best];
      if (s.error > b.error + 1e-12 || Math.abs(s.error - b.error) <= 1e-12 && s.last - s.first > b.last - b.first) best = i;
    }
    const s = segments[best];
    for(let i=best+1;i<segments.length;i++)segments[i-1]=segments[i];
    segments.length--; indices.push(s.at);
    addPolylineSegment(points, work, s.first, s.at); addPolylineSegment(points, work, s.at, s.last);
  }
  return indices.sort((a, b) => a - b);
}

function writePolyline(geometry, points, endpoint) {
  const position = geometry.attributes.position, distance = geometry.attributes.lineDistance;
  let leases=polylineWorkspaces.get(geometry);
  if(!leases){leases={depth:0,frames:[]};polylineWorkspaces.set(geometry,leases);}
  const depth=leases.depth++, work=leases.frames[depth] ||= newPolylineWorkspace();
  try {
  const indices = polylineIndices(points, Math.min(position.count, distance.count), work);
  let length = 0;
  for (let i = 0; i < indices.length; i++) {
    const p = i === indices.length - 1 && endpoint ? endpoint : points[indices[i]];
    position.setXYZ(i, p.x, p.y, p.z);
    if (i) {
      const j = i * position.itemSize, a = position.array;
      length += Math.hypot(a[j] - a[j - position.itemSize], a[j + 1] - a[j - position.itemSize + 1], a[j + 2] - a[j - position.itemSize + 2]);
    }
    distance.setX(i, length);
  }
  position.clearUpdateRanges(); position.addUpdateRange(0, indices.length * position.itemSize); position.needsUpdate = true;
  distance.clearUpdateRanges(); distance.addUpdateRange(0, indices.length); distance.needsUpdate = true;
  geometry.setDrawRange(0, indices.length);
  return indices.length;
  } finally {
    // Numeric segment/index records cannot retain prediction actors or vectors.
    work.indices.length=work.segments.length=0; leases.depth--;
  }
}

export function drawThrowPrediction(system, actor, prediction, api, updateGeometry = true) {
  const { THREE, G } = api;
  const geometry = system.arcGeo, line = system.arcLine, ring = system.arcRing;
  if (!geometry?.attributes?.position || !geometry.attributes.lineDistance || !line || !ring) return false;
  // Super Chump already owns a distinct area target and twelve landing
  // reticles in its special VFX. Keep one presentation owner for that pattern.
  if (prediction?.presentationOwner === 'special-vfx') { hide(system, false); return true; }
  const points = prediction?.points;
  if (!Array.isArray(points) || updateGeometry && points.some(p => !finite3(p))) {
    hide(system, false); return false;
  }
  const scratch = system._s3ThrowDrawScratch ||= {
    up: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(), gray: new THREE.Color(.6, .6, .6),
  };
  if (updateGeometry) writePolyline(geometry, points, confirmedThrowEndpoint(prediction) ? prediction.endpoint : null);
  const count = geometry.drawRange.count;
  const cost = Number.isFinite(prediction.inkCost) ? prediction.inkCost
    : api.SUB?.bomb ? selectedSubReadyCost(actor, api.SUB) : undefined;
  const color = !actor.specialActive && Number.isFinite(cost) && actor.ink + 1e-10 < cost ? scratch.gray : actor.color || scratch.gray;
  line.material.color.copy(color).multiplyScalar(1.4);
  ring.material.color.copy(color).multiplyScalar(1.4);
  line.material.opacity = prediction.targetDependent || prediction.complete === false ? .55 : .95;
  line.visible = count > 1; line.frustumCulled = false;
  ring.visible = confirmedThrowEndpoint(prediction) && prediction.outcome !== 'landing-pattern';
  const now = finite(G.time);
  if (ring.visible) orientMarker(ring, prediction.endpoint, prediction.normal, scratch, now);
  const lines = system._s3ThrowExtraLines ||= [];
  const branches = prediction.trajectories || [];
  let lineCount = 0;
  for (let i = 1; i < branches.length && lineCount < 15; i++) {
    const branch = branches[i], path = branch.points;
    if (!Array.isArray(path) || path.length < 2 || updateGeometry && path.some(p => !finite3(p))) continue;
    let extra = lines[lineCount];
    if (!extra) {
      extra = line.clone(); extra.geometry = geometry.clone(); extra.frustumCulled = false;
      lines.push(extra); (line.parent || system.scene)?.add(extra);
    }
    if (updateGeometry) writePolyline(extra.geometry, path, branch.complete && finite3(branch.endpoint) ? branch.endpoint : null);
    extra.visible = true; lineCount++;
  }
  for (let i = lineCount; i < lines.length; i++) lines[i].visible = false;
  const markers = system._s3ThrowExtraMarkers ||= [];
  const blasts = prediction.explosions || [];
  let used = 0;
  for (const blast of blasts) {
    // A multi-part special can have known fist/landing positions even when its
    // player's future movement is unknown. Only confirmed parts receive rings.
    if (blast.complete !== true && (blast.complete === false || !confirmedThrowEndpoint(prediction))) continue;
    const p = blast.point || blast.position || blast;
    if (!finite3(p) || used >= 15) continue;
    if (ring.visible && p.x === prediction.endpoint.x && p.y === prediction.endpoint.y && p.z === prediction.endpoint.z) continue;
    let marker = markers[used];
    if (!marker) {
      // Share immutable geometry/material with the existing ring. Clear removes
      // these meshes; never dispose the shared geometry from an extra marker.
      marker = ring.clone(); markers.push(marker);
      (ring.parent || system.scene)?.add(marker);
    }
    orientMarker(marker, p, blast.normal || prediction.normal, scratch, now);
    marker.visible = true; used++;
  }
  for (let i = used; i < markers.length; i++) markers[i].visible = false;
  return true;
}

export function installThrowPrediction(api) {
  const { Projectiles, G } = api;
  if (!Projectiles?.prototype?.updateArc || Object.hasOwn(Projectiles.prototype, INSTALL)) return;
  const nativeArc = Projectiles.prototype.updateArc, nativeClear = Projectiles.prototype.clear;
  // Keep the exact pre-forecast native preview as a stable compatibility
  // owner. Legacy 30Hz/cache/contact oracles exercise this fallback, while
  // the public updateArc continues to use the shared current forecast.
  const preservedNativeArc=Projectiles.prototype[Symbol.for('inkwave.s3.arc-preview-performance.wrapper.v1')] || nativeArc;
  Object.defineProperty(Projectiles.prototype,Symbol.for('inkwave.s3.throw-prediction.native-arc.v1'),
    { value:preservedNativeArc, configurable:false, writable:false });
  Projectiles.prototype.s3PredictThrowTrajectory = function(actor, options = {}) {
    if (!actor?.alive || !finite3(actor.pos)) return null;
    if (options.category !== 'sub' && (actor.specialActive || options.category === 'special')) {
      const special = this.s3PredictSpecialTrajectory?.(actor, { ...options, activeOnly: options.activeOnly ?? !options.id });
      if (special && special.outcome !== 'not-applicable') return special;
      if (options.category === 'special') return special || null;
      // An active special owns the controls; the equipped sub is not its guide.
      if (actor.specialActive) return null;
    }
    return this.s3PredictSubTrajectory?.(actor, options) || null;
  };
  Projectiles.prototype.updateArc = function(actor, show) {
    if (!actor?.alive || actor.remote || !finite3(actor.pos) || !matchAllowsPreview(G)
      || (!show && !actor.specialActive)) {
      hide(this); return;
    }
    // Read the same readiness owner on every rendered frame. A committed throw
    // or a roll transition must disappear immediately, without retracing flight.
    if (actor.specialActive && this.s3CanPredictSpecialTrajectory?.(actor) === false) {
      hide(this); return;
    }
    const now = finite(G.time), key = readKey(actor, G, show, this);
    let state = this[STATE];
    let refreshed = false;
    if (!state || needsRefresh(state.key, key, now, state.time)) {
      const points = this._s3ThrowPointPool ||= [];
      const prediction = this.s3PredictThrowTrajectory(actor, { activeOnly: true, anticipateRelease: true, maxTime: 12, points });
      if (!prediction) {
        hide(this);
        // Compatibility for a third-party sub with no registered predictor.
        // A known special without an aim phase never falls through to a bomb.
        if (show && !actor.specialActive && typeof this.s3PredictSubTrajectory !== 'function')
          return nativeArc.call(this, actor, show);
        return;
      }
      state = { key, time: now, prediction };
      this[STATE] = state;
      this._s3ThrowPrediction = prediction;
      refreshed = true;
    }
    drawThrowPrediction(this, actor, state.prediction, api, refreshed);
  };
  Projectiles.prototype.clear = function(...args) {
    hide(this); releaseMarkers(this); releaseLines(this);
    this._s3ThrowDrawScratch = null;
    this._s3ThrowPointPool = null;
    return nativeClear?.apply(this, args);
  };
  Object.defineProperty(Projectiles.prototype, INSTALL, { value: true });
}
