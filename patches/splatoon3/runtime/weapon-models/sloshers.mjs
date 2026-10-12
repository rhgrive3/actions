// Slosher family models (Splatoon 3 Ver.11.3.0 main weapons): Slosher (Bucket), Tri-Slosher, Sloshing Machine,
// Bloblobber, Explosher, Dread Wringer. Each body is the side silhouette of the official 3D render (400 px,
// Inkipedia "S3 <Name> 3D"), traced from its alpha channel and extruded across X. The ink surface is a flat disc
// lying on the silhouette's top edge above the opening (kept level by animateWeapon), and the native pitcher
// handle, its thumb lever and the native right-hand grip are kept at the origin. Scale is an estimate (see the
// reference doc). Everything is procedural geometry.
import { THREE, Pieces, M, V, box, sphere, slab, part, rebuild, pipe, pipeR, cyl, ring, zlathe, ylathe, xlathe, zcyl, xcyl, rotateAbout, mirrored, gripSpec, frontSlab, roundRect } from './kit.mjs';

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
  bathtub: [[113,60],[127,70],[130,78],[128,87],[110,108],[113,110],[194,123],[309,132],[358,145],[382,157],[393,180],[350,257],[333,267],[281,272],[277,282],[265,281],[250,290],[220,327],[194,336],[152,333],[139,339],[132,330],[113,335],[107,332],[105,321],[60,308],[35,293],[30,278],[35,264],[14,264],[6,256],[11,241],[51,196],[51,186],[45,177],[27,164],[26,148],[95,69],[104,61],[112,61]],
  washtub: [[282,47],[306,54],[314,49],[311,57],[329,68],[338,65],[338,80],[349,93],[356,89],[353,135],[330,154],[376,166],[384,181],[343,228],[312,240],[182,350],[139,341],[125,352],[85,340],[32,281],[35,241],[15,213],[65,164],[90,174],[72,109],[82,89],[136,49],[155,52],[166,75],[190,67],[200,76],[236,74],[244,83],[266,52],[281,48]],
  double: [[202,37],[218,43],[276,83],[284,82],[293,93],[320,94],[353,111],[380,93],[399,117],[375,141],[384,159],[308,229],[295,221],[137,341],[126,336],[91,361],[72,337],[102,311],[98,305],[86,311],[94,299],[79,269],[84,262],[76,252],[55,249],[34,264],[2,255],[0,228],[11,213],[3,179],[43,137],[75,118],[85,103],[147,58],[182,40],[201,38]],
};

// Per weapon: origin (handle centre in the render, px), scale (m/px, estimated from the body size), body colour
// and surface class, handle colour, ink-surface column (px) and radius (m).
const CFG = {
  'slosher':               { o: [110, 290], s: 0.0006,  thick: 0.09, color: '#2a2b33', mat: M.gloss, handle: '#c9c9cc', outline: 'slosher',  rim: 250, R: 0.07 },
  's3-slosher-diffusion':  { o: [150, 300], s: 0.0007,  thick: 0.08, color: '#2c3f9c', mat: M.gloss, handle: '#e8c81e', outline: 'diffusion', rim: 250, R: 0.075 },
  's3-slosher-launcher':   {},   // own builder: sloshingMachine()
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
// ------------------------------------------------------------------------------------------ Sloshing Machine
// Wmn_Slosher_Launcher, rebuilt from the official render (vanilla colours), the S3 Neo render and the S3 Neo turntable
// (shape): a chunky barrel-sided machine. The front housing (a team-ink frame — light grey in the renders, blue in the
// Neo turntable — with dark inlaid side panels) carries the big port: a thick polished bezel ring on four standoffs in
// front of a deep turbine drum (24 pitched stator vanes round the wall, a dark three-blade impeller with an ink lens on
// its axis). A carry bar spans the roof over a through-tunnel (right hand); a dark steel bracket plate sits on the front
// chamfer; a metal band separates the dark middle section (label windows) from the cream rear section (open V top, the
// back wall rising into the rear carry bar for the left hand, a round slatted grille on the convex back, side grooves);
// four brass feet with knurled pads. Modelled in machine space (y = 0 housing bottom, z = 0 front housing rear face,
// x across) and moved so the right fist's point on the front bar is the weapon origin. Scale 0.00066 m/px from the
// turntable's pure side frame (reference doc).
const SM = { yc: 0.114, Rt: 0.0675, deck: 0.246, grip: [0, 0.271, 0.02], rear: [0, 0.197, -0.1665], level: 0.072 };
/** Smooth (cubic Hermite, Catmull-Rom slopes) interpolation through [[x, y], ...] sorted by x, clamped at the ends. */
function smCurve(tab, x) {
  const n = tab.length;
  if (x <= tab[0][0]) return tab[0][1];
  if (x >= tab[n - 1][0]) return tab[n - 1][1];
  let i = 0; while (x > tab[i + 1][0]) i++;
  const p0 = tab[Math.max(0, i - 1)], p1 = tab[i], p2 = tab[i + 1], p3 = tab[Math.min(n - 1, i + 2)], h = p2[0] - p1[0];
  const m1 = (p2[1] - p0[1]) / (p2[0] - p0[0]) * h, m2 = (p3[1] - p1[1]) / (p3[0] - p1[0]) * h, t = (x - p1[0]) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
}
const smLin = (tab, x) => {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) return tab[i - 1][1] + (tab[i][1] - tab[i - 1][1]) * (x - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]);
  return tab[tab.length - 1][1];
};
// half-widths by height (barrel sides): front housing (front view, perspective-corrected) and rear section (back view)
const SM_WF = [[0, 0.096], [0.03, 0.104], [0.08, 0.111], [0.13, 0.113], [0.18, 0.11], [0.22, 0.102], [0.26, 0.092], [0.29, 0.085]];
const SM_WR = [[0, 0.083], [0.04, 0.09], [0.1, 0.094], [0.15, 0.093], [0.21, 0.088]];
const smWf = y => smCurve(SM_WF, y), smWr = y => smCurve(SM_WR, y);
// front housing's front surface z by height (traced from the turntable's pure side frame): a convex arc from the
// rounded bottom edge through the near-vertical port face to the roof
const SM_FRONT = [[0, 0.064], [0.0165, 0.078], [0.033, 0.0838], [0.0594, 0.0865], [0.0858, 0.0878], [0.1188, 0.0878], [0.1518, 0.0865],
  [0.1815, 0.0825], [0.2046, 0.0759], [0.2244, 0.066], [0.2442, 0.0528], [0.2627, 0.0396], [0.2772, 0.0264], [0.2805, 0.0211]];
