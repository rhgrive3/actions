// Brella family models (Splatoon 3 Ver.11.3.0): Splat Brella, Tenta Brella, Undercover Brella,
// Recycled Brella 24 Mk I. The catalogue gives them the shooter model kind (pistol grip, trigger / led channels);
// each model is the gun body (pistol or crook grip, shaft = shotgun barrel, hub with the nozzle) plus a separate
// canopy part built from the official 3D renders (Inkipedia "S3 Weapon Main <name> 3D") and turntable videos.
//
// Weapon space: the handle axis goes through the origin, +Z = forward. The shaft runs along +Z at height SH above the
// grip and the canopy is an umbrella whose apex hub sits at the shaft tip (the nozzle), ribs fanning backwards.
// Scale: the pistol handle is 0.11 m; the open canopy radius follows the render's canopy-to-handle ratio.
//
// Canopy motion (read-only gameplay state, WeaponRunner.catalogState.canopy):
//   folded along the shaft at rest, opens while the shot is held (canopy.open), folds when released, hidden while the
//   canopy is launched (Splat / Tenta / Recycled) or while the weapon is naked (catalogState.naked > 0).
// The geometry is baked in the folded pose, so far LOD / unanimated rendering shows a closed umbrella; the animation
// scales the part about the apex hub (x/y: width, z: length along the shaft).
import { THREE, Pieces, M, V, box, sphere, zlathe, zcyl, ring, pipe, lathe, pistolGrip, gripSpec, part, rebuild,
  TRIGGER_PIVOT, clamp, damp, smooth } from './kit.mjs';

const TAU = Math.PI * 2, SH = 0.075, K_FOLD = 0.11;
const GRIP_L = z => gripSpec([0, SH, z], [0, 0, 1], [0.5, 1, 0]);

const flip = g => { const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; } g.computeVertexNormals(); return g; };

/** Umbrella shell (double layer) between radius fractions u0..u1. n = number of gores (polygonal rim). */
function domeShell(R, depth, zH, u0, u1, n, thick = 0.004, p = 1.8, steps = 8) {
  const w = TAU / n, poly = a => { const m = ((a % w) + w) % w; return Math.cos(Math.PI / n) / Math.cos(m - Math.PI / n); };
  const prof = d => { const o = []; for (let i = 0; i <= steps; i++) { const u = u0 + (u1 - u0) * i / steps; o.push([R * u, zH - depth * u ** p - d]); } return o; };
  const deform = v => { const r = Math.hypot(v.x, v.z), f = 1 + (poly(Math.atan2(v.z, v.x)) - 1) * Math.min(1, r / R); v.x *= f; v.z *= f; };
  const out = lathe(prof(0), n * 2, deform).rotateX(Math.PI / 2);
  const inn = flip(lathe(prof(thick), n * 2, deform).rotateX(Math.PI / 2));
  return [out.translate(0, SH, 0), inn.translate(0, SH, 0)];
}
/** Rib curves apex → rim corner, plus slider struts from the shaft. */
function ribs(P, R, depth, zH, n, color, rr = 0.0045, strut = true, jut = 0) {
  for (let k = 0; k < n; k++) {
    const a = k * TAU / n, c = Math.cos(a), s = Math.sin(a), pts = [];
    for (let i = 0; i <= 5; i++) { const u = i / 5; pts.push([c * (R + jut * u) * u, SH + s * (R + jut * u) * u, zH - depth * u ** 1.8 - 0.006]); }
    P.add(pipe(pts, rr, 6, 5), color, M.satin);
    if (strut && k % (n > 12 ? 2 : 1) === 0) P.add(pipe([[0, SH, zH - depth * 0.62], [c * R * 0.5, SH + s * R * 0.5, zH - depth * 0.5 ** 1.8 - 0.006]], rr * 0.7, 2, 4), color, M.satin);
  }
}
/** Fold a canopy's geometry (about the apex, on the shaft axis) into the closed pose: width ×K, length ×sz. */
function fold(P, zH, sz) {
  return P.transform(g => { g.translate(0, -SH, -zH).scale(K_FOLD, K_FOLD, sz).translate(0, SH, zH); g.computeVertexNormals(); });
}
/** A thin triangular prism through three points (tent panel). */
function tri(a, b, c, th = 0.005) {
  const A = V(...a), u = V(...b).sub(A), v = V(...c).sub(A), n = u.clone().cross(v).normalize().multiplyScalar(th);
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(1, 0); sh.lineTo(0, 1); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
  g.applyMatrix4(new THREE.Matrix4().makeBasis(u, v, n).setPosition(A));
  return g;
}

