// Stringer family models and motion (Splatoon 3 Ver.11.3.0). The catalogue gives stringers the Charger
// visual family (modelKind charger: native two-handed HOLD, trigger/bolt/lens/eyepiece/ports channels and
// the charge glow coil). These models replace the sniper rifle with a real bow: limbs, riser, string, ink
// cartridge and the arrow barrel(s). Weapon space: +Z = arrow direction, +Y = limb axis (the "airborne"
// bow orientation of the promo shots), limbs sweep back (-Z) towards the string, string at the rear.
//
// Motion (read-only gameplay state, `st.charge` / `st.sinceRelease` from the native charger layer):
//  * the string is split into two named halves (`string` upper, `stringL` lower) hinged at the limb tips
//    and re-aimed every frame so the V-shaped draw follows the charge; `arrow` (the shaft) and `nock`
//    follow it, and the string snaps forward with a short damped vibration on release.
//  * Bow orientation: official promo art shows the bow held with the limbs roughly horizontal while the
//    kid stands (Inkipedia "S3 promo screenshot Tri-Stringer 00.jpg") and with the limbs vertical while
//    airborne ("... 01.jpg"). FAMILY_POSE rolls the weapon about its arrow axis by GROUND_ROLL while
//    grounded; the exact angle and the roll direction are NOT measured (未確認).
import { THREE, Pieces, M, V, box, sphere, zlathe, zcyl, xcyl, ycyl, ring, pipe, pipeR, slab, part, rebuild, gripSpec,
  pistolGrip, glowGeometry, clamp, damp, smooth } from './kit.mjs';

const YC = 0.085;                       // bow axis height above the grip
const GROUND_ROLL = 1.25;               // rad, limbs near-horizontal on the ground (image-based estimate)

/** Curved limb from the riser to the tip. side = +1 upper / -1 lower. */
function limbPoints(side, cfg) {
  const { span, back, riserZ, bulge = 0 } = cfg;
  return [[0, YC + side * 0.06, riserZ], [0, YC + side * span * 0.45, riserZ - back * 0.38 + bulge], [0, YC + side * span * 0.75, riserZ - back * 0.72 + bulge * 0.4], [0, YC + side * span, riserZ - back]];
}

/** Shared bow: limbs (wood / white), tip caps, riser plate, grip, string halves, arrow + nock parts. */
function bow(d, cfg, extra) {
  const C = cfg.C, body = new Pieces(), ink = new Pieces();
  const tr = pistolGrip(body, { color: C.grip ?? C.dark, triggerColor: C.black, guardColor: C.dark, baseColor: C.dark });
  const tipZ = cfg.riserZ - cfg.back, span = cfg.span;
  for (const s of [1, -1]) {
    if (cfg.limbR > 0) body.add(pipeR(limbPoints(s, cfg), t => cfg.limbR * (1 - 0.35 * t), 22, 10), C.limb, M.satin);
    if (cfg.limbR > 0) body.add(box(cfg.capW ?? 0.03, 0.026, 0.03, 0, YC + s * span, tipZ, 0.35), C.steel, M.satin);   // tip cap / nock block
  }
  body.add(box(0.034, 0.17, 0.04, 0, YC, cfg.riserZ, 0.3), C.steel, M.satin);                         // riser plate
  body.add(box(0.026, 0.07, 0.07, 0, YC - 0.04, 0.0, 0.3), C.dark, M.satin);                          // body-to-grip block
  extra(body, ink, C, cfg);
  // string halves hinged at the tips, pointing at the rest nock; re-aimed and scaled per frame
  const s1 = new Pieces(), s2 = new Pieces(), nock = new Pieces(), arrow = new Pieces();
  s1.add(ycyl(0.0016, YC, YC + span, 0, tipZ, 5), C.string, M.satin);
  s2.add(ycyl(0.0016, YC - span, YC, 0, tipZ, 5), C.string, M.satin);
  nock.add(box(0.012, 0.03, 0.012, 0, YC, tipZ, 0.5), C.steel, M.satin);
  arrow.add(zcyl(0.0035, tipZ + 0.012, cfg.arrowFront, 0, YC, 8), C.black, M.satin);
  d.bowCfg = { span, tipZ, arrowFront: cfg.arrowFront };
  const parts = {
    trigger: part(tr, [0, 0.0315, 0.0282]),
    string: part(s1, [0, YC + span, tipZ], 'ink'),
    stringL: part(s2, [0, YC - span, tipZ], 'ink'),
    nock: part(nock, [0, YC, tipZ]),
    arrow: part(arrow, [0, YC, cfg.arrowFront]),
  };
  const rings = new Pieces();
  for (let k = 0; k < 6; k++) rings.add(ring(cfg.coilR, 0.0016, 0, YC, cfg.coil0 + (cfg.coil1 - cfg.coil0) * k / 5, 'z', 4, 18), '#ffffff', M.led);
  return rebuild(d, { body, ink, parts, gripL: cfg.gripL, muzzle: [0, YC, cfg.muzzleZ],
    glow: glowGeometry(rings, cfg.coil0 - 0.002, cfg.coil1 + 0.002, 'z') });
}

