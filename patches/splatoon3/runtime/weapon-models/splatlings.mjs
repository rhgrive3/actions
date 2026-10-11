// Splatling family models (Splatoon 3 Ver.11.3.0 spinners): Heavy Splatling, Mini Splatling, Hydra Splatling,
// Ballpoint Splatling, Nautilus 47, Heavy Edit Splatling. Shapes follow the official per-weapon 3D renders and
// the turntable frames (Inkipedia "S3 <Name> model rotating.mp4"); colours come from the 3D renders. The native
// splatling channels are kept: `trigger` (pistol trigger) and `barrels` (the spun cluster, rotating about its
// local Z through a pivot on the barrel axis). The native charge coil is dropped: none of the six references
// shows a charge meter. Everything is procedural geometry.
import { Pieces, M, zlathe, zcyl, ring, pipe, box, sphere, cyl, lathe, torus, at, pistolGrip, supportHandle,
  part, rebuild, TRIGGER_PIVOT } from './kit.mjs';

/** Barrels on a ring of radius R about the spin axis (ay): n tubes from z0 to z1, each with a nozzle tip. */
function barrelRing(B, o) {
  for (let k = 0; k < o.n; k++) {
    const a = o.a0 + (k * 2 * Math.PI) / o.n, x = Math.cos(a) * o.R, y = o.ay + Math.sin(a) * o.R;
    B.add(zcyl(o.r, o.z0, o.z1, x, y, 10), o.barrel, M.metal);
    B.add(zcyl(o.tipR, o.z1 - o.tipL, o.z1 + 0.002, x, y, 10), o.tip, M.gloss);
  }
}
/** Shared finish: the native support hand stays on d.gripL (drawn as a foregrip), the native trigger and
 *  barrel channels take the new pieces, the native charge coil is dropped, the muzzle sits at the nozzle exit. */
function finish(d, body, B, tr, AX, muzzleZ, supportColor) {
  supportHandle(body, d.gripL, supportColor);
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { trigger: part(tr, TRIGGER_PIVOT), barrels: part(B, [0, AX, 0.3]) },
    drop: ['glow'],
    muzzle: [0, AX, muzzleZ],
  });
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------------------------------ Heavy Splatling
// Wmn_Spinner_StandardT. Rear: a tall silver ink reservoir leaning outward, two straps and a feed hose.
// Front: a pink hub drum with six barrels on a ring (six dark tubes with black tips). Black motor housing,
// carry bail on top. The tank and housing dimensions come from the legacy reference model (IoU 0.57);
// the six-barrel cluster is traced from the 3D render and the turntable face view.
function heavy(d) {
  const AX = 0.07, C = { dark: '#25262b', silver: '#b5b9c0', pink: '#d8287f', black: '#131417', yellow: '#e8c33a' };
  const body = new Pieces(), B = new Pieces();
  const tr = pistolGrip(body, { color: C.dark, triggerColor: C.pink, guardColor: C.dark });
  body.add(box(0.104, 0.016, 0.165, 0, -0.013, 0.123), C.black);
  body.add(box(0.058, 0.07, 0.18, 0, AX - 0.005, 0.11, 0.25), C.dark, M.satin);
  body.add(pipe([[0, AX + 0.045, 0.02], [0, AX + 0.10, 0.05], [0, AX + 0.10, 0.12], [0, AX + 0.04, 0.14]], 0.006, 16, 6), C.black, M.satin);
  // round 2: shorter, lower reservoir (the reference silhouette is ~1.9:1, the first pass was too tall)
  const tank = at(lathe([[0, -0.115], [0.056, -0.115], [0.062, -0.103], [0.062, 0.103], [0.056, 0.115], [0, 0.115]], 24).rotateZ(-0.22), 0.130, 0.125, -0.041);
  body.add(tank, C.silver, M.metal);
  for (const y of [0.085, 0.125]) body.add(at(torus(0.063, 0.004, 5, 24).rotateX(Math.PI / 2).rotateZ(-0.22), 0.130, y, -0.041), C.black);
  body.add(pipe([[0.120, 0.004, -0.039], [0.131, -0.047, -0.051], [0.070, -0.065, 0.050], [0.035, 0.020, 0.070]], 0.009), C.yellow, M.gloss);
  body.add(pipe([[-0.027, 0.081, -0.016], [-0.038, 0.147, 0.009], [0.021, 0.147, 0.034], [0.032, 0.082, 0.065]], 0.008), C.yellow);
  // six barrels on a ring of radius 0.04, pink hub drum, pink rings along the barrels
  barrelRing(B, { n: 6, a0: Math.PI / 2, R: 0.04, ay: AX, r: 0.0085, z0: 0.17, z1: 0.45, tipL: 0.02, tipR: 0.0095,
    barrel: C.dark, tip: C.black });
  B.add(zcyl(0.05, 0.17, 0.38, 0, AX, 24), C.pink, M.gloss);
  for (const z of [0.207, 0.321]) B.add(ring(0.052, 0.003, 0, AX, z, 'z', 4, 24), C.pink, M.gloss);
  return finish(d, body, B, tr, AX, 0.456, C.dark);
}

