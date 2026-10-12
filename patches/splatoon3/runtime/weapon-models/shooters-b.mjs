// Shooter family models, group B (Splatoon 3 Ver.11.3.0 main weapons): Splattershot Pro, .96 Gal,
// Jet Squelcher, Splattershot Nova, L-3 Nozzlenose, H-3 Nozzlenose, Squeezer.
// Splattershot Pro and Jet Squelcher are solid models authored in metres from the official turntable
// videos (see their sections). The other five follow the official per-weapon 3D renders (Inkipedia
// "S3 Weapon Main <name> 3D", 400 px, muzzle to the right). Those renders are close perspective views, so each model traces the render's
// alpha silhouette (the IoU target) in the (z, y) plane, with the reference pixel frame of each render.
// Scale: the visible pistol handle below the receiver is 0.11 m, so s = 0.11 / handle length in
// reference pixels, with the handle centre at the origin. Internal model names come from Leanny/splat3
// ActorInfo (Fmdb). Everything is procedural geometry.
import { THREE, Pieces, M, V, at, box, lathe, zlathe, xlathe, ylathe, zcyl, xcyl, ycyl, ring, pipe, slab, smoothOutline, rotateAbout,
  mirrored, pistolGrip, gripSpec, part, rebuild, TRIGGER_PIVOT } from './kit.mjs';

// Reference pixel -> weapon space for a side render: (gx, gy) = handle centre in the image, s = metres/pixel.
// Returns [z, y] so that slab / zlathe outlines take it directly.
const px = (gx, gy, s) => (x, y) => [(x - gx) * s, (gy - y) * s];
const PISTOL_RAKE = Math.atan2(0.25, 1);

/** A grip spec along an axis raked `rake` radians from vertical (top forward), through the origin. */
const rakedGrip = rake => gripSpec([0, 0, 0], [0, Math.cos(rake), Math.sin(rake)], [0, Math.sin(rake), -Math.cos(rake)]);
/** The native support-hand spec (fist round a handle, thumb up) tilted about X by `tilt`. */
function supportGrip(pos, tilt = 0) {
  const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), tilt);
  return gripSpec(pos, V(0, 1, -0.12).applyQuaternion(q), V(0.45, -0.05, -1).applyQuaternion(q));
}
/** Pistol grip raked `rake` radians (top forward) about the handle centre; returns the trigger pieces. */
const raked = (body, rake, opt) => pistolGrip(body, { ...opt, rake: rake - PISTOL_RAKE });
/** A tube lying in the side plane through reference pixels; sx places it across the weapon. */
const sideTube = (P, pts, r, sx = 0, seg = 2) => pipe(pts.map(([x, y]) => { const [z, yy] = P(x, y); return [sx, yy, z]; }), r, seg, 6);
/** A side-plane outline (reference pixels) extruded across the weapon; n > 0 smooths it. */
function side(P, pts, thick, n = 0) {
  const o = pts.map(([x, y]) => P(x, y));
  return slab(n ? smoothOutline(o, n) : o, thick, 0, 0.004);
}
/** Coaxial lathe closed at both ends: cap = [[radius px, x px], ...] (radius 0 at the back, front face last). */
function capLathe(P, s, cap, yAxis, seg = 24) {
  const Z = x => P(x, 0)[0];
  const prof = [[0, Z(cap[0][1])], ...cap.map(([r, x]) => [r * s, Z(x)]), [0, Z(cap[cap.length - 1][1])]];
  return zlathe(prof, 0, yAxis, 0, seg);
}

