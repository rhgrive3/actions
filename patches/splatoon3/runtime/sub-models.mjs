// Per-sub models for the eleven Splatoon 3 sub weapons that are not bombs
// already modelled in bomb-models.mjs (presentation only).
//
// Upstream and the all-subs overlay drew these subs as spheres, cylinders or a
// box (and the native bomb lane drew Autobomb and Sprinkler as the Splat Bomb
// pyramid). Each model below is read off several real views of the S3 object:
// the S3 sub icon (Inkipedia "S3 Weapon Sub <Name>.png"), the official promo
// render (Inkipedia "S2 <Name> promo render.jpg" — the S3 objects keep the S2
// meshes, compare the S3 screenshots), the S3 in-game screenshots
// ("S3 <Name> screenshot.jpg") and, for Angle Shooter, the 12-angle official
// turntable ("S3 Angle Shooter model rotating.mp4"). Where a view was missing
// (e.g. the underside of Point Sensor) the model is completed by symmetry.
// The reference list, proportions and remaining differences are recorded in
// patches/splatoon3/reference/sub-models.md.
//
// Units are metres (INKWAVE world), +Y up. Ground objects stand on y = 0 and
// face +Z; flying objects whose orientation follows their travel (Torpedo,
// Angle Shooter) point +Z forward. Proportions are measured on the
// references; absolute sizes are INKWAVE presentation choices scaled against
// the 1.45 m kid (no model sizes are published). Not a Nintendo mesh.
//
// Nothing here reads or writes gameplay state. Geometries are built once per
// id and shared (flagged `userData.s3Shared` so per-object disposal skips
// them); materials are per instance because the callers dispose them.

const TAU = Math.PI * 2;
const SHARED_FLAG = 's3Shared';

export const SUB_MODEL_IDS = Object.freeze([
  'burst', 'autobomb', 'fizzy', 'torpedo', 'inkMine', 'toxicMist',
  'angleShooter', 'splashWall', 'sprinkler', 'beakon', 'pointSensor',
]);

// Splash Wall dimensions follow the gameplay wall (all-subs ALL_SUB_SPECS):
// the curtain must cover the collision box, so the arms span its width.
export const SPLASH_WALL_DIMS = Object.freeze({ width: 4.2, height: 2.8 });
// Thrown/flight size of Splash Wall relative to the standing device (the
// folded unit in the S3 icon is about a fifth of the standing height).
export const SPLASH_WALL_FOLDED_SCALE = 0.22;
export const SPLASH_WALL_UNFOLD_SECONDS = 0.35;

// Non-ink finishes (colours picked from the references).
const FINISH = {
  white: [0xf1f0ea, { roughness: 0.38, metalness: 0.05 }],
  black: [0x1a1a1e, { roughness: 0.5, metalness: 0.2 }],
  rubber: [0x1d1d20, { roughness: 0.85, metalness: 0 }],
  steel: [0xc9cdd3, { roughness: 0.28, metalness: 0.55 }],
  chrome: [0xd8dce2, { roughness: 0.2, metalness: 0.6 }],
  grey: [0x75787f, { roughness: 0.4, metalness: 0.5 }],
  darkMetal: [0x3a3c42, { roughness: 0.45, metalness: 0.6 }],
  hole: [0x060608, { roughness: 0.9, metalness: 0 }],
  glass: [0xeaf4ff, { roughness: 0.04, metalness: 0, transparent: true, opacity: 0.26, depthWrite: false }],
  murk: [0x6a7848, { roughness: 0.3, metalness: 0, transparent: true, opacity: 0.88 }],
  capRed: [0x7c1e1a, { roughness: 0.4, metalness: 0.1 }],
  blueBand: [0x2443a6, { roughness: 0.3, metalness: 0.6 }],
  panel: [0x26227a, { roughness: 0.28, metalness: 0.35, emissive: 0x0d0b34 }],
  label: [0xf6f6f2, { roughness: 0.5, metalness: 0 }],
  mark: [0xffffff, { roughness: 0.5, metalness: 0 }],
  stripe: [0xffffff, { roughness: 0.2, metalness: 0, transparent: true, opacity: 0.72 }],
  decalRed: [0xd8262e, { roughness: 0.5, metalness: 0 }],
  decalBlue: [0x2a3fb0, { roughness: 0.5, metalness: 0 }],
};
// Team-ink finishes derived from the owner's ink material colour.
const INK_FINISH = {
  ink: null,
  inkGloss: { roughness: 0.12, metalness: 0.05 },
  inkFelt: { roughness: 0.95, metalness: 0, shade: 0.82 },
  inkDark: { roughness: 0.5, metalness: 0.1, shade: 0.55 },
  inkGlass: { roughness: 0.06, metalness: 0, transparent: true, opacity: 0.6, depthWrite: false },
  inkMilk: { roughness: 0.16, metalness: 0, transparent: true, opacity: 0.74 },
  inkGlow: { roughness: 0.3, metalness: 0, emissive: 1.4 },
  inkHolo: { basic: true, transparent: true, opacity: 0.78, depthWrite: false, double: true },
  inkSheet: { basic: true, transparent: true, opacity: 0.24, depthWrite: false, double: true },
  inkStream: { basic: true, transparent: true, opacity: 0.5, depthWrite: false, double: true },
  mist: { basic: true, transparent: true, opacity: 0.1, depthWrite: false, shade: 0.55, grey: 0.4 },
};

// ---- geometry helpers ---------------------------------------------------------

function share(g) { g.userData[SHARED_FLAG] = true; return g; }

// Merge same-finish pieces into one draw: non-indexed position + normal.
function merge(THREE, list) {
  const parts = list.map(g => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// Cylinder from a to b (arrays), radius r (r2 at b).
function rod(THREE, a, b, r, seg = 10, r2 = r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r2, r, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(A.x, A.y, A.z);
}
// Smooth a coarse [[r, y]] profile with a Catmull-Rom spline.
function smooth(THREE, pts, n = 24) {
  return new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(n).map(p => [Math.max(0, p.x), p.y]);
}
// Lathe about +Y from a bottom-to-top [[r, y]] profile.
function latheY(THREE, prof, seg = 24) {
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
// Lathe about +Z from a back-to-front [[r, z]] profile.
function latheZ(THREE, prof, seg = 24) { return latheY(THREE, prof, seg).rotateX(Math.PI / 2); }
function box(THREE, w, h, d, x = 0, y = 0, z = 0) { return new THREE.BoxGeometry(w, h, d).translate(x, y, z); }
function tube(THREE, pts, r, seg = 48, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), closed, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(curve, seg, r, radial, closed);
}
// Flat strap (width w across the path's plane, thickness t) along a polyline.
function strap(THREE, pts, w, t, steps = 120) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.5);
  const shp = new THREE.Shape([new THREE.Vector2(-t / 2, -w / 2), new THREE.Vector2(t / 2, -w / 2), new THREE.Vector2(t / 2, w / 2), new THREE.Vector2(-t / 2, w / 2)]);
  return new THREE.ExtrudeGeometry(shp, { steps, extrudePath: curve, bevelEnabled: false });
}
// Orient a geometry built along +Y onto direction d and move it to p.
function orient(THREE, g, d, p) {
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d).normalize()));
  return g.translate(...p);
}

