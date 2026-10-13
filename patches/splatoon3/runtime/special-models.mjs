// Models for the thirteen Splatoon 3 specials that the all-specials runtime
// drew as spheres, a cylinder or a flat plane, and for their projectiles
// (presentation only).
//
// Each model is read off several real views (Inkipedia files): the S3 special
// icon, the official model renders ("S3 <Name> Model.png", "S2 <Name>
// Model.png"), the official promo renders ("S3 <Name> Promotional 3D Render",
// "S2 <Name> promo render"), the official turntables ("S3 <Name> model
// rotating.mp4", 8 angles each), the S3 character turntable strips ("S3
// Weapon Special Inkling Zipcaster/Kraken Royale 3D.png") and S3 promo
// screenshots. The list, proportions and remaining differences are recorded in
// patches/splatoon3/reference/special-models.md.
//
// Units are metres, +Y up, +Z forward. Sizes are INKWAVE choices scaled against
// the 1.45 m kid (no model sizes are published). Not a Nintendo mesh.
// Builders register with sub-models.mjs and share its geometry cache,
// finishes and team-ink materials ('ink*' finishes take the owner's colour).

import { MODEL_KIT, registerSubModelBuilder, registerFinish, registerInkFinish } from './sub-models.mjs';

const { kit, rod, tube, latheY, latheZ, box, smooth, orient, TAU } = MODEL_KIT;

registerFinish('lime', 0xc8e81e, { roughness: 0.35, metalness: 0.05 });
registerFinish('pink', 0xf0287a, { roughness: 0.3, metalness: 0.05 });
registerFinish('yellow', 0xf7cc1a, { roughness: 0.35, metalness: 0.08 });
registerFinish('orange', 0xf59a1e, { roughness: 0.35, metalness: 0.05 });
registerFinish('red', 0xd8262e, { roughness: 0.35, metalness: 0.05 });
registerFinish('blue', 0x2f62d8, { roughness: 0.35, metalness: 0.1 });
registerFinish('teal', 0x22b8a8, { roughness: 0.35, metalness: 0.05 });
registerFinish('cream', 0xf2ead2, { roughness: 0.45, metalness: 0 });
registerFinish('mech', 0xa7adb5, { roughness: 0.4, metalness: 0.55 });
registerFinish('clear', 0xeef6ff, { roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false });
registerFinish('glowWhite', 0xfffbe8, { roughness: 1, metalness: 0, emissive: 0xfff3c0 });
registerFinish('hazard', 0xf6f2e6, { roughness: 0.5, metalness: 0 });
registerInkFinish('inkCore', { basic: true, transparent: false, shade: 1 });
registerInkFinish('inkAura', { basic: true, transparent: true, opacity: 0.32, depthWrite: false, double: true });
registerInkFinish('inkSwirl', { basic: true, transparent: true, opacity: 0.55, depthWrite: false, double: true });

export const SPECIAL_MODEL_IDS = Object.freeze([
  'spTentaLauncher', 'spTentaMissile', 'spInkjetPack', 'spInkjetCannon', 'spBooyahBall', 'spUltraStamp',
  'spKillerSpeaker', 'spCrabTank', 'spCrabBall', 'spReefShark', 'spInkstrikeCase', 'spInkstrikeBeacon',
  'spInkstrikeTornado', 'spChumpDecoy', 'spChumpLauncher', 'spKraken', 'spScreenJar', 'spWaveBreaker', 'spWaveRing',
]);

const ring = (THREE, r, t, y, seg = 28) => new THREE.TorusGeometry(r, t, 6, seg).rotateX(Math.PI / 2).translate(0, y, 0);
const cylY = (THREE, r, y0, y1, seg = 16, r1 = r) => new THREE.CylinderGeometry(r1, r, y1 - y0, seg).translate(0, (y0 + y1) / 2, 0);
const cylZ = (THREE, r, z0, z1, seg = 16, r1 = r) => new THREE.CylinderGeometry(r1, r, z1 - z0, seg).rotateX(Math.PI / 2).translate(0, 0, (z0 + z1) / 2);
const cylX = (THREE, r, x0, x1, seg = 16) => new THREE.CylinderGeometry(r, r, x1 - x0, seg).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, 0, 0);
// Rounded-edge box (superellipsoid-ish) by bulging a subdivided box.
function softBox(THREE, w, h, d, round = 0.25, seg = 6) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2), z = p.getZ(i) / (d / 2);
    const k = Math.pow(Math.pow(Math.abs(x), 6) + Math.pow(Math.abs(y), 6) + Math.pow(Math.abs(z), 6), 1 / 6) || 1;
    const blend = 1 - round + round / k;
    p.setXYZ(i, x * blend * w / 2, y * blend * h / 2, z * blend * d / 2);
  }
  g.computeVertexNormals();
  return g;
}
const sphere = (THREE, r, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ws = 18, hs = 12) => new THREE.SphereGeometry(r, ws, hs).scale(sx, sy, sz).translate(x, y, z);