// ------------------------------------------------------------------------------------------ shared solid helpers
/** Fillet every corner of a closed 2D polygon [[a, b], ...] with radius r (n arc steps per corner). */
function roundPoly(pts, r, n = 3) {
  const out = [], m = pts.length;
  for (let i = 0; i < m; i++) {
    const p = pts[i], a = pts[(i - 1 + m) % m], b = pts[(i + 1) % m];
    const ua = [a[0] - p[0], a[1] - p[1]], ub = [b[0] - p[0], b[1] - p[1]];
    const la = Math.hypot(...ua), lb = Math.hypot(...ub), rr = Math.min(r, la * 0.45, lb * 0.45);
    if (rr < 1e-5) { out.push(p); continue; }
    const pa = [p[0] + ua[0] / la * rr, p[1] + ua[1] / la * rr], pb = [p[0] + ub[0] / lb * rr, p[1] + ub[1] / lb * rr];
    for (let k = 0; k <= n; k++) {   // quadratic Bézier through the corner
      const t = k / n, u = 1 - t;
      out.push([u * u * pa[0] + 2 * u * t * p[0] + t * t * pb[0], u * u * pa[1] + 2 * u * t * p[1] + t * t * pb[1]]);
    }
  }
  return out;
}
/** Side-profile solid: outline [[z, y], ...] with filleted corners, extruded `thick` across X about x. */
const sideSolid = (pts, thick, r = 0.004, bevel = 0.004, x = 0) => slab(roundPoly(pts, r), thick, x, bevel);
/** Chamfered-rectangle loft along +Z: sections [{ z, y, w, h, c }] (full width / height, chamfer c). Flat facets. */
function chamferLoft(sections) {
  const ring = s => {
    const hw = s.w / 2, hh = s.h / 2, c = Math.min(s.c ?? 0.01, hw - 1e-4, hh - 1e-4), x0 = s.x ?? 0;
    return [[hw, hh - c], [hw - c, hh], [-hw + c, hh], [-hw, hh - c], [-hw, -hh + c], [-hw + c, -hh], [hw - c, -hh], [hw, -hh + c]]
      .map(([x, y]) => [x0 + x, s.y + y, s.z]);
  };
  const R = sections.map(ring), pos = [], idx = [];
  const quad = (a, b, c, d) => { const o = pos.length / 3; for (const v of [a, b, c, d]) pos.push(...v); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  for (let k = 0; k < R.length - 1; k++) for (let i = 0; i < 8; i++) { const j = (i + 1) % 8; quad(R[k][i], R[k][j], R[k + 1][j], R[k + 1][i]); }
  for (const [k, back] of [[0, true], [R.length - 1, false]]) {
    const o = pos.length / 3, s = sections[k]; pos.push(s.x ?? 0, s.y, s.z); for (const p of R[k]) pos.push(...p);
    for (let i = 0; i < 8; i++) { const a = o + 1 + i, b = o + 1 + (i + 1) % 8; back ? idx.push(o, b, a) : idx.push(o, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Flat-shaded triangles from vertex triples [[a, b, c], ...] (each a [x, y, z]); winding as given. */
function facets(tris) {
  const pos = [], idx = [];
  for (const t of tris) { const o = pos.length / 3; for (const v of t) pos.push(...v); idx.push(o, o + 1, o + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Thin print decal lying on a side face (x = ±face) from a side outline [[z, y], ...]. */
const decal = (pts, sx, face) => slab(pts, 0.0008, sx * (face + 0.0004), 0);
/** A grip spec for a fore-grip along a horizontal tube (thumb toward the muzzle, wrist under and to the left). */
const tubeGrip = pos => gripSpec(pos, [0, 0, 1], [0.75, -0.62, -0.1]);

// ------------------------------------------------------------------------------------------ Splattershot Pro
// Wmn_Shooter_Expert. Proportions from the true-side frame of the official turntable "S3 Splattershot Pro
// FRZ-N model rotating.mp4" (same mesh, other kit; frame rotated so the barrel is level), colours and the
// ink parts from the base "S3 Weapon Main Splattershot Pro 3D" render (its pale tank is team ink, as on the
// Splattershot and in the S2/S3 promo art). Overall length ≈ 0.74 m (handle-scaled, image-estimated).
// Built as solids: a conical ink tank (wide at the back) with a navy collar and a domed rear, a thick red
// hose leaving the rear dome, looping round to the RIGHT flank only and running forward into the frame
// above the grip, a cream rail under the tank ending in a bracket with a navy knob, a faceted navy
// receiver with a swept sight crown and a thin blade on top, a silver wedge on each flank, an 8-sided
// nose cone with a red tip, a navy finned shroud (cream fins) under the receiver with a small red jet
// under the nose, and a raked navy grip with a red insert, red trigger and navy trigger guard.
function expert(d) {
  const C = { navy: '#2a4896', dnavy: '#1d3268', lnavy: '#3d62b8', cream: '#e7e3d6', silver: '#d6d3ca', red: '#e0262e',
    dred: '#a8151c', black: '#18191d' };
  const AX = 0.130, TY = 0.123, RAKE = 0.23;                    // barrel axis, tank axis, grip rake
  const body = new Pieces(), can = new Pieces(), trig = new Pieces();
  // ---- ink tank (team colour, pulses per shot): domed rear, cone forward, neck into the receiver
  const tr = z => 0.070 + (z + 0.20) * (0.044 - 0.070) / 0.296;
  can.add(zlathe([[0, -0.256], [0.045, -0.256], [0.055, -0.247], [0.063, -0.234], [0.0685, -0.218],
    [tr(-0.20), -0.20], [tr(0.0), 0.0], [tr(0.09), 0.09], [0.040, 0.10], [0.036, 0.106], [0.036, 0.165], [0, 0.165]], 0, TY, 0, 30), '#ecebe6');
  // navy collars: wide band at the shoulder, slim front band; a navy end cap closes the narrow back
  const band = (z0, z1, dr, col = C.navy) => body.add(zlathe([[0, z0], [tr(z0) + dr * 0.6, z0], [tr(z0) + dr, z0 + 0.004],
    [tr(z1) + dr, z1 - 0.004], [tr(z1) + dr * 0.6, z1], [0, z1]], 0, TY, 0, 30), col, M.gloss);
  band(-0.205, -0.163, 0.0065);
  band(0.083, 0.103, 0.006);
  body.add(zlathe([[0, -0.285], [0.030, -0.285], [0.042, -0.282], [0.0475, -0.275], [0.0485, -0.257], [0.046, -0.251], [0, -0.251]], 0, TY, 0, 30),
    C.navy, M.gloss);
  body.add(ring(0.0475, 0.0016, 0, TY, -0.268, 'z', 4, 30), C.dnavy, M.satin);
  // rear hose port: a grommet in the middle of the end cap
  body.add(zlathe([[0, -0.293], [0.016, -0.293], [0.0205, -0.289], [0.0205, -0.282], [0, -0.282]], 0, TY, 0, 18), C.lnavy, M.gloss);
  // ---- red hose: out of the rear end cap, a tight loop out to the right flank, forward and down into the frame
  const hose = [[0, TY, -0.284], [-0.003, TY, -0.302], [-0.019, TY - 0.003, -0.319], [-0.046, TY - 0.008, -0.325], [-0.071, TY - 0.015, -0.313],
    [-0.087, TY - 0.024, -0.286], [-0.093, TY - 0.033, -0.245], [-0.092, TY - 0.040, -0.17], [-0.087, TY - 0.046, -0.09],
    [-0.074, 0.074, -0.03], [-0.054, 0.069, 0.0], [-0.036, 0.066, 0.014]];
  body.add(pipe(hose, 0.0125, 56, 14), C.red, M.gloss);
  // navy clamp where the hose enters the frame, just above the grip
  body.add(sideSolid([[-0.022, 0.044], [0.03, 0.044], [0.03, 0.086], [-0.012, 0.086]], 0.026, 0.005, 0.004, -0.03), C.navy, M.gloss);
  // ---- cream rail under the tank, rear bracket with a navy knob
  body.add(sideSolid([[-0.218, 0.028], [-0.170, 0.030], [-0.165, 0.046], [0.0, 0.052], [0.12, 0.060], [0.15, 0.064], [0.15, 0.078],
    [0.0, 0.072], [-0.16, 0.064], [-0.17, 0.082], [-0.205, 0.082], [-0.222, 0.05]], 0.024, 0.006, 0.004), C.cream, M.satin);
  body.add(xlathe([[0, -0.024], [0.0115, -0.024], [0.0125, -0.02], [0.0125, 0.02], [0.0115, 0.024], [0, 0.024]], 0, 0.045, -0.196, 16), C.navy, M.gloss);
  for (const sx of [-1, 1]) body.add(xcyl(0.005, sx * 0.024, sx * 0.0262, 0.045, -0.196, 12), C.lnavy, M.gloss);
  // ---- receiver: faceted navy block from the tank neck to the nose flange
  body.add(chamferLoft([{ z: 0.138, y: AX - 0.002, w: 0.074, h: 0.086, c: 0.021 }, { z: 0.158, y: AX, w: 0.086, h: 0.098, c: 0.023 },
    { z: 0.262, y: AX, w: 0.090, h: 0.100, c: 0.024 }, { z: 0.268, y: AX, w: 0.100, h: 0.110, c: 0.027 }, { z: 0.282, y: AX, w: 0.100, h: 0.110, c: 0.027 }]),
    C.navy, M.gloss);
  // red mark on the exposed tank neck, dark panel line across the receiver flanks
  for (const sx of [-1, 1]) {
    body.add(box(0.003, 0.012, 0.016, sx * 0.0352, AX + 0.004, 0.122, 0.4, 6, 4), C.red, M.gloss);
    body.add(box(0.002, 0.05, 0.005, sx * 0.0452, AX - 0.004, 0.245, 0.3, 6, 4), C.dnavy, M.satin);
  }
  // nose cone: 8 facets with a lighter inset band, red tip with a dark bore
  body.add(at(lathe([[0, 0.278], [0.057, 0.278], [0.057, 0.292], [0.051, 0.302], [0.040, 0.34], [0.034, 0.362], [0.030, 0.368], [0, 0.368]], 8)
    .rotateY(Math.PI / 8).rotateX(Math.PI / 2), 0, AX, 0), C.navy, M.gloss);
  body.add(at(lathe([[0.0472, 0.312], [0.0482, 0.315], [0.0452, 0.329], [0.0442, 0.326]], 8).rotateY(Math.PI / 8).rotateX(Math.PI / 2), 0, AX, 0),
    C.lnavy, M.gloss);
  body.add(zlathe([[0, 0.363], [0.0205, 0.363], [0.0216, 0.372], [0.0208, 0.388], [0.0165, 0.398], [0.0078, 0.4015], [0.0066, 0.3965], [0, 0.3965]],
    0, AX, 0, 22), C.red, M.gloss);
  body.add(zcyl(0.0067, 0.393, 0.3968, 0, AX, 14), C.dred, M.satin);
  // silver wedges on both flanks: apex pointing back, ridge level with the barrel
  for (const sx of [-1, 1]) {
    const A = [sx * 0.040, AX, 0.150], T = [sx * 0.045, AX + 0.043, 0.276], O = [sx * 0.070, AX, 0.276], B = [sx * 0.045, AX - 0.041, 0.276];
    const tris = [[A, O, T], [A, B, O], [T, O, B]];
    body.add(facets(sx < 0 ? tris : tris.map(([a, b, c]) => [a, c, b])), C.silver, M.gloss);
  }
  // ---- sight crown on top: swept rear fin, raised block with a cross knob, thin blade behind the nose
  body.add(sideSolid([[0.032, 0.242], [0.052, 0.236], [0.078, 0.214], [0.104, 0.206], [0.11, 0.174], [0.07, 0.174], [0.05, 0.196]], 0.014, 0.004, 0.003),
    C.navy, M.gloss);
  body.add(sideSolid([[0.084, 0.174], [0.09, 0.206], [0.118, 0.224], [0.150, 0.231], [0.190, 0.231], [0.206, 0.218], [0.214, 0.198], [0.22, 0.174]],
    0.044, 0.005, 0.005), C.navy, M.gloss);
  for (const sx of [-1, 1]) body.add(decal(roundPoly([[0.122, 0.212], [0.188, 0.218], [0.199, 0.206], [0.13, 0.202]], 0.002), sx, 0.022), C.cream, M.print);
  body.add(xlathe([[0, -0.027], [0.0105, -0.027], [0.0115, -0.023], [0.0115, 0.023], [0.0105, 0.027], [0, 0.027]], 0, 0.226, 0.104, 16), C.dnavy, M.gloss);
  body.add(sideSolid([[0.254, 0.176], [0.282, 0.176], [0.274, 0.196], [0.270, 0.252], [0.263, 0.253], [0.260, 0.198]], 0.006, 0.002, 0.0015),
    C.silver, M.gloss);
  // ---- under the receiver: cream frame, navy finned shroud (cream fins in its slots), small red jet
  body.add(sideSolid([[-0.03, 0.046], [0.10, 0.050], [0.29, 0.066], [0.29, 0.086], [0.10, 0.086], [-0.03, 0.074]], 0.030, 0.004, 0.004), C.cream, M.satin);
  body.add(sideSolid([[0.118, 0.088], [0.288, 0.088], [0.300, 0.064], [0.290, 0.040], [0.262, 0.024], [0.160, 0.026], [0.130, 0.040]],
    0.064, 0.007, 0.006), C.navy, M.gloss);
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
    const z = 0.168 + k * 0.03;
    body.add(rotateAbout(box(0.004, 0.044, 0.011, sx * 0.0322, 0.058, z, 0.3, 6, 4), [1, 0, 0], -0.42, [0, 0.058, z]), C.cream, M.satin);
  }
  body.add(zlathe([[0, 0.268], [0.0095, 0.268], [0.0095, 0.300], [0.0082, 0.306], [0.0042, 0.307], [0, 0.307]], 0, 0.056, 0, 16), C.red, M.gloss);
  // ---- raked navy grip (fist round the native handle axis), red insert, red trigger, navy guard
  const grip = new Pieces();
  grip.add(sideSolid([[-0.017, -0.050], [-0.023, -0.060], [0.018, -0.062], [0.020, -0.052], [0.0145, -0.03], [0.0155, 0.0], [0.0145, 0.03],
    [0.016, 0.056], [-0.018, 0.056], [-0.0165, 0.0]], 0.027, 0.006, 0.0065), C.navy, M.rubber);
  for (const sx of [-1, 1]) grip.add(decal(roundPoly([[0.004, 0.006], [0.0135, 0.006], [0.0135, 0.04], [0.004, 0.036]], 0.002), sx, 0.0135), C.red, M.gloss);
  body.merge(grip.transform(g => g.rotateX(RAKE)));
  trig.add(sideSolid([[0.025, 0.036], [0.033, 0.033], [0.037, 0.021], [0.035, 0.008], [0.029, 0.004], [0.030, 0.016], [0.027, 0.030]], 0.007, 0.002, 0.0015),
    C.red, M.gloss);
  body.add(sideSolid([[0.012, -0.004], [0.062, -0.006], [0.074, 0.004], [0.074, 0.05], [0.063, 0.05], [0.063, 0.011], [0.058, 0.006], [0.016, 0.006]],
    0.011, 0.003, 0.003), C.navy, M.gloss);
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { can: part(can, [0, TY, -0.07], 'ink'), trigger: part(trig, TRIGGER_PIVOT) },
    gripR: rakedGrip(RAKE),
    // S2/S3 promo art: the left palm sits under the finned shroud below the receiver
    gripL: supportGrip([0, 0.03, 0.205], 0),
    muzzle: [0, AX, 0.402],
  });
}

// ------------------------------------------------------------------------------------------ .96 Gal
function heavy(d) {
  // Wmn_Shooter_Heavy: black shoulder stock with a hooked butt, a round ink tank (team colour, pulses
  // per shot) on a black frame with pink clips, a sand-grey barrel with a black front ring and a pink
  // muzzle band, a black front bracket and foot plate, a pink raked grip, silver trigger guard.
  const s = 0.11 / 88, P = px(88, 236, s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { black: '#2b2c2f', dark: '#353738', pink: '#e0208a', barrel: '#9d9a92', silver: '#8f9298' };
  const RAKE = 0.40;
  const body = new Pieces(), can = new Pieces();
  body.add(side(P, [[0, 157], [12, 152], [24, 149], [48, 141], [60, 137], [70, 134], [72, 190], [60, 200], [48, 207],
    [36, 251], [24, 251], [12, 223], [0, 171]], 0.05, 16), C.black, M.satin);
  const ty = Y(186), tz0 = Z(96), tz1 = Z(226), R = 66 * s;
  can.add(zlathe([[0, tz0], [R * 0.9, tz0], [R, tz0 + 0.015], [R, tz1 - 0.015], [R * 0.9, tz1], [0, tz1]], 0, ty, 0, 32),
    '#e8e6e0', M.gloss);
  body.add(side(P, [[80, 120], [190, 116], [196, 130], [80, 136]], 0.03), C.dark, M.satin);
  for (const x of [120, 170]) body.add(side(P, [[x, 116], [x + 14, 116], [x + 14, 132], [x, 132]], 0.03), C.pink, M.gloss);
  body.add(side(P, [[246, 140], [254, 96], [266, 84], [276, 92], [274, 120], [268, 142]], 0.02), C.black, M.satin);
  // black coupling ring between the tank and the canister barrel (the top fin stands on it)
  body.add(zlathe([[0, Z(224)], [44 * s, Z(224)], [46 * s, Z(232)], [46 * s, Z(282)], [36 * s, Z(290)], [0, Z(290)]], 0, Y(184), 0, 28), C.black, M.satin);
  body.add(zlathe([[0, Z(288)], [27 * s, Z(288)], [27 * s, Z(356)], [32 * s, Z(360)], [32 * s, Z(386)], [27 * s, Z(388)],
    [0, Z(388)]], 0, Y(184), 0, 24), C.barrel, M.satin);
  body.add(zlathe([[0, Z(388)], [24 * s, Z(388)], [24 * s, Z(397)], [20 * s, Z(397)], [0, Z(397)]], 0, Y(184), 0, 20), C.pink, M.gloss);
  body.add(side(P, [[286, 150], [302, 150], [308, 236], [318, 289], [306, 290], [296, 246], [286, 240]], 0.02), C.black, M.satin);
  body.add(side(P, [[316, 246], [330, 244], [372, 286], [362, 292]], 0.03), C.dark, M.satin);
  body.add(sideTube(P, [[100, 262], [94, 280], [120, 286], [160, 285], [182, 276], [186, 262]], 2.5 * s, 0, 2), C.silver, M.metal);
  const trig = raked(body, RAKE, { color: C.pink, triggerColor: C.black, guardColor: C.silver });
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { can: part(can, [0, ty, (tz0 + tz1) / 2], 'ink'), trigger: part(trig, TRIGGER_PIVOT) },
    gripR: rakedGrip(RAKE),
    gripL: supportGrip([0, Y(228), Z(300)], 0),
    muzzle: [0, Y(184), Z(397)],
  });
}

// ------------------------------------------------------------------------------------------ Jet Squelcher
// Wmn_Shooter_Long, a pressure-washer gun. Proportions from the true-side frame of the official turntable
// "S3 Jet Squelcher COB-R model rotating.mp4" (same mesh, other kit; frame rotated so the lance is level),
// colours and the ink part from the base "S3 Weapon Main Jet Squelcher 3D" render (its pale nozzle sleeve
// is team ink; yellow on the S3 Custom promo render). Overall length ≈ 0.82 m (image-estimated).
// Two solids joined by the handle: an upper gun body (narrow, tall at the back, sloping down to the lance;
// dark rear end cap and underside block, side vents and a label, a big black knob on each flank, a
// ribbed black fitting carrying the thin black lance and the ink nozzle) and a lower pump block (open
// D-loop at the back with a rubber bar, dark front panel with two knobs, vents) hanging under the hand.
// A black hose leaves the lance fitting, loops over it on the right and drops into the pump block.
function longJet(d) {
  const C = { teal: '#0b6b6e', dteal: '#08585b', dark: '#2b3032', black: '#151618', white: '#e9ece6', steel: '#8b9196' };
  const LY = 0.0627, RAKE = 0.175;                               // lance axis height, handle rake
  const body = new Pieces(), ink = new Pieces(), trig = new Pieces();
  // ---- upper gun body
  const UW = 0.050;
  body.add(sideSolid([[-0.090, 0.175], [-0.050, 0.170], [0.044, 0.154], [0.110, 0.140], [0.177, 0.124], [0.244, 0.112], [0.297, 0.100],
    [0.318, 0.092], [0.326, 0.082], [0.327, 0.036], [0.313, 0.022], [0.285, 0.008], [0.240, 0.0], [0.190, 0.002], [0.124, 0.008], [0.064, 0.022],
    [0.0, 0.031], [-0.05, 0.044], [-0.083, 0.075], [-0.093, 0.115]], UW, 0.012, 0.009), C.teal, M.satin);
  // dark underside block (rear-lower quarter) and the faceted dark rear end cap with its centre seam
  body.add(sideSolid([[-0.096, 0.156], [-0.096, 0.100], [-0.087, 0.072], [-0.05, 0.041], [0.0, 0.0285], [0.045, 0.0235], [0.066, 0.022],
    [0.060, 0.036], [-0.076, 0.134], [-0.086, 0.156]], UW + 0.003, 0.006, 0.005), C.dark, M.satin);
  body.add(chamferLoft([{ z: -0.104, y: 0.135, w: 0.044, h: 0.07, c: 0.016 }, { z: -0.090, y: 0.135, w: 0.054, h: 0.084, c: 0.018 }]), C.dark, M.satin);
  body.add(box(0.0016, 0.07, 0.003, 0, 0.135, -0.1045, 0.2, 4, 4), C.black, M.satin);
  for (const sx of [-1, 1]) {
    // label strip near the top, five vent grooves under it (parallel to the sloping top), warning prints
    const along = (z0, z1, y0, h) => { const k = -0.16; return [[z0, y0 + k * z0], [z1, y0 + k * z1], [z1, y0 + h + k * z1], [z0, y0 + h + k * z0]]; };
    body.add(decal(along(-0.082, -0.022, 0.150, 0.010), sx, UW / 2), C.white, M.print);
    for (let k = 0; k < 5; k++) body.add(decal(along(-0.080, -0.026, 0.139 - k * 0.0085, 0.0034), sx, UW / 2), C.black, M.print);
    body.add(decal([[0.035, 0.112], [0.051, 0.112], [0.043, 0.126]], sx, UW / 2), C.white, M.print);
    body.add(decal(roundPoly([[0.060, 0.106], [0.074, 0.106], [0.074, 0.120], [0.060, 0.120]], 0.007, 2), sx, UW / 2), C.white, M.print);
    body.add(decal(roundPoly([[0.083, 0.102], [0.093, 0.102], [0.093, 0.116], [0.083, 0.116]], 0.002), sx, UW / 2), C.white, M.print);
    // screws
    for (const [z, y] of [[-0.075, 0.09], [0.030, 0.034], [0.29, 0.03]]) {
      body.add(xcyl(0.0035, sx * UW / 2, sx * (UW / 2 + 0.0015), y, z, 10), C.steel, M.metal);
    }
    // big black knob on each flank (adjuster), knurled rim
    const kz = 0.2306, ky = 0.047, f = UW / 2 - 0.003;
    const kn = xlathe([[0, 0], [0.026, 0], [0.027, 0.006], [0.0255, 0.012], [0.018, 0.013], [0.0155, 0.017], [0, 0.017]], 0, 0, 0, 28);
    body.add(at(sx < 0 ? mirrored(kn) : kn, sx * f, ky, kz), C.black, M.rubber);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      body.add(box(0.008, 0.003, 0.003, sx * (f + 0.0065), ky + Math.cos(a) * 0.0265, kz + Math.sin(a) * 0.0265, 0.5, 4, 4), C.black, M.rubber);
    }
  }
  // ribbed black fitting at the front, thin black lance, ink nozzle with a dark bore
  body.add(zlathe([[0, 0.316], [0.0205, 0.316], [0.0215, 0.33], [0.0185, 0.345], [0.0135, 0.352], [0.0135, 0.398], [0.0105, 0.405], [0.008, 0.41], [0, 0.41]],
    0, LY, 0, 24), C.black, M.rubber);
  for (let k = 0; k < 6; k++) body.add(ring(0.0138, 0.0017, 0, LY, 0.357 + k * 0.0075, 'z', 4, 14), C.black, M.rubber);
  body.add(zcyl(0.0068, 0.405, 0.556, 0, LY, 14), C.black, M.metal);
  ink.add(zlathe([[0, 0.548], [0.0095, 0.548], [0.0105, 0.556], [0.019, 0.561], [0.0238, 0.569], [0.0238, 0.582], [0.0212, 0.585], [0.0212, 0.591],
    [0.0238, 0.594], [0.0238, 0.603], [0.0212, 0.606], [0.0212, 0.612], [0.0238, 0.615], [0.0232, 0.652], [0.0205, 0.661], [0.0085, 0.6635],
    [0.0045, 0.659], [0, 0.659]], 0, LY, 0, 26), '#cfe5de', M.gloss);
  body.add(zcyl(0.0046, 0.655, 0.6602, 0, LY, 12), C.black, M.satin);
  // black hose: out of the fitting, a loop over the lance on the right, down into the pump block
  body.add(pipe([[-0.002, 0.076, 0.33], [-0.008, 0.093, 0.343], [-0.015, 0.102, 0.367], [-0.020, 0.090, 0.391], [-0.023, LY, 0.399],
    [-0.022, 0.034, 0.388], [-0.020, 0.015, 0.355], [-0.018, 0.003, 0.318], [-0.016, -0.013, 0.294], [-0.014, -0.032, 0.284]], 0.0046, 40, 8),
  C.black, M.rubber);
  body.add(ycyl(0.0085, -0.040, -0.026, -0.014, 0.284, 14), C.black, M.rubber);
  // ---- lower pump block: C-shaped rear (open D-loop), vents, dark front panel with two knobs
  const LW = 0.056;
  body.add(sideSolid([[-0.160, -0.044], [-0.090, -0.037], [-0.023, -0.033], [0.044, -0.028], [0.110, -0.023], [0.177, -0.023], [0.244, -0.028],
    [0.304, -0.039], [0.313, -0.048], [0.314, -0.099], [0.304, -0.108], [0.244, -0.124], [0.177, -0.141], [0.110, -0.157], [0.044, -0.164],
    [-0.023, -0.164], [-0.090, -0.161], [-0.163, -0.150], [-0.163, -0.134], [-0.142, -0.136], [-0.118, -0.132], [-0.103, -0.118],
    [-0.098, -0.099], [-0.103, -0.080], [-0.118, -0.066], [-0.142, -0.062], [-0.160, -0.060]], LW, 0.006, 0.008), C.teal, M.satin);
  // rubber bar across the open back of the D-loop
  body.add(ylathe([[0, -0.143], [0.0095, -0.143], [0.0105, -0.136], [0.0105, -0.066], [0.0095, -0.058], [0, -0.058]], 0, 0, -0.151, 16), C.black, M.rubber);
  for (let k = 0; k < 7; k++) body.add(ring(0.0108, 0.0016, 0, -0.130 + k * 0.0105, -0.151, 'y', 4, 12), C.black, M.rubber);
  body.add(sideSolid([[0.168, -0.021], [0.244, -0.026], [0.305, -0.036], [0.317, -0.046], [0.318, -0.101], [0.306, -0.111], [0.262, -0.118],
    [0.214, -0.090], [0.168, -0.050]], LW + 0.003, 0.006, 0.005), C.dark, M.satin);
  for (const sx of [-1, 1]) {
    for (const [z, y] of [[0.217, -0.047], [0.258, -0.068]]) {
      body.add(xcyl(0.0092, sx * (LW / 2), sx * (LW / 2 + 0.0055), y, z, 18), C.black, M.rubber);
      body.add(xcyl(0.0055, sx * (LW / 2), sx * (LW / 2 + 0.0075), y, z, 14), C.black, M.rubber);
    }
    const vent = (z, w, y0, y1) => body.add(decal(roundPoly([[z, y0], [z + w, y0], [z + w, y1], [z, y1 - 0.001]], 0.002), sx, LW / 2), C.black, M.print);
    for (let k = 0; k < 3; k++) vent(0.050 + k * 0.017, 0.009, -0.076, -0.051);
    for (let k = 0; k < 4; k++) vent(0.010 + k * 0.022, 0.012, -0.156, -0.130);
    for (const [z, y] of [[-0.07, -0.05], [-0.07, -0.148], [0.15, -0.03], [0.29, -0.104]]) {
      body.add(xcyl(0.0035, sx * LW / 2, sx * (LW / 2 + 0.0015), y, z, 10), C.steel, M.metal);
    }
  }
  // ---- handle between the two bodies (raked; fist round the native axis), vents, dark trigger
  const handle = new Pieces();
  handle.add(sideSolid([[-0.021, -0.058], [0.021, -0.058], [0.0215, 0.0], [0.021, 0.058], [-0.021, 0.058], [-0.0215, 0.0]], 0.029, 0.007, 0.007),
    C.teal, M.satin);
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) {
    const y = -0.022 + k * 0.011;
    handle.add(decal(roundPoly([[-0.011, y], [0.012, y + 0.002], [0.012, y + 0.0055], [-0.011, y + 0.0035]], 0.0012, 1), sx, 0.0145), C.black, M.print);
  }
  body.merge(handle.transform(g => g.rotateX(RAKE)));
  trig.add(sideSolid([[0.022, 0.037], [0.031, 0.034], [0.035, 0.022], [0.033, 0.010], [0.027, 0.006], [0.028, 0.018], [0.024, 0.031]], 0.009, 0.002, 0.002),
    C.dark, M.satin);
  return rebuild(d, {
    body, ink,
    parts: { trigger: part(trig, TRIGGER_PIVOT) },
    gripR: rakedGrip(RAKE),
    // the support hand closes round the front of the gun body, under the knobs (image-estimated)
    gripL: tubeGrip([0, 0.03, 0.26]),
    muzzle: [0, LY, 0.664],
  });
}

// ------------------------------------------------------------------------------------------ Splattershot Nova
function nova(d) {
  // Wmn_Shooter_QuickLong: white rear tank (ink tank, pulses per shot) over a dark purple front body,
  // a yellow lens on the top front, a white ribbed fore-end and a yellow nozzle tube out of its front,
  // dark purple raked grip.
  const s = 0.11 / 66, P = px(118, 265, s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { white: '#ececea', purple: '#3a3347', dpurple: '#2a2535', yellow: '#e9e22a', grey: '#5b5566', trig: '#7a58c8' };
  const RAKE = 0.42;
  const body = new Pieces(), can = new Pieces();
  const ty = Y(170), tz0 = Z(30), tz1 = Z(186);
  can.add(side(P, [[30, 156], [60, 128], [100, 118], [140, 118], [176, 122], [186, 150], [180, 206], [160, 228], [120, 230],
    [76, 226], [40, 206], [28, 180]], 0.06, 16), C.white, M.gloss);
  body.add(side(P, [[170, 122], [240, 120], [272, 116], [292, 128], [296, 200], [288, 246], [262, 268], [240, 254], [200, 246],
    [172, 232]], 0.07, 16), C.purple, M.satin);
  body.add(side(P, [[270, 114], [300, 102], [306, 114], [290, 122]], 0.02), C.dpurple, M.satin);
  body.add(zlathe([[0, Z(330)], [26 * s, Z(332)], [26 * s, Z(380)], [0, Z(382)]], 0, ty, 0, 24), C.yellow, M.gloss);
  body.add(zlathe([[0, Z(222)], [25 * s, Z(222)], [25 * s, Z(300)], [0, Z(300)]], 0, Y(240), 0, 24), C.white, M.gloss);
  for (const z of [236, 252, 268, 284]) body.add(zcyl(26 * s, Z(z), Z(z + 4), 0, Y(240), 20), C.dpurple, M.satin);
  body.add(zlathe([[0, Z(296)], [24 * s, Z(298)], [16 * s, Z(318)], [16 * s, Z(382)], [14 * s, Z(384)], [0, Z(384)]], 0, Y(237), 0, 22),
    C.yellow, M.gloss);
  const trig = raked(body, RAKE, { color: C.grey, triggerColor: C.trig, guardColor: C.dpurple });
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { can: part(can, [0, ty, (tz0 + tz1) / 2], 'body'), trigger: part(trig, TRIGGER_PIVOT) },
    gripR: rakedGrip(RAKE),
    gripL: supportGrip([0, Y(256), Z(246)], 0),
    muzzle: [0, Y(237), Z(384)],
  });
}

// ------------------------------------------------------------------------------------------ Nozzlenose (L-3 / H-3)
/** Shared Nozzlenose frame: a reel (blue flanges, ribbed core = the ink hose, pulses per shot), a black frame,
 *  a coupler, a collar and a big nozzle cap set higher than the reel axis. Per-model numbers in `o`. */
function nozzlenose(d, o) {
  const P = px(o.gx, o.gy, o.s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { blue: '#2a3ec2', black: '#1e1f23', silver: '#9aa0aa', reel: '#c9c8dc' };
  const body = new Pieces(), can = new Pieces();
  const reelY = Y(o.reelY), nozY = Y(o.nozY), R = o.reelR * o.s, Rc = o.coreR * o.s;
  const [f0, f1, f2, f3] = o.reel;
  for (const [a, b] of [[f0, f1], [f2, f3]]) body.add(zcyl(R, Z(a), Z(b), 0, reelY, 28), C.blue, M.gloss);
  can.add(zcyl(Rc, Z(f1), Z(f2), 0, reelY, 28), C.reel, M.satin);
  for (let x = f1 + 6; x < f2; x += 9) can.add(ring(Rc + 0.0006, 0.0012, 0, reelY, Z(x), 'z', 4, 24), C.reel, M.satin);
  body.add(side(P, o.bar, 0.035), o.barColor, M.satin);
  body.add(side(P, o.front, 0.035), C.black, M.satin);
  body.add(side(P, o.rear, 0.035), C.black, M.satin);
  body.add(zcyl(o.couplerR * o.s, Z(o.coupler[0]), Z(o.coupler[1]), 0, nozY, 6), C.silver, M.metal);
  if (o.collar) body.add(zcyl(o.collarR * o.s, Z(o.collar[0]), Z(o.collar[1]), 0, nozY, 24), o.collarColor, M.gloss);
  body.add(capLathe(P, o.s, o.cap, nozY, 30), o.capColor, M.gloss);
  const trig = raked(body, o.rake, { color: o.gripColor, triggerColor: C.black, guardColor: C.black, w: o.w });
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { can: part(can, [0, reelY, Z((f1 + f2) / 2)], 'body'), trigger: part(trig, TRIGGER_PIVOT) },
    gripR: rakedGrip(o.rake),
    gripL: supportGrip([0, Y(o.supY), Z(o.supX)], 0),
    muzzle: [0, nozY, Z(o.muzzleX)],
  });
}
const L3 = {
  s: 0.11 / 100, gx: 60, gy: 268, reelY: 181, nozY: 142, reel: [78, 98, 176, 196], reelR: 62, coreR: 50,
  coupler: [216, 252], couplerR: 22, collar: [252, 300], collarR: 27, collarColor: '#7ccfb8',
  cap: [[44, 300], [52, 312], [56, 336], [54, 360], [46, 372], [44, 376]], capColor: '#2a3ec2', muzzleX: 377,
  rake: 0.21, w: 0.014, gripColor: '#1e1f23', supY: 256, supX: 150, barColor: '#1e1f23',
  bar: [[96, 98], [236, 100], [240, 122], [104, 122]], front: [[196, 120], [216, 116], [222, 268], [204, 270]],
  rear: [[70, 126], [92, 124], [96, 262], [72, 262]],
};
const H3 = {
  s: 0.11 / 84, gx: 36, gy: 262, reelY: 187, nozY: 159, reel: [80, 100, 180, 200], reelR: 67, coreR: 49,
  coupler: [212, 256], couplerR: 25, collar: [256, 300], collarR: 22, collarColor: '#3b3d44',
  cap: [[20, 300], [32, 320], [45, 336], [53, 352], [53, 368], [46, 380], [44, 384]], capColor: '#26282d', muzzleX: 388,
  rake: 0.39, w: 0.0125, gripColor: '#2b43b8', supY: 262, supX: 170, barColor: '#2a3ec2',
  bar: [[64, 104], [192, 96], [196, 110], [72, 120]], front: [[200, 120], [216, 116], [222, 252], [206, 258]],
  rear: [[70, 124], [90, 124], [96, 252], [76, 252]],
};
const nozzleL3 = d => nozzlenose(d, L3);
const nozzleH3 = d => nozzlenose(d, H3);