// Convex polyhedron from planar faces (each a list of [x, y, z]); windings
// are fixed outward against the centroid, normals are flat.
function polyhedron(THREE, faces) {
  const c = [0, 0, 0]; let n = 0;
  for (const f of faces) for (const p of f) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; n++; }
  c[0] /= n; c[1] /= n; c[2] /= n;
  const pos = [];
  for (let f of faces) {
    const [a, b, d] = f, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    if (nx * (a[0] - c[0]) + ny * (a[1] - c[1]) + nz * (a[2] - c[2]) < 0) f = [...f].reverse();
    for (let i = 1; i + 1 < f.length; i++) pos.push(...f[0], ...f[i], ...f[i + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Parts are collected per animation group and finish, then merged.
function kit() {
  const groups = new Map();
  const at = (name) => { if (!groups.has(name)) groups.set(name, { name, pivot: [0, 0, 0], parts: new Map() }); return groups.get(name); };
  return {
    add(name, finish, ...geos) { const g = at(name), list = g.parts.get(finish) || []; list.push(...geos); g.parts.set(finish, list); },
    pivot(name, p) { at(name).pivot = p; },
    finish(THREE) {
      return [...groups.values()].map(g => ({
        name: g.name, pivot: g.pivot,
        parts: [...g.parts].map(([finish, list]) => [finish, share(merge(THREE, list).translate(-g.pivot[0], -g.pivot[1], -g.pivot[2]))]),
      }));
    },
  };
}

// ---- Burst Bomb: a team-ink water balloon -------------------------------------
// Icon/S1 render/S3 screenshot: round-bottomed balloon with a white spiral of
// stripes, a tied knot, a short ink spout bent to one side and a white
// octagonal mouth ring.
function burstModel(THREE) {
  const K = kit();
  const prof = smooth(THREE, [[0, -0.155], [0.07, -0.142], [0.12, -0.105], [0.148, -0.05], [0.152, 0.0], [0.142, 0.05],
    [0.115, 0.095], [0.08, 0.13], [0.045, 0.158], [0.024, 0.176], [0.018, 0.186]], 28);
  K.add('body', 'ink', latheY(THREE, prof, 32));
  const rAt = (y) => {
    for (let i = 1; i < prof.length; i++) if (prof[i][1] >= y) {
      const a = prof[i - 1], b = prof[i], t = (y - a[1]) / Math.max(1e-6, b[1] - a[1]);
      return a[0] + (b[0] - a[0]) * t;
    }
    return 0;
  };
  // Helical white stripe ribbon on the balloon surface (≈7 turns, icon).
  // The stripes wander (S1 render, promo): a slanted helix with a wobble.
  const N = 560, turns = 6, y0 = -0.14, y1 = 0.115, w = 0.0055, pos = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, th = turns * TAU * u, y = y0 + (y1 - y0) * u + 0.016 * Math.sin(th * 1.5 + 0.7) * Math.sin(Math.PI * u);
    for (const s of [-1, 1]) { const yy = y + s * w, r = rAt(yy) * 1.012 + 0.0008; pos.push(Math.sin(th) * r, yy, Math.cos(th) * r); }
  }
  const index = [];
  for (let i = 0; i < N; i++) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const ribbon = new THREE.BufferGeometry();
  ribbon.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ribbon.setIndex(index); ribbon.computeVertexNormals();
  K.add('body', 'stripe', ribbon);
  // Knot and spout.
  K.add('body', 'ink', new THREE.SphereGeometry(0.03, 14, 10).scale(1.1, 0.75, 1.1).translate(0, 0.197, 0),
    new THREE.TorusGeometry(0.02, 0.008, 6, 14).rotateX(Math.PI / 2).translate(0, 0.184, 0));
  const a = [0, 0.205, 0], b = [0, 0.28, 0.062];
  K.add('body', 'ink', rod(THREE, a, b, 0.016, 12, 0.028));
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  K.add('body', 'white', orient(THREE, new THREE.TorusGeometry(0.031, 0.012, 6, 8).rotateX(Math.PI / 2), d, b));
  return K.finish(THREE);
}

// ---- Autobomb: a white diving-bell robot on two legs --------------------------
// Icon, promo render (side), S2 promo 1-3 (walking, top-down) and the S3
// screenshot: white bell body with a riveted seam and decals, an ink top block
// with a darker hatch, an ink ring handle at the back, black hip discs and
// two short legs on ink flipper feet. Front = +Z.
function autobombModel(THREE) {
  const K = kit();
  const prof = smooth(THREE, [[0, 0.165], [0.07, 0.17], [0.12, 0.19], [0.158, 0.225], [0.18, 0.27], [0.19, 0.32],
    [0.192, 0.38], [0.19, 0.43], [0.18, 0.452], [0.15, 0.46], [0, 0.462]], 26);
  const ZS = 1.28;   // the bell is longer front-to-back than across (side render)
  const bell = latheY(THREE, prof, 36).scale(1, 1, ZS), bp = bell.attributes.position;
  for (let i = 0; i < bp.count; i++) {   // the rear underside rises toward the hip discs (side render)
    const y = bp.getY(i), z = bp.getZ(i), back = Math.min(1, Math.max(0, -z / 0.24)), low = Math.min(1, Math.max(0, (0.3 - y) / 0.135));
    bp.setY(i, y + 0.06 * back ** 1.5 * low);
  }
  bell.computeVertexNormals();
  K.add('body', 'white', bell);
  K.add('body', 'grey', new THREE.TorusGeometry(0.191, 0.0035, 5, 44).rotateX(Math.PI / 2).scale(1, 1, ZS).translate(0, 0.43, 0));
  const rivets = [];
  for (let k = 0; k < 22; k++) { const a = k * TAU / 22; rivets.push(new THREE.SphereGeometry(0.006, 6, 4).translate(Math.sin(a) * 0.192, 0.414, Math.cos(a) * 0.192 * ZS)); }
  K.add('body', 'grey', ...rivets);
  // Side decals (promo render): red/blue flag square behind two black text blocks.
  for (const s of [-1, 1]) {
    const x = s * 0.191;
    K.add('body', 'decalRed', box(THREE, 0.004, 0.04, 0.04, x, 0.385, -0.03));
    K.add('body', 'decalBlue', box(THREE, 0.005, 0.018, 0.04, x * 1.004, 0.372, -0.03));
    K.add('body', 'black', box(THREE, 0.004, 0.01, 0.07, x * 0.995, 0.405, 0.08), box(THREE, 0.004, 0.007, 0.06, x * 0.985, 0.385, 0.08),
      box(THREE, 0.004, 0.007, 0.05, x * 0.97, 0.37, 0.08));
  }
  // Top block (ink) with rounded ends; the front half of its top is the darker hatch.
  K.add('body', 'ink', box(THREE, 0.22, 0.075, 0.27, 0, 0.495, -0.03),
    new THREE.CylinderGeometry(0.0375, 0.0375, 0.22, 16).rotateZ(Math.PI / 2).translate(0, 0.495, 0.105),
    new THREE.CylinderGeometry(0.0375, 0.0375, 0.22, 16).rotateZ(Math.PI / 2).translate(0, 0.495, -0.165));
  K.add('body', 'inkDark', box(THREE, 0.2, 0.012, 0.13, 0, 0.536, 0.035));
  K.add('body', 'black', box(THREE, 0.04, 0.03, 0.04, 0.06, 0.545, -0.11));
  K.add('body', 'grey', new THREE.CylinderGeometry(0.012, 0.012, 0.025, 10).translate(-0.05, 0.545, -0.1));
  // Ink ring handle at the back.
  K.add('body', 'ink', new THREE.TorusGeometry(0.095, 0.034, 10, 28).translate(0, 0.34, -0.33),
    rod(THREE, [0, 0.34, -0.25], [0, 0.34, -0.33], 0.036, 16),
    ...[0, 1, 2].map(k => { const a = k * TAU / 3; return rod(THREE, [0, 0.34, -0.33], [Math.sin(a) * 0.09, 0.34 + Math.cos(a) * 0.09, -0.33], 0.014, 6); }));
  // Hip discs (speaker-like, concentric rings).
  for (const s of [-1, 1]) {
    K.add('body', 'black', new THREE.CylinderGeometry(0.088, 0.088, 0.05, 24).rotateZ(Math.PI / 2).translate(s * 0.165, 0.205, -0.085));
    K.add('body', 'grey', new THREE.TorusGeometry(0.062, 0.007, 6, 24).rotateY(Math.PI / 2).translate(s * 0.191, 0.205, -0.085),
      new THREE.CylinderGeometry(0.032, 0.032, 0.056, 16).rotateZ(Math.PI / 2).translate(s * 0.168, 0.205, -0.085));
  }
  // Legs (animated about the hip axis).
  for (const [name, s] of [['legL', 1], ['legR', -1]]) {
    const x = s * 0.115;
    K.pivot(name, [x, 0.205, -0.085]);
    K.add(name, 'black', box(THREE, 0.04, 0.09, 0.05, x, 0.17, -0.07), box(THREE, 0.036, 0.05, 0.06, x, 0.1, -0.035),
      box(THREE, 0.038, 0.03, 0.06, x, 0.035, 0.0));
    K.add(name, 'grey', rod(THREE, [x, 0.13, -0.06], [x, 0.04, -0.02], 0.009, 8), rod(THREE, [x, 0.13, -0.015], [x, 0.04, 0.025], 0.009, 8),
      rod(THREE, [x - s * 0.02, 0.035, 0.0], [x + s * 0.02, 0.035, 0.0], 0.006, 6));
    K.add(name, 'ink', box(THREE, 0.075, 0.012, 0.15, x, 0.008, 0.045), new THREE.CylinderGeometry(0.0375, 0.0375, 0.012, 14).translate(x, 0.008, 0.12));
    K.add(name, 'steel', tube(THREE, [[x, 0.012, -0.02], [x, 0.03, -0.07], [x, 0.012, -0.11]], 0.004, 12, 5));
  }
  return K.finish(THREE);
}

// ---- Fizzy Bomb: a shaken soda can --------------------------------------------
// Icon, promo render and S2 promo 1-2 / S3 screenshot: ink soda can with a
// white pixel print, a steel hose clamp round the middle, a wire bail looped
// over the top and under the bottom and a black pull ring on the lid edge.
function fizzyModel(THREE) {
  const K = kit();
  K.add('body', 'ink', latheY(THREE, smooth(THREE, [[0.074, 0.006], [0.092, 0.016], [0.1, 0.04], [0.1, 0.17], [0.1, 0.298],
    [0.091, 0.322], [0.077, 0.334]], 22), 32));
  K.add('body', 'steel', latheY(THREE, [[0, 0.0], [0.05, 0.002], [0.074, 0.006]], 32),
    latheY(THREE, [[0.077, 0.334], [0.078, 0.341], [0.073, 0.344], [0.066, 0.338], [0, 0.338]], 32),
    box(THREE, 0.02, 0.004, 0.034, 0, 0.341, 0.03));
  // Pixel print (two opposite sides).
  const print = [];
  for (const side of [0, Math.PI]) for (let c = 0; c < 4; c++) for (let j = 0; j < 10; j++) {
    if ((c * 7 + j * 3 + (side ? 1 : 0)) % 4 === 0 || (j > 3 && j < 6 && c === 1)) continue;
    const a = side - 0.27 + c * 0.17, y = 0.05 + j * 0.024;
    print.push(new THREE.BoxGeometry(0.014, 0.014, 0.003).rotateY(a).translate(Math.sin(a) * 0.1005, y, Math.cos(a) * 0.1005));
  }
  K.add('body', 'mark', ...print);
  // Hose clamp with screw housing.
  K.add('body', 'steel', new THREE.CylinderGeometry(0.105, 0.105, 0.034, 32, 1, true).translate(0, 0.17, 0),
    new THREE.TorusGeometry(0.105, 0.003, 4, 32).rotateX(Math.PI / 2).translate(0, 0.187, 0),
    new THREE.TorusGeometry(0.105, 0.003, 4, 32).rotateX(Math.PI / 2).translate(0, 0.153, 0),
    box(THREE, 0.03, 0.028, 0.05, 0.118, 0.17, 0), rod(THREE, [0.135, 0.17, -0.03], [0.135, 0.17, 0.035], 0.006, 8));
  // Flat steel strap looped over the top and under the bottom (plane through
  // the axis), wider than the can at both ends (promo render).
  K.add('body', 'steel', strap(THREE, [[0.107, 0.17, 0], [0.114, 0.29, 0], [0.12, 0.37, 0], [0.07, 0.405, 0], [-0.07, 0.405, 0], [-0.12, 0.37, 0],
    [-0.114, 0.29, 0], [-0.107, 0.17, 0], [-0.114, 0.05, 0], [-0.12, -0.03, 0], [-0.07, -0.062, 0], [0.07, -0.062, 0], [0.12, -0.03, 0],
    [0.114, 0.05, 0], [0.107, 0.17, 0]], 0.018, 0.004));
  K.add('body', 'black', new THREE.TorusGeometry(0.019, 0.004, 6, 16).translate(0.118, 0.318, 0.012),
    rod(THREE, [0.07, 0.342, 0], [0.108, 0.332, 0.008], 0.003, 5));
  return K.finish(THREE);
}

// ---- Torpedo: a fish-shaped squeeze bottle ------------------------------------
// Icon, promo render (side), S2 promo 1-3 and S3 screenshot: translucent ink
// fish body with wavy scale ridges, dorsal/ventral fins, a black two-blade
// propeller at the tail, a dark red ribbed cap and a grey nozzle with an arched
// loop and a glowing ink tip. Nose = +Z.
function torpedoModel(THREE) {
  const K = kit();
  const prof = smooth(THREE, [[0.026, -0.255], [0.05, -0.228], [0.095, -0.172], [0.136, -0.1], [0.16, -0.02], [0.164, 0.03],
    [0.154, 0.078], [0.128, 0.112], [0.092, 0.133]], 30);
  const shell = latheZ(THREE, prof, 32), p = shell.attributes.position;
  for (let i = 0; i < p.count; i++) {   // wavy scale ridges
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.045 * Math.max(0, Math.sin((z + 0.3) * 36 + 0.7 * Math.sin(Math.atan2(y, x) * 3)));
    p.setXYZ(i, x * k * 0.96, y * k, z);
  }
  shell.computeVertexNormals();
  K.add('body', 'inkMilk', shell);
  const fin = (h, len) => {
    const shp = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-len, 0), new THREE.Vector2(-len * 0.8, h), new THREE.Vector2(-len * 0.25, h * 0.6)]);
    return new THREE.ExtrudeGeometry(shp, { depth: 0.008, bevelEnabled: false }).translate(0, 0, -0.004).rotateY(-Math.PI / 2);
  };
  // Dorsal fin toward the tail, ventral fin under the belly (promo render).
  K.add('body', 'inkMilk', fin(0.055, 0.085).translate(0, 0.12, -0.1), fin(0.05, 0.08).scale(1, -1, 1).translate(0, -0.135, -0.02));
  K.pivot('prop', [0, 0, -0.27]);
  K.add('prop', 'black', new THREE.CylinderGeometry(0.018, 0.024, 0.05, 12).rotateX(Math.PI / 2).translate(0, 0, -0.265),
    box(THREE, 0.012, 0.075, 0.034, 0, 0.05, -0.282).rotateZ(0.0), box(THREE, 0.012, 0.075, 0.034, 0, -0.05, -0.282));
  // Cap, nozzle, loop and tip light.
  K.add('body', 'capRed', new THREE.CylinderGeometry(0.086, 0.086, 0.066, 28).rotateX(Math.PI / 2).translate(0, 0, 0.162),
    ...Array.from({ length: 16 }, (_, k) => { const a = k * TAU / 16; return box(THREE, 0.012, 0.012, 0.058, Math.sin(a) * 0.088, Math.cos(a) * 0.088, 0.162); }));
  K.add('body', 'steel', new THREE.CylinderGeometry(0.032, 0.045, 0.02, 18).rotateX(Math.PI / 2).translate(0, 0, 0.204),
    rod(THREE, [0, 0, 0.2], [0, 0, 0.3], 0.019, 12));
  K.add('body', 'white', new THREE.TorusGeometry(0.048, 0.009, 8, 18, Math.PI).rotateY(Math.PI / 2).translate(0, 0.019, 0.252));
  K.add('body', 'inkGlow', new THREE.SphereGeometry(0.03, 14, 10).translate(0, 0, 0.315), new THREE.SphereGeometry(0.011, 8, 6).translate(0, 0.072, 0.252));
  K.add('body', 'steel', new THREE.TorusGeometry(0.03, 0.005, 5, 16).translate(0, 0, 0.305));
  return K.finish(THREE);
}

