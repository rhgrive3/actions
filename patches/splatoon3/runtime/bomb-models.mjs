// Per-sub bomb models (presentation only).
//
// Upstream draws every thrown bomb as one sphere + cylinder cap and holds one
// round bulb in the hand, so a Suction Bomb and a Curling Bomb read as the
// same object as a Splat Bomb. The models below follow the Splatoon 3 sub
// weapon icons (Inkipedia "S3 Weapon Sub Splat/Suction/Curling Bomb.png") and
// the series' own descriptions (Inkipedia Splat/Suction/Curling Bomb pages):
//   Splat Bomb   : "purple [supports] with green and pink caps" forming a
//                  pyramid; "inside the pyramid is a bag that is filled with
//                  the user's ink", held by "loops ... around the supports";
//                  S3 "look[s] identical to ... Splatoon 2". Vertex up.
//   Suction Bomb : "a can of spray paint, but with a black suction cup
//                  connected to the nozzle"; "the can matches the user's ink
//                  color, and the small dots change color too"; "two white
//                  dots with black dots inside of them, representing eyes";
//                  the icon adds chrome rims at the can's top and bottom and
//                  a dome-shaped cup. "The base ... flashes repeatedly just
//                  before it explodes".
//   Curling Bomb : "a short black cylinder with a gray handle on top and
//                  panels on the side that change color" (the icon: separate
//                  raised panels split by dark posts, a bent pipe handle with
//                  an ink-coloured collar); "green lights on the top that turn
//                  red when the Curling Bomb is about to explode"; cooking
//                  "causes it to grow larger".
// Proportions are read off the icons; absolute dimensions are INKWAVE
// presentation choices (no model sizes are published). Not a Nintendo mesh.
// The red-light window is WeaponBombCurling MoveParam.WarningAnimRestFrame 90
// and the charge growth is the trail ratio PaintRadiusMaxCharge/MinCharge
// (1.29 / 1.075) from the pinned 11.3.0 table.
//
// Autobomb and Sprinkler also ride the native bomb record; they take their
// models from sub-models.mjs (with the other eleven non-bomb subs), and every
// sub's hand-held prop is built here (bomb models below, the rest there).
//
// Nothing here reads or writes gameplay state: positions, velocities, fuses,
// paint, damage and network rows stay with _updateBombs and kit-subs. The
// record's `mesh` group keeps its native position/scale/rotation contract;
// the model replaces only its children (and `b.body`, the mesh the native
// fuse pulse drives). Geometries are shared; materials are per bomb because
// _releaseBomb disposes every material it finds on the record.

import { kitBombPresentation, CURLING } from './kit-subs.mjs';
import { SPRINKLER, sprinklerPhase } from './kit-sprinkler.mjs';
import { buildSubModel, poseSubModel, buildHeldSubModel, tintSubModel, SUB_MODEL_IDS, HELD_SCALE } from './sub-models.mjs';

const INSTALL = Symbol.for('inkwave.s3.bomb-models.install.v1');
const HELD = Symbol('inkwave.s3.bomb-models.held');
const TAU = Math.PI * 2;
const CONTACT_BIAS = 0.21;   // native bomb centre offset from the contact surface

export const CURLING_WARNING_REST = CURLING.warningAnimRestFrame;   // 90F = 1.5 s
export const CURLING_CHARGE_GROWTH = CURLING.paintRadiusMaxCharge / CURLING.paintRadiusMinCharge;
export const CURLING_LIGHT_GREEN = 0x39ff6a;
export const CURLING_LIGHT_RED = 0xff2a1e;
export const BOMB_MODEL_IDS = Object.freeze(['bomb', 'suction', 'curling']);
// Subs that ride the native bomb record (kit-autobomb / kit-sprinkler) but
// take their own model from sub-models.mjs instead of the Splat Bomb pyramid.
export const NATIVE_SUB_MODEL_IDS = Object.freeze(['autobomb', 'sprinkler']);