// ------------------------------------------------------------------------------------------ Mini Splatling
// Wmn_Spinner_QuickT. A purple housing with a black carry bail, a white bulb-shaped tank at the rear and a
// yellow drum at the front. Six blue nozzles sit on a ring about a black centre.
function mini(d) {
  const AX = 0.07, C = { purple: '#5b3bb5', yellow: '#f4c52c', white: '#ecebe6', blue: '#2a4fd1', black: '#1d1e22' };
  const body = new Pieces(), B = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.yellow, guardColor: C.purple, w: 0.0125 });
  body.add(sphere(0.062, 0.07, 0.12, 0, 0.0, -0.10), C.white, M.gloss);
  body.add(zcyl(0.04, -0.04, 0.20, 0, AX, 24), C.purple, M.gloss);
  body.add(box(0.05, 0.03, 0.20, 0, AX + 0.045, 0.06, 0.3), C.purple, M.gloss);
  body.add(box(0.02, 0.02, 0.05, 0, AX + 0.07, -0.07), C.purple, M.gloss);
  body.add(pipe([[0, AX + 0.045, -0.02], [0, AX + 0.12, -0.02], [0, AX + 0.12, 0.10], [0, AX + 0.045, 0.10]], 0.006, 16, 6), C.black, M.satin);
  // yellow drum and six blue nozzles on a ring about a black centre
  B.add(zcyl(0.055, 0.19, 0.30, 0, AX, 24), C.yellow, M.gloss);
  B.add(zcyl(0.01, 0.20, 0.31, 0, AX, 12), C.black, M.satin);
  barrelRing(B, { n: 6, a0: Math.PI / 2, R: 0.032, ay: AX, r: 0.007, z0: 0.10, z1: 0.30, tipL: 0.02, tipR: 0.0095,
    barrel: C.black, tip: C.blue });
  return finish(d, body, B, tr, AX, 0.302, C.black);
}

// ------------------------------------------------------------------------------------------ Hydra Splatling
// Wmn_Spinner_HyperT. A silver canister tilted back over the rear, a red drum with four brass nozzles,
// an orange motor housing under the drum, a spring and a gold feed hose.
function hydra(d) {
  const AX = 0.075, C = { red: '#c8242f', silver: '#c4c7cc', gold: '#d8b03a', orange: '#e0702a', dark: '#202126' };
  const body = new Pieces(), B = new Pieces();
  const tr = pistolGrip(body, { color: C.dark, triggerColor: C.red, guardColor: C.dark });
  body.add(box(0.11, 0.01, 0.20, 0, -0.03, 0.06, 0.2), C.dark, M.satin);
  body.add(box(0.07, 0.06, 0.09, 0, AX - 0.01, -0.02, 0.3), C.orange, M.gloss);
  const A = [0, 0.03, -0.05], Bt = [0, 0.23, -0.12];
  body.add(cyl(0.046, A, Bt, 24), C.silver, M.metal);
  for (const t of [0.30, 0.62]) body.add(cyl(0.049, lerp3(A, Bt, t), lerp3(A, Bt, t + 0.04), 24), C.dark, M.satin);
  body.add(cyl(0.015, [0, 0.03, -0.05], [0, AX, 0.02]), C.silver, M.metal);
  body.add(pipe([[0, 0.03, -0.04], [0, -0.01, -0.02], [0, -0.02, 0.04]], 0.005, 12, 6), C.gold, M.gloss);
  for (let k = 0; k < 5; k++) body.add(ring(0.009, 0.0018, 0, -0.01 + k * 0.018, 0.07, 'y', 4, 12), C.silver, M.metal);
  // red drum and four barrels with brass nozzles
  B.add(zcyl(0.05, 0.0, 0.12, 0, AX, 24), C.red, M.gloss);
  barrelRing(B, { n: 4, a0: Math.PI / 4, R: 0.022, ay: AX, r: 0.0075, z0: 0.02, z1: 0.21, tipL: 0.03, tipR: 0.0105,
    barrel: C.silver, tip: C.gold });
  return finish(d, body, B, tr, AX, 0.212, C.dark);
}

// ------------------------------------------------------------------------------------------ Ballpoint Splatling
// Wmn_Spinner_Downpour. A white shell with a red rear cap and a black underside sleeve, a clear tube up
// front with three barrels inside, and a black carry bail.
function ballpoint(d) {
  const AX = 0.075, C = { white: '#e9e9e6', grey: '#8f9298', black: '#1c1d21', red: '#c4392c', clear: '#c8d8e0' };
  const body = new Pieces(), B = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.red, guardColor: C.black });
  body.add(zcyl(0.042, -0.05, 0.18, 0, AX, 28), C.white, M.gloss);
  body.add(zlathe([[0, -0.075], [0.046, -0.075], [0.047, -0.06], [0.044, -0.05], [0, -0.05]], 0, AX, 0, 24), C.red, M.gloss);
  body.add(box(0.07, 0.03, 0.16, 0, AX - 0.04, 0.07, 0.3), C.black, M.satin);
  body.add(zcyl(0.03, 0.18, 0.33, 0, AX, 24), C.clear, M.lens);
  body.add(pipe([[0, AX + 0.05, -0.02], [0, AX + 0.09, 0.0], [0, AX + 0.09, 0.10], [0, AX + 0.05, 0.12]], 0.0065, 16, 6), C.black, M.satin);
  barrelRing(B, { n: 3, a0: Math.PI / 2, R: 0.012, ay: AX, r: 0.0065, z0: 0.15, z1: 0.32, tipL: 0.02, tipR: 0.0075,
    barrel: C.grey, tip: C.red });
  return finish(d, body, B, tr, AX, 0.33, C.black);
}

