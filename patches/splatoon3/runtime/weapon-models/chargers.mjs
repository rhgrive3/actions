// Charger family models (Splatoon 3 Ver.11.3.0 main weapons). Shapes follow the
// official per-weapon 3D renders and the turntable videos on Inkipedia (side
// frames levelled so the bore is horizontal). Internal model names come from
// Leanny/splat3 ActorInfo (Fmdb). Scale: the pistol handle below the receiver is
// ~7.5-8 cm in every reference (the same kid hand), which with the gameplay
// promo shots puts the Splat Charger at ~1.1 m against the 1.32 m kid.
import { THREE, Pieces, M, V, box, sphere, zlathe, ylathe, zcyl, ycyl, xcyl, cyl, ring, pipe, slab, smoothOutline, pistolGrip, gripSpec,
  part, rebuild, glowGeometry, sweep, GRIP_PISTOL, PISTOL_AXIS } from './kit.mjs';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Reference pixel → weapon space: (gx, gy) = handle axis point in the levelled frame, s = m/px.
const px = (gx, gy, s) => (x, y) => [(x - gx) * s, (gy - y) * s];
const outline = (P, pts) => pts.map(([x, y]) => P(x, y));
/** Weapon-space point [0, y, z] on the centre plane for reference pixel (x, y). */
const piv = (P, x, y, X = 0) => { const [z, yy] = P(x, y); return [X, yy, z]; };
// Lamp channels keep the native look (character-weapons.js buildCharger) so animateWeapon can drive them.
const LENS_LAMP = { color: '#0b0f16', emissive: '#ffffff', intensity: 0.2, roughness: 0.06 };
const EYE_LAMP = { color: '#0b0f16', emissive: '#ffffff', intensity: 0.05, roughness: 0.06 };
const PORT_LAMP = { color: '#1b1e25', emissive: '#ffffff', intensity: 0, roughness: 0.5 };

/** Muzzle heat ring (native `ports` channel lights on release) just inside the nozzle exit. */
function ports(z, y, r) {
  const p = new Pieces().add(zlathe([[r * 0.45, z - 0.004], [r, z - 0.004], [r, z], [r * 0.45, z]], 0, y, 0, 16), '#1b1e25', M.satin);
  return part(p, [0, y, z], 'lamp', PORT_LAMP);
}
/** Ribbed screw cap along Z (blue caps on the Splat Charger family tanks). */
function screwCap(p, z0, z1, y, r, color) {
  p.add(zlathe([[0, z0], [r * 0.82, z0], [r, z0 + 0.004], [r, z1 - 0.003], [r * 0.9, z1], [0, z1]], 0, y, 0, 18), color, M.gloss);
  const n = Math.max(3, Math.round((z1 - z0) / 0.008));
  for (let k = 0; k < n; k++) p.add(ring(r, 0.0016, 0, y, z0 + 0.006 + k * (z1 - z0 - 0.01) / Math.max(1, n - 1), 'z', 4, 18), color, M.gloss);
}
/** Capsule tank along Z between z0 and z1 (radius r) at height y. */
function capsule(z0, z1, r, y, seg = 24, round = 0.7) {
  const k = r * round;
  return zlathe([[0, z0], [r * 0.5, z0 + k * 0.08], [r * 0.85, z0 + k * 0.32], [r, z0 + k], [r, z1 - k], [r * 0.85, z1 - k * 0.32], [r * 0.5, z1 - k * 0.08], [0, z1]], 0, y, 0, seg);
}

// --------------------------------------------------------------------------------------- Splat Charger
const SPLAT = { purple: '#3b2ca2', yellow: '#e9b726', blue: '#2b62de', black: '#16171c', steel: '#a3a8b0', dark: '#23242b', chrome: '#c9ced6' };

/** Shared Splat Charger / Splatterscope frame (Wmn_Charger_NormalT / NormalTScope): purple stock-body with
 *  a raked pistol grip and finger grooves, yellow upper rail with castellations and a rear sight, ink tank
 *  with a blue screw cap over the rear, steel stock rod with a yellow butt plate, black barrel and the
 *  yellow muzzle block with its triangular front sight. Coordinates: levelled turntable frame
 *  (S3 Splat Charger model rotating.mp4, t = 7.3 s, rotated 6°), 1 px = 1 mm. */
