// Roller family models (Splatoon 3 Ver.11.3.0). Shapes follow the official
// per-weapon 3D renders, the Inkipedia turntable videos and the Splat Roller
// promotional render. Weapon space: the handle runs along +Z from the right
// hand, the drum axis lies along X, the frame lies in the X–Z plane (the
// renders show handle, frame and drum in one plane, seen from +Y), the holder's
// right = −X. Drum widths come from the 11.3.0 parameter tables
// (BodyParam.PaintParam.WidthHalfMax, scaled so the Splat Roller drum is 1.5 m, inside the
// roller.test proportion bands); other sizes are read off each render relative to that
// drum. Internal model names: Leanny/splat3 ActorInfo (Fmdb).
import { THREE, Pieces, M, V, box, sphere, xlathe, zlathe, ylathe, zcyl, xcyl, ycyl, cyl, ring, pipe, sweep, lathe,
  part, rebuild, gripSpec, clamp, damp, smooth, slab } from './kit.mjs';

const TAU = Math.PI * 2;
// Native Roller grips (character-weapons.js buildRoller): every pose layer in
// roller.mjs / roller-detail-motion.mjs is calibrated on this right-hand frame,
// so models keep it and place their handle around it.
const GRIP_R = () => gripSpec([0, 0, -0.022], [0, 0, 1], [-0.3, 1, 0]);
const GRIP_L = z => gripSpec([0, 0, z], [0, 0, 1], [0.5, 1, 0]);
/** Paint half width (BodyParam.PaintParam.WidthHalfMax) → drum width, Splat Roller 2.8 → 1.5 m. */
export const drumWidth = halfMax => +(halfMax * 1.5 / 2.8).toFixed(3);

// ------------------------------------------------------------------------------------------ helpers
/** Rounded-square tube through points; w = size along Y (up), h = size across. */
function bar(points, w, h, seg = 12, p = 0.28) {
  return sweep(points.map(q => (q.isVector3 ? q.clone() : V(...q))), {
    seg, radial: 12, capSteps: 2, radius: () => h / 2, flat: w / h,
    outward: (_P, o) => o.set(0, 1, 0),
    section: (c, s) => [Math.sign(c) * Math.abs(c) ** p, Math.sign(s) * Math.abs(s) ** p],
  }).geo;
}
/** Drum (axis X, centred at the origin): rounded ends, optional dimples / ribs / steps. */
function drumGeo(W, r, { dimples = 0, ribs = 0, step = null, seg = 28, rows = 30 } = {}) {
  const h = W / 2, e = Math.min(r * 0.18, 0.03), prof = [];
  prof.push([0, -h], [r * 0.6, -h], [r - e * 0.6, -h + e * 0.15], [r, -h + e]);
  for (let i = 1; i < rows; i++) {
    const y = -h + e + (W - 2 * e) * i / rows;
    let rr = r;
    if (step) rr = y < step.at ? r : step.r, rr = Math.abs(y - step.at) < 0.02 ? (r + step.r) / 2 : rr;
    prof.push([rr, y]);
  }
  prof.push([step ? r : r, h - e], [r - e * 0.6, h - e * 0.15], [r * 0.6, h], [0, h]);
  const g = lathe(prof, seg, v => {
    const a = Math.atan2(v.z, v.x), rr = Math.hypot(v.x, v.z);
    if (rr < r * 0.8) return;
    let k = 1;
    if (dimples) {           // round dents in staggered rows
      const n = dimples, u = (v.y + h) / W * n, row = Math.floor(u), fu = u - row - 0.5;
      const fa = ((a / TAU * 6 + (row % 2) * 0.5) % 1 + 1) % 1 - 0.5;
      const d2 = (fu * 1.1) ** 2 + (fa * 1.0) ** 2;
      k -= 0.045 * Math.max(0, 1 - d2 / 0.09);
    }
    if (ribs) k += 0.035 * Math.max(0, Math.cos(a * ribs.n)) * smooth((v.y - ribs.from) / 0.05) * (ribs.wave ? (0.6 + 0.4 * Math.sin(v.y * 40 + a * 2)) : 1);
    v.x *= k; v.z *= k;
  });
  return g.rotateZ(-Math.PI / 2);   // lathe Y → weapon X
}
/** End rim (spins with the drum) at x, facing ±X. */
function rim(p, x, r, w, color, mat = M.gloss) {
  p.add(xlathe([[r * 0.82, -w / 2], [r * 1.02, -w / 2], [r * 1.05, 0], [r * 1.02, w / 2], [r * 0.82, w / 2]], x, 0, 0, 24), color, mat);
}
function capDisc(p, x, sx, r, color, mat = M.gloss) {
  p.add(xlathe([[0, 0], [r, 0], [r, 0.012], [r * 0.7, 0.02], [0, 0.022]].map(([a, b]) => [a, sx * b]), x, 0, 0, 20), color, mat);
}
/** A fold (middle hinge) pivot for roller-fold.mjs at this model's real hinge. */
function setFold(d, pivot) {
  if (d.fold) d.fold.pivot = V(...pivot);
  return d;
}