// Non-ink surface finishes (icon colours). 'ink' parts take the team ink.
const FINISH = {
  frame: [0x6b2fc4, { roughness: 0.35, metalness: 0.1 }],
  sleeve: [0xe23aa8, { roughness: 0.35, metalness: 0.1 }],
  knob: [0x7be03a, { roughness: 0.35, metalness: 0.1 }],
  clip: [0xffffff, { roughness: 0.2, metalness: 0, transparent: true, opacity: 0.45 }],
  black: [0x16161a, { roughness: 0.55, metalness: 0.1 }],
  chrome: [0xd4d8de, { roughness: 0.22, metalness: 0.9 }],
  handle: [0x5d5f66, { roughness: 0.35, metalness: 0.55 }],
  eye: [0xf4f4f0, { roughness: 0.3, metalness: 0 }],
  pupil: [0x0c0c0e, { roughness: 0.3, metalness: 0 }],
};

// Merge same-finish pieces into one draw: non-indexed position + normal.
function merge(THREE, list) {
  const parts = list.map(g => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  // Indexed like every native prop (tools measure the indexed draw).
  const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// A cylinder from a to b (arrays), radius r.
function rod(THREE, a, b, r, seg = 10, r2 = r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(A.x, A.y, A.z);
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Rounded tetrahedron, apex up (the ink bag): p-norm blend of the four
// face-plane distances and a sphere, without the creases of a hard min().
function inkBag(THREE, size) {
  const bag = new THREE.SphereGeometry(1, 40, 28);
  const v = [[0, 1, 0]];
  for (let k = 0; k < 3; k++) {
    const a = k * TAU / 3;
    v.push([Math.sin(a) * Math.sqrt(8) / 3, -1 / 3, Math.cos(a) * Math.sqrt(8) / 3]);
  }
  const pos = bag.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const l = Math.hypot(x, y, z) || 1, dx = x / l, dy = y / l, dz = z / l;
    let sum = 0;
    for (const q of v) { const c = -(dx * q[0] + dy * q[1] + dz * q[2]); if (c > 0) sum += Math.pow(c, 5); }
    const r = (1 / 3) / Math.pow(sum, 1 / 5) * 0.8 + 0.12;
    pos.setXYZ(i, dx * r, dy * r, dz * r);
  }
  bag.computeVertexNormals();
  return bag.scale(size, size, size);
}

function splatParts(THREE) {
  // Regular tetrahedron frame: base circumradius 0.25 at y -0.17, apex up.
  const R = 0.25, y0 = -0.17, edge = R * Math.sqrt(3), top = [0, y0 + edge * Math.sqrt(2 / 3), 0];
  const base = [0, 1, 2].map(k => { const a = k * TAU / 3 + Math.PI / 6; return [Math.sin(a) * R, y0, Math.cos(a) * R]; });
  const verts = [...base, top];
  const edges = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]];
  const frame = [], sleeve = [], knob = [], clip = [];
  for (const [i, j] of edges) {
    const a = verts[i], b = verts[j];
    frame.push(rod(THREE, a, b, 0.011, 8));
    sleeve.push(rod(THREE, lerp3(a, b, 0.06), lerp3(a, b, 0.2), 0.018, 10));
    sleeve.push(rod(THREE, lerp3(a, b, 0.8), lerp3(a, b, 0.94), 0.018, 10));
    clip.push(rod(THREE, lerp3(a, b, 0.45), lerp3(a, b, 0.55), 0.017, 10));
  }
  for (const b of base) knob.push(new THREE.SphereGeometry(0.03, 14, 10).translate(...b));
  knob.push(new THREE.CylinderGeometry(0.034, 0.03, 0.022, 14).translate(top[0], top[1] + 0.024, top[2]));
  sleeve.push(new THREE.CylinderGeometry(0.024, 0.026, 0.026, 14).translate(top[0], top[1] + 0.002, top[2]));
  // The bag fills the frame (its centroid sits at the tetrahedron centroid).
  const cy = (y0 * 3 + top[1]) / 4;
  const ink = inkBag(THREE, 0.29).translate(0, cy, 0);
  return [['ink', ink], ['frame', merge(THREE, frame)], ['sleeve', merge(THREE, sleeve)],
    ['knob', merge(THREE, knob)], ['clip', merge(THREE, clip)]];
}