function splatFrame(C, opt = {}) {
  const P = px(442, 450, 0.00105), Y = 0.058;                     // handle axis point; bore height
  const body = new Pieces(), ink = new Pieces();
  // raked pistol grip (no guard; the trigger is a separate yellow hook ahead of it) with a palm swell
  pistolGrip(body, { color: C.purple, guard: false, base: false, len: 0.05, rake: 0.12 });
  body.add(sphere(0.0125, 0.024, 0.014, 0, -0.03, -0.024), C.purple, M.rubber);
  body.add(box(0.029, 0.008, 0.032, 0, -0.054, -0.016, 0.3).rotateX(0.25), C.purple, M.satin);
  // purple stock-body (side outline)
  body.add(slab(outline(P, [[229, 394], [420, 393], [560, 392], [700, 392], [872, 393], [880, 400], [878, 422], [800, 425], [700, 428],
    [560, 430], [480, 430], [455, 428], [430, 425], [400, 423], [365, 424], [345, 446], [334, 446], [318, 424], [290, 418], [229, 408]]), 0.036, 0, 0.005), C.purple, M.satin);
  // finger grooves for the support hand under the fore-body
  for (const x of [643, 673, 704, 733]) { const [z, y] = P(x - 4, 434); body.add(box(0.03, 0.013, 0.009, 0, y, z, 0.5).rotateX(0), C.purple, M.satin); }
  for (const sx of [-1, 1]) for (const [x, y] of [[498, 410], [826, 410]]) { const [z, yy] = P(x, y); body.add(sphere(0.003, 0.003, 0.0015, sx * 0.0182, yy, z, 10, 6), C.steel, M.metal); }
  { const [z, y] = P(884, 414); body.add(zcyl(0.0075, z - 0.003, z + 0.006, -0.013, y, 10), C.dark, M.metal); }
  // stock: steel rod into the purple body, yellow butt plate with its toe
  { const [z0, y] = P(160, 401), [z1] = P(240, 0); body.add(zcyl(0.0085, z0, z1, 0, y, 14), C.black, M.metal); }
  body.add(slab(outline(P, [[96, 364], [137, 362], [140, 380], [169, 383], [170, 410], [128, 413], [127, 450], [150, 455], [151, 484], [94, 488], [92, 470]]), 0.03, 0, 0.005), C.yellow, M.satin);
  // yellow upper rail: castellated top, low middle, raised rear-sight block with a forked post
  if (!opt.scope) {
    body.add(slab(outline(P, [[558, 394], [560, 360], [570, 355], [703, 356], [712, 377], [796, 378], [801, 353], [870, 352], [872, 322], [880, 322],
      [883, 333], [886, 318], [895, 320], [893, 352], [891, 383], [884, 394]]), 0.032, 0, 0.004), C.yellow, M.satin);
    for (const x of [590, 622, 654, 686]) { const [z, y] = P(x, 352); body.add(box(0.026, 0.006, 0.015, 0, y, z, 0.3), C.yellow, M.satin); }
  } else {
    // Splatterscope: flat rear rail carrying the scope mount, low front block with small bumps, no sight post
    body.add(slab(outline(P, [[558, 394], [560, 360], [570, 356], [703, 357], [712, 377], [796, 378], [801, 362], [888, 360], [893, 366], [891, 383], [884, 394]]), 0.032, 0, 0.004), C.yellow, M.satin);
    for (const x of [818, 842, 866]) { const [z, y] = P(x, 358); body.add(box(0.024, 0.005, 0.012, 0, y, z, 0.3), C.yellow, M.satin); }
  }
  // dark mechanism window in each flank of the rail (the charge strip lights inside it)
  for (const sx of [-1, 1]) body.add(slab(outline(P, [[600, 374], [792, 381], [794, 391], [600, 391]]), 0.002, sx * 0.0163, 0.0005), C.dark, M.satin);
  // ink tank (team colour) with a chrome neck and a ribbed blue screw cap at the rear
  const [tz0, ty] = P(288, 357), [tz1] = P(551, 0), tr = 0.038;
  ink.add(capsule(tz0, tz1, tr, ty, 26, 0.55));
  body.add(zlathe([[0.012, tz1 - 0.006], [0.021, tz1 - 0.004], [0.022, tz1 + 0.01], [0.016, tz1 + 0.014], [0.008, tz1 + 0.014]], 0, ty - 0.004, 0, 16), C.chrome, M.metal);
  screwCap(body, P(233, 0)[0], tz0 + 0.004, ty + 0.002, 0.023, C.blue);
  // barrel and the yellow muzzle block (collar, body, tapered tip, blue nozzle)
  const [bz0] = P(878, 0), [bz1] = P(1044, 0), [mz1] = P(1106, 0), [nz] = P(1131, 0);
  body.add(zcyl(0.0098, bz0, bz1 + 0.004, 0, Y, 16), C.black, M.metal);
  body.add(zcyl(0.019, bz1 - 0.012, bz1 + 0.002, 0, Y, 18), C.dark, M.satin);
  body.add(zlathe([[0.016, bz1], [0.0225, bz1 + 0.004], [0.0225, mz1], [0.018, mz1 + 0.004], [0.0145, mz1 + 0.008], [0.0135, nz - 0.006], [0.011, nz - 0.001], [0, nz]], 0, Y, 0, 22), C.yellow, M.satin);
  body.add(zlathe([[0, nz - 0.003], [0.0085, nz - 0.003], [0.0075, nz + 0.0015], [0, nz + 0.0015]], 0, Y, 0, 14), C.blue, M.gloss);
  body.add(slab(outline(P, [[1050, 378], [1092, 339], [1103, 339], [1104, 378]]), 0.009, 0, 0.002, [outline(P, [[1070, 372], [1092, 352], [1095, 372]])]), C.yellow, M.satin);
  // trigger: yellow hook ahead of the grip
  const trig = new Pieces().add(slab(outline(P, [[466, 428], [480, 428], [488, 466], [483, 468], [472, 446]]), 0.007, 0, 0.002), C.yellow, M.satin);
  // charge strip (coil channel): inside the rail windows, lights rear → front
  const g = new Pieces();
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) { const [z, y] = P(614 + k * 31, 384); g.add(box(0.0016, 0.008, 0.026, sx * 0.0175, y, z, 0.3), '#ffffff', M.led); }
  return { P, Y, body, ink, trig, nz, glow: glowGeometry(g, P(600, 0)[0], P(792, 0)[0]), tz0, ty, tr };
}

function splatCharger(d) {
  const f = splatFrame(SPLAT);
  return rebuild(d, {
    body: f.body, ink: f.ink, glow: f.glow,
    parts: { trigger: part(f.trig, piv(f.P, 470, 430)), ports: ports(f.nz - 0.002, f.Y, 0.009) },
    // support hand wraps the body from below just ahead of the trigger (S3 Splat Charger promo image)
    gripL: gripSpec([0, 0.007, 0.105], [0, 0, 1], [0.75, -0.62, -0.1]),
    muzzle: [0, f.Y, f.nz + 0.002],
  });
}

/** Splatterscope (Wmn_Charger_NormalTScope): the Splat Charger frame with a black 4-power scope on a
 *  two-ring mount over the rear rail; white rims on both bells, elevation/windage turrets. Scope position
 *  from the levelled Z+F Splatterscope turntable frame (t = 19.3 s, rotated 6.7°), mapped onto the Splat
 *  Charger frame via the tank and bore (scale 1.07). */
function splatterscope(d) {
  const f = splatFrame(SPLAT, { scope: true }), P = f.P, C = { black: '#1d1e23', rim: '#e9e9e6', mount: '#25262b', metal: '#8d929a' };
  const [, sy] = P(0, 311), [e0] = P(550, 0), [e1] = P(592, 0), [t0] = P(604, 0), [t1] = P(735, 0), [o0] = P(775, 0), [o1] = P(815, 0);
  f.body.add(zlathe([[0.022, e0 + 0.004], [0.027, e0 + 0.006], [0.028, e1 - 0.012], [0.024, e1], [0.016, t0], [0.016, t1], [0.019, t1 + 0.012],
    [0.031, o0], [0.034, o0 + 0.008], [0.034, o1 - 0.004], [0.031, o1 - 0.001], [0.026, o1 - 0.001]], 0, sy, 0, 24), C.black, M.satin);
  f.body.add(ring(0.0255, 0.0032, 0, sy, e0 + 0.006, 'z', 5, 24), C.rim, M.gloss);
  f.body.add(ring(0.0305, 0.0038, 0, sy, o1 - 0.002, 'z', 5, 24), C.rim, M.gloss);
  f.body.add(ring(0.017, 0.0022, 0, sy, t1 + 0.004, 'z', 4, 20), C.rim, M.gloss);
  // two-ring mount on a block over the rear rail, turrets on top and on the right flank
  const [m0] = P(600, 0), [m1] = P(690, 0), [, ry] = P(0, 357);
  f.body.add(box(0.026, sy - ry - 0.01, m1 - m0, 0, (sy + ry) / 2 - 0.008, (m0 + m1) / 2, 0.25), C.mount, M.satin);
  for (const z of [m0 + 0.012, m1 - 0.012]) f.body.add(ring(0.0185, 0.004, 0, sy, z, 'z', 5, 20), C.mount, M.satin);
  const [tz] = P(646, 0);
  f.body.add(zcyl(0.0085, 0, 0.016, 0, 0, 14).rotateX(-Math.PI / 2).translate(0, sy + 0.012, tz), C.black, M.satin);
  f.body.add(zcyl(0.0085, 0, 0.016, 0, 0, 14).rotateY(-Math.PI / 2).translate(-0.012, sy, tz), C.black, M.satin);
  const lens = new Pieces().add(zlathe([[0, o1 - 0.003], [0.026, o1 - 0.003], [0.026, o1 - 0.001], [0, o1]], 0, sy, 0, 20), '#0b0f16', M.lens);
  const eye = new Pieces().add(zlathe([[0, e0 + 0.004], [0.021, e0 + 0.004], [0.021, e0 + 0.006], [0, e0 + 0.007]], 0, sy, 0, 18), '#0b0f16', M.lens);
  return rebuild(d, {
    body: f.body, ink: f.ink, glow: f.glow,
    parts: { trigger: part(f.trig, piv(P, 470, 430)), ports: ports(f.nz - 0.002, f.Y, 0.009),
      lens: part(lens, [0, sy, o1 - 0.002], 'lamp', LENS_LAMP), eyepiece: part(eye, [0, sy, e0 + 0.005], 'lamp', EYE_LAMP) },
    gripL: gripSpec([0, 0.007, 0.105], [0, 0, 1], [0.75, -0.62, -0.1]),
    muzzle: [0, f.Y, f.nz + 0.002],
  });
}

