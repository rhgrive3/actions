// Shooter family models, group A (Splatoon 3 Ver.11.3.0 main weapons): Splattershot,
// Sploosh-o-matic, Splattershot Jr., Splash-o-matic, Aerospray MG, .52 Gal, N-ZAP '85.
// Shapes follow the official per-weapon 3D renders (Inkipedia "S3 Weapon Main <name> 3D"),
// the official turntable videos ("S3 <name> model rotating.mp4") and promo screenshots for
// the hold. Scale is set by the hand-held handle (≈ 0.085 m visible below the frame, i.e.
// the 0.11 m pistol handle of the native rig). Internal model names come from
// Leanny/splat3 ActorInfo (Fmdb). Everything is procedural geometry.
import { THREE, Pieces, M, V, box, sphere, zlathe, ylathe, zcyl, xcyl, ycyl, ring, pipe, slab, smoothOutline,
  rotateAbout, pistolGrip, gripSpec, part, rebuild, TRIGGER_PIVOT } from './kit.mjs';

// Reference pixel → weapon space helper for a side render (muzzle right, 400 px frame).
// (gx, gy) = handle-axis point in the image that becomes the origin, s = metres per pixel.
const px = (gx, gy, s) => (x, y) => [(x - gx) * s, (gy - y) * s];
const PISTOL_RAKE = Math.atan2(0.25, 1);

// ------------------------------------------------------------------------------------------ local geometry helpers
/** Flat band (rectangular section width × thick) swept through points with a given surface normal per point
 *  (the band lies flat against that normal). closed: the band is a loop. Flat-shaded faces. */
function ribbon(points, normals, width, thick, closed = false) {
  const n = points.length, pos = [], idx = [];
  const T = V(), N = V(), B = V(), c = [V(), V(), V(), V()];
  const rings = [];
  for (let i = 0; i < n; i++) {
    const a = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    N.set(...normals[i]); N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N).normalize();
    const p = V(...points[i]);
    c[0].copy(p).addScaledVector(B, width / 2).addScaledVector(N, thick / 2);
    c[1].copy(p).addScaledVector(B, -width / 2).addScaledVector(N, thick / 2);
    c[2].copy(p).addScaledVector(B, -width / 2).addScaledVector(N, -thick / 2);
    c[3].copy(p).addScaledVector(B, width / 2).addScaledVector(N, -thick / 2);
    rings.push(c.map(v => v.clone()));
  }
  const quad = (a, b, cc, d) => { const o = pos.length / 3; for (const v of [a, b, cc, d]) pos.push(v.x, v.y, v.z); idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const r0 = rings[i], r1 = rings[(i + 1) % n];
    for (let f = 0; f < 4; f++) { const g = (f + 1) % 4; quad(r0[f], r0[g], r1[g], r1[f]); }
  }
  if (!closed) { const a = rings[0], b = rings[n - 1]; quad(a[3], a[2], a[1], a[0]); quad(b[0], b[1], b[2], b[3]); }
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }   // outward winding
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}
/** Rounded-rectangle loft along +Z: sections [{ z, y, w, h, r }] (full width/height, corner radius). */
function loft(sections, cn = 3) {
  const ring = s => {
    const out = [], r = Math.min(s.r ?? 0.006, s.w / 2 - 1e-4, s.h / 2 - 1e-4), hw = s.w / 2 - r, hh = s.h / 2 - r;
    const cs = [[hw, hh, 0], [-hw, hh, Math.PI / 2], [-hw, -hh, Math.PI], [hw, -hh, 1.5 * Math.PI]];
    for (const [x, y, a0] of cs) for (let i = 0; i <= cn; i++) { const a = a0 + (i / cn) * Math.PI / 2; out.push([x + r * Math.cos(a), s.y + y + r * Math.sin(a), s.z]); }
    return out;
  };
  const R = sections.map(ring), m = R[0].length, pos = [], idx = [];
  for (const r of R) for (const p of r) pos.push(...p);
  for (let k = 0; k < R.length - 1; k++) for (let i = 0; i < m; i++) {
    const a = k * m + i, b = k * m + (i + 1) % m, c = (k + 1) * m + (i + 1) % m, d = (k + 1) * m + i;
    idx.push(a, c, d, a, b, c);
  }
  for (const [k, flip] of [[0, true], [R.length - 1, false]]) {   // caps with their own vertices (flat)
    const o = pos.length / 3, s = sections[k]; pos.push(0, s.y, s.z);
    for (const p of R[k]) pos.push(...p);
    for (let i = 0; i < m; i++) { const a = o + 1 + i, b = o + 1 + (i + 1) % m; flip ? idx.push(o, b, a) : idx.push(o, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Knurl ribs around an axis-aligned cylinder along Z (r, z0..z1) at (x, y). */
function knurlZ(p, r, z0, z1, x, y, n, color, mat = M.metal, rib = 0.0022) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    p.add(box(rib, rib, z1 - z0, 0, r, (z0 + z1) / 2, 0.5, 6, 4).rotateZ(a).translate(x, y, 0), color, mat);
  }
}
/** A grip spec along an axis raked `rake` radians from vertical (top forward), through the origin. */
const rakedGrip = rake => gripSpec([0, 0, 0], [0, Math.cos(rake), Math.sin(rake)], [0, Math.sin(rake), -Math.cos(rake)]);
/** The native support-hand spec (fist round a fore-end, thumb up) tilted about X by `tilt` (+ = thumb toward the muzzle). */
function supportGrip(pos, tilt = 0) {
  const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), tilt);
  return gripSpec(pos, V(0, 1, -0.12).applyQuaternion(q), V(0.45, -0.05, -1).applyQuaternion(q));
}

