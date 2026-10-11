// Dualies family models (Splatoon 3 Ver.11.3.0 maneuvers). Each dualie is ONE pistol: the game draws a copy
// in each hand, so d.dual stays true and gripR / gripL stay GRIP_PISTOL from the kit.
// Side profiles are traced in (z, y) metres from the official per-weapon 3D renders (muzzle to the right,
// handle centre at the origin, handle ~0.11 m). Native channels kept: slide, slideInk (recoil slide, -z per
// shot), led and trigger. Team-ink parts are the `slideInk` part (mat 'ink') and static Pieces in `ink`.
import { Pieces, M, box, zlathe, zcyl, ring, cyl, pipe, slab, pistolGrip, TRIGGER_PIVOT, part, rebuild } from './kit.mjs';

const SLIDE_PIV = [0, 0.07, 0];
const LAMP = { color: '#0f2a18', emissive: '#3dff7a', intensity: 1.3 };

/** Shared assembly: static frame `body`, moving `slide`, static team ink `ink`, moving team ink `slideInk`,
 *  a rear status LED on the slide, the trigger, and the muzzle at the real nozzle exit. */
function assemble(d, { body, slide, ink, slideInk, trig, rearZ, muzzle }) {
  const led = new Pieces();
  led.add(box(0.0035, 0.0035, 0.0015, 0.009, 0.072, rearZ - 0.001), '#3dff7a', M.led);
  return rebuild(d, {
    body, ink, parts: {
      trigger: part(trig, TRIGGER_PIVOT),
      slide: part(slide, SLIDE_PIV),
      slideInk: part(slideInk, SLIDE_PIV, 'ink'),
      led: part(led, [0.009, 0.072, rearZ], 'lamp', LAMP),
    },
    muzzle,
  });
}

// ------------------------------------------------------------------------------------------ Splat Dualies
// Wmn_Maneuver_NormalT: black slide shell with a hump, green turned grip and nozzle, magenta muzzle ring,
// a white ink reservoir slung behind the grip on a hose.
function splatDualies(d) {
  const G = '#2c9a4a', K = '#23262c', MG = '#c4199c', W = '#e8e8e4';
  const body = new Pieces(), slide = new Pieces();
  const trig = pistolGrip(body, { color: G, triggerColor: MG, guardColor: K, baseColor: K });
  slide.add(slab([[-0.075, 0.058], [-0.084, 0.082], [-0.05, 0.097], [0, 0.102], [0.06, 0.1], [0.1, 0.088],
    [0.106, 0.07], [0.07, 0.05], [0, 0.046], [-0.05, 0.044]], 0.026, 0, 0.004), K, M.gloss);
  body.add(zlathe([[0, 0.086], [0.0105, 0.086], [0.0105, 0.1], [0.0175, 0.128], [0.0205, 0.142], [0.0205, 0.15], [0, 0.15]], 0, 0.085, 0, 18), G, M.gloss);
  body.add(zcyl(0.0212, 0.138, 0.15, 0, 0.085, 18), MG, M.gloss);
  body.add(cyl(0.028, [0, -0.02, -0.05], [0, -0.075, -0.13], 16), W, M.satin);
  body.add(pipe([[0, 0.0, -0.02], [0, -0.02, -0.035], [0, -0.04, -0.05]], 0.0035, 8, 6), K, M.rubber);
  return assemble(d, { body, slide, ink: new Pieces(), slideInk: new Pieces(), trig, rearZ: -0.085, muzzle: [0, 0.085, 0.15] });
}