// ------------------------------------------------------------------------------------------ Splat Roller
function splatRoller(d) {
  // Wmn_Roller_NormalT: black rubber grip, square purple tube, ink bottle with a
  // yellow strap and blue nozzle, hinge bolt, black sheathed bend, purple arm
  // running parallel to the drum with a black pad + yellow clip, C hook into the
  // drum's left (+X) end; right (−X) end: blue cap, nut and wire pin.
  const C = { purple: '#4b31c8', yellow: '#f2bf2c', blue: '#2f63e2', black: '#1f2025', metal: '#b9bdc6', rubber: '#2b2c30' };
  const W = drumWidth(2.8), r = 0.152, dz = 0.96, dx = 0, hz = 0.66, az = 0.705;
  const body = new Pieces(), ink = new Pieces(), arm = new Pieces(), caps = new Pieces();
  // grip + ferrule
  body.add(zlathe([[0, -0.112], [0.012, -0.112], [0.0175, -0.104], [0.0175, 0.205], [0.019, 0.212], [0, 0.215]], 0, 0, 0, 14), C.rubber, M.rubber);
  for (let k = 0; k < 9; k++) body.add(ring(0.0178, 0.0016, 0, 0, -0.085 + k * 0.03, 'z', 4, 14), C.black, M.rubber);
  body.add(zlathe([[0.0, 0.205], [0.021, 0.205], [0.021, 0.24], [0, 0.24]], 0, 0, 0, 12), C.purple, M.satin);
  body.add(ring(0.012, 0.0025, -0.024, 0, 0.2, 'x', 4, 12), C.metal, M.metal);           // lanyard eyelet
  // square shaft and the hinge clevis
  body.add(bar([[0, 0, 0.21], [0, 0, hz - 0.01]], 0.036, 0.04), C.purple, M.satin);
  body.add(box(0.05, 0.05, 0.05, 0, 0, hz, 0.4), C.purple, M.satin);
  for (const sy of [-1, 1]) body.add(ycyl(0.016, 0, sy * 0.032, 0, hz, 16).translate(0, 0, 0), C.black, M.gloss);
  // ink bottle (team ink) on the shaft, blue nozzle toward the grip, yellow wavy strap
  const by = 0.072, bz = 0.43, bl = 0.15, br = 0.066;
  ink.add(zlathe([[0, -bl], [br * 0.55, -bl + 0.004], [br * 0.92, -bl + 0.03], [br, -bl + 0.07], [br, bl - 0.06], [br * 0.9, bl - 0.02], [br * 0.55, bl], [0, bl + 0.004]], -0.01, by, bz, 20));
  body.add(zlathe([[0, 0], [0.026, 0], [0.024, 0.02], [0.011, 0.05], [0, 0.056]].map(([a, b]) => [a, -b]), -0.01, by, bz - bl, 12), C.blue, M.gloss);
  for (let k = 0; k < 3; k++) body.add(ring(0.024 - k * 0.004, 0.0022, -0.01, by, bz - bl - 0.008 - k * 0.012, 'z', 4, 14), C.blue, M.gloss);
  const strap = []; for (let k = 0; k <= 16; k++) { const u = k / 16, a = Math.PI * (0.15 + 0.7 * Math.sin(u * Math.PI * 2.2)); strap.push([-0.01 + Math.cos(a) * (br + 0.004), by + Math.sin(a) * (br + 0.004), bz - bl + 0.04 + u * (2 * bl - 0.08)]); }
  body.add(pipe(strap, 0.006, 40, 6), C.yellow, M.gloss);
  for (const z of [bz - bl + 0.05, bz + bl - 0.05]) body.add(ring(br + 0.003, 0.006, -0.01, by, z, 'z', 5, 22), C.yellow, M.gloss);
  body.add(box(0.03, 0.04, 0.2, -0.004, 0.034, bz, 0.4), C.purple, M.satin);           // bottle saddle
  // roller side of the hinge: black sheathed bend, arm, pad, clip, C hook to the +X axle
  arm.add(pipe([[0, 0, hz + 0.02], [0.012, 0, hz + 0.042], [0.05, 0, az - 0.002], [0.1, 0, az]], 0.0145, 16, 10), C.black, M.rubber);
  arm.add(bar([[0.095, 0, az], [W / 2 + dx - 0.08, 0, az]], 0.036, 0.034), C.purple, M.satin);
  const hook = [[W / 2 + dx - 0.085, 0, az], [W / 2 + dx - 0.01, 0, az + 0.006], [W / 2 + dx + 0.065, 0, az + 0.06], [W / 2 + dx + 0.075, 0, dz - 0.07],
    [W / 2 + dx + 0.055, 0, dz - 0.008], [W / 2 + dx + 0.02, 0, dz]];
  arm.add(bar(hook, 0.034, 0.032, 24), C.purple, M.satin);
  arm.add(xcyl(0.024, W / 2 + dx + 0.004, W / 2 + dx + 0.028, 0, dz, 16), C.metal, M.metal);        // axle nut
  arm.add(box(0.24, 0.032, 0.07, 0.36, 0.034, az + 0.012, 0.3), C.black, M.rubber);                 // black pad
  arm.add(box(0.03, 0.06, 0.055, 0.48, 0.006, az, 0.35), C.yellow, M.gloss);                         // yellow clip
  arm.add(zcyl(0.007, az - 0.05, az - 0.03, 0.48, 0.0, 10), C.black, M.metal);
  // drum caps (spin with the drum): yellow rims both ends, blue cap + nut + wire pin at −X
  rim(caps, -W / 2 + 0.012, r, 0.026, C.yellow); rim(caps, W / 2 - 0.012, r, 0.026, C.yellow);
  capDisc(caps, -W / 2, -1, r * 0.82, C.blue); capDisc(caps, W / 2, 1, r * 0.82, C.yellow);
  // stationary axle through the drum: nut and wire cotter pin at the −X end (frame side, not spinning)
  arm.add(xcyl(0.012, -W / 2 - 0.03, W / 2 + 0.01, 0, dz, 10), C.metal, M.metal);
  arm.add(xlathe([[0, 0], [0.03, 0], [0.03, -0.018], [0.018, -0.03], [0, -0.03]], -W / 2 - 0.015, 0, dz, 12), C.metal, M.metal);
  for (const s of [-1, 1]) arm.add(pipe([[-W / 2 - 0.04, 0, dz], [-W / 2 - 0.07, s * 0.01, dz + 0.012], [-W / 2 - 0.095, s * 0.02, dz - 0.005], [-W / 2 - 0.07, s * 0.012, dz - 0.02], [-W / 2 - 0.045, 0, dz - 0.01]], 0.0028, 20, 5), C.metal, M.metal);
  const drum = new Pieces().add(drumGeo(W, r, { dimples: 9 }), '#ffffff');
  rebuild(d, {
    body, ink, parts: { hinge: part(arm, [0, 0, hz]), hingeInk: part(new Pieces(), [0, 0, hz], 'ink') },
    gripR: GRIP_R(), gripL: GRIP_L(0.175), muzzle: [dx, 0, dz],
    drum: { geo: drum, caps, at: [dx, 0, dz], r },
  });
  return setFold(d, [0, 0, hz]);
}

