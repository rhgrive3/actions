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
// Kraken irises read brighter than the glossy ink body in the S3 render.
registerInkFinish('inkIris', { roughness: 0.15, metalness: 0, emissive: 0.9 });

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
// S3 Model render, S2 promo render, S3 promo image: a 2x2 launch crate and a
// single-tube crate below it, aligned to one side. Each crate is an open cage:
// a bevelled front plate with round launch holes (raised rings), proud rims at
// both ends, rounded corner posts and side/top/bottom panels with windows in
// the rear half. Long missile tubes run out of the back through a square plate
// with side gussets and end in white ribbed caps. A pistol grip with a red
// trigger sits under the small crate. White script and dark print decals.
// Colours: the crates stay a translucent lime-yellow and the tubes take the
// team ink (lime crates with pink tubes in the S2/S3 renders, yellow crates
// with teal tubes for a teal-ink player in the S3 promo image).
registerFinish('tentaFrame', 0xd2ea1e, { roughness: 0.16, metalness: 0.05, transparent: true, opacity: 0.86 });
registerFinish('tentaPrint', 0x2c2c34, { roughness: 0.6, metalness: 0 });
// Rounded rectangle centred on the origin, optional holes ({ r } circles or { w, h } rectangles).
function tmShape(THREE, w, h, rad, holes = []) {
  const s = new THREE.Shape(), W = w / 2, H = h / 2, r = Math.min(rad, W, H);
  s.moveTo(-W + r, -H); s.lineTo(W - r, -H); s.quadraticCurveTo(W, -H, W, -H + r); s.lineTo(W, H - r);
  s.quadraticCurveTo(W, H, W - r, H); s.lineTo(-W + r, H); s.quadraticCurveTo(-W, H, -W, H - r); s.lineTo(-W, -H + r);
  s.quadraticCurveTo(-W, -H, -W + r, -H);
  for (const o of holes) {
    const p = new THREE.Path();
    if (o.r) p.absarc(o.x, o.y, o.r, 0, TAU, true);
    else { const a = o.w / 2, b = o.h / 2; p.moveTo(o.x - a, o.y - b); p.lineTo(o.x - a, o.y + b); p.lineTo(o.x + a, o.y + b); p.lineTo(o.x + a, o.y - b); p.lineTo(o.x - a, o.y - b); }
    s.holes.push(p);
  }
  return s;
}
// Extruded plate, centred on its thickness, in the XY plane.
function tmPlate(THREE, shape, depth, bevel = 0) {
  return new THREE.ExtrudeGeometry(shape, { depth, curveSegments: 7, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1 }).translate(0, 0, -depth / 2);
}
// Place a plate built in XY (thickness along +Z) onto axes u, v, n (n = u x v) at p.
function tmPlace(THREE, g, u, v, p) {
  const U = new THREE.Vector3(...u), V = new THREE.Vector3(...v), N = U.clone().cross(V);
  return g.applyMatrix4(new THREE.Matrix4().makeBasis(U, V, N)).translate(...p);
}
// One crate: W x H cross-section, L long, centred at c, launch holes at hs.
function tmCrate(THREE, K, W, H, L, c, hs, rh, tail) {
  const [cx, cy, cz] = c, F = 'tentaFrame', zf = cz + L / 2, zb = cz - L / 2, rim = 0.034, bev = 0.006;
  // Front plate with the launch holes and a raised ring round each hole.
  K.add('body', F, tmPlate(THREE, tmShape(THREE, W - 2 * bev, H - 2 * bev, 0.018, hs.map(([x, y]) => ({ x, y, r: rh + bev }))), rim - 2 * bev, bev).translate(cx, cy, zf - rim / 2));
  K.add('body', F, ...hs.map(([x, y]) => new THREE.TorusGeometry(rh + 0.011, 0.0055, 5, 18).translate(cx + x, cy + y, zf + 0.001)));
  // Back rim (open square ring) and the corner posts.
  K.add('body', F, tmPlate(THREE, tmShape(THREE, W - 2 * bev, H - 2 * bev, 0.018, [{ x: 0, y: 0, w: W - 0.06, h: H - 0.06 }]), rim - 2 * bev, bev).translate(cx, cy, zb + rim / 2));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) K.add('body', F, cylZ(THREE, 0.014, zb + 0.01, zf - 0.01, 8).translate(cx + sx * (W / 2 - 0.016), cy + sy * (H / 2 - 0.016), 0));
  // Four panels between the rims, each with a window in the rear half.
  const faces = [[[1, 0, 0], [0, 0, -1], [0, 1, 0], W, H], [[1, 0, 0], [0, 0, 1], [0, -1, 0], W, H], [[0, 1, 0], [0, 0, 1], [1, 0, 0], H, W], [[0, 1, 0], [0, 0, -1], [-1, 0, 0], H, W]];
  const pl = L - 2 * rim + 0.004, t = 0.012;
  for (const [u, v, n, fw, fd] of faces) {
    const vz = v[2], win = { x: 0, y: -0.17 * L * vz, w: fw * 0.42, h: L * 0.32 };
    const off = fd / 2 - 0.009 - t / 2;
    K.add('body', F, tmPlace(THREE, tmPlate(THREE, tmShape(THREE, fw - 0.03, pl, 0, [win]), t, 0.002), u, v, [cx + n[0] * off, cy + n[1] * off, cz + n[2] * off]));
  }
  // Missile tubes (team ink) from just inside the front plate to the tail plate.
  const zt = zb - tail;
  const nose = (x, y) => latheZ(THREE, [[0, zf - 0.05], [rh * 0.5, zf - 0.046], [rh * 0.78, zf - 0.03], [rh - 0.002, zf - 0.028], [rh - 0.002, zf - 0.04]], 18).translate(x, y, 0);
  K.add('body', 'inkGloss', ...hs.map(([x, y]) => cylZ(THREE, rh - 0.003, zt - 0.006, zf - 0.04, 18).translate(cx + x, cy + y, 0)), ...hs.map(([x, y]) => nose(cx + x, cy + y)));
  K.add('body', 'inkDark', ...hs.map(([x, y]) => new THREE.CircleGeometry(rh * 0.42, 14).translate(cx + x, cy + y, zf - 0.045)));
  // Tail plate with tube holes and two side gussets, then the ribbed caps.
  const pw = W - 0.03, ph = H - 0.03;
  K.add('body', F, tmPlate(THREE, tmShape(THREE, pw, ph, 0.02, hs.map(([x, y]) => ({ x, y, r: rh + 0.002 }))), 0.012, 0.003).translate(cx, cy, zt));
  const gus = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.06, 0), new THREE.Vector2(0, 0.03)]);
  for (const sy of [-1, 1]) K.add('body', F, tmPlace(THREE, tmPlate(THREE, gus, 0.01, 0.002), [0, 0, 1], [0, sy, 0], [cx, cy + sy * (ph / 2 - 0.004), zt + 0.006]));
  const cap = [[0, zt - 0.072], [rh * 0.8, zt - 0.072], [rh + 0.006, zt - 0.066]];
  for (let i = 0; i < 5; i++) cap.push([rh + 0.009, zt - 0.06 + i * 0.0115], [rh + 0.005, zt - 0.054 + i * 0.0115]);
  cap.push([rh + 0.004, zt - 0.004], [rh - 0.004, zt - 0.004]);
  K.add('body', 'white', ...hs.map(([x, y]) => latheZ(THREE, cap, 14).translate(cx + x, cy + y, 0)));
}
// Flattened stroke lying on a face: pts are [u, v] on axes u, v at p (n out of the face).
function tmStroke(THREE, pts, w, u, v, p) {
  const g = tube(THREE, pts.map(([a, b]) => [a, b, 0]), w, Math.max(6, pts.length * 3), 4).scale(1, 1, 0.25);
  return tmPlace(THREE, g, u, v, p);
}
function tentaLauncher(THREE) {
  const K = kit();
  // Big 2x2 crate on top, single crate under its +X side (S2 promo render).
  tmCrate(THREE, K, 0.3, 0.3, 0.32, [0, 0.05, 0], [[-0.07, 0.07], [0.07, 0.07], [-0.07, -0.07], [0.07, -0.07]], 0.05, 0.3);
  tmCrate(THREE, K, 0.17, 0.17, 0.3, [0.065, -0.186, 0.04], [[0, 0]], 0.05, 0.26);
  // Pistol grip and red trigger under the small crate.
  const grip = new THREE.Shape([[0.13, -0.268], [0.05, -0.268], [0.035, -0.31], [0.022, -0.39], [0.03, -0.405], [0.075, -0.405], [0.085, -0.36], [0.1, -0.31], [0.12, -0.29]].map(([z, y]) => new THREE.Vector2(z, y)));
  K.add('body', 'tentaFrame', tmPlace(THREE, tmPlate(THREE, grip, 0.034, 0.008), [0, 0, 1], [0, 1, 0], [0.065, 0, 0]));
  K.add('body', 'red', box(THREE, 0.014, 0.034, 0.012, 0.065, -0.29, 0.122));
  // Decals: white script on the big crate's +X side and top (front half),
  // dark print rows on the small crate's +X side and on the tubes.
  const script = [
    [[-0.05, 0.06], [-0.035, 0.085], [-0.03, 0.05], [-0.04, -0.02], [-0.03, -0.06], [-0.012, -0.05]],
    [[-0.012, 0.02], [-0.004, -0.05], [0.01, -0.04], [0.016, 0.0], [0.024, -0.05], [0.04, -0.045]],
    [[0.034, 0.03], [0.04, -0.03], [0.055, -0.06], [0.07, -0.04]],
    [[0.026, 0.04], [0.06, 0.035]], [[-0.002, 0.045], [0.003, 0.05]], [[0.012, 0.045], [0.017, 0.05]],
  ];
  K.add('body', 'mark', ...script.map(s => tmStroke(THREE, s.map(([a, b]) => [b * 1.1, a * 1.15]), 0.0065, [0, 0, -1], [0, 1, 0], [0.1425, 0.05, 0.06])));
  K.add('body', 'mark', ...script.map(s => tmStroke(THREE, s.map(([a, b]) => [a * 0.9, -b * 0.7]), 0.0055, [1, 0, 0], [0, 0, -1], [0, 0.1925, 0.07])));
  const print = [];
  for (let row = 0; row < 2; row++) for (let i = 0; i < (row ? 7 : 10); i++) print.push(box(THREE, 0.0025, 0.009, 0.006, 0.1425, -0.16 - row * 0.016, 0.165 - i * 0.0105));
  K.add('body', 'tentaPrint', ...print);
  const tubePrint = [];
  for (const [x, y, n] of [[0.07, 0.12, 6], [0.07, -0.02, 4], [0.065, -0.186, 5]]) for (let i = 0; i < n; i++) tubePrint.push(box(THREE, 0.003, 0.005 + (i % 2) * 0.004, 0.05 - (i % 3) * 0.012, x + 0.047, y - 0.012 + i * 0.006, -0.3 + (y < -0.1 ? 0.05 : 0)));
  K.add('body', 'inkDark', ...tubePrint);
  return K.finish(THREE);
}
// Missile (S3 promo image): silver body with a rounded nose, a team-ink band
// and ink fins, ink exhaust glow.
function tentaMissile(THREE) {
  const K = kit();
  K.add('body', 'steel', latheZ(THREE, smooth(THREE, [[0, -0.17], [0.03, -0.166], [0.043, -0.145], [0.045, -0.06], [0.045, 0.06], [0.041, 0.11], [0.03, 0.15], [0.014, 0.176], [0, 0.182]], 20), 16));
  K.add('body', 'ink', cylZ(THREE, 0.0465, -0.035, 0.035, 16),
    ...[0, 1, 2, 3].map(k => new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(0.04, -0.165), new THREE.Vector2(0.075, -0.17), new THREE.Vector2(0.075, -0.145), new THREE.Vector2(0.04, -0.1)]), { depth: 0.006, bevelEnabled: false }).translate(0, 0, -0.003).rotateX(Math.PI / 2).rotateZ(Math.PI / 4 + k * Math.PI / 2)));
  K.add('body', 'inkGlow', cylZ(THREE, 0.028, -0.19, -0.168, 12));
  return K.finish(THREE);
}

