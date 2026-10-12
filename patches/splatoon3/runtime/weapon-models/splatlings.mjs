// Splatling family models (Splatoon 3 Ver.11.3.0 spinners): Heavy Splatling, Mini Splatling, Hydra Splatling,
// Ballpoint Splatling, Nautilus 47, Heavy Edit Splatling. Shapes follow the official per-weapon 3D renders and
// the turntable frames (Inkipedia "S3 <Name> model rotating.mp4"); colours come from the 3D renders. The native
// splatling channels are kept: `trigger` (pistol trigger) and `barrels` (the spun cluster, rotating about its
// local Z through a pivot on the barrel axis). The native charge coil is kept for readability although none of the six references
// shows a charge meter. Everything is procedural geometry.
import { THREE, V, Pieces, M, zlathe, xlathe, ylathe, zcyl, xcyl, ring, pipe, box, sphere, cyl, lathe, torus, at, slab, pistolGrip, supportHandle, mirrored,
  gripSpec, glowGeometry, part, rebuild, TRIGGER_PIVOT, clamp, damp } from './kit.mjs';

/** Barrels on a ring of radius R about the spin axis (ay): n tubes from z0 to z1, each with a nozzle tip. */
function barrelRing(B, o) {
  for (let k = 0; k < o.n; k++) {
    const a = o.a0 + (k * 2 * Math.PI) / o.n, x = Math.cos(a) * o.R, y = o.ay + Math.sin(a) * o.R;
    B.add(zcyl(o.r, o.z0, o.z1, x, y, 10), o.barrel, M.metal);
    B.add(zcyl(o.tipR, o.z1 - o.tipL, o.z1 + 0.002, x, y, 10), o.tip, M.gloss);
  }
}
/** Shared finish: the native support hand stays on d.gripL (drawn as a foregrip), the native trigger and
 *  barrel channels take the new pieces, the native charge coil is kept (a charging splatling must stay readable
 *  to other players), the muzzle sits at the nozzle exit. */
