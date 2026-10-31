// Practice Range — set dressing (PropKit placements, never mirrored). Everything here is static dressing merged into the
// PropKit's per-material meshes: flood masts, perimeter rails, a few benches and planters for the hub. The interactive
// pieces (action pads, dummies, signage boards) are the session's own meshes (runtime/), not props.
//
// Rules: nothing stands on a test floor (C paint floor, lane, gallery, rings), props sit on frames / the hub edges only.
import { X, Z, NORTH_FACE_Z } from './zones.mjs';

const P = Math.PI;
const ALONG_Z = -P / 2;                 // rotY that turns a prop's local +X onto world +Z

export function register(D, H) {
  // Architectural dressing is deliberately visual only: the existing range slabs and rails remain the
  // authoritative collision and paint geometry. The high roof leaves the firing lanes unobstructed.
  D.range_hall = {
    desc: 'Practice Range: industrial training hall shell, roof beams and suspended strip lights.',
    params: {}, variants: 1, mount: 'ground',
    build(B) {
      const concrete = '#c5c8be', dark = '#35454b', steel = '#697b7e', light = '#fff4d9';
      // Walls start at the parapet top. Repeated posts and recessed dark bands give
      // the space the layered, warehouse-like silhouette of an indoor training facility.
      for (const x of [-37.15, 34.15]) {
        B.box('paint~ns', concrete, 0.3, 10.8, 72, x, 6.6, 15);
        B.box('paint~ns', dark, 0.34, 1.15, 72, x, 10.3, 15);
        B.box('paint~ns', '#e3a847', 0.36, 0.26, 72, x, 3.15, 15);
        for (let z = -18; z <= 48; z += 6) {
          B.box('metal~ns', steel, 0.48, 10.7, 0.42, x, 6.65, z);
          B.box('paint~ns', '#e9e3cf', 0.38, 0.14, 4.8, x, 5.1, z + 2.5);
        }
      }
      B.box('paint~ns', concrete, 71.6, 10.8, 0.3, -1.5, 6.6, 51.15);
      B.box('paint~ns', dark, 71.6, 1.15, 0.34, -1.5, 10.3, 51.15);
      B.box('paint~ns', '#e3a847', 71.6, 0.26, 0.36, -1.5, 3.15, 51.15);
      for (let x = -34; x <= 32; x += 6) B.box('metal~ns', steel, 0.42, 10.7, 0.48, x, 6.65, 51.15);
      // A dark ceiling, repeated beams and warm light strips frame the view downrange.
      // Keep the existing outdoor lighting readable under the visual ceiling.
      B.box('paint~ns', '#87928f', 71.6, 0.35, 72.4, -1.5, 12.15, 15);
      for (let z = -18; z <= 48; z += 6) {
        B.box('metal~ns', dark, 71.2, 0.42, 0.34, -1.5, 11.82, z);
        for (const x of [-25, -4, 18]) {
          B.box('metal', dark, 7.4, 0.13, 0.55, x, 11.39, z + 2.5);
          B.box('glow', light, 6.8, 0.05, 0.32, x, 11.29, z + 2.5, { glow: 1.4 });
        }
      }
    },
  };
  // ---- a steel truss gantry spanning a zone entrance (pos = left foot, runs along local +X for `length`)
  D.range_gantry = {
    desc: 'Practice Range: painted steel box-truss gantry on two square legs (along +X), zone colour band on the beam.',
    params: { length: 'm (6)', height: 'm (4.2)', color: 'band colour' }, variants: 1, mount: 'ground',
    build(B, o) {
      const L = o.length ?? 6, Ht = o.height ?? 4.2, band = o.color ?? '#3f6f9a', steel = '#d9dde2', dark = '#3b4456';
      for (const x of [0, L]) {
        B.box('metal', steel, 0.32, Ht, 0.32, x, Ht / 2, 0, { r: 0.03 });
        B.box('paint', dark, 0.5, 0.12, 0.5, x, 0.06, 0, { r: 0.02 });
      }
      // box truss: two chords + diagonal lacing on each face
      for (const y of [Ht - 0.05, Ht - 0.75]) for (const z of [-0.2, 0.2]) B.box('metal', steel, L, 0.08, 0.08, L / 2, y, z, { r: 0.012 });
      const n = Math.max(2, Math.round(L / 0.8));
      for (let i = 0; i < n; i++) {
        const x0 = (i / n) * L, x1 = ((i + 1) / n) * L, len = Math.hypot(x1 - x0, 0.7), a = Math.atan2(0.7, x1 - x0) * (i % 2 ? 1 : -1);
        for (const z of [-0.2, 0.2]) B.box('metal', steel, len, 0.045, 0.045, (x0 + x1) / 2, Ht - 0.4, z, { rz: a, r: 0.008 });
      }
      B.box('paint', band, L - 0.4, 0.42, 0.06, L / 2, Ht - 0.4, 0.27, { r: 0.02 });
      B.box('paint', band, L - 0.4, 0.42, 0.06, L / 2, Ht - 0.4, -0.27, { r: 0.02 });
      B.col(-0.16, 0, -0.16, 0.16, Ht, 0.16); B.col(L - 0.16, 0, -0.16, L + 0.16, Ht, 0.16);
    },
  };
}