// ------------------------------------------------------------------------------------------ Splattershot
function splattershot(d) {
  // Wmn_Shooter_Normal(+T, +B): purple pistol frame, ink tank lying along the top with a blue ribbed
  // cap at the back, a flat yellow strap (rear carry loop facing backwards + an S-shaped band over
  // each flank), yellow ribbed fore-end with a dark linkage, yellow front plate, flared yellow nozzle.
  const C = { purple: '#3d2ba0', yellow: '#efbf2a', blue: '#2d63e0', black: '#1c1d22', steel: '#9aa0a8' };
  const s = 0.11 / 120, P = px(118, 265, s);
  const body = new Pieces(), ink = new Pieces(), can = new Pieces();
  const trig = pistolGrip(body, { color: C.purple, triggerColor: C.yellow, guardColor: C.purple });
  // purple receiver over the grip (side outline from the render), steel screws
  body.add(slab([P(80, 200), P(205, 200), P(205, 222), P(185, 230), P(150, 232), P(120, 226), P(92, 222), P(80, 212)], 0.032, 0, 0.004), C.purple, M.satin);
  for (const sx of [-1, 1]) for (const [x, y] of [[106, 219], [176, 219]]) {
    const [z, yy] = P(x, y); body.add(sphere(0.0035, 0.0035, 0.002, sx * (0.0165), yy, z, 10, 6), C.steel, M.metal);
  }
  // ink tank (team colour, pulses per shot): capsule from the rear cap to the fore-end
  const [tz0] = P(52, 0), [tz1] = P(290, 0), [, ty] = P(0, 148), tr = 52 * s, tc = (tz0 + tz1) / 2;
  can.add(zlathe([[0, tz0], [tr * 0.55, tz0 + tr * 0.08], [tr * 0.86, tz0 + tr * 0.3], [tr, tz0 + tr * 0.7], [tr, tz1 - tr * 0.7], [tr * 0.86, tz1 - tr * 0.3], [tr * 0.55, tz1 - tr * 0.08], [0, tz1]], 0, ty, 0, 28));
  // blue screw cap: a cone narrowing backwards with lengthwise knurl ribs, tilted up at the back
  const cap = new Pieces();
  cap.add(zlathe([[0, -0.03], [0.0125, -0.03], [0.0135, -0.026], [0.02, 0.01], [0.023, 0.014], [0.023, 0.024], [0, 0.024]], 0, 0, 0, 18), C.blue, M.gloss);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    cap.add(pipe([[sa * 0.0128, ca * 0.0128, -0.027], [sa * 0.0198, ca * 0.0198, 0.009]], 0.0016, 2, 4), C.blue, M.gloss);
  }
  cap.add(ring(0.0085, 0.0012, 0, 0, -0.0302, 'z', 4, 14), C.blue, M.gloss);
  body.merge(cap.transform(g => g.rotateX(0.22).translate(0, ty + 0.003, tz0 - 0.004)));
  // flat yellow strap: collar round the tank's rear shoulder, carry loop standing up at the back
  // (facing backwards, leaning back) and an S band on each flank (crest over the top at ~35 %,
  // down under at ~65 %, then along the lower flank into the fore-end)
  const band = 0.0105, bt = 0.0026, R0 = tr + bt / 2 + 0.0005;
  const collarZ = tz0 + 0.03, cr = R0 - 0.002, cpts = [], cnor = [];
  for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; cpts.push([Math.sin(a) * cr, ty + Math.cos(a) * cr, collarZ]); cnor.push([Math.sin(a), Math.cos(a), 0]); }
  body.add(ribbon(cpts, cnor, band, bt, true), C.yellow, M.gloss);
  const loopPts = [], loopNor = [], lw = 0.019, lh = 0.04, lcY = ty + 0.04;
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2, x = Math.sin(a) * lw, y = Math.cos(a) * lh;
    loopPts.push([x, lcY + y, tz0 + 0.004]); loopNor.push([Math.sin(a) / lw, Math.cos(a) / lh, 0]);
  }
  body.add(rotateAbout(ribbon(loopPts, loopNor, 0.0065, 0.0075, true), [1, 0, 0], -0.28, [0, ty + 0.01, tz0 + 0.004]), C.yellow, M.gloss);
  // S path as (u along the tank, angle from the top / π), smoothed with a Catmull-Rom curve
  const KEY = [[0, 0.8], [0.09, 0.55], [0.2, 0.17], [0.31, 0.06], [0.42, 0.14], [0.53, 0.5], [0.64, 0.8], [0.8, 0.86], [1, 0.84]];
  const path = new THREE.CatmullRomCurve3(KEY.map(([u, a]) => V(u, a, 0)), false, 'centripetal').getPoints(40);
  for (const sx of [-1, 1]) {
    const pts = [], nor = [];
    for (const q of path) {
      const u = q.x, z = collarZ + u * (tz1 - 0.012 - collarZ), a = Math.PI * q.y;
      const shrink = z > tz1 - 0.03 ? Math.sqrt(Math.max(0.5, 1 - ((z - tz1 + 0.03) / 0.05) ** 2)) : 1;
      pts.push([sx * Math.sin(a) * R0 * shrink, ty + Math.cos(a) * R0 * shrink, z]); nor.push([sx * Math.sin(a), Math.cos(a), 0]);
    }
    body.add(ribbon(pts, nor, band, bt), C.yellow, M.gloss);
  }
  // fore-end: yellow block with a rounded belly and finger ribs, dark linkage, yellow front plate
  body.add(slab(smoothOutline([P(197, 212), P(262, 212), P(300, 220), P(302, 246), P(286, 262), P(248, 270), P(212, 264), P(198, 242)], 28), 0.038, 0, 0.006), C.yellow, M.gloss);
  for (let k = 0; k < 4; k++) { const [z, y] = P(250 + k * 11, 254); body.add(box(0.033, 0.012, 0.0072, 0, y, z, 0.55), C.yellow, M.gloss); }
  for (const sx of [-1, 1]) {
    const [z0, y0] = P(206, 206), [z1, y1] = P(296, 172), [z2, y2] = P(270, 214);
    body.add(pipe([[sx * 0.0175, y0, z0], [sx * 0.0175, y1, z1]], 0.0028, 2, 6), C.black, M.metal);
    body.add(pipe([[sx * 0.0185, y2, z2], [sx * 0.0185, y1 - 0.004, z1]], 0.0026, 2, 6), C.black, M.metal);
  }
  body.add(slab([P(292, 162), P(312, 158), P(318, 170), P(318, 245), P(306, 252), P(292, 246)], 0.042, 0, 0.006), C.yellow, M.gloss);
  for (const sx of [-1, 1]) { const [z, y] = P(310, 226); body.add(zcyl(0.0075, z - 0.003, z + 0.004, sx * 0.0125, y, 6), C.black, M.metal); }
  // short steel barrel and flared nozzle with a blue core
  const [bz0, by] = P(304, 184), [bz1] = P(325, 0), [nz1] = P(386, 0);
  body.add(zcyl(0.0085, bz0, bz1 + 0.004, 0, by, 14), C.black, M.metal);
  body.add(zlathe([[0.0085, bz1], [0.011, bz1], [0.026, nz1 - 0.004], [0.029, nz1], [0.022, nz1 + 0.0015], [0.0105, nz1 + 0.001], [0, nz1 + 0.001]], 0, by, 0, 24), C.yellow, M.gloss);
  body.add(zlathe([[0, nz1], [0.0095, nz1], [0.0095, nz1 + 0.0035], [0, nz1 + 0.0042]], 0, by, 0, 16), C.blue, M.gloss);
  return rebuild(d, {
    body, ink,
    parts: { can: part(can, [0, ty, tc], 'ink'), trigger: part(trig, TRIGGER_PIVOT) },
    // the support hand closes on the ribbed fore-end from below (S3 promo: left palm under the fore-end)
    gripL: gripSpec([0, 0.024, 0.125], [0, 1, -0.12], [0.45, -0.05, -1]),
    muzzle: [0, by, nz1 + 0.004],
  });
}