// ------------------------------------------------------------------------------------------ Carbon Roller
function carbonRoller(d) {
  // Wmn_Roller_Compact: slim drum with raised rounded slots, yellow tube frame
  // under the drum from axle to axle with a black carbon deck, central T mount,
  // short handle: canister with a red lanyard loop, black D grip with a yellow
  // carabiner loop at the butt.
  const C = { yellow: '#f2a92a', black: '#1c1c20', carbon: '#2a2b30', grey: '#8f8d86', red: '#e9384e', metal: '#b8bcc4' };
  const W = drumWidth(2.2), r = 0.115, dz = 0.62, fz = 0.47, hz = 0.395;
  const body = new Pieces(), frame = new Pieces(), caps = new Pieces();
  // D grip and carabiner
  body.add(zlathe([[0, -0.06], [0.014, -0.06], [0.0175, -0.05], [0.0175, 0.1], [0.02, 0.108], [0, 0.11]], 0, 0, 0, 14), C.black, M.rubber);
  body.add(box(0.012, 0.034, 0.15, 0.019, 0.004, 0.025, 0.3), C.grey, M.satin);
  body.add(pipe([[0.014, 0, 0.1], [0.045, 0, 0.07], [0.05, 0, -0.04], [0.028, 0, -0.09], [0, 0, -0.105], [-0.012, 0, -0.08], [-0.004, 0, -0.06]], 0.0055, 26, 7), C.yellow, M.gloss);
  body.add(zcyl(0.017, -0.09, -0.06, 0, 0, 12), C.black, M.rubber);
  // canister, collars and lanyard
  body.add(zlathe([[0, 0.11], [0.026, 0.11], [0.03, 0.125], [0.03, 0.24], [0.026, 0.255], [0, 0.255]], 0, 0, 0, 16), C.grey, M.satin);
  for (const z of [0.13, 0.18, 0.235]) body.add(ring(0.031, 0.004, 0, 0, z, 'z', 4, 18), C.black, M.rubber);
  body.add(zcyl(0.022, 0.255, 0.33, 0, 0, 14), C.carbon, M.satin);
  body.add(pipe([[0.026, 0, 0.27], [0.08, 0.01, 0.24], [0.12, 0.02, 0.2], [0.09, 0.01, 0.17], [0.03, 0, 0.21]], 0.004, 24, 6), C.red, M.rubber);
  body.add(box(0.06, 0.05, 0.06, 0, 0, 0.36, 0.35), C.black, M.satin);
  // roller side: T bar, yellow frame tube with end risers, carbon deck, deck clips
  frame.add(box(0.16, 0.04, 0.05, 0, 0, hz + 0.03, 0.3), C.black, M.satin);
  frame.add(zcyl(0.014, hz + 0.04, fz, 0, 0, 12), C.black, M.metal);
  const hw = W / 2 + 0.02;
  frame.add(pipe([[-hw - 0.005, 0, dz], [-hw - 0.035, 0, dz - 0.04], [-hw - 0.03, 0, fz + 0.015], [-hw + 0.03, 0, fz], [hw - 0.03, 0, fz], [hw + 0.03, 0, fz + 0.015], [hw + 0.035, 0, dz - 0.04], [hw + 0.005, 0, dz]], 0.0125, 44, 8), C.yellow, M.gloss);
  for (const sx of [-1, 1]) for (let k = 0; k < 7; k++) frame.add(sphere(0.004, 0.004, 0.004, sx * (0.12 + k * 0.035), 0.013, fz, 6, 4), C.black, M.satin);
  frame.add(box(W - 0.04, 0.012, 0.07, 0, 0.0, fz + 0.045, 0.2), C.carbon, M.satin);
  for (const sx of [-1, 1]) frame.add(box(0.012, 0.045, 0.03, sx * (W / 2 - 0.1), 0, fz + 0.02, 0.3), C.black, M.satin);
  for (const sx of [-1, 1]) frame.add(xcyl(0.02, sx * (hw - 0.012), sx * (hw + 0.012), 0, dz, 14), C.black, M.metal);
  // caps: black hub with a teal/yellow ring at each end
  for (const sx of [-1, 1]) {
    capDisc(caps, sx * W / 2, sx, r * 0.95, C.black);
    caps.add(ring(r * 0.62, 0.005, sx * (W / 2 + 0.014), 0, 0, 'x', 4, 22), sx > 0 ? '#3fd3c4' : C.yellow, M.gloss);
    caps.add(xlathe([[0, 0], [0.022, 0], [0.02, 0.012], [0, 0.014]].map(([a, b]) => [a, sx * b]), sx * (W / 2 + 0.018), 0, 0, 12), C.metal, M.metal);
  }
  const drum = new Pieces().add(drumGeo(W, r, { ribs: { n: 4, from: -10 }, seg: 24, rows: 22 }), '#ffffff');
  rebuild(d, {
    body, parts: { hinge: part(frame, [0, 0, hz]), hingeInk: part(new Pieces(), [0, 0, hz], 'ink') },
    gripR: GRIP_R(), gripL: GRIP_L(0.08), muzzle: [0, 0, dz],
    drum: { geo: drum, caps, at: [0, 0, dz], r },
  });
  return setFold(d, [0, 0, hz]);
}

