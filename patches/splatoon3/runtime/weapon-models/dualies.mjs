// Dualies family models (Splatoon 3 Ver.11.3.0 main weapons). Each model is ONE pistol; the game puts a copy
// in each hand, so d.dual stays true and gripR / gripL stay the native pistol grip (handle axis through the
// origin, leaning forward). Rebuilt with Opus from the official 3D renders and the turntable sheets (the
// renders show the pair overlapped; the turntables show single pistols). Parts the turntable shows in team
// colour are ink. The native recoil `slide` / `slideInk` / `led` channels are kept (hidden: no real dualie
// has a sliding top). Scale: the pistol handle is 0.11 m. Everything is procedural geometry.
import { Pieces, M, box, sphere, zlathe, zcyl, ring, cyl, pipe, slab, smoothOutline, pistolGrip, TRIGGER_PIVOT,
  part, rebuild } from './kit.mjs';

const finish = (d, body, ink, trig, muzzle) => rebuild(d, { body, ink, parts: { trigger: part(trig, TRIGGER_PIVOT) }, muzzle });
/** Side-profile shell: outline [[z, y], ...] (muzzle +Z) extruded `t` across X. */
const shell = (pts, t, bevel = 0.004, n = 0) => slab(n ? smoothOutline(pts, n) : pts, t, 0, bevel);

function splatDualies(d) {
  // Wmn_Maneuver_NormalT: black top shell over a green pistol grip, a green cone nozzle with a magenta tip
  // and collar, an ink canister (white in the render, ink in the turntable) hung behind the grip on a hose.
  const C = { black: '#1d1e22', green: '#2f8a3a', magenta: '#c02a8e', grey: '#8a8f96' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.green, triggerColor: C.black, guardColor: C.green });
  body.add(shell([[-0.078, 0.1], [-0.064, 0.098], [-0.02, 0.09], [0.08, 0.084], [0.116, 0.074], [0.114, 0.054], [0.04, 0.05],
    [-0.01, 0.052], [-0.045, 0.062], [-0.066, 0.08]], 0.024, 0.005, 24), C.black, M.satin);                   // thin top frame, tail up
  body.add(zlathe([[0, 0.11], [0.014, 0.11], [0.016, 0.125], [0.029, 0.17], [0.03, 0.178], [0.012, 0.18], [0, 0.18]], 0, 0.068, 0, 20), C.green, M.gloss);
  body.add(ring(0.018, 0.004, 0, 0.068, 0.118, 'z', 5, 18), C.magenta, M.gloss);
  ink.add(zlathe([[0, 0.176], [0.03, 0.176], [0.031, 0.182], [0, 0.183]], 0, 0.068, 0, 20));                     // tip in ink
  ink.add(zlathe([[0, -0.03], [0.026, -0.03], [0.028, -0.02], [0.028, 0.03], [0.026, 0.038], [0, 0.038]], 0, 0, 0, 20).rotateX(0.25).translate(0, -0.075, -0.07));
  body.add(zlathe([[0.029, -0.035], [0.029, -0.026]], 0, 0, 0, 20).rotateX(0.25).translate(0, -0.075, -0.07), C.black, M.satin);
  body.add(zcyl(0.006, -0.042, -0.02, 0, -0.068, 10), C.black, M.satin);                                // tank outlet
  body.add(pipe([[0, -0.068, -0.02], [0, -0.06, 0.03], [0, -0.02, 0.07], [0, 0.03, 0.098], [0, 0.05, 0.112]], 0.0028, 20, 6), C.grey, M.rubber);
  return finish(d, body, ink, trig, [0, 0.068, 0.184]);
}

