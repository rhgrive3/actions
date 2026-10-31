// Presentation only. Does not change projectile spread, hit tests, range, or clocks.
// Measurements are from original gameplay captures, not extracted Nintendo UI
// constants. At 720p, allow ~1px error (up to ~2px for normalized 432p clips).
// Family half-extents are sampled baseline views; native pitch/depth dependence
// is not fully measured. Callers may supply a better projected half-extent.
// Hot/shape/jump: https://note.com/eleonor/n/n7394e3178ba0
// 1080p cross-check: https://note.com/brave_zinnia1853/n/nced0fa32e3de
// Family clips: https://game8.jp/splatoon3/{478574,478575,480099,480100,480107,528247}

const REFERENCE_WIDTH = 1280, REFERENCE_HEIGHT = 720;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
const bounded = (value, low, high) => Math.max(low, Math.min(high, value));
const DEG = Math.PI / 180;
const FIXED = Object.freeze({
  tickLength: 14, tickWidth: 3,
  cameraRingRadius: 13, cameraRingWidth: 1.5, idleDotRadius: 2,
  impactRingRadius: 12.5, impactRingWidth: 2, impactInkOuterRadius: 17,
  impactDotRadius: 3, directCrossInner: 7, directCrossOuter: 26,
});

function profile(id, sourceActor, halfExtent, measured = true, fallbackFrom = null) {
  return Object.freeze({ id, sourceActor, halfExtent, measured, fallbackFrom });
}

export const BLASTER_RETICLE_PROFILES = Object.freeze({
  hot: profile('hot', 'WeaponBlasterMiddle', 24.2),
  luna: profile('luna', 'WeaponBlasterShort', 28.5),
  range: profile('range', 'WeaponBlasterLong', 20),
  clash: profile('clash', 'WeaponBlasterLightShort', 26),
  rapid: profile('rapid', 'WeaponBlasterLight', 18.7),
  // No original-resolution Elite measurement yet. Explicit sibling fallback.
  rapid_elite: profile('rapid_elite', 'WeaponBlasterLightLong', 18.7, false, 'rapid'),
  sblast: profile('sblast', 'WeaponBlasterPrecision', 19.1),
});

export const BLASTER_RETICLE_CALIBRATION = Object.freeze({
  referenceWidth: REFERENCE_WIDTH, referenceHeight: REFERENCE_HEIGHT,
  metrics: FIXED,
  provenance: 'gameplay-image-calibration', nativeLayoutConstantsVerified: false,
  // The no-Action-Intensity Hot sample has 44.8px horizontal and 23.7px vertical
  // half-extents. Its exact recovery frame is unknown. This is a display curve,
  // not a claim that Nintendo maps 10 degrees to this exact screen displacement.
  jumpSampleDegrees: 10, jumpExtraHalfWidth: 20.6,
  jumpCurveVerified: false,
});

// The same 1280x720 Game8 setup before/after 5.1.0, both at 10 AP, measures
// halfX=50.46/45.87, halfY=28.02/28.14, gray-circle r=23, white-dot r=3.
// The published 8-degree cone and .5/.625 action curves give 5.576/4.43983
// degrees at 10 AP. halfX=28.1+229*tan(angle) fits both within .1px.
// This is a measured short-mode calibration; it is not the ground fallback.
// Later damage-radius changes do not themselves establish a HUD size change.
// https://img.game8.jp/8887897/8e34d5fc98549e6488596d390214348a.jpeg/original
// https://img.game8.jp/8887902/00bc84d232ea126670a4056e963d8e39.jpeg/original
export const BLASTER_RETICLE_SBLAST_SHORT = Object.freeze({
  halfExtent: 28.1, cameraRingRadius: 23, idleDotRadius: 3,
  spreadTangentScale: 229, measured: true, referenceVersion: '5.1.0',
  currentVersionPixelParityVerified: false,
});