// ---- Ink Mine: a perforated plate with a holographic dot ring -----------------
// Icon, S2 promo render/promo 1 and S3 screenshot: a dark round grate laid
// on the floor and a short ring of team-coloured dots standing round it.
function inkMineModel(THREE) {
  const K = kit();
  K.add('body', 'darkMetal', new THREE.CylinderGeometry(0.28, 0.285, 0.014, 40).translate(0, 0.007, 0));
  K.add('body', 'black', new THREE.TorusGeometry(0.281, 0.008, 5, 40).rotateX(Math.PI / 2).translate(0, 0.012, 0));
  const holes = [], step = 0.034;
  for (let j = -8; j <= 8; j++) for (let i = -9; i <= 9; i++) {
    const x = (i + (j & 1 ? 0.5 : 0)) * step, z = j * step * 0.866;
    if (Math.hypot(x, z) < 0.255) holes.push(new THREE.CircleGeometry(0.0115, 8).rotateX(-Math.PI / 2).translate(x, 0.0145, z));
  }
  K.add('body', 'hole', ...holes);
  const dots = [];
  // Promo render: the ring is about a third of the plate's diameter tall, with
  // ~22 large dots per row shrinking upward and slightly irregular.
  [[0.036, 0.027], [0.084, 0.021], [0.126, 0.016], [0.162, 0.011], [0.19, 0.007]].forEach(([y, r], row) => {
    for (let k = 0; k < 22; k++) {
      const j = Math.sin(k * 12.9898 + row * 78.233) * 43758.5453, n = j - Math.floor(j);
      const a = (k + (row & 1 ? 0.5 : 0) + (n - 0.5) * 0.25) * TAU / 22, rr = r * (0.8 + 0.4 * n);
      dots.push(new THREE.CircleGeometry(rr, 10).rotateY(a).translate(Math.sin(a) * 0.29, y + (n - 0.5) * 0.01, Math.cos(a) * 0.29));
    }
  });
  K.add('holo', 'inkHolo', ...dots);
  return K.finish(THREE);
}

