// Shared modelling kit for the per-main-weapon INKWAVE models.
// Weapon space (character-weapons.js): handle axis through the origin, +Z = barrel
// forward, +Y = up, the holder's right = -X. Units are metres. Everything here
// builds procedural geometry; no retail mesh, texture or skeleton is embedded.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { superEllipsoid, lathe, sweep, finalize, torus, smoothProfile } from '../../../../src/game/character-geo.js';
import { WMAT } from '../../../../src/game/character-mats.js';

export { THREE, superEllipsoid, lathe, sweep, finalize, torus, smoothProfile };
/** Surface classes understood by the shared weapon plastic shader. */
export const M = WMAT;
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** A bag of vertex-coloured geometry pieces merged into one draw. */
export class Pieces {
  constructor() { this.list = []; }
  add(geo, color = '#24252b', mat = M.satin) {
    const g = geo.index ? geo : finalize(geo), n = g.attributes.position.count, c = new THREE.Color(color);
    if (!g.attributes.normal) g.computeVertexNormals();
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position.clone());
    out.setAttribute('normal', g.attributes.normal.clone());
    out.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    out.setAttribute('aMat', new THREE.Float32BufferAttribute(new Float32Array(n).fill(mat), 1));
    out.setIndex(g.index.clone()); this.list.push(out); g.dispose(); return this;
  }
  /** Apply fn(geometry) to every piece already added (e.g. g => g.rotateX(.1).translate(0, .1, 0)). */
  transform(fn) { for (const g of this.list) fn(g); return this; }
  /** Move every piece of another Pieces (keeping its colours/surfaces) into this one. */
  merge(other) { this.list.push(...other.list); other.list = []; return this; }
  /** Mirrored copies across X = 0 of every piece added so far (for symmetric left/right details). */
  mirrorX() { for (const g of [...this.list]) this.list.push(mirrored(g)); return this; }
  get empty() { return this.list.length === 0; }
  build() {
    if (!this.list.length) return emptyGeometry();
    const g = this.list.length === 1 ? this.list[0] : mergeGeometries(this.list, false);
    if (this.list.length > 1) for (const p of this.list) p.dispose();
    this.list = []; return g;
  }
}
/** One degenerate triangle with every attribute: an invisible but valid channel. */
export function emptyGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(new Float32Array(3), 1));
  g.setIndex([0, 1, 2]); return g;
}