const UNKNOWN_PROFILE = profile('hot', null, BLASTER_RETICLE_PROFILES.hot.halfExtent, false, 'hot');

const ACTORS = new Map(Object.values(BLASTER_RETICLE_PROFILES).map(p => [p.sourceActor, p]));
const IDS = new Map([
  ['blaster', 'hot'], ['s3-blaster-short', 'luna'], ['s3-blaster-long', 'range'],
  ['s3-blaster-lightshort', 'clash'], ['s3-blaster-light', 'rapid'],
  ['s3-blaster-lightlong', 'rapid_elite'], ['s3-blaster-precision', 'sblast'],
]);
const SOURCE_STEMS = new Map([
  ['Middle', 'hot'], ['Short', 'luna'], ['Long', 'range'],
  ['LightShort', 'clash'], ['Light', 'rapid'], ['LightLong', 'rapid_elite'],
  ['Precision', 'sblast'],
]);

/** Accept a live weapon, its catalogRecord, a sourceActor, or a known weapon ID. */
export function blasterReticleProfile(weapon, sourceActor) {
  const record = weapon?.catalogRecord || weapon;
  const actor = sourceActor || record?.sourceActor || record?.sourceMainActor;
  if (ACTORS.has(actor)) return ACTORS.get(actor);
  const id = typeof record === 'string' ? record : record?.id;
  if (ACTORS.has(id)) return ACTORS.get(id);
  if (Object.hasOwn(BLASTER_RETICLE_PROFILES, id || '')) return BLASTER_RETICLE_PROFILES[id];
  if (IDS.has(id)) return BLASTER_RETICLE_PROFILES[IDS.get(id)];
  const stem = typeof id === 'string' && /^Blaster_(Middle|Short|Long|LightShort|Light|LightLong|Precision)(?:_[A-Za-z0-9]+)*$/.exec(id);
  if (stem) return BLASTER_RETICLE_PROFILES[SOURCE_STEMS.get(stem[1])];
  return UNKNOWN_PROFILE;
}

/** CSS viewport units, independent of devicePixelRatio or drawing-buffer size. */
export function blasterReticleScale(width, height) {
  return Math.min(positive(width, REFERENCE_WIDTH) / REFERENCE_WIDTH,
    positive(height, REFERENCE_HEIGHT) / REFERENCE_HEIGHT);
}

/** Read the existing live angular envelope; never infer a jump from !grounded. */
export function blasterReticleSpread720(spreadDeg) {
  const degrees = bounded(finite(spreadDeg, 0), 0, 45);
  return BLASTER_RETICLE_CALIBRATION.jumpExtraHalfWidth *
    Math.tan(degrees * DEG) / Math.tan(BLASTER_RETICLE_CALIBRATION.jumpSampleDegrees * DEG);
}

/**
 * All points (camera, guide, anchor) are absolute CSS viewport pixels.
 * `anchor` is the existing DOM reticle origin; default is viewport center.
 * If applyShotGuide already translates the whole reticle, pass anchor: guide.
 * `camera` names the gray aiming mark for API compatibility; it is not a claim
 * that Nintendo fixes that mark at viewport center. Captures show it displaced
 * by different amounts with camera/player state. Supply the firing owner's
 * unoccluded aiming-point projection when available. Viewport center is only
 * the safe missing-input fallback. The impact mark follows `guide` separately.
 * `spreadDeg` is WeaponRunner.spread; `spreadHalfWidth720` is an optional
 * independently measured display override. Neither input changes gameplay.
 * `halfExtent720` optionally replaces the image-calibrated family baseline.
 * Reuse `out` on the render loop. No frame clock or CSS interpolation is added.
 */