// ------------------------------------------------------------------------------------------ Squeezer
function squeezer(d) {
  // Wmn_Shooter_Flash: a white ink bulb (pulses per shot; the red stripes of the render are not modelled yet),
  // a black glass neck, a cream cap with a ring, two silver straps on the bulb, an orange-brown raked grip.
  const s = 0.11 / 64, P = px(36, 274, s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { white: '#ececea', black: '#1d1e22', silver: '#8c8f96', cream: '#e5e2d8', wood: '#a85d2a' };
  const RAKE = 0.49;
  const body = new Pieces(), can = new Pieces();
  const by = Y(166), bz0 = Z(40), bz1 = Z(206);
  can.add(zlathe([[0, bz0], [30 * s, Z(50)], [62 * s, Z(70)], [74 * s, Z(96)], [76 * s, Z(140)], [72 * s, Z(176)], [56 * s, Z(200)],
    [52 * s, bz1], [0, bz1]], 0, by, 0, 32), C.white, M.gloss);
  body.add(zlathe([[0, Z(196)], [52 * s, Z(204)], [50 * s, Z(224)], [44 * s, Z(256)], [34 * s, Z(300)], [32 * s, Z(340)],
    [31 * s, Z(344)], [0, Z(344)]], 0, by, 0, 28), C.black, M.gloss);
  body.add(zlathe([[0, Z(338)], [30 * s, Z(340)], [30 * s, Z(346)], [21 * s, Z(348)], [21 * s, Z(386)], [24 * s, Z(390)],
    [24 * s, Z(392)], [0, Z(392)]], 0, by, 0, 24), C.cream, M.gloss);
  for (const x of [84, 146]) body.add(ring(76 * s + 0.0012, 0.0018, 0, by, Z(x), 'z', 4, 28), C.silver, M.metal);
  body.add(sideTube(P, [[70, 262], [92, 284], [170, 284], [196, 266]], 2.2 * s, 0, 2), C.silver, M.metal);
  const trig = raked(body, RAKE, { color: C.wood, triggerColor: C.silver, guardColor: C.silver });
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { can: part(can, [0, by, (bz0 + bz1) / 2], 'body'), trigger: part(trig, TRIGGER_PIVOT) },
    gripR: rakedGrip(RAKE),
    gripL: supportGrip([0, Y(214), Z(236)], 0),
    muzzle: [0, Y(163), Z(392)],
  });
}