function dapple(d) {
  // Wmn_Maneuver_Short: a magenta C-frame (top bar, front drop, forward foot) round a black grip, a black
  // round nozzle drum with a grey face at the front top, a toothbrush clipped to the back (ink bristles).
  const C = { magenta: '#a01a5c', black: '#1a1b1f', grey: '#9aa0a6', white: '#ecebe6', blue: '#2f6fd0' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.black, triggerColor: C.black, guardColor: C.magenta });
  body.add(shell([[-0.045, 0.06], [-0.03, 0.09], [0.03, 0.1], [0.075, 0.095], [0.105, 0.07], [0.112, 0.02], [0.108, -0.045],
    [0.09, -0.05], [0.085, 0.0], [0.075, 0.05], [0.04, 0.06], [0, 0.056]], 0.03, 0.006, 32), C.magenta, M.gloss);   // top bar + front drop
  body.add(shell([[0.125, -0.04], [0.132, -0.072], [0.06, -0.088], [-0.04, -0.092], [-0.1, -0.086], [-0.128, -0.06], [-0.116, -0.054],
    [-0.096, -0.07], [-0.04, -0.077], [0.06, -0.073], [0.104, -0.056]], 0.03, 0.005, 32), C.magenta, M.gloss);      // skid
  for (const sx of [-1, 1]) ink.add(box(0.002, 0.008, 0.07, sx * 0.0155, 0.082, 0.03, 0.3));                      // ink strip
  body.add(zlathe([[0, 0.085], [0.028, 0.085], [0.031, 0.095], [0.031, 0.118], [0.026, 0.124], [0, 0.124]], 0, 0.066, 0, 22), C.black, M.satin);
  body.add(zlathe([[0, 0.123], [0.02, 0.123], [0.02, 0.127], [0, 0.128]], 0, 0.066, 0, 18), C.grey, M.satin);
  for (const z of [0.0, 0.03]) { body.add(cyl(0.005, [0, 0.095, z], [0, 0.118, z], 10), C.black, M.satin); body.add(sphere(0.004, 0.004, 0.004, 0, 0.12, z, 8, 4), C.grey, M.satin); }
  // toothbrush: striped handle rising from the skid's rear curl, bristles (ink) at the top; a wire to the top bar
  const brush = [[0, -0.062, -0.122], [0, -0.01, -0.13], [0, 0.04, -0.125]];
  body.add(pipe(brush, 0.006, 16, 6), C.white, M.gloss);
  body.add(pipe(brush.map(([x, y, z]) => [x + 0.004, y, z + 0.002]), 0.003, 16, 5), C.blue, M.gloss);
  ink.add(box(0.016, 0.032, 0.02, 0, 0.062, -0.136, 0.3));
  body.add(pipe([[0, 0.08, -0.04], [0, 0.074, -0.09], [0, 0.07, -0.124]], 0.001, 8, 4), C.grey, M.satin);
  return finish(d, body, ink, trig, [0, 0.066, 0.13]);
}