// ------------------------------------------------------------------------------------------ Tri-Stringer
function tri(d) {
  // Wmn_Stringer_Normal: brown wood limbs, silver riser and reel body wound with team-ink string, silver
  // octagon muzzle plate, two black-capped side barrels above / below the centre arrow.
  const C = { limb: '#7a3b22', steel: '#b8bcc4', dark: '#2b2c31', black: '#16171a', string: '#d9e24a', grip: '#2b2c31' };
  const cfg = { C, span: 0.4, back: 0.2, riserZ: -0.04, limbR: 0.013, coilR: 0.052, coil0: -0.02, coil1: 0.13, arrowFront: 0.02, muzzleZ: 0.178,
    gripL: gripSpec([0, 0.0, 0.11], [0, 0, 1], [0.75, -0.62, -0.1]) };
  return bow(d, cfg, (body, ink) => {
    body.add(zlathe([[0, -0.05], [0.04, -0.05], [0.05, -0.04], [0.05, 0.14], [0.04, 0.15], [0, 0.15]], 0, YC, 0, 24), C.steel, M.satin);
    ink.add(zlathe([[0, -0.015], [0.046, -0.015], [0.046, 0.12], [0, 0.12]], 0, YC, 0, 24));
    body.add(zlathe([[0.012, 0.15], [0.056, 0.15], [0.056, 0.175], [0.012, 0.175]], 0, YC, 0, 8), C.steel, M.satin);
    body.add(zlathe([[0, 0.172], [0.014, 0.172], [0.014, 0.18], [0, 0.18]], 0, YC, 0, 12), C.black, M.satin);
    for (const s of [1, -1]) {
      body.add(zcyl(0.017, 0.015, 0.1, 0, YC + s * 0.1, 14).rotateX(0), C.steel, M.satin);
      body.add(zcyl(0.019, 0.1, 0.135, 0, YC + s * 0.1, 14), C.black, M.rubber);
      ink.add(zcyl(0.0175, 0.04, 0.062, 0, YC + s * 0.1, 14));
      body.add(box(0.012, 0.06, 0.014, 0, YC + s * 0.06, 0.03, 0.3), C.dark, M.satin);               // strut to the barrel
    }
  });
}