export const MODELS = {
  's3-shooter-expert': { sourceModel: 'Wmn_Shooter_Expert', build: expert },
  // The support hand closes on the front bracket ~0.27 m ahead of the grip: hold the gun closer to the
  // chest (stock against the shoulder) so the left arm reaches it (image-estimated, not measured).
  's3-shooter-heavy': { sourceModel: 'Wmn_Shooter_Heavy', build: heavy,
    hold: { aim: { p: [-0.04, -0.06, 0.13] }, carry: { p: [-0.16, 0.8, 0.02], r: [0.5, 0.15, -0.12] }, run: { p: [-0.16, 0.82, 0.06] } } },
  // The support hand closes round the front of the gun body ~0.26 m ahead of the handle: hold the gun a
  // little closer to the chest so the left arm reaches it (image-estimated, not measured).
  's3-shooter-long': { sourceModel: 'Wmn_Shooter_Long', build: longJet,
    hold: { aim: { p: [-0.03, -0.06, 0.16] }, carry: { p: [-0.16, 0.78, 0.02], r: [0.5, 0.15, -0.1] }, run: { p: [-0.16, 0.8, 0.06] } } },
  's3-shooter-quicklong': { sourceModel: 'Wmn_Shooter_QuickLong', build: nova },
  's3-shooter-triplequick': { sourceModel: 'Wmn_Shooter_TripleQuick', build: nozzleL3 },
  's3-shooter-triplemiddle': { sourceModel: 'Wmn_Shooter_TripleMiddle', build: nozzleH3 },
  's3-shooter-flash': { sourceModel: 'Wmn_Shooter_Flash', build: squeezer,
    // the bottle's fore-grip is far forward: carry it closer so the support hand still reaches (image-estimated)
    hold: { carry: { p: [-0.17, 0.79, 0.05], r: [0.45, 0.14, -0.14] }, run: { p: [-0.16, 0.81, 0.09] }, aim: { p: [-0.04, -0.07, 0.15] } } },
};