// ---- Tenta Missiles ------------------------------------------------------------
// S2 Model render, S2 promo render, S3 promo image: a 2x2 launch box and a
// single-tube box above it, frames with recessed windows, pink missile tubes
// out of the back with white ribbed caps and an L-shaped grip underneath.
// Frames take the team ink (single-colour S3 icon), tubes stay pink.
function tentaLauncher(THREE) {
  const K = kit();
  const frame = (w, h, d, x, y, z) => {
    K.add('body', 'ink', softBox(THREE, w, h, d, 0.12).translate(x, y, z));
    // Side and top windows show the pink tubes inside (S2 Model render).
    K.add('body', 'pink', box(THREE, w * 1.005, h * 0.5, d * 0.62, x, y, z - d * 0.05), box(THREE, w * 0.6, h * 1.005, d * 0.62, x, y, z - d * 0.05));
  };
  frame(0.32, 0.3, 0.3, 0, 0, 0);
  frame(0.18, 0.16, 0.3, -0.05, 0.25, 0.02);
  const holes = [], tubes = [], caps = [];
  for (const [x, y] of [[-0.075, 0.07], [0.075, 0.07], [-0.075, -0.075], [0.075, -0.075], [-0.05, 0.25]]) {
    holes.push(new THREE.CircleGeometry(0.048, 16).translate(x, y, 0.152 + (y > 0.2 ? 0.02 : 0)));
    tubes.push(cylZ(THREE, 0.045, -0.36 + (y > 0.2 ? 0.02 : 0), -0.14 + (y > 0.2 ? 0.02 : 0), 14).translate(x, y, 0));
    caps.push(cylZ(THREE, 0.05, -0.4, -0.36, 14).translate(x, y, y > 0.2 ? 0.02 : 0));
  }
  K.add('body', 'pink', ...holes, ...tubes);
  K.add('body', 'white', ...caps);
  K.add('body', 'lime', box(THREE, 0.04, 0.12, 0.05, 0, -0.2, 0.04), box(THREE, 0.04, 0.04, 0.1, 0, -0.27, 0.07));
  return K.finish(THREE);
}
// Missile: white body, ink nose cone and fins (the S3 missiles trail team ink).
function tentaMissile(THREE) {
  const K = kit();
  K.add('body', 'white', cylZ(THREE, 0.045, -0.16, 0.08, 14));
  K.add('body', 'ink', latheZ(THREE, [[0.045, 0.08], [0.042, 0.12], [0.028, 0.16], [0, 0.185]], 14),
    ...[0, 1, 2, 3].map(k => box(THREE, 0.005, 0.06, 0.07, 0, 0.065, -0.13).rotateZ(k * Math.PI / 2)));
  K.add('body', 'inkGlow', cylZ(THREE, 0.03, -0.19, -0.16, 12));
  return K.finish(THREE);
}

// ---- Inkjet --------------------------------------------------------------------
// S2 promo render and S3 screenshot: a back pack of two ink tanks, a grey motor
// block with a red guard frame, black hoses and two down-pointing nozzles; the
// hand cannon is a perforated black barrel with a grey canister.
function inkjetPack(THREE) {
  const K = kit();
  for (const s of [-1, 1]) {
    K.add('body', 'ink', cylY(THREE, 0.07, -0.14, 0.16, 18).translate(s * 0.09, 0, 0), sphere(THREE, 0.07, s * 0.09, 0.16, 0, 1, 0.5, 1), sphere(THREE, 0.07, s * 0.09, -0.14, 0, 1, 0.5, 1));
    K.add('body', 'black', cylY(THREE, 0.05, -0.3, -0.18, 14, 0.06).translate(s * 0.09, 0, 0), ring(THREE, 0.072, 0.008, 0.08).translate(s * 0.09, 0, 0));
    K.add('body', 'darkMetal', cylY(THREE, 0.055, -0.33, -0.3, 14).translate(s * 0.09, 0, 0));
  }
  K.add('body', 'mech', box(THREE, 0.12, 0.14, 0.12, 0, 0.06, -0.06));
  K.add('body', 'red', tube(THREE, [[-0.07, -0.02, -0.12], [-0.07, 0.15, -0.12], [0.07, 0.15, -0.12], [0.07, -0.02, -0.12]], 0.008, 16, 6));
  K.add('body', 'black', tube(THREE, [[0.1, -0.12, 0.02], [0.2, -0.2, 0.12], [0.15, -0.05, 0.3]], 0.022, 16, 8), box(THREE, 0.26, 0.04, 0.03, 0, 0.12, 0.08), box(THREE, 0.26, 0.04, 0.03, 0, -0.08, 0.08));
  K.pivot('flame', [0, -0.33, 0]);
  K.add('flame', 'inkGlow', ...[-1, 1].map(s => new THREE.ConeGeometry(0.045, 0.28, 12, 1, true).rotateX(Math.PI).translate(s * 0.09, -0.47, 0)));
  return K.finish(THREE);
}
function inkjetCannon(THREE) {
  const K = kit();
  K.add('body', 'black', cylZ(THREE, 0.05, 0.0, 0.32, 18), cylZ(THREE, 0.056, 0.3, 0.36, 18), cylZ(THREE, 0.04, -0.12, 0.0, 14));
  const holes = [];
  for (let i = 0; i < 4; i++) for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + i * 0.5; holes.push(new THREE.CircleGeometry(0.009, 8).rotateY(a).translate(Math.sin(a) * 0.0505, Math.cos(a) * 0.0505, 0.08 + i * 0.05).applyMatrix4(new THREE.Matrix4())); }
  K.add('body', 'darkMetal', ...holes);
  K.add('body', 'mech', cylY(THREE, 0.045, 0.05, 0.16, 16).translate(0, 0, 0.12), ring(THREE, 0.047, 0.008, 0.16).translate(0, 0, 0.12));
  K.add('body', 'black', box(THREE, 0.04, 0.12, 0.05, 0, -0.08, 0.02));
  return K.finish(THREE);
}