function suctionParts(THREE) {
  // Cup rim on the contact surface (y -0.21), can above it.
  const cupProfile = [[0.0, -0.207], [0.112, -0.207], [0.12, -0.2], [0.116, -0.186], [0.106, -0.16],
    [0.09, -0.135], [0.066, -0.116], [0.036, -0.104], [0.0, -0.1]].map(([x, y]) => new THREE.Vector2(x, y));
  const black = [new THREE.LatheGeometry(cupProfile, 28), new THREE.CylinderGeometry(0.02, 0.024, 0.02, 12).translate(0, -0.092, 0)];
  // Team-coloured dots on the dome (two rows).
  const ink = [], ring = (r, y, n, size, phase) => {
    for (let k = 0; k < n; k++) { const a = k * TAU / n + phase; ink.push(new THREE.SphereGeometry(size, 6, 4).scale(1, 0.6, 1).translate(Math.sin(a) * r, y, Math.cos(a) * r)); }
  };
  ring(0.1, -0.165, 14, 0.0075, 0); ring(0.08, -0.135, 11, 0.0068, 0.2);
  ink.push(new THREE.CylinderGeometry(0.017, 0.017, 0.05, 12).translate(0, -0.06, 0));   // neck
  ink.push(new THREE.CylinderGeometry(0.072, 0.072, 0.2, 28).translate(0, 0.095, 0));   // can
  const chrome = [
    new THREE.CylinderGeometry(0.084, 0.088, 0.022, 28).translate(0, -0.03, 0),
    new THREE.CylinderGeometry(0.08, 0.084, 0.018, 28).translate(0, -0.009, 0),
    new THREE.TorusGeometry(0.069, 0.013, 10, 28).rotateX(Math.PI / 2).translate(0, 0.205, 0),
    new THREE.CylinderGeometry(0.081, 0.081, 0.018, 28, 1, true).translate(0, 0.2, 0),
  ];
  black.push(new THREE.CircleGeometry(0.066, 24).rotateX(-Math.PI / 2).translate(0, 0.2, 0));
  const eye = [], pupil = [];
  for (const s of [-1, 1]) {
    const a = s * 0.34, x = Math.sin(a) * 0.072, z = Math.cos(a) * 0.072;
    eye.push(new THREE.SphereGeometry(0.017, 12, 8).scale(1, 1, 0.35).rotateY(a).translate(x, 0.12, z));
    pupil.push(new THREE.SphereGeometry(0.008, 10, 6).scale(1, 1, 0.4).rotateY(a).translate(x * 1.06, 0.12, z * 1.06));
  }
  // Flash ring at the can's base (the warning blink).
  const flash = new THREE.TorusGeometry(0.086, 0.007, 8, 28).rotateX(Math.PI / 2).translate(0, -0.042, 0);
  return [['ink', merge(THREE, ink)], ['black', merge(THREE, black)], ['chrome', merge(THREE, chrome)],
    ['eye', merge(THREE, eye)], ['pupil', merge(THREE, pupil)], ['flash', flash]];
}

function curlingParts(THREE) {
  // Puck base on the contact surface (y 0), handle on top.
  const black = [
    new THREE.CylinderGeometry(0.282, 0.292, 0.045, 36).translate(0, 0.0225, 0),
    new THREE.CylinderGeometry(0.284, 0.284, 0.15, 36).translate(0, 0.12, 0),
    new THREE.CylinderGeometry(0.255, 0.284, 0.02, 36).translate(0, 0.205, 0),
  ];
  const ink = [];
  const N = 8, gap = 0.17;
  for (let k = 0; k < N; k++) {
    const t0 = k * TAU / N + gap / 2;
    ink.push(new THREE.CylinderGeometry(0.304, 0.304, 0.105, 6, 1, false, t0, TAU / N - gap).translate(0, 0.118, 0));
  }
  ink.push(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16).translate(0, 0.229, 0));   // handle collar
  const handle = [
    new THREE.TorusGeometry(0.2, 0.009, 6, 36).rotateX(Math.PI / 2).translate(0, 0.216, 0),
    new THREE.CylinderGeometry(0.027, 0.027, 0.1, 14).translate(0, 0.29, 0),
    new THREE.TorusGeometry(0.05, 0.027, 10, 12, Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0.34, -0.05),
    rod(THREE, [0, 0.39, -0.05], [0, 0.39, -0.095], 0.027, 14, 0.04),
  ];
  return [['black', merge(THREE, black)], ['ink', merge(THREE, ink)], ['handle', merge(THREE, handle)]];
}