// ------------------------------------------------------------------------------------------ Sploosh / Splash-o-matic
// Same frame (Wmn_Shooter_Short / Wmn_Shooter_Precision): black rear tube with ink stripes, a clear ink
// tube, a hinged grey lever arching over the top, a gold bracket holding a pressure gauge, a threaded
// neck with a vertical weighted cross-bar, black grip with a ring trigger guard. Sploosh ends in a big
// steel funnel, Splash in a needle nozzle. All coordinates are pixels of each weapon's own render.
// The renders are a front-right 3/4 view that foreshortens everything ahead of the grip: the Sploosh
// turntable's true side frame puts gauge / cross-bar / funnel rim at 1.58 / 2.5 / 3.7 grip lengths ahead
// of the grip against 1.09 / 1.9 / 2.97 in the render, so render x ahead of the grip is stretched ×1.2.
const pxStretch = (gx, gy, s, k) => (x, y) => [(x - gx) * (x > gx ? k : 1) * s, (gy - y) * s];
const MARKER = {
  short: {
    P: pxStretch(120, 250, 0.00109, 1.2), y: 186, rear: 15, stripes: [28, 42, 56], collar: [75, 95], block: [85, 110, 148],
    tube: [95, 205], dark: [200, 246], neck: [240, 266], rod: 268, rodY: [105, 275], gauge: [205, 140],
    ring: [145, 240], link: [150, 196, 224, 238], recv: [[78, 205], [150, 205], [160, 222], [150, 232], [95, 232], [85, 222]],
    lever: [[42, 162], [62, 150], [95, 128], [135, 110], [170, 103], [205, 99], [226, 95]],
    frame: [[140, 118], [170, 113], [200, 108], [232, 112], [255, 125], [268, 150], [270, 200], [262, 240], [250, 255], [210, 256], [196, 245], [192, 232],
      [215, 225], [235, 212], [244, 190], [244, 160], [236, 140], [220, 130], [195, 128], [165, 132], [142, 130]],
    support: [228, 238],
  },
  precision: {
    P: pxStretch(138, 257, 0.00113, 1.2), y: 187, rear: 15, stripes: [28, 42, 58], collar: [85, 108], block: [88, 112, 148],
    tube: [108, 240], dark: [235, 286], neck: [280, 318], rod: 318, rodY: [88, 282], gauge: [232, 140],
    ring: [165, 240], link: [170, 215, 222, 236], recv: [[90, 207], [170, 207], [180, 224], [170, 234], [110, 234], [98, 222]],
    lever: [[55, 158], [75, 145], [105, 118], [150, 95], [190, 89], [215, 90], [228, 92]],
    frame: [[160, 115], [185, 112], [230, 100], [260, 105], [282, 125], [295, 150], [300, 190], [298, 230], [285, 255], [270, 262], [225, 262], [215, 250], [212, 238],
      [240, 228], [262, 215], [272, 190], [272, 160], [262, 140], [245, 128], [215, 125], [185, 128], [162, 130]],
    support: [255, 244],
  },
};
function marker(kind) {
  return function build(d) {
    const K = MARKER[kind], P = K.P, s = Math.abs(P(-1, 0)[0] - P(-2, 0)[0]);
    const C = { black: '#1d1e22', gold: '#b48c36', steel: '#9ea3a9', grey: '#a3a6ab', dark: '#3a3c42', white: '#f1f1ee', red: '#d0262c' };
    const body = new Pieces(), ink = new Pieces(), can = new Pieces(), needle = new Pieces();
    const trig = pistolGrip(body, { color: C.black, triggerColor: C.gold, guard: false });
    const Z = x => P(x, 0)[0], [, ty] = P(0, K.y), tr = 21 * s;
    // rear: rounded black end cap, black sleeve with three ink stripes, collar with a top block
    body.add(zlathe([[0, Z(K.rear)], [tr * 0.6, Z(K.rear) + 0.002], [tr * 0.92, Z(K.rear) + 0.009], [tr, Z(K.rear) + 0.018], [tr, Z(K.collar[0])], [0, Z(K.collar[0])]], 0, ty, 0, 20), C.black, M.gloss);
    for (const x of K.stripes) ink.add(zcyl(tr + 0.0008, Z(x) - 0.0032, Z(x) + 0.0032, 0, ty, 20));
    body.add(zlathe([[0, Z(K.collar[0])], [tr * 1.2, Z(K.collar[0])], [tr * 1.25, Z(K.collar[0]) + 0.003], [tr * 1.25, Z(K.collar[1]) - 0.003], [tr * 1.2, Z(K.collar[1])], [0, Z(K.collar[1])]], 0, ty, 0, 20), C.dark, M.metal);
    { const [z0, y0] = P(K.block[0], K.block[2]), [z1] = P(K.block[1], 0); body.add(box(0.012, ty + tr - y0 + 0.006, z1 - z0, 0, (y0 + ty + tr) / 2, (z0 + z1) / 2, 0.25), C.black, M.satin); }
    // clear ink tube (team colour, pulses per shot) and the black sleeve in front of it
    can.add(zcyl(tr, Z(K.tube[0]) - 0.002, Z(K.tube[1]), 0, ty, 22));
    body.add(zcyl(tr * 1.03, Z(K.dark[0]), Z(K.dark[1]), 0, ty, 20), C.black, M.gloss);
    // threaded steel neck and a gold collar
    body.add(zcyl(tr * 1.12, Z(K.neck[0]), Z(K.neck[1]), 0, ty, 20), C.dark, M.metal);
    for (let z = Z(K.neck[0]) + 0.003; z < Z(K.neck[1]) - 0.002; z += 0.0042) body.add(ring(tr * 1.12, 0.0016, 0, ty, z, 'z', 4, 20), C.steel, M.metal);
    // vertical cross-bar with knurled gold weights
    { const [rz, y0] = P(K.rod, K.rodY[0]), [, y1] = P(0, K.rodY[1]);
      body.add(ycyl(0.0026, y1 + 0.02, y0 - 0.02, 0, rz, 8), C.steel, M.metal);
      body.add(zcyl(tr * 1.18, rz - 0.006, rz + 0.006, 0, ty, 20), C.steel, M.metal);
      for (const [a, b] of [[y0 - 0.033, y0], [y1, y1 + 0.04]]) {
        body.add(ycyl(0.0098, a, b, 0, rz, 14), C.gold, M.gloss);
        for (let k = 0; k < 3; k++) body.add(ring(0.0101, 0.0012, 0, a + (b - a) * (0.25 + 0.25 * k), rz, 'y', 4, 14), C.gold, M.gloss);
      } }
    // gold bracket (C round the gauge, front arm hugging the neck, lower plate) and its black decal
    body.add(slab(K.frame.map(([x, y]) => P(x, y)), 0.046, 0, 0.005), C.gold, M.gloss);
    { const [fz, fy] = P(K.frame[11][0] + 30, K.frame[11][1] - 8);
      for (const sx of [-1, 1]) body.add(slab([[fz - 0.012, fy - 0.006], [fz + 0.012, fy - 0.006], [fz + 0.006, fy + 0.008], [fz - 0.012, fy + 0.002]], 0.002, sx * 0.0235, 0.0005), C.black, M.print); }
    // pressure gauge: gold bezel, white face on both sides, red needle (moves with the shots)
    { const [gz, gy] = P(...K.gauge), gr = 30 * s;
      body.add(xcyl(gr, -0.027, 0.027, gy, gz, 26), C.gold, M.gloss);
      for (const sx of [-1, 1]) {
        body.add(xcyl(gr * 0.82, sx * 0.027, sx * 0.0285, gy, gz, 26), C.white, M.gloss);
        needle.add(box(0.0012, gr * 0.7, 0.003, sx * 0.0292, gr * 0.3, 0, 0.5, 6, 4).translate(0, gy, gz), C.red, M.satin);
      } }
    // grey hinged lever arching over the top (flat bar), its hinge clip and the front tab
    { const pts = K.lever.map(([x, y]) => { const [z, yy] = P(x, y); return [0, yy, z]; });
      body.add(ribbon(pts, pts.map(() => [1, 0, 0]), 0.012, 0.0075), C.grey, M.satin);
      const [hz, hy] = P(...K.lever[0]); body.add(box(0.016, 0.014, 0.022, 0, hy - 0.004, hz + 0.004, 0.3), C.grey, M.satin);
      body.add(xcyl(0.0035, -0.0095, 0.0095, hy - 0.002, hz + 0.004, 10), C.steel, M.metal);
      const [tz, tyy] = P(...K.lever[K.lever.length - 1]); body.add(box(0.012, 0.007, 0.02, 0, tyy - 0.003, tz - 0.006, 0.3), C.grey, M.satin); }
    // black receiver under the tube, link bar to the bracket, ring trigger guard, screws
    body.add(slab(K.recv.map(([x, y]) => P(x, y)), 0.03, 0, 0.004), C.black, M.satin);
    { const [a, b, y0, y1] = K.link; body.add(slab([P(a, y0), P(b, y0), P(b, y1), P(a, y1)], 0.016, 0, 0.003), C.black, M.satin); }
    { const [rz, ry] = P(...K.ring); body.add(ring(15 * s, 0.0042, 0, ry, rz, 'x', 6, 22), C.black, M.metal); }
    for (const sx of [-1, 1]) for (const [x, y] of [[K.link[0] + 30, (K.link[2] + K.link[3]) / 2], [K.ring[0] - 22, K.ring[1] + 8]]) {
      const [z, y2] = P(x, y); body.add(sphere(0.002, 0.0034, 0.0034, sx * 0.0155, y2, z, 10, 6), C.steel, M.metal);
    }
    let muzzle;
    if (kind === 'short') {
      // big spun-steel funnel: throat right after the cross-bar, wide mouth with a rolled lip
      const z0 = Z(272), z1 = Z(352), r1 = 90 * s;
      body.add(zlathe([[0.023, z0], [0.026, z0 + 0.006], [r1 * 0.72, z1 - 0.025], [r1 * 0.97, z1 - 0.004], [r1, z1], [r1 - 0.004, z1 + 0.003], [r1 - 0.009, z1 + 0.001],
        [r1 * 0.9, z1 - 0.006], [0.018, z0 + 0.012], [0, z0 + 0.012]], 0, ty, 0, 32), C.steel, M.gloss);
      body.add(ring(r1 - 0.0015, 0.0038, 0, ty, z1 - 0.001, 'z', 6, 36), C.gold, M.gloss);
      muzzle = [0, ty, z1];
    } else {
      // gold collar, black cone and a long steel needle tip
      const z0 = Z(320), z1 = Z(338), z2 = Z(352), z3 = Z(386);
      body.add(zlathe([[0, z0], [0.028, z0], [0.031, z0 + 0.004], [0.031, z1 - 0.004], [0.026, z1], [0, z1]], 0, ty, 0, 24), C.gold, M.gloss);
      body.add(zlathe([[0, z1], [0.023, z1], [0.021, z2], [0.006, z3 - 0.01], [0, z3 - 0.009]], 0, ty, 0, 20), C.black, M.gloss);
      body.add(zlathe([[0, z3 - 0.012], [0.0042, z3 - 0.012], [0.0012, z3], [0, z3 + 0.001]], 0, ty, 0, 10), C.steel, M.metal);
      for (let k = 0; k < 3; k++) body.add(ring(0.0225 - k * 0.0025, 0.0011, 0, ty, z1 + 0.003 + k * 0.004, 'z', 4, 18), C.steel, M.metal);
      muzzle = [0, ty, z3 + 0.001];
    }
    const [gz, gy] = P(...K.gauge);
    return rebuild(d, {
      body, ink,
      parts: { can: part(can, [0, ty, (Z(K.tube[0]) + Z(K.tube[1])) / 2], 'ink'), trigger: part(trig, TRIGGER_PIVOT), needle: part(needle, [0, gy, gz]) },
      // S2/S3 promos: the left hand cups the lower gold bracket in front of the trigger guard
      gripL: supportGrip([0, P(...K.support)[1], P(...K.support)[0]]),
      muzzle,
    });
  };
}
// gauge needle kicks clockwise with each shot and wavers back (allocation-free)
function animateMarker(w, st) {
  const n = w.parts?.needle; if (!n) return;
  const ts = st.sinceShoot ?? 99, kick = ts < 0.5 ? Math.exp(-ts * 7) : 0;
  w.gaugeA = (w.gaugeA ?? 0) + ((st.firing ? 0.9 : 0) + 0.6 * kick - (w.gaugeA ?? 0)) * Math.min(1, (st.dt || 0) * 6);
  n.rotation.x = -0.6 - w.gaugeA + 0.04 * Math.sin((st.t || 0) * 23) * kick;
}