// ---- Booyah Bomb ---------------------------------------------------------------
// S2 promo render and S3 screenshot: a white-hot core in a team-ink glow with
// loose ink ribbons wrapped round it, held overhead.
function booyahBall(THREE) {
  const K = kit();
  K.add('body', 'glowWhite', new THREE.IcosahedronGeometry(0.3, 3));
  K.add('body', 'inkAura', new THREE.IcosahedronGeometry(0.4, 3));
  const ribbons = [];
  for (let k = 0; k < 5; k++) {
    const g = new THREE.TorusGeometry(0.44 + 0.04 * (k % 2), 0.018, 5, 40, Math.PI * (1.2 + 0.15 * k));
    g.rotateX(k * 1.1).rotateY(k * 0.7).rotateZ(k * 0.5);
    ribbons.push(g);
  }
  K.add('ribbons', 'inkSwirl', ...ribbons);
  return K.finish(THREE);
}

// ---- Ultra Stamp ---------------------------------------------------------------
// S2 Model render, S2 promo render, S3 screenshot: three stacked ribbed rubber
// discs in team ink with a relief emblem on the face, a translucent box on a
// blue base on the back, a blue coiled hose and a long yellow handle with a
// bellows boot and a red end cap. Built with the face toward -Y (stamping
// down) and the handle along +Z.
function ultraStamp(THREE) {
  const K = kit();
  const prof = [];
  for (let i = 0; i <= 3; i++) { const y = -0.12 + i * 0.08; prof.push([0.42, y], [0.45, y + 0.02], [0.45, y + 0.05], [0.42, y + 0.07]); }
  K.add('body', 'ink', latheY(THREE, [[0, -0.13], [0.4, -0.13], ...prof, [0.38, 0.2], [0, 0.2]], 40));
  K.add('body', 'inkDark', ...[[0, 0, 0.18, 0.06], [-0.12, 0.1, 0.07, 0.05], [0.13, -0.08, 0.06, 0.05]].map(([x, z, r, h]) => cylY(THREE, r, -0.15, -0.13, 18).translate(x, 0, z)));
  K.add('body', 'blue', softBox(THREE, 0.5, 0.07, 0.44, 0.2).translate(0, 0.235, 0));
  K.add('body', 'clear', softBox(THREE, 0.5, 0.26, 0.44, 0.3).translate(0, 0.39, -0.02));
  K.add('body', 'white', softBox(THREE, 0.46, 0.22, 0.4, 0.3).translate(0, 0.38, -0.02));
  K.add('body', 'blue', tube(THREE, [[0.15, 0.25, 0.12], [0.24, 0.4, 0.06], [0.2, 0.45, -0.1], [0.14, 0.3, -0.16]], 0.02, 24, 8));
  K.add('body', 'red', cylY(THREE, 0.02, 0.24, 0.3, 10).translate(0.12, 0, -0.14));
  const bellows = [];
  for (let i = 0; i < 6; i++) bellows.push(cylZ(THREE, 0.06 - i * 0.004, 0.42 + i * 0.03, 0.44 + i * 0.03, 14));
  // Handle leaves the back edge rising ~25 deg (S2 promo render, S3 screenshot).
  const lift = new THREE.Matrix4().makeTranslation(0, 0.12, 0).multiply(new THREE.Matrix4().makeRotationX(-0.44));
  K.add('body', 'yellow', ...[cylZ(THREE, 0.032, 0.42, 1.25, 14, 0.026), ...bellows, cylZ(THREE, 0.062, 0.38, 0.44, 16)].map(g => g.applyMatrix4(lift)));
  K.add('body', 'darkMetal', cylZ(THREE, 0.034, 0.62, 0.66, 14).applyMatrix4(lift));
  K.add('body', 'red', sphere(THREE, 0.035, 0, 0, 1.27).applyMatrix4(lift), cylZ(THREE, 0.02, 1.22, 1.27, 10).applyMatrix4(lift));
  return K.finish(THREE);
}

// ---- Killer Wail 5.1 -----------------------------------------------------------
// S3 Model render and promo screenshots: a rounded-square ink speaker frame
// with screw tabs, a black cone, a grey dust cap and a chrome magnet behind.
// Faces +Z.
function killerSpeaker(THREE) {
  const K = kit();
  K.add('body', 'ink', softBox(THREE, 0.42, 0.42, 0.07, 0.35).translate(0, 0, -0.01),
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, y]) => cylZ(THREE, 0.04, -0.04, 0.02, 12).translate(x * 0.18, y * 0.18, 0)));
  K.add('body', 'black', new THREE.CircleGeometry(0.175, 32).translate(0, 0, 0.026), ring(THREE, 0.18, 0.02, 0).rotateX(Math.PI / 2).translate(0, 0, 0.035));
  K.add('body', 'grey', ring(THREE, 0.12, 0.012, 0).rotateX(Math.PI / 2).translate(0, 0, 0.03), sphere(THREE, 0.065, 0, 0, 0.03, 1, 1, 0.5));
  K.add('body', 'chrome', cylZ(THREE, 0.1, -0.16, -0.05, 20), cylZ(THREE, 0.06, -0.2, -0.16, 16));
  K.add('body', 'white', box(THREE, 0.08, 0.02, 0.004, 0, 0.015, 0.03));
  return K.finish(THREE);
}