let shared = null;
function geometries(THREE) {
  if (shared) return shared;
  shared = {
    bomb: splatParts(THREE), suction: suctionParts(THREE), curling: curlingParts(THREE),
    curlingLight: new THREE.BoxGeometry(0.06, 0.012, 0.022),
  };
  return shared;
}

const mat = (THREE, color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2, ...opts });
const finish = (THREE, kind) => { const f = FINISH[kind] || FINISH.black; return mat(THREE, f[0], f[1]); };

// Thrown/ghost model. Returns the model group plus the ink mesh that the
// native fuse pulse will drive through `b.body`.
export function buildThrownBombModel(THREE, id, inkMaterial) {
  if (NATIVE_SUB_MODEL_IDS.includes(id)) {
    const sub = buildSubModel(THREE, id, inkMaterial);
    return { root: sub.root, body: sub.body, light: null, id, sub };
  }
  const g = geometries(THREE), root = new THREE.Group();
  const key = id === 'suction' || id === 'curling' ? id : 'bomb';
  let body = null, light = null;
  for (const [kind, geo] of g[key]) {
    let m;
    if (kind === 'ink') m = inkMaterial;
    else if (kind === 'flash') m = mat(THREE, 0x332222, { emissive: new THREE.Color(CURLING_LIGHT_RED), emissiveIntensity: 0 });
    else m = finish(THREE, kind);
    const x = new THREE.Mesh(geo, m);
    x.castShadow = kind !== 'clip';
    root.add(x);
    if (kind === 'ink') body = x;
    if (kind === 'flash') light = x;
  }
  if (key === 'curling') {
    // Rectangular top lights around the handle.
    const lightMat = mat(THREE, 0x0b0b0b, { emissive: new THREE.Color(CURLING_LIGHT_GREEN), emissiveIntensity: 1.6 });
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6 + TAU / 12, x = new THREE.Mesh(g.curlingLight, lightMat);
      x.position.set(Math.sin(a) * 0.15, 0.218, Math.cos(a) * 0.15);
      x.rotation.y = a;
      root.add(x);
    }
    light = lightMat;
  }
  return { root, body, light, id: key };
}

// Swap the native sphere+cap for the bomb's own model, once per record.
export function applyThrownBombModel(THREE, system, b) {
  if (!b?.mesh || b.kind !== 'bomb' || b.s3Model) return b?.s3Model || null;
  const { id, resolved } = kitBombPresentation(b);
  const old = b.mesh.children.slice();
  const ink = b.body?.material || system._bombMat?.(b.team)?.clone();
  const model = buildThrownBombModel(THREE, id, ink);
  for (const child of old) {
    b.mesh.remove(child);
    if (child.material && child.material !== ink) child.material.dispose?.();
  }
  // Curling and Suction sit at the native 0.21 contact offset from the surface:
  // place each model so that its own resting face is on that surface.
  // Autobomb stands and Sprinkler sits on its own base: the record centre is
  // the native 0.21 contact offset above the surface.
  if (id === 'autobomb' || id === 'sprinkler') model.root.position.y = -CONTACT_BIAS;
  if (id === 'curling') {
    model.root.position.y = -CONTACT_BIAS;
    const c = Number.isFinite(resolved?.charge) ? resolved.charge : 0;
    model.root.scale.setScalar(1 + (CURLING_CHARGE_GROWTH - 1) * c);
  }
  b.mesh.add(model.root);
  b.body = model.body;
  b.s3Model = model;
  return model;
}

const SPRINKLER_SPIN = SPRINKLER.spinDegreesPerFrame.map(d => d * Math.PI / 180 * 60);   // rad/s per phase