export function blasterReticleView(input = {}, out = {}) {
  const width = positive(input.viewportWidth, REFERENCE_WIDTH);
  const height = positive(input.viewportHeight, REFERENCE_HEIGHT);
  const scale = blasterReticleScale(width, height);
  const p = blasterReticleProfile(input.weapon, input.sourceActor);
  const shortMode = p.id === 'sblast' &&
    (input.mode === 'air' || input.mode === 'short' || input.mode === 'blaster-jump');
  const half = positive(input.halfExtent720, shortMode ? BLASTER_RETICLE_SBLAST_SHORT.halfExtent : p.halfExtent);
  const extra = Number.isFinite(input.spreadHalfWidth720)
    ? Math.max(0, input.spreadHalfWidth720)
    : shortMode ? BLASTER_RETICLE_SBLAST_SHORT.spreadTangentScale *
      Math.tan(bounded(finite(input.spreadDeg, 0), 0, 45) * DEG)
      : blasterReticleSpread720(input.spreadDeg);
  const centerX = width / 2, centerY = height / 2;
  const anchorX = finite(input.anchor?.x, centerX), anchorY = finite(input.anchor?.y, centerY);
  const cameraX = finite(input.camera?.x, centerX), cameraY = finite(input.camera?.y, centerY);
  const guideX = finite(input.guide?.x, cameraX), guideY = finite(input.guide?.y, cameraY);
  const inRange = input.inRange !== false;
  const target = inRange && (input.onTarget === 'enemy' || input.onTarget === true);
  out.profile = p.id;
  out.mode = shortMode ? 'short' : 'normal';
  out.scale = scale;
  out.halfX = half + extra;
  out.halfY = half;
  out.cameraX = (cameraX - anchorX) / scale;
  out.cameraY = (cameraY - anchorY) / scale;
  out.impactX = (guideX - anchorX) / scale;
  out.impactY = (guideY - anchorY) / scale;
  out.showTicks = !target;
  out.showImpact = inRange;
  out.showDirect = target;
  out.showIdleDot = !inRange;
  out.cameraRingRadius = shortMode ? BLASTER_RETICLE_SBLAST_SHORT.cameraRingRadius : FIXED.cameraRingRadius;
  out.idleDotRadius = shortMode ? BLASTER_RETICLE_SBLAST_SHORT.idleDotRadius : FIXED.idleDotRadius;
  out.baselineMeasured = p.measured;
  out.baselineFallback = p.fallbackFrom;
  out.referenceVersion = shortMode ? BLASTER_RETICLE_SBLAST_SHORT.referenceVersion : 'multiple-captures';
  return out;
}

// Append this after the legacy HUD stylesheet. It disables the old bloom/target
// enlargement for blasters only; the separate hit/kill marker remains available.
// A distinct SVG class prevents legacy .iw-ret__svg circle/path styles from
// silently replacing these measured widths or scaling the whole jump marker.
export const BLASTER_RETICLE_CSS = `
.iw-xh .iw-ret.iw-ret--blaster {
  scale: 1; rotate: none; animation: none; transition: none; opacity: 1;
  transform: scale(var(--iw-blaster-scale, 1)); transform-origin: 0 0;
  filter: drop-shadow(0 0 .7px rgba(0,0,0,.9));
}
.iw-blaster-reticle {
  position: absolute; left: -40px; top: -40px; width: 80px; height: 80px;
  overflow: visible; pointer-events: none;
}
`;

const q = (FIXED.tickLength / (2 * Math.SQRT2)).toFixed(4);
const tangentPositive = `M-${q},-${q}L${q},${q}`;
const tangentNegative = `M-${q},${q}L${q},-${q}`;
const cross = `M-26,-26L-7,-7M26,-26L7,-7M-26,26L-7,7M26,26L7,7`;