// ---- Crab Tank -----------------------------------------------------------------
// S3 Model render (ink shell, ball form), S3 promo screenshots 00-02: a dome
// shell (yellow with a team-ink cap), hazard-striped skirts, two big front
// claws on grey arms, four grey legs, two black handle posts, a centre cannon,
// crash-test decals. The rider sits on the back.
function crabTank(THREE) {
  const K = kit();
  K.add('body', 'yellow', sphere(THREE, 0.62, 0, 0.55, 0, 1, 0.82, 0.92, 28, 16));
  K.add('body', 'ink', new THREE.SphereGeometry(0.625, 28, 10, 0, TAU, 0, Math.PI * 0.3).scale(1, 0.82, 0.92).translate(0, 0.55, 0));
  K.add('body', 'hazard', new THREE.CylinderGeometry(0.62, 0.66, 0.16, 28, 1, true).translate(0, 0.42, 0));
  const stripes = [];
  for (let k = 0; k < 18; k++) { const a = k * TAU / 18; stripes.push(box(THREE, 0.06, 0.17, 0.01, Math.sin(a) * 0.645, 0.42, Math.cos(a) * 0.645 * 0.98).rotateY(0)); }
  K.add('body', 'ink', ...stripes.map((g, k) => g.rotateY(0)));
  K.add('body', 'black', ...[[1, 1], [-1, 1]].map(([s]) => box(THREE, 0.05, 0.3, 0.05, s * 0.12, 1.12, 0.1)), ...[-1, 1].map(s => sphere(THREE, 0.06, s * 0.3, 0.6, 0.55)));
  K.add('body', 'yellow', ...[-1, 1].map(s => box(THREE, 0.06, 0.08, 0.06, s * 0.12, 1.3, 0.1)));
  K.add('body', 'mech', cylZ(THREE, 0.07, 0.3, 0.7, 16).translate(0, 0.62, 0), cylZ(THREE, 0.09, 0.62, 0.72, 16).translate(0, 0.62, 0));
  // Claws: grey arm + yellow/ink pincer shells.
  for (const s of [-1, 1]) {
    K.add('body', 'mech', rod(THREE, [s * 0.45, 0.55, 0.3], [s * 0.75, 0.55, 0.65], 0.06, 10), sphere(THREE, 0.1, s * 0.45, 0.55, 0.3));
    K.add('body', 'yellow', sphere(THREE, 0.24, s * 0.8, 0.55, 0.85, 1, 0.75, 1.1).translate(0, 0.1, 0));
    K.add('body', 'ink', sphere(THREE, 0.2, s * 0.8, 0.4, 0.95, 1, 0.5, 0.9));
    K.add('body', 'hazard', box(THREE, 0.2, 0.06, 0.12, s * 0.8, 0.32, 1.05));
  }
  // Legs.
  for (const [s, z] of [[-1, -0.25], [1, -0.25], [-1, 0.15], [1, 0.15]]) {
    K.add('body', 'mech', rod(THREE, [s * 0.5, 0.45, z], [s * 0.9, 0.35, z * 1.6], 0.05, 8), rod(THREE, [s * 0.9, 0.35, z * 1.6], [s * 0.95, 0.0, z * 1.8], 0.04, 8));
  }
  K.add('body', 'black', ...[-1, 1].map(s => sphere(THREE, 0.1, s * 0.55, 0.62, 0.0, 0.3, 1, 1)));
  K.add('body', 'white', ...[-1, 1].map(s => new THREE.CircleGeometry(0.07, 16).rotateY(s * Math.PI / 2).translate(s * 0.63, 0.62, 0)));
  return K.finish(THREE);
}
function crabBall(THREE) {
  const K = kit();
  K.add('body', 'yellow', sphere(THREE, 0.75, 0, 0, 0, 1, 1, 1, 32, 20));
  K.add('body', 'ink', new THREE.SphereGeometry(0.755, 32, 8, 0, TAU, 0, Math.PI * 0.28), new THREE.SphereGeometry(0.755, 32, 6, 0, TAU, Math.PI * 0.78, Math.PI * 0.22));
  K.add('body', 'hazard', new THREE.SphereGeometry(0.757, 32, 4, 0, TAU, Math.PI * 0.55, Math.PI * 0.1));
  K.add('body', 'black', ...[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map(a => new THREE.CircleGeometry(0.09, 16).translate(0, 0, 0.76).rotateY(a)), box(THREE, 0.5, 0.03, 0.02, 0, 0.35, 0.67));
  return K.finish(THREE);
}

// ---- Reefslider ----------------------------------------------------------------
// S3 Model render, Promotional 3D Render and model turntable: an inflatable
// team-ink shark with a white belly, dorsal, pectoral and tail fins, a red and
// white eye, a toothy grin, a blue muzzle cage, grey rope reins, an orange
// saddle grip and two rear ink thrusters with knobbed ends. Nose +Z.
function reefShark(THREE) {
  const K = kit();
  const prof = smooth(THREE, [[0, -0.85], [0.1, -0.75], [0.22, -0.5], [0.3, -0.15], [0.32, 0.15], [0.3, 0.4], [0.24, 0.6], [0.14, 0.75], [0, 0.82]], 30);
  const body = latheZ(THREE, prof, 28).scale(1, 0.9, 1);
  K.add('body', 'inkGloss', body.clone().translate(0, 0.42, 0));
  K.add('body', 'white', new THREE.SphereGeometry(0.31, 24, 10, 0, TAU, Math.PI * 0.62, Math.PI * 0.38).scale(1.02, 0.82, 2.4).translate(0, 0.42, 0.05));
  const fin = (pts, depth) => new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b))), { depth, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 });
  K.add('body', 'inkGloss', fin([[0, 0], [0.32, 0], [0.12, 0.3], [-0.02, 0.26]], 0.05).rotateY(-Math.PI / 2).translate(0.025, 0.66, -0.15),
    fin([[0, 0], [0.3, 0.05], [0.18, 0.35]], 0.04).rotateY(-Math.PI / 2).rotateZ(0).translate(0.02, 0.42, -0.95).rotateX(0.2),
    fin([[0, 0], [0.26, 0.02], [0.12, -0.28]], 0.04).rotateY(-Math.PI / 2).translate(0.02, 0.42, -0.95));
  for (const s of [-1, 1]) K.add('body', 'inkGloss', fin([[0, 0], [0.3, 0.02], [0.5, -0.18], [0.1, -0.08]], 0.05).rotateX(Math.PI / 2).rotateY(s > 0 ? 0 : Math.PI).translate(s * 0.22, 0.3, 0.1));
  for (const s of [-1, 1]) {
    K.add('body', 'white', new THREE.CircleGeometry(0.075, 18).rotateY(s * Math.PI / 2 * 0.8).translate(s * 0.23, 0.55, 0.52));
    K.add('body', 'red', new THREE.CircleGeometry(0.05, 16).rotateY(s * Math.PI / 2 * 0.8).translate(s * 0.235, 0.55, 0.525));
    K.add('body', 'black', new THREE.CircleGeometry(0.02, 10).rotateY(s * Math.PI / 2 * 0.8).translate(s * 0.24, 0.55, 0.53));
  }
  const teeth = [];
  for (let k = -5; k <= 5; k++) { const a = k * 0.14; teeth.push(new THREE.ConeGeometry(0.018, 0.04, 4).rotateX(Math.PI).translate(Math.sin(a) * 0.22, 0.36, 0.55 + Math.cos(a) * 0.08)); }
  K.add('body', 'white', ...teeth);
  K.add('body', 'black', tube(THREE, Array.from({ length: 9 }, (_, i) => { const a = (i - 4) * 0.16; return [Math.sin(a) * 0.235, 0.38, 0.55 + Math.cos(a) * 0.085]; }), 0.012, 20, 5));
  // Muzzle cage.
  const cage = [];
  for (let k = 0; k < 4; k++) cage.push(ring(THREE, 0.2 - k * 0.035, 0.014, 0).rotateX(Math.PI / 2).scale(1, 0.8, 1).translate(0, 0.44, 0.58 + k * 0.07));
  for (let k = 0; k < 6; k++) { const a = k * TAU / 6; cage.push(rod(THREE, [Math.sin(a) * 0.2, 0.44 + Math.cos(a) * 0.16, 0.58], [Math.sin(a) * 0.08, 0.44 + Math.cos(a) * 0.06, 0.82], 0.012, 6)); }
  K.add('body', 'blue', ...cage);
  K.add('body', 'grey', tube(THREE, [[0.2, 0.52, 0.6], [0.24, 0.72, 0.3], [0.1, 0.78, 0.02]], 0.01, 16, 5), tube(THREE, [[-0.2, 0.52, 0.6], [-0.24, 0.72, 0.3], [-0.1, 0.78, 0.02]], 0.01, 16, 5));
  K.add('body', 'orange', softBox(THREE, 0.24, 0.06, 0.16, 0.3).translate(0, 0.76, -0.05));
  K.add('body', 'teal', ring(THREE, 0.31, 0.012, 0).rotateX(Math.PI / 2).scale(1, 0.9, 1).translate(0, 0.42, -0.2));
  for (const s of [-1, 1]) {
    K.add('body', 'ink', cylZ(THREE, 0.06, -0.85, -0.6, 14).translate(s * 0.14, 0.55, 0), sphere(THREE, 0.07, s * 0.14, 0.55, -0.88));
    K.add('body', 'inkDark', ...[0, 1, 2, 3, 4].map(k => { const a = k * TAU / 5; return sphere(THREE, 0.02, s * 0.14 + Math.sin(a) * 0.05, 0.55 + Math.cos(a) * 0.05, -0.93); }));
  }
  return K.finish(THREE);
}