// ------------------------------------------------------------------------------------------ primitives
export const at = (g, x = 0, y = 0, z = 0) => g.translate(x, y, z);
/** Rounded box, full sizes w (X) × h (Y) × d (Z) centred at (x, y, z). e: 0.1 boxy … 1 ellipsoid. */
export const box = (w, h, d, x = 0, y = 0, z = 0, e = 0.38, ws = 12, hs = 8) => at(superEllipsoid(w / 2, h / 2, d / 2, e, e, ws, hs), x, y, z);
/** Ellipsoid with radii (rx, ry, rz). */
export const sphere = (rx, ry, rz, x = 0, y = 0, z = 0, ws = 18, hs = 12) => at(superEllipsoid(rx, ry, rz, 1, 1, ws, hs), x, y, z);
/** Lathe along +Z: profile [[r, z], ...], placed with its axis through (x, y). */
export const zlathe = (profile, x = 0, y = 0, z = 0, seg = 20) => at(lathe(profile, seg).rotateX(Math.PI / 2), x, y, z);
/** Lathe along +Y: profile [[r, y], ...]. */
export const ylathe = (profile, x = 0, y = 0, z = 0, seg = 20) => at(lathe(profile, seg), x, y, z);
/** Lathe along +X: profile [[r, x], ...]. */
export const xlathe = (profile, x = 0, y = 0, z = 0, seg = 20) => at(lathe(profile, seg).rotateZ(-Math.PI / 2), x, y, z);
/** Cylinder of radius r along Z from z0 to z1 at (x, y). */
export const zcyl = (r, z0, z1, x = 0, y = 0, seg = 18) => zlathe([[0, z0], [r, z0], [r, z1], [0, z1]], x, y, 0, seg);
export const ycyl = (r, y0, y1, x = 0, z = 0, seg = 18) => ylathe([[0, y0], [r, y0], [r, y1], [0, y1]], x, 0, z, seg);
export const xcyl = (r, x0, x1, y = 0, z = 0, seg = 18) => xlathe([[0, x0], [r, x0], [r, x1], [0, x1]], 0, y, z, seg);
/** Cylinder between two points a → b. */
export function cyl(r, a, b, seg = 14) {
  const A = Array.isArray(a) ? V(...a) : a, B = Array.isArray(b) ? V(...b) : b, dir = B.clone().sub(A), len = dir.length();
  const g = lathe([[0, 0], [r, 0], [r, len], [0, len]], seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize()));
  return at(g, A.x, A.y, A.z);
}
/** Torus of major radius R and tube r; axis = 'x' | 'y' | 'z' (the ring's normal). */
export function ring(R, r, x = 0, y = 0, z = 0, axis = 'z', rs = 6, ts = 22, arc = Math.PI * 2) {
  const g = torus(R, r, rs, ts, arc); // THREE torus lies in XY, normal +Z
  if (axis === 'x') g.rotateY(Math.PI / 2); else if (axis === 'y') g.rotateX(Math.PI / 2);
  return at(g, x, y, z);
}
/** Tube swept through points [[x,y,z], ...] (Catmull-Rom), constant radius r. */
export function pipe(points, r = 0.006, seg = 20, radial = 8) {
  return sweep(points.map(p => (p.isVector3 ? p.clone() : V(...p))), { seg, radial, capSteps: 2, radius: () => r }).geo;
}
/** Tube with radius varying along t ∈ [0, 1]: radius(t). */
export function pipeR(points, radius, seg = 24, radial = 10) {
  return sweep(points.map(p => (p.isVector3 ? p.clone() : V(...p))), { seg, radial, capSteps: 2, radius }).geo;
}
/** A side-profile slab: 2D outline in the weapon's side plane as [[z, y], ...] (as seen in a side
 *  reference image with the muzzle to the right), extruded `thick` along X and centred on x. Optional
 *  rounded edges (bevel). Holes: arrays of [[z, y], ...]. Ideal for frames, blades, fins, plates. */
export function slab(outline, thick = 0.01, x = 0, bevel = 0.002, holes = [], curveSegments = 6) {
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const b = Math.min(bevel, thick * 0.45);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, thick - 2 * b), bevelEnabled: b > 0,
    bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments });
  g.translate(0, 0, -(thick - 2 * b) / 2);
  g.rotateY(-Math.PI / 2);            // shape x → +Z, extrusion → −X
  return at(g, x, 0, 0);
}
/** A top-profile slab: outline [[x, z], ...] seen from above, extruded `thick` along Y about y. */
export function topSlab(outline, thick = 0.01, y = 0, bevel = 0.002, holes = []) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, z))));
  const b = Math.min(bevel, thick * 0.45);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, thick - 2 * b), bevelEnabled: b > 0,
    bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(thick - 2 * b) / 2);
  g.rotateX(Math.PI / 2);             // shape y → +Z, extrusion → −Y
  g.scale(1, 1, 1);
  return at(g, 0, y, 0);
}
/** A front-profile slab: outline [[x, y], ...] seen from the muzzle, extruded along Z about z. */
export function frontSlab(outline, thick = 0.01, z = 0, bevel = 0.002, holes = []) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const b = Math.min(bevel, thick * 0.45);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, thick - 2 * b), bevelEnabled: b > 0,
    bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -(thick - 2 * b) / 2);
  return at(g, 0, 0, z);
}
/** Rounded rectangle / superellipse outline in 2D for slab(): centre (cx, cy), half sizes, corner r. */
export function roundRect(cx, cy, hw, hh, r = 0.004, n = 4) {
  r = Math.min(r, hw, hh); const out = [];
  const corners = [[cx + hw - r, cy + hh - r, 0], [cx - hw + r, cy + hh - r, Math.PI / 2], [cx - hw + r, cy - hh + r, Math.PI], [cx + hw - r, cy - hh + r, 1.5 * Math.PI]];
  for (const [x, y, a0] of corners) for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; out.push([x + r * Math.cos(a), y + r * Math.sin(a)]); }
  return out;
}
/** Smooth closed outline through control points (Catmull-Rom), n samples. */
export function smoothOutline(points, n = 48) {
  const c = new THREE.CatmullRomCurve3(points.map(([a, b]) => V(a, b, 0)), true, 'centripetal');
  return c.getSpacedPoints(n).slice(0, -1).map(p => [p.x, p.y]);
}
/** Rotate a geometry about an axis through a point. */
export function rotateAbout(g, axis, angle, pivot = [0, 0, 0]) {
  const P = Array.isArray(pivot) ? V(...pivot) : pivot;
  g.translate(-P.x, -P.y, -P.z);
  g.applyQuaternion(new THREE.Quaternion().setFromAxisAngle((Array.isArray(axis) ? V(...axis) : axis).normalize(), angle));
  return g.translate(P.x, P.y, P.z);
}
/** Mirror a geometry across X = 0 (keeps winding valid). Returns a new geometry. */
export function mirrored(g) {
  const m = (g.index ? g : finalize(g)).clone(); m.scale(-1, 1, 1);
  const ix = m.index.array; for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
  m.computeVertexNormals(); return m;
}

