// Splatana family models and motion (Splatoon 3 Ver.11.3.0). The catalogue gives splatanas the Shooter
// visual family (modelKind shooter, native one-handed-capable pistol HOLD). These models replace the gun
// with a wiper-style blade held by a straight handle. Weapon space: handle and blade lie along +Z
// (handle z -0.07..0.05, blade beyond), the blade's broad face is the Y-Z plane (as seen in the official
// side render, blade pointing right), team ink runs along the squeegee edge (-Y side).
//
// Motion: FAMILY_TRIGGER consumes 'shoot' (no Shooter recoil). FAMILY_POSE reads the WeaponRunner's
// catalogState (pending / melee / chargeF) and plays
//   * while charging: the blade is raised over the right shoulder in proportion to the charge,
//   * a tap (uncharged release): a horizontal slash from the right to the left,
//   * a full-charge release: from the raised guard a vertical downward slash.
// Swing lengths are the WeakSwingFrame / ChargeSwingFrame values of the 11.3.0 tables; the curves are
// INKWAVE calibration (no frame data for the real animation is published, 未確認).
import { THREE, Pieces, M, V, box, sphere, zlathe, zcyl, xcyl, ring, pipe, slab, part, rebuild, gripSpec, clamp, damp, smooth } from './kit.mjs';

const HANDLE_GRIP = () => gripSpec([0, 0, -0.01], [0, 0, 1], [-0.3, 1, 0]);

/** Squeegee blade: side-profile slab plus a team-ink strip along the cutting edge (-Y side). */
function blade(body, ink, o) {
  const { z0, z1, h0, h1, thick, col, edgeCol = col } = o;
  const prof = [[z0, -h0], [z1 - 0.02, -h1], [z1, -h1 * 0.4], [z1, h1 * 0.6], [z1 - 0.02, h1], [z0, h0]];
  body.add(slab(prof, thick, 0, 0.003), col, M.satin);
  const e = [[z0 + 0.01, -h0 - 0.006], [z1 - 0.018, -h1 - 0.006], [z1 + 0.002, -h1 * 0.4 - 0.004], [z1 + 0.002, -h1 * 0.4 + 0.006], [z1 - 0.018, -h1 + 0.004], [z0 + 0.01, -h0 + 0.004]];
  ink.add(slab(e, thick * 0.9, 0, 0.0015));
  void edgeCol;
}

// ------------------------------------------------------------------------------------------ Splatana Stamper
function stamper(d) {
  // Wmn_Saber_Normal: dark-blue handle, grey metal blade holder with a round black wiper wheel + bolt,
  // white rubber squeegee with a ribbed comb along the back.
  const C = { blue: '#26346f', steel: '#6f737b', white: '#ecebe6', black: '#1a1a1d' };
  const body = new Pieces(), ink = new Pieces();
  body.add(zlathe([[0, -0.07], [0.017, -0.07], [0.02, -0.05], [0.017, 0.035], [0.012, 0.05], [0, 0.05]], 0, 0, 0, 16), C.blue, M.rubber);
  body.add(slab([[0.04, -0.03], [0.34, -0.02], [0.36, 0.0], [0.34, 0.03], [0.04, 0.03], [0.02, 0.0]], 0.012, 0.006, 0.002), C.steel, M.satin);
  body.add(xcyl(0.034, -0.026, -0.004, 0.0, 0.07, 18), C.black, M.rubber);          // wiper wheel
  body.add(xcyl(0.012, -0.03, 0.0, 0.0, 0.07, 10), C.steel, M.satin);
  blade(body, ink, { z0: 0.06, z1: 0.36, h0: 0.028, h1: 0.034, thick: 0.014, col: C.white });
  for (let k = 0; k < 6; k++) body.add(box(0.016, 0.014, 0.03, 0, 0.034 + 0.002, 0.1 + k * 0.045, 0.2), C.white, M.satin);   // comb teeth
  return rebuild(d, { body, ink, gripR: HANDLE_GRIP(), gripL: gripSpec([0, 0, -0.05], [0, 0, 1], [0.5, 1, 0]), muzzle: [0, 0, 0.36] });
}