const smFz = y => smCurve(SM_FRONT, y);
/** Front surface at height y: outward normal (0, ny, nz) and the rotateX angle that lays local +Y along it (local +Z = n). */
function smFrontN(y) { const s = (smFz(y + 0.002) - smFz(y - 0.002)) / 0.004, l = Math.hypot(1, s); return { n: [0, -s / l, 1 / l], a: Math.atan(s) }; }
const SM_BACK = [[0, -0.129], [0.012, -0.145], [0.028, -0.155], [0.05, -0.163], [0.075, -0.168], [0.1, -0.171], [0.12, -0.1722], [0.21, -0.1722]];
const SM_CORE = [[-0.1722, 0.148], [-0.168, 0.152], [-0.155, 0.157], [-0.145, 0.161], [-0.13, 0.167], [-0.12, 0.172], [-0.1, 0.182], [-0.084, 0.19]];
const SM_VTOP = [[-0.169, 0.203], [-0.149, 0.207], [-0.122, 0.177], [-0.086, 0.191]];

/** Indexed mesh whose triangles are wound to face a given direction (robust for hand-built shells). */
class SmMesh {
  constructor() { this.pos = []; this.idx = []; }
  v(p) { this.pos.push(p[0], p[1], p[2]); return this.pos.length / 3 - 1; }
  tri(a, b, c, D) {
    const P = this.pos, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const d = (uy * vz - uz * vy) * D[0] + (uz * vx - ux * vz) * D[1] + (ux * vy - uy * vx) * D[2];
    if (d < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
  }
  quad(a, b, c, d, D) { this.tri(a, b, c, D); this.tri(a, c, d, D); }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setIndex(this.idx); g.computeVertexNormals(); return g;
  }
}
/** Closed rounded-rectangle section in XY at height b..t whose half-width follows k·w(y) + o (barrel sides),
 *  corner radius rc; n points (multiple of 4), sampled by arc length per quadrant from the right-middle, CCW. */
function smSection(s, n) {
  const k = s.k ?? 1, o = s.o ?? 0, W = y => k * s.w(y) + o, rc = Math.min(s.rc ?? 0.012, (s.t - s.b) / 2 - 1e-4);
  const ym = (s.b + s.t) / 2, yt = s.t - rc, yb = s.b + rc, wT = W(yt), wB = W(yb);
  const side = (out, y0, y1, sx, m) => { for (let i = 0; i <= m; i++) { const y = y0 + (y1 - y0) * i / m; out.push([sx * W(y), y]); } };
  const arc = (out, cx, cy, a0, a1, m) => { for (let i = 0; i <= m; i++) { const a = a0 + (a1 - a0) * i / m; out.push([cx + rc * Math.cos(a), cy + rc * Math.sin(a)]); } };
  const Q = [[], [], [], []];
  side(Q[0], ym, yt, 1, 8); arc(Q[0], wT - rc, yt, 0, Math.PI / 2, 6); Q[0].push([0, s.t]);
  Q[1].push([0, s.t]); arc(Q[1], -(wT - rc), yt, Math.PI / 2, Math.PI, 6); side(Q[1], yt, ym, -1, 8);
  side(Q[2], ym, yb, -1, 8); arc(Q[2], -(wB - rc), yb, Math.PI, 1.5 * Math.PI, 6); Q[2].push([0, s.b]);
  Q[3].push([0, s.b]); arc(Q[3], wB - rc, yb, 1.5 * Math.PI, 2 * Math.PI, 6); side(Q[3], yb, ym, 1, 8);
  const out = [], m = n / 4;
  for (const q of Q) {
    const L = [0]; for (let i = 1; i < q.length; i++) L.push(L[i - 1] + Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]));
    for (let j = 0, i = 1; j < m; j++) {
      const at = L[L.length - 1] * j / m; while (i < q.length - 1 && L[i] < at) i++;
      const u = L[i] > L[i - 1] ? (at - L[i - 1]) / (L[i] - L[i - 1]) : 0;
      out.push([q[i - 1][0] + (q[i][0] - q[i - 1][0]) * u, q[i - 1][1] + (q[i][1] - q[i - 1][1]) * u, s.z]);
    }
  }
  return { r: out, ym };
}
/** Z-loft of barrel sections (see smSection), flat back cap; front = null (flat cap) or { yc, r }: the front cap is an
 *  annulus round a circular opening (the port throat) centred at (0, yc). */
function smLoft(secs, n = 48, front = null) {
  const m = new SmMesh(), rings = secs.map(s => { const R = smSection(s, n); return { ...R, id: R.r.map(p => m.v(p)) }; });
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) {
    const A = rings[k], B = rings[k + 1], j = (i + 1) % n, p = A.r[i];
    m.quad(A.id[i], A.id[j], B.id[j], B.id[i], [p[0], p[1] - (A.ym + B.ym) / 2, 0]);
  }
  const R0 = rings[0], R1 = rings[rings.length - 1];
  { const ids = R0.r.map(p => m.v(p)), c = m.v([0, R0.ym, R0.r[0][2]]); for (let i = 0; i < n; i++) m.tri(c, ids[i], ids[(i + 1) % n], [0, 0, -1]); }
  const ids = R1.r.map(p => m.v(p)), z = R1.r[0][2];
  if (front) {
    const inner = R1.r.map(p => { const a = Math.atan2(p[1] - front.yc, p[0]); return m.v([front.r * Math.cos(a), front.yc + front.r * Math.sin(a), z]); });
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; m.quad(ids[i], ids[j], inner[j], inner[i], [0, 0, 1]); }
  } else { const c = m.v([0, R1.ym, z]); for (let i = 0; i < n; i++) m.tri(c, ids[i], ids[(i + 1) % n], [0, 0, 1]); }
  return m.geo();
}
/** Thin plate lying on a barrel side (sx = ±1), parametrised at(u, v) → [y, z] over the unit square; faces at
 *  |x| = w(y) + o1 (outer) and w(y) + o0 (inner), closed by rim strips. */