function finish(d, body, B, tr, AX, muzzleZ, supportColor, ink = new Pieces()) {
  supportHandle(body, d.gripL, supportColor);
  return rebuild(d, {
    body, ink,
    parts: { trigger: part(tr, TRIGGER_PIVOT), barrels: part(B, [0, AX, 0.3]) },
    muzzle: [0, AX, muzzleZ],
  });
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------------------------------ Heavy Splatling
// Wmn_Spinner_StandardT, rebuilt from the official 3D render and the turntable video (S3 Heavy Splatling model
// rotating.mp4: t≈2.5 s front, 5 s left side, 8 s rear, 11.5 s right side; the gun lies pitched ~20° nose-down).
// Weapon space: the origin is the right hand's top grip (magenta grip plate on top of the receiver, fist axis along
// Z), the barrel axis runs 0.075 m below it. Scale: the barrels' front disc is Ø 0.12 m (≈ 1.6 × the fist-wide
// top carry loop); the left-side frame levelled to the barrel axis reads 0.001 m/px at 600 px.
// Parts: six-barrel gatling (thin barrels, thick muzzle sleeves with bores, magenta front disc / sleeve collar /
// openwork rear hub, centre axle — all in the spun `barrels` part), a magenta nose cone, a dark-grey receiver
// (front plate, block with hex bolts and two side slots that carry the charge meter, rear housing), the top grip
// with its front post and rear C hook, a raked transverse carry loop in front of it (support hand), a bottom feed
// coupling, and on the holder's right the big team-ink bottle tank (Ø 0.22 m, 0.3 m tall) leaning back 48° in a wire cage (two hoops,
// four bars, bottom ring), held by two magenta clips, with a black ribbed outlet and a braided team-ink hose that
// loops under the gun into the coupling. Prints (white logo, small text row, magenta square) on the tank's flank.
// Tank authored at R 0.074 / L 0.2 in its own frame, then scaled by k, leaned back and placed at B (bottom face centre).
const HEAVY = { AX: -0.075, lean: 48 * Math.PI / 180, k: 1.5, B: [-0.185, -0.144, 0.075], R: 0.074, L: 0.2 };
/** Rounded-rectangle loft along +Z: sections [{ z, y, w, h, r }] (full width/height, corner radius). */
function heavyLoft(sections, cn = 3) {
  const ringPts = s => {
    const out = [], r = Math.min(s.r ?? 0.006, s.w / 2 - 1e-4, s.h / 2 - 1e-4), hw = s.w / 2 - r, hh = s.h / 2 - r;
    for (const [x, y, a0] of [[hw, hh, 0], [-hw, hh, Math.PI / 2], [-hw, -hh, Math.PI], [hw, -hh, 1.5 * Math.PI]])
      for (let i = 0; i <= cn; i++) { const a = a0 + (i / cn) * Math.PI / 2; out.push([x + r * Math.cos(a), s.y + y + r * Math.sin(a), s.z]); }
    return out;
  };
  const R = sections.map(ringPts), m = R[0].length, pos = [], idx = [];
  for (const r of R) for (const p of r) pos.push(...p);
  for (let k = 0; k < R.length - 1; k++) for (let i = 0; i < m; i++) {
    const a = k * m + i, b = k * m + (i + 1) % m, c = (k + 1) * m + (i + 1) % m, d = (k + 1) * m + i;
    idx.push(a, c, d, a, b, c);
  }
  for (const [k, flip] of [[0, true], [R.length - 1, false]]) {
    const o = pos.length / 3, s = sections[k]; pos.push(0, s.y, s.z);
    for (const p of R[k]) pos.push(...p);
    for (let i = 0; i < m; i++) { const a = o + 1 + i, b = o + 1 + (i + 1) % m; flip ? idx.push(o, b, a) : idx.push(o, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Tank-local point (bottle axis = local +Y from the bottom face centre; local −X = the holder's right) → weapon space. */
function heavyTank(x, y, z) {
  const c = Math.cos(-HEAVY.lean), s = Math.sin(-HEAVY.lean), k = HEAVY.k; x *= k; y *= k; z *= k;
  return [x + HEAVY.B[0], y * c - z * s + HEAVY.B[1], y * s + z * c + HEAVY.B[2]];
}
/** Print stroke on the tank flank: arc position u (m along the circumference from angle th), height v, size w × h. */
function heavyPrint(p, th, u, v, w, h, color, r = HEAVY.R + 0.0006) {
  const a = th + (u + w / 2) / r;
  p.add(box(0.0016, h, w, 0, 0, 0, 0.2, 4, 4).rotateY(-a).translate(Math.cos(a) * r, v + h / 2, Math.sin(a) * r), color, M.print);
}
/** Closed or open wire through tank-local points [θ, h] at radius rc (tank-local output, placed with the tank). */
function heavyWire(p, pts, rc, r, color, closed = false) {
  const P = pts.map(([a, h]) => [Math.cos(a) * rc, h, Math.sin(a) * rc]);
  if (closed) P.push(P[0]);
  p.add(pipe(P, r, Math.max(6, pts.length * 2), 5), color, M.satin);
}
// The right fist sits on top of the gun (the barrels hang 0.075 m below it), so the native splatling anchors are
// raised 0.04 m (barrels at hip height, as in the Tableturf card / class promo) and moved ~0.08 m out to the right
// with less yaw across the body: the tank (0.185 m outboard of the barrel axis) rides beside the right hip, the
// right arm comes down between tank and body (measured: arm bones ≥ 5 cm from the tank axis surface through idle,
// carry and firing; torso ≥ 15 cm). Native carry (data hold) keeps this hold in idle/walk too.
const HEAVY_POLE_DEF = [-0.7, -0.55, -0.45], HEAVY_POLE_IN = [0.75, -0.25, -0.6];
const HOLD_HEAVY = {
  carry: { p: [-0.24, 0.78, 0.17], r: [0.4, 0.06, -0.1] }, aim: { p: [-0.17, -0.12, 0.2], r: [0.05, 0.02, 0] },
  raise: { p: [-0.2, 1.29, 0.1] }, lobby: { p: [-0.2, 0.89, 0.2], r: [0.25, 0.15, -0.15] },
  poleR: HEAVY_POLE_IN,
};
// Native carry keeps the right elbow on the default outward pole (−0.7, −0.55, −0.45), which swings it into the tank
// beside the gun; only the aim pose reads HOLD.poleR. While carrying, ease that default pole to the same inward/back
// pole the aim uses (elbow between the tank and the body). Special layers (jump coil, roll, tuck…) that moved the
// pole well away from the default are left alone. Allocation-free.
function heavyPose(ch, dt, s, CH) {
  const P = ch.P, o = CH.POLER; if (!P || o === undefined) return;
  const dx = P[o] - HEAVY_POLE_DEF[0], dy = P[o + 1] - HEAVY_POLE_DEF[1], dz = P[o + 2] - HEAVY_POLE_DEF[2];
  const w = Math.max(0, 1 - Math.hypot(dx, dy, dz) / 0.4) * (1 - Math.min(1, Math.max(0, ch.wAim || 0)));
  for (let i = 0; i < 3; i++) P[o + i] += (HEAVY_POLE_IN[i] - P[o + i]) * w;
}
function heavy(d) {
  const { AX, R, L } = HEAVY;
  const C = { grey: '#76767c', dark: '#46464b', black: '#1d1e21', sleeve: '#2a2b2e', pink: '#d42a78', wire: '#5f5f64',
    silver: '#adb0b6', bolt: '#b9bdc4', blue: '#3a78c8', white: '#efefe8' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces(), tr = new Pieces(), G = new Pieces();

  // ---- spun gatling cluster (about the barrel axis): 6 barrels on R 0.033
  const RB = 0.033;
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + k * Math.PI / 3, x = Math.cos(a) * RB, y = AX + Math.sin(a) * RB;
    B.add(zcyl(0.0095, 0.2, 0.318, x, y, 12), C.dark, M.metal);
    B.add(zlathe([[0, 0.314], [0.0155, 0.314], [0.0155, 0.415], [0.0146, 0.42], [0.0094, 0.42], [0.0085, 0.417], [0.0085, 0.399], [0, 0.399]], x, y, 0, 12), C.sleeve, M.satin);
  }
  B.add(zlathe([[0, 0.372], [0.057, 0.372], [0.061, 0.376], [0.061, 0.39], [0.057, 0.394], [0, 0.394]], 0, AX, 0, 30), C.pink, M.gloss);   // front disc
  for (let k = 0; k < 6; k++) {                                                                                                       // disc bosses between the barrels
    const a = Math.PI / 2 + (k + 0.5) * Math.PI / 3;
    B.add(box(0.012, 0.006, 0.02, Math.cos(a) * 0.052, AX + Math.sin(a) * 0.052, 0.383, 0.3, 6, 4), C.pink, M.gloss);
  }
  B.add(zlathe([[0.04, 0.307], [0.055, 0.307], [0.057, 0.311], [0.057, 0.321], [0.055, 0.325], [0.04, 0.325], [0.04, 0.307]], 0, AX, 0, 30), C.pink, M.gloss);  // sleeve collar
  B.add(zcyl(0.026, 0.311, 0.322, 0, AX, 18), C.dark, M.satin);
  B.add(zcyl(0.012, 0.2, 0.372, 0, AX, 12), C.dark, M.metal);                                                                  // axle
  B.add(zcyl(0.017, 0.392, 0.398, 0, AX, 14), C.dark, M.satin);                                                                // nose cap
  B.add(zlathe([[0, 0.14], [0.053, 0.14], [0.056, 0.144], [0.056, 0.152], [0.05, 0.155], [0, 0.155]], 0, AX, 0, 30), C.pink, M.gloss);   // hub rear rim
  B.add(zlathe([[0, 0.196], [0.05, 0.196], [0.056, 0.199], [0.056, 0.208], [0.052, 0.212], [0, 0.212]], 0, AX, 0, 30), C.pink, M.gloss); // hub front rim
  B.add(zcyl(0.043, 0.152, 0.2, 0, AX, 18), C.black, M.satin);                                                                  // dark core seen through the windows
  for (let k = 0; k < 6; k++) {                                                                                                 // hub posts (windows between)
    const a = k * Math.PI / 3;
    B.add(box(0.016, 0.009, 0.046, 0, 0.0515, 0, 0.3, 6, 4).rotateZ(a - Math.PI / 2).translate(0, AX, 0.176), C.pink, M.gloss);
  }
  B.add(zlathe([[0.05, 0.172], [0.0565, 0.172], [0.0565, 0.18], [0.05, 0.18]], 0, AX, 0, 30), C.pink, M.gloss);               // hub mid band

  // ---- static nose cone and receiver
  body.add(zlathe([[0, 0.1], [0.046, 0.1], [0.054, 0.112], [0.056, 0.13], [0.054, 0.142], [0.048, 0.144], [0, 0.144]], 0, AX, 0, 28), C.pink, M.gloss);
  body.add(box(0.03, 0.022, 0.03, 0, AX - 0.052, 0.122, 0.35, 8, 6), C.pink, M.gloss);                                               // lower lobe
  body.add(heavyLoft([{ z: 0.068, y: AX - 0.002, w: 0.088, h: 0.122, r: 0.012 }, { z: 0.1, y: AX, w: 0.092, h: 0.126, r: 0.014 },
    { z: 0.11, y: AX + 0.002, w: 0.084, h: 0.112, r: 0.016 }]), C.grey, M.satin);                                              // front plate
  body.add(heavyLoft([{ z: -0.002, y: AX - 0.006, w: 0.072, h: 0.112, r: 0.008 }, { z: 0.07, y: AX - 0.006, w: 0.074, h: 0.114, r: 0.008 }]), C.grey, M.satin);  // block
  // rear housing: an upper tube running back past the grip (lighter end frame with a dark recessed window) over a
  // shorter lower block
  body.add(heavyLoft([{ z: -0.118, y: AX + 0.018, w: 0.05, h: 0.046, r: 0.006 }, { z: 0.002, y: AX + 0.018, w: 0.05, h: 0.046, r: 0.006 }]), C.grey, M.satin);
  body.add(heavyLoft([{ z: -0.13, y: AX + 0.018, w: 0.058, h: 0.054, r: 0.007 }, { z: -0.112, y: AX + 0.018, w: 0.058, h: 0.054, r: 0.007 }]), C.grey, M.satin);
  body.add(box(0.036, 0.03, 0.006, 0, AX + 0.018, -0.131, 0.15, 6, 4), C.black, M.satin);                                          // rear window
  body.add(heavyLoft([{ z: -0.092, y: AX - 0.03, w: 0.056, h: 0.06, r: 0.007 }, { z: 0.002, y: AX - 0.03, w: 0.056, h: 0.062, r: 0.007 }]), C.dark, M.satin);   // lower block
  for (const z of [-0.07, -0.04]) body.add(heavyLoft([{ z: z - 0.003, y: AX + 0.018, w: 0.054, h: 0.05, r: 0.006 }, { z: z + 0.003, y: AX + 0.018, w: 0.054, h: 0.05, r: 0.006 }]), C.dark, M.satin); // tube bands
  for (const sx of [-1, 1]) {
    body.add(box(0.005, 0.044, 0.06, sx * 0.0285, AX - 0.03, -0.045, 0.2, 6, 4), C.grey, M.satin);                                  // lower block side panel
    for (const y of [AX - 0.032, AX - 0.06]) body.add(box(0.004, 0.016, 0.06, sx * 0.0365, y, 0.034, 0.2, 6, 4), C.black, M.satin);  // slot recess
    body.add(xlathe([[0, 0], [0.0095, 0], [0.0095, 0.004], [0.006, 0.0055], [0, 0.0055]].map(([r, x]) => [r, sx * x]), sx * 0.0365, AX - 0.042, 0.078, 6), C.bolt, M.metal); // hex bolt
    body.add(sphere(0.003, 0.003, 0.003, sx * 0.0425, AX - 0.042, 0.078, 8, 6), C.blue, M.gloss);
    body.add(box(0.006, 0.028, 0.032, sx * 0.0375, AX + 0.03, 0.02, 0.3, 8, 6), C.pink, M.gloss);                                   // magenta side pad
  }
  body.add(box(0.016, 0.012, 0.022, 0.026, AX + 0.066, 0.094, 0.3, 8, 6), C.pink, M.gloss);                                          // magenta block on the front plate
  // charge meter: four segments in each side slot light rear → front (native splatling meter channel)
  for (const sx of [-1, 1]) for (const y of [AX - 0.032, AX - 0.06]) for (let k = 0; k < 4; k++)
    G.add(box(0.002, 0.009, 0.012, sx * 0.0388, y, 0.011 + k * 0.0145, 0.2, 4, 4), '#ffffff');
  // bottom feed coupling with silver rings
  body.add(ylathe([[0, -0.2], [0.019, -0.2], [0.021, -0.196], [0.021, -0.176], [0.025, -0.174], [0.025, -0.166], [0.021, -0.164],
    [0.021, -0.148], [0.027, -0.146], [0.027, -0.136], [0, -0.136]], 0, 0, 0.052, 18), C.dark, M.satin);
  for (const y of [-0.17, -0.153]) body.add(ring(0.0225, 0.0028, 0, y, 0.052, 'y', 5, 18), C.silver, M.metal);

  // ---- top grip (right hand): magenta plate between a front post and a rear C hook, trigger blade under it
  body.add(slab([[0.03, 0.026], [0.012, 0.024], [-0.034, 0.002], [-0.036, -0.012], [0.032, -0.012]], 0.018, 0, 0.004), C.pink, M.gloss);
  for (const sx of [-1, 1]) for (const z of [0.014, -0.014]) body.add(sphere(0.0022, 0.0022, 0.0022, sx * 0.0092, 0.012 - (0.014 - z) * 0.2, z, 6, 4), C.white, M.gloss);
  body.add(box(0.024, 0.062, 0.024, 0, -0.008, 0.042, 0.3, 8, 6), C.grey, M.satin);                                                  // front post
  body.add(pipe([[0, 0.004, -0.03], [0, 0.008, -0.05], [0, -0.006, -0.068], [0, -0.026, -0.064], [0, -0.034, -0.05]], 0.0065, 16, 6).scale(2.4, 1, 1), C.grey, M.satin);  // rear C hook
  tr.add(box(0.008, 0.016, 0.008, 0, -0.018, 0.018, 0.3, 8, 6), C.dark, M.satin);                                                    // trigger blade
  // ---- transverse carry loop (support hand), raked 45° forward, on the front plate
  const loop = [[-0.03, -0.024, 0.098], [-0.03, 0.0, 0.122], [-0.026, 0.017, 0.14], [-0.013, 0.026, 0.15], [0, 0.028, 0.152]];
  body.add(pipe([...loop, ...loop.slice(0, -1).reverse().map(([x, y, z]) => [-x, y, z])], 0.0058, 24, 6), C.wire, M.satin);
  for (const sx of [-1, 1]) body.add(box(0.016, 0.012, 0.02, sx * 0.03, -0.026, 0.096, 0.3, 8, 6), C.dark, M.satin);                // loop feet

  // ---- the team-ink bottle tank, its cage, clips, outlet and hose
  const T = new Pieces(), TI = new Pieces();
  TI.add(ylathe([[0, 0], [0.028, 0], [0.03, 0.004], [0.05, 0.008], [0.064, 0.016], [0.072, 0.03], [R, 0.045], [R, 0.066], [0.0705, 0.071], [0.0705, 0.075],
    [R, 0.08], [R, 0.128], [0.0705, 0.133], [0.0705, 0.137], [R, 0.142], [R, 0.172], [0.071, 0.186], [0.062, 0.196], [0.048, L], [0.02, L], [0.008, 0.197], [0, 0.196]], 0, 0, 0, 24));
  // prints: logo (blocky glyphs + magenta square) and a small text row on the front-outer flank, second logo on the rear-outer flank
  const th1 = 2.75, th2 = 4.05;
  for (const [u, v, w, h] of [[0.028, 0.086, 0.008, 0.039], [0.036, 0.1, 0.01, 0.008], [-0.046, 0.086, 0.008, 0.039], [-0.046, 0.086, 0.028, 0.008],
    [-0.046, 0.1025, 0.024, 0.008], [-0.046, 0.117, 0.028, 0.008]]) heavyPrint(T, th1, u, v, w, h, C.white);
  heavyPrint(T, th1, -0.006, 0.1, 0.012, 0.012, C.pink);
  for (let k = 0; k < 6; k++) heavyPrint(T, th1, -0.046 + k * 0.015, 0.152, 0.011, 0.005, C.white);
  for (const [u, v, w, h] of [[-0.05, 0.086, 0.008, 0.038], [-0.05, 0.116, 0.026, 0.008], [-0.032, 0.086, 0.008, 0.038], [-0.05, 0.1, 0.026, 0.007],
    [-0.012, 0.086, 0.026, 0.008], [-0.012, 0.1, 0.026, 0.007], [-0.012, 0.116, 0.026, 0.008], [-0.012, 0.1, 0.008, 0.02], [0.006, 0.086, 0.008, 0.016],
    [0.024, 0.086, 0.008, 0.038], [0.04, 0.086, 0.008, 0.038], [0.024, 0.1, 0.024, 0.007]]) heavyPrint(T, th2, u, v, w, h, C.white);
  heavyPrint(T, th2, 0.052, 0.112, 0.01, 0.01, C.pink);
  // black ribbed outlet under the bottle, magenta tab on its outer side
  T.add(ylathe([[0, -0.048], [0.021, -0.048], [0.024, -0.045], [0.024, -0.038], [0.026, -0.036], [0.026, -0.03], [0.024, -0.028], [0.024, -0.02],
    [0.027, -0.018], [0.027, -0.01], [0.031, -0.006], [0.031, 0.006], [0, 0.006]], 0, 0, 0, 18), C.black, M.rubber);
  T.add(box(0.012, 0.028, 0.024, -0.034, -0.016, -0.012, 0.35, 8, 6).rotateY(0.5), C.pink, M.gloss);
  // cage: upper hoop at the upper groove, lower hoop round the shoulder, four bars on the outer half, bottom ring
  const rc = R + 0.007, hoop = n => Array.from({ length: n }, (_, k) => (k / n) * Math.PI * 2);
  heavyWire(T, hoop(14).map(a => [a, 0.115]), rc, 0.0042, C.wire, true);
  heavyWire(T, hoop(14).map(a => [a, 0.03]), rc - 0.004, 0.0042, C.wire, true);
  for (const a of [1.95, 2.85, 3.5, 4.35]) heavyWire(T, [[a, 0.115], [a, 0.07], [a, 0.03]], rc, 0.0042, C.wire);
  heavyWire(T, hoop(14).map(a => [a, -0.004]), 0.034, 0.0035, C.wire, true);
  for (const a of [0.6, 2.3, 3.9, 5.5]) T.add(cyl(0.0032, [Math.cos(a) * (rc - 0.004), 0.03, Math.sin(a) * (rc - 0.004)], [Math.cos(a) * 0.034, -0.004, Math.sin(a) * 0.034], 6), C.wire, M.satin);
  // clips on the inner (gun) side holding the hoops
  for (const h of [0.115, 0.03]) T.add(box(0.016, 0.026, 0.03, rc + 0.002, h, 0, 0.3, 8, 6), C.pink, M.gloss);
  for (const P of [T, TI]) P.transform(g => g.scale(HEAVY.k, HEAVY.k, HEAVY.k).rotateX(-HEAVY.lean).translate(...HEAVY.B));
  body.merge(T); ink.merge(TI);
  // dark brackets from the tank clips to the receiver's right side
  for (const h of [0.115, 0.03]) { const p = heavyTank(rc + 0.002, h, 0); body.add(box(Math.abs(p[0]) - 0.02, 0.016, 0.022, (p[0] - 0.02) / 2, p[1], p[2], 0.3, 6, 4), C.dark, M.satin); }
  // cage strut from the coupling up to the upper hoop's rear
  body.add(pipe([[-0.012, -0.19, 0.04], heavyTank(Math.cos(4.4) * rc, 0.115, Math.sin(4.4) * rc)], 0.0038, 2, 6), C.wire, M.satin);
  // braided team-ink hose: outlet tip → loop under the gun → coupling bottom
  const tip = heavyTank(0, -0.046, 0), out = heavyTank(0, -0.066, 0), hosePath = [tip, out, [-0.082, -0.224, 0.142], [-0.038, -0.228, 0.088], [-0.007, -0.216, 0.061], [0, -0.198, 0.052]];
  ink.add(pipe(hosePath, 0.016, 24, 8));
  const hoseCurve = new THREE.CatmullRomCurve3(hosePath.map(p => V(...p)), false, 'centripetal');
  for (let k = 0; k < 9; k++) {                                                                                                // braid ribs
    const t = (k + 0.5) / 9, p = hoseCurve.getPoint(t), tg = hoseCurve.getTangent(t);
    ink.add(torus(0.0163, 0.002, 3, 10).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), tg)).translate(p.x, p.y, p.z));
  }

  return rebuild(d, {
    body, ink,
    parts: { trigger: part(tr, [0, -0.012, 0.022]), barrels: part(B, [0, AX, 0.3]) },
    glow: glowGeometry(G, 0.008, 0.06, 'z'),
    // right fist round the top grip plate (axis along Z, wrist up and out to the right); left fist on the carry loop's bar
    gripR: gripSpec([0, 0.004, -0.002], [0, 0.12, 1], [0.5, 1, -0.35]),
    gripL: gripSpec([0, 0.026, 0.15], [-1, 0, 0], [0.45, 0.6, -0.65]),
    muzzle: [0, AX, 0.422],
  });
}

// ------------------------------------------------------------------------------------------ Mini Splatling
// Wmn_Spinner_QuickT. A purple housing with a black carry bail, a white bulb-shaped tank at the rear and a
// yellow drum at the front. Six blue nozzles sit on a ring about a black centre.
function mini(d) {
  // Rebuilt (Opus): purple frame with a black carry handle, an ink bulb tank (teal = team ink in the
  // turntable) low at the rear wrapped by a yellow strap, six black barrels with a purple collar and a
  // yellow front disc carrying six blue nozzles (the spun cluster).
  const AX = 0.07, C = { purple: '#4a2fb0', black: '#16171b', yellow: '#e8c22a', blue: '#2f5ee0', grey: '#9aa0a8' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.purple, guardColor: C.purple });
  body.add(box(0.05, 0.05, 0.15, 0, AX + 0.01, 0.07, 0.3), C.purple, M.gloss);                                   // frame
  body.add(pipe([[0, AX + 0.035, 0.0], [0, AX + 0.085, 0.02], [0, AX + 0.085, 0.09], [0, AX + 0.035, 0.11]], 0.008, 18, 6), C.black, M.satin);
  ink.add(sphere(0.058, 0.05, 0.085, 0, 0.012, -0.04, 22, 14));                                                // ink bulb (tucked under the frame)
  body.add(pipe([[-0.056, 0.012, -0.11], [-0.06, 0.045, -0.04], [-0.04, 0.06, 0.03], [0.04, 0.06, 0.03], [0.06, 0.045, -0.04], [0.056, 0.012, -0.11]], 0.006, 30, 6), C.yellow, M.gloss);
  body.add(ring(0.057, 0.006, 0, 0.012, -0.04, 'z', 6, 24).scale(1, 0.9, 1), C.yellow, M.gloss);
  barrelRing(B, { n: 6, a0: Math.PI / 2, R: 0.026, ay: AX, r: 0.008, z0: 0.15, z1: 0.31, tipL: 0.004, tipR: 0.008, barrel: C.black, tip: C.black });
  B.add(zlathe([[0, 0.15], [0.044, 0.15], [0.046, 0.175], [0, 0.175]], 0, AX, 0, 24), C.purple, M.gloss);
  B.add(zlathe([[0, 0.3], [0.05, 0.3], [0.052, 0.318], [0.046, 0.326], [0, 0.326]], 0, AX, 0, 28), C.yellow, M.gloss);
  for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + k * Math.PI / 3; B.add(zlathe([[0, 0.322], [0.009, 0.322], [0.009, 0.33], [0, 0.331]], Math.cos(a) * 0.03, AX + Math.sin(a) * 0.03, 0, 12), C.blue, M.gloss); }
  B.add(zcyl(0.008, 0.32, 0.332, 0, AX, 10), C.grey, M.satin);
  return finish(d, body, B, tr, AX, 0.334, C.black, ink);
}

function hydra(d) {
  // Rebuilt (Opus): a big silver can with a red label band standing tilted back at the rear in a black
  // wire cage, a red round drum in an orange frame, four silver barrels (2×2) with gold threaded tips, a
  // yellow feed hose and a black base skid.
  const AX = 0.07, C = { silver: '#c7cacd', red: '#b5262e', maroon: '#7c1e24', orange: '#e2702a', gold: '#d2b24a', black: '#17181b', yellow: '#e8c22a' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.red, guardColor: C.black });
  const can = new Pieces();
  can.add(ylathe([[0, -0.13], [0.07, -0.13], [0.074, -0.12], [0.074, 0.12], [0.06, 0.135], [0.03, 0.14], [0, 0.14]], 0, 0, 0, 28), C.silver, M.satin);
  can.add(ylathe([[0.0755, -0.04], [0.0755, 0.07]], 0, 0, 0, 28).scale(1, 1, 1), C.red, M.gloss);
  for (const y of [-0.08, 0.0, 0.08]) can.add(ring(0.078, 0.003, 0, y, 0, 'y', 4, 28), C.black, M.satin);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; can.add(cyl(0.003, [Math.cos(a) * 0.078, -0.1, Math.sin(a) * 0.078], [Math.cos(a) * 0.078, 0.1, Math.sin(a) * 0.078], 6), C.black, M.satin); }
  body.merge(can.transform(g => g.rotateX(-0.5).translate(0, AX + 0.09, -0.11)));
  body.add(box(0.07, 0.07, 0.1, 0, AX, 0.04, 0.3), C.maroon, M.satin);                                         // breech
  body.add(box(0.11, 0.1, 0.03, 0, AX, 0.105, 0.3), C.orange, M.satin);                                         // orange frame
  body.add(pipe([[0.03, -0.03, -0.05], [0.05, -0.05, 0.0], [0.02, -0.02, 0.06]], 0.007, 16, 6), C.yellow, M.gloss);  // feed hose
  body.add(box(0.07, 0.012, 0.16, 0, -0.07, 0.06, 0.3), C.black, M.satin);                                     // base skid
  B.add(zlathe([[0, 0.11], [0.06, 0.11], [0.064, 0.125], [0.064, 0.175], [0.058, 0.19], [0, 0.19]], 0, AX, 0, 28), C.red, M.gloss);
  for (const [x, y] of [[-0.026, 0.026], [0.026, 0.026], [-0.026, -0.026], [0.026, -0.026]]) {
    B.add(zcyl(0.014, 0.19, 0.29, x, AX + y, 14), C.silver, M.satin);
    B.add(zcyl(0.012, 0.29, 0.33, x, AX + y, 14), C.gold, M.metal);
    for (let k = 0; k < 4; k++) B.add(ring(0.0125, 0.0018, x, AX + y, 0.295 + k * 0.009, 'z', 4, 12), C.gold, M.metal);
  }
  return finish(d, body, B, tr, AX, 0.334, C.black, ink);
}