// ------------------------------------------------------------------------------------------ Splatana Wiper
function wiper(d) {
  // Wmn_Saber_Light: black rod handle with a wire spring and a loop, long slim white squeegee blade in a
  // black wiper frame with a thin wire bail.
  const C = { black: '#1a1a1d', white: '#eeeeea', steel: '#b8bcc4' };
  const body = new Pieces(), ink = new Pieces();
  body.add(zlathe([[0, -0.07], [0.012, -0.07], [0.014, -0.05], [0.014, 0.04], [0.008, 0.06], [0, 0.06]], 0, 0, 0, 14), C.black, M.rubber);
  for (let k = 0; k < 6; k++) body.add(ring(0.016, 0.0016, 0, 0, -0.06 + k * 0.012, 'z', 4, 12), C.steel, M.satin);   // coil spring
  body.add(box(0.012, 0.012, 0.1, 0, 0.0, 0.1, 0.3), C.black, M.satin);               // wiper arm
  body.add(slab([[0.06, -0.012], [0.4, -0.018], [0.4, 0.02], [0.06, 0.016]], 0.014, 0, 0.002), C.black, M.satin);   // frame
  blade(body, ink, { z0: 0.06, z1: 0.4, h0: 0.014, h1: 0.016, thick: 0.01, col: C.white });
  body.add(pipe([[0.0, 0.0, 0.06], [0.0, 0.05, 0.08], [0.0, 0.052, 0.2], [0.0, 0.03, 0.34]], 0.0014, 14, 4), C.steel, M.satin);   // wire bail
  return rebuild(d, { body, ink, gripR: HANDLE_GRIP(), gripL: gripSpec([0, 0, -0.045], [0, 0, 1], [0.5, 1, 0]), muzzle: [0, 0, 0.4] });
}

// ------------------------------------------------------------------------------------------ Mint Decavitator
function decavitator(d) {
  // Wmn_Saber_Heavy: toothpaste-tube blade (clear tube, printed label, blue screw cap), white handle with a
  // light-blue collar and a finger ring; the squeegee edge is the ink-filled bristle side.
  const C = { white: '#eceef0', blue: '#58c1e8', clear: '#d9e6ea', label: '#243a8f' };
  const body = new Pieces(), ink = new Pieces();
  body.add(zlathe([[0, -0.08], [0.018, -0.08], [0.022, -0.04], [0.02, 0.03], [0.026, 0.06], [0, 0.06]], 0, 0, 0, 18), C.white, M.satin);
  body.add(ring(0.032, 0.0055, 0, 0, 0.04, 'z', 5, 24), C.blue, M.satin);                     // collar
  body.add(ring(0.016, 0.0025, 0.0, 0.04, -0.06, 'x', 4, 16), C.white, M.satin);              // finger ring
  body.add(zlathe([[0, 0.05], [0.036, 0.05], [0.038, 0.1], [0.038, 0.32], [0.03, 0.34], [0, 0.34]], 0, 0.0, 0, 20), C.clear, M.gloss);   // tube
  body.add(box(0.078, 0.05, 0.16, 0, 0.0, 0.2, 0.25), C.label, M.print);                      // label (print)
  body.add(zlathe([[0, 0.34], [0.04, 0.34], [0.04, 0.37], [0.03, 0.375], [0, 0.375]], 0, 0, 0, 14), C.blue, M.satin);   // cap
  ink.add(slab([[0.07, -0.032], [0.33, -0.036], [0.33, -0.026], [0.07, -0.022]], 0.03, 0, 0.002));   // ink edge along the tube
  return rebuild(d, { body, ink, gripR: HANDLE_GRIP(), gripL: gripSpec([0, 0, -0.06], [0, 0, 1], [0.5, 1, 0]), muzzle: [0, 0, 0.375] });
}

