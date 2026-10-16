// Brush family models and motion (Splatoon 3 Ver.11.3.0). The catalogue gives
// brushes the Roller visual family (modelKind roller); these models replace the
// drum with a real brush: handle, ferrule, natural bristles and an ink-soaked
// tip (team ink). Weapon space: handle along +Z from the right hand, the head's
// broad face lies in the X–Z plane (seen from +Y in the official renders), its
// width along X. Head widths come from BodyParam.PaintParam.WidthHalfMax in the
// 11.3.0 parameter tables on the same scale as the rollers (Splat Roller 2.8 →
// 1.2 m); everything else is read off each render relative to that width.
//
// Motion: a tap flings ink with a fast horizontal sweep across the front,
// alternating direction every swing (Wii U source bank Attack_Brush00 /
// Attack_Brush01 are the two alternating 30-frame sweeps; Inkipedia
// "S3 Painbrush demonstration.mp4" shows the head swung out to each side at hip
// height and the first Painbrush swing raised over the right shoulder);
// holding runs with the head dragged on the floor in front. The family trigger
// replaces the Roller flick that the shared `roller` visual family would play.
import { THREE, Pieces, M, V, box, sphere, zlathe, ylathe, zcyl, ycyl, ring, pipe, sweep, lathe, topSlab, slab,
  smoothOutline, part, rebuild, gripSpec, clamp, damp, smooth } from './kit.mjs';

const TAU = Math.PI * 2;
// Head width from the paint half width on the 11.3.0 tables, scaled 1.2/2.8 m per unit so the
// hand-held grips stay ~0.11 m per hand (kit scale rule); see brushes.md.
const drumWidth = halfMax => +(halfMax * 1.2 / 2.8).toFixed(3);
const GRIP_R = () => gripSpec([0, 0, -0.022], [0, 0, 1], [-0.3, 1, 0]);
const GRIP_L = z => gripSpec([0, 0, z], [0, 0, 1], [0.5, 1, 0]);

/** Brush head: natural bristle body (lathe, elliptic section) + ink cap over the tip. */
function roundHead(body, ink, z0, z1, rx, ry, bristle, inkFrom, wave = 0.025) {
  const n = 22, prof = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, z = z0 + (z1 - z0) * u;
    // narrow at the ferrule, bulging to the tip, rounded end
    const r = u < 0.999 ? Math.max(0.004, Math.sin(Math.min(1, u * 1.25) * Math.PI / 2) ** 0.8 * (0.25 + 0.75 * Math.sin(Math.min(1, u / 0.78) * Math.PI / 2)) * Math.sqrt(Math.max(0, 1 - Math.max(0, (u - 0.78) / 0.22) ** 2))) : 0;
    prof.push([r, z]);
  }
  const hair = lathe(prof, 26, v => { const a = Math.atan2(v.z, v.x); const k = 1 + 0.03 * Math.sin(a * 23); v.x *= k * rx; v.z *= k * ry; });
  body.add(hair.rotateX(Math.PI / 2).rotateZ(0), bristle, M.satin);
  const cap = lathe(prof.filter(([, z]) => z >= inkFrom - 0.05).map(([r, z]) => [r * 1.035, z]), 26, v => {
    const a = Math.atan2(v.z, v.x);
    // wavy lower edge where the ink soaks the bristles
    if (v.y < inkFrom + 0.02) v.y = Math.max(v.y, inkFrom + wave * Math.sin(a * 3) + wave * 0.5 * Math.sin(a * 7));
    v.x *= rx; v.z *= ry;
  });
  ink.add(cap.rotateX(Math.PI / 2));
}