// ------------------------------------------------------------------------------------------ Splattershot Jr.
function splattershotJr(d) {
  // Wmn_Shooter_First: the whole boxy shell is the translucent ink tank (team colour in the video),
  // flaring into a square front block; purple filler cap with a lever on top, purple sight ball,
  // purple dome nozzle and trigger. Ladder-ribbed grip.
  const s = 0.00099, P = px(152, 256, s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { purple: '#8a2fd0', white: '#e9ecef' };
  const body = new Pieces(), ink = new Pieces(), can = new Pieces();
  const W0 = 0.064;
  // rear body (two steps), flare, front block — all ink
  can.add(loft([{ z: Z(25), y: (Y(122) + Y(205)) / 2, w: W0 * 0.96, h: Y(122) - Y(205), r: 0.006 }, { z: Z(86), y: (Y(121) + Y(205)) / 2, w: W0 * 0.96, h: Y(121) - Y(205), r: 0.006 }]));
  can.add(loft([{ z: Z(84), y: (Y(121) + Y(226)) / 2, w: W0, h: Y(121) - Y(226), r: 0.007 }, { z: Z(242), y: (Y(118) + Y(230)) / 2, w: W0, h: Y(118) - Y(230), r: 0.007 },
    { z: Z(345), y: (Y(95) + Y(246)) / 2, w: 0.142, h: Y(95) - Y(246), r: 0.012 }, { z: Z(372), y: (Y(97) + Y(244)) / 2, w: 0.14, h: Y(97) - Y(244), r: 0.014 }]));
  // raised rails along the flanks and vertical ribs on the flare (relief in the same ink shell)
  for (const sx of [-1, 1]) {
    for (const [x0, x1, y] of [[40, 235, 133], [60, 238, 158], [100, 238, 182]]) can.add(box(0.004, 0.006, Z(x1) - Z(x0), sx * W0 / 2, Y(y), (Z(x0) + Z(x1)) / 2, 0.4, 6, 4));
    for (let k = 0; k < 4; k++) {
      const x = 262 + k * 18, f = (x - 242) / 103, hw = W0 / 2 + f * (0.071 - W0 / 2), yt = Y(118 - f * 23) - 0.012, yb = Y(230 + f * 16) + 0.012;
      can.add(box(0.004, yt - yb, 0.006, sx * hw, (yt + yb) / 2, Z(x), 0.4, 6, 4));
    }
  }
  // grip: ladder-ribbed box in the same shell, slightly raked
  const grip = new Pieces();
  grip.add(box(0.03, 0.09, 0.056, 0, -0.012, 0.006, 0.22));
  for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) grip.add(box(0.003, 0.004, 0.038, sx * 0.0152, -0.044 + k * 0.014, 0.006, 0.4, 6, 4));
  grip.add(box(0.034, 0.008, 0.068, 0, -0.058, 0.012, 0.3));
  can.merge(grip.transform(g => g.rotateX(0.08)));
  // purple filler cap with a long thin lever, sight posts with a purple ball, front dome nozzle
  const capY = Y(121);
  body.add(ylathe([[0, capY], [0.031, capY], [0.032, capY + 0.004], [0.03, capY + 0.011], [0, capY + 0.012]], 0, 0, Z(112), 24), C.purple, M.gloss);
  body.add(box(0.008, 0.003, Z(178) - Z(40), 0, capY + 0.013, (Z(40) + Z(178)) / 2, 0.4), C.purple, M.gloss);
  body.add(box(0.02, 0.004, 0.012, 0, capY + 0.014, Z(42), 0.4), C.purple, M.gloss);
  for (const sx of [-1, 1]) can.add(box(0.012, Y(85) - Y(121), Z(252) - Z(220), sx * 0.016, (Y(85) + Y(121)) / 2, (Z(220) + Z(252)) / 2, 0.25));
  can.add(box(0.044, Y(100) - Y(121), Z(222) - Z(182), 0, (Y(100) + Y(121)) / 2, (Z(182) + Z(222)) / 2, 0.25));
  body.add(sphere(0.0085, 0.0085, 0.0085, 0, Y(104), Z(205), 14, 10), C.purple, M.gloss);
  const fy = Y(170), fz = Z(372);
  body.add(zlathe([[0.05, fz - 0.002], [0.052, fz + 0.001], [0.03, fz + 0.004], [0, fz + 0.004]], 0, fy, 0, 28), C.white, M.gloss);
  body.add(zlathe([[0, fz + 0.002], [0.022, fz + 0.002], [0.021, fz + 0.01], [0.012, fz + 0.019], [0, fz + 0.021]], 0, fy, 0, 22), C.purple, M.gloss);
  // purple trigger in front of the grip
  const trig = new Pieces();
  trig.add(slab([P(186, 224), P(198, 224), P(206, 246), P(202, 256), P(196, 250), P(188, 236)], 0.007, 0, 0.002), C.purple, M.gloss);
  const [cz, cyy] = P(200, 170);
  return rebuild(d, {
    body, ink,
    parts: { can: part(can, [0, cyy, cz], 'ink'), trigger: part(trig, [0, Y(226), Z(190)]) },
    // S2 promo: the left hand comes under the flared front block
    gripL: supportGrip([0, Y(222), Z(300)], 0),
    muzzle: [0, fy, fz + 0.021],
  });
}
// the whole body is the tank: keep the native per-shot pulse but much smaller
function animateWholeTank(w) {
  const c = w.parts?.can; if (!c) return;
  const a = 0.22; c.scale.set(1 + a * (c.scale.x - 1), 1 + a * (c.scale.y - 1), 1 + a * (c.scale.z - 1));
}

