// Slosher family models (Splatoon 3 Ver.11.3.0 main weapons): Slosher (Bucket), Tri-Slosher, Sloshing Machine,
// Bloblobber, Explosher, Dread Wringer. Each body is the side silhouette of the official 3D render (400 px,
// Inkipedia "S3 <Name> 3D"), traced from its alpha channel and extruded across X. The ink surface is a flat disc
// lying on the silhouette's top edge above the opening (kept level by animateWeapon), and the native pitcher
// handle, its thumb lever and the native right-hand grip are kept at the origin. Scale is an estimate (see the
// reference doc). Everything is procedural geometry.
import { THREE, Pieces, M, V, box, sphere, slab, part, rebuild, pipe, pipeR, cyl, ring, zlathe, ylathe, xlathe, zcyl, xcyl, rotateAbout, mirrored, gripSpec } from './kit.mjs';

// Reference pixel -> weapon space for a side render: (gx, gy) = origin in the image, s = metres/pixel.
// Returns [z, y], the layout slab() takes directly (muzzle toward +Z, up = +Y).
const px = (gx, gy, s) => (x, y) => [(x - gx) * s, (gy - y) * s];

/** Height (reference px, smaller = higher) of the silhouette's top edge at column x. */
function topY(pts, x) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    if (ax === bx || (ax - x) * (bx - x) > 0) continue;
    const y = ay + ((x - ax) / (bx - ax)) * (by - ay);
    if (y < best) best = y;
  }
  return Number.isFinite(best) ? best : Math.min(...pts.map(p => p[1]));
}

// Silhouette outlines, reference pixels (muzzle right, up = -y), traced from each render's alpha channel.
const OUTLINE = {
  slosher: [[175,13],[191,17],[196,27],[191,51],[194,62],[199,74],[218,95],[245,111],[256,125],[310,148],[351,178],[357,192],[354,206],[358,214],[351,242],[331,260],[288,274],[201,361],[192,368],[176,370],[166,383],[150,386],[127,369],[72,297],[69,280],[78,254],[47,221],[41,197],[72,162],[92,162],[84,130],[87,112],[104,100],[116,67],[159,19],[169,20],[174,14]],
  diffusion: [[179,13],[189,16],[197,24],[269,126],[283,147],[278,155],[346,208],[351,218],[272,337],[266,343],[256,343],[249,338],[192,386],[67,288],[104,230],[55,202],[49,195],[50,182],[62,166],[75,157],[72,149],[75,131],[117,69],[165,19],[178,14]],
  launcher: [[176,26],[232,41],[292,66],[331,104],[355,145],[366,180],[365,221],[353,244],[333,257],[316,260],[303,274],[308,280],[299,294],[303,303],[278,320],[270,309],[273,301],[214,334],[203,348],[207,356],[182,373],[175,362],[179,353],[161,362],[121,341],[89,315],[63,284],[32,227],[37,217],[92,166],[113,157],[117,149],[98,110],[104,88],[175,27]],
  bathtub: [[113,60],[127,70],[130,78],[128,87],[110,108],[113,110],[194,123],[309,132],[358,145],[382,157],[393,180],[350,257],[333,267],[281,272],[277,282],[265,281],[250,290],[220,327],[194,336],[152,333],[139,339],[132,330],[113,335],[107,332],[105,321],[60,308],[35,293],[30,278],[35,264],[14,264],[6,256],[11,241],[51,196],[51,186],[45,177],[27,164],[26,148],[95,69],[104,61],[112,61]],
  washtub: [[282,47],[306,54],[314,49],[311,57],[329,68],[338,65],[338,80],[349,93],[356,89],[353,135],[330,154],[376,166],[384,181],[343,228],[312,240],[182,350],[139,341],[125,352],[85,340],[32,281],[35,241],[15,213],[65,164],[90,174],[72,109],[82,89],[136,49],[155,52],[166,75],[190,67],[200,76],[236,74],[244,83],[266,52],[281,48]],
  double: [[202,37],[218,43],[276,83],[284,82],[293,93],[320,94],[353,111],[380,93],[399,117],[375,141],[384,159],[308,229],[295,221],[137,341],[126,336],[91,361],[72,337],[102,311],[98,305],[86,311],[94,299],[79,269],[84,262],[76,252],[55,249],[34,264],[2,255],[0,228],[11,213],[3,179],[43,137],[75,118],[85,103],[147,58],[182,40],[201,38]],
};

// Per weapon: origin (handle centre in the render, px), scale (m/px, estimated from the body size), body colour
// and surface class, handle colour, ink-surface column (px) and radius (m).
const CFG = {
  'slosher':               { o: [110, 290], s: 0.0006,  thick: 0.09, color: '#2a2b33', mat: M.gloss, handle: '#c9c9cc', outline: 'slosher',  rim: 250, R: 0.07 },
  's3-slosher-diffusion':  { o: [150, 300], s: 0.0007,  thick: 0.08, color: '#2c3f9c', mat: M.gloss, handle: '#e8c81e', outline: 'diffusion', rim: 250, R: 0.075 },
  's3-slosher-launcher':   { o: [150, 250], s: 0.00065, thick: 0.09, color: '#7d8189', mat: M.metal, handle: '#2c2d31', outline: 'launcher', rim: 280, R: 0.06 },
  's3-slosher-bathtub':    { o: [150, 300], s: 0.0008,  thick: 0.07, color: '#eeede8', mat: M.gloss, handle: '#2b2c30', outline: 'bathtub',  rim: 230, R: 0.09 },
  's3-slosher-washtub':    { o: [150, 260], s: 0.00065, thick: 0.10, color: '#5f6b30', mat: M.satin, handle: '#2b2c30', outline: 'washtub',  rim: 290, R: 0.05 },
  's3-slosher-double':     { o: [170, 250], s: 0.00075, thick: 0.07, color: '#8a8c90', mat: M.metal, handle: '#2b2c30', outline: 'double',   rim: 200, R: 0.06 },
};