// ---- Triple Inkstrike ----------------------------------------------------------
// S3 Promotional 3D Render, model turntable, promo image: a team-ink case with
// a grey lid hinged open, a red latch and missile slots; the thrown marker is
// a round beacon (ink base, red dome with an eye); the strike is a twisting
// ink column.
function inkstrikeCase(THREE) {
  const K = kit();
  K.add('body', 'ink', softBox(THREE, 0.42, 0.2, 0.3, 0.12).translate(0, 0.1, 0), box(THREE, 0.46, 0.03, 0.34, 0, 0.015, 0));
  K.add('body', 'inkDark', ...[0, 1, 2, 3].map(k => box(THREE, 0.06, 0.01, 0.22, -0.13 + k * 0.085, 0.205, 0)));
  K.add('body', 'red', box(THREE, 0.1, 0.07, 0.02, 0.12, 0.13, 0.155));
  K.pivot('lid', [0, 0.2, -0.15]);
  // Lid swung open about the back hinge (Promotional 3D Render).
  const hinge = new THREE.Matrix4().makeTranslation(0, 0.2, -0.15).multiply(new THREE.Matrix4().makeRotationX(-1.15)).multiply(new THREE.Matrix4().makeTranslation(0, -0.2, 0.15));
  K.add('lid', 'grey', softBox(THREE, 0.43, 0.025, 0.31, 0.1).translate(0, 0.21, 0.005).applyMatrix4(hinge));
  return K.finish(THREE);
}
function inkstrikeBeacon(THREE) {
  const K = kit();
  K.add('body', 'ink', latheY(THREE, [[0, 0], [0.16, 0], [0.17, 0.04], [0.15, 0.07], [0, 0.07]], 24));
  K.add('body', 'red', new THREE.SphereGeometry(0.14, 22, 10, 0, TAU, 0, Math.PI / 2).translate(0, 0.07, 0));
  K.add('body', 'cream', new THREE.CircleGeometry(0.05, 16).rotateX(-0.6).translate(0, 0.15, 0.09));
  K.add('body', 'black', new THREE.CircleGeometry(0.022, 12).rotateX(-0.6).translate(0, 0.152, 0.092));
  return K.finish(THREE);
}
function inkstrikeTornado(THREE) {
  const K = kit();
  // Unit column (radius ~1, height 1) of twisted ink sheets; scaled by caller.
  const sheets = [];
  for (let k = 0; k < 3; k++) {
    const pos = [], idx = [], N = 40;
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = t * TAU * 1.6 + k * TAU / 3, r = 0.55 + 0.45 * t;
      for (const s of [0, 1]) { const rr = r * (0.55 + 0.45 * s); pos.push(Math.cos(a) * rr, t, Math.sin(a) * rr); }
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    sheets.push(g);
  }
  K.add('body', 'inkSwirl', ...sheets);
  K.add('body', 'inkAura', new THREE.CylinderGeometry(0.75, 0.45, 1, 20, 1, true).translate(0, 0.5, 0));
  return K.finish(THREE);
}

