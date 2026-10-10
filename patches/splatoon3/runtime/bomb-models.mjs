// Per-sub bomb models (presentation only).
//
// Upstream draws every thrown bomb as one sphere + cylinder cap and holds one
// round bulb in the hand, so a Suction Bomb and a Curling Bomb read as the
// same object as a Splat Bomb. The silhouettes follow the series' own
// descriptions (Inkipedia, Splat/Suction/Curling Bomb pages):
//   Splat Bomb   : a rounded triangular pyramid of ink with a dark cap on top.
//   Suction Bomb : "a can of spray paint, but with a black suction cup
//                  connected to the nozzle"; it sticks cup-first; "the base
//                  ... flashes repeatedly just before it explodes".
//   Curling Bomb : "a short black cylinder with a gray handle on top and
//                  panels on the side that change color to match the user's
//                  ink"; "green lights on the top that turn red when the
//                  Curling Bomb is about to explode"; cooking "causes it to
//                  grow larger".
// Dimensions are INKWAVE presentation choices (no model sizes are published).
// The red-light window is WeaponBombCurling MoveParam.WarningAnimRestFrame 90
// and the charge growth is the trail ratio PaintRadiusMaxCharge/MinCharge
// (1.29 / 1.075) from the pinned 11.3.0 table.
//
// Nothing here reads or writes gameplay state: positions, velocities, fuses,
// paint, damage and network rows stay with _updateBombs and kit-subs. The
// record's `mesh` group keeps its native position/scale/rotation contract;
// the model replaces only its children (and `b.body`, the mesh the native
// fuse pulse drives). Geometries are shared; materials are per bomb because
// _releaseBomb disposes every material it finds on the record.

import { kitBombPresentation, CURLING } from './kit-subs.mjs';

const INSTALL = Symbol.for('inkwave.s3.bomb-models.install.v1');
const HELD = Symbol('inkwave.s3.bomb-models.held');
const TAU = Math.PI * 2;
const CONTACT_BIAS = 0.21;   // native bomb centre offset from the contact surface

export const CURLING_WARNING_REST = CURLING.warningAnimRestFrame;   // 90F = 1.5 s
export const CURLING_CHARGE_GROWTH = CURLING.paintRadiusMaxCharge / CURLING.paintRadiusMinCharge;
export const CURLING_LIGHT_GREEN = 0x39ff6a;
export const CURLING_LIGHT_RED = 0xff2a1e;

let shared = null;
function geometries(THREE) {
  if (shared) return shared;
  // Rounded tetrahedron, apex up, flat base down: blend of the regular
  // tetrahedron's support distance and a sphere.
  const tetra = new THREE.SphereGeometry(1, 48, 32);   // indexed: smooth shared normals
  const apex = [[0, 1, 0]];
  for (let k = 0; k < 3; k++) {
    const a = k * TAU / 3;
    apex.push([Math.sin(a) * Math.sqrt(8) / 3, -1 / 3, Math.cos(a) * Math.sqrt(8) / 3]);
  }
  const pos = tetra.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const l = Math.hypot(x, y, z) || 1, dx = x / l, dy = y / l, dz = z / l;
    // Smooth (p-norm) union of the four face-plane distances: a rounded
    // pyramid without the creases a hard min() leaves on the mesh.
    let sum = 0;
    for (const v of apex) {             // face opposite v has outward normal -v, inradius 1/3
      const c = -(dx * v[0] + dy * v[1] + dz * v[2]);
      if (c > 0) sum += Math.pow(c, 4);
    }
    const r = (1 / 3) / Math.pow(sum, 1 / 4) * 0.62 + 0.3;
    pos.setXYZ(i, dx * r, dy * r, dz * r);
  }
  tetra.computeVertexNormals();
  tetra.scale(0.25, 0.25, 0.25);
  tetra.translate(0, -0.02, 0);
  shared = {
    splatBody: tetra,
    splatCap: new THREE.CylinderGeometry(0.04, 0.055, 0.07, 14).translate(0, 0.19, 0),
    splatKnob: new THREE.SphereGeometry(0.032, 12, 8).translate(0, 0.232, 0),
    // Suction Bomb, cup along -Y: can body, shoulder cap, nozzle, black cup.
    suctionCan: new THREE.CylinderGeometry(0.1, 0.1, 0.26, 20).translate(0, 0.06, 0),
    suctionCap: new THREE.CylinderGeometry(0.075, 0.1, 0.06, 20).translate(0, 0.22, 0),
    suctionTop: new THREE.SphereGeometry(0.05, 14, 8, 0, TAU, 0, Math.PI / 2).translate(0, 0.25, 0),
    suctionNeck: new THREE.CylinderGeometry(0.03, 0.04, 0.05, 12).translate(0, -0.095, 0),
    suctionCup: new THREE.CylinderGeometry(0.035, 0.12, 0.07, 22, 1, true).translate(0, -0.155, 0),
    suctionBase: new THREE.TorusGeometry(0.1, 0.012, 8, 24).rotateX(Math.PI / 2).translate(0, -0.07, 0),
    // Curling Bomb: low black puck, ink side band, grey handle, top lights.
    curlingPuck: new THREE.CylinderGeometry(0.27, 0.29, 0.15, 28).translate(0, 0.075, 0),
    curlingBand: new THREE.CylinderGeometry(0.296, 0.296, 0.06, 28, 1, true).translate(0, 0.07, 0),
    curlingTop: new THREE.CylinderGeometry(0.2, 0.27, 0.03, 28).translate(0, 0.165, 0),
    curlingHandle: new THREE.TorusGeometry(0.11, 0.024, 8, 18, Math.PI).translate(0, 0.17, 0),
    curlingLight: new THREE.SphereGeometry(0.022, 8, 6),
  };
  return shared;
}