// ------------------------------------------------------------------------------------------ canopy animation
function makeAnimate(cfg) {
  return function animateCanopy(w, st) {
    const cs = st.runner && st.runner.catalogState, c = cs && cs.canopy, ps = w.ps, dt = Math.min(0.1, Math.max(0, st.dt || 0));
    const hidden = !!cs && ((!!c && c.launched) || (!c && cs.naked > 0));
    const want = c && !c.launched && c.open ? 1 : 0;
    ps.bo = damp(ps.bo || 0, want, want ? cfg.openRate : cfg.foldRate, dt);
    ps.bv = damp(ps.bv === undefined ? 1 : ps.bv, hidden ? 0 : 1, 28, dt);
    // overshoot a little when the ribs snap open
    const e = smooth(ps.bo) + (want ? 0.05 * Math.sin(Math.PI * ps.bo) : 0), vis = ps.bv;
    const sx = (1 + (1 / K_FOLD - 1) * e) * vis, sz = (1 + (1 / cfg.sz - 1) * e) * (vis > 0.5 ? 1 : 0.2 + vis * 1.6);
    for (const name of ['canopy', 'canopyInk']) {
      const g = w.parts[name]; if (!g) continue;
      g.visible = vis > 0.02; g.scale.set(Math.max(1e-3, sx), Math.max(1e-3, sx), Math.max(1e-3, sz));
    }
  };
}

// ------------------------------------------------------------------------------------------ Splat Brella
function splat(d) {
  // Wmn_Shelter_Normal: small white pistol grip with a blue trigger, black shaft, black hub with the nozzle, an
  // octagonal grey / white umbrella with team-ink top panels and ink spike tips at the rib ends.
  const C = { grip: '#e9ecf0', blue: '#2c45b8', black: '#1c1d22', white: '#dadcdc', rim: '#9a9fa2', rib: '#2a2c31' };
  const zH = 0.6, R = 0.4, depth = 0.2, n = 8, SZ = 2.15;
  const body = new Pieces(), canopy = new Pieces(), inkP = new Pieces();
  const trig = pistolGrip(body, { color: C.grip, triggerColor: C.blue, guardColor: C.grip, baseColor: C.black });
  body.add(box(0.03, 0.026, 0.1, 0, 0.065, 0.0, 0.3), C.grip, M.satin);
  body.add(zcyl(0.0125, -0.06, zH + 0.01, 0, SH, 14), C.black, M.satin);
  body.add(zcyl(0.017, 0.03, 0.15, 0, SH, 14), C.black, M.rubber);
  body.add(zlathe([[0, zH - 0.04], [0.026, zH - 0.04], [0.024, zH + 0.012], [0.012, zH + 0.02], [0, zH + 0.02]], 0, SH, 0, 14), C.black, M.satin);
  const [o1, i1] = domeShell(R, depth, zH, 0, 0.62, n), [o2, i2] = domeShell(R, depth, zH, 0.62, 1, n);
  inkP.add(o1, '#f0b429', M.satin).add(i1, '#c98f1d', M.satin);
  canopy.add(o2, C.white, M.satin).add(i2, C.rim, M.satin);
  ribs(canopy, R, depth, zH, n, C.rib);
  for (let k = 0; k < n; k++) { const a = k * TAU / n; inkP.add(sphere(0.012, 0.012, 0.012, Math.cos(a) * R, SH + Math.sin(a) * R, zH - depth, 8, 6), '#f0b429', M.satin); }
  fold(canopy, zH, SZ); fold(inkP, zH, SZ);
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { trigger: part(trig, TRIGGER_PIVOT), canopy: part(canopy, [0, SH, zH], 'body'), canopyInk: part(inkP, [0, SH, zH], 'ink') },
    gripL: GRIP_L(0.09), muzzle: [0, SH, zH + 0.02],
  });
}