// ------------------------------------------------------------------------------------------ REEF-LUX 450
function reef(d) {
  // Wmn_Stringer_Short: compact compound bow, cream swept limbs with pulley wheels at the tips, black
  // cartridge drum with a hazard label, ribbed silver muzzle ring, two small peg stabilisers.
  const C = { limb: '#e4e0d4', steel: '#a9adb4', dark: '#2a2b30', black: '#17181b', string: '#cfd6c4', grip: '#2a2b30' };
  const cfg = { C, span: 0.3, back: 0.14, riserZ: -0.03, limbR: 0.017, bulge: 0.05, capW: 0.04, coilR: 0.056, coil0: -0.01, coil1: 0.09,
    arrowFront: 0.02, muzzleZ: 0.15, gripL: gripSpec([0, 0.0, 0.095], [0, 0, 1], [0.75, -0.62, -0.1]) };
  return bow(d, cfg, (body, ink) => {
    body.add(zlathe([[0, -0.045], [0.052, -0.045], [0.056, -0.035], [0.056, 0.085], [0.05, 0.095], [0, 0.095]], 0, YC, 0, 24), C.black, M.satin);
    body.add(box(0.058 * 2, 0.034, 0.04, 0, YC, 0.025, 0.4), C.black, M.print);   // label strip
    for (let k = 0; k < 7; k++) body.add(ring(0.047, 0.003, 0, YC, 0.095 + k * 0.0085, 'z', 4, 18), C.steel, M.satin);
    body.add(zlathe([[0.012, 0.095], [0.044, 0.095], [0.044, 0.152], [0.012, 0.152]], 0, YC, 0, 18), C.steel, M.satin);
    ink.add(ring(0.03, 0.004, 0, YC, 0.152, 'z', 4, 18));
    for (const s of [1, -1]) {
      body.add(xcyl(0.03, -0.007, 0.007, YC + s * cfg.span, cfg.riserZ - cfg.back + 0.01, 16), C.steel, M.satin);    // pulley wheels
      body.add(xcyl(0.012, -0.012, 0.012, YC + s * cfg.span, cfg.riserZ - cfg.back + 0.01, 10), C.dark, M.satin);
      body.add(zcyl(0.007, 0.0, 0.065, 0, YC + s * 0.15, 8), C.steel, M.satin);                                   // peg stabilisers
      body.add(pipe([[0, YC + s * cfg.span, cfg.riserZ - cfg.back + 0.01], [0, YC + s * 0.14, cfg.riserZ - 0.02]], 0.0013, 8, 4), '#9a9ea6', M.satin);   // static cable
    }
    body.add(box(0.016, 0.09, 0.016, 0, YC, cfg.riserZ - cfg.back, 0.4), C.limb, M.satin);                     // crossbar behind the nock
  });
}

