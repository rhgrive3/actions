// Splatling family models (Splatoon 3 Ver.11.3.0 spinners): Heavy Splatling, Mini Splatling, Hydra Splatling,
// Ballpoint Splatling, Nautilus 47, Heavy Edit Splatling. Shapes follow the official per-weapon 3D renders and
// the turntable frames (Inkipedia "S3 <Name> model rotating.mp4"); colours come from the 3D renders. The native
// splatling channels are kept: `trigger` (pistol trigger) and `barrels` (the spun cluster, rotating about its
// local Z through a pivot on the barrel axis). The native charge coil is kept for readability although none of the six references
// shows a charge meter. Everything is procedural geometry.
import { Pieces, M, zlathe, xlathe, ylathe, zcyl, ring, pipe, box, sphere, cyl, lathe, torus, at, pistolGrip, supportHandle,
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
 *  barrel channels take the new pieces, the native charge coil is kept (a charging splatling must stay readable
 *  to other players), the muzzle sits at the nozzle exit. */
function finish(d, body, B, tr, AX, muzzleZ, supportColor, ink = new Pieces(), glass = null) {
  supportHandle(body, d.gripL, supportColor);
  return rebuild(d, {
    body, ink, glass,
    parts: { trigger: part(tr, TRIGGER_PIVOT), barrels: part(B, [0, AX, 0.3]) },
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
  // Rebuilt (Opus): the big reservoir is a drum lying across the gun (axis X) behind the motor, in team ink
  // (the turntable shows it ink-coloured, the render translucent grey) inside a dark wire cage; a black
  // motor block with a carry handle, a pink hub with six dark barrels, a black foregrip knob.
  const AX = 0.07, C = { dark: '#2a2b30', cage: '#3a3c42', pink: '#d8287f', black: '#141518', silver: '#b8bcc2' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces();
  const tr = pistolGrip(body, { color: C.dark, triggerColor: C.pink, guardColor: C.dark });
  body.add(box(0.072, 0.085, 0.17, 0, AX, 0.095, 0.3), C.dark, M.satin);                                        // motor block
  body.add(box(0.03, 0.016, 0.06, 0, AX + 0.05, 0.16, 0.4), C.pink, M.gloss);                                     // pink latch
  body.add(pipe([[0, AX + 0.042, 0.04], [0, AX + 0.085, 0.06], [0, AX + 0.085, 0.13], [0, AX + 0.042, 0.15]], 0.0065, 18, 6), C.black, M.satin);
  const ty = AX + 0.055, tz = -0.075, tr2 = 0.088, hw = 0.07;
  ink.add(cyl(tr2, [-hw, ty, tz], [hw, ty, tz], 28));                                                            // ink reservoir
  for (const sx of [-1, 1]) body.add(ring(tr2 - 0.004, 0.008, sx * hw, ty, tz, 'x', 6, 28), C.dark, M.satin);   // drum rims
  for (const x of [-0.035, 0.035]) body.add(ring(tr2 + 0.006, 0.003, x, ty, tz, 'x', 4, 28), C.cage, M.satin);   // cage hoops
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; body.add(cyl(0.003, [-hw - 0.004, ty + Math.sin(a) * (tr2 + 0.006), tz + Math.cos(a) * (tr2 + 0.006)], [hw + 0.004, ty + Math.sin(a) * (tr2 + 0.006), tz + Math.cos(a) * (tr2 + 0.006)], 6), C.cage, M.satin); }
  body.add(box(0.05, 0.04, 0.03, 0, AX + 0.01, 0.02, 0.4), C.dark, M.satin);                                    // tank coupling
  // pink hub with six barrels
  barrelRing(B, { n: 6, a0: Math.PI / 2, R: 0.034, ay: AX, r: 0.0105, z0: 0.18, z1: 0.46, tipL: 0.022, tipR: 0.012, barrel: C.black, tip: C.dark });
  B.add(zlathe([[0, 0.175], [0.056, 0.175], [0.058, 0.2], [0.05, 0.215], [0, 0.215]], 0, AX, 0, 24), C.pink, M.gloss);
  B.add(zlathe([[0.044, 0.33], [0.05, 0.33], [0.05, 0.35], [0.044, 0.35]], 0, AX, 0, 24), C.pink, M.gloss);
  B.add(zlathe([[0.044, 0.425], [0.05, 0.425], [0.05, 0.44], [0.044, 0.44]], 0, AX, 0, 24), C.pink, M.gloss);
  B.add(zcyl(0.014, 0.18, 0.46, 0, AX, 12), C.dark, M.satin);                                                     // axle
  return finish(d, body, B, tr, AX, 0.468, C.black, ink);
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
  // Standard Ballpoint: a real transparent sleeve over separate ink barrels, a
  // black front ring and nose, a white rear cap, a black band with a
  // logo panel, a white ribbed foregrip below and a silver carry handle on top.
  const AX = 0.07, C = { white: '#eceae4', black: '#1a1b1f', silver: '#c1c4c8' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces(), glass = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.black, guardColor: C.black });
  body.add(zlathe([[0, -0.11], [0.03, -0.112], [0.05, -0.095], [0.052, -0.04], [0, -0.04]], 0, AX, 0, 28), C.white, M.gloss);  // rear cap
  body.add(zlathe([[0, -0.04], [0.054, -0.04], [0.054, 0.06], [0, 0.06]], 0, AX, 0, 28), C.black, M.satin);                     // black band
  // The clear sleeve continues around the rounded front shoulder. Only the
  // small central tip is black; the former opaque cone concealed this boundary.
  glass.add(zlathe([[0.05, 0.06], [0.05, 0.375], [0.048, 0.39], [0.041, 0.408], [0.03, 0.422]], 0, AX, 0, 32), '#ffffff');
  body.add(zlathe([[0, 0.422], [0.03, 0.422], [0.03, 0.43], [0, 0.43]], 0, AX, 0, 28), C.black, M.satin); // small opaque tip
  body.add(box(0.05, 0.05, 0.13, 0, -0.005, 0.16, 0.35), C.white, M.gloss);                                     // ribbed foregrip block
  for (let k = 0; k < 5; k++) body.add(box(0.054, 0.006, 0.01, 0, -0.03, 0.115 + k * 0.022, 0.5), C.white, M.gloss);
  body.add(pipe([[0, AX + 0.05, -0.02], [0, AX + 0.1, 0.0], [0, AX + 0.1, 0.06], [0, AX + 0.052, 0.07]], 0.006, 16, 6), C.silver, M.satin);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; B.add(zcyl(0.011, 0.06, 0.37, Math.cos(a) * 0.026, AX + Math.sin(a) * 0.026, 10), '#ffffff', M.gloss); }
  finish(d, body, B, tr, AX, 0.432, C.black, ink, glass);
  d.parts.barrels.mat = 'ink'; // Each ink tube stays visible through the sleeve.
  return d;
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
  'splatling': { sourceModel: 'Wmn_Spinner_StandardT', build: heavy },
  's3-spinner-quick': { sourceModel: 'Wmn_Spinner_QuickT', build: mini },
  's3-spinner-hyper': { sourceModel: 'Wmn_Spinner_HyperT', build: hydra },
  's3-spinner-downpour': { sourceModel: 'Wmn_Spinner_Downpour', build: ballpoint },
  's3-spinner-hypershort': { sourceModel: 'Wmn_Spinner_HyperShort', build: examiner },
  's3-spinner-serein': { sourceModel: 'Wmn_Spinner_Serein', build: nautilus },
};