// Orientation and lights after the native step has placed the record.
export function poseThrownBombModel(THREE, b, scratch, dt = 0) {
  const m = b?.s3Model;
  if (!m) return;
  if (m.id === 'autobomb') {
    // Walks upright toward its target; turns toward a target it is facing
    // during the native rotate window (kit-autobomb rotateFrames).
    const h = Math.hypot(b.vel.x, b.vel.z), target = b.s3Auto?.target?.pos;
    let yaw = b.s3ModelYaw ?? Math.atan2(b.vel.x, b.vel.z);
    if (h > 0.05) yaw = Math.atan2(b.vel.x, b.vel.z);
    else if (target) {
      const want = Math.atan2(target.x - b.pos.x, target.z - b.pos.z);
      let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw += d * Math.min(1, dt * 12);
    }
    b.s3ModelYaw = yaw;
    b.mesh.rotation.set(0, yaw, 0);
    poseSubModel(m.sub, { dt, speed: b.s3Mode === 'chasing' ? h : 0 });
    return;
  }
  if (m.id === 'sprinkler') {
    if (b.s3Mode === 'sprinkling') {
      // Base on the surface it stuck to (floor, wall or ceiling).
      if (b.s3SurfaceNormal) {
        scratch.up.set(0, 1, 0);
        scratch.n.copy(b.s3SurfaceNormal).normalize();
        b.mesh.quaternion.setFromUnitVectors(scratch.up, scratch.n);
      }
      // Head spin follows the spray phase (SpinDegreesPerFrame 33/11/1, the
      // record's own power-resolved periods); it holds still during the 30F
      // deploy window. Replayed records count from when they were first seen
      // sprinkling.
      if (b.s3SpinStartAge == null) b.s3SpinStartAge = b.s3Sprinkler?.sourceAge ?? b.age;
      const spec = b.s3Resolved?.spec ?? b.s3GhostResolved?.spec;
      const phase = sprinklerPhase((b.age - b.s3SpinStartAge) * 60, spec?.mode === 'sprinkler' ? spec : SPRINKLER);
      const rate = phase < 0 ? 0 : SPRINKLER_SPIN[phase];
      b.s3SpinAngle = ((b.s3SpinAngle || 0) + rate * dt) % TAU;
    }
    poseSubModel(m.sub, { dt, spin: b.s3SpinAngle || 0 });
    return;
  }
  if (m.id === 'curling') {
    // A curling stone slides flat; it faces its travel direction instead of
    // tumbling like a thrown Splat Bomb.
    const h = Math.hypot(b.vel.x, b.vel.z);
    if (h > 0.05) b.s3ModelYaw = Math.atan2(b.vel.x, b.vel.z);
    b.mesh.rotation.set(0, b.s3ModelYaw || 0, 0);
    b.mesh.scale.setScalar(1);
    const rest = b.fuse;
    const warn = Number.isFinite(rest) && rest >= 0 && rest <= CURLING_WARNING_REST;
    m.light.emissive.setHex(warn ? CURLING_LIGHT_RED : CURLING_LIGHT_GREEN);
    m.light.emissiveIntensity = warn ? 0.6 + 2.2 * (0.5 + 0.5 * Math.sin((b.age || 0) * TAU * 6)) : 1.6;
    return;
  }
  if (m.id === 'suction') {
    if (b.s3Mode === 'stuck' && b.s3SurfaceNormal) {
      // Cup (-Y) into the surface the bomb is stuck on.
      scratch.up.set(0, 1, 0);
      scratch.n.copy(b.s3SurfaceNormal).normalize();
      b.mesh.quaternion.setFromUnitVectors(scratch.up, scratch.n);
    }
    const k = b.fuse >= 0 && Number.isFinite(b.s3FuseTotal) && b.s3FuseTotal > 0 ? 1 - b.fuse / b.s3FuseTotal : 0;
    m.light.material.emissiveIntensity = b.fuse >= 0 ? (0.5 + 0.5 * Math.sin((b.age || 0) * (12 + 30 * k))) * (0.8 + 2.4 * k) : 0;
  }
}

// ---- hand-held prop ------------------------------------------------------------
// Same bomb space as the native prop (character-weapons buildBomb): grip at the
// origin, cap axis +Y, body hanging below, so the native inHandL transform holds.
let heldShared = null;
// Drop (in thrown-model units) that puts each model's top/handle at the grip.
const HELD_DROP = { bomb: -0.23, suction: -0.24, curling: -0.36 };
function heldGeometries(THREE) {
  if (heldShared) return heldShared;
  const s = HELD_SCALE;   // shared with every sub prop (sub-models.mjs HELD_SCALE)
  const g = geometries(THREE);
  heldShared = {};
  for (const id of BOMB_MODEL_IDS) {
    heldShared[id] = g[id].map(([kind, geo]) => [kind, geo.clone().translate(0, HELD_DROP[id], 0).scale(s, s, s)]);
  }
  return heldShared;
}