// ---- Toxic Mist: a stoppered round flask in an ink cage -----------------------
// Icon, promo render, S2 promo 1 and S3 screenshot 1: clear round-bottom flask
// with murky green liquid, black stopper, ink neck collar and equator band
// with bolts, a steel bar to a black ribbed grip parallel to the flask.
// Origin = bulb centre.
function toxicMistModel(THREE) {
  const K = kit();
  K.add('body', 'glass', new THREE.SphereGeometry(0.12, 28, 18), new THREE.CylinderGeometry(0.04, 0.04, 0.15, 20, 1, true).translate(0, 0.17, 0),
    new THREE.TorusGeometry(0.043, 0.005, 6, 20).rotateX(Math.PI / 2).translate(0, 0.243, 0));
  // Olive liquid fills most of the bulb and rises into the neck (icon, promo).
  K.add('body', 'murk', new THREE.SphereGeometry(0.111, 24, 14, 0, TAU, Math.PI * 0.12, Math.PI * 0.88),
    new THREE.CircleGeometry(Math.sin(Math.PI * 0.12) * 0.111, 16).rotateX(-Math.PI / 2).translate(0, Math.cos(Math.PI * 0.12) * 0.111, 0),
    new THREE.CylinderGeometry(0.034, 0.034, 0.1, 14).translate(0, 0.155, 0));
  // White logo print on the glass, front and back.
  K.add('body', 'label', new THREE.SphereGeometry(0.1215, 14, 6, Math.PI / 2 - 0.55, 1.1, Math.PI * 0.4, Math.PI * 0.16),
    new THREE.SphereGeometry(0.1215, 14, 6, -Math.PI / 2 - 0.55, 1.1, Math.PI * 0.4, Math.PI * 0.16));
  K.add('body', 'black', latheY(THREE, [[0, 0.232], [0.036, 0.232], [0.04, 0.242], [0.048, 0.246], [0.05, 0.292], [0.045, 0.304], [0, 0.307]], 20));
  K.add('body', 'ink', new THREE.CylinderGeometry(0.057, 0.057, 0.042, 22).translate(0, 0.17, 0), box(THREE, 0.05, 0.03, 0.03, 0.075, 0.17, 0),
    latheY(THREE, [[0.117, -0.034], [0.142, -0.032], [0.15, -0.02], [0.15, 0.02], [0.142, 0.032], [0.117, 0.034]], 32),
    box(THREE, 0.04, 0.055, 0.042, -0.16, 0, 0), box(THREE, 0.04, 0.055, 0.042, 0.16, 0, 0));
  K.add('body', 'steel', new THREE.CylinderGeometry(0.009, 0.009, 0.052, 8).rotateX(Math.PI / 2).translate(-0.18, 0, 0),
    new THREE.CylinderGeometry(0.009, 0.009, 0.052, 8).rotateX(Math.PI / 2).translate(0.18, 0, 0),
    new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8).rotateX(Math.PI / 2).translate(0.1, 0.17, 0),
    tube(THREE, [[0.09, 0.17, 0], [0.18, 0.17, 0], [0.206, 0.15, 0], [0.21, 0.115, 0]], 0.011, 16, 8),
    rod(THREE, [0.21, -0.085, 0], [0.182, -0.022, 0], 0.01, 8));
  const grip = [];
  for (let i = 0; i <= 14; i++) grip.push([i % 2 ? 0.03 : 0.025, -0.09 + i * 0.0145]);
  K.add('body', 'rubber', latheY(THREE, [[0, -0.095], ...grip, [0, 0.12]], 16).translate(0.21, 0, 0));
  return K.finish(THREE);
}

// Toxic Mist cloud: soft dark puffs in a unit dome (scaled by the caller).
function mistCloudModel(THREE) {
  const K = kit();
  // Many overlapping faint puffs read as one hazy dome (S3 screenshots).
  const puffs = [];
  for (let k = 0; k < 16; k++) {
    const j = Math.sin(k * 91.7 + 3.1) * 43758.5453, n = j - Math.floor(j), a = k * 2.399963, r = 0.25 + 0.6 * Math.sqrt((k + 0.5) / 16);
    puffs.push([Math.cos(a) * r * 0.8, 0.25 + 0.45 * (1 - r) + 0.15 * n, Math.sin(a) * r * 0.8, 0.38 + 0.22 * n]);
  }
  puffs.push([0, 0.55, 0, 0.62]);
  K.add('body', 'mist', ...puffs.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 3).translate(x, y, z)));
  return K.finish(THREE);
}