// ------------------------------------------------------------------------------------------ Tenta Brella
function tenta(d) {
  // Wmn_Shelter_Wide: black T-grip, dark shaft, a rectangular tent canopy (about 1.6 : 1) held by two crossed red
  // poles from the hub to the four corners; team-ink triangles left / right, olive panels top / bottom.
  const C = { black: '#202321', red: '#d8262c', olive: '#5c6440', dark: '#2c302c', tan: '#8c8260' };
  const zH = 0.85, a = 0.52, b = 0.32, depth = 0.22, SZ = 2.9, zc = zH - depth;
  const body = new Pieces(), canopy = new Pieces(), inkP = new Pieces();
  const trig = pistolGrip(body, { color: C.black, triggerColor: '#6a6f6a', guardColor: C.black, baseColor: C.black });
  body.add(box(0.03, 0.026, 0.1, 0, 0.065, 0.0, 0.3), C.black, M.satin);
  body.add(zcyl(0.0125, -0.06, zH + 0.01, 0, SH, 14), C.dark, M.satin);
  body.add(zcyl(0.017, 0.07, 0.2, 0, SH, 14), C.black, M.rubber);
  body.add(zlathe([[0, zH - 0.04], [0.03, zH - 0.04], [0.03, zH + 0.012], [0.015, zH + 0.022], [0, zH + 0.022]], 0, SH, 0, 14), C.black, M.satin);
  const H = [0, SH, zH], c = (sx, sy) => [sx * a, SH + sy * b, zc];
  inkP.add(tri(H, c(1, 1), c(1, -1)), '#58b838', M.satin).add(tri(H, c(-1, -1), c(-1, 1)), '#58b838', M.satin);
  canopy.add(tri(H, c(-1, 1), c(1, 1)), C.olive, M.satin).add(tri(H, c(1, -1), c(-1, -1)), C.dark, M.satin);
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    canopy.add(pipe([H, [sx * a * 0.5, SH + sy * b * 0.5, zH - depth * 0.45], [sx * a * 1.02, SH + sy * b * 1.02, zc - 0.012]], 0.0075, 6, 6), C.red, M.gloss);
    canopy.add(sphere(0.011, 0.011, 0.011, sx * a * 1.02, SH + sy * b * 1.02, zc - 0.012, 8, 6), C.black, M.satin);
  }
  canopy.add(box(0.06, 0.06, 0.03, 0, SH, zH - 0.012, 0.3), C.black, M.satin);
  fold(canopy, zH, SZ); fold(inkP, zH, SZ);
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { trigger: part(trig, TRIGGER_PIVOT), canopy: part(canopy, [0, SH, zH], 'body'), canopyInk: part(inkP, [0, SH, zH], 'ink') },
    gripL: GRIP_L(0.14), muzzle: [0, SH, zH + 0.022],
  });
}

// ------------------------------------------------------------------------------------------ Undercover Brella
function undercover(d) {
  // Wmn_Shelter_Compact: a plain black umbrella (8 ribs, thin metal tip), white shaft with gold ferrules and a green
  // status lamp, a brown wooden crook handle. The canopy is never launched.
  const C = { wood: '#7a5230', woodD: '#4a2f1a', white: '#e6e6e0', gold: '#c9a24a', cloth: '#2b2d33', rib: '#4a4d55' };
  const zH = 0.58, R = 0.38, depth = 0.17, n = 8, SZ = 2.3;
  const body = new Pieces(), canopy = new Pieces(), led = new Pieces();
  const trig = pistolGrip(body, { color: C.wood, triggerColor: C.gold, guard: false, base: false });
  body.add(pipe([[0, -0.056, -0.014], [0, -0.086, -0.03], [0, -0.078, -0.066], [0, -0.046, -0.074]], 0.0115, 10, 8), C.wood, M.satin);
  for (const t of [-0.02, 0.0, 0.02]) body.add(ring(0.013, 0.0012, 0, -0.03 + t, 0, 'y', 4, 12), C.woodD, M.satin);
  body.add(zcyl(0.011, -0.04, zH + 0.01, 0, SH, 12), C.white, M.satin);
  body.add(box(0.026, 0.02, 0.1, 0, 0.066, 0.0, 0.3), C.woodD, M.satin);
  body.add(zcyl(0.0145, 0.04, 0.05, 0, SH, 12), C.gold, M.metal).add(zcyl(0.0145, 0.2, 0.208, 0, SH, 12), C.gold, M.metal);
  body.add(zcyl(0.0135, 0.3, 0.45, 0, SH, 12), C.gold, M.metal);
  body.add(zlathe([[0, zH - 0.03], [0.018, zH - 0.03], [0.016, zH + 0.01], [0.006, zH + 0.025], [0, zH + 0.025]], 0, SH, 0, 12), C.gold, M.metal);
  led.add(sphere(0.004, 0.004, 0.004, 0.012, SH + 0.006, 0.18, 8, 6), '#3dff7a', M.led);
  const [o, i] = domeShell(R, depth, zH, 0, 1, n);
  canopy.add(o, C.cloth, M.satin).add(i, '#1b1c20', M.satin);
  ribs(canopy, R, depth, zH, n, C.rib, 0.0035, true, 0.02);
  for (let k = 0; k < n; k++) { const a = k * TAU / n; canopy.add(sphere(0.007, 0.007, 0.007, Math.cos(a) * (R + 0.02), SH + Math.sin(a) * (R + 0.02), zH - depth, 8, 6), C.rib, M.metal); }
  fold(canopy, zH, SZ);
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { trigger: part(trig, TRIGGER_PIVOT), led: part(led, [0.012, SH + 0.006, 0.18], 'lamp', { color: '#0f2a18', emissive: '#3dff7a', intensity: 1.2 }),
      canopy: part(canopy, [0, SH, zH], 'body') },
    gripL: GRIP_L(0.09), muzzle: [0, SH, zH + 0.025],
  });
}