function smPlateUV(sx, at, w, o0, o1, nu = 8, nv = 8) {
  const m = new SmMesh(), G = [o1, o0].map(o => {
    const g = [];
    for (let i = 0; i <= nu; i++) { const row = []; for (let j = 0; j <= nv; j++) { const [y, z] = at(i / nu, j / nv); row.push([sx * (w(y) + o), y, z]); } g.push(row); }
    return g;
  });
  for (const [g, D] of [[G[0], [sx, 0, 0]], [G[1], [-sx, 0, 0]]]) {
    const id = g.map(r => r.map(p => m.v(p)));
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) m.quad(id[i][j], id[i + 1][j], id[i + 1][j + 1], id[i][j + 1], D);
  }
  const [yc, zc] = at(0.5, 0.5), edge = [];
  for (let i = 0; i <= nu; i++) edge.push([i, 0]);
  for (let j = 1; j <= nv; j++) edge.push([nu, j]);
  for (let i = nu - 1; i >= 0; i--) edge.push([i, nv]);
  for (let j = nv - 1; j >= 1; j--) edge.push([0, j]);
  for (let e = 0; e < edge.length; e++) {
    const [i0, j0] = edge[e], [i1, j1] = edge[(e + 1) % edge.length];
    const a = G[0][i0][j0], b = G[0][i1][j1], c = G[1][i1][j1], d = G[1][i0][j0];
    m.quad(m.v(a), m.v(b), m.v(c), m.v(d), [0, (a[1] + b[1]) / 2 - yc, (a[2] + b[2]) / 2 - zc]);
  }
  return m.geo();
}
/** smPlateUV over z0..z1 × yb(z)..yt(z). */
const smPlate = (sx, z0, z1, yb, yt, w, o0, o1, nz = 8, ny = 8) =>
  smPlateUV(sx, (u, v) => { const z = z0 + (z1 - z0) * u, a = yb(z); return [a + (yt(z) - a) * v, z]; }, w, o0, o1, nz, ny);
/** Rounded X-extrusion of a closed side outline [[z, y], ...] whose half-width follows w(y) (barrel sides), edge
 *  radius rc. The front strips of outline points with y inside `gap` ([y0, y1], facing +Z) stay open for a port face. */
function smExtrude(outline, w, rc, gap = null, steps = 3) {
  const m = new SmMesh(), n = outline.length;
  let area = 0; for (let i = 0; i < n; i++) { const [a, b] = outline[i], [c, e] = outline[(i + 1) % n]; area += a * e - c * b; }
  const O = area > 0 ? outline : [...outline].reverse();
  const N = O.map((p, i) => { const a = O[(i - 1 + n) % n], b = O[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]; });
  const R = {};
  for (const sx of [-1, 1]) for (let j = 0; j <= steps; j++) {
    const ph = (j / steps) * Math.PI / 2, off = rc * (1 - Math.cos(ph));
    R[sx + ':' + j] = O.map((p, i) => { const z = p[0] - N[i][0] * off, y = p[1] - N[i][1] * off; return m.v([sx * (w(y) - rc + rc * Math.sin(ph)), y, z]); });
  }
  const open = i => gap && O[i][1] >= gap[0] - 1e-9 && O[i][1] <= gap[1] + 1e-9 && N[i][0] > 0.3;
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n, nz = (N[i][0] + N[k][0]) / 2, ny = (N[i][1] + N[k][1]) / 2;
    if (!(open(i) && open(k))) m.quad(R['-1:0'][i], R['1:0'][i], R['1:0'][k], R['-1:0'][k], [0, ny, nz]);
    for (const sx of [-1, 1]) for (let j = 0; j < steps; j++) {
      const ph = ((j + 0.5) / steps) * Math.PI / 2;
      m.quad(R[sx + ':' + j][i], R[sx + ':' + (j + 1)][i], R[sx + ':' + (j + 1)][k], R[sx + ':' + j][k], [sx * Math.sin(ph), ny * Math.cos(ph), nz * Math.cos(ph)]);
    }
  }
  for (const sx of [-1, 1]) {
    const ids = R[sx + ':' + steps], P = ids.map(id => new THREE.Vector2(m.pos[id * 3 + 2], m.pos[id * 3 + 1]));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(P, [])) m.tri(ids[a], ids[b], ids[c], [sx, 0, 0]);
  }
  return m.geo();
}
/** The port face: the curved front surface z = fz(y) between x = ±(w(y) − rc) over the heights ys (the open strip of
 *  smExtrude), with a round opening of radius r at (0, yc); plus the opening's inner wall back to zBack. */