// ---- Angle Shooter: a chisel-tip marker ---------------------------------------
// Icon, promo render, 12-angle turntable and S3 screenshot: glossy ink bottle
// with a felt pad on the wide end, a rounded shoulder, a white wrap label and
// a chisel nib. It flies wide end first and the nib draws the line, so the
// wide end is +Z.
function angleShooterModel(THREE) {
  const K = kit();
  K.add('body', 'inkGloss', latheZ(THREE, smooth(THREE, [[0.03, -0.135], [0.036, -0.122], [0.05, -0.106], [0.058, -0.094], [0.06, -0.078],
    [0.06, 0.012], [0.068, 0.034], [0.082, 0.06], [0.088, 0.085], [0.088, 0.19], [0.087, 0.196]], 26), 30));
  K.add('body', 'inkFelt', latheZ(THREE, [[0.087, 0.192], [0.09, 0.2], [0.087, 0.21], [0.062, 0.218], [0, 0.22]], 30));
  K.add('body', 'label', new THREE.CylinderGeometry(0.0615, 0.0615, 0.086, 30, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.034));
  K.add('body', 'inkGloss', new THREE.CylinderGeometry(0.0622, 0.0622, 0.006, 30, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.07),
    new THREE.CylinderGeometry(0.0622, 0.0622, 0.006, 30, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.002),
    // Large ink lettering block on two sides of the label, small marks between.
    ...[Math.PI / 2, Math.PI * 1.5].flatMap(c => [-0.62, 0, 0.62].map(o => new THREE.CylinderGeometry(0.0624, 0.0624, o ? 0.044 : 0.052, 6, 1, true, c + o - 0.24, 0.48)
      .rotateX(Math.PI / 2).translate(0, 0, -0.034 + (o ? 0.002 : 0)))),
    new THREE.CylinderGeometry(0.0624, 0.0624, 0.012, 6, 1, true, -0.35, 0.7).rotateX(Math.PI / 2).translate(0, 0, -0.022),
    new THREE.CylinderGeometry(0.0624, 0.0624, 0.008, 6, 1, true, -0.25, 0.5).rotateX(Math.PI / 2).translate(0, 0, -0.045));
  const nib = new THREE.BoxGeometry(0.046, 0.024, 0.06, 2, 1, 2), p = nib.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) p.setZ(i, p.getZ(i) + (p.getX(i) + 0.023) / 0.046 * 0.03);
  nib.computeVertexNormals();
  K.add('body', 'inkFelt', nib.translate(0, 0, -0.158));
  return K.finish(THREE);
}

// ---- Splash Wall: a syringe stand with two arched spray arms ------------------
// Icon (folded), promo render, S1 render and S3 screenshot: round black foot,
// steel lower rod, ink collars round a clear graduated tank of ink, ink upper
// rod, steel hub with a spike, two arched ink arms with steel joints and a
// thin top wire, and a curtain of falling ink streams under the arms.
function armY(x, W, H) {
  const u = Math.abs(x) / (W / 2);
  return H * 0.9 + 0.12 * Math.sin(Math.PI * Math.min(u / 0.55, 1)) - 0.2 * Math.max(0, (u - 0.55) / 0.45) ** 2;
}
function splashWallModel(THREE, W, H) {
  const K = kit();
  const y = (f) => H * f;
  K.add('body', 'black', latheY(THREE, [[0, 0], [0.13, 0], [0.142, 0.012], [0.11, 0.04], [0.045, 0.062], [0, 0.066]], 24));
  K.add('body', 'steel', new THREE.CylinderGeometry(0.022, 0.022, y(0.33) - 0.06, 12).translate(0, (y(0.33) + 0.06) / 2, 0),
    new THREE.CylinderGeometry(0.1, 0.1, 0.02, 24).translate(0, y(0.355), 0), new THREE.CylinderGeometry(0.1, 0.1, 0.02, 24).translate(0, y(0.615), 0),
    new THREE.CylinderGeometry(0.06, 0.06, 0.1, 18).translate(0, y(0.9), 0));
  K.add('body', 'ink', new THREE.CylinderGeometry(0.105, 0.105, 0.05, 24).translate(0, y(0.338), 0),
    new THREE.CylinderGeometry(0.105, 0.105, 0.05, 24).translate(0, y(0.632), 0),
    new THREE.CylinderGeometry(0.026, 0.026, y(0.87) - y(0.645), 12).translate(0, (y(0.87) + y(0.645)) / 2, 0),
    new THREE.CylinderGeometry(0.07, 0.07, 0.04, 18).translate(0, y(0.868), 0));
  K.add('body', 'glass', new THREE.CylinderGeometry(0.09, 0.09, y(0.605) - y(0.365), 24, 1, true).translate(0, (y(0.605) + y(0.365)) / 2, 0));
  K.add('body', 'inkGlass', new THREE.CylinderGeometry(0.08, 0.08, y(0.57) - y(0.368), 20).translate(0, (y(0.57) + y(0.368)) / 2, 0));
  const marks = [];
  for (let i = 0; i < 14; i++) { const yy = y(0.385) + i * (y(0.585) - y(0.385)) / 13, wide = i % 4 === 0; marks.push(box(THREE, wide ? 0.04 : 0.022, 0.006, 0.003, wide ? -0.01 : 0, yy, 0.091)); }
  K.add('body', 'mark', ...marks);
  K.add('body', 'black', new THREE.ConeGeometry(0.022, 0.2, 10).translate(0, y(0.9) + 0.15, 0));
  // Arms: built per side so mirroring never flips the winding.
  for (const [name, s] of [['armR', 1], ['armL', -1]]) {
    const hub = [s * 0.06, y(0.9), 0];
    K.pivot(name, hub);
    const pts = [];
    for (let i = 0; i <= 10; i++) { const x = s * (0.06 + i / 10 * (W / 2 - 0.06)); pts.push([x, armY(x, W, H), 0]); }
    K.add(name, 'ink', tube(THREE, pts, 0.022, 40, 8));
    K.add(name, 'inkDark', tube(THREE, pts.slice(1, 9).map(([x, yy]) => [x, yy + 0.05, 0]), 0.008, 30, 5));
    const joints = [];
    for (const f of [0.18, 0.45, 0.72]) { const x = s * f * W / 2; joints.push(box(THREE, 0.09, 0.07, 0.07, x, armY(x, W, H) + 0.015, 0)); }
    K.add(name, 'steel', ...joints);
    const tip = pts[pts.length - 1];
    K.add(name, 'black', new THREE.ConeGeometry(0.03, 0.08, 10).rotateZ(s * Math.PI / 2 * -1).translate(tip[0] + s * 0.03, tip[1], 0));
  }
  // Curtain: falling streams and a faint sheet between them.
  const streams = [], n = 17;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.12 + i * (W - 0.24) / (n - 1), top = armY(x, W, H) - 0.02;
    streams.push(box(THREE, 0.085, top, 0.03, x, top / 2, 0));
  }
  K.add('curtain', 'inkStream', ...streams);
  const sheet = [], seg = 24, idx = [];
  for (let i = 0; i <= seg; i++) { const x = -W / 2 + i * W / seg; sheet.push(x, armY(x, W, H) - 0.02, 0, x, 0, 0); }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const plane = new THREE.BufferGeometry();
  plane.setAttribute('position', new THREE.Float32BufferAttribute(sheet, 3)); plane.setIndex(idx); plane.computeVertexNormals();
  K.add('curtain', 'inkSheet', plane);
  return K.finish(THREE);
}