// ------------------------------------------------------------------------------------------ Aerospray MG
function aerospray(d) {
  // Wmn_Shooter_Blaze: a gravity-feed airbrush. Silver body tube with knurled rear wheel and front
  // air cap, open paint cup on top (its ink surface is the pulsing `can`), the hand holds the
  // raked air-inlet fitting under the body (knurled nut + regulator), black hose looping from the
  // tail to the fitting's bottom, a curved trigger lever and a spoon-shaped front paddle.
  const s = 0.00092, P = px(152, 238, s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { silver: '#a8acb2', dark: '#6e737a', black: '#1b1b1e', print: '#232326' };
  const body = new Pieces(), ink = new Pieces(), can = new Pieces(), trig = new Pieces();
  const by = Y(192);
  // body tube with a thicker middle barrel
  body.add(zcyl(0.0092, Z(118), Z(292), 0, by, 16), C.silver, M.gloss);
  body.add(zlathe([[0.0092, Z(196)], [0.0118, Z(202)], [0.0118, Z(282)], [0.0095, Z(290)]], 0, by, 0, 18), C.silver, M.gloss);
  body.add(box(0.0028, 0.0035, Z(272) - Z(205), -0.0118, by + 0.001, (Z(205) + Z(272)) / 2, 0.4, 6, 4), C.print, M.print);
  // rear knurled wheel, small boss and tapered hose nipple
  body.add(zcyl(0.025, Z(108), Z(122), 0, by, 24), C.silver, M.gloss);
  knurlZ(body, 0.025, Z(109), Z(121), 0, by, 22, C.silver, M.gloss);
  body.add(zcyl(0.012, Z(122), Z(136), 0, by, 16), C.dark, M.metal);
  body.add(zlathe([[0, Z(80)], [0.0032, Z(80)], [0.0055, Z(100)], [0.0075, Z(108)], [0, Z(108)]], 0, by, 0, 12), C.silver, M.gloss);
  // front: knurled ring, neck, big knurled air cap, conical tip with the nozzle hole
  body.add(zcyl(0.026, Z(286), Z(312), 0, by - 0.002, 24), C.silver, M.gloss);
  knurlZ(body, 0.026, Z(288), Z(310), 0, by - 0.002, 22, C.silver, M.gloss);
  body.add(zcyl(0.016, Z(312), Z(323), 0, by - 0.002, 16), C.dark, M.metal);
  body.add(zcyl(0.034, Z(323), Z(370), 0, by - 0.002, 26), C.silver, M.gloss);
  knurlZ(body, 0.034, Z(326), Z(366), 0, by - 0.002, 26, C.silver, M.gloss);
  body.add(zlathe([[0.03, Z(370)], [0.026, Z(384)], [0.018, Z(390)], [0.0062, Z(390)], [0.0062, Z(386)], [0, Z(386)]], 0, by - 0.002, 0, 22), C.silver, M.gloss);
  // paint cup (tilted slightly forward): outer wall, rolled knurled rim, inner wall down to the ink
  const cupZ = Z(215), cup = new Pieces(), inkCup = new Pieces();
  const cy = y => Y(y) - by;
  cup.add(ylathe([[0, cy(186)], [0.006, cy(186)], [0.006, cy(170)], [0.017, cy(167)], [0.033, cy(160)], [0.046, cy(148)], [0.053, cy(128)], [0.057, cy(95)], [0.059, cy(70)],
    [0.0605, cy(63)], [0.056, cy(63)], [0.054, cy(76)], [0, cy(76)]], 0, 0, 0, 30), C.silver, M.gloss);
  cup.add(ring(0.0612, 0.0042, 0, cy(64), 0, 'y', 6, 36), C.silver, M.gloss);
  for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2; cup.add(box(0.0024, 0.007, 0.0024, Math.sin(a) * 0.0652, cy(64), Math.cos(a) * 0.0652, 0.5, 6, 4), C.silver, M.gloss); }
  // stencil emblem (dark print disc) on the cup's right flank
  cup.add(sphere(0.0009, 0.016, 0.016, -0.0573, cy(105), 0.0, 14, 8).rotateY(0), C.print, M.print);
  inkCup.add(ylathe([[0, cy(77)], [0.0545, cy(77)], [0.0545, cy(75)], [0, cy(75)]], 0, 0, 0, 30));
  const cupTilt = 0.12;
  body.merge(cup.transform(g => g.rotateX(cupTilt).translate(0, by, cupZ)));
  can.merge(inkCup.transform(g => g.rotateX(cupTilt).translate(0, by, cupZ)));
  // hand-held air-inlet fitting on the native pistol axis: stem, knurled nut, regulator, nipple
  const fit = new Pieces();
  fit.add(ylathe([[0, 0.05], [0.0065, 0.05], [0.0065, 0.022], [0, 0.022]], 0, 0, 0, 14), C.silver, M.gloss);
  fit.add(ylathe([[0, 0.022], [0.015, 0.022], [0.0165, 0.018], [0.0165, 0.008], [0.015, 0.004], [0, 0.004]], 0, 0, 0, 6), C.silver, M.gloss);
  fit.add(ylathe([[0, 0.004], [0.0165, 0.003], [0.0185, -0.004], [0.0185, -0.036], [0.016, -0.044], [0.0085, -0.05], [0.0055, -0.058], [0.0035, -0.074], [0, -0.074]], 0, 0, 0, 20), C.silver, M.gloss);
  for (const y of [-0.01, -0.017, -0.024, -0.031]) fit.add(ring(0.0188, 0.0016, 0, y, 0, 'y', 4, 20), C.dark, M.metal);
  body.merge(fit.transform(g => g.rotateX(PISTOL_RAKE)));
  // black hose: tail nipple → loop behind and below → bottom of the fitting
  const bot = V(0, -0.072, 0).applyAxisAngle(V(1, 0, 0), PISTOL_RAKE);
  const hose = [[0, by, Z(82)], [0.004, Y(197), Z(58)], [0.012, Y(222), Z(28)], [0.018, Y(262), Z(12)], [0.02, Y(306), Z(16)], [0.016, Y(338), Z(42)], [0.01, Y(350), Z(80)], [0.004, Y(338), Z(114)], [0, bot.y - 0.008, bot.z - 0.004], [0, bot.y, bot.z]];
  body.add(pipe(hose, 0.0038, 48, 8), C.black, M.rubber);
  // trigger lever hanging from the cup boss, and the lower bar to the front paddle
  trig.add(slab([P(164, 166), P(180, 162), P(186, 186), P(191, 214), P(197, 238), P(187, 241), P(178, 216), P(169, 190)], 0.009, 0, 0.002), C.silver, M.gloss);
  body.add(xcyl(0.006, -0.009, 0.009, Y(172), Z(172), 14), C.dark, M.metal);
  body.add(pipe([[0, Y(214), Z(190)], [0, Y(216), Z(225)], [0, Y(222), Z(258)], [0, Y(232), Z(282)]], 0.0034, 16, 8), C.silver, M.gloss);
  body.add(box(0.018, Y(210) - Y(234), Z(292) - Z(264), 0, (Y(210) + Y(234)) / 2, (Z(264) + Z(292)) / 2, 0.35), C.silver, M.gloss);
  body.add(slab(smoothOutline([P(266, 226), P(292, 220), P(318, 236), P(340, 262), P(352, 294), P(342, 296), P(318, 274), P(292, 254), P(270, 242)], 30), 0.016, 0, 0.004), C.silver, M.gloss);
  return rebuild(d, {
    body, ink,
    parts: { can: part(can, [0, by + 0.1, cupZ], 'ink'), trigger: part(trig, [0, Y(170), Z(172)]) },
    // promos: right hand on the air-inlet fitting, support hand on the front paddle
    gripL: supportGrip([0, Y(250), Z(306)], -0.5),
    muzzle: [0, by - 0.002, Z(391)],
  });
}