// ------------------------------------------------------------------------------------------ Inkbrush
function inkbrush(d) {
  // Wmn_Brush_Mini: black rubber grip, curved blue open bracket, white ink
  // bottle with a blue "Inkbrush" label band and a clip, black collar, silver
  // cone ferrule, round natural-bristle head with an ink-soaked bulbous tip.
  const C = { blue: '#2b49b4', black: '#1d1d22', white: '#e9edf2', label: '#2d3fbf', steel: '#b2b7bf', bristle: '#b9692c', grey: '#8b8e94' };
  const W = drumWidth(0.6);                        // 0.257 m head width
  const body = new Pieces(), ink = new Pieces();
  body.add(zlathe([[0, -0.07], [0.012, -0.07], [0.018, -0.06], [0.018, 0.045], [0.014, 0.052], [0, 0.052]], 0, 0, 0, 14), C.black, M.rubber);
  for (let k = 0; k < 6; k++) body.add(ring(0.0182, 0.0014, 0, 0, -0.05 + k * 0.018, 'z', 4, 14), C.grey, M.rubber);
  // curved open bracket (two thin rails joined by bridges)
  const rail = sx => [[sx * 0.012, 0, 0.04], [sx * 0.014 + 0.012, 0, 0.1], [sx * 0.014 + 0.026, 0, 0.16], [sx * 0.012 + 0.02, 0, 0.22]];
  for (const sx of [-1, 1]) body.add(pipe(rail(sx), 0.0065, 18, 6), C.blue, M.satin);
  for (const z of [0.07, 0.12, 0.17]) body.add(box(0.034, 0.012, 0.01, 0.014 + (z - 0.04) * 0.08, 0, z, 0.4), C.blue, M.satin);
  // bottle + label band + clip
  body.add(zlathe([[0, 0.205], [0.034, 0.205], [0.037, 0.215], [0.037, 0.33], [0.03, 0.345], [0, 0.345]], 0.012, 0, 0, 18), C.white, M.gloss);
  body.add(zlathe([[0.0375, 0.24], [0.0375, 0.3]], 0.012, 0, 0, 18).translate(0, 0, 0), C.label, M.print);
  body.add(box(0.044, 0.024, 0.05, 0.03, 0.03, 0.235, 0.3), C.grey, M.metal);
  body.add(zlathe([[0, 0.34], [0.022, 0.34], [0.024, 0.37], [0, 0.37]], 0.012, 0, 0, 14), C.black, M.satin);
  body.add(zlathe([[0, 0.37], [0.027, 0.37], [0.023, 0.43], [0.02, 0.45], [0, 0.45]], 0.012, 0, 0, 18), C.steel, M.metal);
  const head = new Pieces(), headInk = new Pieces();
  roundHead(head, headInk, 0.44, 0.86, W * 0.5, W * 0.44, C.bristle, 0.67, 0.035);
  head.transform(g => g.translate(0.012, 0, 0)); headInk.transform(g => g.translate(0.012, 0, 0));
  return finishBrush(d, { body, ink, head, headInk, pivot: [0.012, 0, 0.45], gripL: 0.2, muzzle: [0.012, 0, 0.74] });
}