// ------------------------------------------------------------------------------------------ Dynamo Roller
function dynamoRoller(d) {
  // Wmn_Roller_Heavy: the exposed generator/drive has its own axis behind
  // the drum, joined by twin bearing plates. It is not a coaxial end cap.
  const C = { gun: '#55565b', dark: '#28282c', steel: '#a9abb1', black: '#18181b', copper: '#c27a3c' };
  // Reference-aligned front/back axes put the handle on the drum midline.
  // Keep the authored hand/fold frames and gameplay/VFX socket unchanged;
  // the visible drum is centred; the measured separate drive is reconstructed.
  const W = drumWidth(3.4), r = 0.19, dz = 1.13, dx = 0, hz = 0.88;
  const muzzleX = -0.37; // stable native socket; independent of visual axle centre
  const body = new Pieces(), ink = new Pieces(), frame = new Pieces(), frameInk = new Pieces(), caps = new Pieces();
  body.add(zlathe([[0, -0.12], [0.013, -0.12], [0.019, -0.11], [0.019, 0.1], [0.015, 0.11], [0, 0.112]], 0, 0, 0, 14), C.black, M.rubber);
  for (let k = 0; k < 6; k++) body.add(ring(0.0195, 0.0018, 0, 0, -0.08 + k * 0.035, 'z', 4, 14), C.dark, M.rubber);
  body.add(zcyl(0.012, 0.1, 0.5, 0, 0, 10), C.steel, M.metal);
  body.add(zlathe([[0, 0.28], [0.022, 0.28], [0.026, 0.3], [0.026, 0.36], [0.022, 0.38], [0, 0.38]], 0, 0, 0, 14), C.gun, M.metal);
  body.add(box(0.06, 0.04, 0.05, 0, 0, 0.33, 0.4), C.dark, M.satin);
  // motor cylinder with fins and ink lines
  body.add(zlathe([[0, 0.48], [0.04, 0.48], [0.05, 0.5], [0.05, 0.53], [0.058, 0.54], [0.058, 0.78], [0.05, 0.8], [0, 0.8]], 0, 0, 0, 20), C.gun, M.metal);
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; body.add(box(0.008, 0.008, 0.2, Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.65, 0.4), C.dark, M.metal); }
  for (const z of [0.55, 0.77]) body.add(ring(0.062, 0.006, 0, 0, z, 'z', 4, 22), C.steel, M.metal);
  for (const s of [-1, 1]) ink.add(pipe([[s * 0.075, 0, 0.53], [s * 0.085, 0.01, 0.6], [s * 0.085, 0.01, 0.72], [s * 0.075, 0, 0.8]], 0.007, 16, 6));
  body.add(zcyl(0.02, 0.8, hz - 0.02, 0, 0, 12), C.steel, M.metal);
  // The 0s/6s axis-levelled views give a 0.344/0.388 setback when
  // normalized by the unchanged 0.38 drum diameter. Use 0.36, with Y=0
  // as the common-plane construction assumption (not a calibrated scan).
  const gx = W / 2 + dx, gz = dz - 0.36, caseR = 0.25;
  frame.add(box(0.24, 0.09, 0.12, 0.03, 0, hz + 0.04, 0.25), C.dark, M.satin);
  frame.add(box(0.07, 0.10, hz + 0.12 - gz, 0.17, 0, (hz + 0.12 + gz) / 2, 0.25), C.gun, M.metal);
  for (const sy of [-1, 1]) for (const x of [-0.04, 0.05]) frame.add(ycyl(0.012, 0, sy * 0.045, x, hz + 0.04, 10), C.steel, M.metal);
  // Exposed transverse steel shaft enters the rear cone on the DRIVE axis.
  frame.add(xcyl(0.019, 0.17, gx - 0.31, 0, gz, 14), C.steel, M.metal);
  frame.add(xlathe([[0, -0.34], [0.033, -0.34], [0.036, -0.30], [0.075, -0.25], [0.15, -0.12], [0.205, -0.03], [0.205, 0], [0, 0]], gx, 0, gz, 24), C.gun, M.metal);
  for (const [x,rr] of [[-0.30,0.037],[-0.12,0.153],[-0.025,0.207]]) frame.add(ring(rr,0.004,gx+x,0,gz,'x',4,24),C.steel,M.metal);
  // Open annular case: axial core 0.21, with front stator teeth and copper
  // windings visible through the aperture instead of a solid black disc.
  frame.add(xlathe([[0.212,-0.025],[0.238,-0.025],[0.244,0.005],[0.244,0.145],[0.234,0.185],[0.212,0.185],[0.212,-0.025]],gx,0,gz,32),C.gun,M.metal);
  for (const x of [-0.015,0.155]) frame.add(ring(0.241,0.009,gx+x,0,gz,'x',5,32),C.steel,M.metal);
  frame.add(xcyl(0.185,gx+0.13,gx+0.155,0,gz,28),C.dark,M.metal);
  for(let k=0;k<24;k++){
    const a=k/24*TAU,ca=Math.cos(a),sa=Math.sin(a);
    const tooth=box(0.035,0.087,0.016,0,0,0,0.30,6,4).rotateX(a).translate(gx+0.19,ca*0.147,gz+sa*0.147);
    frame.add(tooth,C.steel,M.metal);
    const winding=[[0.15,0.188],[0.196,0.188],[0.216,0.204],[0.192,0.221],[0.151,0.22]].map(([x,rr])=>[gx+x,ca*rr,gz+sa*rr]);
    frame.add(pipe(winding,0.006,6,4),C.copper,M.metal);
  }
  frame.add(ring(0.205,0.006,gx+0.191,0,gz,'x',4,40),C.copper,M.metal);
  frame.add(xlathe([[0,0.16],[0.095,0.16],[0.095,0.205],[0.065,0.227],[0.055,0.254],[0.031,0.272],[0,0.272]],gx,0,gz,8),C.steel,M.metal);
  // Vented case bands, retaining straps and bolts, distinct from team ink.
  for(let k=0;k<8;k++){
    const a=k/8*TAU,ca=Math.cos(a),sa=Math.sin(a);
    frame.add(box(0.085,0.012,0.042,0,0,0,0.25,6,4).rotateX(a).translate(gx+0.064,ca*0.247,gz+sa*0.247),'#81a7a1',M.satin);
  }
  for(let k=0;k<3;k++){
    const a=k/3*TAU+.25,ca=Math.cos(a),sa=Math.sin(a);
    frame.add(box(0.20,0.02,0.04,0,0,0,0.25,6,4).rotateX(a).translate(gx+0.085,ca*caseR,gz+sa*caseR),C.gun,M.metal);
    frame.add(xcyl(0.013,gx+0.17,gx+0.218,ca*0.226,gz+sa*0.226,8),C.steel,M.metal);
  }
  // Two pierced side plates support both distinct axes. Their apertures
  // leave the copper stator and the drum bearing exposed in opposite views.
  const outline=[[dz+.13,-.08],[dz+.16,0],[dz+.13,.08],[dz-.01,.125],[gz+.14,.225],[gz+.04,.253],[gz-.12,.226],[gz-.23,.12],[gz-.25,-.06],[gz-.17,-.20],[gz+.02,-.256],[gz+.18,-.20],[dz-.01,-.125]];
  const circle=(z,r,n=28)=>Array.from({length:n},(_,k)=>[z+Math.sin(k/n*TAU)*r,Math.cos(k/n*TAU)*r]);
  for(const x of [gx-0.015,gx+0.165]) frame.add(slab(outline,0.022,x,0.003,[circle(gz,0.218),circle(dz,0.070,20)],4),C.gun,M.metal);
  // The drum has its own narrow end collar, tapered bearing and axle nut.
  frame.add(xlathe([[0,0],[r*1.02,0],[r*1.04,.024],[r*.97,.045],[.092,.049],[.092,.105],[.061,.14],[.036,.21],[0,.215]],gx,0,dz,28),C.steel,M.metal);
  frame.add(xcyl(0.043,gx+.18,gx+.24,0,dz,8),C.gun,M.metal);
  frame.add(xcyl(0.025,gx+.23,gx+.275,0,dz,12),C.steel,M.metal);
  for(const sy of [-1,1]) frame.add(xcyl(0.012,gx+.15,gx+.185,sy*.075,dz+.085,8),C.steel,M.metal);
  frame.add(box(0.036,0.058,0.055,gx+0.008,r+0.008,dz-0.03,0.35,8,6),C.gun,M.metal);
  frame.add(cyl(0.012,[gx,r+0.035,dz-0.03],[-W/2+dx-0.02,r+0.035,dz-0.03],10),C.black,M.metal);
  const fx = -W / 2 + dx;
  frame.add(xlathe([[0, 0], [r * 1.02, 0], [r * 1.05, -0.03], [r * 0.85, -0.06], [0, -0.07]], fx, 0, dz, 24), C.gun, M.metal);
  frame.add(box(0.03, 0.06, 0.04, fx - 0.02, r + 0.01, dz - 0.03, 0.4), C.dark, M.metal);
  for (const sx of [-1, 1]) rim(caps, sx * (W / 2 - 0.01), r, 0.02, C.dark, M.metal);
  const drum = new Pieces().add(drumGeo(W, r, { dimples: 8 }), '#ffffff');
  // Both separated axes fold together; only the original drum channel spins.
  rebuild(d, {
    body, ink, parts: { hinge: part(frame, [0, 0, hz]), hingeInk: part(frameInk, [0, 0, hz], 'ink') },
    gripR: GRIP_R(), gripL: GRIP_L(0.14), muzzle: [muzzleX, 0, dz],
    drum: { geo: drum, caps, at: [dx, 0, dz], r },
  });
  return setFold(d, [0, 0, hz]);
}