// --------------------------------------------------------------------------------------- E-liter 4K
const ELITER = { chrome: '#c3c8ce', blue: '#1d58d6', black: '#1f2024', steel: '#3a3d43', dark: '#141518', brass: '#9c8a62' };
/** Pistol handle raked like the E-liter's nozzle handle (θ from vertical, top forward). */
const rakedGrip = (theta, pos = [0, 0, 0]) => gripSpec(pos, [0, Math.cos(theta), Math.sin(theta)], [0, Math.sin(theta), -Math.cos(theta)]);
const ELITER_RAKE = 0.6;

/** E-liter 4K (Wmn_Charger_Long) / 4K Scope (Wmn_Charger_LongScope): chrome tank as the shoulder stock, blue
 *  elbow block, black raked nozzle handle with a lever trigger and a bent-rod guard, hose coil (ink) from
 *  the tank to the handle foot, curved feed pipe wrapped in an ink spring behind a black washer, long
 *  steel rod barrel with the blue fore-clamp and the black front-sight leg. Levelled turntable frame
 *  (S3 E-liter 4K model rotating.mp4, t = 7.9 s, rotated 9.3° so the rod is level); 1.30 m overall (the
 *  Inkling E-liter Scope render shows it longer than the kid is tall). */
function eliterFrame(C) {
  const s = 0.00129, P = px(490, 420, s), Y = (420 - 342) * s;
  const body = new Pieces(), ink = new Pieces();
  // chrome tank with two bolts on top, a dark keel plate and the hose block underneath
  const [tz0, ty] = P(117, 312), [tz1] = P(545, 0), tr = 48 * s;
  body.add(zlathe([[0, tz0], [tr * 0.82, tz0], [tr * 0.97, tz0 + 0.008], [tr, tz0 + 0.02], [tr, tz1 - 0.022], [tr * 0.9, tz1 - 0.006], [tr * 0.55, tz1], [0, tz1]], 0, ty, 0, 28), C.chrome, M.gloss);
  body.add(zlathe([[0, tz1 - 0.001], [tr * 0.45, tz1 - 0.001], [tr * 0.4, tz1 + 0.004], [0, tz1 + 0.004]], 0, ty, 0, 18), C.dark, M.gloss);
  for (const x of [190, 452]) { const [z] = P(x, 0); body.add(ycyl(0.013, ty + tr - 0.004, ty + tr + 0.009, 0, z, 14), C.brass, M.metal); }
  for (const sx of [-1, 1]) body.add(slab(outline(P, [[132, 336], [520, 336], [520, 342], [132, 342]]), 0.003, sx * (tr * 0.93), 0.001), C.dark, M.satin);
  body.add(box(0.07, 0.015, (462 - 129) * s, 0, P(0, 360)[1], P(296, 0)[0], 0.2), C.black, M.satin);
  body.add(box(0.05, 0.022, (315 - 140) * s, 0, P(0, 393)[1], P(228, 0)[0], 0.25), C.black, M.satin);
  // hose (ink): down from the block, one loop, into the foot of the handle
  const H = (x, y, X = 0) => { const [z, yy] = P(x, y); return [X, yy, z]; };
  ink.add(pipe([H(268, 402), H(268, 440), H(285, 474), H(320, 488), H(360, 486), H(392, 462), H(390, 428), H(356, 410), H(322, 420), H(316, 456), H(340, 482, -0.01),
    H(390, 486, -0.012), H(430, 478, -0.006)], 0.0085, 64, 8));
  // blue elbow block: from the tank front down to the handle top, front collar around the feed pipe
  body.add(slab(outline(P, [[526, 300], [566, 304], [598, 326], [612, 330], [612, 372], [662, 395], [652, 418], [600, 422], [552, 398], [526, 372]]), 0.05, 0, 0.008), C.blue, M.satin);
  const [fz0, fy] = P(598, 350), [fz1] = P(672, 0);
  body.add(zlathe([[0, fz0], [0.02, fz0], [0.0205, fz0 + 0.006], [0.0205, fz1 - 0.006], [0.017, fz1], [0, fz1]], 0, fy, 0, 18), C.blue, M.satin);
  body.add(zcyl(0.013, fz1, fz1 + 0.012, 0, fy, 14), C.steel, M.metal);
  // raked black nozzle handle with the hose collar at its foot
  const [hz0, hy0] = P(522, 380), [hz1, hy1] = P(452, 476);
  body.add(cyl(0.0155, [0, hy0, hz0], [0, hy1, hz1], 16), C.black, M.rubber);
  body.add(cyl(0.019, [0, hy1 + 0.004, hz1 + 0.003], [0, hy1 - 0.014, hz1 - 0.01], 14), C.black, M.satin);
  // bent-rod guard below the handle
  body.add(pipe([H(606, 412), H(560, 466), H(530, 497), H(512, 498), H(462, 476)], 0.0042, 28, 6), C.dark, M.metal);
  const trig = new Pieces().add(pipe([H(548, 392), H(532, 420), H(528, 452)], 0.0032, 10, 6), C.dark, M.metal);
  // feed pipe (dark core is the charge coil) wrapped in the ink spring, black washer in front of the elbow
  const [pz0, py] = P(684, 344), [pz1] = P(802, 0);
  body.add(zcyl(0.0075, fz1, pz1, 0, py, 12), C.steel, M.metal);
  const spring = []; for (let k = 0; k <= 96; k++) { const u = k / 96, a = u * Math.PI * 2 * 8; spring.push([Math.sin(a) * 0.017, py + Math.cos(a) * 0.017, pz0 + u * (pz1 - pz0 - 0.03)]); }
  ink.add(pipe(spring, 0.0028, 160, 6));
  const [wz, wy] = P(676, 354);
  body.add(zcyl(0.04, wz - 0.002, wz + 0.002, 0, wy, 26), C.black, M.satin);
  body.add(zcyl(0.017, pz1 - 0.012, pz1 + 0.012, 0, Y, 14), C.steel, M.metal);
  // rod barrel, blue fore-clamp with its black block and rounded paddle, black front-sight leg
  const [nz] = P(1127, 0);
  body.add(zcyl(0.0085, pz1, nz, 0, Y, 14), C.steel, M.metal);
  body.add(zlathe([[0.0085, nz - 0.002], [0.0092, nz - 0.001], [0.0045, nz], [0, nz]], 0, Y, 0, 14), C.dark, M.metal);
  body.add(slab(outline(P, [[823, 330], [915, 328], [920, 336], [918, 362], [823, 362]]), 0.048, 0, 0.007), C.blue, M.satin);
  body.add(slab(outline(P, [[838, 356], [910, 356], [910, 402], [838, 402]]), 0.042, 0, 0.005), C.black, M.satin);
  for (const sx of [-1, 1]) { const [z, y] = P(876, 376); body.add(xcyl(0.01, sx * 0.021, sx * 0.024, y, z, 14), C.dark, M.satin); }
  body.add(slab(outline(P, smoothOutline([[770, 382], [800, 378], [832, 380], [834, 412], [800, 416], [772, 414], [764, 398]], 24)), 0.05, 0, 0.008), C.blue, M.satin);
  body.add(slab(outline(P, [[1000, 286], [1008, 286], [1009, 296], [1014, 296], [1015, 286], [1023, 286], [1023, 386], [1066, 440], [1062, 452], [1044, 450], [1001, 396]]), 0.018, 0, 0.003), C.black, M.satin);
  // charge coil: rings on the feed pipe between the spring turns, rear → front
  const g = new Pieces();
  for (let k = 0; k < 8; k++) g.add(ring(0.0085, 0.0022, 0, py, pz0 + 0.004 + k * (pz1 - pz0 - 0.034) / 7, 'z', 4, 16), '#ffffff', M.led);
  return { P, Y, s, body, ink, trig, nz, glow: glowGeometry(g, pz0, pz1 - 0.03), fy, fz0, fz1, py, H };
}
function eliterParts(f, extra = {}) {
  return {
    body: f.body, ink: f.ink, glow: f.glow,
    parts: { trigger: part(f.trig, f.H(548, 392)), ports: ports(f.nz - 0.001, f.Y, 0.0075), ...extra },
    gripR: rakedGrip(ELITER_RAKE),
    // support hand closes round the blue front collar of the elbow (S3 Inkling E-liter Scope render)
    gripL: gripSpec([0, f.fy - 0.002, (f.fz0 + f.fz1) / 2 + 0.006], [0, 0, 1], [0.75, -0.62, -0.1]),
    muzzle: [0, f.Y, f.nz + 0.002],
  };
}
function eliter(d) { return rebuild(d, eliterParts(eliterFrame(ELITER))); }
/** 4K Scope: long black scope over the elbow and feed pipe, bulbous eyepiece over the elbow, objective
 *  just short of the front sight, rear mount on the elbow and a front post onto the pipe collar. */