// ------------------------------------------------------------------------------------------ Recycled Brella 24 Mk I
function recycled(d) {
  // Wmn_Shelter_Focus: a wagasa-style oil-paper umbrella: ~24 dark bamboo ribs under a shallow grey paper dome, a red
  // lacquered hub and handle (orange bent tip), black shaft, a green status ring on top of the hub.
  const C = { red: '#d9532a', black: '#1f1f23', paper: '#c4c8c6', rim: '#9a9e9c', bamboo: '#3f2a20' };
  const zH = 0.6, R = 0.44, depth = 0.15, n = 24, SZ = 3.0;
  const body = new Pieces(), canopy = new Pieces(), inkP = new Pieces(), led = new Pieces();
  const trig = pistolGrip(body, { color: C.red, triggerColor: C.black, guard: false, base: false });
  body.add(pipe([[0, -0.056, -0.014], [0, -0.084, -0.03], [0, -0.08, -0.064], [0, -0.05, -0.078]], 0.0115, 10, 8), C.red, M.gloss);
  body.add(zcyl(0.0115, -0.04, zH + 0.01, 0, SH, 12), C.black, M.satin);
  body.add(box(0.026, 0.02, 0.1, 0, 0.066, 0.0, 0.3), C.red, M.gloss);
  body.add(zcyl(0.016, 0.04, 0.16, 0, SH, 14), C.red, M.gloss);
  body.add(zlathe([[0, zH - 0.07], [0.028, zH - 0.07], [0.03, zH - 0.02], [0.024, zH + 0.01], [0.012, zH + 0.022], [0, zH + 0.022]], 0, SH, 0, 16), C.red, M.gloss);
  led.add(ring(0.026, 0.005, 0, SH, zH + 0.014, 'z', 4, 18), '#27e0a0', M.led);
  const [o, i] = domeShell(R, depth, zH, 0, 1, n, 0.004, 1.7);
  canopy.add(o, C.paper, M.satin).add(i, C.rim, M.satin);
  ribs(canopy, R, depth, zH, n, C.bamboo, 0.0032, true, 0.015);
  fold(canopy, zH, SZ);
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { trigger: part(trig, TRIGGER_PIVOT), led: part(led, [0, SH, zH + 0.014], 'lamp', { color: '#0a2a20', emissive: '#27e0a0', intensity: 1.3 }),
      canopy: part(canopy, [0, SH, zH], 'body') },
    gripL: GRIP_L(0.08), muzzle: [0, SH, zH + 0.022],
  });
}

export const MODELS = {
  's3-shelter-normal': { sourceModel: 'Wmn_Shelter_Normal', build: splat, animate: makeAnimate({ sz: 2.15, openRate: 16, foldRate: 9 }) },
  's3-shelter-wide': { sourceModel: 'Wmn_Shelter_Wide', build: tenta, animate: makeAnimate({ sz: 2.9, openRate: 10, foldRate: 7 }) },
  's3-shelter-compact': { sourceModel: 'Wmn_Shelter_Compact', build: undercover, animate: makeAnimate({ sz: 2.3, openRate: 16, foldRate: 9 }) },
  's3-shelter-focus': { sourceModel: 'Wmn_Shelter_Focus', build: recycled, animate: makeAnimate({ sz: 3.0, openRate: 16, foldRate: 9 }) },
};