// ------------------------------------------------------------------------------------------ .52 Gal
function gal52(d) {
  // Wmn_Shooter_Gravity: a waisted ink jug (team colour, pulses per shot) carried in a dark frame,
  // shoulder stock at the back, top rail with pink clips and a carry hoop, a tall ladder sight
  // standing across the front plate (faces the muzzle), a perforated barrel shroud coaxial with the
  // jug, a slanted foot plate under the front and a long pink grip raked ~41° hanging from the jug's
  // rear face. Coordinates: true side frame of the turntable video (".52 Gal Deco model rotating",
  // t = 8 s, crop 600×440 at (340, 60) scaled to 400 px) — the 3D render is a close perspective that
  // enlarges the grip; scale = grip incl. butt (140 px) = 0.11 m.
  const s = 0.11 / 140, P = px(90, 192, s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { pink: '#e2268f', dark: '#3b3d43', black: '#202125', grey: '#6d7077' };
  const body = new Pieces(), ink = new Pieces(), can = new Pieces();
  const RAKE = 0.71;
  // jug: two lobes and a waist along Z
  const jy = Y(197), j0 = Z(128), j1 = Z(316), R = 70 * s, Rw = 54 * s, zw0 = Z(203), zw1 = Z(240);
  can.add(zlathe([[0, j0], [R * 0.8, j0 + 0.002], [R * 0.97, j0 + 0.008], [R, j0 + 0.018], [R, zw0 - 0.01], [Rw, zw0 + 0.004], [Rw, zw1 - 0.004], [R, zw1 + 0.01], [R, j1 - 0.018], [R * 0.97, j1 - 0.008], [R * 0.8, j1 - 0.002], [0, j1]], 0, jy, 0, 32));
  // frame: rear and front plates, bottom rails, top rail with pink clips and carry hoop
  body.add(slab(smoothOutline([P(118, 128), P(132, 124), P(134, 262), P(124, 268), P(116, 250)], 16), 0.062, 0, 0.004), C.dark, M.satin);
  body.add(slab([P(312, 126), P(326, 126), P(328, 268), P(314, 270)], 0.09, 0, 0.004), C.dark, M.satin);
  for (const sx of [-1, 1]) body.add(pipe([[sx * 0.036, Y(258), Z(132)], [sx * 0.04, Y(268), Z(150)], [sx * 0.04, Y(268), Z(300)], [sx * 0.036, Y(260), Z(318)]], 0.0032, 12, 6), C.dark, M.satin);
  body.add(slab([P(-2, 100), P(140, 104), P(326, 124), P(326, 138), P(140, 118), P(-2, 116)], 0.028, 0, 0.004), C.dark, M.satin);
  for (const [x0, x1, y0, y1] of [[196, 226, 96, 140], [258, 292, 116, 152]]) body.add(box(0.052, Y(y0) - Y(y1), Z(x1) - Z(x0), 0, (Y(y0) + Y(y1)) / 2, (Z(x0) + Z(x1)) / 2, 0.25), C.pink, M.gloss);
  body.add(ring(0.011, 0.0024, 0, Y(104), Z(152), 'x', 4, 16, Math.PI), C.black, M.satin);
  // ladder sight: a frame across the weapon on the front plate (posts, top bar, rungs, teeth)
  const lz = Z(322), ly0 = Y(128), ly1 = Y(38);
  for (const sx of [-1, 1]) {
    body.add(box(0.009, ly1 - ly0, 0.008, sx * 0.03, (ly0 + ly1) / 2, lz, 0.2, 6, 4), C.dark, M.satin);
    for (const y of [0.35, 0.55, 0.75]) body.add(box(0.008, 0.004, 0.006, sx * 0.022, ly0 + (ly1 - ly0) * y, lz, 0.2, 6, 4), C.dark, M.satin);
  }
  body.add(box(0.069, 0.009, 0.008, 0, ly1 - 0.004, lz, 0.2, 6, 4), C.dark, M.satin);
  // perforated barrel shroud coaxial with the jug, pink-lined bore
  const bry = Y(204), bz0 = Z(318), bz1 = Z(392), br = 40 * s;
  body.add(zlathe([[0.016, bz0], [br, bz0], [br, bz1 - 0.004], [br - 0.002, bz1], [br * 0.76, bz1], [br * 0.74, bz1 - 0.006], [0.016, bz0 + 0.004]], 0, bry, 0, 26), C.black, M.satin);
  body.add(zlathe([[br * 0.74, bz1 - 0.006], [br * 0.72, bz0 + 0.012], [0, bz0 + 0.012]], 0, bry, 0, 22), C.pink, M.gloss);
  for (let k = 0; k < 4; k++) for (let j = 0; j < 9; j++) {
    const a = (j / 9) * Math.PI * 2 + (k % 2) * 0.35, z = bz0 + 0.01 + k * 0.012;
    body.add(sphere(0.0038, 0.0038, 0.0038, Math.sin(a) * br * 0.985, bry + Math.cos(a) * br * 0.985, z, 8, 6), C.pink, M.gloss);
  }
  // slanted foot plate under the front (wide across, narrow edge-on from the side)
  body.add(slab([P(316, 246), P(330, 244), P(372, 286), P(362, 292)], 0.075, 0, 0.004), C.dark, M.satin);
  // shoulder stock: upper block + lower hook, slots on both flanks
  body.add(slab(smoothOutline([P(-10, 100), P(40, 98), P(94, 100), P(100, 110), P(100, 158), P(74, 168), P(46, 186), P(30, 226), P(14, 246), P(-4, 238), P(-10, 196)], 36), 0.034, 0, 0.005), C.dark, M.satin);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) for (const x of [14, 46]) {
    const [z, y] = P(x + 18, 116 + k * 15); body.add(box(0.0012, 0.0045, 0.022, sx * 0.0172, y, z, 0.3, 6, 4), C.black, M.print);
  }
  // long raked pink grip with a grey butt plate
  const grip = new Pieces();
  grip.add(box(0.026, 0.118, 0.034, 0, -0.012, 0, 0.42), C.pink, M.gloss);
  grip.add(box(0.032, 0.012, 0.046, 0, -0.072, -0.004, 0.3), C.grey, M.satin);
  body.merge(grip.transform(g => g.rotateX(RAKE)));
  const trig = new Pieces();
  trig.add(slab([P(124, 200), P(134, 200), P(142, 222), P(138, 236), P(130, 228), P(126, 214)], 0.007, 0, 0.002), C.black, M.satin);
  return rebuild(d, {
    body, ink,
    parts: { can: part(can, [0, jy, (j0 + j1) / 2], 'ink'), trigger: part(trig, [0, Y(202), Z(128)]) },
    gripR: rakedGrip(RAKE),
    // the support hand holds the frame under the jug's front lobe
    gripL: supportGrip([0, Y(266), Z(276)], -0.1),
    muzzle: [0, bry, bz1],
  });
}
function animateHalfPulse(w) {
  const c = w.parts?.can; if (!c) return;
  const a = 0.5; c.scale.set(1 + a * (c.scale.x - 1), 1 + a * (c.scale.y - 1), 1 + a * (c.scale.z - 1));
}