function eliterScope(d) {
  const f = eliterFrame(ELITER), P = f.P, b = f.body, C = { black: '#1b1c20', mount: '#25262b', lens: '#0b0f16' };
  const [, sy] = P(0, 290), [e0] = P(580, 0), [e1] = P(640, 0), [t1] = P(900, 0), [o1] = P(970, 0);
  b.add(zlathe([[0.022, e0], [0.032, e0 + 0.006], [0.034, e0 + 0.03], [0.03, e1 - 0.01], [0.018, e1], [0.015, e1 + 0.02], [0.0145, t1 - 0.03],
    [0.024, t1], [0.031, t1 + 0.02], [0.031, o1 - 0.004], [0.028, o1]], 0, sy, 0, 24), C.black, M.satin);
  const [rz] = P(632, 0), [, ey] = P(0, 312), [mz] = P(808, 0);
  b.add(box(0.022, sy - ey, 0.028, 0, (sy + ey) / 2 - 0.006, rz, 0.3), C.mount, M.satin);
  b.add(box(0.012, sy - f.Y - 0.01, 0.014, 0, (sy + f.Y) / 2, mz, 0.3), C.mount, M.satin);
  for (const z of [rz, mz]) b.add(ring(0.017, 0.0035, 0, sy, z, 'z', 4, 18), C.mount, M.satin);
  const [tz] = P(690, 0);
  b.add(ycyl(0.009, sy + 0.012, sy + 0.026, 0, tz, 14), C.black, M.satin);
  b.add(xcyl(0.009, -0.012, -0.026, sy, tz, 14), C.black, M.satin);
  const lens = new Pieces().add(zlathe([[0, o1 - 0.002], [0.025, o1 - 0.002], [0.025, o1], [0, o1 + 0.001]], 0, sy, 0, 20), C.lens, M.lens);
  const eye = new Pieces().add(zlathe([[0, e0 + 0.003], [0.02, e0 + 0.003], [0.02, e0 + 0.001], [0, e0]], 0, sy, 0, 18), C.lens, M.lens);
  return rebuild(d, eliterParts(f, { lens: part(lens, [0, sy, o1 - 0.001], 'lamp', LENS_LAMP), eyepiece: part(eye, [0, sy, e0 + 0.002], 'lamp', EYE_LAMP) }));
}

// --------------------------------------------------------------------------------------- Classic Squiffer
const SQUIFF = { blue: '#5aa5da', white: '#e4eaee', grey: '#8f949c', brown: '#7b4a2b', label: '#e9b51f', labelBlue: '#2b49c8', dark: '#1d1f24' };
/** Classic Squiffer (Wmn_Charger_Quick): a squeeze-bottle tank (ink) angled down into a ribbed spout, glossy
 *  light-blue receiver with a keel fin, white pistol grip / trigger, an open blue bar frame (rear hook,
 *  upper bar with a hump, return bar and a lower bar dipping under the barrel) round a straight ink rod
 *  held by two white clips and a leather strap, white muzzle block. Levelled turntable frame (S3 Classic
 *  Squiffer model rotating.mp4, t = 8.2 s, rotated 4.7° so the rod is level), same 1.05 mm/px as the
 *  Splat Charger frame (0.98 m overall). */
