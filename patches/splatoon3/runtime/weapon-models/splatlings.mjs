// Splatling family models (Splatoon 3 Ver.11.3.0 spinners): Heavy Splatling, Mini Splatling, Hydra Splatling,
// Ballpoint Splatling, Nautilus 47, Heavy Edit Splatling. Shapes follow the official per-weapon 3D renders and
// the turntable frames (Inkipedia "S3 <Name> model rotating.mp4"); colours come from the 3D renders. The native
// splatling channels are kept: `trigger` (pistol trigger) and `barrels` (the spun cluster, rotating about its
// local Z through a pivot on the barrel axis). The native charge coil is kept for readability although none of the six references
// shows a charge meter. Everything is procedural geometry.
import { THREE, V, Pieces, M, zlathe, xlathe, ylathe, zcyl, ring, pipe, box, sphere, cyl, lathe, torus, at, slab, pistolGrip, supportHandle,
  gripSpec, glowGeometry, part, rebuild, TRIGGER_PIVOT } from './kit.mjs';

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
// coupling, and on the holder's right the big team-ink bottle tank leaning back 55° in a wire cage (two hoops,
// four bars, bottom ring), held by two magenta clips, with a black ribbed outlet and a braided team-ink hose that
// loops under the gun into the coupling. Prints (white logo, small text row, magenta square) on the tank's flank.
// Tank authored at R 0.074 / L 0.2 in its own frame, then scaled by k, leaned back and placed at B (bottom face centre).
const HEAVY = { AX: -0.075, lean: 48 * Math.PI / 180, k: 1.5, B: [-0.152, -0.144, 0.075], R: 0.074, L: 0.2 };
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
// The right fist sits on top of the gun (the barrels hang 0.075 m below it), so every native splatling anchor is
// raised 0.09 m: the barrels stay at hip height as in the Tableturf card / class promo; native carry keeps that hold.
const HOLD_HEAVY = {
  carry: { p: [-0.16, 0.83, 0.16] }, aim: { p: [-0.07, -0.07, 0.2] },
  raise: { p: [-0.17, 1.29, 0.1] }, lobby: { p: [-0.15, 0.89, 0.2] },
};
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
  body.add(heavyLoft([{ z: -0.104, y: AX - 0.008, w: 0.058, h: 0.08, r: 0.007 }, { z: 0.002, y: AX - 0.008, w: 0.058, h: 0.084, r: 0.007 }]), C.grey, M.satin); // rear housing
  body.add(heavyLoft([{ z: -0.112, y: AX - 0.008, w: 0.064, h: 0.09, r: 0.008 }, { z: -0.088, y: AX - 0.008, w: 0.066, h: 0.092, r: 0.008 }]), C.grey, M.satin); // end cap
  body.add(box(0.034, 0.014, 0.006, 0, AX - 0.008, -0.113, 0.15, 8, 6), C.black, M.satin);                                            // rear slot
  body.add(box(0.05, 0.012, 0.09, 0, AX + 0.034, -0.05, 0.3, 8, 6), C.dark, M.satin);                                                // housing top rail
  for (const sx of [-1, 1]) {
    body.add(box(0.006, 0.06, 0.05, sx * 0.0335, AX - 0.02, -0.045, 0.2, 8, 6), C.dark, M.satin);                                   // housing side panel
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
  // cage strut from the coupling up to the upper hoop's rear
  body.add(pipe([[-0.012, -0.19, 0.04], heavyTank(Math.cos(4.4) * rc, 0.115, Math.sin(4.4) * rc)], 0.0038, 2, 6), C.wire, M.satin);
  // braided team-ink hose: outlet tip → loop under the gun → coupling bottom
  const tip = heavyTank(0, -0.046, 0), out = heavyTank(0, -0.066, 0), hosePath = [tip, out, [-0.082, -0.224, 0.142], [-0.038, -0.228, 0.088], [-0.007, -0.216, 0.061], [0, -0.198, 0.052]];
  ink.add(pipe(hosePath, 0.0125, 24, 8));
  for (let k = 0; k < 9; k++) {                                                                                                // braid ribs
    const t = (k + 0.5) / 9, c = new THREE.CatmullRomCurve3(hosePath.map(p => V(...p)), false, 'centripetal');
    const p = c.getPoint(t), tg = c.getTangent(t);
    ink.add(torus(0.0128, 0.0018, 3, 10).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), tg)).translate(p.x, p.y, p.z));
  }

  return rebuild(d, {
    body, ink,
    parts: { trigger: part(tr, [0, -0.012, 0.022]), barrels: part(B, [0, AX, 0.3]) },
    glow: glowGeometry(G, 0.008, 0.06, 'z'),
    // right fist round the top grip plate (axis along Z, wrist up and out to the right); left fist on the carry loop's bar
    gripR: gripSpec([0, 0.004, -0.002], [0, 0.12, 1], [-0.35, 1, -0.1]),
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

function ballpoint(d) {
  // Rebuilt (Opus): a long pen-like barrel — a clear sleeve (drawn as ribs and rings so the ink-filled
  // barrel bundle inside stays visible), a black front ring and nose, a white rear cap, a black band with a
  // logo panel, a white ribbed foregrip below and a silver carry handle on top.
  const AX = 0.07, C = { white: '#eceae4', black: '#1a1b1f', clear: '#d6dade', silver: '#c1c4c8' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.black, guardColor: C.black });
  body.add(zlathe([[0, -0.11], [0.03, -0.112], [0.05, -0.095], [0.052, -0.04], [0, -0.04]], 0, AX, 0, 28), C.white, M.gloss);  // rear cap
  body.add(zlathe([[0, -0.04], [0.054, -0.04], [0.054, 0.06], [0, 0.06]], 0, AX, 0, 28), C.black, M.satin);                     // black band
  for (const z of [0.07, 0.17, 0.27, 0.36]) body.add(ring(0.05, 0.0035, 0, AX, z, 'z', 6, 28), C.clear, M.gloss);               // sleeve rings
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; body.add(cyl(0.003, [Math.cos(a) * 0.05, AX + Math.sin(a) * 0.05, 0.06], [Math.cos(a) * 0.05, AX + Math.sin(a) * 0.05, 0.37], 6), C.clear, M.gloss); }
  body.add(zlathe([[0.05, 0.37], [0.054, 0.37], [0.05, 0.4], [0.03, 0.42], [0.03, 0.43], [0, 0.43]], 0, AX, 0, 28), C.black, M.satin);  // nose
  body.add(box(0.05, 0.05, 0.13, 0, -0.005, 0.16, 0.35), C.white, M.gloss);                                     // ribbed foregrip block
  for (let k = 0; k < 5; k++) body.add(box(0.054, 0.006, 0.01, 0, -0.03, 0.115 + k * 0.022, 0.5), C.white, M.gloss);
  body.add(pipe([[0, AX + 0.05, -0.02], [0, AX + 0.1, 0.0], [0, AX + 0.1, 0.06], [0, AX + 0.052, 0.07]], 0.006, 16, 6), C.silver, M.satin);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; B.add(zcyl(0.011, 0.06, 0.37, Math.cos(a) * 0.026, AX + Math.sin(a) * 0.026, 10), '#ffffff', M.gloss); }
  ink.add(zcyl(0.042, 0.065, 0.365, 0, AX, 20));                                                                 // ink inside the sleeve
  return finish(d, body, B, tr, AX, 0.432, C.black, ink);
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
  'splatling': { sourceModel: 'Wmn_Spinner_StandardT', build: heavy, hold: HOLD_HEAVY, nativeCarry: true },
  's3-spinner-quick': { sourceModel: 'Wmn_Spinner_QuickT', build: mini },
  's3-spinner-hyper': { sourceModel: 'Wmn_Spinner_HyperT', build: hydra },
  's3-spinner-downpour': { sourceModel: 'Wmn_Spinner_Downpour', build: ballpoint },
  's3-spinner-hypershort': { sourceModel: 'Wmn_Spinner_HyperShort', build: examiner },
  's3-spinner-serein': { sourceModel: 'Wmn_Spinner_Serein', build: nautilus },
};