// ------------------------------------------------------------------------------------------ Flingza Roller
function flingzaRoller(d) {
  // Wmn_Roller_Hunter: stepped drum — the thick ribbed section on the frame
  // side (−X) under a silver strip, the slim section at the far end; a bent
  // wire frame from the red tank case into the −X end; twin-rod handle that
  // slides through the case (the handle extends for the vertical swing).
  const C = { red: '#86202b', redDark: '#4e0f17', steel: '#bcc0c7', dark: '#2b2c30', black: '#16161a', strip: '#6f747d' };
  const W = drumWidth(2.6), r = 0.14, rs = 0.115, dz = 0.9, hz = 0.52;
  const body = new Pieces(), frame = new Pieces(), caps = new Pieces();
  // twin rods with a black grip on one of them
  for (const sx of [-1, 1]) body.add(zcyl(0.0085, -0.13, hz - 0.02, sx * 0.026, 0, 10), C.steel, M.metal);
  body.add(pipe([[-0.026, 0, -0.13], [-0.018, 0, -0.15], [0.018, 0, -0.15], [0.026, 0, -0.13]], 0.0085, 10, 8), C.steel, M.metal);
  body.add(zlathe([[0, -0.125], [0.013, -0.125], [0.017, -0.115], [0.017, 0.07], [0.012, 0.08], [0, 0.08]], -0.026, 0, 0, 12), C.black, M.rubber);
  body.add(zlathe([[0, -0.125], [0.013, -0.125], [0.017, -0.115], [0.017, 0.07], [0.012, 0.08], [0, 0.08]], 0.026, 0, 0, 12), C.black, M.rubber);
  // roller side (slides with the extension): case, wire frame, strip
  frame.add(box(0.1, 0.055, 0.26, 0, 0.012, hz - 0.1, 0.18), C.steel, M.metal);
  frame.add(box(0.104, 0.012, 0.25, 0, 0.042, hz - 0.1, 0.15), C.red, M.gloss);
  for (let k = 0; k < 9; k++) frame.add(box(0.004, 0.006, 0.2, -0.04 + k * 0.01, 0.05, hz - 0.1, 0.5), C.redDark, M.satin);
  for (let k = 0; k < 10; k++) frame.add(box(0.106, 0.05, 0.004, 0, 0.005, hz - 0.21 + k * 0.022, 0.5), C.dark, M.metal);
  frame.add(ycyl(0.008, 0.04, 0.052, -0.03, hz - 0.19, 10), C.steel, M.metal);
  frame.add(ycyl(0.008, 0.04, 0.052, 0.03, hz - 0.01, 10), C.steel, M.metal);
  const ex = -W / 2 - 0.0;
  frame.add(pipe([[0, 0.01, hz + 0.02], [-0.2, 0.01, hz + 0.05], [-0.4, 0.008, hz + 0.08], [ex - 0.03, 0.005, hz + 0.095], [ex - 0.06, 0, dz - 0.08], [ex - 0.05, 0, dz - 0.01], [ex - 0.01, 0, dz]], 0.009, 40, 8), C.steel, M.metal);
  frame.add(xcyl(0.02, ex - 0.03, ex + 0.002, 0, dz, 14), C.steel, M.metal);
  frame.add(box(0.75, 0.012, 0.06, -0.25, r + 0.008, dz, 0.15), C.strip, M.metal);
  // caps: polished end rings
  rim(caps, -W / 2 + 0.01, r, 0.02, C.steel, M.metal); rim(caps, W / 2 - 0.01, rs, 0.02, C.steel, M.metal);
  capDisc(caps, -W / 2, -1, r * 0.9, C.steel, M.metal); capDisc(caps, W / 2, 1, rs * 0.85, C.dark, M.metal);
  const drum = new Pieces().add(drumGeo(W, r, { step: { at: 0.02, r: rs }, ribs: { n: 6, from: -10, wave: true } }), '#ffffff');
  rebuild(d, {
    body, parts: { hinge: part(frame, [0, 0, hz]), hingeInk: part(new Pieces(), [0, 0, hz], 'ink') },
    gripR: GRIP_R(), gripL: GRIP_L(0.12), muzzle: [0, 0, dz],
    drum: { geo: drum, caps, at: [0, 0, dz], r },
  });
  return setFold(d, [0, 0, hz]);
}