function squiffer(d) {
  const C = SQUIFF, s = 0.00105, P = px(486, 446, s), Y = (446 - 398) * s, H = (x, y, X = 0) => piv(P, x, y, X);
  const body = new Pieces(), ink = new Pieces();
  pistolGrip(body, { color: C.white, guard: false, base: false, len: 0.036, mat: M.gloss });
  // bottle (ink) on an axis pitched 23° down toward the spout, grey ribbed base, printed label
  const [b0z, b0y] = P(214, 316), pitch = Math.atan2(79, 186), L = 0.148, bottle = new Pieces();
  bottle.add(zlathe([[0, 0.004], [0.04, 0.004], [0.045, 0.014], [0.045, L - 0.02], [0.04, L], [0.028, L + 0.024], [0.017, L + 0.04], [0, L + 0.04]], 0, 0, 0, 24), '#ffffff', M.gloss);
  const base = new Pieces().add(zlathe([[0, -0.002], [0.036, -0.002], [0.043, 0.004], [0.045, 0.012], [0.04, 0.012], [0, 0.008]], 0, 0, 0, 24), C.grey, M.satin);
  for (let k = 0; k < 3; k++) base.add(ring(0.0452, 0.0016, 0, 0, 0.016 + k * 0.009, 'z', 4, 24), C.grey, M.satin);
  base.add(box(0.002, 0.052, 0.07, -0.0455, 0, 0.07, 0.15), C.label, M.print);
  base.add(box(0.0022, 0.02, 0.026, -0.046, 0.006, 0.072, 0.2), C.labelBlue, M.print);
  const place = g => g.rotateX(pitch).translate(0, b0y, b0z);
  ink.merge(bottle.transform(place)); body.merge(base.transform(place));
  // ribbed grey spout and white collar into the receiver
  body.add(cyl(0.014, H(350, 372), H(412, 400), 14), C.grey, M.metal);
  for (let k = 0; k < 4; k++) { const u = 0.15 + k * 0.2, a = H(350 + 62 * u, 372 + 28 * u); body.add(cyl(0.0165, a, H(352 + 62 * u, 373 + 28 * u), 14), C.grey, M.metal); }
  body.add(cyl(0.018, H(400, 395), H(416, 402), 16), C.white, M.gloss);
  // light-blue receiver with the keel fin, rear hook and the open bar frame
  body.add(slab(outline(P, [[410, 380], [470, 374], [560, 372], [600, 375], [620, 384], [626, 398], [700, 408], [762, 419], [770, 428], [700, 432],
    [668, 436], [632, 452], [616, 459], [600, 442], [560, 433], [470, 433], [430, 428], [410, 410]]), 0.036, 0, 0.006), C.blue, M.gloss);
  const bar = (pts) => body.add(pipe(pts.map(([x, y]) => H(x, y)), 0.0048, 60, 6).scale(1.5, 1, 1), C.blue, M.gloss);
  bar([[543, 344], [550, 358], [566, 367], [700, 369], [900, 368], [938, 362], [958, 351], [980, 359], [1047, 366], [1120, 371]]);
  bar([[1120, 371], [1104, 381], [1068, 387], [1036, 395], [1000, 406], [966, 413], [935, 422], [900, 433], [868, 446], [845, 455], [818, 451], [790, 437], [762, 424]]);
  // ink rod barrel, white clips, leather strap, white muzzle block
  const [rz0] = P(416, 0), [rz1] = P(1090, 0), [nz] = P(1129, 0);
  ink.add(zcyl(0.0068, rz0, rz1, 0, Y, 14));
  for (const x of [690, 868]) {
    const [z] = P(x, 0);
    body.add(box(0.012, (398 - 368) * s + 0.01, 0.016, 0, Y + (398 - 368) * s / 2, z, 0.3), C.white, M.gloss);
    body.add(zcyl(0.011, z - 0.009, z + 0.009, 0, Y, 16), C.white, M.gloss);
  }
  { const [z] = P(731, 0); body.add(zcyl(0.0105, z - 0.008, z + 0.008, 0, Y, 16), C.brown, M.satin); body.add(box(0.006, 0.026, 0.016, -0.009, Y - 0.012, z, 0.3), C.brown, M.satin); }
  body.add(slab(outline(P, [[1088, 386], [1122, 386], [1129, 392], [1129, 420], [1122, 424], [1088, 424]]), 0.03, 0, 0.005), C.white, M.gloss);
  body.add(zlathe([[0, nz - 0.002], [0.0065, nz - 0.002], [0.0065, nz + 0.0008], [0, nz + 0.0008]], 0, Y, 0, 14), C.dark, M.satin);
  const trig = new Pieces().add(slab(outline(P, [[523, 430], [538, 430], [541, 458], [533, 462], [526, 446]]), 0.007, 0, 0.002), C.white, M.gloss);
  // charge coil: slim bands round the rod between the receiver and the muzzle block
  const g = new Pieces();
  for (let k = 0; k < 8; k++) { const [z] = P(640 + k * 55, 0); g.add(zcyl(0.0074, z - 0.007, z + 0.007, 0, Y, 12), '#ffffff', M.led); }
  return rebuild(d, {
    body, ink, glow: glowGeometry(g, P(630, 0)[0], P(1035, 0)[0]),
    parts: { trigger: part(trig, H(523, 430)), ports: ports(nz - 0.001, Y, 0.0065) },
    gripL: gripSpec(H(640, 424), [0, 0, 1], [0.75, -0.62, -0.1]),
    muzzle: [0, Y, nz + 0.002],
  });
}

// --------------------------------------------------------------------------------------- Bamboozler 14 Mk I
const BAMBOO = { green: '#5fa83a', node: '#d9d6a8', black: '#222327', steel: '#8a8f97', pink: '#ec2a9a', cream: '#e9dcc0' };
/** Bamboozler 14 Mk I (Wmn_Charger_Light): a bamboo culm gun. The upright bamboo segment at the back is the
 *  hand grip (the right fist closes round it, S2 Bamboozler 14 Mk I promo 2); the horizontal culm has a
 *  plain rear internode, a swollen middle internode and a straight front internode with two black clamp
 *  bands carrying an A-frame front sight; black aperture rear sight with a knurled side knob; open bore
 *  and a pink flip cap hinged under the muzzle. Turntable frame S3 Bamboozler 14 Mk II model rotating.mp4
 *  (t = 8.0 s, already level; Mk II is the same shape). Scale: the grip culm is taken as Ø ≈ 5 cm (the
 *  fist in the promo is ~1.4 culm diameters tall), 0.49 m overall. */