// ------------------------------------------------------------------------------------------ Octobrush
function octobrush(d) {
  // Wmn_Brush_Normal: carved wooden handle with a brass butt cap, an octopus
  // carving holding an ink glass ball in a ring, a thin ink tube to a flared
  // wooden ferrule bound with two black bands, a flat wide bristle head with an
  // ink-soaked tip.
  const C = { wood: '#7a3018', woodDark: '#4e1c0e', brass: '#c9a24a', band: '#18161a', bristle: '#e9e1c9' };
  const W = drumWidth(0.9);                        // 0.386 m head width
  const body = new Pieces(), ink = new Pieces();
  body.add(zlathe([[0, -0.1], [0.014, -0.1], [0.016, -0.08], [0, -0.08]], 0, 0, 0, 14), C.brass, M.metal);
  body.add(zlathe([[0, -0.082], [0.016, -0.082], [0.019, 0.0], [0.02, 0.12], [0.024, 0.2], [0, 0.2]], 0, 0, 0, 14), C.wood, M.gloss);
  // carving: knotted tentacles round the handle, a ring with an ink glass ball
  for (let k = 0; k < 10; k++) { const a = k * 2.3, z = 0.12 + k * 0.022; body.add(sphere(0.016, 0.014, 0.018, Math.cos(a) * 0.02, Math.sin(a) * 0.016, z, 10, 8), k % 2 ? C.wood : C.woodDark, M.gloss); }
  body.add(ring(0.04, 0.012, 0, 0, 0.33, 'y', 6, 22), C.wood, M.gloss);
  ink.add(sphere(0.028, 0.022, 0.028, 0, 0, 0.33, 14, 10));
  body.add(zlathe([[0, 0.36], [0.026, 0.36], [0.022, 0.4], [0, 0.4]], 0, 0, 0, 12), C.wood, M.gloss);
  ink.add(pipe([[0.012, 0.018, 0.36], [0.02, 0.026, 0.43], [0.02, 0.03, 0.5]], 0.0035, 10, 5));
  // flared neck and wooden ferrule (trapezoid, thin in Y), two black bands
  body.add(slab([[0.39, -0.02], [0.5, -0.03], [0.5, 0.03], [0.39, 0.02]], 0.05, 0, 0.004).rotateZ(Math.PI / 2).rotateZ(-Math.PI / 2), C.wood, M.gloss);
  body.add(topSlab([[-0.03, 0.39], [0.03, 0.39], [0.15, 0.5], [0.185, 0.69], [-0.185, 0.69], [-0.15, 0.5]], 0.06, 0, 0.006), C.wood, M.gloss);
  for (const z of [0.6, 0.635]) body.add(topSlab([[-0.19, z - 0.008], [0.19, z - 0.008], [0.19, z + 0.008], [-0.19, z + 0.008]], 0.068, 0, 0.003), C.band, M.rubber);
  // flat head: bristle slab with strand grooves, ink tip slab with a wavy edge and rounded top
  const head = new Pieces(), headInk = new Pieces();
  head.add(topSlab([[-0.17, 0.68], [0.17, 0.68], [W / 2, 0.86], [W / 2, 0.9], [-W / 2, 0.9], [-W / 2, 0.86]], 0.085, 0, 0.012), C.bristle, M.satin);
  for (let k = 0; k < 22; k++) { const x = -0.165 + k * 0.0157; head.add(box(0.004, 0.09, 0.16, x * 1.08, 0, 0.78, 0.5), '#d6ccb0', M.satin); }
  const tip = []; const n = 16;
  for (let i = 0; i <= n; i++) { const x = -W / 2 + W * i / n; tip.push([x, 0.84 + 0.022 * Math.sin(i * 1.7) + 0.012 * Math.cos(i * 3.1)]); }
  const top = smoothOutline([[W / 2 + 0.005, 0.88], [W / 2 - 0.02, 1.0], [0, 1.03], [-W / 2 + 0.02, 1.0], [-W / 2 - 0.005, 0.88]], 24).filter(([, z]) => z > 0.87);
  headInk.add(topSlab([...tip, ...top.sort((a, b) => b[0] - a[0])], 0.105, 0, 0.022));
  return finishBrush(d, { body, ink, head, headInk, pivot: [0, 0, 0.69], gripL: 0.17, muzzle: [0, 0, 0.92] });
}