// ---- Sprinkler: a conical base with a two-armed spinning head -----------------
// Icon, S1 HQ render, promo render, S2 promo 1 and S3 screenshot: black base
// disc under an ink cone, a black column with a blue band, a spring-topped
// hub and two raised arms of black pipe, ink hex nozzle and an open black
// rectangular frame. The head spins with the spray phase.
function sprinklerModel(THREE) {
  const K = kit();
  K.add('body', 'black', latheY(THREE, [[0, 0], [0.17, 0], [0.176, 0.012], [0.168, 0.024], [0, 0.024]], 36));
  K.add('body', 'ink', latheY(THREE, [[0, 0.024], [0.165, 0.024], [0.16, 0.036], [0.064, 0.122], [0.052, 0.128], [0, 0.128]], 36));
  // Dark logo print on the cone (front and back).
  K.add('body', 'darkMetal', ...[0, Math.PI].map(a => new THREE.CylinderGeometry(0.124, 0.136, 0.018, 10, 1, true, a - 0.32, 0.64).translate(0, 0.07, 0)));
  // Everything above the cone turns with the spray (head).
  K.pivot('head', [0, 0.128, 0]);
  K.add('head', 'black', latheY(THREE, [[0, 0.126], [0.052, 0.126], [0.046, 0.15], [0.038, 0.185], [0.045, 0.2], [0.058, 0.225],
    [0.06, 0.25], [0.052, 0.275], [0.036, 0.29], [0, 0.292]], 20));
  K.add('head', 'blueBand', new THREE.CylinderGeometry(0.034, 0.036, 0.034, 20).translate(0, 0.305, 0));
  const helix = [];
  for (let i = 0; i <= 40; i++) { const a = i / 40 * 3.5 * TAU; helix.push([Math.cos(a) * 0.03, 0.325 + i / 40 * 0.045, Math.sin(a) * 0.03]); }
  K.add('head', 'steel', tube(THREE, helix, 0.0055, 80, 5), new THREE.CylinderGeometry(0.006, 0.006, 0.07, 8).translate(0, 0.37, 0),
    new THREE.CylinderGeometry(0.034, 0.034, 0.006, 16).translate(0, 0.323, 0));
  K.add('head', 'black', box(THREE, 0.012, 0.07, 0.03, 0.036, 0.345, 0), box(THREE, 0.012, 0.07, 0.03, -0.036, 0.345, 0),
    box(THREE, 0.084, 0.01, 0.03, 0, 0.382, 0));
  const up = 0.47;   // arms rise ~27 deg (promo render)
  for (const s of [-1, 1]) {
    const d = [s * Math.cos(up), Math.sin(up), 0], o = [s * 0.035, 0.235, 0];
    const at = (t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2]];
    K.add('head', 'black', rod(THREE, o, at(0.06), 0.026, 14));
    K.add('head', 'ink', orient(THREE, new THREE.CylinderGeometry(0.048, 0.048, 0.07, 6), d, at(0.09)),
      orient(THREE, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), d, at(0.13)));
    // Open box frame at the arm end: long along the arm, tall, its mesh
    // face toward the front and back (S1 render, promo render).
    const L = 0.15, Hh = 0.1, D = 0.06, T = 0.016;
    const frame = [box(THREE, L, T, D, L / 2, Hh / 2 - T / 2, 0), box(THREE, L, T, D, L / 2, -Hh / 2 + T / 2, 0),
      box(THREE, T, Hh, D, T / 2, 0, 0), box(THREE, T, Hh, D, L - T / 2, 0, 0)];
    const face = box(THREE, L - T, Hh - T, 0.008, L / 2, 0, 0);
    const place = (g) => (s > 0 ? g : g.rotateY(Math.PI)).rotateZ(s * up).translate(...at(0.14));
    K.add('head', 'black', ...frame.map(place));
    K.add('head', 'rubber', place(face));
  }
  return K.finish(THREE);
}

// ---- Squid Beakon: a radar dish on a tripod -----------------------------------
// Icon (front), S1 HQ render (3/4), promo render and S3 screenshot: black
// tripod with grey joints and rubber feet, black column and up-pointing cone,
// an ink platform with a hinge, a back-tilted trapezoid lattice dish and a
// round feed pipe with a hook in front. The dish turns on the column.
function beakonModel(THREE) {
  const K = kit();
  for (let k = 0; k < 3; k++) {
    const a = k * TAU / 3, hub = [0, 0.3, 0], foot = [Math.sin(a) * 0.23, 0.02, Math.cos(a) * 0.23];
    const L = (t) => [hub[0] + (foot[0] - hub[0]) * t, hub[1] + (foot[1] - hub[1]) * t, hub[2] + (foot[2] - hub[2]) * t];
    K.add('body', 'black', rod(THREE, L(0), L(0.5), 0.016, 8));
    K.add('body', 'grey', rod(THREE, L(0.48), L(0.6), 0.021, 10));
    K.add('body', 'rubber', rod(THREE, L(0.58), L(1), 0.026, 10, 0.03));
    K.add('body', 'steel', rod(THREE, L(0.2), [Math.sin(a) * 0.02, 0.2, Math.cos(a) * 0.02], 0.005, 5));
  }
  K.add('body', 'steel', new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8).translate(0, 0.25, 0));
  K.add('body', 'black', new THREE.CylinderGeometry(0.04, 0.045, 0.14, 16).translate(0, 0.35, 0),
    latheY(THREE, [[0, 0.41], [0.078, 0.415], [0.074, 0.43], [0.03, 0.5], [0.02, 0.515], [0, 0.52]], 18));
  K.pivot('dish', [0, 0.52, 0]);
  K.add('dish', 'steel', new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10).translate(0, 0.535, 0));
  K.add('dish', 'ink', box(THREE, 0.3, 0.034, 0.2, 0, 0.574, 0.0), new THREE.CylinderGeometry(0.028, 0.028, 0.26, 12).rotateZ(Math.PI / 2).translate(0, 0.6, -0.05));
  // Lattice dish (built upright at the hinge, then tilted back). Front view
  // (icon): a shield-shaped hexagon, widest about a third below the top.
  const lat = [], r = 0.012, hinge = new THREE.Vector3(0, 0.6, -0.05);
  const face = (zz, k, dy = 0) => {
    const bw = 0.13 * k, mw = 0.275 * k, tw = 0.24 * k, h = 0.31 * k, y0 = 0.62 + dy;
    return [[-bw, y0, zz], [bw, y0, zz], [mw, y0 + 0.66 * h, zz], [tw, y0 + h, zz], [-tw, y0 + h, zz], [-mw, y0 + 0.66 * h, zz]];
  };
  const F = face(-0.04, 1), B = face(-0.115, 0.84, 0.025), n = F.length;
  for (let i = 0; i < n; i++) lat.push(rod(THREE, F[i], F[(i + 1) % n], r, 6), rod(THREE, B[i], B[(i + 1) % n], r * 0.85, 6), rod(THREE, F[i], B[i], r * 0.8, 6));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  for (const t of [1 / 3, 2 / 3]) lat.push(rod(THREE, mix(F[0], F[1], t), mix(F[4], F[3], t), r * 0.8, 6));
  lat.push(rod(THREE, F[5], F[2], r * 0.8, 6));
  lat.push(rod(THREE, F[0], mix(F[5], F[2], 1 / 3), r * 0.6, 5), rod(THREE, F[1], mix(F[5], F[2], 2 / 3), r * 0.6, 5),
    rod(THREE, mix(F[5], F[2], 1 / 3), F[3], r * 0.6, 5), rod(THREE, mix(F[5], F[2], 2 / 3), F[4], r * 0.6, 5));
  lat.push(rod(THREE, [0, 0.6, -0.05], mix(F[0], F[1], 0.5), r, 6));
  const tilt = new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z)
    .multiply(new THREE.Matrix4().makeRotationX(-0.45)).multiply(new THREE.Matrix4().makeTranslation(-hinge.x, -hinge.y, -hinge.z));
  K.add('dish', 'ink', ...lat.map(g => g.applyMatrix4(tilt)));
  K.add('dish', 'black', ...[F[3], F[4]].map(p => box(THREE, 0.03, 0.045, 0.03, ...p).applyMatrix4(tilt)));
  // Feed pipe with a thick D-shaped hook in front (S1 render, promo render).
  K.add('dish', 'ink', new THREE.CylinderGeometry(0.052, 0.052, 0.12, 18).rotateX(Math.PI / 2).translate(0, 0.64, 0.13),
    new THREE.TorusGeometry(0.052, 0.022, 8, 18, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI).translate(0, 0.615, 0.19),
    box(THREE, 0.06, 0.05, 0.1, 0, 0.6, 0.06), box(THREE, 0.24, 0.025, 0.06, 0, 0.59, 0.14));
  K.add('dish', 'black', new THREE.CircleGeometry(0.042, 16).translate(0, 0.64, 0.1905));
  return K.finish(THREE);
}