// ---- Super Chump ---------------------------------------------------------------
// S3 Model render, Promotional 3D Render, model turntable: an ink balloon with
// coloured confetti dots, a white band and a cute face, drips at the neck, a
// pink tie, a valve with a blue knob and a white suction-cup base. The
// launcher is a clear globe on an ink yoke under an orange multi-barrel cap,
// on a spring and a black base.
function chumpDecoy(THREE) {
  const K = kit();
  K.add('body', 'inkGloss', sphere(THREE, 0.42, 0, 0.78, 0, 1, 0.92, 1, 28, 18));
  K.add('body', 'inkGloss', latheY(THREE, [[0.04, 0.3], [0.08, 0.36], [0.2, 0.42], [0.3, 0.5]], 20));
  K.add('body', 'white', ring(THREE, 0.425, 0.02, 0.86).scale(1, 1, 1), box(THREE, 0.1, 0.03, 0.02, 0.42, 0.86, 0.06));
  const dots = [], cols = ['pink', 'yellow', 'teal', 'orange'];
  for (let k = 0; k < 28; k++) {
    const j = Math.sin(k * 12.9898) * 43758.5453, n = j - Math.floor(j), a = k * 2.399963, el = 0.3 + 1.1 * n;
    const lat = -0.35 + 1.15 * n, nrm = new THREE.Vector3(Math.cos(lat) * Math.sin(a), Math.sin(lat), Math.cos(lat) * Math.cos(a));
    const g = new THREE.CircleGeometry(0.03, 10).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm));
    dots.push([cols[k % 4], g.translate(nrm.x * 0.423, 0.78 + nrm.y * 0.423 * 0.92, nrm.z * 0.423)]);
  }
  for (const c of cols) K.add('body', c, ...dots.filter(d => d[0] === c).map(d => d[1]));
  K.add('body', 'inkDark', new THREE.TorusGeometry(0.05, 0.012, 6, 20).translate(-0.12, 0.8, 0.4), new THREE.TorusGeometry(0.05, 0.012, 6, 20).translate(0.12, 0.8, 0.4),
    tube(THREE, [[-0.06, 0.7, 0.41], [-0.03, 0.66, 0.415], [0, 0.69, 0.42], [0.03, 0.66, 0.415], [0.06, 0.7, 0.41]], 0.01, 16, 5));
  K.add('body', 'pink', cylY(THREE, 0.045, 0.28, 0.31, 12));
  K.add('body', 'grey', cylY(THREE, 0.03, 0.16, 0.28, 12));
  K.add('body', 'blue', cylX(THREE, 0.025, 0.03, 0.12, 12).translate(0, 0.22, 0));
  K.add('body', 'white', latheY(THREE, [[0, 0], [0.2, 0], [0.18, 0.04], [0.06, 0.13], [0.03, 0.16], [0, 0.16]], 24));
  return K.finish(THREE);
}
function chumpLauncher(THREE) {
  const K = kit();
  K.add('body', 'black', latheY(THREE, [[0, 0], [0.13, 0], [0.13, 0.03], [0, 0.03]], 20));
  const helix = [];
  for (let i = 0; i <= 30; i++) { const a = i / 30 * 4 * TAU; helix.push([Math.cos(a) * 0.04, 0.04 + i / 30 * 0.1, Math.sin(a) * 0.04]); }
  K.add('body', 'steel', tube(THREE, helix, 0.007, 60, 5));
  K.add('body', 'ink', box(THREE, 0.2, 0.04, 0.06, 0, 0.16, 0), box(THREE, 0.04, 0.24, 0.06, 0.12, 0.28, 0), box(THREE, 0.04, 0.24, 0.06, -0.12, 0.28, 0));
  K.add('body', 'clear', sphere(THREE, 0.11, 0, 0.32, 0));
  K.add('body', 'grey', cylY(THREE, 0.04, 0.24, 0.4, 12));
  K.add('body', 'black', cylY(THREE, 0.1, 0.4, 0.45, 18));
  K.add('body', 'orange', cylY(THREE, 0.12, 0.45, 0.48, 24));
  K.add('body', 'blue', ...[0, 1, 2, 3, 4, 5].map(k => { const a = k * TAU / 6; return cylY(THREE, 0.02, 0.46, 0.485, 8).translate(Math.sin(a) * 0.07, 0, Math.cos(a) * 0.07); }));
  return K.finish(THREE);
}