// ------------------------------------------------------------------------------------------ Nautilus 47
// Wmn_Spinner_Serein. A dark dome-shaped reservoir at the rear with a gold rim, a short grey housing and
// three nozzles at the front. A green window pod sits under the housing.
function nautilus(d) {
  const AX = 0.07, C = { grey: '#3a3c42', dark: '#26282e', gold: '#c5a04e', green: '#67c3a6', metal: '#8e939b' };
  const body = new Pieces(), B = new Pieces();
  const tr = pistolGrip(body, { color: C.dark, triggerColor: C.green, guardColor: C.dark });
  body.add(zcyl(0.03, -0.12, 0.0, 0, AX, 20), C.dark, M.satin);
  // Round-2 tilt of this dome (about X) scored IoU 0.22, so round 1's untilted dome is kept (IoU 0.40).
  body.add(zlathe([[0, -0.155], [0.072, -0.155], [0.08, -0.148], [0.082, -0.13], [0.075, -0.12], [0, -0.12]], 0, AX, 0, 28), C.dark, M.gloss);
  body.add(ring(0.08, 0.0035, 0, AX, -0.14, 'z', 5, 28), C.gold, M.metal);
  body.add(box(0.03, 0.03, 0.05, 0, AX - 0.04, -0.03, 0.4), C.green, M.gloss);
  body.add(zcyl(0.028, 0.0, 0.14, 0, AX, 24), C.grey, M.gloss);
  B.add(zcyl(0.03, 0.14, 0.20, 0, AX, 24), C.grey, M.gloss);
  barrelRing(B, { n: 3, a0: Math.PI / 2, R: 0.014, ay: AX, r: 0.0065, z0: 0.02, z1: 0.26, tipL: 0.02, tipR: 0.0075,
    barrel: C.metal, tip: C.dark });
  return finish(d, body, B, tr, AX, 0.262, C.dark);
}

// ------------------------------------------------------------------------------------------ Heavy Edit Splatling
// Wmn_Spinner_HyperShort. A white tank box with a red print at the rear, a black housing and red drum at the
// front, three silver nozzles with red rings, and a silver carry bail.
function examiner(d) {
  const AX = 0.085, C = { silver: '#c9cbcf', grey: '#9ca0a7', red: '#d7262d', black: '#1e1f24', white: '#e6e6e2' };
  const body = new Pieces(), B = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.red, guardColor: C.black });
  body.add(box(0.12, 0.10, 0.18, 0, AX - 0.04, -0.09, 0.2, 10, 8), C.white, M.satin);
  body.add(box(0.13, 0.02, 0.19, 0, AX + 0.02, -0.09, 0.3), C.grey, M.satin);
  body.add(zcyl(0.052, -0.02, 0.06, 0, AX, 24), C.black, M.satin);
  body.add(pipe([[0, AX - 0.02, 0.03], [0, AX + 0.09, 0.04], [0, AX + 0.09, -0.05], [0, AX - 0.03, -0.07]], 0.0065, 16, 6), C.silver, M.metal);
  B.add(zcyl(0.05, 0.06, 0.14, 0, AX, 24), C.red, M.gloss);
  barrelRing(B, { n: 3, a0: Math.PI / 2, R: 0.018, ay: AX, r: 0.008, z0: 0.10, z1: 0.24, tipL: 0.02, tipR: 0.0095,
    barrel: C.silver, tip: C.grey });
  return finish(d, body, B, tr, AX, 0.242, C.black);
}

export const MODELS = {
  'splatling': { sourceModel: 'Wmn_Spinner_StandardT', build: heavy },
  's3-spinner-quick': { sourceModel: 'Wmn_Spinner_QuickT', build: mini },
  's3-spinner-hyper': { sourceModel: 'Wmn_Spinner_HyperT', build: hydra },
  's3-spinner-downpour': { sourceModel: 'Wmn_Spinner_Downpour', build: ballpoint },
  // Nautilus 47 is NOT registered: the best measured silhouette (IoU 0.40) is below the base model's 0.44,
  // so it keeps the native model until the dome and nozzle block are reworked (see the reference doc).
  // 's3-spinner-serein': { sourceModel: 'Wmn_Spinner_Serein', build: nautilus },
  's3-spinner-hypershort': { sourceModel: 'Wmn_Spinner_HyperShort', build: examiner },
};