// ------------------------------------------------------------------------------------------ Ballpoint Splatling
// Wmn_Spinner_Downpour, rebuilt from the official 3D render (base kit; team-ink parts drawn neutral there), the
// turntable video (S3 Ballpoint Splatling Nouveau model rotating.mp4: t≈1.5 s front, 5 s left side, 7.5 s rear,
// 11 s right side; red = team ink in that kit) and the S3 gameplay clips ("S3 Ballpoint Splatling firing.mp4" /
// "firing rear.mp4": yellow ink in the rear cap, the fins, the core behind the body slots and the six barrels,
// which fill with the charge and drain while firing; right hand on the top bar, left hand on the front clevis).
// A clicky-pen-shaped gun: a faceted (12-sided) team-ink rear cap behind a metal ring, a glossy black 12-sided
// body with four diagonal slots that show the ink core and carry four ink fins, a threaded collar, then a long
// faceted CLEAR shell (dome nose with a black nozzle cap) round six clear barrels with silver bullet tips spinning
// on a centre axle, a white U-shaped ribbed foregrip cradling the shell from below, and a dark flat-bar top handle
// that ends in a raked clevis with a silver bolt.
// Weapon space: origin = the right fist on the top bar; the shell/barrel axis runs 0.087 m below it. Scale: body
// Ø 0.12 m (≈ 2.2 × the kid's fist width in the gameplay clip); the right-side video frame reads 0.0006 m/px.
// The clear shell is a 'lamp' part that `ballpointAnimate` turns into a see-through material on the near LOD
// (the shared weapon plastic has no transparency); the far LOD / static renders show it as frosted plastic.
const BP = { AX: -0.087, R: 0.06, ph: Math.PI / 12, seats: 0.031 };
const bpRad = d => (d * Math.PI) / 180;
/** Regular n-gon (CCW seen from +Z) of circumradius r about (0, AX), vertices at ph + k·2π/n. */
function bpNgon(r, n = 12, ph = BP.ph, cy = BP.AX) {
  const out = [];
  for (let k = 0; k < n; k++) { const a = ph + (k * 2 * Math.PI) / n; out.push([Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
/** Annular sector outline (CCW): outer arc a0 → a1 at ro, inner arc back at ri, about (0, AX). */
function bpSector(ri, ro, a0, a1, n = 14) {
  const out = [];
  for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; out.push([Math.cos(a) * ro, BP.AX + Math.sin(a) * ro]); }
  for (let k = n; k >= 0; k--) { const a = a0 + ((a1 - a0) * k) / n; out.push([Math.cos(a) * ri, BP.AX + Math.sin(a) * ri]); }
  return out;
}
/** Polygon loft along +Z through sections [{ z, pts (CCW, equal counts), sharp }]. `sharp` corners (true = all,
 *  or an index list) keep split normals (facets / creases); a section with sharp: true creases the ring there.
 *  Flat end caps. Returns an indexed geometry with normals (Pieces keeps them). */
function bpLoft(sections, sharp = true, caps = [true, true]) {
  const n = sections[0].pts.length, pos = [], idx = [];
  const isSharp = k => sharp === true || (Array.isArray(sharp) && sharp.includes(k));
  const add = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };
  const rings = sections.map(S => {
    const mk = () => S.pts.map(([x, y], k) => { const a = add(x, y, S.z); return [a, isSharp(k) ? add(x, y, S.z) : a]; });
    const lo = mk(); return { lo, hi: S.sharp ? mk() : lo };
  });
  for (let s = 0; s < sections.length - 1; s++) for (let k = 0; k < n; k++) {
    const k1 = (k + 1) % n, A = rings[s].hi, B = rings[s + 1].lo;
    idx.push(A[k][1], A[k1][0], B[k1][0], A[k][1], B[k1][0], B[k][1]);
  }
  for (const [s, dir] of [[0, -1], [sections.length - 1, 1]]) {
    if (!caps[s === 0 ? 0 : 1]) continue;
    const S = sections[s], o = pos.length / 3;
    for (const [x, y] of S.pts) add(x, y, S.z);
    for (const f of THREE.ShapeUtils.triangulateShape(S.pts.map(([x, y]) => new THREE.Vector2(x, y)), [])) {
      const [a, b, c] = f.map(i => S.pts[i]), cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (cz * dir > 0) idx.push(o + f[0], o + f[1], o + f[2]); else idx.push(o + f[0], o + f[2], o + f[1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Faceted 12-sided lathe: profile [[r, z, crease?], …] → bpLoft of n-gons. */
const bpFacet = (profile, caps = [true, true], n = 12, ph = BP.ph, facets = true) => bpLoft(profile.map(([r, z, c]) => ({ z, pts: bpNgon(r, n, ph), sharp: !!c })), facets, caps);
/** Flat band (width × thick) swept through points, lying flat against the given normals (flat-shaded faces). */
function bpRibbon(points, normals, width, thick) {
  const n = points.length, pos = [], idx = [], T = V(), N = V(), B = V(), rings = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    N.set(...normals[i]); N.addScaledVector(T, -N.dot(T)).normalize(); B.crossVectors(T, N).normalize();
    const p = V(...points[i]);
    rings.push([[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([u, v]) => p.clone().addScaledVector(B, (u * width) / 2).addScaledVector(N, (v * thick) / 2)));
  }
  const quad = (a, b, c, d) => { const o = pos.length / 3; for (const v of [a, b, c, d]) pos.push(v.x, v.y, v.z); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  for (let i = 0; i < n - 1; i++) for (let f = 0; f < 4; f++) { const g = (f + 1) % 4; quad(rings[i][f], rings[i][g], rings[i + 1][g], rings[i + 1][f]); }
  quad(rings[0][3], rings[0][2], rings[0][1], rings[0][0]); quad(rings[n - 1][0], rings[n - 1][1], rings[n - 1][2], rings[n - 1][3]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Body cross-section: the 12-gon (circumradius R) with four parallel-sided slots (half width hw, floor at rIn) on the
 *  diagonals, CCW. */
function bpSlotted(R, hw, rIn, nG = 24) {
  const out = [], V0 = bpNgon(R, nG, 0).map(([x, y]) => [x, y - BP.AX]), n = V0.length; out.sharp = [];
  // where the slot wall (t·d + o·p) crosses the polygon edge A→B
  const cross = (d, p, o, A, B) => {
    const ex = B[0] - A[0], ey = B[1] - A[1], qx = o * p[0] - A[0], qy = o * p[1] - A[1], den = d[0] * ey - d[1] * ex;
    const t = (ex * qy - ey * qx) / den; return [t * d[0] + o * p[0], BP.AX + t * d[1] + o * p[1]];
  };
  for (let k = 0; k < n; k++) {
    const [x, y] = V0[k], a = Math.atan2(y, x), deg = ((a * 180) / Math.PI + 360) % 360;
    if (Math.abs(((deg - 45) % 90 + 90) % 90) > 1e-3) { out.push([x, y + BP.AX]); continue; }
    // a diagonal vertex: replace it by the slot (outer wall point → floor → floor → outer wall point)
    const d = [Math.cos(a), Math.sin(a)], p = [-d[1], d[0]], ri = Math.sqrt(rIn * rIn - hw * hw);
    out.sharp.push(out.length, out.length + 1, out.length + 2, out.length + 3);
    out.push(cross(d, p, -hw, V0[(k + n - 1) % n], V0[k]), [d[0] * ri - p[0] * hw, BP.AX + d[1] * ri - p[1] * hw],
      [d[0] * ri + p[0] * hw, BP.AX + d[1] * ri + p[1] * hw], cross(d, p, hw, V0[k], V0[(k + 1) % n]));
  }
  return out;
}
/** Raised print stroke on a flank flat (x = side · xs) from (z0, y0) to (z1, y1), stroke width t. */
function bpStroke(p, side, rs, z0, v0, z1, v1, t, color) {
  // authored on the +X flank (v = height above the axis, wrapped round the body at the stroke centre), mirrored for −X
  const L = Math.hypot(z1 - z0, v1 - v0) + t, phi = Math.asin(clamp((v0 + v1) / 2 / rs, -1, 1));
  const g = box(0.0008, t, L, 0, 0, 0, 0.15, 4, 4).rotateX(-Math.atan2(v1 - v0, z1 - z0)).translate(rs, 0, (z0 + z1) / 2).rotateZ(phi).translate(0, BP.AX, 0);
  p.add(side < 0 ? mirrored(g) : g, color, M.print);
}
/** Maker logo (icon + four glyphs + a text row) and the "0820" plate on one flank. Glyph strokes are authored in
 *  (u along the reading direction, v up from the axis); the right flank reads toward the muzzle, the left flank
 *  toward the cap (as in the video: logo behind on the right, logo ahead on the left). */
function bpLogo(p, side, color) {
  const rs = BP.R + 0.0004, lift = 0.011;
  const zOf = u => (side < 0 ? -0.048 + u : 0.059 - u), st = (u0, v0, u1, v1, t = 0.0024) => bpStroke(p, side, rs, zOf(u0), lift + v0, zOf(u1), lift + v1, t, color);
  st(0, -0.008, 0.009, 0.009); st(0.009, 0.009, 0.018, -0.008); st(0, -0.008, 0.018, -0.008);          // icon: triangle
  st(0.0045, -0.0025, 0.0085, -0.0005, 0.0018); st(0.0085, -0.0005, 0.0135, -0.0035, 0.0018);          // icon: wave
  st(0.027, 0.004, 0.024, -0.008); st(0.031, 0.006, 0.036, -0.008);                                     // ハ
  st(0.052, 0.008, 0.04, -0.002); st(0.047, 0.003, 0.047, -0.008);                                      // イ
  st(0.059, 0.004, 0.056, -0.008); st(0.063, 0.006, 0.068, -0.008); st(0.069, 0.007, 0.0705, 0.0085, 0.002); // パ
  st(0.073, 0, 0.085, 0);                                                                               // ー
  for (let k = 0; k < 7; k++) st(0.022 + k * 0.009, -0.0125, 0.027 + k * 0.009, -0.0125, 0.0016);         // small text row
  const c = 0.1035;                                                                                     // "0820" plate
  st(c - 0.013, 0.006, c + 0.013, 0.006, 0.0014); st(c - 0.013, -0.006, c + 0.013, -0.006, 0.0014);
  st(c - 0.0135, -0.0055, c - 0.0135, 0.0055, 0.0014); st(c + 0.0135, -0.0055, c + 0.0135, 0.0055, 0.0014);
  for (let k = 0; k < 4; k++) st(c - 0.0085 + k * 0.0057, -0.0022, c - 0.0085 + k * 0.0057, 0.0022, 0.0028);
  for (let k = 0; k < 3; k++) st(c - 0.01 + k * 0.008, -0.0105, c - 0.005 + k * 0.008, -0.0105, 0.0014);
}
// Hold: the right fist round the top bar, the left fist round the clevis bolt (both as in the gameplay clip:
// gun low at the right hip, barrels forward). Same anchor family as the Heavy (its top grip / transverse support
// bar sit at the same height over the axis), moved back in a little (no side tank).
const HOLD_BALLPOINT = {
  carry: { p: [-0.2, 0.78, 0.17], r: [0.15, 0.06, -0.1] }, aim: { p: [-0.15, -0.12, 0.2], r: [0.05, 0.02, 0] },
  raise: { p: [-0.2, 1.29, 0.1] }, lobby: { p: [-0.2, 0.89, 0.2], r: [0.25, 0.15, -0.15] },
  poleR: HEAVY_POLE_IN,
};
/** Barrel ink follows the spun cluster (same angle, same per-round nudge) and fills with the charge / drains with
 *  the remaining stream; the clear shell becomes see-through once (per instance). Allocation-free. */
function ballpointAnimate(w, st) {
  const P = w.parts, b = P.barrels; if (!b) return;
  const sh = P.shell?.userData?.mesh?.material;
  if (sh && !sh.transparent) { sh.transparent = true; sh.opacity = 0.2; sh.depthWrite = false; sh.side = THREE.DoubleSide; sh.needsUpdate = true; }
  const R = st.runner, cs = R?.catalogState;
  let want = 0;
  if (R) {
    if (R.charging) want = clamp(R.charge || 0);
    else if (R.streaming) want = cs && cs.streamTime > 0 ? clamp(cs.streamCharge ?? 1) * clamp(1 - Math.max(0, cs.streamElapsed || 0) / cs.streamTime) : 1;
  } else want = st.firing ? 1 : clamp(st.charge || 0);
  w.bpFill = damp(w.bpFill ?? want, want, 14, st.dt || 0);
  const dz = b.position.z - b.userData.rest.z;
  for (const k of ['barrelInk', 'tipInk']) {
    const g = P[k]; if (!g) continue;
    g.rotation.z = b.rotation.z; g.position.z = g.userData.rest.z + dz;
  }
  const f = P.barrelInk;
  if (f) { f.visible = w.bpFill > 0.02; f.scale.z = Math.max(0.02, w.bpFill); }
  // pen tip: clicks out of the nozzle ring when the stream passes into its second (variable) phase after 30 frames,
  // retracts when the stream ends (gameplay clip: tip out while firing, in at rest)
  const pt = P.penTip;
  if (pt) {
    const out = R ? (R.streaming && cs ? clamp(((cs.streamElapsed || 0) * 60 - 30) / 10) : 0) : st.firing ? 1 : 0;
    w.bpTip = damp(w.bpTip ?? 0, out, 18, st.dt || 0); pt.position.z = pt.userData.rest.z + 0.028 * w.bpTip;
  }
}
function ballpoint(d) {
  const { AX, R } = BP;
  const C = { black: '#141417', ring: '#8e8f94', collar: '#4a4a4f', white: '#ecebe5', nose: '#1e1e21', bar: '#38383c',
    bolt: '#b6b4ac', screw: '#8b8d91', tube: '#a9b7be', tip: '#b9bcc0', hub: '#4a4a4f', shell: '#bcc6cb', print: '#f1f1ec' };
  const body = new Pieces(), ink = new Pieces(), B = new Pieces(), BI = new Pieces(), TI = new Pieces(), S = new Pieces(), tr = new Pieces(), G = new Pieces(), PT = new Pieces();

  // ---- rear: faceted team-ink cap (chamfered, nearly flat face with a parting seam) and a metal ring
  ink.add(bpFacet([[0.022, -0.1285], [0.04, -0.1265], [0.048, -0.1225], [0.0535, -0.115], [0.0552, -0.106], [0.0552, -0.074], [0.054, -0.068, 1]], [true, false]));
  ink.add(box(0.0016, 0.05, 0.0016, 0, AX, -0.1286, 0.2, 4, 4));
  ink.add(box(0.0016, 0.0016, 0.012, 0, AX + 0.0545, -0.112, 0.2, 4, 4)); ink.add(box(0.0016, 0.0016, 0.012, 0, AX - 0.0545, -0.112, 0.2, 4, 4));
  body.add(zlathe([[0.05, -0.0725], [0.0555, -0.0722], [0.0572, -0.0705], [0.0572, -0.0625], [0.0555, -0.0608], [0.05, -0.0605]], 0, AX, 0, 24), C.ring, M.metal);
  // charge meter: a ring and a centre dot on the cap face (the rear face lights while charging in game)
  G.add(ring(0.0445, 0.0022, 0, AX, -0.1238, 'z', 5, 24)); G.add(zcyl(0.0055, -0.1293, -0.1284, 0, AX, 12));

  // ---- body: black 12-gon with four diagonal slots (ink core and fins inside), solid end bands, logo prints
  const slotted = bpSlotted(R, 0.0115, 0.044);
  body.add(bpFacet([[0.055, -0.0615, 1], [0.0585, -0.059], [R, -0.0565], [R, -0.05, 1]], [true, false], 24, 0, false), C.black, M.gloss);
  body.add(bpLoft([{ z: -0.0502, pts: slotted }, { z: 0.0752, pts: slotted }], slotted.sharp, [false, false]), C.black, M.gloss);
  body.add(bpFacet([[R, 0.075, 1], [R, 0.087], [0.0575, 0.0905], [0.053, 0.0925, 1]], [false, true], 24, 0, false), C.black, M.gloss);
  ink.add(bpFacet([[0.047, -0.058], [0.047, 0.084]], [true, true], 12));
  for (const a of [45, 135, 225, 315].map(bpRad)) {
    const fin = slab([[-0.055, 0.046], [-0.046, 0.0635], [-0.038, 0.0758], [-0.006, 0.0758], [0.01, 0.0645], [0.024, 0.046]], 0.0178, 0, 0.004);
    ink.add(fin.rotateZ(a - Math.PI / 2).translate(0, AX, 0));
  }
  bpLogo(body, -1, C.print); bpLogo(body, 1, C.print);

  // ---- threaded collar between the body and the shell
  body.add(zlathe([[0, 0.091], [0.0505, 0.091], [0.0515, 0.093], [0.0515, 0.114], [0.05, 0.1165], [0, 0.1165]], 0, AX, 0, 24), C.collar, M.metal);
  for (let k = 0; k < 5; k++) body.add(ring(0.0518, 0.0013, 0, AX, 0.0955 + k * 0.0042, 'z', 4, 24), C.collar, M.metal);

  // ---- clear shell (see-through part) and the black nozzle cap at its tip
  S.add(bpFacet([[0.0535, 0.1135, 1], [0.056, 0.118, 1], [0.056, 0.294], [0.0548, 0.307], [0.0505, 0.322], [0.0425, 0.3345], [0.032, 0.3435], [0.0235, 0.3482], [0.019, 0.3496]], [true, true]), C.shell, M.lens);
  // black nozzle ring at the dome tip (open bore with a dark throat) and the retractable silver pen tip inside it
  body.add(bpLoft([0.3445, 0.348, 0.3595, 0.3675, 0.3722].map((z, i) => ({ z, pts: [...bpNgon([0.0158, 0.0178, 0.0181, 0.0155, 0.0118][i], 8, Math.PI / 8)], sharp: i === 0 })), true, [true, false]), C.nose, M.satin);
  body.add(zlathe([[0.0119, 0.3721], [0.0098, 0.3728], [0.0088, 0.372], [0.0086, 0.352], [0, 0.352]], 0, AX, 0, 16), '#0b0b0d', M.satin);   // bore throat
  PT.add(zlathe([[0, 0.338], [0.0074, 0.338], [0.0077, 0.3585], [0.0073, 0.3635], [0.006, 0.3668], [0.0036, 0.3685], [0, 0.369]], 0, AX, 0, 14), C.tip, M.metal);
  PT.add(ring(0.0076, 0.0008, 0, AX, 0.3555, 'z', 4, 14), C.collar, M.metal);

  // ---- spun cluster: hex hub, centre axle, six clear barrels with collars and silver bullet tips
  B.add(zlathe([[0, 0.1165], [0.04, 0.1165], [0.0425, 0.119], [0.0425, 0.1225], [0.039, 0.125], [0, 0.125]], 0, AX, 0, 6), C.hub, M.metal);
  B.add(zcyl(0.0045, 0.124, 0.3465, 0, AX, 10), C.tip, M.metal);
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, x = Math.cos(a) * BP.seats, y = AX + Math.sin(a) * BP.seats;
    B.add(zcyl(0.0082, 0.124, 0.268, x, y, 12), C.tube, M.lens);
    B.add(zlathe([[0, 0.146], [0.0105, 0.146], [0.011, 0.148], [0.011, 0.158], [0.0105, 0.16], [0, 0.16]], x, y, 0, 12), C.collar, M.metal);
    B.add(zlathe([[0, 0.266], [0.0094, 0.266], [0.0094, 0.279], [0.0087, 0.2805], [0.0087, 0.2865], [0.0094, 0.288], [0.0094, 0.295], [0.0079, 0.3025], [0.0052, 0.3085], [0, 0.3095]], x, y, 0, 12), C.tip, M.metal);
    BI.add(zcyl(0.0086, 0.1255, 0.2665, x, y, 12));
    TI.add(zlathe([[0, 0.3082], [0.0037, 0.3082], [0.0037, 0.3102], [0, 0.311]], x, y, 0, 6));
  }

  // ---- white U foregrip cradling the shell (ribbed flanks, four screws)
  const ga0 = bpRad(171), ga1 = bpRad(369), gs = bpSector(0.0565, 0.066, ga0, ga1), gsIn = bpSector(0.0565, 0.0612, ga0, ga1);
  const gsh = [0, 14, 15, 29];
  body.add(bpLoft([{ z: 0.1165, pts: gsIn }, { z: 0.122, pts: gs, sharp: true }, { z: 0.252, pts: gs, sharp: true }, { z: 0.2655, pts: bpSector(0.0565, 0.0598, ga0, ga1) }], gsh), C.white, M.gloss);
  for (let k = 0; k < 5; k++) {
    const z = 0.143 + k * 0.0225, rs = bpSector(0.0645, 0.0698, bpRad(177), bpRad(363)), rl = bpSector(0.0645, 0.0665, bpRad(177), bpRad(363));
    body.add(bpLoft([{ z: z - 0.0045, pts: rl }, { z: z - 0.0018, pts: rs }, { z: z + 0.0018, pts: rs }, { z: z + 0.0045, pts: rl }], gsh), C.white, M.gloss);
  }
  for (const a of [bpRad(222), bpRad(318)]) for (const z of [0.1305, 0.2455]) {
    const c = Math.cos(a), s = Math.sin(a);
    body.add(cyl(0.0042, [c * 0.0652, AX + s * 0.0652, z], [c * 0.0688, AX + s * 0.0688, z], 10), C.screw, M.metal);
    body.add(box(0.0012, 0.0012, 0.0062, c * 0.069, AX + s * 0.069, z, 0.2, 4, 4), '#3a3b3f', M.satin);
  }

  // ---- top handle: dark flat bar from a rear foot over to the clevis; the clevis (two raked arms on a saddle) and its bolt
  const bar = [[0, -0.0255, -0.057], [0, -0.0165, -0.051], [0, -0.006, -0.043], [0, 0.0015, -0.032], [0, 0.003, -0.018], [0, 0.003, 0.0],
    [0, 0.003, 0.03], [0, 0.0005, 0.046], [0, -0.007, 0.06], [0, -0.016, 0.072], [0, -0.0245, 0.083]];
  const barN = bar.map((p, i) => { const a = bar[Math.max(0, i - 1)], b = bar[Math.min(bar.length - 1, i + 1)]; return [0, b[2] - a[2], -(b[1] - a[1])]; });
  body.add(bpRibbon(bar, barN, 0.0135, 0.0078), C.bar, M.metal);
  body.add(box(0.019, 0.01, 0.018, 0, AX + 0.0585, -0.056, 0.3, 8, 6), C.bar, M.metal);                                          // rear foot
  body.add(bpLoft([{ z: 0.074, pts: bpSector(0.0535, 0.0595, bpRad(52), bpRad(128), 8) }, { z: 0.098, pts: bpSector(0.0535, 0.0595, bpRad(52), bpRad(128), 8) }], [0, 8, 9, 17]), C.bar, M.metal); // saddle
  for (const sx of [-1, 1]) {
    const arm = slab([[0.074, -0.05], [0.097, -0.05], [0.104, -0.022], [0.111, 0.004], [0.1135, 0.015], [0.109, 0.0225], [0.1, 0.0235], [0.0935, 0.018], [0.088, 0.0], [0.081, -0.024]], 0.0068, 0, 0.0018);
    body.add(arm.translate(sx * 0.0315, 0, 0), C.bar, M.metal);
    body.add(xcyl(0.0062, sx * 0.0345, sx * 0.0372, 0.0145, 0.1025, 6), C.bolt, M.metal);                                   // bolt heads
  }
  body.add(xcyl(0.0034, -0.035, 0.035, 0.0145, 0.1025, 10), C.bolt, M.metal);                                                       // bolt
  tr.add(box(0.0055, 0.013, 0.0075, 0, -0.008, 0.024, 0.3, 6, 4), '#2a2a2e', M.satin);                                             // trigger blade

  return rebuild(d, {
    body, ink,
    parts: {
      trigger: part(tr, [0, -0.002, 0.024]),
      barrels: part(B, [0, AX, 0.2]),
      barrelInk: part(BI, [0, AX, 0.1255], 'ink'),
      tipInk: part(TI, [0, AX, 0.2], 'ink'),
      penTip: part(PT, [0, AX, 0.36]),
      shell: part(S, [0, AX, 0.2], 'lamp', { color: '#eef3f5', emissive: '#000000', intensity: 0, roughness: 0.05 }),
    },
    glow: glowGeometry(G, AX - 0.036, AX + 0.036, 'y'),
    // right fist round the top bar (axis along Z, wrist up and out); left fist round the clevis bolt (axis along X)
    gripR: gripSpec([0, 0.003, 0.004], [0, 0.0, 1], [0.5, 1, -0.35]),
    gripL: gripSpec([0, 0.0145, 0.1025], [-1, 0, 0], [0.45, 0.6, -0.65]),
    muzzle: [0, AX, 0.3735],   // nozzle ring exit (the pen tip slides 0.028 m past it while streaming)
  });
}

function nautilus(d) {
  // Rebuilt (Opus): a large round dark reservoir disc with a gold rim at the rear (flat faces sideways),
  // a silver neck bracket, a dark cylindrical body with a teal window and silver clamp rings, a cone head
  // with three short nozzles (the spun cluster) and a black pistol grip.
  const AX = 0.07, C = { dark: '#2b2c31', gold: '#b99a45', silver: '#b9bcc1', teal: '#6fb7a8', black: '#16171a' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.dark, guardColor: C.dark });
  const dy = AX + 0.03, dz = -0.075;
  body.add(xlathe([[0, -0.036], [0.07, -0.032], [0.098, -0.018], [0.104, 0], [0.098, 0.018], [0.07, 0.032], [0, 0.036]], 0, dy, dz, 32), C.dark, M.gloss);
  body.add(ring(0.103, 0.006, 0, dy, dz, 'x', 6, 36), C.gold, M.metal);
  body.add(box(0.03, 0.06, 0.05, 0, AX + 0.01, 0.0, 0.4), C.silver, M.satin);                                   // neck bracket
  body.add(zlathe([[0, -0.01], [0.034, -0.01], [0.036, 0.02], [0.036, 0.19], [0.03, 0.2], [0, 0.2]], 0, AX, 0, 24), C.dark, M.satin);
  for (const z of [0.03, 0.17]) body.add(ring(0.037, 0.005, 0, AX, z, 'z', 6, 24), C.silver, M.satin);
  ink.add(box(0.012, 0.03, 0.08, -0.036, AX, 0.1, 0.3));                                                         // teal window (ink)
  ink.add(box(0.012, 0.03, 0.08, 0.036, AX, 0.1, 0.3));
  B.add(zlathe([[0, 0.2], [0.034, 0.2], [0.03, 0.235], [0.018, 0.26], [0, 0.262]], 0, AX, 0, 24), C.dark, M.satin);
  B.add(ring(0.032, 0.004, 0, AX, 0.205, 'z', 6, 24), C.gold, M.metal);
  for (const [x, y] of [[0, 0.016], [-0.014, -0.009], [0.014, -0.009]]) B.add(zcyl(0.0055, 0.24, 0.296, x, AX + y, 10), C.black, M.satin);
  return finish(d, body, B, tr, AX, 0.298, C.black, ink);
}

function examiner(d) {
  // Rebuilt (Opus): a light-grey box tank low at the rear (red print), two white cylinders on top of it,
  // a silver tube frame and carry handle, a black/red centre drum, a clear sleeve (ribs) round four
  // barrels with black tips.
  const AX = 0.07, C = { grey: '#d9d8d3', white: '#efefec', red: '#d0303a', black: '#18191d', silver: '#c2c5c9', clear: '#d6dade' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.red, guardColor: C.black });
  body.add(box(0.11, 0.1, 0.13, 0, 0.0, -0.075, 0.25), C.grey, M.satin);                                         // box tank
  body.add(box(0.002, 0.02, 0.08, -0.056, 0.0, -0.075, 0.2), C.red, M.print);
  for (const x of [-0.022, 0.022]) body.add(zcyl(0.018, -0.12, -0.03, x, 0.07, 16), C.white, M.gloss);        // twin cylinders
  body.add(zlathe([[0, -0.02], [0.045, -0.02], [0.05, 0.0], [0.05, 0.08], [0.04, 0.1], [0, 0.1]], 0, AX, 0, 28), C.black, M.satin); // drum
  body.add(ring(0.051, 0.008, 0, AX, 0.05, 'z', 6, 28), C.red, M.gloss);
  for (const sx of [-1, 1]) body.add(pipe([[sx * 0.04, -0.04, 0.02], [sx * 0.06, 0.0, 0.12], [sx * 0.055, AX + 0.06, 0.15], [sx * 0.03, AX + 0.07, 0.06]], 0.0055, 24, 6), C.silver, M.satin); // tube frame
  body.add(pipe([[0, AX + 0.05, 0.0], [0, AX + 0.095, 0.02], [0, AX + 0.095, 0.08], [0, AX + 0.05, 0.1]], 0.006, 16, 6), C.black, M.satin);
  for (const z of [0.1, 0.18, 0.24]) body.add(ring(0.04, 0.003, 0, AX, z, 'z', 6, 24), C.clear, M.gloss);
  for (const [x, y] of [[-0.016, 0.016], [0.016, 0.016], [-0.016, -0.016], [0.016, -0.016]]) {
    B.add(zcyl(0.01, 0.1, 0.25, x, AX + y, 10), C.red, M.gloss);
    B.add(zlathe([[0, 0.25], [0.01, 0.25], [0.006, 0.275], [0, 0.278]], x, AX + y, 0, 10), C.black, M.satin);
  }
  ink.add(zcyl(0.034, 0.105, 0.24, 0, AX, 18));
  return finish(d, body, B, tr, AX, 0.28, C.black, ink);
}

export const MODELS = {
  'splatling': { sourceModel: 'Wmn_Spinner_StandardT', build: heavy, hold: HOLD_HEAVY, nativeCarry: true, pose: heavyPose },
  's3-spinner-quick': { sourceModel: 'Wmn_Spinner_QuickT', build: mini },
  's3-spinner-hyper': { sourceModel: 'Wmn_Spinner_HyperT', build: hydra },
  's3-spinner-downpour': { sourceModel: 'Wmn_Spinner_Downpour', build: ballpoint, animate: ballpointAnimate, hold: HOLD_BALLPOINT, nativeCarry: true, pose: heavyPose },
  's3-spinner-hypershort': { sourceModel: 'Wmn_Spinner_HyperShort', build: examiner },
  's3-spinner-serein': { sourceModel: 'Wmn_Spinner_Serein', build: nautilus },
};