// ---- Point Sensor: a satellite box --------------------------------------------
// Icon, S1 render (front), promo render and S3 screenshot: chrome box with
// chamfered top edges, dark blue solar panels with ink borders on every face,
// two hinged solar wings at the bottom and four glowing ink antennas from black
// sockets on the top corners. Origin = box centre.
function pointSensorModel(THREE) {
  const K = kit();
  const s = 0.1, c = 0.05;
  // Box with all four top edges chamfered (S1 render front, promo top).
  const P = (x, y, z) => [x, y, z];
  const Bt = [P(-s, -s, -s), P(s, -s, -s), P(s, -s, s), P(-s, -s, s)];
  const M = [P(-s, s - c, -s), P(s, s - c, -s), P(s, s - c, s), P(-s, s - c, s)];
  const T = [P(-s + c, s, -s + c), P(s - c, s, -s + c), P(s - c, s, s - c), P(-s + c, s, s - c)];
  const faces = [Bt, T];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; faces.push([Bt[i], Bt[j], M[j], M[i]], [M[i], M[j], T[j], T[i]]); }
  K.add('body', 'chrome', polyhedron(THREE, faces));
  // Frame rails along the vertical edges and the chamfer edges.
  const rails = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    rails.push(rod(THREE, Bt[i], M[i], 0.008, 6), rod(THREE, M[i], M[j], 0.007, 6), rod(THREE, M[i], T[i], 0.007, 6), rod(THREE, T[i], T[j], 0.006, 6));
  }
  K.add('body', 'darkMetal', ...rails);
  // Solar cells with ink borders: lower rectangle and upper cell on each side.
  const panel = (w, h, x, y, z, ry) => {
    K.add('body', 'ink', box(THREE, w, h, 0.006).rotateY(ry).translate(x, y, z));
    K.add('body', 'panel', box(THREE, w - 0.014, h - 0.014, 0.008).rotateY(ry).translate(x, y, z));
  };
  for (const zs of [1, -1]) { panel(0.17, 0.085, 0, -0.045, zs * (s + 0.002), 0); panel(0.17, 0.055, 0, 0.025, zs * (s + 0.002), 0); }
  for (const xs of [1, -1]) { panel(0.17, 0.085, xs * (s + 0.002), -0.045, 0, Math.PI / 2); panel(0.17, 0.055, xs * (s + 0.002), 0.025, 0, Math.PI / 2); }
  K.add('body', 'ink', box(THREE, 0.09, 0.006, 0.09, 0, s + 0.002, 0));
  K.add('body', 'panel', box(THREE, 0.076, 0.008, 0.076, 0, s + 0.002, 0));
  const rivets = [];
  for (const zs of [1, -1]) for (let i = 0; i < 6; i++) rivets.push(new THREE.SphereGeometry(0.005, 6, 4).translate(-s + 0.012 + i * 0.035, -0.0015, zs * (s + 0.004)));
  K.add('body', 'darkMetal', ...rivets);
  // Hinged wings on the bottom edges of the sides.
  for (const xs of [1, -1]) {
    K.add('body', 'chrome', box(THREE, 0.21, 0.012, 0.19, xs * (s + 0.105), -s + 0.006, 0), box(THREE, 0.02, 0.02, 0.17, xs * (s + 0.005), -s + 0.01, 0));
    K.add('body', 'ink', box(THREE, 0.19, 0.004, 0.17, xs * (s + 0.105), -s + 0.013, 0));
    K.add('body', 'panel', box(THREE, 0.176, 0.006, 0.156, xs * (s + 0.105), -s + 0.0135, 0));
  }
  // Antennas splay radially from black sockets on the top corners.
  for (const xs of [1, -1]) for (const zs of [1, -1]) {
    const base = [xs * (s - c * 0.55), s - c * 0.45, zs * (s - c * 0.55)], d = [xs, 1.05, zs];
    K.add('body', 'black', orient(THREE, new THREE.ConeGeometry(0.034, 0.06, 4).rotateY(Math.PI / 4).translate(0, 0.03, 0), d, base));
    const n = Math.hypot(...d), tip = base.map((v, i) => v + d[i] / n * 0.05);
    K.add('antenna', 'inkGlow', orient(THREE, new THREE.CylinderGeometry(0.013, 0.013, 0.15, 10).translate(0, 0.075, 0), d, tip));
  }
  return K.finish(THREE);
}

// ---- shared cache / materials -------------------------------------------------

const BUILDERS = {
  burst: burstModel, autobomb: autobombModel, fizzy: fizzyModel, torpedo: torpedoModel, inkMine: inkMineModel,
  toxicMist: toxicMistModel, toxicMistCloud: mistCloudModel, angleShooter: angleShooterModel,
  sprinkler: sprinklerModel, beakon: beakonModel, pointSensor: pointSensorModel,
};
const cacheByThree = new WeakMap();
function sharedModel(THREE, id, dims) {
  let cache = cacheByThree.get(THREE);
  if (!cache) cacheByThree.set(THREE, cache = new Map());
  const W = dims?.width ?? SPLASH_WALL_DIMS.width, H = dims?.height ?? SPLASH_WALL_DIMS.height;
  const key = id === 'splashWall' ? `splashWall:${W}:${H}` : id;
  if (!cache.has(key)) {
    const build = id === 'splashWall' ? (T) => splashWallModel(T, W, H) : BUILDERS[id];
    if (!build) return null;
    cache.set(key, build(THREE));
  }
  return cache.get(key);
}

function inkColorOf(THREE, ink) {
  return ink?.color?.isColor ? ink.color.clone() : new THREE.Color(0xffcc33);
}
function makeMaterials(THREE, ink) {
  const made = new Map(), base = inkColorOf(THREE, ink);
  const get = (finish) => {
    if (made.has(finish)) return made.get(finish);
    let m;
    if (finish === 'ink' && ink) m = ink;
    else if (finish in INK_FINISH) {
      const f = INK_FINISH[finish] || {}, col = base.clone();
      if (f.shade) col.multiplyScalar(f.shade);
      if (f.grey) col.lerp(new THREE.Color(0x3c3c44), f.grey);
      const opts = { color: col, transparent: !!f.transparent, opacity: f.opacity ?? 1 };
      if (f.depthWrite === false) opts.depthWrite = false;
      if (f.double) opts.side = THREE.DoubleSide;
      if (f.basic) m = new THREE.MeshBasicMaterial(opts);
      else {
        m = new THREE.MeshStandardMaterial({ ...opts, roughness: f.roughness ?? 0.45, metalness: f.metalness ?? 0.1 });
        if (f.emissive) { m.emissive = base.clone(); m.emissiveIntensity = f.emissive; }
      }
      m.userData.s3InkDerived = { shade: f.shade || 1, grey: f.grey || 0 };
    } else {
      const f = FINISH[finish] || FINISH.black, opts = { color: f[0], ...f[1] };
      if (opts.emissive != null) opts.emissive = new THREE.Color(opts.emissive);
      if (finish === 'stripe') opts.side = THREE.DoubleSide;
      m = new THREE.MeshStandardMaterial(opts);
    }
    made.set(finish, m);
    return m;
  };
  return { get, made };
}