// ------------------------------------------------------------------------------------------ Painbrush
function painbrush(d) {
  // Wmn_Brush_Heavy: tapered wooden grip with a blue ring, an S-shaped steel
  // crank, a round polished body with a big knurled screw cap on its +Y face, a
  // neck into a logo plate, and a flat fan of white radial bristles inside a
  // thick ink rim with a notch at the top.
  const C = { steel: '#c9ccd2', dark: '#7d8088', wood: '#7b2f1d', blue: '#2f4fd0', bristle: '#efebe2', gold: '#c7a042' };
  const W = drumWidth(1.3);                        // 0.557 m fan width
  const body = new Pieces(), ink = new Pieces();
  body.add(zlathe([[0, -0.1], [0.012, -0.1], [0.018, -0.08], [0.023, 0.1], [0.018, 0.13], [0, 0.13]], 0, 0, 0, 14), C.wood, M.gloss);
  body.add(zcyl(0.017, 0.125, 0.14, 0, 0, 12), C.blue, M.gloss);
  body.add(sweep([V(0, 0, 0.13), V(0, 0, 0.17), V(-0.05, 0, 0.2), V(-0.075, 0, 0.24), V(-0.075, 0, 0.31)].map(p => p), { seg: 18, radial: 10, capSteps: 2, radius: () => 0.013, flat: 1.4, outward: (_P, o) => o.set(0, 1, 0) }).geo, C.steel, M.gloss);
  // round body (pear-shaped, thicker in Y) and knurled cap on +Y
  body.add(sphere(0.12, 0.085, 0.13, -0.05, 0, 0.39, 22, 14), C.steel, M.gloss);
  body.add(ylathe([[0, 0], [0.085, 0], [0.09, 0.012], [0.09, 0.05], [0.08, 0.06], [0, 0.062]], -0.06, 0.06, 0.38, 24), C.steel, M.gloss);
  for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; body.add(box(0.006, 0.04, 0.006, -0.06 + Math.cos(a) * 0.09, 0.09, 0.38 + Math.sin(a) * 0.09, 0.5), C.dark, M.metal); }
  body.add(ring(0.087, 0.004, -0.06, 0.07, 0.38, 'y', 4, 24), C.gold, M.metal);
  body.add(ylathe([[0, 0], [0.05, 0], [0.04, -0.03], [0, -0.035]], -0.06, -0.08, 0.38, 18), C.steel, M.gloss);
  // neck and logo plate
  body.add(zlathe([[0, 0.46], [0.07, 0.46], [0.05, 0.56], [0.045, 0.62], [0, 0.62]], -0.035, 0, 0, 18), C.steel, M.gloss);
  body.add(ring(0.047, 0.004, -0.035, 0, 0.6, 'z', 4, 18), C.dark, M.metal);
  body.add(topSlab(smoothOutline([[-0.06, 0.6], [0.04, 0.6], [0.075, 0.68], [0.06, 0.74], [-0.13, 0.74], [-0.14, 0.68]], 24), 0.06, 0, 0.012), C.steel, M.gloss);
  // fan head: radial bristles + ink rim (two lobes, notch near the top)
  const head = new Pieces(), headInk = new Pieces(), cx = -0.035, cz = 0.7, R = W / 2;
  const fan = (r0, r1, a0, a1, notch) => {
    const out = [], n = 30;
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; const dip = notch ? 0.07 * Math.exp(-(((a - 0.16) / 0.07) ** 2)) : 0; out.push([cx + Math.sin(a) * (r1 - dip), cz + Math.cos(a) * (r1 - dip) * 0.92]); }
    for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.sin(a) * r0, cz + Math.cos(a) * r0 * 0.92]); }
    return out;
  };
  head.add(topSlab(fan(0.05, R * 0.8, -1.45, 1.45, false), 0.035, 0, 0.006), C.bristle, M.satin);
  for (let k = 0; k <= 22; k++) { const a = -1.4 + 2.8 * k / 22; head.add(pipe([[cx + Math.sin(a) * 0.08, 0, cz + Math.cos(a) * 0.075], [cx + Math.sin(a) * R * 0.78, 0, cz + Math.cos(a) * R * 0.72]], 0.006, 4, 4), '#d8d3c8', M.satin); }
  headInk.add(topSlab(fan(R * 0.66, R, -1.5, 1.5, true), 0.075, 0, 0.018));
  return finishBrush(d, { body, ink, head, headInk, pivot: [cx, 0, 0.72], gripL: 0.17, muzzle: [cx, 0, 0.92] });
}

function finishBrush(d, { body, ink, head, headInk, pivot, gripL, muzzle }) {
  rebuild(d, {
    body, ink, gripR: GRIP_R(), gripL: GRIP_L(gripL), muzzle, drop: ['drum'],
    // the head flexes about the ferrule as it sweeps or drags (own channels)
    parts: { head: part(head, pivot), headInk: part(headInk, pivot, 'ink') },
  });
  d.fold = null;            // a brush has no Roller middle hinge
  return d;
}