// ------------------------------------------------------------------------------------------ Big Swig Roller
function bigSwigRoller(d) {
  // Wmn_Roller_Wide: long slim drum, purple box arm parallel to the drum from a
  // pale-blue hinge block, C hook into the +X end, beaded tan hose along the
  // arm, ink cup on the handle, purple two-prong (fork) handle.
  const C = { purple: '#6c52e6', light: '#94b4f6', blue: '#3c7fe4', hose: '#dccaa6', cup: '#eeeadf', handle: '#4b2cb0', dark: '#2a2440' };
  const W = 2.0, r = 0.15, dz = 0.93, hz = 0.6, az = 0.68;
  const body = new Pieces(), ink = new Pieces(), arm = new Pieces(), caps = new Pieces();
  // fork handle: two prongs joined at the butt (hand on the −X prong)
  body.add(bar([[0, 0, -0.1], [0, 0, 0.13]], 0.03, 0.036), C.handle, M.satin);
  body.add(bar([[0.075, 0, -0.06], [0.075, 0, 0.17]], 0.028, 0.032), C.handle, M.satin);
  body.add(bar([[0, 0, -0.1], [0.02, 0, -0.14], [0.06, 0, -0.13], [0.075, 0, -0.06]], 0.028, 0.03, 12), C.handle, M.satin);
  body.add(ycyl(0.008, -0.02, 0.02, 0.035, -0.12, 10), C.dark, M.satin);
  body.add(bar([[0.0, 0, 0.13], [0.03, 0, 0.2], [0.075, 0, 0.17]], 0.03, 0.034, 10), C.handle, M.satin);
  // cup (ink) on a bracket, blue spine up to the hinge
  body.add(bar([[0.04, 0, 0.2], [0.04, 0, hz - 0.03]], 0.04, 0.03), C.blue, M.satin);
  body.add(zlathe([[0, 0], [0.058, 0], [0.066, 0.13], [0.07, 0.135], [0, 0.135]], -0.025, 0.04, 0.23, 18), C.cup, M.satin);
  ink.add(zlathe([[0, 0.04], [0.06, 0.04], [0.064, 0.11], [0, 0.11]], -0.025, 0.04, 0.23, 18));
  body.add(box(0.03, 0.03, 0.1, -0.025, 0.11, 0.3, 0.3), C.purple, M.satin);
  body.add(box(0.1, 0.06, 0.08, 0.03, 0.0, hz - 0.03, 0.25), C.light, M.satin);
  // roller side: hinge block, box arm, hook, hose
  arm.add(box(0.1, 0.07, 0.09, 0.03, 0, hz + 0.04, 0.25), C.light, M.satin);
  arm.add(ycyl(0.022, -0.045, 0.045, 0.03, hz + 0.04, 14), C.blue, M.gloss);
  arm.add(bar([[0.03, 0, az], [W / 2 - 0.06, 0, az]], 0.05, 0.04), C.purple, M.satin);
  arm.add(bar([[W / 2 - 0.07, 0, az], [W / 2 + 0.02, 0, az + 0.01], [W / 2 + 0.08, 0, az + 0.07], [W / 2 + 0.085, 0, dz - 0.06], [W / 2 + 0.05, 0, dz - 0.004], [W / 2 + 0.01, 0, dz]], 0.044, 0.036, 24), C.purple, M.satin);
  for (let k = 0; k < 8; k++) arm.add(box(0.012, 0.052, 0.042, 0.12 + k * 0.08, 0, az, 0.4), C.dark, M.satin);
  const hose = [[0.0, 0.03, hz + 0.08], [0.15, 0.035, az - 0.025], [W / 2 - 0.05, 0.035, az - 0.03], [W / 2 + 0.05, 0.035, az + 0.03], [W / 2 + 0.11, 0.03, dz - 0.07], [W / 2 + 0.1, 0.02, dz - 0.01], [W / 2 + 0.05, 0.01, dz + 0.01]];
  arm.add(pipe(hose, 0.011, 60, 6), C.hose, M.satin);
  const curve = new THREE.CatmullRomCurve3(hose.map(p => V(...p)));
  for (let k = 0; k <= 34; k++) { const q = curve.getPointAt(k / 34); arm.add(sphere(0.015, 0.015, 0.015, q.x, q.y, q.z, 8, 6), C.hose, M.satin); }
  rim(caps, W / 2 - 0.01, r, 0.02, C.purple); rim(caps, -W / 2 + 0.01, r, 0.02, C.purple);
  capDisc(caps, -W / 2, -1, r * 0.85, C.purple); capDisc(caps, W / 2, 1, r * 0.85, C.purple);
  caps.add(xlathe([[0, 0], [0.03, 0], [0.03, -0.01], [0, -0.012]], -W / 2 - 0.02, 0, 0, 12), C.blue, M.gloss);
  const drum = new Pieces().add(drumGeo(W, r, { ribs: { n: 3, from: -10, wave: true } }), '#ffffff');
  rebuild(d, {
    body, ink, parts: { hinge: part(arm, [0, 0, hz]), hingeInk: part(new Pieces(), [0, 0, hz], 'ink') },
    gripR: GRIP_R(), gripL: GRIP_L(0.11), muzzle: [0, 0, dz],
    drum: { geo: drum, caps, at: [0, 0, dz], r },
  });
  return setFold(d, [0, 0, hz]);
}