// ------------------------------------------------------------------------------------------ 3D builders
// Native slosher frame (character-weapons.js buildSlosher): the right hand holds a vertical handle at the
// origin, the container is centred at (0, BY, BZ), the support hand closes under its front (native gripL),
// the muzzle stays at the native (0, BY + .1, BZ + .03) so projectile origins are unchanged.
const BY = 0.012, BZ = 0.148;
/** Open-top box container: outer w (X) × h (Y) × dep (Z), wall t, centred at (0, cy, cz). */
function openBox(p, w, h, dep, t, cy, cz, color, mat = M.gloss) {
  const e = 0.18, y0 = cy - h / 2;
  p.add(box(w, t, dep, 0, y0 + t / 2, cz, e), color, mat);                               // floor
  for (const sx of [-1, 1]) p.add(box(t, h, dep, sx * (w - t) / 2, cy, cz, e), color, mat); // side walls
  for (const sz of [-1, 1]) p.add(box(w, h, t, 0, cy, cz + sz * (dep - t) / 2, e), color, mat); // front/back
  // rolled rim
  for (const sx of [-1, 1]) p.add(box(t * 1.8, t * 1.4, dep + t * .8, sx * (w - t) / 2, cy + h / 2, cz, .5), color, mat);
  for (const sz of [-1, 1]) p.add(box(w + t * .8, t * 1.4, t * 1.8, 0, cy + h / 2, cz + sz * (dep - t) / 2, .5), color, mat);
}
/** Flat ink surface (kept level by the native animation) as a rounded rectangle slab. */
function inkRect(w, dep, y, z) {
  return part(new Pieces().add(box(w, 0.003, dep, 0, y, z, 0.25, 16, 4), '#ffffff', M.satin), [0, y, z], 'ink');
}
function inkDisc(r, y, z) {
  return part(new Pieces().add(sphere(r, 0.0015, r, 0, y, z, 24, 6), '#ffffff', M.satin), [0, y, z], 'ink');
}
/** Vertical wire D-handle the right hand holds (native gripR at the origin), joined to the back wall at zb. */
function wireHandle(p, zb, color = '#1d1e22') {
  p.add(pipe([[0, 0.058, zb], [0, 0.06, 0.004], [0, 0.03, -0.012], [0, -0.03, -0.012], [0, -0.06, 0.004], [0, -0.058, zb]], 0.0052, 24, 8), color, M.satin);
  p.add(cyl(0.0125, [0, -0.05, -0.004], [0, 0.05, -0.004], 14), color, M.rubber);           // grip sleeve on the axis
}