// ------------------------------------------------------------------------------------------ Glooga Dualies
// Wmn_Maneuver_Gallon: a chunky blue block on two struts with red feet, a grey reel at the rear, a steel
// hook over the front. The grip stands between the struts at the origin.
function glooga(d) {
  const BL = '#2456c8', RD = '#c8242a', K = '#24252b', GR = '#a8aeb6';
  const body = new Pieces(), slide = new Pieces();
  const trig = pistolGrip(body, { color: K, triggerColor: RD, guardColor: K, baseColor: K });
  slide.add(slab([[-0.085, 0.02], [-0.1, 0.09], [-0.02, 0.105], [0.05, 0.105], [0.11, 0.095], [0.115, 0.075],
    [0.09, 0.065], [0.03, 0.06], [-0.04, 0.05], [-0.07, 0.035]], 0.05, 0, 0.006), BL, M.satin);
  body.add(zcyl(0.04, -0.15, -0.09, 0, 0.06, 20), GR, M.metal);
  body.add(zcyl(0.045, -0.155, -0.148, 0, 0.06, 20), K, M.satin);
  body.add(slab([[0.03, -0.075], [0.035, 0.06], [0.06, 0.06], [0.06, -0.075]], 0.02, 0, 0.003), RD, M.satin);
  body.add(slab([[-0.1, -0.075], [-0.09, 0.04], [-0.07, 0.04], [-0.075, -0.075]], 0.02, 0, 0.003), RD, M.satin);
  body.add(box(0.05, 0.012, 0.035, 0.045, -0.08, 0.045), K, M.satin);
  body.add(box(0.05, 0.012, 0.035, -0.085, -0.08, -0.07), K, M.satin);
  body.add(pipe([[0, 0.1, 0.09], [0, 0.16, 0.1], [0, 0.165, 0.12], [0, 0.12, 0.13]], 0.0035, 10, 6), GR, M.metal);
  return assemble(d, { body, slide, ink: new Pieces(), slideInk: new Pieces(), trig, rearZ: -0.1, muzzle: [0, 0.09, 0.115] });
}

// ------------------------------------------------------------------------------------------ Dualie Squelchers
// Wmn_Maneuver_Dual_L: red slide body with a black barrel and a yellow-green nozzle cap (team ink), a red
// tank with a white label behind the grip.
function squelchers(d) {
  const RD = '#c81e2e', K = '#1c1d21', YG = '#d6e54a', WH = '#ecebe6';
  const body = new Pieces(), slide = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: K, triggerColor: RD, guardColor: K, baseColor: K });
  slide.add(slab([[-0.07, 0.02], [-0.08, 0.07], [-0.04, 0.1], [0.03, 0.105], [0.09, 0.095], [0.12, 0.075],
    [0.09, 0.058], [0.02, 0.05], [-0.04, 0.04]], 0.034, 0, 0.004), RD, M.gloss);
  body.add(zcyl(0.0125, 0.1, 0.14, 0, 0.082, 14), K, M.metal);
  ink.add(zlathe([[0, 0.13], [0.016, 0.13], [0.02, 0.15], [0.02, 0.16], [0, 0.16]], 0, 0.082, 0, 16), YG, M.gloss);
  body.add(box(0.034, 0.06, 0.04, 0, -0.005, -0.075), RD, M.satin);
  body.add(box(0.036, 0.02, 0.042, 0, -0.005, -0.075), WH, M.print);
  body.add(pipe([[0, -0.01, 0], [0, -0.02, -0.04], [0, -0.005, -0.07]], 0.004, 8, 6), K, M.rubber);
  return assemble(d, { body, slide, ink, slideInk: new Pieces(), trig, rearZ: -0.08, muzzle: [0, 0.082, 0.16] });
}