// ---- Inkjet --------------------------------------------------------------------
// S2 promo render and S3 screenshot. Back unit: two engine columns, each a
// team-ink tank in a red wire cage with a silver label band, a grey motor
// housing with black knobs and a chrome plate, a clear sight cylinder on top,
// a chrome collar and a black flared thruster nozzle underneath. Chunky
// black corrugated hoses loop from each housing down below the pack and back
// up into the tank; a corrugated cross hose joins the housings, a team-ink
// U manifold joins the tanks, a centre block carries a round gauge and a big
// black elbow that feeds the hose running round the right side to the
// cannon. A chrome crank lever stands on the left housing. Black back frame.
// Hand cannon: team-ink body, chrome rings, a black perforated muzzle block
// with a ribbed tip, a black knob and small sight canister on top, a wire
// carry loop, a black pistol grip and a corrugated hose hanging from the rear.
// Corrugated hose along a smooth path (radius r, rib pitch ~1.1 r).
function ijHose(THREE, pts, r, amp = 0.13, radial = 10, pitch = 1.1) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.5);
  const ribs = Math.max(3, Math.round(curve.getLength() / (r * pitch))), seg = ribs * 4;
  const fr = curve.computeFrenetFrames(seg, false), P = new THREE.Vector3(), pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, P);
    const rr = r * (1 + amp * Math.cos(i * Math.PI / 2)), N = fr.normals[i], B = fr.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * TAU, c = Math.cos(a), s = Math.sin(a);
      pos.push(P.x + rr * (c * N.x + s * B.x), P.y + rr * (c * N.y + s * B.y), P.z + rr * (c * N.z + s * B.z));
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Chrome hose clamp ring at p facing d.
const ijClamp = (THREE, r, p, d) => orient(THREE, new THREE.CylinderGeometry(r, r, r * 0.7, 14, 1, true), d, p);
function inkjetPack(THREE) {
  const K = kit();
  for (const s of [-1, 1]) {
    const X = s * 0.105, Z = -0.05;
    // Tank, label band, cage.
    K.add('body', 'inkGloss', latheY(THREE, smooth(THREE, [[0, -0.14], [0.03, -0.136], [0.05, -0.12], [0.058, -0.095], [0.058, 0.05], [0.056, 0.075], [0.05, 0.09]], 12), 18).translate(X, 0, Z));
    K.add('body', 'steel', cylY(THREE, 0.0595, -0.04, 0.012, 20).translate(X, 0, Z));
    K.add('body', 'black', ...[0, 1, 2].map(i => box(THREE, 0.004, 0.006, 0.03 - i * 0.006, X + s * 0.0, -0.026 + i * 0.011, Z - 0.06)));
    // Two red wire brackets standing off the tank's outer-back face.
    for (const a of [0.45, 1.15]) {
      const ox = Math.cos(a) * s, oz = -Math.sin(a), at = (k, y) => [X + ox * k, y, Z + oz * k];
      K.add('body', 'red', tube(THREE, [at(0.04, 0.088), at(0.068, 0.088), at(0.076, 0.078), at(0.076, 0.0), at(0.076, -0.11), at(0.066, -0.122), at(0.035, -0.128)], 0.0045, 16, 5));
    }
    // Motor housing, knobs, chrome plate with a blue window, sight cylinder.
    K.add('body', 'grey', softBox(THREE, 0.125, 0.11, 0.125, 0.2, 4).translate(X, 0.14, Z));
    K.add('body', 'chrome', box(THREE, 0.08, 0.05, 0.008, X, 0.15, Z - 0.064), cylY(THREE, 0.052, 0.195, 0.205, 20).translate(X, 0, Z),
      new THREE.TorusGeometry(0.046, 0.005, 5, 16).rotateX(Math.PI / 2).translate(X, 0.262, Z));
    K.add('body', 'blueBand', box(THREE, 0.03, 0.014, 0.004, X - s * 0.015, 0.162, Z - 0.069));
    K.add('body', 'black', ...[0.115, 0.165].map(y => cylX(THREE, 0.02, 0, 0.022, 14).translate(X + s * 0.062 + (s < 0 ? -0.022 : 0), y, Z - 0.02)),
      cylY(THREE, 0.04, 0.262, 0.272, 18).translate(X, 0, Z));
    K.add('body', 'glass', cylY(THREE, 0.045, 0.205, 0.262, 20).translate(X, 0, Z));
    K.add('body', 'darkMetal', cylY(THREE, 0.028, 0.205, 0.255, 14).translate(X, 0, Z));
    // Collar and thruster nozzle.
    K.add('body', 'chrome', cylY(THREE, 0.042, -0.165, -0.13, 18).translate(X, 0, Z), new THREE.TorusGeometry(0.043, 0.006, 5, 16).rotateX(Math.PI / 2).translate(X, -0.148, Z));
    K.add('body', 'black', latheY(THREE, [[0.036, -0.27], [0.05, -0.268], [0.052, -0.258], [0.044, -0.235], [0.037, -0.2], [0.036, -0.165]], 20).translate(X, 0, Z),
      ...[-0.18, -0.2, -0.22].map(y => new THREE.TorusGeometry(0.0375 + (y + 0.18) * -0.08, 0.004, 4, 16).rotateX(Math.PI / 2).translate(X, y, Z)));
    K.add('body', 'hole', new THREE.CircleGeometry(0.036, 16).rotateX(Math.PI / 2).translate(X, -0.262, Z));
    // Big corrugated loop hose: housing side -> below the pack -> back of the tank.
    const loop = [[X + s * 0.064, 0.15, Z], [X + s * 0.13, 0.13, Z - 0.01], [X + s * 0.15, 0.0, Z - 0.03], [X + s * 0.155, -0.2, Z - 0.05], [X + s * 0.13, -0.35, Z - 0.08], [X + s * 0.085, -0.37, Z - 0.1], [X + s * 0.07, -0.25, Z - 0.1], [X + s * 0.05, -0.1, Z - 0.07]];
    K.add('body', 'rubber', ijHose(THREE, loop, 0.034, 0.05, 10, 2.2));
    K.add('body', 'chrome', ijClamp(THREE, 0.04, [X + s * 0.068, 0.15, Z], [1, 0, 0]), ijClamp(THREE, 0.039, [X + s * 0.05, -0.1, Z - 0.068], [-s * 0.12, 1, 0.2]));
  }
  // Cross hose between the housings, chrome clamps.
  K.add('body', 'rubber', ijHose(THREE, [[-0.07, 0.21, -0.09], [-0.03, 0.27, -0.12], [0.03, 0.27, -0.12], [0.07, 0.21, -0.09]], 0.019, 0.13, 8, 1.6));
  // Team-ink U manifold between the tank bottoms.
  K.add('body', 'inkGloss', tube(THREE, [[-0.06, -0.1, -0.05], [-0.03, -0.16, -0.07], [0.03, -0.16, -0.07], [0.06, -0.1, -0.05]], 0.02, 16, 10));
  // Centre block with the gauge facing out.
  K.add('body', 'grey', softBox(THREE, 0.07, 0.09, 0.06, 0.25, 4).translate(0, 0.06, -0.05));
  K.add('body', 'chrome', cylZ(THREE, 0.033, -0.095, -0.08, 22).translate(0, 0.07, 0));
  K.add('body', 'label', new THREE.CircleGeometry(0.027, 22).rotateY(Math.PI).translate(0, 0.07, -0.0955));
  K.add('body', 'red', box(THREE, 0.004, 0.022, 0.002, 0.006, 0.078, -0.097));
  K.add('body', 'black', ...[0, 1, 2, 3, 4, 5, 6].map(k => { const a = -2.2 + k * 0.73; return box(THREE, 0.003, 0.007, 0.002, Math.sin(a) * 0.021, 0.07 + Math.cos(a) * 0.021, -0.097); }),
    cylZ(THREE, 0.006, -0.1, -0.096, 8).translate(0, 0.07, 0));
  // Big black elbow out of the centre block, feeding the cannon hose.
  K.add('body', 'black', tube(THREE, [[0, 0.02, -0.07], [0, -0.04, -0.11], [-0.03, -0.1, -0.13], [-0.08, -0.15, -0.12]], 0.027, 16, 12));
  K.add('body', 'chrome', ijClamp(THREE, 0.031, [0, 0.0, -0.085], [0, -0.7, -0.7]), ijClamp(THREE, 0.031, [-0.075, -0.145, -0.12], [-1, -0.7, 0.2]));
  K.add('body', 'rubber', ijHose(THREE, [[-0.08, -0.15, -0.12], [-0.17, -0.22, -0.1], [-0.25, -0.27, 0.02], [-0.29, -0.27, 0.18], [-0.29, -0.22, 0.3]], 0.027, 0.1, 10, 1.5));
  K.add('body', 'chrome', ijClamp(THREE, 0.032, [-0.29, -0.222, 0.3], [0, 0.35, 1]));
  // Crank lever on the +X housing (chrome rod, chrome grip sleeve).
  K.add('body', 'chrome', rod(THREE, [0.125, 0.19, -0.11], [0.125, 0.3, -0.11], 0.007, 8), rod(THREE, [0.125, 0.3, -0.11], [0.125, 0.33, -0.16], 0.007, 8),
    rod(THREE, [0.125, 0.33, -0.16], [0.125, 0.4, -0.16], 0.011, 10));
  // Back frame: rails, cross bars and a pad against the back.
  K.add('body', 'black', ...[-0.05, 0.05].map(x => rod(THREE, [x, -0.2, 0.02], [x, 0.24, 0.02], 0.012, 8)),
    rod(THREE, [-0.12, 0.2, 0.02], [0.12, 0.2, 0.02], 0.011, 8), rod(THREE, [-0.12, -0.11, 0.02], [0.12, -0.11, 0.02], 0.011, 8),
    softBox(THREE, 0.15, 0.3, 0.025, 0.3, 4).translate(0, 0.02, 0.035));
  // Jet flames out of both nozzles (pose code may scale this group).
  K.pivot('flame', [0, -0.27, -0.05]);
  K.add('flame', 'inkGlow', ...[-1, 1].map(s => new THREE.ConeGeometry(0.046, 0.3, 14, 1, true).rotateX(Math.PI).translate(s * 0.105, -0.42, -0.05)));
  return K.finish(THREE);
}
function inkjetCannon(THREE) {
  const K = kit();
  // Rear cap, team-ink body, chrome rings.
  K.add('body', 'inkGloss', cylZ(THREE, 0.042, -0.14, 0.18, 20));
  K.add('body', 'black', latheZ(THREE, [[0, -0.17], [0.03, -0.168], [0.04, -0.158], [0.044, -0.14]], 18), cylZ(THREE, 0.046, -0.15, -0.135, 18));
  K.add('body', 'chrome', cylZ(THREE, 0.05, 0.17, 0.205, 22), new THREE.TorusGeometry(0.05, 0.005, 6, 22).translate(0, 0, 0.188), cylZ(THREE, 0.045, -0.135, -0.125, 18));
  // Perforated muzzle block (rounded) with dark holes, ribbed tip, bore.
  K.add('body', 'darkMetal', latheZ(THREE, [[0.05, 0.2], [0.064, 0.206], [0.069, 0.22], [0.069, 0.345], [0.064, 0.358], [0.054, 0.364]], 26));
  const holes = [];
  for (let i = 0; i < 3; i++) for (let k = 0; k < 9; k++) {
    const a = (k + (i % 2) * 0.5) * TAU / 9;
    holes.push(new THREE.CircleGeometry(0.0115, 10).translate(0, 0, 0.0702).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)).applyMatrix4(new THREE.Matrix4().makeRotationZ(a)).translate(0, 0, 0.243 + i * 0.04));
  }
  K.add('body', 'hole', ...holes);
  const tip = [[0.05, 0.362]];
  for (let i = 0; i < 6; i++) tip.push([0.058, 0.368 + i * 0.014], [0.05, 0.375 + i * 0.014]);
  tip.push([0.05, 0.452], [0.034, 0.454], [0.032, 0.43]);
  K.add('body', 'black', latheZ(THREE, tip, 22));
  K.add('body', 'hole', new THREE.CircleGeometry(0.032, 18).translate(0, 0, 0.432));
  // Black knob and the small sight canister on top of the front ring.
  K.add('body', 'black', cylY(THREE, 0.018, 0.045, 0.07, 6).translate(0, 0, 0.19), cylY(THREE, 0.026, 0.07, 0.086, 6).translate(0, 0, 0.19));
  K.add('body', 'glass', cylY(THREE, 0.024, 0.04, 0.085, 16).translate(0, 0, 0.11));
  K.add('body', 'chrome', cylY(THREE, 0.026, 0.083, 0.093, 16).translate(0, 0, 0.11), cylY(THREE, 0.026, 0.034, 0.044, 16).translate(0, 0, 0.11),
    new THREE.TorusGeometry(0.025, 0.004, 5, 16).rotateX(Math.PI / 2).translate(0, 0.062, 0.11));
  // Wire carry loop on top of the body.
  K.add('body', 'chrome', tube(THREE, [[0, 0.035, -0.08], [0, 0.075, -0.07], [0, 0.08, -0.0], [0, 0.075, 0.06], [0, 0.035, 0.07]], 0.005, 24, 6));
  // Pistol grip with trigger guard (right hand), black.
  const grip = new THREE.Shape([[0.045, -0.035], [-0.02, -0.035], [-0.035, -0.09], [-0.045, -0.155], [-0.035, -0.165], [0.0, -0.165], [0.01, -0.12], [0.025, -0.08], [0.045, -0.06]].map(([z, y]) => new THREE.Vector2(z, y)));
  K.add('body', 'black', tmPlace(THREE, tmPlate(THREE, grip, 0.026, 0.007), [0, 0, 1], [0, 1, 0], [0, 0, 0]),
    tube(THREE, [[0, -0.04, 0.05], [0, -0.075, 0.06], [0, -0.09, 0.04], [0, -0.085, 0.018]], 0.005, 16, 6));
  K.add('body', 'red', box(THREE, 0.01, 0.026, 0.01, 0, -0.058, 0.045));
  // Hose from the rear underside, hanging down and back.
  K.add('body', 'rubber', ijHose(THREE, [[0, -0.035, -0.09], [0, -0.09, -0.12], [0.02, -0.18, -0.13], [0.05, -0.27, -0.08], [0.06, -0.34, 0.0]], 0.026, 0.1));
  K.add('body', 'chrome', ijClamp(THREE, 0.031, [0, -0.045, -0.095], [0, -1, -0.4]));
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
// S2 Model render (black stamp), S2 promo render, S3 screenshot: a thick head
// of three stacked bulging rubber rings (faceted, team ink) over a face plate
// with a raised rim and a relief squid emblem; on the back a grey plate, a
// dark blue chamfered base and a translucent jerry-can housing (team ink shows
// through it) with a top ridge, slots and a screw cap; red and blue nipples on
// the base side, a corrugated blue hose looping out over the rim to a fitting
// beside the handle root; a yellow ribbed boot, a white label band, a tapered
// octagonal yellow handle and a red rod-end tip. Built with the face toward -Y
// (stamping down) and the handle along +Z rising 25 deg from the back edge
// (the handle line is unchanged so the device grip/hands stay on it).
registerFinish('stampNavy', 0x22309a, { roughness: 0.3, metalness: 0.2 });
registerFinish('stampFrost', 0xf4f6f8, { roughness: 0.12, metalness: 0, transparent: true, opacity: 0.68, depthWrite: false });
registerInkFinish('inkShade', { roughness: 0.4, metalness: 0.05, shade: 0.8 });
// Corrugated tube: a Catmull-Rom tube whose rings swell and shrink along it.
function ribTube(THREE, pts, r, seg, ribs, depth = 0.18, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(...q)), false, 'catmullrom', 0.5);
  const g = new THREE.TubeGeometry(curve, seg, r, radial, false), p = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, c);
    const f = 1 + depth * Math.cos(i / seg * ribs * TAU);
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(f).add(c); p.setXYZ(k, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  return g;
}
const flat = (g) => { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; };
function ultraStamp(THREE) {
  const K = kit();
  // Head: face plate chamfer, three bulging rings, back edge.
  const prof = [[0, -0.215], [0.385, -0.215], [0.41, -0.205]];
  for (const c of [-0.135, 0, 0.135]) for (const t of [-90, -62, -32, 0, 32, 62, 90]) {
    const a = t * Math.PI / 180;
    prof.push([0.405 + 0.068 * Math.pow(Math.cos(a), 0.3), c + 0.066 * Math.sin(a)]);
  }
  prof.push([0.39, 0.207], [0, 0.207]);
  // Flat-shaded 16-gon: the S2/S3 renders show faceted rings.
  K.add('body', 'ink', flat(latheY(THREE, prof, 16)));
  // Face: dark field, raised rim, relief squid emblem with eye holes.
  K.add('body', 'inkShade', new THREE.CircleGeometry(0.372, 16).rotateX(Math.PI / 2).translate(0, -0.2165, 0));
  const squid = new THREE.Shape([[0, 0.27], [0.215, 0.07], [0.125, 0.055], [0.135, -0.1], [0.105, -0.25], [0.05, -0.13], [0, -0.26], [-0.05, -0.13], [-0.105, -0.25], [-0.135, -0.1], [-0.125, 0.055], [-0.215, 0.07]].map(([x, y]) => new THREE.Vector2(x, y)));
  for (const s of [-1, 1]) { const h = new THREE.Path(); h.absarc(s * 0.058, -0.035, 0.036, 0, TAU, false); squid.holes.push(h); }
  const relief = new THREE.ExtrudeGeometry(squid, { depth: 0.013, bevelEnabled: false, curveSegments: 8 }).rotateX(Math.PI / 2).translate(0, -0.2155, 0);
  K.add('body', 'inkGloss', latheY(THREE, [[0.372, -0.215], [0.372, -0.229], [0.408, -0.229], [0.408, -0.215]], 16), relief,
    ...[0, 1, 2, 3].map(k => box(THREE, 0.06, 0.013, 0.022, 0, -0.222, 0.325).rotateY(k * Math.PI / 2 + Math.PI / 4)));
  // Back: grey plate, navy base, translucent housing over an ink core.
  K.add('body', 'mech', new THREE.CircleGeometry(0.37, 18).rotateX(-Math.PI / 2).translate(0, 0.208, 0),
    ring(THREE, 0.3, 0.006, 0.21, 18));
  K.add('body', 'stampNavy', softBox(THREE, 0.62, 0.09, 0.56, 0.14).translate(0, 0.25, 0.0));
  K.add('body', 'ink', softBox(THREE, 0.48, 0.24, 0.42, 0.35).translate(0, 0.44, -0.05));
  K.add('body', 'stampFrost', softBox(THREE, 0.56, 0.31, 0.5, 0.35).translate(0, 0.445, -0.05));
  // Top ridge with a notch, a slotted rib along the back edge, a screw cap.
  K.add('body', 'white', softBox(THREE, 0.1, 0.035, 0.46, 0.3).translate(0, 0.603, -0.05), softBox(THREE, 0.54, 0.035, 0.07, 0.3).translate(0, 0.597, -0.25),
    cylZ(THREE, 0.052, 0.19, 0.225, 14).translate(-0.15, 0.43, 0), cylZ(THREE, 0.044, 0.225, 0.24, 14).translate(-0.15, 0.43, 0));
  K.add('body', 'hole', ...[-0.2, -0.12, 0.12, 0.2].map(x => box(THREE, 0.055, 0.004, 0.026, x, 0.616, -0.25)), box(THREE, 0.03, 0.004, 0.46, 0, 0.6215, -0.05));
  // Nipples on the base side, corrugated hose to a fitting by the handle root.
  K.add('body', 'red', cylX(THREE, 0.018, 0.29, 0.34, 10).translate(0, 0.272, -0.13), cylX(THREE, 0.024, 0.29, 0.305, 10).translate(0, 0.272, -0.13));
  K.add('body', 'blue', cylX(THREE, 0.02, 0.29, 0.33, 10).translate(0, 0.252, 0.0),
    ribTube(THREE, [[0.33, 0.252, 0.0], [0.41, 0.31, 0.05], [0.43, 0.42, 0.15], [0.35, 0.44, 0.27], [0.22, 0.36, 0.33], [0.155, 0.26, 0.315]], 0.021, 64, 24));
  K.add('body', 'steel', cylY(THREE, 0.026, 0.205, 0.245, 6).translate(0.155, 0, 0.315));
  // Handle (same line as before: the grip and hands sit on it).
  const lift = new THREE.Matrix4().makeTranslation(0, 0.12, 0).multiply(new THREE.Matrix4().makeRotationX(-0.44));
  const boot = [[0.074, 0.33], [0.074, 0.38]];
  for (let i = 0; i < 9; i++) { const z = 0.38 + i * 0.027, r = 0.07 - i * 0.0022; boot.push([r - 0.012, z + 0.004], [r, z + 0.0135], [r - 0.012, z + 0.023]); }
  boot.push([0.046, 0.625], [0, 0.625]);
  K.add('body', 'yellow', ...[latheZ(THREE, boot, 16), flat(cylZ(THREE, 0.043, 0.62, 1.22, 8, 0.029))].map(g => g.applyMatrix4(lift)));
  K.add('body', 'white', cylZ(THREE, 0.0445, 0.625, 0.685, 16).applyMatrix4(lift));
  K.add('body', 'decalRed', cylZ(THREE, 0.0452, 0.633, 0.64, 16).applyMatrix4(lift));
  K.add('body', 'decalBlue', cylZ(THREE, 0.0452, 0.67, 0.677, 16).applyMatrix4(lift));
  K.add('body', 'red', ...[cylZ(THREE, 0.031, 1.215, 1.25, 10), cylZ(THREE, 0.016, 1.245, 1.262, 8),
    new THREE.TorusGeometry(0.025, 0.012, 8, 16).rotateY(Math.PI / 2).translate(0, 0, 1.285)].map(g => g.applyMatrix4(lift)));
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
// S3 Promotional 3D Render, model turntable (8 angles), promo image: a hollow
// team-ink crate with a moulded top lip, ribbed and recessed side panels, a
// front slot over a forward tray (an oval holder and a marker ball in it), a
// red latch block with a lens at the front top, and a light grey metal lid
// hinged at the back with a step tab; red-nosed missiles (eye, cheeks, olive
// body, team-ink fins) lie inside. The lid is built open as in the render; the
// promo image shows the crate worn on the back with the lid shut, which the
// presentation does by turning the 'lid' group by INKSTRIKE_LID_OPEN. The
// thrown marker is a red dome on a ribbed ink band with a lens, on a cream
// suction cup; the strike is a twisting ink column.
registerFinish('strikeLid', 0xbdb9ae, { roughness: 0.42, metalness: 0.35 });
registerFinish('strikeOlive', 0xd8d03c, { roughness: 0.35, metalness: 0.05 });
export const INKSTRIKE_LID_OPEN = 0.72;
function strikeMissile(THREE, K, x0, y0, z0, spin) {
  const at = (g) => g.rotateX(spin).translate(x0, y0, z0);
  const alongX = (prof, seg) => latheY(THREE, prof, seg).rotateZ(-Math.PI / 2);
  K.add('body', 'strikeOlive', at(cylX(THREE, 0.03, -0.08, 0.055, 14)));
  K.add('body', 'steel', at(cylX(THREE, 0.0315, -0.088, -0.076, 14)));
  K.add('body', 'red', at(alongX([[0.03, 0.05], [0.036, 0.07], [0.038, 0.11], [0.033, 0.145], [0.02, 0.168], [0, 0.175]], 14)),
    ...[-1, 1].map(s => at(sphere(THREE, 0.012, 0.072, 0, s * 0.034, 1, 1, 1, 8, 6))));
  K.add('body', 'white', at(new THREE.CircleGeometry(0.013, 12).rotateX(-Math.PI / 2).translate(0.118, 0.0385, 0)));
  K.add('body', 'black', at(new THREE.CircleGeometry(0.0065, 10).rotateX(-Math.PI / 2).translate(0.121, 0.0390, 0)));
  K.add('body', 'ink', at(alongX([[0.012, -0.145], [0.026, -0.11], [0.03, -0.08]], 12)),
    ...[0, 1, 2, 3].map(k => at(box(THREE, 0.05, 0.004, 0.05, -0.12, 0, 0.032).rotateX(k * Math.PI / 2 + Math.PI / 4))));
}
function inkstrikeCase(THREE) {
  const K = kit(), sb = (w, h, d, r) => softBox(THREE, w, h, d, r, 4);
  // Crate: hollow walls, base skirt, moulded top lip, dark interior floor.
  K.add('body', 'ink', sb(0.42, 0.2, 0.026, 0.1).translate(0, 0.1, 0.147), sb(0.42, 0.2, 0.026, 0.1).translate(0, 0.1, -0.147),
    ...[-1, 1].map(s => sb(0.026, 0.2, 0.32, 0.1).translate(s * 0.197, 0.1, 0)),
    sb(0.43, 0.03, 0.33, 0.1).translate(0, 0.015, 0),
    sb(0.436, 0.024, 0.03, 0.15).translate(0, 0.192, 0.152), sb(0.436, 0.024, 0.03, 0.15).translate(0, 0.192, -0.152),
    ...[-1, 1].map(s => sb(0.03, 0.024, 0.334, 0.15).translate(s * 0.203, 0.192, 0)));
  K.add('body', 'inkDark', box(THREE, 0.37, 0.01, 0.27, 0, 0.05, 0),
    ...[-0.085, 0, 0.085].map(z => box(THREE, 0.025, 0.03, 0.05, 0.0, 0.065, z)),
    // Front slot, side and back recesses.
    box(THREE, 0.32, 0.055, 0.004, 0, 0.068, 0.1605),
    ...[-1, 1].map(s => box(THREE, 0.004, 0.11, 0.18, s * 0.2105, 0.1, 0)),
    box(THREE, 0.16, 0.11, 0.004, 0, 0.1, -0.1605), ...[-1, 1].map(s => box(THREE, 0.075, 0.09, 0.004, s * 0.135, 0.1, -0.1605)));
  K.add('body', 'ink', ...[0, 1, 2, 3, 4].flatMap(i => [box(THREE, 0.16, 0.011, 0.008, 0, 0.06 + i * 0.02, -0.162),
    ...[-1, 1].map(s => box(THREE, 0.008, 0.011, 0.18, s * 0.212, 0.06 + i * 0.02, 0))]));
  K.add('body', 'label', ...[-1, 1].map(s => box(THREE, 0.004, 0.03, 0.09, s * 0.2125, 0.165, 0)));
  // Forward tray: plate, rails, oval holder, a marker ball resting in it.
  K.add('body', 'ink', box(THREE, 0.4, 0.024, 0.12, 0, 0.012, 0.215), ...[-1, 1].map(s => sb(0.03, 0.04, 0.12, 0.2).translate(s * 0.185, 0.03, 0.215)),
    sb(0.4, 0.03, 0.022, 0.2).translate(0, 0.025, 0.268),
    new THREE.TorusGeometry(0.05, 0.008, 6, 20).rotateX(Math.PI / 2).scale(1.4, 1, 1).translate(0.06, 0.025, 0.215));
  K.add('body', 'inkDark', new THREE.CircleGeometry(0.05, 20).rotateX(-Math.PI / 2).scale(1.4, 1, 1).translate(0.06, 0.0245, 0.215));
  K.add('body', 'red', new THREE.SphereGeometry(0.042, 14, 8, 0, TAU, 0, 1.0).translate(-0.1, 0.065, 0.212));
  K.add('body', 'ink', cylY(THREE, 0.043, 0.05, 0.06, 14).translate(-0.1, 0, 0.212));
  K.add('body', 'cream', new THREE.SphereGeometry(0.042, 14, 6, 0, TAU, Math.PI / 2, Math.PI / 2).translate(-0.1, 0.064, 0.212).scale(1, 1, 1));
  // Red latch block with a lens over the front lip.
  K.add('body', 'red', sb(0.085, 0.085, 0.03, 0.15).translate(0.12, 0.165, 0.166));
  K.add('body', 'hole', new THREE.CircleGeometry(0.016, 14).translate(0.12, 0.15, 0.1815));
  K.add('body', 'darkMetal', new THREE.TorusGeometry(0.018, 0.004, 6, 14).translate(0.12, 0.15, 0.181));
  K.add('body', 'darkMetal', cylX(THREE, 0.011, -0.18, -0.12, 10).translate(0, 0.206, -0.168), cylX(THREE, 0.011, 0.12, 0.18, 10).translate(0, 0.206, -0.168));
  // Missiles inside.
  for (const [z, spin] of [[-0.085, 0.3], [0, -0.2], [0.085, 0.5]]) strikeMissile(THREE, K, 0, 0.095, z, spin);
  // Harness straps under the crate (it rides on the back).
  K.add('body', 'black', ...[-1, 1].map(s => box(THREE, 0.04, 0.01, 0.3, s * 0.11, -0.004, 0)));
  // Lid: plate, step tab, inner grid panel; opened about the back hinge.
  K.pivot('lid', [0, 0.206, -0.168]);
  const hinge = new THREE.Matrix4().makeTranslation(0, 0.206, -0.168).multiply(new THREE.Matrix4().makeRotationX(-INKSTRIKE_LID_OPEN)).multiply(new THREE.Matrix4().makeTranslation(0, -0.206, 0.168));
  const lid = (g) => g.applyMatrix4(hinge);
  K.add('lid', 'strikeLid', lid(sb(0.44, 0.022, 0.345, 0.12).translate(0, 0.216, 0.0)), lid(sb(0.4, 0.012, 0.3, 0.2).translate(0, 0.231, -0.01)));
  K.add('lid', 'darkMetal', lid(sb(0.1, 0.014, 0.035, 0.3).translate(0.04, 0.235, 0.15)),
    lid(cylX(THREE, 0.012, -0.12, 0.12, 10).translate(0, 0.206, -0.168)));
  K.add('lid', 'grey', ...[0, 1, 2].flatMap(i => [0, 1, 2, 3].map(j => lid(box(THREE, 0.036, 0.003, 0.026, -0.04 + j * 0.044, 0.2045, -0.04 + i * 0.036)))));
  return K.finish(THREE);
}
function inkstrikeBeacon(THREE) {
  const K = kit();
  K.add('body', 'cream', latheY(THREE, [[0, 0], [0.17, 0], [0.165, 0.012], [0.09, 0.04], [0.11, 0.05], [0, 0.05]], 24));
  const band = [[0.13, 0.04]];
  for (let i = 0; i < 6; i++) band.push([0.142, 0.046 + i * 0.012], [0.135, 0.052 + i * 0.012]);
  band.push([0.13, 0.12], [0, 0.12]);
  K.add('body', 'ink', latheY(THREE, band, 24));
  K.add('body', 'red', new THREE.SphereGeometry(0.135, 22, 10, 0, TAU, 0, Math.PI / 2).scale(1, 0.75, 1).translate(0, 0.118, 0));
  K.add('body', 'hole', new THREE.CylinderGeometry(0.028, 0.028, 0.02, 6).rotateX(Math.PI / 2).translate(0, 0.082, 0.137));
  K.add('body', 'darkMetal', new THREE.TorusGeometry(0.03, 0.006, 6, 6).translate(0, 0.082, 0.143));
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
// S3 Model render, Promotional 3D Render, model turntable (8 angles). Decoy:
// a glossy ink balloon (widest just above the middle, flattened underneath)
// with a ring of ink drips round its underside, confetti dots, a white
// zip-tie band with a buckle, an embossed face (ringed eyes, bean mouth), a
// pink tie at the neck, an ink bulb, a grey valve with a light-blue knurled
// knob and a white suction cup with a lift tab. Launcher: a dark metal cone
// base, a copper spring round a blue core, a team-ink U yoke whose arms end
// in black rings and light-blue pivot caps holding a clear globe (inside: a
// light-blue disc, a grey shaft, an ink washer and a dark nut), a black
// rubber collar, a ring of dark ink barrels and an orange toothed cap with
// light-blue holes. The globe is a 'globe' group pivoting on the yoke axis.
registerFinish('chumpSky', 0x52aef2, { roughness: 0.35, metalness: 0.05 });
registerFinish('chumpCopper', 0xb7835a, { roughness: 0.3, metalness: 0.7 });
registerFinish('chumpCup', 0xeef0f6, { roughness: 0.2, metalness: 0, transparent: true, opacity: 0.92 });
registerFinish('chumpTie', 0xf2f0fa, { roughness: 0.3, metalness: 0, transparent: true, opacity: 0.85 });
registerInkFinish('inkDeep', { roughness: 0.35, metalness: 0.05, shade: 0.3 });
const CHUMP_PROFILE = [[0.05, 0.36], [0.075, 0.42], [0.17, 0.47], [0.3, 0.52], [0.385, 0.6], [0.43, 0.7], [0.445, 0.82], [0.43, 0.95], [0.38, 1.06], [0.28, 1.15], [0.14, 1.2], [0, 1.215]];
function chumpDecoy(THREE) {
  const K = kit();
  const prof = smooth(THREE, CHUMP_PROFILE, 30);
  const rAt = (y) => {
    for (let i = 1; i < prof.length; i++) if (prof[i][1] >= y) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; return r0 + (r1 - r0) * (y - y0) / ((y1 - y0) || 1); }
    return 0;
  };
  // Place a flat decal (built facing +Z) on the balloon at azimuth a, height y.
  const onSkin = (g, a, y, lift = 0.003) => {
    const r = rAt(y), dr = (rAt(y + 0.01) - rAt(y - 0.01)) / 0.02, n = new THREE.Vector3(Math.sin(a), -dr, Math.cos(a)).normalize();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n));
    return g.translate(Math.sin(a) * r + n.x * lift, y + n.y * lift, Math.cos(a) * r + n.z * lift);
  };
  K.add('body', 'inkGloss', latheY(THREE, prof, 28));
  // Drips hanging round the underside.
  const drips = [];
  for (let k = 0; k < 12; k++) {
    const a = k * TAU / 12 + 0.2, y = 0.545 + 0.02 * (k % 3), r = rAt(y) - 0.012, s = 0.03 + 0.009 * ((k * 7) % 3);
    drips.push(sphere(THREE, s, Math.sin(a) * r, y - 0.025, Math.cos(a) * r, 1, 1.4, 1, 10, 8));
  }
  K.add('body', 'inkGloss', ...drips);
  // Zip-tie band with teeth and a buckle (at 50 deg so it widens x and z alike).
  const bandY = 0.925, bandR = rAt(bandY) + 0.006;
  K.add('body', 'chumpTie', latheY(THREE, [[bandR - 0.01, bandY - 0.028], [bandR, bandY - 0.026], [bandR, bandY + 0.026], [bandR - 0.01, bandY + 0.028]], 40));
  K.add('body', 'white', ...Array.from({ length: 40 }, (_, k) => box(THREE, 0.006, 0.046, 0.006, 0, bandY, bandR + 0.001).rotateY(k * TAU / 40)),
    softBox(THREE, 0.05, 0.075, 0.06, 0.2).translate(0, bandY, bandR + 0.02).rotateY(0.87),
    box(THREE, 0.1, 0.03, 0.008, 0.06, bandY, bandR + 0.035).rotateY(0.87));
  // Face below the band: ringed eyes and a bean mouth, embossed.
  const face = [];
  for (const s of [-1, 1]) face.push(onSkin(new THREE.RingGeometry(0.068, 0.092, 24), s * 0.5, 0.8), onSkin(new THREE.CircleGeometry(0.045, 18), s * 0.5, 0.8, 0.004));
  const bean = [];
  for (let i = 0; i < 28; i++) {
    const t = i / 28 * TAU, dent = Math.sin(t) > 0 ? 1 - 0.55 * Math.exp(-(Math.cos(t) ** 2) * 14) : 1;
    bean.push(new THREE.Vector3(Math.cos(t) * 0.085, Math.sin(t) * 0.052 * dent, 0));
  }
  face.push(onSkin(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bean, true), 40, 0.013, 5, true), 0, 0.79, 0.008));
  K.add('body', 'inkDeep', ...face);
  // Confetti dots off the face and band.
  const cols = ['pink', 'yellow', 'teal', 'cream', 'decalRed'], dots = new Map(cols.map(c => [c, []]));
  for (let k = 0; k < 40; k++) {
    const j = Math.sin(k * 12.9898) * 43758.5453, n = j - Math.floor(j), a = k * 2.399963, y = 0.56 + 0.56 * n;
    const az = a % TAU, nearFace = (az < 0.85 || az > TAU - 0.85) && y > 0.68 && y < 0.9;
    if (nearFace || Math.abs(y - bandY) < 0.05 || rAt(y) < 0.15) continue;
    dots.get(cols[k % cols.length]).push(onSkin(new THREE.CircleGeometry(0.026 + 0.006 * ((k * 5) % 3), 12), a, y));
  }
  for (const [c, list] of dots) if (list.length) K.add('body', c, ...list);
  // Neck: pink tie, ink bulb, grey valve with a knurled knob, suction cup.
  K.add('body', 'pink', cylY(THREE, 0.058, 0.33, 0.37, 16), box(THREE, 0.05, 0.036, 0.025, 0.07, 0.35, 0));
  K.add('body', 'inkGloss', sphere(THREE, 0.05, 0, 0.3, 0, 1, 0.7, 1, 14, 8), cylY(THREE, 0.03, 0.24, 0.29, 12));
  K.add('body', 'grey', sphere(THREE, 0.042, 0, 0.215, 0, 1, 0.85, 1, 14, 8), cylY(THREE, 0.022, 0.15, 0.2, 10));
  K.add('body', 'steel', cylX(THREE, 0.01, -0.09, -0.03, 8).translate(0, 0.215, 0));
  K.add('body', 'chumpSky', cylX(THREE, 0.032, -0.135, -0.09, 16).translate(0, 0.215, 0),
    ...Array.from({ length: 12 }, (_, k) => box(THREE, 0.04, 0.008, 0.008, -0.1125, 0, 0.033).rotateX(k * TAU / 12).translate(0, 0.215, 0)));
  K.add('body', 'chumpCup', latheY(THREE, [[0, 0], [0.22, 0], [0.222, 0.01], [0.2, 0.022], [0.12, 0.07], [0.06, 0.12], [0.035, 0.16], [0, 0.16]], 28),
    box(THREE, 0.025, 0.05, 0.012).rotateX(-0.5).translate(0, 0.035, -0.205));
  return K.finish(THREE);
}
function chumpLauncher(THREE) {
  const K = kit();
  // Base, spring, yoke.
  K.add('body', 'darkMetal', latheY(THREE, [[0, 0], [0.14, 0], [0.145, 0.008], [0.13, 0.016], [0.05, 0.042], [0.036, 0.048], [0, 0.048]], 28));
  K.add('body', 'steel', ring(THREE, 0.142, 0.005, 0.006, 28));
  K.add('body', 'black', cylY(THREE, 0.04, 0.045, 0.06, 16), cylY(THREE, 0.04, 0.128, 0.142, 16));
  K.add('body', 'blue', cylY(THREE, 0.019, 0.06, 0.13, 12));
  const helix = [];
  for (let i = 0; i <= 40; i++) { const a = i / 40 * 4.5 * TAU; helix.push([Math.cos(a) * 0.032, 0.064 + i / 40 * 0.06, Math.sin(a) * 0.032]); }
  K.add('body', 'chumpCopper', tube(THREE, helix, 0.0065, 90, 6));
  K.add('body', 'ink', softBox(THREE, 0.15, 0.03, 0.075, 0.2).translate(0, 0.155, 0),
    MODEL_KIT.strap(THREE, [[-0.135, 0.31, 0], [-0.137, 0.25, 0], [-0.125, 0.195, 0], [-0.085, 0.163, 0], [0, 0.158, 0], [0.085, 0.163, 0], [0.125, 0.195, 0], [0.137, 0.25, 0], [0.135, 0.31, 0]], 0.055, 0.03, 80));
  // Pivot hardware: black rings against the globe, steel washers, sky caps.
  for (const s of [-1, 1]) {
    const x = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    K.add('body', 'ink', softBox(THREE, 0.035, 0.07, 0.065, 0.3).translate(s * 0.137, 0.31, 0));
    K.add('body', 'black', cylX(THREE, 0.04, ...x(0.105, 0.12), 18).translate(0, 0.31, 0));
    K.add('body', 'steel', cylX(THREE, 0.034, ...x(0.155, 0.162), 16).translate(0, 0.31, 0));
    K.add('body', 'chumpSky', cylX(THREE, 0.03, ...x(0.162, 0.185), 16).translate(0, 0.31, 0));
  }
  // Globe (pivots on the yoke axis).
  K.pivot('globe', [0, 0.31, 0]);
  K.add('globe', 'clear', sphere(THREE, 0.115, 0, 0.31, 0, 1, 1.06, 1, 24, 16));
  K.add('globe', 'chumpSky', cylY(THREE, 0.075, 0.36, 0.375, 20));
  K.add('globe', 'steel', cylY(THREE, 0.026, 0.24, 0.36, 12));
  K.add('globe', 'ink', cylY(THREE, 0.05, 0.285, 0.293, 18));
  K.add('globe', 'darkMetal', cylY(THREE, 0.04, 0.215, 0.25, 6), cylY(THREE, 0.018, 0.175, 0.2, 10));
  K.add('globe', 'black', latheY(THREE, [[0.1, 0.37], [0.122, 0.39], [0.124, 0.41], [0.104, 0.432], [0.094, 0.436], [0.094, 0.468], [0.1, 0.472], [0, 0.472]], 24));
  // Barrel drum: six dark ink tubes round a core, toothed orange cap.
  K.add('globe', 'inkDark', cylY(THREE, 0.045, 0.47, 0.53, 18),
    ...[0, 1, 2, 3, 4, 5].map(k => { const a = k * TAU / 6; return cylY(THREE, 0.026, 0.47, 0.53, 10).translate(Math.sin(a) * 0.058, 0, Math.cos(a) * 0.058); }));
  K.add('globe', 'orange', cylY(THREE, 0.115, 0.53, 0.56, 32),
    ...Array.from({ length: 40 }, (_, k) => box(THREE, 0.011, 0.03, 0.01, 0, 0.545, 0.118).rotateY(k * TAU / 40)));
  K.add('globe', 'chumpSky', cylY(THREE, 0.022, 0.559, 0.563, 14),
    ...[0, 1, 2, 3, 4, 5].map(k => { const a = k * TAU / 6 + TAU / 12; return cylY(THREE, 0.017, 0.559, 0.563, 10).translate(Math.sin(a) * 0.068, 0, Math.cos(a) * 0.068); }));
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
  // Eyes (S3 model render / icon): one cream goggle mask joining both eyes
  // with a dip at the bottom centre and pointed outer corners, a black rim
  // along its lower edge, large team-ink irises with a darker ring and black
  // pupil, and angry ink lids slanting down to the centre that hide the upper
  // part of each iris under the mantle. Bands are laid on the head surface.
  const rAt = (y) => {
    for (let i = 1; i < prof.length; i++) if (prof[i][1] >= y) {
      const a = prof[i - 1], b = prof[i], t = (y - a[1]) / Math.max(1e-6, b[1] - a[1]);
      return a[0] + (b[0] - a[0]) * t;
    }
    return 0;
  };
  const headZ = (x, y) => {
    const k = Math.min(1, Math.max(0, (y - 1.1) / 0.16)), r = rAt(y);
    return Math.sqrt(Math.max(0, r * r - x * x)) * (0.65 + (0.36 - 0.65) * k) - 0.02 * k;
  };
  const band = (halfW, yBot, yTop, off, nu = 32, nv = 4) => {
    const pos = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu * 2 - 1, y0 = yBot(u), y = y0 + (yTop(u) - y0) * j / nv, x = u * halfW;
      // Push out along the head's horizontal (elliptical) normal so stacked
      // bands stay apart where the face curves away at the outer corners.
      const z = headZ(x, y), c = headZ(0, y) / Math.max(1e-6, rAt(y)), nx = x, nz = z / Math.max(1e-6, c * c), n = Math.hypot(nx, nz) || 1;
      pos.push(x + nx / n * off, y, z + nz / n * off);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const maskBot = (u) => 0.915 + 0.08 * Math.exp(-((u / 0.22) ** 2)) + 0.15 * Math.max(0, (Math.abs(u) - 0.7) / 0.3) ** 2;
  const lid = (u) => 1.025 + 0.085 * Math.min(1, Math.abs(u) / 0.7);
  K.add('body', 'black', band(0.325, (u) => maskBot(u) - 0.022, (u) => lid(u) + 0.02, 0.002));
  K.add('body', 'cream', band(0.305, maskBot, (u) => lid(u) + 0.02, 0.01));
  for (const s of [-1, 1]) {
    const x = s * 0.15, y = 1.045, z = headZ(x, y);
    // Offsets are in the eye's own frame, turned to follow the head surface.
    const g = (r, sz, dx, dy, dz) => sphere(THREE, r, dx, dy, dz, 1, 1.12, sz, 22, 12)
      .rotateY(Math.atan2(x, z) * 0.8).translate(x, y, z);
    K.add('body', 'inkDark', g(0.077, 0.28, 0, 0, 0.006));
    K.add('body', 'inkIris', g(0.07, 0.3, 0, 0, 0.01));
    K.add('body', 'black', g(0.03, 0.3, -s * 0.018, 0.004, 0.022));
  }
  K.add('body', 'black', band(0.3, (u) => lid(u) - 0.01, lid, 0.04));
  K.add('body', 'inkGloss', band(0.32, lid, () => 1.19, 0.041));
  // Fringe of short tentacles under the eyes.
  const fringe = [];
  for (let k = 0; k < 7; k++) {
    const u = (k - 3) / 3, x = u * 0.3, z = 0.2 - Math.abs(u) * 0.14;
    fringe.push(tube(THREE, [[x, 0.9, z * 0.85], [x * 1.08, 0.78, z + 0.03], [x * 1.14, 0.63 + Math.abs(u) * 0.06, z]], 0.055 - Math.abs(u) * 0.012, 10, 8));
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