// ------------------------------------------------------------------------------------------ grips
/** The native pistol handle axis (character-weapons.js GRIP_PISTOL): through the origin, leaning
 *  forward by atan(0.25). A fist closes around a Ø 2.8 cm handle on this axis. */
export const PISTOL_AXIS = V(0, 1, 0.25).normalize();
export const GRIP_PISTOL = Object.freeze({ pos: V(0, 0, 0), handZ: PISTOL_AXIS.clone(), handY: V(0, 0.25, -1) });
/** Pistol grip shell around the native handle axis (keep it ≤ ~1.5 cm about the axis where the
 *  fist closes). opts: color, len (half length), w (half width), d (half depth), rake (radians, extra
 *  lean), trigger color, guard (bool), baseColor. Returns the trigger piece list for an optional part. */
export function pistolGrip(p, opt = {}) {
  const col = opt.color ?? '#24252b', len = opt.len ?? 0.055, w = opt.w ?? 0.0125, d = opt.d ?? 0.016;
  const tilt = Math.atan2(0.25, 1) + (opt.rake ?? 0);
  p.add(at(superEllipsoid(w, len, d, opt.e ?? 0.4, 0.45, 12, 8).rotateX(tilt), 0, -0.008, -0.002), col, opt.mat ?? M.rubber);
  if (opt.base !== false) p.add(box(w * 2.7, 0.009, d * 2.7, 0, -0.063, -0.016), opt.baseColor ?? col, M.satin);
  if (opt.guard !== false) p.add(pipe([[0, 0.034, 0.02], [0, 0.026, 0.046], [0, -0.003, 0.044], [0, -0.008, 0.016]], 0.0035), opt.guardColor ?? col);
  const tr = new Pieces();
  tr.add(box(0.006, 0.021, 0.006, 0, 0.022, 0.031), opt.triggerColor ?? col);
  return tr;
}
/** Native trigger hinge (character-weapons.js TRIGGER_PIVOT). */
export const TRIGGER_PIVOT = V(0, 0.0315, 0.0282);
/** A grip spec for a straight handle: axis point pos, axis direction toward the thumb (handZ), the
 *  direction the wrist lies (handY). */
export function gripSpec(pos, handZ, handY) {
  return { pos: Array.isArray(pos) ? V(...pos) : pos.clone(), handZ: (Array.isArray(handZ) ? V(...handZ) : handZ.clone()).normalize(),
    handY: (Array.isArray(handY) ? V(...handY) : handY.clone()).normalize() };
}
/** A visible support handle (foregrip) of radius ~1.3 cm along the given grip spec. */
export function supportHandle(p, g, color = '#24252b', half = 0.035, r = 0.013) {
  const geo = lathe([[0, -half], [r, -half], [r, half], [0, half]], 12);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), g.handZ.clone().normalize())).translate(g.pos.x, g.pos.y, g.pos.z);
  p.add(geo, color, M.rubber);
}

