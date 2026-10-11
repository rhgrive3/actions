// Dualies family models (Splatoon 3 Ver.11.3.0 main weapons). Each model is ONE pistol; the game puts a copy
// in each hand, so d.dual stays true and gripR / gripL stay the native pistol grip (handle axis through the
// origin, leaning forward). Rebuilt with Opus from the official 3D renders and the turntable sheets (the
// renders show the pair overlapped; the turntables show single pistols). Parts the turntable shows in team
// colour are ink. The native recoil `slide` / `slideInk` / `led` channels are kept (hidden: no real dualie
// has a sliding top). Scale: the pistol handle is 0.11 m. Everything is procedural geometry.
import { Pieces, M, box, sphere, zlathe, zcyl, ring, cyl, pipe, slab, smoothOutline, pistolGrip, TRIGGER_PIVOT,
  part, rebuild } from './kit.mjs';
import * as DK from './kit.mjs';

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

// ------------------------------------------------------------------------------------------ Dapple Dualies helpers
/** Rounded-edge solid from a side outline [[z, y], ...] (smooth, either orientation) thickened along X: half width
 *  hw (number or fn(z, y)), edge radius r (outline) / rh (holes), `steps` arc steps per edge quarter. The side faces
 *  are flat, every edge is a true quarter-round; holes are through-openings with their own rounded lips. */
function dappleRoundSlab(outline, hw, r, holes = [], rh = 0.002, steps = 3, x0 = 0) {
  const HW = typeof hw === 'function' ? hw : () => hw;
  const area = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const orient = (pts, ccw) => ((area(pts) > 0) === ccw ? pts : [...pts].reverse());
  const loops = [{ L: orient(outline, true), r }, ...holes.map(h => ({ L: orient(h, false), r: rh }))];
  const pos = [], idx = [], faceLoops = [[], []];
  const push = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };
  const tri = (a, b, c, ox, oy, oz) => {                        // keep the triangle facing the expected outward dir
    const A = a * 3, B = b * 3, C = c * 3;
    const ux = pos[B] - pos[A], uy = pos[B + 1] - pos[A + 1], uz = pos[B + 2] - pos[A + 2];
    const vx = pos[C] - pos[A], vy = pos[C + 1] - pos[A + 1], vz = pos[C + 2] - pos[A + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * ox + ny * oy + nz * oz >= 0) idx.push(a, b, c); else idx.push(a, c, b);
  };
  const phis = []; for (let k = 0; k <= steps; k++) phis.push([-Math.PI / 2 + (k / steps) * Math.PI / 2, -1]);
  for (let k = 0; k <= steps; k++) phis.push([(k / steps) * Math.PI / 2, 1]);
  for (const { L, r: rr } of loops) {
    const n = L.length, N = L.map((p, i) => { const a = L[(i - 1 + n) % n], b = L[(i + 1) % n], dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy) || 1; return [-dy / l, dz / l]; });
    const rings = phis.map(([phi, side]) => L.map(([z, y], i) => {
      const w = HW(z, y), inset = rr * (1 - Math.cos(phi)), x = x0 + side * (w - rr) + rr * Math.sin(phi);
      return push(x, y + N[i][1] * inset, z + N[i][0] * inset);
    }));
    for (let k = 0; k < rings.length - 1; k++) {
      const pm = (phis[k][0] + phis[k + 1][0]) / 2, sx = Math.sin(pm), cs = Math.cos(pm);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ox = sx, oy = -N[i][1] * cs, oz = -N[i][0] * cs;
        tri(rings[k][i], rings[k][j], rings[k + 1][j], ox, oy, oz); tri(rings[k][i], rings[k + 1][j], rings[k + 1][i], ox, oy, oz);
      }
    }
    faceLoops[0].push({ ring: rings[0], L }); faceLoops[1].push({ ring: rings[rings.length - 1], L });
  }
  for (const [s, fl] of [[-1, faceLoops[0]], [1, faceLoops[1]]]) {
    const ids = fl.flatMap(f => f.ring), v2 = fl.map(f => f.ring.map(i => new DK.THREE.Vector2(pos[i * 3 + 2], pos[i * 3 + 1])));
    for (const [a, b, c] of DK.THREE.ShapeUtils.triangulateShape(v2[0], v2.slice(1))) tri(ids[a], ids[b], ids[c], s, 0, 0);
  }
  const g = new DK.THREE.BufferGeometry();
  g.setAttribute('position', new DK.THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Smooth closed outline through [[z, y], ...] control points with ~`step` m spacing. */
const dappleOutline = (pts, step = 0.004) => {
  let len = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; len += Math.hypot(q[0] - p[0], q[1] - p[1]); }
  return smoothOutline(pts, Math.max(12, Math.round(len / step)));
};
/** Swept bar with a rounded-rectangle (superellipse) section: half size ha(t) along the hint direction, hb(t)
 *  across it, through 3D points; rounded end caps. */