function bamboozler(d) {
  const C = BAMBOO, s = 0.00075, P = px(361, 380, s), Y = (380 - 339) * s, H = (x, y, X = 0) => piv(P, x, y, X);
  const body = new Pieces(), ink = new Pieces(), R = r => r * s;
  // upright grip culm with flared nodes at both ends and a cut top
  const [, yt] = P(0, 216), [, yb] = P(0, 432);
  body.add(ylathe([[0, yb], [R(33), yb], [R(35), yb + R(6)], [R(29), yb + R(14)], [R(26), yb + R(40)], [R(25.5), yt - R(60)], [R(27), yt - R(16)], [R(34), yt - R(6)], [R(35), yt], [R(27), yt], [R(26), yt - R(4)], [0, yt - R(4)]], 0, 0, 0, 22), C.green, M.satin);
  for (const y of [yb + R(7), yt - R(6)]) body.add(ring(R(34.5), 0.0016, 0, y, 0, 'y', 4, 24), C.node, M.satin);
  // horizontal culm: rear internode, node, swollen internode, node, front internode, lip
  const Z = x => P(x, 0)[0];
  body.add(zlathe([[R(18), Z(370)], [R(18), Z(424)], [R(28), Z(430)], [R(28), Z(440)], [R(26.5), Z(448)], [R(27), Z(574)], [R(31), Z(582)], [R(31), Z(592)], [R(26), Z(604)], [R(25), Z(630)], [R(30), Z(680)], [R(32.5), Z(730)],
    [R(31), Z(774)], [R(29), Z(786)], [R(32), Z(792)], [R(32), Z(800)], [R(29), Z(808)], [R(29), Z(904)], [R(31), Z(908)], [R(31), Z(912)], [R(23), Z(912)], [R(23), Z(904)], [0, Z(904)]], 0, Y, 0, 22), C.green, M.satin);
  for (const x of [435, 587, 796, 910]) body.add(ring(R(31.2), 0.0014, 0, Y, Z(x), 'z', 4, 24), C.node, M.satin);
  ink.add(zlathe([[0, Z(904) + 0.0005], [R(22.5), Z(904) + 0.0005], [R(22.5), Z(905)], [0, Z(905)]], 0, Y, 0, 20));
  // rear sight: black block, aperture post, knurled knob on the right flank
  body.add(slab(outline(P, [[450, 312], [452, 280], [500, 276], [529, 278], [529, 312]]), 0.026, 0, 0.003), C.black, M.satin);
  body.add(slab(outline(P, [[465, 280], [465, 232], [471, 226], [477, 226], [481, 232], [481, 280]]), 0.012, 0, 0.002, [outline(P, [[469, 244], [469, 236], [477, 236], [477, 244]])]), C.black, M.satin);
  { const [z, y] = P(505, 296); body.add(xcyl(R(19), -0.013, -0.024, y, z, 18), C.black, M.satin); body.add(xcyl(R(7), -0.0235, -0.025, y, z, 12), C.steel, M.metal); for (let k = 0; k < 3; k++) body.add(ring(R(19), 0.0012, -0.015 - k * 0.003, y, z, 'x', 3, 16), C.black, M.metal); }
  // front clamp bands with hanging tabs, A-frame front sight between them
  for (const [x0, x1] of [[790, 812], [836, 858]]) {
    body.add(zcyl(R(33.5), Z(x0), Z(x1), 0, Y, 22), C.black, M.satin);
    const [z, y] = P((x0 + x1) / 2, 384); body.add(box(0.008, R(18), Z(x1) - Z(x0), 0, y, z, 0.3), C.black, M.satin);
  }
  body.add(slab(outline(P, [[788, 316], [832, 254], [858, 250], [862, 254], [862, 316], [848, 316], [848, 266], [838, 266], [803, 316]]), 0.012, 0, 0.002), C.black, M.satin);
  // pink flip cap hanging from a hinge under the muzzle
  const cap = new Pieces();
  cap.add(ring(R(26), R(6), 0, 0, 0, 'z', 6, 22), C.pink, M.gloss).add(zcyl(R(21), -0.002, 0.002, 0, 0, 18), C.black, M.lens);
  body.merge(cap.transform(g => g.rotateX(-1.05).translate(0, P(0, 406)[1], Z(930))));
  body.add(box(0.012, R(14), R(16), 0, P(0, 382)[1], Z(906), 0.3), C.steel, M.metal);
  // charge coil: rings just inside the open bore, lit from the back of the bore to the lip
  const g = new Pieces();
  for (let k = 0; k < 5; k++) g.add(ring(R(21), 0.0012, 0, Y, Z(880) + k * R(6), 'z', 3, 20), '#ffffff', M.led);
  const trig = new Pieces().add(box(0.004, R(16), R(10), 0, P(0, 372)[1], Z(395), 0.3), C.black, M.satin);
  return rebuild(d, {
    body, ink, glow: glowGeometry(g, Z(878), Z(905)),
    parts: { trigger: part(trig, H(395, 366)), ports: ports(Z(905), Y, R(18)) },
    gripR: gripSpec([0, 0, 0], [0, 1, 0], [0, 0, -1]),
    // support hand under the rear internode, ahead of the rear sight (S2 Bamboozler 14 Mk I promo 1)
    gripL: gripSpec(H(545, 368), [0, 0, 1], [0.75, -0.62, -0.1]),
    muzzle: [0, Y, Z(912) + 0.002],
  });
}

// --------------------------------------------------------------------------------------- Goo Tuber
const GOO = { red: '#d4301c', orange: '#dc5e1d', black: '#1f1f22', dark: '#34353a', white: '#ecebe8', tube: '#c9c4bf', steel: '#9a9794', hose: 0xd3cfcb };
// Bore height above the paddle grip and the hose coil (helix about X hung on the feed tube) in weapon metres.
const GOO_Y = 0.075, GOO_COIL = { z: 0.4, y: GOO_Y - 0.107, r: 0.135, turns: 2.25, x0: -0.034, x1: 0.034, tube: 0.0158 };
/** Sweep along points whose per-vertex path parameter becomes the coil threshold aSeg ∈ [a, b]. */
function gooGlow(points, radius, a, b, seg) {
  const s = sweep(points.map(p => V(...p)), { seg, radial: 9, capSteps: 2, radius });
  const g = new Pieces().add(s.geo, '#ffffff', M.satin).build(), t = s.t, out = new Float32Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = a + (b - a) * t[i];
  g.setAttribute('aSeg', new THREE.Float32BufferAttribute(out, 1)); return g;
}
/** Goo Tuber (Wmn_Charger_Keeper): ribbed red squeeze bulb with a white tail pipe at the back, an orange
 *  paddle grip (white label, lanyard) hanging under the bulb neck with a black lever trigger ahead of it,
 *  a straight corrugated white feed tube with a black finned clip, a long black nozzle with a finned
 *  bracket, and a long white hose: from under the rear bracket it drops, runs forward and is coiled
 *  (≈2¼ turns about the holder's left–right axis) and hung over the front of the feed tube, its end
 *  plugged into the nozzle bracket. Sources: official 3D render (refs/s3-charger-keeper.3d.png), the
 *  turntable "S3 Custom Goo Tuber model rotating.mp4" (side t = 0 / 6 s, front t = 3 s) and the charge
 *  capture "S3 Goo Tuber charge 10.0.0.mp4" (side view, kid charging): the hose and feed tube are pale
 *  grey when empty and fill with team-coloured ink as the charge builds, so they are the charge coil
 *  channel (aSeg runs from the hose start under the grip, round the coil, then the feed tube to the
 *  nozzle). Scale from that capture: bulb tail → nozzle tip ≈ 740 px against an Inkling hand ≈ 90 px
 *  (≈ 0.1 m) and head ≈ 240 px → ≈ 0.86 m overall (image-derived, not measured in game). */