function triSlosher(d) {
  // Wmn_Slosher_Diffusion: blue square tub split by two dividers into three channels, a yellow swing bail
  // with finger holes pivoting on the side walls, a black wire handle on the back wall.
  const C = { blue: '#2b3cb0', yellow: '#e3e01c', black: '#1b1c20' };
  const w = 0.19, h = 0.19, dep = 0.19, t = 0.009, cy = BY + 0.004, cz = BZ;
  const body = new Pieces(), ink = new Pieces();
  openBox(body, w, h, dep, t, cy, cz, C.blue);
  for (const sx of [-1, 1]) body.add(box(0.006, h - 0.03, dep - 2 * t, sx * w / 6, cy - 0.012, cz, 0.2), C.blue, M.gloss);   // dividers
  for (const sx of [-1, 0, 1]) body.add(box(0.02, h * 0.82, 0.006, sx * w / 3, cy - 0.01, cz + dep / 2 + 0.002, 0.3), C.blue, M.gloss); // front ribs
  for (const sx of [-1, 0, 1]) ink.add(box(w / 3 - 0.014, h * 0.55, dep - 0.03, sx * w / 3, cy - h * 0.18, cz, 0.15));        // ink in each channel
  // yellow bail: flat band arching over the opening, pivots on the side walls, leaning back toward the hand
  const top = cy + h / 2 + 0.115, arch = [];
  for (let k = 0; k <= 16; k++) { const a = Math.PI * k / 16; arch.push([Math.cos(a) * (w / 2 + 0.012), cy + 0.03 + Math.sin(a) * (top - cy - 0.03), cz]); }
  const bail = new Pieces().add(pipeR(arch, () => 0.0095, 40, 10), C.yellow, M.gloss);
  for (let k = -2; k <= 1; k++) bail.add(sphere(0.006, 0.004, 0.005, (k + 0.5) * 0.024, top + 0.006, cz), '#b9b412', M.satin);
  for (const sx of [-1, 1]) bail.add(cyl(0.011, [sx * (w / 2 - 0.002), cy + 0.03, cz], [sx * (w / 2 + 0.018), cy + 0.03, cz], 12), C.yellow, M.gloss);
  body.merge(bail.transform(g => rotateAbout(g, [1, 0, 0], -0.32, [0, cy + 0.03, cz])));
  wireHandle(body, cz - dep / 2);
  return rebuild(d, { body, ink, parts: { surface: inkRect(w - 0.04, dep - 0.04, cy + h * 0.1, cz) } });
}
function slosherMachine(d) {
  // Wmn_Slosher_Launcher: graphite machine body with a rounded crown, a big silver-bezel round port on the
  // front with spiral turbine blades and a hub, a light-grey side frame and top carry handle, a cream rear
  // block with a vent grille, four brass feet. The native right-hand handle stands on the rear block.
  const C = { body: '#4c4f57', frame: '#b9b6ab', cream: '#e4d9bd', silver: '#c6c9cc', dark: '#22242a', brass: '#b08a3c', blue: '#3a62d8' };
  const cy = BY + 0.004, cz = BZ + 0.012, w = 0.17, h = 0.165, dep = 0.15;
  const body = new Pieces(), ink = new Pieces();
  body.add(box(w, h, dep, 0, cy, cz, 0.32, 16, 10), C.body, M.satin);
  body.add(box(w * 0.92, 0.05, dep * 0.9, 0, cy + h / 2 - 0.01, cz, 0.6, 14, 6), C.body, M.satin);           // rounded crown
  for (const sx of [-1, 1]) body.add(box(0.008, h * 0.92, 0.026, sx * (w / 2 + 0.002), cy, cz + dep / 2 - 0.018, 0.3), C.frame, M.satin); // front frame strips
  // front port: silver bezel, dark throat, spiral blades, hub
  const fz = cz + dep / 2;
  body.add(ring(0.068, 0.009, 0, cy, fz + 0.004, 'z', 8, 32), C.silver, M.satin);
  body.add(zlathe([[0, fz - 0.03], [0.064, fz - 0.03], [0.064, fz + 0.002], [0, fz + 0.002]], 0, cy, 0, 28), C.dark, M.satin);
  const blades = new Pieces();
  for (let k = 0; k < 14; k++) blades.add(box(0.05, 0.004, 0.022, 0.03, 0, 0, 0.4).rotateY(0.5).rotateZ(k * Math.PI * 2 / 14), C.silver, M.satin);
  body.merge(blades.transform(g => g.translate(0, cy, fz - 0.012)));
  body.add(zlathe([[0, fz - 0.02], [0.016, fz - 0.02], [0.016, fz + 0.004], [0.009, fz + 0.008], [0, fz + 0.008]], 0, cy, 0, 18), C.silver, M.metal);
  body.add(zlathe([[0, fz + 0.007], [0.007, fz + 0.007], [0, fz + 0.011]], 0, cy, 0, 12), C.blue, M.gloss);
  // top carry handle (light grey) and bolts
  for (const sz of [-1, 1]) body.add(box(0.018, 0.04, 0.016, 0, cy + h / 2 + 0.03, cz + sz * 0.045, 0.4), C.frame, M.satin);
  body.add(box(0.022, 0.016, 0.11, 0, cy + h / 2 + 0.052, cz, 0.45), C.frame, M.satin);
  // cream rear block with a vent grille
  const rz = cz - dep / 2 - 0.03;
  body.add(box(w * 0.9, h * 0.82, 0.06, 0, cy - 0.008, rz, 0.3), C.cream, M.satin);
  for (let k = 0; k < 7; k++) body.add(box(w * 0.66, 0.005, 0.004, 0, cy - 0.055 + k * 0.016, rz - 0.031, 0.5), C.dark, M.satin);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) body.add(ylathe([[0, -0.016], [0.011, -0.016], [0.013, -0.006], [0.009, 0], [0, 0]], sx * 0.06, cy - h / 2, cz + sz * 0.05, 12), C.brass, M.metal);
  wireHandle(body, rz - 0.03);
  ink.add(zlathe([[0, fz - 0.05], [0.058, fz - 0.05], [0.058, fz - 0.032], [0, fz - 0.032]], 0, cy, 0, 24));     // ink behind the turbine
  return rebuild(d, { body, ink, parts: { surface: inkDisc(0.05, cy + 0.03, cz) } });
}
// ------------------------------------------------------------------------------------------ Bloblobber
// Wmn_Slosher_Bathtub, rebuilt from the official render, the S3 Deco turntable and the S2 turntable strip: an
// open white ceramic bathtub (thick rolled rim, sloped backrest with an overflow cap, recessed grab handles in
// both side walls, drain and jets in the floor, anti-slip strips on the front ramp) set into a black hull, a
// black strap with a print looping round the hull (chrome posts, clips, buckles), chrome rails under the front
// lip and round the back, a brown foot block under the front, and the chrome thermostat bar (red/blue ring
// knob, mixer block, two posts) across the back that the right fist holds.
// Modelled in tub space (rim top y = 0, back rim edge z = 0, front lip z = 0.30, x across) and moved so the
// fist's grip point on the faucet bar is the weapon origin. Scale: basin 0.20 m wide (reference doc).
const TUB = { a: 0.10, b: 0.15, n: 3.2, zc: 0.15 };
const TUB_GRIP = [-0.05, 0.040, 0.012];          // fist on the faucet bar, ring-knob side (tub space)
const TUB_LEVEL = -0.055;                        // ink level, 5.5 cm under the rim
// Depth scale along the tub (tub z): KIN for the basin below the rim roll, KOUT for the hull below the band.
const KIN = [[0, 0.25], [0.03, 0.4], [0.07, 0.8], [0.1, 1], [0.19, 0.95], [0.21, 0.78], [0.24, 0.5], [0.275, 0.25], [0.3, 0.18]];
const KOUT = [[0, 0.86], [0.066, 0.98], [0.1, 1], [0.13, 0.95], [0.21, 0.54], [0.266, 0.18], [0.3, 0]];
const tubLin = (tab, z) => {
  if (z <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (z <= tab[i][0]) { const [z0, a] = tab[i - 1], [z1, b] = tab[i]; return a + (b - a) * (z - z0) / (z1 - z0); }
  return tab[tab.length - 1][1];
};
/** Plan outline (superellipse) at angle th: th = 0 → +X side, π/2 → front lip, −π/2 → back. Returns [x, z]. */
function tubPlan(th) {
  const c = Math.cos(th), s = Math.sin(th), e = 2 / TUB.n;
  return [TUB.a * Math.sign(c) * Math.abs(c) ** e, TUB.zc + TUB.b * Math.sign(s) * Math.abs(s) ** e];
}
/** Outward plan normal [nx, nz] at angle th. */
function tubNormal(th) {
  const p0 = tubPlan(th - 1e-3), p1 = tubPlan(th + 1e-3), tx = p1[0] - p0[0], tz = p1[1] - p0[1], l = Math.hypot(tx, tz) || 1;
  return [tz / l, -tx / l];
}
/** Plan angle on side ±1 whose outline point lies at tub z. */
function tubTheta(z, side) {
  const u = Math.max(-1, Math.min(1, (z - TUB.zc) / TUB.b)), t = Math.asin(Math.sign(u) * Math.abs(u) ** (TUB.n / 2));
  return side > 0 ? t : Math.PI - t;
}
/** Depth remap: the basin ('in') and hull ('out') get shallower toward the back rest and the front lip. */
function tubY(y, z, layer) {
  if (layer === 'in' && y < -0.012) return -0.012 + (y + 0.012) * tubLin(KIN, z);
  if (layer === 'out' && y < -0.035) return -0.035 + (y + 0.035) * tubLin(KOUT, z);
  return y;
}
/** Shell point for a profile row [rho (fraction of the plan), delta (m along the plan normal), y, layer]. */
function tubAt(th, [rho, del, y, layer]) {
  const [px, pz] = tubPlan(th), [nx, nz] = tubNormal(th);
  const x = rho * px + del * nx, z = TUB.zc + rho * (pz - TUB.zc) + del * nz;
  return [x, tubY(y, z, layer), z];
}
/** Sweep a wall profile round the whole plan (a superellipse "lathe"); `probe` row's normal must point to `want`. */
function tubSweep(rows, N, probe, want, clampZ = null) {
  const pos = [], idx = [], m = rows.length;
  for (const r of rows) for (let k = 0; k < N; k++) {
    const p = tubAt((2 * Math.PI * k) / N, r);
    if (clampZ) p[2] = Math.max(clampZ[0], Math.min(clampZ[1], p[2]));
    pos.push(p[0], p[1], p[2]);
  }
  for (let i = 0; i < m - 1; i++) for (let k = 0; k < N; k++) {
    const a = i * N + k, b = i * N + (k + 1) % N, c = (i + 1) * N + (k + 1) % N, d = (i + 1) * N + k;
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const nrm = g.attributes.normal, v = probe * N + Math.round(N / 8);
  if (nrm.getX(v) * want[0] + nrm.getY(v) * want[1] + nrm.getZ(v) * want[2] < 0) {
    const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}
// White ceramic: basin floor centre → floor → inner wall → rolled rim → outer band → tuck under the band.
const TUB_WHITE = [
  [0, 0, -0.105, 'in'], [0.5, -0.012, -0.104, 'in'], [0.8, -0.026, -0.099, 'in'], [0.93, -0.03, -0.086, 'in'],
  [1, -0.031, -0.066, 'in'], [1, -0.027, -0.045, 'in'], [1, -0.023, -0.026, 'in'], [1, -0.0195, -0.011, 0],
  [1, -0.0178, -0.0045, 0], [1, -0.015, -0.0006, 0], [1, -0.009, 0.0008, 0], [1, -0.003, 0, 0], [1, 0.0005, -0.004, 0],
  [1, 0.0016, -0.012, 0], [1, 0.0012, -0.028, 0], [1, -0.003, -0.0335, 0], [1, -0.011, -0.036, 0],
];
// Black hull: from inside the band down the flank, round the bilge, under the bottom to the centre.
const TUB_HULL = [
  [1, -0.009, -0.031, 0], [1, -0.0125, -0.038, 0], [1, -0.0135, -0.06, 'out'], [1, -0.016, -0.095, 'out'],
  [1, -0.019, -0.125, 'out'], [0.97, -0.02, -0.143, 'out'], [0.88, -0.018, -0.155, 'out'], [0.65, -0.01, -0.16, 'out'],
  [0, 0, -0.162, 'out'],
];
/** Basin centre-line (x = 0) inner surface height at tub z, and its slope dY/dz. */
const TUB_KEEL = (() => {
  const pts = [];
  for (const th of [-Math.PI / 2, Math.PI / 2]) for (const r of TUB_WHITE.slice(0, 8)) { const p = tubAt(th, r); pts.push([p[2], p[1]]); }
  return pts.sort((a, b) => a[0] - b[0]);
})();
function tubKeel(z) {
  const y = tubLin(TUB_KEEL, z), s = (tubLin(TUB_KEEL, z + 0.004) - tubLin(TUB_KEEL, z - 0.004)) / 0.008;
  return [y, s];
}
/** Point on the hull flank (side ±1, tub z) at depth D under the rim, lifted `off` along the plan normal. */
function tubFlank(side, z, D, off = 0.0045) {
  return tubFlankAt(tubTheta(z, side), D, off);
}
const TUB_FLANK_DEL = [[-0.125, -0.019], [-0.095, -0.016], [-0.06, -0.0135], [-0.038, -0.0125]];
function tubFlankAt(th, D, off = 0.0045) {
  const z0 = tubPlan(th)[1], y = -0.035 - (D - 0.035) / Math.max(0.05, tubLin(KOUT, z0));
  const p = tubAt(th, [1, tubLin(TUB_FLANK_DEL, y) + off, y, 'out']), [nx, nz] = tubNormal(th);
  return { p, n: [nx, 0, nz] };
}
/** Hull underside point (tub x, z) lowered by `off`. */
function tubUnder(x, z, off = 0.0045) {
  const yPre = -0.162 + 0.012 * Math.max(0, (Math.abs(x) - 0.035) / 0.04) ** 2;
  return { p: [x, tubY(yPre, z, 'out') - off, z], n: [0, -1, 0] };
}
/** Flat-strap ribbon through points with per-point normals (thickness along the normal). */
function tubRibbon(points, normals, width, thick, closed = false) {
  const n = points.length, pos = [], idx = [], T = V(), N = V(), B = V(), rings = [];
  for (let i = 0; i < n; i++) {
    const a = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    N.set(...normals[i]); N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N).normalize();
    const p = V(...points[i]);
    rings.push([p.clone().addScaledVector(B, width / 2).addScaledVector(N, thick / 2), p.clone().addScaledVector(B, -width / 2).addScaledVector(N, thick / 2),
      p.clone().addScaledVector(B, -width / 2).addScaledVector(N, -thick / 2), p.clone().addScaledVector(B, width / 2).addScaledVector(N, -thick / 2)]);
  }
  const quad = (a, b, c, d) => { const o = pos.length / 3; for (const v of [a, b, c, d]) pos.push(v.x, v.y, v.z); idx.push(o, o + 2, o + 1, o, o + 3, o + 2); };
  for (let i = 0; i < (closed ? n : n - 1); i++) { const r0 = rings[i], r1 = rings[(i + 1) % n]; for (let f = 0; f < 4; f++) { const g = (f + 1) % 4; quad(r0[f], r0[g], r1[g], r1[f]); } }
  if (!closed) { const a = rings[0], b = rings[n - 1]; quad(a[3], a[2], a[1], a[0]); quad(b[0], b[1], b[2], b[3]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** Orient a geometry built facing +Z onto a surface point with normal n (up hint keeps its local +Y). */
function tubPlace(g, p, n, up = [0, 1, 0]) {
  const Z = V(...n).normalize(), X = V(...up).cross(Z).normalize(), Y = Z.clone().cross(X);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z)); return g.translate(p[0], p[1], p[2]);
}
// Block glyphs for the strap print, in a 5 x 7 cell: [u0, v0, u1, v1] bars (u right, v up).
const TUB_GLYPHS = {
  H: [[0, 0, 1, 7], [4, 0, 5, 7], [1, 3, 4, 4]], I: [[2, 0, 3, 7]], L: [[0, 0, 1, 7], [1, 0, 5, 1]],
  K: [[0, 0, 1, 7], [1, 3, 2, 4], [2, 4, 3, 5.5], [3, 5.5, 4.2, 7], [2, 2, 3, 3], [3, 0, 4.2, 2]], O: [[0, 1, 1, 6], [4, 1, 5, 6], [1, 0, 4, 1], [1, 6, 4, 7]],
};

function bloblobber(d) {
  const C = { white: '#efede4', hull: '#2f2f2e', strap: '#161617', clip: '#121213', chrome: '#c9cdd2', dark: '#1c1d20',
    slot: '#4f5156', brown: '#5e4f43', print: '#e9e9e6', red: '#d8262c', blue: '#2848c8', label: '#b9bcc0' };
  const tub = new Pieces(), ink = new Pieces(), knob = new Pieces(), surf = new Pieces();
  // ---- ceramic tub and hull
  tub.add(tubSweep(TUB_WHITE, 64, 10, [0, 1, 0]), C.white, M.gloss);
  tub.add(tubSweep(TUB_HULL, 64, 7, [0, -1, 0]), C.hull, M.satin);
  // ---- basin details: overflow cap on the back rest, drain, jets, anti-slip strips (team ink), grab recesses
  const keelUp = [0, 0, 1], keelN = z => { const [, s] = tubKeel(z), l = Math.hypot(1, s); return [0, 1 / l, -s / l]; };
  { const z = 0.036, [y] = tubKeel(z);
    tub.add(tubPlace(zlathe([[0, -0.004], [0.0105, -0.004], [0.0105, 0.002], [0.0075, 0.0055], [0, 0.0065]], 0, 0, 0, 6), [0, y, z], keelN(z), keelUp), C.chrome, M.gloss); }
  { const z = 0.165, [y] = tubKeel(z), n = keelN(z);
    tub.add(tubPlace(ring(0.0135, 0.0032, 0, 0, 0, 'z', 6, 20), [0, y + 0.0012, z], n, keelUp), C.chrome, M.gloss);
    tub.add(tubPlace(zcyl(0.0108, -0.003, 0.0006, 0, 0, 16), [0, y, z], n, keelUp), C.dark, M.satin);
    for (const a of [0, Math.PI / 2]) tub.add(tubPlace(box(0.02, 0.0025, 0.002, 0, 0, 0.001, 0.4, 6, 4).rotateZ(a), [0, y, z], n, keelUp), C.chrome, M.gloss); }
  for (const z of [0.207, 0.222]) for (const sx of [-1, 1]) { const [y] = tubKeel(z);
    tub.add(tubPlace(zcyl(0.0036, -0.002, 0.0009, 0, 0, 10), [sx * 0.012, y, z], keelN(z), keelUp), C.dark, M.satin); }
  for (const sx of [-1, 1]) { const z = 0.25, [y] = tubKeel(z);
    ink.add(tubPlace(box(0.027, 0.008, 0.0024, 0, 0, 0.0004, 0.35, 8, 4), [sx * 0.022, y, z], keelN(z), keelUp)); }
  for (const sx of [-1, 1]) {
    const yPre = -0.034, wall = z => tubAt(tubTheta(z, sx), [1, -0.0255, yPre, 'in']);
    const slot = new Pieces().add(box(0.0035, 0.024, 0.104, 0, 0, 0, 0.3, 12, 6), C.slot, M.satin);
    const w = wall(0.17); slot.transform(g => g.rotateZ(-sx * 0.2).translate(w[0] - sx * 0.0008, w[1], 0.17));
    tub.merge(slot);
    const z0 = 0.122, z1 = 0.218, a = wall(z0), b = wall(z1), m = wall(0.17);
    tub.add(pipe([[a[0] - sx * 0.001, a[1], z0], [a[0] - sx * 0.008, a[1], z0 + 0.012], [m[0] - sx * 0.0095, m[1], 0.17],
      [b[0] - sx * 0.008, b[1], z1 - 0.012], [b[0] - sx * 0.001, b[1], z1]], 0.0042, 24, 8), C.chrome, M.gloss);
    for (const [p, z] of [[a, z0 + 0.005], [b, z1 - 0.005]]) tub.add(sphere(0.0058, 0.0058, 0.0058, p[0] - sx * 0.004, p[1], z, 10, 6), C.chrome, M.gloss);
  }
  // ---- faucet (thermostat) bar across the back: axis (y .040, z .012); the −X knob carries the red/blue rings
  const fy = 0.040, fz = 0.012;
  tub.add(xcyl(0.016, -0.056, 0.056, fy, fz, 20), C.chrome, M.gloss);
  const knobGeo = sx => { const g = xlathe([[0, 0.057], [0.0168, 0.057], [0.0175, 0.06], [0.0175, 0.081], [0.0162, 0.0855], [0.006, 0.0862], [0, 0.0862]], 0, 0, 0, 8);
    return (sx < 0 ? mirrored(g) : g).translate(0, fy, fz); };
  tub.add(knobGeo(1), C.chrome, M.gloss);
  knob.add(knobGeo(-1), C.chrome, M.gloss);
  for (const sx of [-1, 1]) {
    (sx < 0 ? knob : tub).add(ring(0.0158, 0.0011, sx * 0.0566, fy, fz, 'x', 4, 20), C.dark, M.satin);       // joint groove
    (sx < 0 ? knob : tub).add(xcyl(0.0065, sx * 0.0862, sx * 0.0868, fy, fz, 10), '#8d9196', M.gloss);       // end boss
  }
  knob.add(ring(0.0176, 0.0013, -0.0745, fy, fz, 'x', 4, 20), C.red, M.gloss);
  knob.add(ring(0.0176, 0.0013, -0.0672, fy, fz, 'x', 4, 20), C.blue, M.gloss);
  tub.add(box(0.054, 0.02, 0.026, 0.004, 0.027, 0.024, 0.28), C.chrome, M.gloss);                             // mixer block
  for (const sx of [-1, 1]) tub.add(cyl(0.0045, [0.004 + sx * 0.023, -0.002, 0.014], [0.004 + sx * 0.023, 0.03, 0.014], 10), C.chrome, M.gloss);
  for (const sx of [-1, 1]) tub.add(cyl(0.0068, [0.004 + sx * 0.023, 0.0002, 0.014], [0.004 + sx * 0.023, 0.003, 0.014], 12), C.chrome, M.gloss);
  { const z = 0.0215, [y] = tubKeel(z);
    tub.add(tubPlace(box(0.03, 0.0095, 0.0015, 0, 0, 0.0004, 0.25, 6, 4), [0, y, z], keelN(z), keelUp), C.label, M.print);
    tub.add(tubPlace(box(0.022, 0.0035, 0.0006, 0, 0, 0.0013, 0.4, 6, 4), [0, y, z], keelN(z), keelUp), C.dark, M.print); }
  // ---- strap: one closed loop — buckle → upper flank → round the back → other flank → buckle → lower flank → under the bottom
  const S = [];
  const upper = [[0.236, 0.046], [0.2, 0.045], [0.16, 0.046], [0.12, 0.049], [0.085, 0.055], [0.055, 0.065], [0.03, 0.076]];
  const lower = [[0.205, 0.068], [0.17, 0.083], [0.135, 0.104], [0.105, 0.127]];
  for (const [z, D] of upper) S.push(tubFlank(1, z, D));
  for (const dt of [0.75, 0.38, 0, -0.38, -0.75]) S.push(tubFlankAt(-Math.PI / 2 + dt, 0.088));
  for (const [z, D] of [...upper].reverse()) S.push(tubFlank(-1, z, D));
  for (const [z, D] of lower) S.push(tubFlank(-1, z, D));
  for (const x of [-0.07, -0.035, 0, 0.035, 0.07]) S.push(tubUnder(x, 0.092));
  for (const [z, D] of [...lower].reverse()) S.push(tubFlank(1, z, D));
  tub.add(tubRibbon(S.map(s => s.p), S.map(s => s.n), 0.018, 0.0036, true), C.strap, M.rubber);
  // strap hardware per flank: front buckle, chrome post between the upper and lower strap with clips
  for (const sx of [-1, 1]) {
    const bk = tubFlank(sx, 0.228, 0.05, 0.0075);
    tub.add(tubPlace(box(0.028, 0.026, 0.009, 0, 0, 0, 0.3, 8, 6), bk.p, bk.n), C.clip, M.rubber);
    tub.add(tubPlace(box(0.016, 0.006, 0.004, 0, 0.004, 0.005, 0.4, 6, 4), bk.p, bk.n), '#3a3b3e', M.satin);
    const a = tubFlank(sx, 0.058, 0.064, 0.011).p, b = tubFlank(sx, 0.098, 0.13, 0.011).p;
    tub.add(cyl(0.0068, a, b, 14), C.chrome, M.gloss);
    for (const [z, D] of [[0.058, 0.064], [0.098, 0.13]]) { const c = tubFlank(sx, z, D, 0.0085);
      tub.add(tubPlace(box(0.024, 0.026, 0.011, 0, 0, 0, 0.3, 8, 6), c.p, c.n), C.clip, M.rubber); }
  }
  // strap print on the upper flank strap: chevrons (pointing to the front lip), HILKO, red logo; each flank reads
  // left → right for its own viewer (tubPlace's local +X is the viewer's right on both flanks)
  for (const sx of [-1, 1]) {
    const fAt = z => tubLin([[0.085, 0.055], [0.12, 0.049], [0.16, 0.046], [0.2, 0.045]], z);
    const put = (g, z, color) => {
      const c = tubFlank(sx, z, fAt(z), 0.0045 + 0.0019), c0 = tubFlank(sx, z - 0.01, fAt(z - 0.01)).p, c1 = tubFlank(sx, z + 0.01, fAt(z + 0.01)).p;
      g.rotateZ((sx > 0 ? -1 : 1) * Math.atan2(c1[1] - c0[1], c1[2] - c0[2]));     // follow the strap's run
      tub.add(tubPlace(g, c.p, c.n), color, M.print);
    };
    const tip = -sx, read = sx > 0 ? -1 : 1;                   // local x of the front lip; world z step of reading
    for (const z of [0.112, 0.124, 0.136]) for (const s of [-1, 1])
      put(box(0.0075, 0.0018, 0.0005, 0, 0, 0, 0.5, 6, 4).rotateZ(-s * tip * 0.75).translate(-tip * 0.0022, s * 0.0028, 0), z, C.print);
    const word = 'HILKO', cell = 0.0013;
    for (let i = 0; i < word.length; i++) {
      const g = new Pieces();
      for (const [u0, v0, u1, v1] of TUB_GLYPHS[word[i]])
        g.add(box((u1 - u0) * cell + 0.0004, (v1 - v0) * cell + 0.0004, 0.0005, ((u0 + u1) / 2 - 2.5) * cell, ((v0 + v1) / 2 - 3.5) * cell, 0, 0.5, 6, 4));
      put(g.build(), 0.178 + read * (i - 2) * 0.0105, C.print);
    }
    put(sphere(0.0058, 0.0058, 0.0005, 0, 0, 0, 12, 4), 0.212, C.red);
    put(sphere(0.0034, 0.0034, 0.0006, 0, 0, 0.0002, 10, 4), 0.212, C.strap);
  }
  // ---- chrome rails: front U under the lip (into the flanks), back U round the hull
  for (const [pts, r] of [
    [[[0.072, -0.058, 0.172], [0.089, -0.064, 0.205], [0.087, -0.066, 0.258], [0.066, -0.067, 0.292], [0.03, -0.067, 0.303], [0, -0.067, 0.304]], 0.0088],
    [[[0.07, -0.07, 0.045], [0.072, -0.075, 0.016], [0.05, -0.078, -0.008], [0.022, -0.079, -0.013], [0, -0.079, -0.014]], 0.0068],
  ]) tub.add(pipe([...pts, ...[...pts].reverse().slice(1).map(([x, y, z]) => [-x, y, z])], r, 40, 10), C.chrome, M.gloss);
  for (const sx of [-1, 1]) for (const [x, y, z] of [[0.074, -0.058, 0.175], [0.07, -0.07, 0.047]])
    tub.add(cyl(0.0118, [sx * (x - 0.008), y, z], [sx * (x + 0.002), y, z], 14), '#8d9196', M.gloss);           // rail sockets
  // ---- brown foot block under the front lip, bottom ledge
  tub.add(box(0.104, 0.022, 0.038, 0, -0.054, 0.279, 0.3, 10, 6), C.brown, M.satin);
  { const z = 0.19; tub.add(box(0.13, 0.009, 0.022, 0, tubY(-0.162, z, 'out') - 0.002, z, 0.3, 10, 6), '#202021', M.satin); }
  // ---- ink: level free surface inside the basin (kept level by the native slosher animation)
  const sr = [[0, 0, TUB_LEVEL, 0], [1, -0.022, TUB_LEVEL, 0], [1, -0.022, TUB_LEVEL - 0.003, 0], [0, 0, TUB_LEVEL - 0.003, 0]];
  surf.add(tubSweep(sr, 48, 1, [0, 1, 0], [0.036, 0.236]), '#ffffff', M.satin);
  // ---- tub space → weapon space (grip point on the bar at the origin)
  const [gx, gy, gz] = TUB_GRIP, mv = g => g.translate(-gx, -gy, -gz);
  tub.transform(mv); ink.transform(mv); knob.transform(mv); surf.transform(mv);
  const W = (x, y, z) => [x - gx, y - gy, z - gz];
  return rebuild(d, {
    body: tub, ink,
    parts: { surface: part(surf, W(0, TUB_LEVEL, 0.135), 'ink'), lever: part(knob, W(-0.07, fy, fz)) },
    // right fist round the faucet bar: thumb along +X (toward the mixer block), wrist away from the tub's mass
    gripR: gripSpec([0, 0, 0], [1, 0, 0], [0, 0.42, -0.9]),
    gripL: gripSpec(W(0, -0.067, 0.304), [-1, 0, 0], [0.25, -0.85, 0.45]),
    muzzle: W(0, 0.005, 0.17),                                  // basin opening (the blobs leave the tub here)
  });
}
// Hanging one-hand carry by the faucet bar (S2/S3 promo): the tub hangs below the fist with its opening forward.
// Yaw π + roll π orient the same hang as pitch 1.14 but flip the native heave's pitch sense, so the slosh
// heave scoops the tub forward and up (windup back, release with the opening to the target).
const BATHTUB_HOLD = {
  carry: { p: [-0.2, 0.67, 0.06], r: [2.0, Math.PI - 0.25, Math.PI] }, twoCarry: 0,
  run: { p: [-0.21, 0.69, 0.05], r: [1.88, Math.PI - 0.3, Math.PI] },
  aim: { p: [-0.17, -0.25, 0.08], r: [1.92, Math.PI - 0.2, Math.PI] }, twoAim: 0,
  raise: { p: [-0.2, 1.08, 0.16], r: [1.2, Math.PI - 0.3, Math.PI] },
  lobby: { p: [-0.2, 0.67, 0.08], r: [2.0, Math.PI - 0.35, Math.PI] }, lobbyTwo: 0,
};
/** Aim pitch must not swing the hanging tub backward (its euler pitch sense is flipped by the yaw/roll π). */
function bathtubPose(ch, dt, s, CH) {
  const w = ch.wAim || 0;
  if (w > 0.001 && CH && Number.isInteger(CH.ANCR)) ch.P[CH.ANCR] += (ch.aimP || 0) * w;
}
function explosher(d) {
  // Wmn_Slosher_Washtub: an olive jerry can with embossed side panels and a dark back panel, a brass barrel
  // with a bar grid on its mouth angled up from the front shoulder (silver collar, orange spring clamps),
  // a chrome tube cage round both flanks and a black rubber top handle.
  const C = { olive: '#5f6a2c', oliveD: '#4b5523', brass: '#b9893a', silver: '#c8cbcf', chrome: '#c3c6ca', black: '#1e1f23', orange: '#e8662a', panel: '#2b2d35' };
  const cy = BY - 0.004, cz = BZ + 0.02, w = 0.13, h = 0.2, dep = 0.19;
  const body = new Pieces(), ink = new Pieces();
  body.add(box(w, h, dep, 0, cy, cz, 0.28, 14, 10), C.olive, M.satin);
  for (const sx of [-1, 1]) {
    body.add(box(0.008, h * 0.7, dep * 0.62, sx * (w / 2 + 0.002), cy - 0.01, cz, 0.3), C.oliveD, M.satin);     // embossed panel
    body.add(box(0.004, 0.012, dep * 0.8, sx * (w / 2 + 0.005), cy - 0.01, cz, 0.4).rotateX(0.6).translate(0, 0, 0), C.oliveD, M.satin);
  }
  body.add(box(w * 0.92, h * 0.86, 0.012, 0, cy - 0.006, cz - dep / 2 - 0.004, 0.25), C.panel, M.satin);        // back panel
  body.add(box(0.03, 0.026, 0.002, 0.025, cy + 0.03, cz - dep / 2 - 0.011, 0.2), '#e8c21a', M.print);          // warning label
  // brass barrel on the front shoulder, angled up
  const bz = cz + dep / 2 - 0.02, by = cy + h / 2 - 0.02;
  const barrel = new Pieces();
  barrel.add(zlathe([[0, -0.02], [0.044, -0.02], [0.044, 0.05], [0.05, 0.056], [0.05, 0.066], [0.04, 0.066], [0.04, 0.06], [0, 0.06]], 0, 0, 0, 24), C.brass, M.metal);
  barrel.add(ring(0.046, 0.006, 0, 0, 0.0, 'z', 6, 24), C.silver, M.metal);
  for (const z of [0.012, 0.03]) barrel.add(ring(0.047, 0.004, 0, 0, z, 'z', 5, 24), C.orange, M.gloss);
  for (let k = -2; k <= 2; k++) barrel.add(box(0.004, 0.084, 0.004, k * 0.016, 0, 0.064, 0.5), C.brass, M.metal);  // bar grid
  body.merge(barrel.transform(g => g.rotateX(-0.5).translate(0, by, bz)));
  ink.add(zlathe([[0, -0.01], [0.038, -0.01], [0.038, 0.055], [0, 0.055]], 0, 0, 0, 20).rotateX(-0.5).translate(0, by, bz)); // ink in the barrel
  // chrome cage on both flanks + black top handle
  for (const sx of [-1, 1]) body.add(pipe([[sx * 0.078, cy - h / 2 + 0.01, cz - dep / 2 + 0.02], [sx * 0.08, cy - h / 2 - 0.006, cz + 0.03],
    [sx * 0.082, cy + 0.02, cz + dep / 2 + 0.03], [sx * 0.07, cy + h / 2 + 0.05, cz + 0.03], [sx * 0.07, cy + h / 2 + 0.06, cz - 0.04]], 0.0055, 40, 8), C.chrome, M.metal);
  body.add(cyl(0.012, [-0.07, cy + h / 2 + 0.06, cz - 0.04], [0.07, cy + h / 2 + 0.06, cz - 0.04], 14), C.black, M.rubber);
  wireHandle(body, cz - dep / 2 - 0.006, C.chrome);
  return rebuild(d, { body, ink, parts: { surface: inkDisc(0.035, cy + 0.06, cz) } });
}
function dreadWringer(d) {
  // Wmn_Slosher_Double: a low wide mop bucket — yellow open tub at the front, a grey metal wringer housing
  // at the back with two black rubber rollers and a long grey press lever hinged over it, a flat grey base
  // tray and two small rear wheels.
  const C = { yellow: '#e4d21c', grey: '#7d8086', greyD: '#5c5f65', black: '#1d1e22', tray: '#9a9da2' };
  const cy = BY - 0.03, cz = BZ + 0.03;
  const body = new Pieces(), ink = new Pieces();
  body.add(box(0.17, 0.02, 0.31, 0, cy - 0.06, cz, 0.3), C.tray, M.satin);                                       // base tray
  openBox(body, 0.15, 0.15, 0.17, 0.008, cy + 0.02, cz + 0.06, C.yellow);                                                 // yellow tub (front)
  body.add(box(0.15, 0.13, 0.12, 0, cy + 0.012, cz - 0.085, 0.25), C.grey, M.satin);                             // wringer housing (back)
  for (const z of [-0.06, -0.025]) body.add(cyl(0.018, [-0.065, cy + 0.09, cz + z], [0.065, cy + 0.09, cz + z], 16), C.black, M.rubber); // rollers
  for (const sx of [-1, 1]) body.add(box(0.012, 0.05, 0.08, sx * 0.072, cy + 0.08, cz - 0.045, 0.3), C.greyD, M.satin);         // roller cheeks
  // press lever: two grey bars from the back hinge rising over the tub, joined by a cross bar
  for (const sx of [-1, 1]) body.add(pipe([[sx * 0.06, cy + 0.09, cz - 0.13], [sx * 0.06, cy + 0.135, cz - 0.04], [sx * 0.055, cy + 0.12, cz + 0.08]], 0.007, 20, 6), C.greyD, M.satin);
  body.add(cyl(0.009, [-0.06, cy + 0.12, cz + 0.08], [0.06, cy + 0.12, cz + 0.08], 12), C.greyD, M.satin);
  for (const sx of [-1, 1]) body.add(cyl(0.016, [sx * 0.075, cy - 0.06, cz - 0.13], [sx * 0.09, cy - 0.06, cz - 0.13], 14), C.black, M.rubber); // wheels
  wireHandle(body, cz - 0.145, C.greyD);
  ink.add(box(0.13, 0.08, 0.15, 0, cy - 0.005, cz + 0.06, 0.2));                                                  // ink in the tub
  return rebuild(d, { body, ink, parts: { surface: inkRect(0.12, 0.13, cy + 0.035, cz + 0.06) } });
}
const BUILD3D = { 's3-slosher-diffusion': triSlosher, 's3-slosher-launcher': slosherMachine, 's3-slosher-bathtub': bloblobber,
  's3-slosher-washtub': explosher, 's3-slosher-double': dreadWringer };

/** Builds one slosher on the native slosher def `d`: silhouette body, pitcher handle, ink surface and lever. */
function model(d, c) {
  const pts = OUTLINE[c.outline], P = px(c.o[0], c.o[1], c.s);
  const body = new Pieces();
  body.add(slab(pts.map(([x, y]) => P(x, y)), c.thick, 0, 0.004), c.color, c.mat);
  body.add(box(0.0236, 0.1, 0.0276, 0, 0, 0, 0.5, 12, 8), c.handle, M.rubber);   // pitcher handle at the origin
  const [z, y] = P(c.rim, topY(pts, c.rim));                                       // ink level on the rim above the opening
  // The disc goes through Pieces so it carries the colour/surface attributes finishParts merges on.
  const disc = new Pieces().add(sphere(c.R, 0.0015, c.R, 0, y + 0.002, z, 24, 6), '#ffffff', M.satin);
  const surface = part(disc, [0, y + 0.002, z], 'ink');
  // The native muzzle socket is kept: it is the real projectile origin, and the nozzle position is unverified.
  return rebuild(d, {
    body, ink: new Pieces(), keepParts: ['lever'],
    parts: { surface },
  });
}

// Per-weapon hold / pose extras (Bloblobber: hanging one-hand carry by the faucet bar, native data carry).
const EXTRA = { 's3-slosher-bathtub': { hold: BATHTUB_HOLD, nativeCarry: true, pose: bathtubPose } };

// The legacy Slosher keeps its reference model: its verified drawn-fill drain and indexed handle
// regressions (weapon-detail-motion tests) depend on that bucket's inner fill and handles.
export const MODELS = Object.fromEntries(Object.entries(CFG).filter(([id]) => id !== 'slosher').map(([id, c]) => [id, {
  sourceModel: id === 'slosher' ? 'Wmn_Slosher_StrongT'
    : id === 's3-slosher-diffusion' ? 'Wmn_Slosher_Diffusion'
    : id === 's3-slosher-launcher' ? 'Wmn_Slosher_Launcher'
    : id === 's3-slosher-bathtub' ? 'Wmn_Slosher_Bathtub'
    : id === 's3-slosher-washtub' ? 'Wmn_Slosher_Washtub' : 'Wmn_Slosher_Double',
  build: d => (BUILD3D[id] || (dd => model(dd, c)))(d),
  ...(EXTRA[id] || {}),
}]));