function dappleBar(points, ha, hb, hint = [1, 0, 0], seg = 20, radial = 12, p = 3.2) {
  const A = typeof ha === 'function' ? ha : () => ha, B = typeof hb === 'function' ? hb : () => hb, e = 2 / p;
  return DK.sweep(points, { seg, radial, capSteps: 3, transport: true, outward: (_P, o) => o.set(...hint),
    radius: t => B(t), flat: t => A(t) / B(t), section: (c, s) => [Math.sign(c) * Math.abs(c) ** e, Math.sign(s) * Math.abs(s) ** e] }).geo;
}
/** Flip a geometry inside out (for recesses / bores seen from their opening). */
function dappleInward(g) { const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; } g.computeVertexNormals(); return g; }

function dapple(d) {
  // Wmn_Maneuver_Short, rebuilt from the official turntable (S3 Dapple Dualies model rotating.mp4) and the S3 promo
  // render. One heavy magenta frame: a block with two windows over the grip, a thick top arc sweeping forward and
  // down to a black treaded nozzle drum at trigger height, and a chin prong under the drum (the open C in front of
  // the trigger is the finger space). Black raked grip with grey side pads and a beavertail behind the frame, a black
  // valve stem leaning forward on top, a magenta foot under the grip whose arm curls back and out to a toothbrush
  // (white/blue handle, team-ink bristles facing back), and a dark bow arm over the back strung to the brush head
  // with a white thread. The turntable pair is mirrored; INKWAVE holds one geometry in both hands, so this is the
  // right-hand variant (brush on the holder's outer side, −X). Scale: visible grip 0.09 m (frame → foot).
  const C = { magenta: '#86184d', black: '#26262a', panel: '#505053', stem: '#232326', silver: '#b9bab6', steel: '#8e9196',
    arm: '#55575c', white: '#e8e8e6', blue: '#2f62c4', sky: '#5c9ae0', print: '#f0eef0', hole: '#1c1418', bed: '#6a1140', thread: '#eeeeee' };
  const V3 = DK.THREE.Vector3, body = new Pieces(), ink = new Pieces(), trig = new Pieces();
  const sm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  // ---- frame: one rounded solid, thicker round the drum mount, slimmer chin
  const frameW = (z, y) => 0.0195 + 0.002 * sm((z - 0.11) / 0.04) - 0.0025 * sm((-0.012 - y) / 0.03);
  const frameOutline = dappleOutline([
    [-0.003, 0.046], [-0.003, 0.088], [-0.009, 0.1], [-0.013, 0.112], [-0.008, 0.122], [0.003, 0.128], [0.018, 0.131], [0.04, 0.13],
    [0.062, 0.127], [0.085, 0.12], [0.108, 0.107], [0.128, 0.093], [0.146, 0.076], [0.159, 0.058], [0.166, 0.04], [0.167, 0.012],
    [0.165, -0.012], [0.152, -0.027], [0.127, -0.049], [0.111, -0.062], [0.098, -0.067], [0.089, -0.062], [0.086, -0.048],
    [0.086, -0.03], [0.092, -0.016], [0.101, -0.003], [0.106, 0.012], [0.105, 0.026], [0.098, 0.035], [0.084, 0.037], [0.065, 0.036],
    [0.048, 0.037], [0.036, 0.041], [0.016, 0.043]], 0.005);
  const win = (z0, z1, y0, y1, k = 0.003) => dappleOutline([[z0, y0 + k], [z0 + k, y0], [z1 - k, y0], [z1, y0 + k], [z1, y1 - k], [z1 - k, y1], [z0 + k, y1], [z0, y1 - k]], 0.003);
  body.add(dappleRoundSlab(frameOutline, frameW, 0.0075, [win(0.026, 0.041, 0.076, 0.095), win(0.056, 0.074, 0.055, 0.073)], 0.0018), C.magenta, M.gloss);
  // raised ink strip in a darker capsule bed on each flank of the top arc, white logo prints, screws and chin holes
  const strip = [[0.078, 0.107], [0.096, 0.097], [0.113, 0.084], [0.13, 0.068], [0.143, 0.053]];
  for (const sx of [-1, 1]) {
    const wx = z => sx * (frameW(z, 0.08) + 0.0002);
    ink.add(dappleBar(strip.map(([z, y]) => [wx(z), y, z]), 0.0018, 0.0046, [1, 0, 0], 10, 8));
    body.add(dappleBar(strip.map(([z, y]) => [wx(z) - sx * 0.0004, y, z]), 0.0014, 0.0062, [1, 0, 0], 10, 8), C.bed, M.gloss);
    const lx = sx * (frameW(0.13, 0.02) + 0.0003);
    body.add(slab(dappleOutline([[0.119, 0.009], [0.142, 0.009], [0.1305, 0.035]], 0.004), 0.0008, lx, 0), C.print, M.print);
    body.add(slab(dappleOutline([[0.124, 0.014], [0.137, 0.014], [0.1305, 0.026]], 0.004), 0.001, lx + sx * 0.0002, 0), C.magenta, M.print);
    body.add(box(0.0008, 0.0035, 0.028, lx, 0.003, 0.131, 0.2, 6, 4), C.print, M.print);
    body.add(box(0.0008, 0.003, 0.022, 0, 0, 0, 0.2, 6, 4).rotateX(0.55).translate(sx * (frameW(0.012, 0.1) + 0.0003), 0.104, 0.012), C.print, M.print);  // "BBAT-32" print
    body.add(sphere(0.0034, 0.0034, 0.0016, sx * (frameW(0.018, 0.114) + 0.0001), 0.114, 0.018, 10, 6), C.silver, M.metal);
    for (const [z, y] of [[0.111, -0.033], [0.112, -0.045]]) body.add(DK.xcyl(0.0024, sx * (frameW(z, y) - 0.0012), sx * (frameW(z, y) + 0.0002), y, z, 10), C.hole, M.satin);
  }
  // ---- nozzle drum: treaded black knob, silver face washer, bore
  const DY = 0.0155;
  body.add(zlathe([[0.0066, 0.197], [0.021, 0.197], [0.028, 0.1955], [0.0325, 0.191], [0.0345, 0.185], [0.0345, 0.157], [0.0325, 0.15], [0.026, 0.146], [0, 0.146]], 0, DY, 0, 20), C.black, M.rubber);
  for (let k = 0; k < 8; k++) body.add(box(0.021, 0.0055, 0.033, 0, 0.0342, 0.1705, 0.5, 6, 4).rotateZ((k + 0.5) * Math.PI / 4).translate(0, DY, 0), C.black, M.rubber);
  body.add(zlathe([[0.0072, 0.1968], [0.0218, 0.1968], [0.0226, 0.1984], [0.0216, 0.1996], [0.0185, 0.2], [0.0092, 0.2], [0.0072, 0.1988]], 0, DY, 0, 20), '#d6d7d4', M.metal);
  body.add(dappleInward(zlathe([[0.0072, 0.1997], [0.0072, 0.187], [0, 0.187]], 0, DY, 0, 16)), C.hole, M.satin);
  body.add(ring(0.0076, 0.0007, 0, DY, 0.1999, 'z', 4, 16), C.steel, M.metal);
  // ---- grip: raked black body with the beavertail behind the frame, grey side pads, screws, butt seat, trigger
  const gripOutline = dappleOutline([[-0.004, 0.1], [-0.014, 0.106], [-0.025, 0.102], [-0.029, 0.09], [-0.023, 0.068], [-0.021, 0.044],
    [-0.027, 0.022], [-0.032, -0.004], [-0.034, -0.03], [-0.03, -0.052], [-0.018, -0.062], [0.008, -0.062], [0.02, -0.052],
    [0.024, -0.03], [0.028, -0.006], [0.033, 0.018], [0.038, 0.038], [0.034, 0.05], [0.01, 0.05]], 0.005);
  body.add(dappleRoundSlab(gripOutline, 0.0148, 0.0105, [], 0.002, 2), C.black, M.rubber);
  const pad = dappleOutline([[-0.019, 0.03], [-0.025, 0.004], [-0.027, -0.028], [-0.022, -0.046], [0.006, -0.048], [0.014, -0.036],
    [0.018, -0.008], [0.022, 0.018], [0.018, 0.032], [0.0, 0.036]], 0.005);
  body.add(dappleRoundSlab(pad, 0.0154, 0.0016, [], 0.001, 1), C.panel, M.rubber);
  for (const sx of [-1, 1]) body.add(sphere(0.0033, 0.0033, 0.0016, sx * 0.0157, 0.02, 0.015, 10, 6), C.silver, M.metal);
  body.add(box(0.033, 0.006, 0.052, -0.0, -0.056, -0.004, 0.3, 8, 4), C.black, M.rubber);
  trig.add(dappleBar([[0, 0.039, 0.04], [0, 0.03, 0.0455], [0, 0.019, 0.0475], [0, 0.01, 0.0445]], 0.0032, 0.0028, [1, 0, 0], 10, 8), C.black, M.satin);
  // ---- valve stem on top (leans forward), black collar, grooved silver cap
  const stem = new Pieces();
  stem.add(DK.ylathe([[0, -0.006], [0.0125, -0.006], [0.012, 0.012], [0.0098, 0.025], [0, 0.025]], 0, 0, 0, 16), C.stem, M.satin);
  stem.add(DK.ylathe([[0, 0.023], [0.0112, 0.023], [0.0115, 0.036], [0.0094, 0.039], [0, 0.039]], 0, 0, 0, 8), C.stem, M.satin);
  stem.add(DK.ylathe([[0, 0.038], [0.0078, 0.038], [0.0078, 0.053], [0.0066, 0.0545], [0, 0.0545]], 0, 0, 0, 16), C.silver, M.metal);
  for (const y of [0.042, 0.047]) stem.add(ring(0.0079, 0.0008, 0, y, 0, 'y', 4, 16), C.steel, M.metal);
  body.merge(stem.transform(g => g.rotateX(0.42).translate(0, 0.124, 0.044)));
  // ---- bow arm over the back (dark steel band, clamp at the root, hooked tip) and the thread to the brush head
  const arm = [[0, 0.128, 0.008], [-0.012, 0.136, -0.022], [-0.038, 0.148, -0.058], [-0.062, 0.151, -0.085], [-0.08, 0.154, -0.097]];
  body.add(dappleBar(arm, t => 0.0044 - 0.0014 * t, 0.0034, [0, 1, 0], 20, 8), C.arm, M.metal);
  body.add(box(0.012, 0.012, 0.014, 0, 0.128, 0.006, 0.35, 8, 4), C.black, M.satin);
  body.add(box(0.006, 0.011, 0.006, -0.081, 0.157, -0.098, 0.35, 6, 4), C.black, M.satin);
  // ---- foot: platform under the grip with a forward spur, arm curling back and out to the brush
  const BX = -0.09;
  const footW = (z) => 0.024 - 0.007 * sm((z - 0.026) / 0.016);
  body.add(dappleRoundSlab(dappleOutline([[-0.036, -0.052], [-0.01, -0.051], [0.012, -0.05], [0.03, -0.047], [0.036, -0.054], [0.043, -0.078],
    [0.046, -0.096], [0.038, -0.098], [0.028, -0.086], [0.016, -0.084], [-0.004, -0.079], [-0.024, -0.073], [-0.038, -0.066]], 0.005), footW, 0.006, [], 0.002, 2, -0.006), C.magenta, M.gloss);
  const footArm = [[-0.006, -0.066, -0.026], [-0.02, -0.069, -0.05], [-0.046, -0.07, -0.074], [-0.072, -0.067, -0.089], [BX, -0.065, -0.094]];
  body.add(dappleBar(footArm, t => 0.017 - 0.002 * t, t => 0.0165 - 0.002 * t, [0, 1, 0], 16, 10), C.magenta, M.gloss);
  body.add(box(0.03, 0.027, 0.03, BX, -0.069, -0.094, 0.3, 10, 6), C.magenta, M.gloss);                                  // brush socket block
  body.add(box(0.015, 0.013, 0.003, BX - 0.002, -0.071, -0.0788, 0.2, 6, 4), C.hole, M.satin);                             // its square socket
  body.add(dappleBar(footArm.slice(1, 4).map(([x, y, z]) => [x, y + 0.0138, z]), 0.0018, 0.0065, [0, 1, 0], 10, 6), C.hole, M.satin); // slot on top
  // ---- toothbrush: handle leaning back 45° (white, sky spine, ribbed blue grip), wide head, ink bristle tufts facing back-down
  const handle = [[BX, -0.069, -0.092], [BX, -0.042, -0.106], [BX, -0.012, -0.128], [BX, 0.018, -0.153], [BX, 0.044, -0.177], [BX, 0.068, -0.2], [BX, 0.08, -0.212]];
  const hw = t => 0.011 + 0.003 * sm((t - 0.6) / 0.2), hh = t => 0.0078 - 0.0024 * Math.sin(Math.PI * Math.min(1, t / 0.75));
  body.add(dappleBar(handle, hw, hh, [1, 0, 0], 22, 10), C.white, M.gloss);
  const curve = new DK.THREE.CatmullRomCurve3(handle.map(p => new V3(...p)), false, 'centripetal'), P = new V3(), T = new V3();
  body.add(dappleBar([0.3, 0.45, 0.6, 0.75, 0.97].map(t => curve.getPointAt(t).add(new V3(0, 0.0033, 0.0033))).map(v => v.toArray()), 0.0058, 0.0042, [1, 0, 0], 12, 8), C.sky, M.gloss);
  for (let k = 0; k < 5; k++) {                                   // ribbed blue grip near the foot
    const t = 0.04 + k * 0.055; curve.getPointAt(t, P); curve.getTangentAt(t, T);
    body.add(box(0.0235, 0.0045, 0.0185, 0, 0, 0, 0.5, 8, 4).rotateX(Math.atan2(T.z, T.y)).translate(P.x, P.y, P.z), C.blue, M.gloss);
  }
  const hd = new V3(0, 0.72, -0.69).normalize(), hn = new V3(0, -0.69, -0.72).normalize(), rot = Math.atan2(hn.z, hn.y);
  const hc = curve.getPointAt(0.8);
  body.add(box(0.034, 0.008, 0.064, 0, 0, 0, 0.45, 8, 4).rotateX(rot).translate(hc.x + hn.x * 0.003, hc.y + hn.y * 0.003, hc.z + hn.z * 0.003), C.white, M.gloss);
  for (let k = 0; k < 7; k++) {
    const c = hc.clone().addScaledVector(hd, -0.0265 + k * 0.0088).addScaledVector(hn, 0.02);
    ink.add(box(0.044, 0.03, 0.0084, 0, 0, 0, 0.35, 8, 4).rotateX(rot).translate(c.x, c.y, c.z));
  }
  const head = curve.getPointAt(1).toArray();
  body.add(cyl(0.0008, [-0.081, 0.154, -0.098], head, 4), C.thread, M.satin);
  return finish(d, body, ink, trig, [0, DY, 0.201]);
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