function glooga(d) {
  // Wmn_Maneuver_Gallon: a blue boxy upper body with vent slots on two legs (the grip and a squared front
  // leg), red foot plates, a silver drum canister on the back with an ink window, wire hooks on top.
  const C = { blue: '#2346c0', red: '#b8262c', silver: '#c3c6ca', dark: '#26282d', white: '#e8e8e4' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(ink, { color: '#ffffff', triggerColor: C.dark, base: false });                                             // grip leg is ink
  ink.add(box(0.06, 0.06, 0.2, 0, 0.07, 0.04, 0.2));
  for (let k = 0; k < 4; k++) for (const sx of [-1, 1]) body.add(box(0.002, 0.008, 0.03, sx * 0.031, 0.08, 0.0 + k * 0.035, 0.4), C.dark, M.satin);
  ink.add(shell([[0.09, 0.05], [0.13, 0.05], [0.13, -0.06], [0.115, -0.06], [0.115, 0.0], [0.105, 0.0], [0.105, -0.06], [0.09, -0.06]], 0.045, 0.004));  // front leg
  body.add(box(0.05, 0.012, 0.17, 0, -0.068, 0.05, 0.3), C.red, M.satin);                                         // foot plate under both legs
  body.add(zcyl(0.03, -0.12, -0.06, 0, 0.07, 22), C.silver, M.satin);                                             // rear canister
  for (const z of [-0.11, -0.07]) body.add(ring(0.031, 0.003, 0, 0.07, z, 'z', 4, 22), C.dark, M.satin);
  body.add(zlathe([[0, -0.13], [0.02, -0.13], [0.022, -0.122], [0, -0.12]], 0, 0.07, 0, 16), C.dark, M.satin);       // rear gear disc
  ink.add(box(0.008, 0.02, 0.03, -0.03, 0.07, -0.09, 0.4));                                                      // ink window
  body.add(pipe([[0, 0.1, -0.02], [0, 0.135, 0.0], [0, 0.14, 0.03], [0, 0.12, 0.04]], 0.0025, 16, 5), C.silver, M.satin);
  body.add(pipe([[0, 0.1, 0.1], [0, 0.135, 0.12], [0, 0.14, 0.15], [0, 0.12, 0.16]], 0.0025, 16, 5), C.silver, M.satin);
  body.add(zlathe([[0, 0.14], [0.022, 0.14], [0.024, 0.15], [0.02, 0.16], [0, 0.16]], 0, 0.07, 0, 18), C.silver, M.satin);  // mesh nozzle
  body.add(ring(0.016, 0.002, 0, 0.07, 0.16, 'z', 4, 16), C.dark, M.satin);
  body.add(pipe([[0, 0.1, -0.1], [0, 0.135, -0.075], [0, 0.11, -0.04]], 0.004, 14, 6), C.white, M.rubber);         // hose loop over the back
  return finish(d, body, ink, trig, [0, 0.07, 0.162]);
}

function squelchers(d) {
  // Wmn_Maneuver_Dual_L: a red power-drill body (wedge top sloping to the front), a raked red grip with a
  // black battery pack under it, a black ribbed hose nozzle reaching forward with an ink tip.
  const C = { red: '#c0281e', black: '#1b1c20', grey: '#6c7077' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.red, triggerColor: C.black, guardColor: C.red, base: false });
  body.add(shell([[-0.07, 0.04], [-0.07, 0.11], [-0.04, 0.12], [0.06, 0.095], [0.1, 0.07], [0.1, 0.045], [0.0, 0.035]], 0.042, 0.007, 24), C.red, M.satin);
  body.add(box(0.044, 0.012, 0.12, 0, 0.037, 0.01, 0.4), C.black, M.satin);
  body.add(box(0.05, 0.034, 0.075, 0, -0.08, -0.025, 0.3), C.black, M.satin);                                   // battery
  body.add(box(0.052, 0.008, 0.078, 0, -0.064, -0.025, 0.3), C.red, M.satin);
  const hose = [[0, 0.07, 0.095], [0, 0.072, 0.13], [0, 0.07, 0.17], [0, 0.068, 0.21]];
  body.add(pipe(hose, 0.007, 20, 8), C.black, M.rubber);
  for (let k = 0; k < 6; k++) body.add(ring(0.0078, 0.0016, 0, 0.071, 0.11 + k * 0.016, 'z', 4, 12), C.grey, M.satin);
  ink.add(zlathe([[0, 0.205], [0.011, 0.205], [0.012, 0.235], [0.009, 0.24], [0, 0.24]], 0, 0.068, 0, 16));      // ink nozzle tip
  return finish(d, body, ink, trig, [0, 0.068, 0.242]);
}