// ------------------------------------------------------------------------------------------ assembly
/** An animated part authored in weapon space, rotating/sliding about `pivot`. */
export function part(pieces, pivot, mat = 'body', lamp = null) {
  return { src: pieces instanceof Pieces ? pieces.build() : pieces, pivot: Array.isArray(pivot) ? V(...pivot) : pivot.clone(), mat, lamp };
}
/** Invisible stand-in for a native part channel that this weapon does not show. */
export function hiddenPart(p) { return { ...p, src: emptyGeometry(), hidden: true }; }

/**
 * Replace the visible weapon while keeping every native channel the family runtime animates.
 *   d      — the family base def (pre-finishParts: parts carry `src` + `pivot`).
 *   spec   — { body: Pieces, ink: Pieces, parts: { name: part(...) }, keepParts: [names to keep as-is],
 *              gripR, gripL, muzzle: [x,y,z], drop: ['glow' | 'drum'], glow: geometry (with aSeg),
 *              drum: { geo, caps, at: [x,y,z], r } }
 * Native parts not listed in `parts`/`keepParts` become invisible channels (the runtime may still move
 * them, harmlessly). Returns d.
 */
export function rebuild(d, spec) {
  d.body?.dispose?.(); d.ink?.dispose?.();
  d.body = spec.body ? spec.body.build() : emptyGeometry();
  d.ink = spec.ink ? spec.ink.build() : emptyGeometry();
  const keep = new Set(spec.keepParts || []);
  for (const [name, p] of Object.entries(d.parts || {})) {
    if (keep.has(name) || spec.parts?.[name]) continue;
    p.src?.dispose?.(); d.parts[name] = hiddenPart(p);
  }
  d.parts ||= {};
  for (const [name, p] of Object.entries(spec.parts || {})) { d.parts[name]?.src?.dispose?.(); d.parts[name] = p; }
  if (spec.gripR) d.gripR = spec.gripR;
  if (spec.gripL) d.gripL = spec.gripL;
  if (spec.muzzle) d.muzzle = Array.isArray(spec.muzzle) ? V(...spec.muzzle) : spec.muzzle.clone();
  for (const k of spec.drop || []) {
    if (k === 'glow') { d.glow?.dispose?.(); d.glow = null; }
    if (k === 'drum') { d.drum?.dispose?.(); d.drumCaps?.dispose?.(); d.drum = null; d.drumCaps = null; }
  }
  if (spec.glow) { d.glow?.dispose?.(); d.glow = spec.glow; }
  if (spec.drum) {
    d.drum?.dispose?.(); d.drumCaps?.dispose?.();
    d.drum = spec.drum.geo instanceof Pieces ? spec.drum.geo.build() : spec.drum.geo;
    d.drumCaps = spec.drum.caps instanceof Pieces ? spec.drum.caps.build() : spec.drum.caps;
    d.drumAt = Array.isArray(spec.drum.at) ? V(...spec.drum.at) : spec.drum.at.clone();
    if (spec.drum.r) d.drumR = spec.drum.r;
  }
  return d;
}
/** Coil-style glow geometry: rings (or any pieces) whose aSeg runs 0 → 1 along `axis` between a and b. */
export function glowGeometry(pieces, a, b, axis = 'z') {
  const g = pieces.build(), pos = g.attributes.position, seg = new Float32Array(pos.count);
  const get = axis === 'x' ? pos.getX.bind(pos) : axis === 'y' ? pos.getY.bind(pos) : pos.getZ.bind(pos);
  for (let n = 0; n < pos.count; n++) seg[n] = Math.max(0, Math.min(1, (get(n) - a) / (b - a)));
  g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1)); return g;
}

// ------------------------------------------------------------------------------------------ motion helpers
export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
/** Frame-rate independent exponential approach. */
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