function smPortFace(ys, fz, w, rc, yc, r, zBack, rings = 3) {
  const B = [], y0 = ys[0], y1 = ys[ys.length - 1], xr = y => w(y) - rc, K = 10;
  for (const y of ys) B.push([xr(y), y]);
  for (let k = 1; k < K; k++) B.push([xr(y1) * (1 - 2 * k / K), y1]);
  for (const y of [...ys].reverse()) B.push([-xr(y), y]);
  for (let k = 1; k < K; k++) B.push([-xr(y0) * (1 - 2 * k / K), y0]);
  const face = new SmMesh(), wall = new SmMesh(), n = B.length, ang = B.map(([x, y]) => Math.atan2(y - yc, x)), G = [];
  for (let t = 0; t <= rings; t++) G.push(B.map(([x, y], i) => {
    const ix = r * Math.cos(ang[i]), iy = yc + r * Math.sin(ang[i]), u = t / rings, X = ix + (x - ix) * u, Y = iy + (y - iy) * u;
    return face.v([X, Y, fz(Y)]);
  }));
  for (let t = 0; t < rings; t++) for (let i = 0; i < n; i++) { const j = (i + 1) % n; face.quad(G[t][i], G[t][j], G[t + 1][j], G[t + 1][i], [0, 0, 1]); }
  const F = ang.map(a => wall.v([r * Math.cos(a), yc + r * Math.sin(a), fz(yc + r * Math.sin(a))])), K2 = ang.map(a => wall.v([r * Math.cos(a), yc + r * Math.sin(a), zBack]));
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; wall.quad(F[i], F[j], K2[j], K2[i], [-Math.cos(ang[i]), -Math.sin(ang[i]), 0]); }
  return { face: face.geo(), wall: wall.geo() };
}
/** Plain 12-triangle box (thin plates, slats, ribs). */
const smBox = (w, h, dd, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, dd).translate(x, y, z);
/** Domed slotted screw head at `at`, its axis along n. */
function smBolt(p, at, n, r = 0.0055, color = '#a3a7ac') {
  const g = new Pieces().add(zlathe([[0, -0.002], [r, -0.002], [r, 0.0011], [0, 0.003]], 0, 0, 0, 8), color, M.satin)
    .add(smBox(r * 1.5, 0.0009, 0.0012, 0, 0, 0.0028), '#2a2c30', M.satin);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V(...n).normalize());
  p.merge(g.transform(x => x.applyQuaternion(q).translate(at[0], at[1], at[2])));
}
function sloshingMachine(d) {
  const C = { panel: '#3f3e3a', mid: '#3d3c39', band: '#75787c', cream: '#dacfb5', creamD: '#b4a78b', steel: '#3b3e43', chrome: '#b1b6bc',
    vane: '#c9cdd2', throat: '#4f535a', dark: '#1c1e22', hub: '#2a2c30', brass: '#b8954a', rubber: '#1d1d1f', win: '#5b5b58', glass: '#d3d6d9' };
  const { yc, Rt, deck } = SM;
  const body = new Pieces(), frame = new Pieces(), rotor = new Pieces(), surf = new Pieces(), INK = '#ffffff';
  // ---- front housing shell (team ink): rounded extrusion of the side outline (convex front arc, flat tunnel floor,
  // barrel sides); its front strip round the port is replaced by the curved port face with the round opening
  const RC = 0.012, gap = [0.0425, 0.1855], ysFront = [0.008, 0.017, 0.026, 0.0345];
  for (let k = 0; k <= 12; k++) ysFront.push(gap[0] + (gap[1] - gap[0]) * k / 12);
  ysFront.push(0.197, 0.208, 0.219, 0.229, 0.238, deck);
  // the hood's inner floor slopes from the front top edge down to the rear face (seen through the handle opening
  // from behind, above the middle section)
  const outline = [[0.003, 0], [0.05, 0], [0.0605, 0.0015], ...ysFront.map(y => [smFz(y), y]), [0.026, 0.231], [0.003, 0.2155]];
  for (let k = 0; k <= 8; k++) outline.push([0, 0.2125 - 0.2095 * k / 8]);
  frame.add(smExtrude(outline, smWf, RC, gap), INK, M.satin);
  const port = smPortFace(ysFront.filter(y => y >= gap[0] && y <= gap[1]), smFz, smWf, RC, yc, Rt, 0.016);
  frame.add(port.face, INK, M.satin);
  body.add(port.wall, C.throat, M.satin);
  // carry-handle posts (the side walls continuing above the tunnel floor, front edge on the arc) and the roof bar
  for (const sx of [-1, 1]) frame.add(smPlateUV(sx, (u, v) => { const y = 0.205 + 0.0755 * u; return [y, smFz(y) * v]; }, smWf, -0.013, 0, 8, 4), INK, M.satin);
  frame.add(slab([[0.001, 0.2615], [smFz(0.2615), 0.2615], [smFz(0.271), 0.271], [smFz(0.2805), 0.2805], [0.004, 0.2805], [0.001, 0.2775]],
    2 * (smWf(0.27) - 0.006), 0, 0.003), INK, M.satin);
  // dark side panels inlaid in the frame (vanilla dark grey); the frame rim follows the front arc round them
  for (const sx of [-1, 1]) body.add(smPlateUV(sx, (u, v) => { const y = 0.016 + 0.21 * u; return [y, 0.006 + (smFz(y) - 0.03) * v]; }, smWf, -0.003, 0.0009, 10, 6), C.panel, M.satin);
  // ---- bracket plate on the upper front arc: slotted round boss, pin, two screws
  {
    const yP = 0.227, { n, a } = smFrontN(yP), bp = new Pieces();
    bp.add(box(0.128, 0.034, 0.004, 0, 0, 0.0012, 0.18, 10, 6), C.steel, M.metal);
    bp.add(zlathe([[0, 0], [0.0115, 0], [0.0115, 0.0045], [0.0095, 0.0062], [0, 0.0062]], -0.022, -0.002, 0, 18), C.chrome, M.metal);
    bp.add(box(0.016, 0.0028, 0.002, -0.022, -0.002, 0.0062, 0.4, 6, 4), C.dark, M.satin);
    bp.add(zlathe([[0, 0], [0.0045, 0], [0.0045, 0.0115], [0.0035, 0.0128], [0, 0.0128]], 0.006, 0.008, 0, 12), C.chrome, M.metal);
    for (const x of [-0.05, 0.05]) bp.add(zlathe([[0, 0], [0.004, 0], [0.004, 0.005], [0, 0.0058]], x, 0.008, 0, 6), '#8e9297', M.metal);
    body.merge(bp.transform(g => g.rotateX(a).translate(0, yP + n[1] * 0.0005, smFz(yP) + n[2] * 0.0005)));
  }
  // ---- the port: bezel ring on four standoffs, deep throat with pitched stator vanes, dark back
  body.add(zlathe([[0.068, 0.096], [0.097, 0.096], [0.1, 0.0995], [0.1, 0.1185], [0.0975, 0.122], [0.081, 0.122], [0.0765, 0.1195], [0.0705, 0.106], [0.068, 0.096]], 0, yc, 0, 40), C.chrome, M.gloss);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, x = Math.cos(a) * 0.0885, y = yc + Math.sin(a) * 0.0885;
    body.add(zcyl(0.0055, smFz(y) - 0.004, 0.0965, x, y, 8), '#8e9297', M.satin);
    smBolt(body, [x, y, 0.1222], [0, 0, 1], 0.0048);
  }
  body.add(zcyl(Rt + 0.005, 0.012, 0.0185, 0, yc, 32), C.dark, M.satin);
  // 30 stator vanes: axial plates leaning 57 deg off radial (overlapping like an iris seen from the front), each twisted
  // 0.45 rad about the drum axis along its depth (the screw)
  for (let k = 0; k < 30; k++) {
    const g = new THREE.BoxGeometry(0.0015, 0.034, 0.056, 1, 1, 2).rotateZ(1.0).translate(0, 0.0575, 0).rotateZ(k * Math.PI / 15), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const z = P.getZ(i), t = 0.45 * (z / 0.056), c = Math.cos(t), sn = Math.sin(t), x = P.getX(i), y = P.getY(i); P.setXY(i, x * c - y * sn, x * sn + y * c); }
    g.computeVertexNormals();
    body.add(g.translate(0, yc, 0.056), C.vane, M.satin);
  }
  // impeller on the axis (part `rotor`), the ink lens in front of its hub
  rotor.add(zlathe([[0, 0.018], [0.021, 0.018], [0.021, 0.035], [0.017, 0.043], [0.009, 0.0495], [0, 0.0505]], 0, yc, 0, 24), C.hub, M.satin);
  rotor.add(ring(0.0212, 0.0024, 0, yc, 0.035, 'z', 6, 24), C.chrome, M.metal);
  rotor.add(ring(0.0093, 0.0014, 0, yc, 0.0498, 'z', 5, 16), C.chrome, M.metal);
  for (let k = 0; k < 3; k++)
    rotor.add(box(0.022, 0.0026, 0.017, 0, 0, 0, 0.3, 8, 4).rotateY(0.55).translate(0.031, 0, 0).rotateZ(k * Math.PI * 2 / 3 + 0.4).translate(0, yc, 0.03), k ? C.steel : '#9a9ea4', M.metal);
  frame.add(zlathe([[0, 0.0492], [0.0086, 0.0492], [0.0086, 0.0518], [0.0062, 0.0562], [0, 0.0574]], 0, yc, 0, 16), INK, M.gloss);
  // screws: two high and two low on the front arc, two on each side rim
  for (const sx of [-1, 1]) {
    for (const y of [0.212, 0.026]) smBolt(body, [sx * 0.08, y, smFz(y) + 0.0003], smFrontN(y).n);
    for (const [y2, z2] of [[0.232, 0.03], [0.03, 0.066]]) smBolt(body, [sx * (smWf(y2) + 0.0003), y2, z2], [sx, 0, 0], 0.0045);
  }
  // ---- separator band and the dark middle section with its label windows
  body.add(smLoft([[-0.0215, -0.0005, 0.2195, 0.0005], [-0.019, -0.002, 0.222, 0.003], [-0.0015, -0.002, 0.222, 0.003], [0.001, -0.0005, 0.2195, 0.0005]]
    .map(([z, b, t, o]) => ({ z, b, t, o, w: smWf, rc: 0.014 })), 40), C.band, M.satin);
  body.add(smLoft([[-0.088, 0.004, 0.193, -0.0105], [-0.085, 0, 0.197, -0.007], [-0.05, 0, 0.206, -0.007], [-0.019, 0, 0.215, -0.007]]
    .map(([z, b, t, o]) => ({ z, b, t, o, w: smWf, rc: 0.016 })), 40), C.mid, M.satin);
  for (const sx of [-1, 1]) {
    const x = sx * (smWf(0.174) - 0.007);
    body.add(box(0.004, 0.024, 0.044, x + sx * 0.0008, 0.174, -0.054, 0.3, 8, 6), C.win, M.satin);
    body.add(box(0.003, 0.015, 0.034, x + sx * 0.0021, 0.174, -0.054, 0.3, 8, 6), C.glass, M.gloss);
  }
  body.add(xcyl(0.0028, -0.072, 0.072, 0.1985, -0.0835, 8), C.chrome, M.gloss);          // trim rod on the middle section's rear top edge
  // ---- cream rear section: core with the convex back, V-topped side walls, back wall rising into the rear carry bar
  const coreSecs = [];
  for (const [y, z] of [...SM_BACK].reverse()) if (y < 0.13) coreSecs.push({ z, b: y });
  coreSecs.sort((a, b) => a.z - b.z);
  const rearSecs = [{ z: -0.1734, b: 0.124, k: 0.93 }, ...coreSecs.map((s, i) => ({ ...s, k: i ? 1 : 0.965 })),
    { z: -0.12, b: 0 }, { z: -0.1, b: 0 }, { z: -0.084, b: 0 }].map(s => ({ ...s, t: smLin(SM_CORE, s.z), w: smWr, rc: 0.012 }));
  body.add(smLoft(rearSecs, 40), C.cream, M.satin);
  const coreTop = z => smLin(SM_CORE, z), vTop = z => smLin(SM_VTOP, z);
  for (const sx of [-1, 1]) body.add(smPlate(sx, -0.169, -0.0855, z => coreTop(z) - 0.012, vTop, smWr, -0.008, 0, 14, 4), C.cream, M.satin);
  body.add(frontSlab(roundRect(0, 0.1695, smWr(0.17) - 0.0015, 0.0365, 0.007), 0.011, -0.1665, 0.003,
    [roundRect(0, 0.1735, 0.054, 0.0145, 0.005)]), C.cream, M.satin);
  for (const sx of [-1, 1]) for (const y of [0.152, 0.03]) smBolt(body, [sx * 0.074, y, smCurve(SM_BACK, y) - 0.0004], [0, y > 0.14 ? 0 : -0.45, -1], 0.004, '#8e9297');
  // side grooves and the slatted round grille on the convex back
  for (const sx of [-1, 1]) for (const z of [-0.129, -0.111])
    body.add(smPlate(sx, z - 0.0042, z + 0.0042, () => 0.05, () => 0.152, smWr, -0.001, 0.0007, 2, 8), C.creamD, M.satin);
  {
    const gy = 0.085, R = 0.058, pitch = 0.0089, bz = y => smCurve(SM_BACK, y), disc = new SmMesh(), ids = [];
    const nrm = y => { const a = Math.atan((bz(y + 0.002) - bz(y - 0.002)) / 0.004); return [a, Math.sin(a), -Math.cos(a)]; };
    for (let i = 0; i <= 4; i++) { const row = []; for (let j = 0; j < 24; j++) {
      const r = R * i / 4, a = j * Math.PI / 12, y = gy + r * Math.sin(a), [, ny, nz] = nrm(y);
      row.push(disc.v([r * Math.cos(a), y + ny * 0.0006, bz(y) + nz * 0.0006])); } ids.push(row); }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 24; j++) disc.quad(ids[i][j], ids[i + 1][j], ids[i + 1][(j + 1) % 24], ids[i][(j + 1) % 24], [0, 0, -1]);
    body.add(disc.geo(), C.dark, M.satin);
    for (let j = -5; j <= 5; j++) {
      const y = gy + j * pitch, half = Math.sqrt(Math.max(0, R * R - (j * pitch) ** 2)) * 0.97 - 0.002, [a, ny, nz] = nrm(y);
      body.add(smBox(2 * half, pitch * 0.5, 0.003).rotateX(a).translate(0, y + ny * 0.0018, bz(y) + nz * 0.0018), C.cream, M.satin);
    }
    for (const sx of [-1, 1]) {
      const pts = []; for (let i = 0; i <= 6; i++) { const y = gy - 0.054 + 0.108 * i / 6, [, ny, nz] = nrm(y); pts.push([sx * 0.011, y + ny * 0.0022, bz(y) + nz * 0.0022]); }
      body.add(pipe(pts, 0.0022, 10, 4), C.cream, M.satin);
    }
    body.add(ring(R + 0.002, 0.0022, 0, 0, 0, 'z', 4, 32).rotateX(nrm(gy)[0]).translate(0, gy, bz(gy) - 0.0012), C.creamD, M.satin);
  }
  // ---- brass feet with knurled black pads
  for (const sx of [-1, 1]) for (const z of [0.036, -0.108]) {
    const x = sx * 0.07;
    body.add(ylathe([[0, -0.0004], [0.021, -0.0004], [0.021, -0.0028], [0.0185, -0.0045], [0, -0.0045]], x, 0, z, 16), C.brass, M.satin);
    body.add(ylathe([[0, -0.004], [0.0135, -0.004], [0.0135, -0.0095], [0, -0.0095]], x, 0, z, 6), C.brass, M.satin);
    body.add(ylathe([[0, -0.009], [0.0178, -0.009], [0.0182, -0.0108], [0.0182, -0.0172], [0.0168, -0.0185], [0, -0.0185]], x, 0, z, 16), C.rubber, M.rubber);
    for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; body.add(smBox(0.0024, 0.0072, 0.0024).rotateY(-a).translate(x + Math.cos(a) * 0.0183, -0.0138, z + Math.sin(a) * 0.0183), C.rubber, M.rubber); }
  }
  // ---- ink: a level puddle in the bottom of the turbine drum, 4.2 cm under the port axis (kept level by the native code)
  surf.add(box(0.086, 0.003, 0.056, 0, SM.level, 0.055, 0.25, 16, 4), INK, M.satin);
  // ---- machine space → weapon space (right fist on the front carry bar at the origin)
  const [gx, gy, gz] = SM.grip, mv = g => g.translate(-gx, -gy, -gz), W = (x, y, z) => [x - gx, y - gy, z - gz];
  for (const p of [body, frame, rotor, surf]) p.transform(mv);
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { frame: part(frame, W(0, 0.15, 0.04), 'ink'), rotor: part(rotor, W(0, yc, 0.035)), surface: part(surf, W(0, SM.level, 0.055), 'ink') },
    // right fist round the roof bar: thumb toward +X (palm back, knuckles forward), wrist up and back
    gripR: gripSpec([0, 0, 0], [1, 0, 0], [0, 0.82, -0.57]),
    // left fist round the rear carry bar (top of the cream back wall): thumb toward −X, wrist up-back-left
    gripL: gripSpec(W(...SM.rear), [-1, 0, 0], [0.3, 0.8, -0.52]),
    muzzle: W(0, yc, 0.122),                                     // port exit: centre of the bezel ring's front face
  });
}
// One-hand carry by the roof bar at the right side (port forward, tipped a little down); two-hand aim with the
// machine at the right of the belly, right hand on the roof bar, left hand on the rear bar (S3 key art, S2 promos).
const MACHINE_HOLD = {
  carry: { p: [-0.25, 0.64, 0.06], r: [0.2, 0.12, 0] }, twoCarry: 0,
  run: { p: [-0.25, 0.66, 0.04], r: [0.32, 0.18, 0.04] },
  aim: { p: [-0.15, -0.14, 0.24], r: [0.05, 0.08, 0] }, twoAim: 1,
  lobby: { p: [-0.25, 0.64, 0.08], r: [0.15, 0.25, 0] }, lobbyTwo: 0,
};
// Catalogue sloshers never fire the character's 'slosh' one-shot, so the swing is driven from the runner's lift
// (catalogState.pending, SwingLiftFrame 12F = 0.2 s, RepeatFrame 38F): the machine dips back and low, heaves up and
// forward so the port points up the throw when the shot leaves (t = 0.2 s), holds, and settles. Euler pitch + = down.
const MSW_T = [0, 0.1, 0.2, 0.3, 0.6];
const MSW = { P: [0, 0.38, -0.42, -0.36, 0], Y: [0, -0.05, 0.05, 0.045, 0], Z: [0, -0.05, 0.07, 0.06, 0],
  SPINE: [0, 0.06, -0.08, -0.06, 0], CHEST1: [0, 0.12, -0.1, -0.08, 0] };