/**
 * Build one sub model instance.
 * @returns {{ id, root: THREE.Group, groups: Object<string, THREE.Group>, body: THREE.Mesh|null,
 *            inkMeshes: THREE.Mesh[], materials: Map<string, THREE.Material>, state: object }|null}
 */
export function buildSubModel(THREE, id, inkMaterial = null, opts = {}) {
  const spec = sharedModel(THREE, id, opts.dims);
  if (!spec) return null;
  const mats = makeMaterials(THREE, inkMaterial), root = new THREE.Group(), groups = {}, inkMeshes = [];
  for (const g of spec) {
    const grp = new THREE.Group();
    grp.name = g.name; grp.position.set(...g.pivot);
    grp.userData.rest = grp.position.clone();
    for (const [finish, geo] of g.parts) {
      const m = mats.get(finish), mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = !m.transparent; mesh.receiveShadow = !m.transparent;
      mesh.userData.s3Finish = finish;
      grp.add(mesh);
      if (finish === 'ink') inkMeshes.push(mesh);
    }
    root.add(grp); groups[g.name] = grp;
  }
  root.userData.s3SubModel = id;
  const model = { id, root, groups, body: inkMeshes[0] || null, inkMeshes, materials: mats.made, state: { t: 0 } };
  if (id === 'splashWall') poseSubModel(model, { unfold: opts.unfold ?? 1, dt: 0 });
  if (id === 'inkMine' && groups.holo) groups.holo.visible = opts.armed !== false;
  return model;
}

// Re-tint every ink-derived material (team colour change on a held prop).
export function tintSubModel(model, color) {
  if (!model?.materials || !color) return;
  for (const m of model.materials.values()) {
    const d = m.userData?.s3InkDerived;
    if (!d) continue;
    m.color.copy(color);
    if (d.shade !== 1) m.color.multiplyScalar(d.shade);
    if (d.grey) m.color.lerp(m.color.clone().setHex(0x3c3c44), d.grey);
    if (m.emissive && m.emissiveIntensity > 0) m.emissive.copy(color);
  }
}

export function isSharedGeometry(g) { return !!g?.userData?.[SHARED_FLAG]; }

const smoothstep = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/**
 * Per-frame presentation. `s` carries only presentation inputs:
 *  dt, speed (ground speed m/s), spin (sprinkler head angle, rad), unfold (0..1),
 *  armed, warn (0..1 fuse warning), bulge (0..1), age.
 * Allocation-free.
 */
export function poseSubModel(model, s = {}) {
  if (!model) return;
  const g = model.groups, st = model.state, dt = Number.isFinite(s.dt) ? Math.max(0, Math.min(0.25, s.dt)) : 0;
  st.t += dt;
  switch (model.id) {
    case 'autobomb': {
      const v = Number.isFinite(s.speed) ? s.speed : 0;
      st.stride = (st.stride || 0) + dt * v * 9;
      const k = Math.min(1, v / 1.5), sw = Math.sin(st.stride) * 0.5 * k;
      if (g.legL) g.legL.rotation.x = sw;
      if (g.legR) g.legR.rotation.x = -sw;
      if (g.body) g.body.position.y = Math.abs(Math.cos(st.stride)) * 0.012 * k;
      break;
    }
    case 'torpedo':
      if (g.prop) g.prop.rotation.z += dt * (s.flying === false ? 4 : 40);
      break;
    case 'sprinkler':
      if (g.head && Number.isFinite(s.spin)) g.head.rotation.y = s.spin;
      break;
    case 'beakon':
      if (g.dish) g.dish.rotation.y += dt * (s.active === false ? 0 : 1.1);
      break;
    case 'splashWall': {
      const u = Number.isFinite(s.unfold) ? Math.min(1, Math.max(0, s.unfold)) : 1;
      const arms = smoothstep(u * 1.6 - 0.6), grow = smoothstep(u * 1.4);
      model.root.scale.setScalar(SPLASH_WALL_FOLDED_SCALE + (1 - SPLASH_WALL_FOLDED_SCALE) * grow);
      if (g.armR) g.armR.rotation.z = (1 - arms) * Math.PI * 0.44;
      if (g.armL) g.armL.rotation.z = -(1 - arms) * Math.PI * 0.44;
      if (g.curtain) {
        g.curtain.visible = u >= 0.999;
        g.curtain.scale.y = 1 + 0.015 * Math.sin(st.t * 21);
      }
      break;
    }
    case 'inkMine':
      if (g.holo) {
        g.holo.visible = s.armed !== false;
        g.holo.rotation.y += dt * 0.6;
      }
      break;
    case 'fizzy': {
      const b = Number.isFinite(s.bulge) ? Math.min(1, Math.max(0, s.bulge)) : 0;
      if (g.body) g.body.scale.set(1 + 0.16 * b, 1 + 0.05 * b, 1 + 0.16 * b);
      break;
    }
    case 'toxicMistCloud':
      if (g.body) { g.body.rotation.y += dt * 0.35; g.body.scale.y = 1 + 0.04 * Math.sin(st.t * 1.7); }
      break;
    case 'pointSensor': {
      const m = model.materials.get('inkGlow');
      if (m) m.emissiveIntensity = 1 + 0.8 * (0.5 + 0.5 * Math.sin(st.t * 9));
      break;
    }
    default: break;
  }
}

// Ink part of a torpedo / sensor tip that warns before a burst.
export function warnSubModel(model, k) {
  const m = model?.materials?.get('inkGlow');
  if (m) m.emissiveIntensity = 1.4 + 3 * Math.max(0, Math.min(1, k));
}

// ---- hand-held props ----------------------------------------------------------
// The prop hangs below the grip in the native left-hand prop space (grip at
// the origin, +Y up); deployables are held folded/compact. S3 shows a held
// sub at roughly head size behind the kid's shoulder (S2 Fizzy Bomb promo 1-2,
// S3 Burst Bomb screenshot); the native 0.2 scale left it a ~6 cm dot by the
// ear, so every sub prop (bomb-models too) uses this shared scale.
export const HELD_SCALE = 0.55;
// Offset (thrown-model units) placing each model's top, handle or base at the
// grip. The hold pose presents the prop above the hand (prop -Y up), so the
// standing devices are flipped to rest upright on the palm.
const HELD_ORIGIN = {
  burst: [0, -0.29, 0], autobomb: [0, 0, 0], fizzy: [0, -0.17, 0], torpedo: [0, -0.33, 0],
  inkMine: [0, -0.29, 0], toxicMist: [-0.21, 0.0, 0], angleShooter: [0, -0.22, 0], splashWall: [0, 0, 0],
  sprinkler: [0, 0, 0], beakon: [0, 0, 0], pointSensor: [0, -0.1, 0],
};
const FLIP = [Math.PI, 0, 0];
const HELD_ROT = {
  torpedo: [-Math.PI / 2, 0, 0], angleShooter: [-Math.PI / 2, 0, 0], inkMine: [Math.PI / 2, 0, 0],
  autobomb: FLIP, splashWall: FLIP, sprinkler: FLIP, beakon: FLIP, pointSensor: FLIP,
};

export function buildHeldSubModel(THREE, id, inkMaterial) {
  const model = buildSubModel(THREE, id, inkMaterial, { unfold: 0, armed: false });
  if (!model) return null;
  const holder = new THREE.Group();
  const r = HELD_ROT[id];
  if (r) model.root.rotation.set(...r);
  const o = HELD_ORIGIN[id] || [0, -0.2, 0];
  model.root.position.set(...o);
  holder.add(model.root);
  holder.scale.setScalar(HELD_SCALE);
  holder.userData.s3HeldSubModel = model;
  return { holder, model };
}