// ---- Kraken Royale -------------------------------------------------------------
// S3 Model render, model turntable (8 angles) and the S3 character turntable
// strip (two figures per 280 px cell). Measured on the front figure (255 px =
// 2.6 m): an arrowhead mantle 0.53 of the height across at the fin tips,
// 1.27 m up, sides nearly straight, two shallow bands, flat front-to-back
// (side view ~0.35 of its width); its underside slants into a narrow head
// (0.72 m) with angry eyes at 1.07 m; a fringe of short tentacles down to
// 0.7 m; two thick arms hanging to big teardrop pads (0.4 m wide, the bottom
// quarter) that are white with a sucker ring behind.
function kraken(THREE) {
  const K = kit();
  // Mantle widths measured at quarter heights from the tip: 0.26, 0.46 and
  // 0.70 of the fin span (nearly straight, slight flare at the fins).
  const prof = smooth(THREE, [[0, 0.85], [0.22, 0.87], [0.32, 0.93], [0.36, 1.02], [0.37, 1.1], [0.45, 1.15], [0.6, 1.19], [0.69, 1.24],
    [0.66, 1.3], [0.6, 1.39], [0.48, 1.595], [0.32, 1.93], [0.19, 2.25], [0.1, 2.46], [0.04, 2.56], [0, 2.585]], 36);
  const body = latheY(THREE, prof, 36), p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {   // round head, flat mantle
    const y = p.getY(i), k = Math.min(1, Math.max(0, (y - 1.1) / 0.16));
    p.setZ(i, p.getZ(i) * (0.65 + (0.36 - 0.65) * k) - 0.02 * k);
  }
  body.computeVertexNormals();
  K.add('body', 'inkGloss', body);
  // Eyes under the mantle's overhang: dark sockets, white sclera, black pupils, angry brows.
  for (const s of [-1, 1]) {
    K.add('body', 'inkDark', sphere(THREE, 0.12, s * 0.15, 1.08, 0.19, 1.3, 0.75, 0.4));
    K.add('body', 'cream', sphere(THREE, 0.1, s * 0.15, 1.07, 0.215, 1.3, 0.55, 0.35));
    K.add('body', 'black', sphere(THREE, 0.035, s * 0.12, 1.065, 0.245, 1, 1, 0.5));
    K.add('body', 'inkDark', box(THREE, 0.17, 0.04, 0.05, 0, 0, 0).rotateZ(s * -0.32).translate(s * 0.14, 1.145, 0.215));
  }
  // Fringe of short tentacles under the eyes.
  const fringe = [];
  for (let k = 0; k < 7; k++) {
    const u = (k - 3) / 3, x = u * 0.3, z = 0.2 - Math.abs(u) * 0.14;
    fringe.push(tube(THREE, [[x, 0.96, z * 0.9], [x * 1.08, 0.82, z + 0.03], [x * 1.14, 0.66 + Math.abs(u) * 0.06, z]], 0.055 - Math.abs(u) * 0.012, 10, 8));
  }
  K.add('body', 'inkGloss', ...fringe);
  // Two thick arms with teardrop pads (animated about the arm root).
  for (const [name, s] of [['legL', 1], ['legR', -1]]) {
    K.pivot(name, [s * 0.17, 0.9, 0]);
    K.add(name, 'inkGloss', tube(THREE, [[s * 0.17, 0.92, 0], [s * 0.21, 0.78, 0.02], [s * 0.25, 0.6, 0.0]], 0.085, 16, 12));
    const pad = latheY(THREE, smooth(THREE, [[0, 0.0], [0.07, 0.06], [0.17, 0.2], [0.2, 0.33], [0.15, 0.48], [0.095, 0.6], [0.08, 0.66]], 12), 16);
    K.add(name, 'inkGloss', pad.clone().scale(1, 1, 0.36).translate(s * 0.25, 0, 0));
    K.add(name, 'white', pad.clone().scale(0.96, 0.96, 0.34).translate(s * 0.25, 0.01, -0.013),
      new THREE.TorusGeometry(0.065, 0.015, 6, 18).translate(s * 0.25, 0.26, -0.07));
  }
  return K.finish(THREE);
}

// ---- Splattercolor Screen ------------------------------------------------------
// S3 Promotional 3D Render and model turntable: the device is a clear jar of
// swirled ink with a black lid, red buttons, an ink nozzle cap and a side
// strap; the screen is a bow-tie sheet of marbled ink (built at run time, it
// needs its own texture).
function screenJar(THREE) {
  const K = kit();
  K.add('body', 'clear', cylY(THREE, 0.1, 0, 0.22, 24));
  K.add('body', 'inkGlass', cylY(THREE, 0.088, 0.01, 0.2, 20));
  K.add('body', 'white', cylY(THREE, 0.102, 0.12, 0.16, 24, 0.102));
  K.add('body', 'black', softBox(THREE, 0.26, 0.06, 0.22, 0.25).translate(0, 0.25, 0));
  K.add('body', 'red', box(THREE, 0.05, 0.02, 0.06, 0.08, 0.29, 0), box(THREE, 0.05, 0.02, 0.06, -0.08, 0.29, 0));
  K.add('body', 'ink', latheY(THREE, [[0.05, 0.28], [0.04, 0.33], [0.025, 0.36], [0, 0.36]], 16), box(THREE, 0.04, 0.2, 0.08, 0.13, 0.12, 0));
  return K.finish(THREE);
}