export function heldBombModelId(character) {
  const sub = character?._owner?.()?.weapon?.sub;
  return sub === 'suction' || sub === 'curling' || SUB_MODEL_IDS.includes(sub) ? sub : 'bomb';
}

// Every kit (the Splat Bomb too) holds its own model; the native generic bulb
// stays hidden while one is shown.
export function applyHeldBombModel(THREE, character, id) {
  const bomb = character?.bomb;
  if (!bomb?.group) return false;
  const state = bomb[HELD] || (bomb[HELD] = { id: 'native', native: bomb.group.children.slice(), nativeInk: bomb.ink, custom: null });
  if (state.id === id) return false;
  if (state.custom) {
    bomb.group.remove(state.custom);
    state.custom.traverse(o => { if (o.material && !o.userData.s3HeldInk) o.material.dispose?.(); });
    state.custom = null;
  }
  const subModel = SUB_MODEL_IDS.includes(id), custom = BOMB_MODEL_IDS.includes(id) || subModel;
  for (const child of state.native) child.visible = !custom;
  bomb.ink = state.nativeInk;
  if (subModel) {
    const inkMat = state.nativeInk.material, held = buildHeldSubModel(THREE, id, inkMat);
    for (const p of held.model.inkMeshes) p.userData.s3HeldInk = true;
    bomb.group.add(held.holder);
    state.custom = held.holder;
    const inkParts = held.model.inkMeshes;
    bomb.ink = { get material() { return state.nativeInk.material; },
      set material(v) { state.nativeInk.material = v; for (const p of inkParts) p.material = v; if (v?.color) tintSubModel(held.model, v.color); } };
  } else if (custom) {
    const root = new THREE.Group(), inkMat = state.nativeInk.material;
    for (const [kind, geo] of heldGeometries(THREE)[id]) {
      const ink = kind === 'ink';
      const m = new THREE.Mesh(geo, ink ? inkMat : kind === 'flash' ? finish(THREE, 'chrome') : finish(THREE, kind));
      m.castShadow = kind !== 'clip';
      if (ink) m.userData.s3HeldInk = true;
      root.add(m);
    }
    bomb.group.add(root);
    state.custom = root;
    // The native colour refresh assigns `bomb.ink.material`; route it to the
    // custom ink part too so a team colour change reaches the held prop.
    const inkParts = root.children.filter(c => c.userData.s3HeldInk);
    bomb.ink = { get material() { return state.nativeInk.material; },
      set material(v) { state.nativeInk.material = v; for (const p of inkParts) p.material = v; } };
  }
  state.id = id;
  return true;
}

export function installBombModels(api) {
  const { THREE, Projectiles, Character } = api;
  if (!THREE || !Projectiles?.prototype?._updateBombs) throw new Error('Bomb models need THREE and Projectiles');
  if (Projectiles.prototype[INSTALL]) return;
  const scratch = { up: new THREE.Vector3(), n: new THREE.Vector3() };
  const updateBombs = Projectiles.prototype._updateBombs;
  Projectiles.prototype._updateBombs = function (dt) {
    // Identity is attached synchronously after throwBomb (owner) and ghostBomb
    // (replay), so every record has it by its first step.
    for (const b of this.bombs) if (!b.s3Model && b.kind === 'bomb') applyThrownBombModel(THREE, this, b);
    const out = updateBombs.call(this, dt);
    for (const b of this.bombs) if (b.s3Model) poseThrownBombModel(THREE, b, scratch, dt);
    return out;
  };
  if (Character?.prototype?._applyPose) {
    const applyPose = Character.prototype._applyPose;
    Character.prototype._applyPose = function (...args) {
      if (this.bomb && this.bombHeld) applyHeldBombModel(THREE, this, heldBombModelId(this));
      return applyPose.apply(this, args);
    };
  }
  Object.defineProperty(Projectiles.prototype, INSTALL, { value: true });
}