// ------------------------------------------------------------------------------------------ motion
// swing durations (s): weak / charge, the WeakSwingFrame / ChargeSwingFrame values at 60 fps
const SABER = { 's3-saber-normal': { tap: 26 / 60, full: 22 / 60 }, 's3-saber-lite': { tap: 16 / 60, full: 22 / 60 }, 's3-saber-heavy': { tap: 30 / 60, full: 32 / 60 } };
const state = new WeakMap();
function sabState(ch) { let m = state.get(ch); if (!m) state.set(ch, m = { age: 99, full: false, dur: 0.3, was: false, chg: 0, raise: 0, side: 1, k: 0 }); return m; }
export function sabreSnapshot(ch) { const m = state.get(ch); return m ? { age: m.age, full: m.full, raise: m.raise, k: m.k } : null; }

export function FAMILY_TRIGGER(ch, name) {
  // the shooter recoil is replaced by the slash played from catalogState (nothing to start here)
  return name === 'shoot';
}

const mix = (a, b, t) => a + (b - a) * t;
export function FAMILY_POSE(ch, dt, s, C) {
  const cfg = SABER[ch.weaponModel]; if (!cfg) return;
  const m = sabState(ch), r = ch._runner?.(s), cs = r?.catalogState;
  dt = Math.min(0.1, Math.max(0, dt || 0));
  const busy = !!cs && !!(cs.pending || cs.melee);
  if (busy && !m.was) {                         // release: a swing starts
    m.age = 0; m.full = m.chg > 0.97; m.dur = m.full ? cfg.full : cfg.tap; m.side = -m.side;
  }
  m.was = busy;
  m.age += dt;
  const charge = r && !busy ? clamp(r.charge || 0) : 0;
  if (!busy && r) m.chg = clamp(r.charge || 0);
  m.raise = damp(m.raise, m.full && m.age < 0.1 ? 1 : charge, 18, dt);
  if (!(ch.kidForm && !ch.dance && (ch.wSub || 0) <= 0.01)) { m.k = 0; return; }
  const P = ch.P, u = m.age / (m.dur + 0.12);       // 0..1 over the swing plus a short follow-through
  let k = 0, yaw = 0, pitch = 0, lift = 0, x = 0;
  if (u < 1) {
    const ee = smooth((u - 0.12) / 0.4);                // sweep 12..52 % of the swing
    k = Math.min(1, u * 8) * (1 - smooth((u - 0.6) / 0.4));
    if (m.full) { pitch = mix(-1.15, 0.55, ee); lift = mix(0.14, -0.05, ee); }       // raised guard → vertical chop
    else { yaw = mix(-0.9, 0.9, ee); x = mix(-0.08, 0.1, ee); pitch = 0.1; }          // right → left horizontal slash
  }
  m.k = k;
  const rs = smooth(m.raise);                           // charging guard
  const w = k;
  P[C.ANC] += x * w; P[C.ANC + 1] += lift * w + 0.12 * rs * (1 - w); P[C.ANC + 2] += 0.02 * w;
  P[C.ANCR] += pitch * w - 1.0 * rs * (1 - w);
  P[C.ANCR + 1] += yaw * w;
  P[C.ANCR + 2] += -0.5 * rs * (1 - w);
  P[C.CHEST + 1] += 0.3 * yaw * w; P[C.SPINE + 1] += 0.15 * yaw * w; P[C.SPINE] += 0.12 * (m.full ? pitch : 0) * w;
  P[C.IKL] = 0;                                         // a splatana is a one-handed weapon
}

const holdBase = { carry: { p: [-0.18, 0.78, 0.14], r: [0.35, 0.12, -0.1] }, twoCarry: 0, twoAim: 0 };
export const MODELS = {
  's3-saber-normal': { sourceModel: 'Wmn_Saber_Normal', build: stamper, hold: holdBase },
  's3-saber-lite': { sourceModel: 'Wmn_Saber_Light', build: wiper, hold: holdBase },
  's3-saber-heavy': { sourceModel: 'Wmn_Saber_Heavy', build: decavitator, hold: holdBase },
};