const mat = (THREE, color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2, ...opts });

// Thrown/ghost model. Returns the model group plus the ink mesh that the
// native fuse pulse will drive through `b.body`.
export function buildThrownBombModel(THREE, id, inkMaterial) {
  const g = geometries(THREE), root = new THREE.Group();
  const mesh = (geo, m) => { const x = new THREE.Mesh(geo, m); x.castShadow = true; root.add(x); return x; };
  if (id === 'suction') {
    const body = mesh(g.suctionCan, inkMaterial);
    mesh(g.suctionCap, mat(THREE, 0xe8e6df, { roughness: 0.35 }));
    mesh(g.suctionTop, mat(THREE, 0x2a2a30, { metalness: 0.6, roughness: 0.4 }));
    mesh(g.suctionNeck, mat(THREE, 0x2a2a30, { metalness: 0.5 }));
    mesh(g.suctionCup, mat(THREE, 0x111114, { roughness: 0.7, side: THREE.DoubleSide }));
    const light = mesh(g.suctionBase, mat(THREE, 0x332222, { emissive: new THREE.Color(CURLING_LIGHT_RED), emissiveIntensity: 0 }));
    return { root, body, light, id };
  }
  if (id === 'curling') {
    mesh(g.curlingPuck, mat(THREE, 0x17171b, { roughness: 0.5 }));
    const body = mesh(g.curlingBand, inkMaterial);
    mesh(g.curlingTop, mat(THREE, 0x2b2b31, { roughness: 0.4 }));
    mesh(g.curlingHandle, mat(THREE, 0x9a9ca3, { metalness: 0.6, roughness: 0.3 }));
    const lightMat = mat(THREE, 0x0b0b0b, { emissive: new THREE.Color(CURLING_LIGHT_GREEN), emissiveIntensity: 1.6 });
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6 + TAU / 12, x = new THREE.Mesh(g.curlingLight, lightMat);
      x.position.set(Math.sin(a) * 0.165, 0.18, Math.cos(a) * 0.165);
      root.add(x);
    }
    return { root, body, light: lightMat, id };
  }
  const body = mesh(g.splatBody, inkMaterial);
  mesh(g.splatCap, mat(THREE, 0x2a2a30, { metalness: 0.6, roughness: 0.4 }));
  mesh(g.splatKnob, mat(THREE, 0x3a3a42, { metalness: 0.5, roughness: 0.35 }));
  return { root, body, light: null, id: 'bomb' };
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
  if (id === 'curling') {
    model.root.position.y = -CONTACT_BIAS;
    const c = Number.isFinite(resolved?.charge) ? resolved.charge : 0;
    model.root.scale.setScalar(1 + (CURLING_CHARGE_GROWTH - 1) * c);
  } else if (id === 'suction') model.root.position.y = 0.19 - CONTACT_BIAS;   // cup tip on the surface
  b.mesh.add(model.root);
  b.body = model.body;
  b.s3Model = model;
  return model;
}

// Orientation and lights after the native step has placed the record.
const _n = { x: 0, y: 1, z: 0 };
export function poseThrownBombModel(THREE, b, scratch) {
  const m = b?.s3Model;
  if (!m) return;
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
function heldGeometries(THREE) {
  if (heldShared) return heldShared;
  const s = 0.2;   // native held bulb is ~0.05 radius against the 0.2 thrown sphere
  const g = geometries(THREE);
  const scaled = (geo, dy) => geo.clone().translate(0, dy, 0).scale(s, s, s);
  heldShared = {
    suction: [['can', scaled(g.suctionCan, -0.3)], ['cap', scaled(g.suctionCap, -0.3)], ['top', scaled(g.suctionTop, -0.3)],
      ['neck', scaled(g.suctionNeck, -0.3)], ['cup', scaled(g.suctionCup, -0.3)]],
    curling: [['puck', scaled(g.curlingPuck, -0.22)], ['band', scaled(g.curlingBand, -0.22)], ['top', scaled(g.curlingTop, -0.22)],
      ['handle', scaled(g.curlingHandle, -0.22)]],
  };
  return heldShared;
}

export function heldBombModelId(character) {
  const sub = character?._owner?.()?.weapon?.sub;
  return sub === 'suction' || sub === 'curling' ? sub : 'bomb';
}

export function applyHeldBombModel(THREE, character, id) {
  const bomb = character?.bomb;
  if (!bomb?.group) return false;
  const state = bomb[HELD] || (bomb[HELD] = { id: 'bomb', native: bomb.group.children.slice(), nativeInk: bomb.ink, custom: null });
  if (state.id === id) return false;
  if (state.custom) { bomb.group.remove(state.custom); state.custom = null; }
  for (const child of state.native) child.visible = id === 'bomb';
  bomb.ink = state.nativeInk;
  if (id !== 'bomb') {
    const parts = heldGeometries(THREE)[id], root = new THREE.Group();
    const inkMat = state.nativeInk.material;
    const colors = { cap: 0xe8e6df, top: 0x2a2a30, neck: 0x2a2a30, cup: 0x111114, puck: 0x17171b, handle: 0x9a9ca3 };
    for (const [name, geo] of parts) {
      const ink = name === 'can' || name === 'band';
      const m = new THREE.Mesh(geo, ink ? inkMat : mat(THREE, colors[name] ?? 0x2b2b31, name === 'cup' ? { side: THREE.DoubleSide } : {}));
      m.castShadow = true;
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
    for (const b of this.bombs) if (b.s3Model) poseThrownBombModel(THREE, b, scratch);
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