const machineSwing = new WeakMap();
function mswKey(k, t) {
  if (t <= MSW_T[0]) return k[0];
  for (let i = 1; i < MSW_T.length; i++) if (t <= MSW_T[i]) {
    const u = (t - MSW_T[i - 1]) / (MSW_T[i] - MSW_T[i - 1]), e = u * u * (3 - 2 * u);
    return k[i - 1] + (k[i] - k[i - 1]) * e;
  }
  return k[k.length - 1];
}
/** Sloshing Machine pose layer: plays the heave from the catalogue runner's actual lift/emission state. */
function machinePose(ch, dt, s, CH) {
  if (!CH || !Number.isInteger(CH.ANCR) || !ch.P) return;
  const P = ch.P;
  let st = machineSwing.get(ch);
  if (!st) { st = { t: -1 }; machineSwing.set(ch, st); }
  const r = ch._runner?.(s), lift = !!r?.catalogState?.pending;
  if (!ch.kidForm || ch.visible === false) st.t = -1;
  else if (lift && (st.t < 0 || st.t > MSW_T[2])) st.t = 0;
  else if (st.t >= 0) { st.t += Math.min(0.1, Math.max(0, dt || 0)); if (st.t >= MSW_T[MSW_T.length - 1]) st.t = -1; }
  if (st.t < 0) return;
  const t = st.t;
  P[CH.ANCR] += mswKey(MSW.P, t);
  P[CH.ANC + 1] += mswKey(MSW.Y, t); P[CH.ANC + 2] += mswKey(MSW.Z, t);
  if (Number.isInteger(CH.SPINE)) P[CH.SPINE] += mswKey(MSW.SPINE, t);
  if (Number.isInteger(CH.CHEST)) P[CH.CHEST + 1] += mswKey(MSW.CHEST1, t);
}
/** Impeller: spins up while the swing lifts and the shot leaves, then runs down. Allocation-free. */
function machineAnimate(w, st) {
  const rot = w.parts?.rotor;
  if (!rot) return;
  const dt = Math.min(0.1, Math.max(0, st.dt || 0)), cs = st.runner?.catalogState;
  const on = !!cs?.pending || (st.sinceShoot ?? 9) < 0.35 || (st.runner?.firingT ?? 0) > 0;
  w.smW = (w.smW || 0) + ((on ? 46 : 0) - (w.smW || 0)) * (1 - Math.exp(-(on ? 14 : 3) * dt));
  w.smA = ((w.smA || 0) + w.smW * dt) % (Math.PI * 2);
  rot.rotation.z = w.smA;
}
// ------------------------------------------------------------------------------------------ Bloblobber
// Wmn_Slosher_Bathtub, rebuilt from the official render, the S3 Deco turntable and the S2 turntable strip: an
// open white ceramic bathtub (thick rolled rim, sloped backrest with an overflow cap, recessed grab handles in
// both side walls, drain and jets in the floor, ink-coloured anti-slip chevrons on the front ramp) set into a black hull, a
// black strap with a print looping round the hull (chrome posts, clips, buckles), chrome rails under the front
// lip and round the back, a brown foot block under the front, and the chrome thermostat bar (red/blue ring
// knob, mixer block, two posts) across the back that the right fist holds.
// Modelled in tub space (rim top y = 0, back rim edge z = 0, front lip z = 0.30, x across) and moved so the
// fist's grip point on the faucet bar is the weapon origin. Scale: basin 0.20 m wide (reference doc).
const TUB = { a: 0.10, b: 0.15, n: 3.2, zc: 0.15 };
const TUB_GRIP = [0.036, 0.040, 0.012];          // fist on the faucet bar's inner half (S3 screenshots; tub space)
const TUB_LEVEL = -0.06;                         // ink level when the tub is upright, 6 cm under the rim
// Hanging carry (opening forward): the ink runs to the front end; its level pool lies in the plane through
// TUB_POOL_C normal to the carry's world up (tub space), spanning the basin there (oversize sinks into the walls).
const TUB_POOL_C = [0, -0.038, 0.24], TUB_POOL_V = [0, 0.91, 0.42], TUB_POOL_GROW = 1000;
// Depth scale along the tub (tub z): KIN for the basin below the rim roll, KOUT for the hull below the band.
const KIN = [[0, 0.25], [0.03, 0.4], [0.07, 0.8], [0.1, 1], [0.19, 0.95], [0.21, 0.78], [0.24, 0.5], [0.275, 0.25], [0.3, 0.18]];
// KB: the white band deepens toward the front lip, where the hull tapers away under it.
const KB = [[0, 1], [0.18, 1], [0.3, 1.45]];
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
  if (layer === 'band' && y < -0.004) return -0.004 + (y + 0.004) * tubLin(KB, z);
  if (layer === 'out') return y < -0.035 ? -0.035 * tubLin(KB, z) + (y + 0.035) * tubLin(KOUT, z) : -0.004 + (y + 0.004) * tubLin(KB, z);
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
  [1, 0.0016, -0.012, 'band'], [1, 0.0012, -0.028, 'band'], [1, -0.003, -0.0335, 'band'], [1, -0.011, -0.036, 'band'],
];
// Black hull: from inside the band down the flank, round the bilge, under the bottom to the centre.
const TUB_HULL = [
  [1, -0.009, -0.031, 'out'], [1, -0.0125, -0.038, 'out'], [1, -0.0135, -0.06, 'out'], [1, -0.016, -0.095, 'out'],
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
  const C = { white: '#efede4', hull: '#2f2f2e', strap: '#161617', clip: '#121213', chrome: '#aab0b6', dark: '#1c1d20',
    slot: '#4f5156', brown: '#5e4f43', print: '#e9e9e6', red: '#d8262c', blue: '#2848c8', label: '#b9bcc0' };
  const tub = new Pieces(), ink = new Pieces(), knob = new Pieces(), surf = new Pieces(), pool = new Pieces();
  // ---- ceramic tub and hull
  tub.add(tubSweep(TUB_WHITE, 64, 10, [0, 1, 0]), C.white, M.gloss);
  tub.add(tubSweep(TUB_HULL, 64, 7, [0, -1, 0]), C.hull, M.satin);
  // ---- basin details: overflow cap on the back rest, drain, jets, anti-slip chevrons (team ink), grab recesses
  const keelUp = [0, 0, 1], keelN = z => { const [, s] = tubKeel(z), l = Math.hypot(1, s); return [0, 1 / l, -s / l]; };
  { const z = 0.036, [y] = tubKeel(z);
    tub.add(tubPlace(zlathe([[0, -0.004], [0.0105, -0.004], [0.0105, 0.002], [0.0075, 0.0055], [0, 0.0065]], 0, 0, 0, 6), [0, y, z], keelN(z), keelUp), C.chrome, M.gloss); }
  { const z = 0.165, [y] = tubKeel(z), n = keelN(z);
    tub.add(tubPlace(ring(0.0135, 0.0032, 0, 0, 0, 'z', 6, 20), [0, y + 0.0012, z], n, keelUp), C.chrome, M.gloss);
    tub.add(tubPlace(zcyl(0.0108, -0.003, 0.0006, 0, 0, 16), [0, y, z], n, keelUp), C.dark, M.satin);
    for (const a of [0, Math.PI / 2]) tub.add(tubPlace(box(0.02, 0.0025, 0.002, 0, 0, 0.001, 0.4, 6, 4).rotateZ(a), [0, y, z], n, keelUp), C.chrome, M.gloss); }
  for (const z of [0.207, 0.222]) for (const sx of [-1, 1]) { const [y] = tubKeel(z);
    tub.add(tubPlace(zcyl(0.0036, -0.002, 0.0009, 0, 0, 10), [sx * 0.012, y, z], keelN(z), keelUp), C.dark, M.satin); }
  for (const sx of [-1, 1]) for (const z of [0.236, 0.252]) {          // chevrons pointing to the front lip
    const [y] = tubKeel(z);
    for (const k of [-1, 1]) ink.add(tubPlace(box(0.013, 0.0032, 0.0022, k * 0.0052, 0, 0.0004, 0.4, 6, 4).rotateZ(-k * 0.6), [sx * 0.021, y, z], keelN(z), keelUp));
  }
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
  tub.add(box(0.05, 0.02, 0.026, -0.016, 0.027, 0.024, 0.28), C.chrome, M.gloss);                             // mixer block
  for (const sx of [-1, 1]) tub.add(cyl(0.0045, [-0.012 + sx * 0.02, -0.002, 0.014], [-0.012 + sx * 0.02, 0.03, 0.014], 10), C.chrome, M.gloss);
  for (const sx of [-1, 1]) tub.add(cyl(0.0068, [-0.012 + sx * 0.02, 0.0002, 0.014], [-0.012 + sx * 0.02, 0.003, 0.014], 12), C.chrome, M.gloss);
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
  surf.add(tubSweep(sr, 48, 1, [0, 1, 0], [0.036, 0.243]), '#ffffff', M.satin);
  { // hanging pool: authored collapsed about its pivot (static views show only the upright surface);
    // bathtubAnimate grows it by TUB_POOL_GROW while the opening faces sideways
    const X = V(1, 0, 0), Yv = V(...TUB_POOL_V).normalize(), Z = X.clone().cross(Yv), [cx, cy, cz] = TUB_POOL_C;
    pool.add(sphere(0.072, 0.037, 0.0012, 0, 0, 0, 24, 6).applyMatrix4(new THREE.Matrix4().makeBasis(X, Yv, Z))
      .scale(1 / TUB_POOL_GROW, 1 / TUB_POOL_GROW, 1 / TUB_POOL_GROW).translate(cx, cy, cz), '#ffffff', M.satin);
  }
  // ---- tub space → weapon space (grip point on the bar at the origin)
  const [gx, gy, gz] = TUB_GRIP, mv = g => g.translate(-gx, -gy, -gz);
  tub.transform(mv); ink.transform(mv); knob.transform(mv); surf.transform(mv); pool.transform(mv);
  const W = (x, y, z) => [x - gx, y - gy, z - gz];
  return rebuild(d, {
    body: tub, ink,
    parts: { surface: part(surf, W(0, TUB_LEVEL, 0.135), 'ink'), pool: part(pool, W(...TUB_POOL_C), 'ink'), lever: part(knob, W(-0.07, fy, fz)) },
    // right fist round the faucet bar: thumb along +X (toward the body in the carry), wrist away from the tub's mass
    gripR: gripSpec([0, 0, 0], [1, 0, 0], [0, 0.42, -0.9]),
    gripL: gripSpec(W(0, -0.067, 0.304), [-1, 0, 0], [0.25, -0.85, 0.45]),
    muzzle: W(0, 0.005, 0.17),                                  // basin opening (the blobs leave the tub here)
  });
}
// Hanging one-hand carry by the faucet bar (S2/S3 promo): the tub hangs below the fist with its opening forward.
// Yaw π + roll π orient the same hang as pitch 1.14 but flip the native heave's pitch sense, so the slosh
// heave scoops the tub forward and up (windup back, release with the opening to the target).
const BATHTUB_HOLD = {
  carry: { p: [-0.23, 0.63, 0.05], r: [2.0, Math.PI - 0.25, Math.PI] }, twoCarry: 0,
  run: { p: [-0.23, 0.69, 0.05], r: [1.88, Math.PI - 0.3, Math.PI] },
  aim: { p: [-0.2, -0.25, 0.08], r: [1.92, Math.PI - 0.2, Math.PI] }, twoAim: 0,
  raise: { p: [-0.2, 1.08, 0.16], r: [1.2, Math.PI - 0.3, Math.PI] },
  lobby: { p: [-0.2, 0.67, 0.08], r: [2.0, Math.PI - 0.35, Math.PI] }, lobbyTwo: 0,
};
// Catalogue sloshers never fire the character's native 'slosh' one-shot, so the Bloblobber drives its own
// scoop: during the swing lift (SwingLiftFrame, catalogState.pending) the tub swings back and low, then heaves
// forward-up so the open basin faces up/forward when the blobs leave, holds, and drops back to the hang.
// Euler pitch + = forward-up for this yaw/roll-π hold. Keys in seconds from the lift start.
const SWING_T = [0, 0.1, 0.2, 0.32, 0.56];
const SWING = { P: [0, -0.45, 1.45, 1.55, 0], W: [0, 0.12, -0.18, -0.2, 0], Y: [0, -0.02, 0.15, 0.16, 0], Z: [0, -0.04, 0.09, 0.08, 0],
  SPINE: [0, 0.08, -0.1, -0.08, 0], CHEST1: [0, 0.16, -0.14, -0.12, 0] };