function gooTuber(d) {
  const C = GOO, Y = GOO_Y, K = GOO_COIL, body = new Pieces();
  // bulb: four ribs, white tail pipe and neck collar into the feed tube
  const b0 = -0.208, b1 = -0.03, prof = [[0, b0], [0.016, b0 + 0.002]];
  for (let k = 0; k <= 24; k++) {
    const u = k / 24, env = Math.sin(Math.PI * (0.04 + 0.92 * u)) ** 0.28, rib = 1 - 0.08 * (0.5 - 0.5 * Math.cos(u * Math.PI * 2 * 4.5));
    prof.push([0.057 * env * rib, b0 + 0.004 + u * (b1 - b0 - 0.012)]);
  }
  prof.push([0.017, b1 - 0.004], [0.015, b1], [0, b1]);
  body.add(zlathe(prof, 0, Y, 0, 28), C.red, M.gloss);
  body.add(zlathe([[0, -0.247], [0.0105, -0.247], [0.0125, -0.243], [0.0125, b0 + 0.006], [0, b0 + 0.006]], 0, Y, 0, 14), C.white, M.gloss);
  body.add(zlathe([[0, b1 - 0.006], [0.0175, b1 - 0.006], [0.0175, 0.012], [0.0155, 0.02], [0, 0.02]], 0, Y, 0, 16), C.white, M.gloss);
  // corrugated feed tube to the nozzle (base colour; its ink fill is the coil channel below)
  const t0 = 0.018, t1 = 0.402;
  body.add(zcyl(0.0118, t0, t1, 0, Y, 14), C.tube, M.satin);
  for (let k = 0; k < 7; k++) body.add(ring(0.0128, 0.0018, 0, Y, t0 + 0.012 + k * 0.011, 'z', 4, 14), C.tube, M.satin);
  // rear bracket (black plate under the neck) and the finned mid clip
  body.add(box(0.03, 0.03, 0.012, 0, Y - 0.012, 0.034, 0.3), C.black, M.satin);
  body.add(zcyl(0.0152, 0.028, 0.04, 0, Y, 16), C.black, M.satin);
  body.add(zcyl(0.015, 0.092, 0.106, 0, Y, 16), C.black, M.satin);
  body.add(slab([[0.094, Y - 0.01], [0.106, Y - 0.01], [0.112, Y - 0.06], [0.098, Y - 0.1], [0.084, Y - 0.108], [0.094, Y - 0.06]], 0.006, 0, 0.0015), C.black, M.satin);
  body.add(pipe([[0, Y + 0.012, 0.1], [0, Y + 0.03, 0.118], [0, Y + 0.036, 0.15]], 0.0028, 10, 5), C.black, M.satin);
  // nozzle: long black barrel, grey front ring and tip, finned bracket with a top sight and side fins
  const n0 = 0.398, n1 = 0.572;
  body.add(zlathe([[0, n0], [0.022, n0], [0.025, n0 + 0.008], [0.025, n1 - 0.03], [0.023, n1 - 0.024], [0.023, n1 - 0.006], [0.017, n1], [0.01, n1], [0.01, n1 - 0.004], [0, n1 - 0.004]], 0, Y, 0, 22), C.black, M.satin);
  for (const z of [n0 + 0.03, n1 - 0.03]) body.add(ring(0.0255, 0.0018, 0, Y, z, 'z', 4, 22), C.dark, M.metal);
  const nb = 0.44;
  body.add(box(0.07, 0.074, 0.016, 0, Y + 0.004, nb, 0.25), C.black, M.satin);
  body.add(slab([[nb - 0.012, Y + 0.035], [nb + 0.008, Y + 0.035], [nb + 0.03, Y + 0.075], [nb + 0.018, Y + 0.078]], 0.006, 0, 0.0015), C.black, M.satin);
  for (const sx of [-1, 1]) body.add(slab([[nb - 0.01, Y + 0.02], [nb + 0.01, Y + 0.02], [nb + 0.05, Y + 0.044], [nb + 0.04, Y + 0.05]], 0.005, sx * 0.03, 0.0015), C.black, M.satin);
  body.add(pipe([[0, Y - 0.03, nb], [0, Y - 0.07, nb + 0.004], [0, Y - 0.088, nb + 0.012]], 0.0034, 12, 5), C.black, M.satin);   // hose hook
  // orange paddle grip along the raked native grip axis, white label, lanyard loop at its foot
  const ax = PISTOL_AXIS.toArray(), tip = (s, f = 0) => [0, ax[1] * s, ax[2] * s + f];
  const paddle = box(0.021, 0.124, 0.046, 0, 0, 0, 0.22).rotateX(Math.atan2(ax[2], ax[1])).translate(0, -0.004, -0.004);
  body.add(paddle, C.orange, M.satin);
  body.add(box(0.0006, 0.06, 0.03, 0, 0, 0, 0.1).rotateX(Math.atan2(ax[2], ax[1])).translate(-0.0108, -0.01, -0.006), C.white, M.print);
  body.add(pipe([tip(-0.06, -0.01), [0.002, -0.085, -0.03], [0.004, -0.098, -0.012], [0.002, -0.082, -0.0]], 0.0012, 14, 4), C.white, M.satin);
  const trig = new Pieces().add(pipe([[0, 0.05, 0.03], [0, 0.03, 0.036], [0, 0.0, 0.032]], 0.0035, 10, 6), C.black, M.satin);
  // hose: from under the rear bracket down, forward along the bottom, the coil hung on the feed tube,
  // then up into the hook under the nozzle bracket
  const lead = [[0, Y - 0.012, 0.118], [0, Y - 0.06, 0.12], [0.004, -0.06, 0.13], [0.01, -0.12, 0.17], [K.x0, -0.15, 0.27]];
  const coil = [], steps = 64, a0 = -Math.PI / 4;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, a = a0 + u * K.turns * Math.PI * 2;
    coil.push([K.x0 + (K.x1 - K.x0) * u, K.y - Math.cos(a) * K.r, K.z + Math.sin(a) * K.r]);
  }
  const tail = [[K.x1 + 0.004, -0.085, nb + 0.06], [0.006, Y - 0.092, nb + 0.014]];
  const hosePts = [...lead, ...coil, ...tail];
  const corrugate = t => K.tube * (t < 0.12 ? 1 + 0.09 * Math.sin(t * 900) : 1);
  const glow = mergeGeometries([gooGlow(hosePts, corrugate, 0, 0.78, 260),
    gooGlow([[0, Y, t0 + 0.004], [0, Y, (t0 + t1) / 2], [0, Y, t1 - 0.004]], () => 0.0128, 0.8, 1, 24)], false);
  return rebuild(d, {
    body, ink: new Pieces(), glow,
    parts: { trigger: part(trig, [0, 0.05, 0.03]), ports: ports(n1 - 0.002, Y, 0.01) },
    gripR: GRIP_PISTOL,
    // support hand round the feed tube just ahead of the mid clip (charge capture: left hand mid-tube)
    gripL: gripSpec([0, Y, 0.165], [0, 0, 1], [0.75, -0.62, -0.1]),
    muzzle: [0, Y, n1 + 0.002],
  });
}
/** Empty hose / feed tube colour under the team-coloured charge fill (the coil material is per weapon). */
function gooAnimate(w) { if (w.coil) w.coil.color.setHex(GOO.hose); }

// --------------------------------------------------------------------------------------- Snipewriter 5H
const PENCIL = { tan: '#d99a5f', blue: '#2452c9', black: '#1d1e24', pink: '#e7857f', red: '#d8473c', lens: '#c9d6df', steel: '#a3a8b0' };
/** Snipewriter 5H (Wmn_Charger_Pencil): a pencil-shaped round tan barrel with a pink eraser cap at the rear,
 *  a blue open hood frame over the rear shoulder, a blue collar and mid saddle round the barrel, a raked
 *  blue pistol grip with a red lever trigger, a clear ink tank on top toward the front and a green charge
 *  window along the barrel flank. Side view from the official 3D render (refs/s3-charger-pencil.3d.png),
 *  levelled by −7.7° (barrel centre-line fitted to its alpha silhouette), 1 px = 1.33 mm, grip ≈ 8.5 cm
 *  (same kid hand as the other chargers). Image-derived; the true length is not confirmed. */