// ------------------------------------------------------------------------------------------ Wellstring V
function wellstring(d) {
  // Wmn_Stringer_Explosion: hydraulic crossbow. Green riveted pump cylinder with a gold name plate, a hex
  // cluster of brass nozzles, a T-handle plunger at the rear, a blue ink hose, and green C-frame arms that
  // curl back to eyelet rings carrying the string.
  const C = { limb: '#1f5d46', steel: '#c9ccd0', dark: '#2b2c31', black: '#17181b', string: '#d8d8cf', grip: '#1f5d46', brass: '#c9a44a' };
  const cfg = { C, span: 0.325, back: 0.19, riserZ: 0, limbR: 0, capW: 0.05, coilR: 0.062, coil0: -0.03, coil1: 0.14,
    arrowFront: 0.02, muzzleZ: 0.205, gripL: gripSpec([0, 0.0, 0.105], [0, 0, 1], [0.75, -0.62, -0.1]) };
  return bow(d, cfg, (body, ink) => {
    // limbs are flat C-frame plates (side profile), not round pipes: overwrite the generic ones by adding plates
    for (const s of [1, -1]) {
      const pts = [[-0.01, 0.05], [-0.06, 0.09], [-0.1, 0.17], [-0.12, 0.25], [-0.17, 0.32], [-0.19, 0.34], [-0.2, 0.3], [-0.15, 0.27], [-0.1, 0.2], [-0.07, 0.13], [-0.03, 0.07]];
      body.add(slab(pts.map(([z, y]) => [z, YC + s * y]), 0.022, 0, 0.004), C.limb, M.satin);
      body.add(ring(0.016, 0.005, 0, YC + s * 0.325, -0.19, 'x', 4, 14), C.limb, M.satin);
    }
    body.add(zlathe([[0, -0.07], [0.052, -0.07], [0.062, -0.05], [0.062, 0.14], [0.052, 0.16], [0, 0.16]], 0, YC, 0, 24), C.limb, M.satin);
    body.add(box(0.07, 0.045, 0.012, 0, YC + 0.0, 0.06, 0.2), C.brass, M.satin);                  // name plate (print-like)
    for (const z of [-0.06, 0.15]) body.add(ring(0.063, 0.004, 0, YC, z, 'z', 4, 20), '#12372a', M.satin);
    for (let k = 0; k < 6; k++) {                                                                  // brass nozzle cluster
      const a = k / 6 * Math.PI * 2;
      body.add(zcyl(0.011, 0.16, 0.205, Math.cos(a) * 0.026, YC + Math.sin(a) * 0.026, 10), C.brass, M.satin);
    }
    body.add(zcyl(0.014, 0.16, 0.205, 0, YC, 10), C.black, M.satin);
    // rear plunger: rod + T handle
    body.add(zcyl(0.007, -0.15, -0.07, 0, YC, 8), C.steel, M.satin);
    body.add(xcyl(0.011, -0.04, 0.04, YC, -0.15, 10), C.black, M.rubber);
    // top knob, ink hose down to the grip
    body.add(sphere(0.012, 0.012, 0.012, 0, YC + 0.075, 0.07), C.limb, M.satin);
    ink.add(pipe([[0, YC - 0.05, 0.02], [0.012, YC - 0.08, 0.0], [0.016, YC - 0.1, 0.02], [0, 0.04, 0.045]], 0.011, 14, 8));
  });
}

// ------------------------------------------------------------------------------------------ motion
const st8 = new WeakMap();
function bowState(ch) { let m = st8.get(ch); if (!m) st8.set(ch, m = { roll: 0 }); return m; }
export function FAMILY_POSE(ch, dt, s, C) {
  if (!MODELS[ch.weaponModel]) return;
  const m = bowState(ch); dt = Math.min(0.1, Math.max(0, dt || 0));
  m.roll = damp(m.roll, ch.grounded ? 1 : 0, 9, dt);
  ch.P[C.ANCR + 2] += GROUND_ROLL * m.roll;
}
export function bowRollSnapshot(ch) { return st8.get(ch)?.roll ?? null; }

const DRAW = 0.17;
function animateBow(w, st) {
  const c = w.def?.bowCfg, ps = w.ps; if (!c) return;
  const charge = smooth(st.charge || 0);
  // release: the string overshoots forward and rings out
  const sr = st.sinceRelease ?? 99, vib = sr < 0.4 ? Math.exp(-sr * 14) * Math.sin(sr * 70) : 0;
  const draw = DRAW * charge - 0.012 * vib;
  ps.draw = draw;
  const k = Math.hypot(c.span, draw) / c.span, a = Math.atan2(draw, c.span);
  const up = w.parts.string, lo = w.parts.stringL, nock = w.parts.nock, arr = w.parts.arrow;
  if (up) { up.rotation.x = a; up.scale.y = k; }
  if (lo) { lo.rotation.x = -a; lo.scale.y = k; }
  if (nock) nock.position.z = nock.userData.rest.z - draw;
  if (arr) arr.scale.z = 1 + draw / (c.arrowFront - c.tipZ);
}

export const MODELS = {
  's3-stringer-normal': { sourceModel: 'Wmn_Stringer_Normal', build: tri, animate: animateBow },
  's3-stringer-short': { sourceModel: 'Wmn_Stringer_Short', build: reef, animate: animateBow },
  's3-stringer-explosion': { sourceModel: 'Wmn_Stringer_Explosion', build: wellstring, animate: animateBow },
};
