// Shooter family models, group B (Splatoon 3 Ver.11.3.0 main weapons): Splattershot Pro, .96 Gal,
// Jet Squelcher, Splattershot Nova, L-3 Nozzlenose, H-3 Nozzlenose, Squeezer.
// Shapes follow the official per-weapon 3D renders (Inkipedia "S3 Weapon Main <name> 3D", 400 px,
// muzzle to the right). Those renders are close perspective views, so each model traces the render's
// alpha silhouette (the IoU target) in the (z, y) plane, with the reference pixel frame of each render.
// Scale: the visible pistol handle below the receiver is 0.11 m, so s = 0.11 / handle length in
// reference pixels, with the handle centre at the origin. Internal model names come from Leanny/splat3
// ActorInfo (Fmdb). Everything is procedural geometry.
import { THREE, Pieces, M, V, zlathe, zcyl, ring, pipe, slab, smoothOutline, pistolGrip, gripSpec, part, rebuild,
  TRIGGER_PIVOT } from './kit.mjs';

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

// ------------------------------------------------------------------------------------------ Splattershot Pro
function expert(d) {
  // Wmn_Shooter_Expert: blue receiver with a fin on top and cooling fins underneath, a silver ink-tank
  // cylinder along the body, a silver spike nozzle with a red tip, a red carry hoop running down both
  // flanks of the rear half, a blue raked handle with a red trigger. Silver tank: no team colour on
  // the official render, so it is a body part (the native can channel still pulses it per shot).
  const s = 0.11 / 56, P = px(192, 253, s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { blue: '#2c4a8f', dkblue: '#1f3566', silver: '#a9aca9', red: '#d62e36', tip: '#ef1715' };
  const RAKE = 0.37;
  const body = new Pieces(), can = new Pieces();
  body.add(side(P, [[236, 160], [262, 146], [296, 138], [322, 130], [338, 140], [342, 170], [338, 206], [320, 224],
    [292, 226], [262, 214], [238, 198]], 0.04, 24), C.blue, M.gloss);
  const ty = Y(186), tz0 = Z(84), tz1 = Z(236), tr = 44 * s;
  can.add(zlathe([[0, tz0], [tr * 0.9, tz0], [tr, tz0 + 0.012], [tr, tz1 - 0.012], [tr * 0.92, tz1], [0, tz1]], 0, ty, 0, 24),
    C.silver, M.metal);
  body.add(zlathe([[0, Z(336)], [31 * s, Z(338)], [30 * s, Z(350)], [25 * s, Z(362)], [20 * s, Z(376)], [15 * s, Z(388)],
    [14 * s, Z(392)], [0, Z(392)]], 0, Y(183), 0, 24), C.silver, M.metal);
  body.add(zlathe([[0, Z(378)], [10 * s, Z(379)], [10 * s, Z(391)], [0, Z(392)]], 0, Y(183), 0, 16), C.tip, M.gloss);
  const hoop = [[6, 190], [30, 186], [60, 198], [96, 216], [140, 224], [190, 222], [226, 208]];
  for (const sx of [-1, 1]) body.add(sideTube(P, hoop, 6 * s, sx * 0.02, 3), C.red, M.gloss);
  const trig = raked(body, RAKE, { color: C.dkblue, triggerColor: C.red, guardColor: C.dkblue });
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { can: part(can, [0, ty, (tz0 + tz1) / 2], 'body'), trigger: part(trig, TRIGGER_PIVOT) },
    gripR: rakedGrip(RAKE),
    gripL: supportGrip([0, Y(222), Z(214)], 0),
    muzzle: [0, Y(183), Z(392)],
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
function longJet(d) {
  // Wmn_Shooter_Long: a teal rear block whose front edge is the raked handle, a teal upper housing
  // (ink tank, pulses per shot), a thin black hose running out to a pale teal nozzle with a black ring.
  const s = 0.11 / 63, P = px(120, 250, s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { teal: '#1f6b78', dteal: '#16505b', black: '#1b1c20', pale: '#c6e3dc' };
  const RAKE = 0.30;
  const body = new Pieces(), can = new Pieces();
  body.add(side(P, [[14, 232], [30, 218], [100, 218], [130, 211], [160, 211], [190, 207], [210, 214], [226, 246], [208, 250],
    [176, 258], [144, 268], [128, 279], [100, 284], [60, 290], [32, 290], [14, 276]], 0.05), C.dteal, M.satin);
  can.add(side(P, [[96, 114], [112, 118], [128, 121], [144, 131], [176, 139], [208, 146], [232, 150], [248, 152], [256, 160],
    [248, 176], [224, 184], [192, 187], [160, 186], [128, 182], [104, 185], [96, 160]], 0.045, 16), C.teal, M.gloss);
  body.add(sideTube(P, [[240, 161], [262, 161], [290, 162], [320, 161], [330, 161]], 5.5 * s, 0, 2), C.black, M.metal);
  body.add(zlathe([[0, Z(328)], [9 * s, Z(330)], [15 * s, Z(344)], [15 * s, Z(346)], [13 * s, Z(362)], [12 * s, Z(376)],
    [11 * s, Z(392)], [11 * s, Z(396)], [0, Z(396)]], 0, Y(161), 0, 24), C.pale, M.gloss);
  body.add(zcyl(15 * s, Z(346), Z(352), 0, Y(161), 24), C.black, M.satin);
  const trig = raked(body, RAKE, { color: C.dteal, triggerColor: C.black, guardColor: C.dteal, w: 0.0135 });
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { can: part(can, [0, Y(150), Z(176)], 'body'), trigger: part(trig, TRIGGER_PIVOT) },
    gripR: rakedGrip(RAKE),
    gripL: supportGrip([0, Y(196), Z(200)], 0),
    muzzle: [0, Y(161), Z(396)],
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
  's3-shooter-long': { sourceModel: 'Wmn_Shooter_Long', build: longJet },
  's3-shooter-quicklong': { sourceModel: 'Wmn_Shooter_QuickLong', build: nova },
  's3-shooter-triplequick': { sourceModel: 'Wmn_Shooter_TripleQuick', build: nozzleL3 },
  's3-shooter-triplemiddle': { sourceModel: 'Wmn_Shooter_TripleMiddle', build: nozzleH3 },
  's3-shooter-flash': { sourceModel: 'Wmn_Shooter_Flash', build: squeezer,
    // the bottle's fore-grip is far forward: carry it closer so the support hand still reaches (image-estimated)
    hold: { carry: { p: [-0.17, 0.79, 0.05], r: [0.45, 0.14, -0.14] }, run: { p: [-0.16, 0.81, 0.09] }, aim: { p: [-0.04, -0.07, 0.15] } } },
};