// ------------------------------------------------------------------------------------------ motion
// Catalogue rollers (Carbon, Dynamo, Flingza, Big Swig) swing through the
// catalogue runner, which never builds the Splat Roller's attack record, so the
// Character played no swing at all (roller-detail-motion skips an owned runner
// without one). Mirror the catalogue swing into the same Character-side record
// the Splat Roller uses (`s3RollerFlick`: vertical, windup, interval, elapsed,
// released, rolling) so its calibrated horizontal / vertical swing poses, the
// fold and the drum release impulse play on each weapon's own timing
// (WeaponWideSwingParam / WeaponVerticalSwingParam.SwingFrame, cooldown from
// the runner). Read-only towards gameplay: runner clocks are only read.
const SWING = new WeakMap();
function catalogRoller(ch, s) {
  const r = ch._runner?.(s), rec = r?.a?.weapon?.catalogRecord;
  return rec && rec.family === 'roller' && r.catalogState ? r : null;
}
function swingRecord(rec, vertical, interval) {
  const p = rec.parameters || {}, t = vertical ? p.WeaponVerticalSwingParam : p.WeaponWideSwingParam;
  const windup = (Number.isFinite(t?.SwingFrame) ? t.SwingFrame : vertical ? 31 : 21) / 60;
  return { vertical, windup, interval: Math.max(interval, windup + 1 / 60), elapsed: 0, released: false, rolling: false,
    depleted: false, groundedStart: !vertical, jumpConverted: false, catalog: true, remote: false };
}
/** Read-only view for regressions. */
export function catalogRollerSwing(ch) { return SWING.get(ch)?.attack ?? null; }