const rails = [];
const railRun = (x, y, z0, z1, rotY) => { for (let z = z0; z < z1 - 0.5; z += 12) rails.push({ type: 'railing', pos: [x, y, rotY === ALONG_Z ? z : z1 - (z - z0)], rotY, length: Math.min(12, z1 - z), height: 1.0, color: 'railing', mirror: false }); };
railRun(X.west + 0.3, 1.2, Z.south + 0.6, NORTH_FACE_Z, ALONG_Z);
railRun(X.east - 0.3, 1.2, Z.south + 0.6, NORTH_FACE_Z, ALONG_Z);
for (const [x0, x1] of [[X.west + 0.6, X.f1[1]], [X.f2[0], X.east - 0.6]]) {
  for (let x = x0; x < x1 - 0.5; x += 12) rails.push({ type: 'railing', pos: [x, 1.2, Z.south + 0.3], rotY: 0, length: Math.min(12, x1 - x), height: 1.0, color: 'railing', mirror: false });
}

export const PLACEMENTS = [
  { type: 'range_hall', pos: [0, 0, 0], mirror: false },
  ...rails,
  // flood masts frame the firing line and the far corners (heads face the zones they light)
  { type: 'lightpole', pos: [-16.5, 0, -14.2], rotY: P * 0.75, height: 9, variant: 0, mirror: false },
  { type: 'lightpole', pos: [12.5, 0, -16.5], rotY: -P * 0.75, height: 9, variant: 0, mirror: false },
  // the firing-line gantry spans both lanes (its signs are SIGNS boards hanging under the beam)
  { type: 'range_gantry', pos: [-16.5, 0, -0.62], rotY: 0, length: 29, height: 5.2, color: '#e5b94d', mirror: false },
  { type: 'lightpole', pos: [-16.5, 0, 33.5], rotY: P * 0.5, height: 9, variant: 1, mirror: false },
  { type: 'lightpole', pos: [12.5, 0, 21.5], rotY: -P * 0.5, height: 9, variant: 1, mirror: false },
  // entrance gantries (zone colour bands; the signs on them are session signage)
  { type: 'range_gantry', pos: [-16.5, 0, -9.5], rotY: ALONG_Z, length: 5, height: 4.0, color: '#2c7f91', mirror: false },
  { type: 'range_gantry', pos: [12.5, 0, -14], rotY: ALONG_Z, length: 6, height: 4.0, color: '#2f8f86', mirror: false },
  // hub furniture against the lab building
  { type: 'bench', pos: [-12.5, 0, -19.2], rotY: 0, variant: 0, mirror: false },
  { type: 'bench', pos: [9.0, 0, -19.2], rotY: 0, variant: 0, mirror: false },
  { type: 'planter', pos: [-14.6, 0, -19.0], variant: 2, mirror: false },
  { type: 'planter', pos: [11.0, 0, -19.0], variant: 2, mirror: false },
];