// ---- Wave Breaker --------------------------------------------------------------
// S3 Promotional 3D Render, model turntable, promo image: a glittery ink dome on
// a chrome ring, a yellow lattice basket round a chrome core with a blue knob,
// an ink collar, an ink cone tapering to a chrome tip, held by an L-shaped
// chrome stand on a ring foot. The waves are ink bands running out on the floor.
function waveBreaker(THREE) {
  const K = kit();
  K.add('body', 'steel', ring(THREE, 0.13, 0.012, 0.012), rod(THREE, [0.13, 0.012, 0], [0.13, 0.45, 0], 0.012, 8), rod(THREE, [0.13, 0.45, 0], [0.08, 0.45, 0], 0.012, 8));
  K.add('body', 'ink', latheY(THREE, [[0, 0.12], [0.05, 0.16], [0.13, 0.38], [0.15, 0.45], [0, 0.45]], 24));
  K.add('body', 'chrome', latheY(THREE, [[0, 0.06], [0.025, 0.08], [0.05, 0.14], [0, 0.14]], 16), cylY(THREE, 0.15, 0.45, 0.47, 24));
  K.add('body', 'ink', cylY(THREE, 0.155, 0.47, 0.5, 24));
  K.add('body', 'chrome', cylY(THREE, 0.12, 0.5, 0.78, 20));
  const basket = [];
  for (let k = 0; k < 12; k++) { const a = k * TAU / 12; basket.push(rod(THREE, [Math.sin(a) * 0.15, 0.5, Math.cos(a) * 0.15], [Math.sin(a) * 0.22, 0.8, Math.cos(a) * 0.22], 0.012, 5)); }
  for (const [y, r] of [[0.52, 0.155], [0.6, 0.175], [0.68, 0.195], [0.76, 0.21], [0.8, 0.22]]) basket.push(ring(THREE, r, 0.012, y, 24));
  K.add('body', 'yellow', ...basket);
  K.add('body', 'blue', box(THREE, 0.05, 0.05, 0.05, 0.14, 0.6, 0.0));
  K.add('body', 'chrome', cylY(THREE, 0.2, 0.8, 0.84, 24));
  K.add('body', 'inkGlass', new THREE.SphereGeometry(0.19, 24, 12, 0, TAU, 0, Math.PI / 2).scale(1, 0.85, 1).translate(0, 0.84, 0));
  K.add('body', 'white', ...Array.from({ length: 16 }, (_, k) => { const a = k * 2.4, el = 0.2 + (k % 5) * 0.25; return new THREE.SphereGeometry(0.008, 6, 4).translate(Math.cos(a) * Math.sin(el) * 0.17, 0.84 + Math.cos(el) * 0.15, Math.sin(a) * Math.sin(el) * 0.17); }));
  return K.finish(THREE);
}
// Unit wave band (radius 1); the caller scales x/z to the wave radius.
function waveRing(THREE) {
  const K = kit();
  K.add('body', 'inkGlow', new THREE.CylinderGeometry(1, 1, 0.22, 64, 1, true).translate(0, 0.11, 0));
  K.add('body', 'inkAura', new THREE.CylinderGeometry(1.0, 1.0, 0.5, 64, 1, true).translate(0, 0.25, 0));
  return K.finish(THREE);
}

const BUILDERS = {
  spTentaLauncher: tentaLauncher, spTentaMissile: tentaMissile, spInkjetPack: inkjetPack, spInkjetCannon: inkjetCannon,
  spBooyahBall: booyahBall, spUltraStamp: ultraStamp, spKillerSpeaker: killerSpeaker, spCrabTank: crabTank, spCrabBall: crabBall,
  spReefShark: reefShark, spInkstrikeCase: inkstrikeCase, spInkstrikeBeacon: inkstrikeBeacon, spInkstrikeTornado: inkstrikeTornado,
  spChumpDecoy: chumpDecoy, spChumpLauncher: chumpLauncher, spKraken: kraken, spScreenJar: screenJar, spWaveBreaker: waveBreaker,
  spWaveRing: waveRing,
};
for (const [id, build] of Object.entries(BUILDERS)) registerSubModelBuilder(id, build);

// ---- Splattercolor sheet (own texture) -----------------------------------------
// Bow-tie outline (concave top and bottom edges, rounded corners) filled with
// a procedural marble of team ink, lighter ink and white swirls.
export function buildScreenSheet(THREE, color, width, height) {
  const W = width / 2, H = height / 2, sag = height * 0.16, r = Math.min(W, H) * 0.12;
  const shp = new THREE.Shape();
  shp.moveTo(-W + r, -H);
  shp.quadraticCurveTo(0, -H + sag * 2, W - r, -H);
  shp.quadraticCurveTo(W, -H, W, -H + r);
  shp.lineTo(W, H - r);
  shp.quadraticCurveTo(W, H, W - r, H);
  shp.quadraticCurveTo(0, H - sag * 2, -W + r, H);
  shp.quadraticCurveTo(-W, H, -W, H - r);
  shp.lineTo(-W, -H + r);
  shp.quadraticCurveTo(-W, -H, -W + r, -H);
  const geo = new THREE.ShapeGeometry(shp, 16);
  const uv = geo.attributes.uv, p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + W) / (2 * W), (p.getY(i) + H) / (2 * H));
  const N = 128, data = new Uint8Array(N * N * 4), c = new THREE.Color(color), light = c.clone().lerp(new THREE.Color(0xffffff), 0.45);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const w = Math.sin(u * 9 + Math.sin(v * 7 + u * 3) * 2.2) + Math.sin(v * 11 - u * 5 + Math.sin(u * 13) * 1.5) * 0.7;
    const k = (x + y * N) * 4, white = w > 1.15, mid = Math.abs(w) < 0.25;
    const col = white ? new THREE.Color(1, 1, 1) : mid ? light : c;
    data[k] = col.r * 255; data[k + 1] = col.g * 255; data[k + 2] = col.b * 255; data[k + 3] = white ? 200 : 170;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  const edge = new THREE.Mesh(new THREE.ShapeGeometry(shp, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  edge.scale.set(1.01, 1.01, 1); edge.position.z = -0.01;
  const group = new THREE.Group(); group.add(edge, mesh); group.userData.s3ScreenSheet = { mat, tex };
  return group;
}