// ------------------------------------------------------------------------------------------ motion
// Per weapon: sweep (s), first-swing windup pose, head length (grip → tip, m),
// support hand reach. Sweep times follow the swing cadence (Ver.11.0/11.1
// community tables: 7 / 11 / 14 F between swings) inside the 30-frame source
// clips' ~8-frame crossing; the hold / return times are INKWAVE calibration.
const BRUSH = {
  's3-brush-mini': { sweep: 6 / 60, tip: 0.84, thick: 0.08 },
  's3-brush-normal': { sweep: 9 / 60, tip: 1.02, thick: 0.05 },
  's3-brush-heavy': { sweep: 12 / 60, tip: 0.95, thick: 0.035 },
};
const HOLD_END = 0.16, RETURN = 0.22, SIDE = 1.15;
const state = new WeakMap();
const mix = (a, b, t) => a + (b - a) * t;
function brushState(ch) {
  let m = state.get(ch);
  if (!m) state.set(ch, m = { count: -1, age: 99, windup: 0, dir: 1, from: -1, side: -1, w: 0, since: 99, bend: 0, vel: 0, corr: 0 });
  return m;
}
function startSwing(m, windup) {
  // alternate: a swing starts on the side the previous one ended on
  m.dir = m.since < 0.7 ? -m.dir : 1;      // 1: right → left, -1: left → right
  m.age = 0; m.windup = Math.max(0, windup); m.since = 0;
}
/** Read-only view for regressions. */
export function brushMotionSnapshot(ch) {
  const m = state.get(ch);
  return m ? { corr: m.corr, dir: m.dir, age: m.age, windup: m.windup, weight: m.w, bend: m.bend } : null;
}

export function FAMILY_TRIGGER(ch, name) {
  if (name !== 'shoot') return false;
  // The shared roller kind would start the Roller flick: a brush sweeps instead.
  const r = ch._runner?.(), m = brushState(ch);
  if (!r?.catalogState || r.a?.remote) { if (m.age > 0.05) startSwing(m, 0); }
  return true;
}