export function FAMILY_TRIGGER(ch, name) {
  if (name !== 'shoot') return false;
  const r = catalogRoller(ch);
  if (!r) return false;                    // the Splat Roller keeps its own runner-owned flick
  // A remote proxy hears the release only: start its record at the release.
  if (r.a?.remote) {
    const a = swingRecord(r.a.weapon.catalogRecord, !r.a.grounded, 0);
    a.interval = a.windup + 0.45; a.elapsed = a.windup; a.released = true; a.remote = true;
    let m = SWING.get(ch); if (!m) SWING.set(ch, m = { count: 0, attack: null });
    m.attack = a; ch.s3RollerFlick = a;
  }
  return true;                             // the record drives the pose; skip the legacy 0.7 s timer
}

export function FAMILY_POSE(ch, dt, s, C) {
  const r = catalogRoller(ch, s);
  if (!r) return;
  // Rolling: roller.mjs lowers the hands until the drum touches the floor; its
  // roll pitch is calibrated on the Splat Roller's reach (0.935 m to a 0.115 m
  // drum). Re-aim the handle so each drum meets the floor with the same hand
  // drop (handle reach × sin(pitch) + radius) instead of crouching the arms.
  const d = ch.weapon?.def, roll = ch._s3RollerContactPose ? 1 : (ch.wRoll || 0);
  if (d?.drumAt && d.drumR && roll > 0.001 && C) {
    const reach = Math.hypot(d.drumAt.y, d.drumAt.z + 0.022);
    const pitch = Math.asin(clamp((0.935 * Math.sin(0.36) + 0.115 - d.drumR) / reach, 0, 0.95));
    ch.P[C.ANCR] += (pitch - 0.36) * roll;
  }
  const cs = r.catalogState;
  let m = SWING.get(ch);
  if (!m) SWING.set(ch, m = { count: cs.swingCount, attack: null });
  if (cs.swingCount !== m.count) {
    const started = cs.swingCount > m.count; m.count = cs.swingCount;
    if (started && !r.a.remote) {
      m.attack = swingRecord(r.a.weapon.catalogRecord, !r.a.grounded, Math.max(0, r.cooldown || 0));
      ch.s3RollerFlick = m.attack;
    }
  }
  const a = m.attack;
  if (!a) return;
  if (ch.s3RollerFlick !== a) { m.attack = null; return; }   // cancelled / swapped / reset
  a.elapsed = a.remote ? a.elapsed + Math.min(0.1, Math.max(0, dt || 0)) : Math.max(a.elapsed, a.interval - Math.max(0, r.cooldown || 0));
  a.released = a.elapsed >= a.windup;
  a.rolling = a.released && !!r.rolling;
  if (a.elapsed >= a.interval || (a.rolling && (ch.wRoll || 0) >= 0.95)) { m.attack = null; ch.s3RollerFlick = null; }
}

/** Flingza Roller: the case, frame and drum slide out along the twin rods for the
 *  vertical swing (the handle extends) and back for horizontal swings / rolling. */
const FLING_EXT = 0.16;
function flingzaExtend(w, st) {
  const ch = st.runner?.a?.character, a = ch?.s3RollerFlick, dt = Math.min(0.1, Math.max(0, st.dt || 0));
  const want = a && a.vertical && a.elapsed < a.interval ? 1 : 0;
  w.flingExt = damp(w.flingExt || 0, want, want ? 16 : 7, dt);
  if (w.fold && w.def.fold) w.fold.position.z = w.def.fold.pivot.z + FLING_EXT * w.flingExt;
}

export const MODELS = {
  roller: { sourceModel: 'Wmn_Roller_NormalT', build: splatRoller },
  's3-roller-compact': { sourceModel: 'Wmn_Roller_Compact', build: carbonRoller },
  's3-roller-heavy': { sourceModel: 'Wmn_Roller_Heavy', build: dynamoRoller },
  's3-roller-hunter': { sourceModel: 'Wmn_Roller_Hunter', build: flingzaRoller, animate: flingzaExtend },
  's3-roller-wide': { sourceModel: 'Wmn_Roller_Wide', build: bigSwigRoller },
};