function pencil(d) {
  const C = PENCIL, s = 0.00133, P = px(96, 228, s), Y = (228 - 174) * s, Z = x => (x - 96) * s, Yt = y => (228 - y) * s;
  const body = new Pieces(), g = new Pieces();
  // barrel (round section, tapering into the nozzle) and the pink eraser cap at the rear
  body.add(zlathe([[0, Z(12)], [0.0155, Z(12)], [0.0155, Z(372)], [0.0125, Z(386)], [0.0085, Z(396)], [0.0065, Z(398)], [0, Z(398)]], 0, Y, 0, 24), C.tan, M.satin);
  body.add(zlathe([[0, Z(0)], [0.012, Z(0)], [0.0172, Z(3)], [0.0172, Z(9)], [0.0158, Z(13)], [0, Z(13)]], 0, Y, 0, 22), C.pink, M.satin);
  body.add(zcyl(0.0048, Z(398), Z(404), 0, Y, 12), C.black, M.metal);
  // blue open hood over the rear shoulder (window in the middle), blue collar under the barrel, mid saddle
  body.add(slab(outline(P, [[36, 164], [38, 140], [52, 136], [66, 136], [80, 146], [84, 164]]), 0.024, 0, 0.004,
    [outline(P, [[44, 150], [60, 150], [60, 160], [44, 160]])]), C.blue, M.gloss);
  body.add(slab(outline(P, [[36, 162], [112, 162], [112, 190], [104, 196], [90, 200], [84, 190], [36, 190]]), 0.03, 0, 0.005), C.blue, M.gloss);
  body.add(slab(outline(P, [[250, 158], [320, 158], [320, 188], [250, 188]]), 0.03, 0, 0.005), C.blue, M.gloss);
  // raked blue pistol grip (top forward, ~35° from vertical) with a black butt
  pistolGrip(body, { color: C.blue, guard: false, base: false, len: 0.043, w: 0.0105, d: 0.0125, rake: 0.36, mat: M.rubber });
  body.add(box(0.02, 0.008, 0.018, 0, -0.046, -0.012, 0.3).rotateX(0.36), C.black, M.rubber);
  // clear ink tank on top toward the front, blue cap at its rear
  body.add(zcyl(0.0125, Z(300), Z(392), 0, Yt(150), 18), C.lens, M.lens);
  body.add(zcyl(0.0135, Z(296), Z(304), 0, Yt(150), 16), C.blue, M.gloss);
  // charge window: coil bands on the barrel flanks, rear → front
  for (const sx of [-1, 1]) for (let k = 0; k < 8; k++) g.add(box(0.0016, 0.008, 0.02, sx * 0.0158, Y + 0.002, Z(96 + k * 22), 0.3), '#ffffff', M.led);
  const trig = new Pieces().add(slab(outline(P, [[111, 196], [118, 196], [122, 216], [117, 218], [111, 206]]), 0.007, 0, 0.002), C.red, M.satin);
  return rebuild(d, {
    body, glow: glowGeometry(g, Z(96), Z(254)),
    parts: { trigger: part(trig, piv(P, 116, 198)), ports: ports(Z(400) - 0.002, Y, 0.0055) },
    gripR: rakedGrip(0.6),
    // support hand closes round the barrel ahead of the rear hood (long gun: the hand reaches further forward)
    gripL: gripSpec([0, Y, Z(230)], [0, 0, 1], [0.75, -0.62, -0.1]),
    muzzle: [0, Y, Z(400) + 0.002],
  });
}

// Aim: the rail is raised to the eye with the cheek down on it and the butt plate at the right shoulder
// (S3 Splat Charger promo image: kid sighting along the rail, left hand under the body ahead of the trigger).
const SPLAT_HOLD = { aim: { p: [-0.06, 0.075, 0.2], r: [0, 0.06, 0] } };
// Scoped: the eye goes to the eyepiece (≈ 9 cm above / 11 cm ahead of the grip), so the gun sits a little lower.
// E-liter: the tank rides on the shoulder beside the head, the bore ~10 cm above the raked handle.
const ELITER_HOLD = { aim: { p: [-0.07, 0.0, 0.2], r: [0, 0.06, 0] } };
// Bamboozler: short gun held by the upright culm, rear sight right in front of the eye.
const BAMBOO_HOLD = { aim: { p: [-0.07, 0.05, 0.13], r: [0, 0.06, 0] } };
// Goo Tuber: the bulb sits at the cheek, the eye looks along the feed tube.
const GOO_HOLD = { aim: { p: [-0.09, 0.06, 0.18], r: [0, 0.06, 0] } };
const SCOPE_HOLD = { aim: { p: [-0.06, 0.035, 0.17], r: [0, 0.06, 0] } };

// Sighting: while aiming, the head drops and leans onto the weapon so the eye sits behind the rail /
// scope (promo + gameplay captures). Per weapon: head pitch (+down), neck pitch, head roll toward the gun
// (−), and how much of it waits for the charge (scoped chargers settle into the scope as they charge).
const SIGHT = {
  charger: { head: 0.26, neck: 0.1, roll: -0.14, charge: 0.3 },
  's3-charger-normalscope': { head: 0.32, neck: 0.12, roll: -0.2, charge: 0.6 },
};
export function FAMILY_POSE(ch, dt, s, CH) {
  const k = ch.wAim || 0;
  if (!(k > 0.001) || !ch.kidForm) return;
  const a = SIGHT[ch.weapon?.def?.modelId || ch.weaponModel] ?? SIGHT.charger, c = Math.min(1, Math.max(0, ch.charge || 0));
  const w = k * (1 - a.charge + a.charge * c), P = ch.P;
  P[CH.HEAD] += a.head * w; P[CH.NECK] += a.neck * w; P[CH.HEAD + 2] += a.roll * w;
}

export const MODELS = {
  charger: { sourceModel: 'Wmn_Charger_NormalT', build: splatCharger, hold: SPLAT_HOLD },
  's3-charger-normalscope': { sourceModel: 'Wmn_Charger_NormalTScope', build: splatterscope, hold: SCOPE_HOLD },
  's3-charger-quick': { sourceModel: 'Wmn_Charger_Quick', build: squiffer, hold: SPLAT_HOLD },
  's3-charger-light': { sourceModel: 'Wmn_Charger_Light', build: bamboozler, hold: BAMBOO_HOLD },
  's3-charger-keeper': { sourceModel: 'Wmn_Charger_Keeper', build: gooTuber, hold: GOO_HOLD, animate: gooAnimate },
  's3-charger-long': { sourceModel: 'Wmn_Charger_Long', build: eliter, hold: ELITER_HOLD, nativeCarry: true },
  's3-charger-longscope': { sourceModel: 'Wmn_Charger_LongScope', build: eliterScope, hold: ELITER_HOLD, nativeCarry: true },
  's3-charger-pencil': { sourceModel: 'Wmn_Charger_Pencil', build: pencil, hold: SPLAT_HOLD },
};