const swingState = new WeakMap();
function swingKey(k, t) {
  if (t <= SWING_T[0]) return k[0];
  for (let i = 1; i < SWING_T.length; i++) if (t <= SWING_T[i]) {
    const u = (t - SWING_T[i - 1]) / (SWING_T[i] - SWING_T[i - 1]), e = u * u * (3 - 2 * u);
    return k[i - 1] + (k[i] - k[i - 1]) * e;
  }
  return k[k.length - 1];
}
/** Bloblobber pose layer: cancel the aim pitch on the hanging tub (its euler pitch sense is flipped by the
 *  yaw/roll-π hold) and play the scoop swing from the catalogue runner's actual lift/emission state. */
function bathtubPose(ch, dt, s, CH) {
  if (!CH || !Number.isInteger(CH.ANCR) || !ch.P) return;
  const P = ch.P, w = ch.wAim || 0;
  if (w > 0.001) P[CH.ANCR] += (ch.aimP || 0) * w;
  let st = swingState.get(ch);
  if (!st) { st = { t: -1 }; swingState.set(ch, st); }
  const r = ch._runner?.(s), lift = !!r?.catalogState?.pending;
  if (!ch.kidForm || ch.visible === false) st.t = -1;
  else if (lift && (st.t < 0 || st.t > SWING_T[2])) st.t = 0;
  else if (st.t >= 0) { st.t += Math.min(0.1, Math.max(0, dt || 0)); if (st.t >= SWING_T[SWING_T.length - 1]) st.t = -1; }
  if (st.t < 0) return;
  const t = st.t;
  P[CH.ANCR] += swingKey(SWING.P, t); P[CH.ANCR + 1] += swingKey(SWING.W, t);
  P[CH.ANC + 1] += swingKey(SWING.Y, t); P[CH.ANC + 2] += swingKey(SWING.Z, t);
  if (Number.isInteger(CH.SPINE)) P[CH.SPINE] += swingKey(SWING.SPINE, t);
  if (Number.isInteger(CH.CHEST)) P[CH.CHEST + 1] += swingKey(SWING.CHEST1, t);
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
const BUILD3D = { 's3-slosher-diffusion': triSlosher, 's3-slosher-launcher': sloshingMachine, 's3-slosher-bathtub': bloblobber,
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

const _bathUp = new THREE.Vector3();
/** Bloblobber liquid: the native level surface while the opening faces up (swing), the front-end pool while
 *  the tub hangs (opening sideways). Runs after the native slosher animation; allocation-free. */
function bathtubAnimate(w, st) {
  const P = w.parts;
  if (!P?.surface || !P.pool) return;
  let up = 1;
  if (st.worldQuat) up = _bathUp.set(0, 1, 0).applyQuaternion(st.worldQuat).y;
  const pool = up < 0.6 ? 1 : 0, dt = Math.min(0.1, Math.max(0, st.dt || 0));
  w.bathPool = (w.bathPool ?? pool) + (pool - (w.bathPool ?? pool)) * (1 - Math.exp(-18 * dt));
  P.surface.visible = w.bathPool < 0.5;
  P.pool.scale.setScalar(TUB_POOL_GROW * Math.max(1e-3, w.bathPool));
}
// Per-weapon hold / pose extras (Bloblobber: hanging one-hand carry by the faucet bar, native data carry).
const EXTRA = { 's3-slosher-bathtub': { hold: BATHTUB_HOLD, nativeCarry: true, pose: bathtubPose, animate: bathtubAnimate },
  's3-slosher-launcher': { hold: MACHINE_HOLD, nativeCarry: true, pose: machinePose, animate: machineAnimate } };

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