const _anc = new Float64Array(3), _rot = new Float64Array(3);
export function FAMILY_POSE(ch, dt, s, C) {
  const cfg = BRUSH[ch.weapon?.def?.modelId] || BRUSH[ch.weaponModel];
  if (!cfg) return;
  const m = brushState(ch), r = ch._runner?.(s), cs = r?.catalogState;
  dt = Math.min(0.1, Math.max(0, dt || 0));
  if (cs && !r.a?.remote) {
    if (m.count < 0) m.count = cs.swingCount;
    if (cs.swingCount > m.count) { m.count = cs.swingCount; startSwing(m, cs.pending ? cs.pending.remaining : 0); }
    else if (cs.swingCount < m.count) m.count = cs.swingCount;
  }
  m.age += dt; m.since += dt;
  // Dragging keeps the ink tip on the floor. This layer cannot see the crouch
  // and lean applied after it, so last frame's rendered tip height trims the
  // drag pitch (ground = the actor's feet).
  const w0 = ch.weapon, own = ch._owner?.();
  if ((ch.wRoll || 0) > 0.3 && ch.grounded && w0?.off && own?.pos) {
    _tip.set(w0.def.muzzle.x, -cfg.thick, cfg.tip).applyMatrix4(w0.off.matrixWorld);
    const err = _tip.y - (own.pos.y + 0.015);
    if (Math.abs(err) < 1) m.corr = clamp(m.corr + err / cfg.tip * Math.min(1, dt * 12), -0.7, 0.5);
  } else m.corr = damp(m.corr, 0, 1.5, dt);
  if (!(ch.kidForm && !ch.dance && (ch.wSub || 0) <= 0.01)) { m.w = 0; return; }
  const P = ch.P, roll = clamp(ch.wRoll || 0);
  // carry: brush low at the right side, head just off the floor ahead-right
  const L = cfg.tip, hc = 0.72, pitchC = Math.asin(clamp((hc - 0.26) / L, 0, 0.98));
  // drag: both hands low in front, the ink tip on the floor
  const hr = 0.66, pitchR = Math.asin(clamp((hr - 0.26) / L, 0, 0.98));
  _anc[0] = mix(-0.2, -0.06, roll); _anc[1] = mix(hc, hr, roll); _anc[2] = mix(0.12, 0.3, roll);
  _rot[0] = mix(pitchC, pitchR + m.corr, roll); _rot[1] = mix(-0.62, 0.02, roll); _rot[2] = 0;
  // swing: windup (first heavy swing) → sweep across → hold at the far side → return
  const t = m.age - m.windup, sw = cfg.sweep;
  let k = 0, phi = 0, up = 0;
  if (m.age < m.windup) {                  // raise over the right shoulder
    const u = smooth(m.age / Math.max(1e-3, m.windup));
    k = u; phi = -m.dir * SIDE * 1.1; up = u;
  } else if (t < sw + HOLD_END + RETURN) {
    const u = clamp(t / sw), e = u * u * (3 - 2 * u);
    phi = mix(-m.dir * SIDE, m.dir * SIDE, e);
    k = t < sw + HOLD_END ? 1 : 1 - smooth((t - sw - HOLD_END) / RETURN);
    m.vel = t < sw ? m.dir * (6 * u * (1 - u)) * SIDE * 2 / sw : 0;
  } else m.vel = 0;
  m.w = damp(m.w, k, 40, dt);
  const w = Math.min(m.w, k > m.w ? 1 : m.w);
  if (w > 0.001) {
    const sx = Math.sin(phi), cx = Math.cos(phi);
    // hands sweep with the brush in front of the chest; the head is out at hip height
    const ax = -0.03 + 0.1 * sx, ay = mix(0.86, 1.12, up), az = 0.1 + 0.12 * cx;
    const pitch = mix(0.32, -1.0, up), yaw = phi, rl = mix(1.35, 0.6, up);
    _anc[0] = mix(_anc[0], ax, w); _anc[1] = mix(_anc[1], ay, w); _anc[2] = mix(_anc[2], az, w);
    _rot[0] = mix(_rot[0], pitch, w); _rot[1] = mix(_rot[1], yaw, w); _rot[2] = mix(_rot[2], rl, w);
    P[C.CHEST + 1] += 0.34 * sx * w; P[C.SPINE + 1] += 0.18 * sx * w; P[C.HIPS + 1] += 0.08 * sx * w;
    P[C.SPINE] += 0.06 * w; P[C.HIPS_P + 1] -= 0.02 * w;
  }
  for (let i = 0; i < 3; i++) { P[C.ANC + i] = _anc[i]; P[C.ANCR + i] = _rot[i]; }
  // one hand carries; both hands sweep and drag (Octobrush / Painbrush promotional art)
  P[C.IKR] = Math.max(P[C.IKR], 1); P[C.IKL] = Math.max(roll, w > 0.001 ? w : 0);
  if (roll > 0.001) { P[C.SPINE] += 0.12 * roll; P[C.CHEST] += 0.06 * roll; P[C.HIPS_P + 1] -= 0.03 * roll; }
}

/** Head flex: bristles trail the sweep and drag back on the floor while running. */
function animateHead(w, st) {
  const ch = st.runner?.a?.character, m = ch ? state.get(ch) : null, dt = Math.min(0.1, Math.max(0, st.dt || 0));
  const roll = clamp(st.rolling || 0);
  const want = (m ? clamp(-m.vel * 0.02, -0.35, 0.35) : 0) + 0.16 * roll * clamp((st.groundSpeed || 0) / 3);
  w.brushBend = damp(w.brushBend || 0, want, 18, dt);
  if (m) m.bend = w.brushBend;
  const head = w.parts.head, inkHead = w.parts.headInk;
  if (head) head.rotation.x = w.brushBend;
  if (inkHead) inkHead.rotation.x = w.brushBend;
}
const _tip = new THREE.Vector3();

export const MODELS = {
  's3-brush-mini': { sourceModel: 'Wmn_Brush_Mini', build: inkbrush, animate: animateHead },
  's3-brush-normal': { sourceModel: 'Wmn_Brush_Normal', build: octobrush, animate: animateHead },
  's3-brush-heavy': { sourceModel: 'Wmn_Brush_Heavy', build: painbrush, animate: animateHead },
};