function darkTetra(d) {
  // Wmn_Maneuver_Stepper: a white C-frame with a purple strip and a looped hook on top, a black body by the
  // grip, a long curved skid under it like a blade with oval cut-outs filled with ink, a black nozzle.
  const C = { white: '#e9e9e6', black: '#1b1c20', purple: '#6a2fb3', grey: '#8d9299' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.black, triggerColor: C.black, guardColor: C.black, base: false });
  body.add(shell([[-0.05, 0.05], [-0.04, 0.09], [0.08, 0.1], [0.12, 0.08], [0.12, 0.04], [0.02, 0.04]], 0.036, 0.006, 24), C.black, M.satin);
  body.add(shell([[0.06, 0.1], [0.1, 0.12], [0.12, 0.08], [0.115, -0.05], [0.09, -0.055], [0.09, 0.06]], 0.03, 0.005, 24), C.white, M.gloss); // front C
  body.add(box(0.032, 0.09, 0.01, 0, 0.03, 0.105, 0.3), C.purple, M.gloss);
  body.add(pipe([[0, 0.11, 0.08], [0, 0.15, 0.085], [0, 0.155, 0.11], [0, 0.125, 0.112]], 0.004, 16, 5), C.white, M.gloss); // hook
  // skid: a flat curved blade from under the grip forward, with ink ovals
  body.add(shell([[-0.08, -0.07], [-0.05, -0.09], [0.06, -0.095], [0.15, -0.075], [0.17, -0.055], [0.15, -0.06], [0.06, -0.078], [-0.05, -0.074]], 0.05, 0.004, 32), C.white, M.gloss);
  for (const z of [-0.03, 0.02, 0.07, 0.12]) ink.add(sphere(0.016, 0.004, 0.012, 0, -0.08 + (z > 0.1 ? 0.006 : 0), z, 14, 4));
  body.add(zlathe([[0, 0.12], [0.017, 0.12], [0.017, 0.14], [0.012, 0.145], [0, 0.145]], 0, 0.065, 0, 16), C.black, M.satin);
  return finish(d, body, ink, trig, [0, 0.065, 0.147]);
}

function douser(d) {
  // Wmn_Maneuver_Long: a black flat top shell, a silver barrel with a red fire-hose nozzle (silver ring,
  // ink face), a yellow D-ring guard in front of the grip, a red extinguisher canister hung below on a hose.
  const C = { black: '#1b1c20', silver: '#c2c5c9', red: '#c4272b', yellow: '#e8c21c', green: '#2f9a4a', white: '#ecebe6' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.black, triggerColor: C.black, guardColor: C.black });
  body.add(shell([[-0.07, 0.06], [-0.06, 0.088], [0.09, 0.098], [0.12, 0.085], [0.11, 0.06], [-0.02, 0.048]], 0.04, 0.006, 24), C.black, M.satin);
  body.add(zcyl(0.014, 0.1, 0.22, 0, 0.07, 16), C.silver, M.satin);
  body.add(zlathe([[0, 0.215], [0.02, 0.215], [0.026, 0.235], [0.026, 0.262], [0.02, 0.268], [0, 0.268]], 0, 0.07, 0, 22), C.red, M.gloss);
  body.add(ring(0.024, 0.0035, 0, 0.07, 0.24, 'z', 5, 22), C.silver, M.metal);
  ink.add(zlathe([[0, 0.266], [0.016, 0.266], [0.016, 0.272], [0, 0.273]], 0, 0.07, 0, 18));
  body.add(ring(0.035, 0.007, 0, 0.0, 0.07, 'x', 8, 28).scale(1, 1.25, 1), C.yellow, M.gloss);                  // D-ring guard
  body.add(zlathe([[0, -0.035], [0.024, -0.035], [0.025, 0.03], [0.018, 0.04], [0, 0.04]], 0, 0, 0, 18).rotateX(-0.3).translate(0, -0.09, -0.03), C.red, M.gloss);
  body.add(zlathe([[0.0255, -0.012], [0.0255, 0.004]], 0, 0, 0, 18).rotateX(-0.3).translate(0, -0.09, -0.03), C.green, M.gloss);
  body.add(pipe([[0, -0.06, -0.01], [0, -0.072, -0.0], [0, -0.078, 0.008]], 0.004, 10, 5), C.black, M.rubber);
  return finish(d, body, ink, trig, [0, 0.07, 0.274]);
}

export const MODELS = {
  'dualies': { sourceModel: 'Wmn_Maneuver_NormalT', build: splatDualies },
  's3-maneuver-short': { sourceModel: 'Wmn_Maneuver_Short', build: dapple },
  's3-maneuver-gallon': { sourceModel: 'Wmn_Maneuver_Gallon', build: glooga },
  's3-maneuver-dual': { sourceModel: 'Wmn_Maneuver_Dual_L', build: squelchers },
  's3-maneuver-stepper': { sourceModel: 'Wmn_Maneuver_Stepper', build: darkTetra },
  's3-maneuver-long': { sourceModel: 'Wmn_Maneuver_Long', build: douser },
};