/** Static, trusted markup. Team color inherits --self, never enemy red. */
export function blasterReticleMarkup() {
  return `<svg class="iw-blaster-reticle" viewBox="-40 -40 80 80" aria-hidden="true" fill="none">
  <g data-blaster="camera">
    <circle data-blaster="camera-ring" r="13" stroke="#b7b7b7" stroke-width="1.5" opacity=".75"/>
    <circle data-blaster="idle" r="2" fill="#fff"/>
    <g data-blaster="ticks" stroke="#fff" stroke-width="3" stroke-linecap="butt">
      <path data-blaster="nw" d="${tangentNegative}"/>
      <path data-blaster="ne" d="${tangentPositive}"/>
      <path data-blaster="sw" d="${tangentPositive}"/>
      <path data-blaster="se" d="${tangentNegative}"/>
    </g>
  </g>
  <g data-blaster="impact">
    <g data-blaster="direct" stroke-linecap="butt">
      <path d="${cross}" stroke="var(--self, #7040ff)" stroke-width="3"/>
      <path d="${cross}" stroke="#fff" stroke-width="1"/>
    </g>
    <circle r="15" stroke="var(--self, #7040ff)" stroke-width="4"/>
    <circle r="12.5" stroke="#fff" stroke-width="2"/>
    <circle r="3" fill="#fff"/>
  </g>
</svg>`;
}

const NODES = new WeakMap();
const KEYS = ['camera', 'camera-ring', 'idle', 'ticks', 'nw', 'ne', 'sw', 'se', 'impact', 'direct'];
const numeric = value => String(Math.round(value * 1000) / 1000);
const translation = (x, y) => `translate(${numeric(x)} ${numeric(y)})`;

/** Call after assigning blasterReticleMarkup() to the reticle's innerHTML. */
export function bindBlasterReticle(reticle) {
  if (!reticle?.querySelector) return null;
  NODES.delete(reticle);
  const nodes = { root: reticle, view: {}, previous: {} };
  for (const key of KEYS) {
    nodes[key] = reticle.querySelector(`[data-blaster="${key}"]`);
    if (!nodes[key]) return null;
  }
  NODES.set(reticle, nodes);
  return nodes;
}

function attribute(nodes, key, name, value) {
  const cache = key + '.' + name;
  if (nodes.previous[cache] === value) return;
  nodes.previous[cache] = value;
  nodes[key].setAttribute(name, value);
}

/**
 * Cheap frame update: cached nodes and only changed attributes are written.
 * Rebind explicitly whenever _buildReticle replaces innerHTML.
 * Returns null if this is not a mounted blaster; never replaces other markup.
 */
export function updateBlasterReticle(reticle, input) {
  if (!reticle) return null;
  let nodes = NODES.get(reticle);
  if (!nodes || !reticle.contains(nodes.camera)) nodes = bindBlasterReticle(reticle);
  if (!nodes) return null;
  const view = blasterReticleView(input, nodes.view);
  const scale = String(view.scale);
  if (nodes.previous.scale !== scale) {
    nodes.previous.scale = scale;
    reticle.style.setProperty('--iw-blaster-scale', scale);
  }
  attribute(nodes, 'camera', 'transform', translation(view.cameraX, view.cameraY));
  attribute(nodes, 'camera-ring', 'r', String(view.cameraRingRadius));
  attribute(nodes, 'idle', 'r', String(view.idleDotRadius));
  attribute(nodes, 'impact', 'transform', translation(view.impactX, view.impactY));
  attribute(nodes, 'nw', 'transform', translation(-view.halfX, -view.halfY));
  attribute(nodes, 'ne', 'transform', translation(view.halfX, -view.halfY));
  attribute(nodes, 'sw', 'transform', translation(-view.halfX, view.halfY));
  attribute(nodes, 'se', 'transform', translation(view.halfX, view.halfY));
  attribute(nodes, 'ticks', 'display', view.showTicks ? 'inline' : 'none');
  attribute(nodes, 'impact', 'display', view.showImpact ? 'inline' : 'none');
  attribute(nodes, 'direct', 'display', view.showDirect ? 'inline' : 'none');
  attribute(nodes, 'idle', 'display', view.showIdleDot ? 'inline' : 'none');
  return view;
}