// ------------------------------------------------------------------------------------------ Dark Tetra Dualies
// Wmn_Maneuver_Stepper: white shell with a black grip and nozzle, a white hoop over the top, green feet
// (team ink) and a green nozzle tip.
function tetra(d) {
  const WH = '#e9e9e6', K = '#1a1b1f', GN = '#29c24a', PU = '#7b2fd0';
  const body = new Pieces(), slide = new Pieces(), ink = new Pieces(), slideInk = new Pieces();
  const trig = pistolGrip(body, { color: K, triggerColor: PU, guardColor: K, baseColor: K });
  slide.add(slab([[-0.09, 0.04], [-0.096, 0.08], [-0.04, 0.1], [0.03, 0.1], [0.08, 0.09], [0.11, 0.075],
    [0.09, 0.06], [0.02, 0.055], [-0.05, 0.05]], 0.03, 0, 0.004), WH, M.gloss);
  body.add(pipe([[0, 0.085, -0.02], [0, 0.135, -0.01], [0, 0.145, 0.05], [0, 0.12, 0.1]], 0.0045, 12, 6), WH, M.metal);
  body.add(zlathe([[0, 0.09], [0.014, 0.09], [0.014, 0.12], [0.011, 0.14], [0, 0.14]], 0, 0.085, 0, 16), K, M.satin);
  ink.add(zcyl(0.011, 0.128, 0.14, 0, 0.085, 14), GN, M.gloss);
  ink.add(box(0.03, 0.014, 0.036, 0, -0.07, 0.05), GN, M.gloss);
  ink.add(box(0.03, 0.014, 0.036, 0, -0.07, -0.07), GN, M.gloss);
  return assemble(d, { body, slide, ink, slideInk, trig, rearZ: -0.09, muzzle: [0, 0.085, 0.14] });
}

// ------------------------------------------------------------------------------------------ Douser Dualies FF
// Wmn_Maneuver_Long: black slide with a red turned nozzle and collar, a red canister slung low behind the
// grip, and a yellow team-ink ring around the frame.
function douser(d) {
  const BK = '#1d1e23', RD = '#d4262c', YL = '#f4b400', WH = '#ecebe6';
  const body = new Pieces(), slide = new Pieces(), slideInk = new Pieces();
  const trig = pistolGrip(body, { color: BK, triggerColor: RD, guardColor: BK, baseColor: BK });
  slide.add(slab([[-0.085, 0.03], [-0.09, 0.075], [-0.04, 0.1], [0.02, 0.105], [0.08, 0.1], [0.12, 0.085],
    [0.11, 0.068], [0.05, 0.065], [-0.02, 0.06], [-0.07, 0.045]], 0.034, 0, 0.004), BK, M.gloss);
  slide.add(box(0.03, 0.03, 0.06, 0, 0.11, -0.01, 0.4, 10, 6), BK, M.satin);
  body.add(zcyl(0.014, 0.1, 0.108, 0, 0.09, 14), BK, M.satin);
  body.add(zlathe([[0, 0.1], [0.012, 0.1], [0.012, 0.12], [0.02, 0.14], [0.021, 0.155], [0, 0.155]], 0, 0.09, 0, 18), RD, M.gloss);
  body.add(cyl(0.034, [0, -0.02, -0.08], [0, -0.15, -0.13], 16), RD, M.satin);
  body.add(cyl(0.035, [0, -0.13, -0.115], [0, -0.165, -0.135], 16), WH, M.print);
  slideInk.add(ring(0.028, 0.005, 0, 0.035, -0.01, 'x', 6, 22), YL, M.gloss);
  return assemble(d, { body, slide, ink: new Pieces(), slideInk, trig, rearZ: -0.09, muzzle: [0, 0.09, 0.155] });
}

export const MODELS = {
  dualies: { sourceModel: 'Wmn_Maneuver_NormalT', build: splatDualies },
  // s3-maneuver-short (Dapple) is not registered: round-2 IoU 0.208 is below the before-IoU 0.308.
  // Its candidate builder is kept in wip/dualies-dapple.mjs.txt for the next agent.
  's3-maneuver-gallon': { sourceModel: 'Wmn_Maneuver_Gallon', build: glooga },
  's3-maneuver-dual': { sourceModel: 'Wmn_Maneuver_Dual_L', build: squelchers },
  's3-maneuver-stepper': { sourceModel: 'Wmn_Maneuver_Stepper', build: tetra },
  's3-maneuver-long': { sourceModel: 'Wmn_Maneuver_Long', build: douser },
};