// ------------------------------------------------------------------------------------------ N-ZAP '85
function nzap85(d) {
  // Wmn_Shooter_QuickMiddle: a light-gun shape — light-grey receiver with a ribbed window and a
  // red print, long dark barrel with a rolled muzzle and front sight, dark banana grip raked ~34°,
  // red trigger. No ink part is visible on the outside.
  const s = 0.000675, P = px(111, 209, s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { grey: '#9a9b9e', dark: '#3d3e42', black: '#26272a', red: '#c8262b', rib: '#7c7d81' };
  const body = new Pieces(), ink = new Pieces(), trig = new Pieces();
  const RAKE = 0.59;
  // receiver: rear wedge + lower front housing under the barrel
  body.add(slab([P(18, 136), P(36, 122), P(120, 118), P(160, 120), P(160, 140), P(244, 140), P(252, 148), P(252, 176), P(140, 178), P(110, 172), P(60, 166), P(20, 160)], 0.034, 0, 0.004), C.grey, M.satin);
  body.add(slab([P(84, 122), P(100, 110), P(132, 110), P(132, 122)], 0.02, 0, 0.003), C.dark, M.satin);
  for (let k = 0; k < 6; k++) body.add(box(0.036, 0.016, 0.0028, 0, Y(131), Z(124 + k * 6.5), 0.4, 6, 4), C.rib, M.satin);
  for (const sx of [-1, 1]) {
    body.add(box(0.0008, 0.006, Z(120) - Z(48), sx * 0.0172, Y(152), (Z(48) + Z(120)) / 2, 0.2, 6, 4), C.red, M.print);
    for (const [x, y] of [[44, 138], [116, 148], [226, 154]]) { const [z, yy] = P(x, y); body.add(sphere(0.0015, 0.0028, 0.0028, sx * 0.0172, yy, z, 10, 6), C.dark, M.metal); }
  }
  // long barrel with a flared, rolled muzzle and a front sight
  const by = Y(142), br = 17 * s, mz = Z(392);
  body.add(zlathe([[0, Z(158)], [br, Z(158)], [br, Z(364)], [br * 1.12, Z(378)], [br * 1.2, mz - 0.003], [br * 1.1, mz], [br * 0.8, mz], [br * 0.78, mz - 0.01], [0, mz - 0.01]], 0, by, 0, 22), C.dark, M.satin);
  body.add(slab([P(350, 128), P(364, 116), P(374, 120), P(372, 130)], 0.006, 0, 0.0015), C.dark, M.satin);
  // banana grip along its raked axis, rib texture on the flanks
  const grip = new Pieces();
  grip.add(slab(smoothOutline([[-0.015, 0.05], [0.016, 0.05], [0.017, 0.02], [0.01, -0.02], [0.012, -0.05], [0.006, -0.062], [-0.018, -0.064], [-0.02, -0.04], [-0.015, 0.0], [-0.018, 0.03]], 30), 0.03, 0, 0.007), C.dark, M.rubber);
  for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) grip.add(box(0.0012, 0.0022, 0.022, sx * 0.0152, -0.052 + k * 0.012, -0.002, 0.3, 6, 4), C.black, M.rubber);
  body.merge(grip.transform(g => g.rotateX(RAKE - 0.0).translate(0, -0.002, 0)));
  // red trigger under the receiver in front of the grip
  trig.add(slab([P(240, 172), P(256, 172), P(262, 186), P(258, 198), P(250, 192), P(242, 182)], 0.008, 0, 0.002), C.red, M.gloss);
  return rebuild(d, {
    body, ink,
    parts: { trigger: part(trig, [0, Y(174), Z(244)]) },
    gripR: rakedGrip(RAKE),
    // support hand under the receiver's front housing, below the barrel
    gripL: supportGrip([0, Y(188), Z(212)], 0),
    muzzle: [0, by, mz],
  });
}

export const MODELS = {
  shooter: { sourceModel: 'Wmn_Shooter_Normal', build: splattershot },
  's3-shooter-short': { sourceModel: 'Wmn_Shooter_Short', build: marker('short'), animate: animateMarker },
  's3-shooter-first': { sourceModel: 'Wmn_Shooter_First', build: splattershotJr, animate: animateWholeTank },
  's3-shooter-precision': { sourceModel: 'Wmn_Shooter_Precision', build: marker('precision'), animate: animateMarker },
  's3-shooter-blaze': { sourceModel: 'Wmn_Shooter_Blaze', build: aerospray },
  's3-shooter-gravity': { sourceModel: 'Wmn_Shooter_Gravity', build: gal52, animate: animateHalfPulse,
    // fired high with the stock drawn in toward the right shoulder (S3 .52 Gal firing clip: the sight
    // rides beside the head); carry is the native shooter carry
    hold: { aim: { p: [-0.05, -0.035, 0.215] } } },
  's3-shooter-quickmiddle': { sourceModel: 'Wmn_Shooter_QuickMiddle', build: nzap85 },
};
