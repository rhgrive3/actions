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
// S3 Crab Tank Model.png (fully inked tank, yellow ball form), S3 promo
// screenshots 00-02 (yellow base plates with team ink over the top in a
// blocky jagged edge) and the S3 icon (front view). Read from the views:
//  - a faceted dome shell over the top and back, a cockpit on its rear top
//    with handlebar grips; the kid rides with the shell round the waist;
//  - two yellow eye stalks with black rounded tips on the dome's front edge,
//    over a notch that shows the core (a grey plate with a diamond of four
//    squares in the icon) between yellow brackets and a hazard-striped plate;
//  - two claw pods low at the front corners: the right one closed (a rounded
//    box with a crash-test circle, a tan band and a chamfered band of
//    diagonal tan/white stripes), the left one open: a crescent shell (ink
//    outside, grey inside, striped hook tip) round a three-barrel bronze gun
//    with red muzzle rings on a grey arm;
//  - three crab legs per side: grey hip and knee joints and long curved
//    yellow blades with white diagonal stripes, tips on the ground;
//  - crash-test-dummy circles on the dome sides, pods and claw.
// The kid stands in INKWAVE (no riding pose), so the tank sits on the ground
// and the cockpit rim is between the kid's waist and chest; the real rider
// sits on top, higher.
registerFinish('crabTan', 0xc9b08c, { roughness: 0.55, metalness: 0 });
registerFinish('crabGrey', 0xc3c7c2, { roughness: 0.45, metalness: 0.25 });
registerFinish('crabMark', 0x3a2c1c, { roughness: 0.6, metalness: 0 });
registerFinish('crabBronze', 0x6e5442, { roughness: 0.35, metalness: 0.5 });

const V3 = (THREE, a) => new THREE.Vector3(...a);
// Triangle soup: quads/tris with winding fixed against an outward vector.
function crabSoup() {
  const pos = [], nor = [];
  return {
    pos, nor,
    tri(a, b, c, o, n = null) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * nx + ny * ny + nz * nz < 1e-14) return;
      const flip = nx * o[0] + ny * o[1] + nz * o[2] < 0, list = flip ? [a, c, b] : [a, b, c];
      for (const p of list) pos.push(p[0], p[1], p[2]);
      if (n) for (const p of list) { const m = n(p); nor.push(m[0], m[1], m[2]); }
    },
    quad(a, b, c, d, o, n) { this.tri(a, b, c, o, n); this.tri(a, c, d, o, n); },
    geo(THREE) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (nor.length === pos.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      else g.computeVertexNormals();
      return g;
    },
  };
}
// Split a geometry's triangles by a centroid test (keeps its normals).
function crabSplit(THREE, geo, pred) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position.array, N = g.attributes.normal.array;
  const out = [[[], []], [[], []]];
  for (let i = 0; i < P.length; i += 9) {
    const k = pred((P[i] + P[i + 3] + P[i + 6]) / 3, (P[i + 1] + P[i + 4] + P[i + 7]) / 3, (P[i + 2] + P[i + 5] + P[i + 8]) / 3) ? 0 : 1;
    for (let j = 0; j < 9; j++) { out[k][0].push(P[i + j]); out[k][1].push(N[i + j]); }
  }
  return out.map(([p, n]) => {
    const o = new THREE.BufferGeometry();
    o.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    o.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    return o;
  });
}
// Blocky jagged edge of the ink over the yellow plates (promo screenshots).
const CRAB_JAG = [0.6, -0.4, 0.9, 0.1, -0.8, 0.5, -0.2, 1, -0.6, 0.3, -1, 0.7, 0, -0.5, 0.8, -0.3, 0.4, -0.9];
const crabJag = (a, bins = 18) => CRAB_JAG[((Math.floor((a / TAU + 1) * bins) % bins) + bins) % bins];
// Diagonal stripes on a parametric strip f(u, v) (u along, v across, 0..1):
// n stripes along, each sheared by `skew` stripe widths across. Returns the
// two alternating stripe sets.
function crabStripes(THREE, f, n, skew, out, normal = null, nv = 2, nu = 2) {
  const A = crabSoup(), B = crabSoup(), cl = (x) => Math.max(0, Math.min(1, x));
  for (let k = Math.floor(-Math.abs(skew)) - 1; k <= n + Math.abs(skew) + 1; k++) {
    const S = ((k % 2) + 2) % 2 ? B : A;
    for (let j = 0; j < nv; j++) {
      const v0 = j / nv, v1 = (j + 1) / nv;
      for (let i = 0; i < nu; i++) {
        const ua = (v, t) => cl((k + t + v * skew) / n);
        const t0 = i / nu, t1 = (i + 1) / nu;
        if (ua(v0, t1) - ua(v0, t0) < 1e-6 && ua(v1, t1) - ua(v1, t0) < 1e-6) continue;
        const p = [f(ua(v0, t0), v0), f(ua(v0, t1), v0), f(ua(v1, t1), v1), f(ua(v1, t0), v1)];
        const m = p.reduce((s, q) => [s[0] + q[0] / 4, s[1] + q[1] / 4, s[2] + q[2] / 4], [0, 0, 0]);
        S.quad(p[0], p[1], p[2], p[3], out(m), normal);
      }
    }
  }
  return [A.geo(THREE), B.geo(THREE)];
}
// Crash-test-dummy circle: ring and two opposite quarters, on a surface.
function crabMark(THREE, r, p, n, lift = 0.005, spin = 0) {
  const N = V3(THREE, n).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), N);
  const at = V3(THREE, p).addScaledVector(N, lift);
  return [new THREE.RingGeometry(r * 0.76, r, 24), new THREE.CircleGeometry(r * 0.76, 8, spin, Math.PI / 2), new THREE.CircleGeometry(r * 0.76, 8, spin + Math.PI, Math.PI / 2)]
    .map(g => g.applyQuaternion(q).translate(at.x, at.y, at.z));
}
// Flat tapered blade swept along a curve; `W` is the fixed width axis.
// Returns the closed blade and a face sampler for stripe overlays.
function crabBlade(THREE, pts, W, wFn, t, steps = 18) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => V3(THREE, p)), false, 'catmullrom', 0.5), Wv = V3(THREE, W).normalize();
  const frame = (u) => {
    const c = curve.getPointAt(u), T = curve.getTangentAt(u), N = new THREE.Vector3().crossVectors(T, Wv).normalize();
    return { c, N, w: wFn(u) };
  };
  const S = crabSoup(), ring = [];
  for (let i = 0; i <= steps; i++) {
    const { c, N, w } = frame(i / steps), pt = (a, b) => c.clone().addScaledVector(Wv, a * w / 2).addScaledVector(N, b * t / 2).toArray();
    ring.push({ c: c.toArray(), N: N.toArray(), q: [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)] });
  }
  for (let i = 0; i < steps; i++) {
    const a = ring[i], b = ring[i + 1];
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4, m = [0, 1, 2].map(j => (a.q[k][j] + a.q[k2][j] + b.q[k][j] + b.q[k2][j]) / 4);
      S.quad(a.q[k], a.q[k2], b.q[k2], b.q[k], [m[0] - (a.c[0] + b.c[0]) / 2, m[1] - (a.c[1] + b.c[1]) / 2, m[2] - (a.c[2] + b.c[2]) / 2]);
    }
  }
  for (const [r, s] of [[ring[0], -1], [ring[steps], 1]]) {
    const T = curve.getTangentAt(s < 0 ? 0 : 1).multiplyScalar(s).toArray();
    S.quad(r.q[0], r.q[1], r.q[2], r.q[3], T);
  }
  const face = (side, lift = 0.004) => (u, v) => {
    const { c, N, w } = frame(Math.min(1, Math.max(0, u)));
    return c.addScaledVector(Wv, (v - 0.5) * w * 0.92).addScaledVector(N, side * (t / 2 + lift)).toArray();
  };
  return { geo: S.geo(THREE), face, normalAt: (u) => frame(u).N.toArray() };
}

// Dome: ellipsoid over the top and back (centre DOME_C, radii DOME_R).
const DOME_C = [0, 0.6, 0], DOME_R = [0.62, 0.52, 0.62];
const domeY = (x, z) => { const u = (x / DOME_R[0]) ** 2 + ((z - DOME_C[2]) / DOME_R[2]) ** 2; return DOME_C[1] + DOME_R[1] * Math.sqrt(Math.max(0, 1 - u)); };
const domeAt = (az, el) => {
  const p = [DOME_C[0] + DOME_R[0] * Math.cos(el) * Math.sin(az), DOME_C[1] + DOME_R[1] * Math.sin(el), DOME_C[2] + DOME_R[2] * Math.cos(el) * Math.cos(az)];
  const n = [0, 1, 2].map(i => (p[i] - DOME_C[i]) / DOME_R[i] ** 2);
  return [p, n];
};
// Point at arclength fraction u round a closed [x, z] polygon.
function crabLoop(pts, u) {
  const L = pts.map((p, i) => Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]));
  let s = (((u % 1) + 1) % 1) * L.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pts.length; i++) {
    if (s <= L[i] || i === pts.length - 1) { const a = pts[i], b = pts[(i + 1) % pts.length], t = Math.min(1, s / L[i]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    s -= L[i];
  }
  return pts[0];
}
// Control grips (model space) the kid's hands reach (special-presentation.mjs).
export const CRAB_TANK_GRIPS = Object.freeze({ R: [-0.2, 1.13, 0.34], L: [0.2, 1.13, 0.34] });

function crabTank(THREE) {
  const K = kit();
  // Dome shell, cut for the cockpit (top, round the kid) and the front core
  // notch; the ink covers the top with a blocky edge, the yellow shows below.
  let dome = new THREE.SphereGeometry(1, 36, 18, 0, TAU, 0, Math.PI * 0.62).scale(...DOME_R).translate(...DOME_C);
  [dome] = crabSplit(THREE, dome, (x, y, z) => !(x * x + (z - 0.04) ** 2 < 0.27 ** 2 && y > 0.85) && !(Math.abs(x) < 0.25 && z > 0.3 && y < 0.95));
  const [domeInk, domeYellow] = crabSplit(THREE, dome, (x, y, z) => y > 0.8 + 0.07 * crabJag(Math.atan2(x, z)));
  K.add('body', 'ink', domeInk);
  K.add('body', 'yellow', domeYellow);
  // Grey chassis under the shell, cockpit tub (faces inward) and its rim.
  K.add('body', 'grey', sphere(THREE, 1, 0, 0.42, -0.06, 0.5, 0.18, 0.46, 24, 10));
  K.add('body', 'darkMetal',
    latheY(THREE, [[0.27, 1.1], [0.27, 0.62], [0.001, 0.6]], 24).translate(0, 0, 0.04));
  const rim = [];
  for (let i = 0; i < 32; i++) { const a = i / 32 * TAU, x = Math.sin(a) * 0.275, z = 0.04 + Math.cos(a) * 0.275; rim.push([x, domeY(x, z) - 0.005, z]); }
  K.add('body', 'black', tube(THREE, rim, 0.026, 48, 6, true));
  // Handlebar grips in front of the kid (screenshots 00 and 02).
  for (const s of [-1, 1]) {
    const [gx, gy, gz] = s < 0 ? CRAB_TANK_GRIPS.R : CRAB_TANK_GRIPS.L;
    K.add('body', 'crabGrey', rod(THREE, [gx, domeY(gx, gz - 0.02) - 0.03, gz - 0.02], [gx, gy, gz], 0.022, 8), box(THREE, 0.08, 0.035, 0.06, gx - s * 0.02, gy, gz));
    K.add('body', 'black', rod(THREE, [gx - s * 0.04, gy, gz], [gx + s * 0.09, gy, gz], 0.03, 10), sphere(THREE, 0.031, gx + s * 0.09, gy, gz, 1, 1, 1, 10, 6));
  }
  // Rear step loops over the back (black frames behind the dome, Model.png).
  for (const s of [-1, 1]) {
    const x = s * 0.3, z = -0.34, y = domeY(x, z), top = [x + s * 0.03, y + 0.15];
    K.add('body', 'black', rod(THREE, [x, y - 0.03, z - 0.09], [top[0], top[1], z - 0.08], 0.02, 6), rod(THREE, [x, y - 0.03, z + 0.09], [top[0], top[1], z + 0.08], 0.02, 6),
      rod(THREE, [top[0], top[1], z - 0.08], [top[0], top[1], z + 0.08], 0.02, 6));
  }
  // Crash-test circles on the dome sides and back (screenshot 02).
  for (const [az, el] of [[1.7, 0.2], [-1.7, 0.2], [Math.PI, 0.25]]) { const [p, n] = domeAt(az, el); K.add('body', 'crabMark', ...crabMark(THREE, 0.085, p, n, 0.012, 0.4)); }
  // Side sockets on the lower shell (screenshot 02).
  for (const s of [-1, 1]) {
    const [p, n] = domeAt(s * 1.15, -0.2), N = V3(THREE, n).normalize();
    const g = (r0, r1, d) => new THREE.CylinderGeometry(r0, r1, d, 14).rotateX(Math.PI / 2).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), N)).translate(...V3(THREE, p).addScaledVector(N, d / 2 - 0.01).toArray());
    K.add('body', 'crabGrey', g(0.055, 0.065, 0.03));
    K.add('body', 'crabBronze', g(0.032, 0.032, 0.045));
  }

  // Core in the front notch: dark block, grey face with the icon's diamond
  // of four squares, yellow brackets above and hazard-striped corner plates.
  K.add('body', 'darkMetal', box(THREE, 0.46, 0.62, 0.3, 0, 0.62, 0.3));
  K.add('body', 'grey', box(THREE, 0.3, 0.26, 0.03, 0, 0.68, 0.455));
  K.add('body', 'yellow', ...[[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => box(THREE, 0.055, 0.055, 0.02).rotateZ(Math.PI / 4).translate(dx * 0.06, 0.68 + dy * 0.06, 0.475)),
    box(THREE, 0.5, 0.06, 0.16, 0, 0.93, 0.46), box(THREE, 0.1, 0.1, 0.12, -0.13, 0.99, 0.48), box(THREE, 0.1, 0.1, 0.12, 0.13, 0.99, 0.48));
  for (const s of [-1, 1]) {
    const a = [s * 0.24, 0.62, 0.46], b = [s * 0.165, 0.62, 0.505], hgt = 0.2;
    const [w, y] = crabStripes(THREE, (u, v) => [a[0] + (b[0] - a[0]) * u, a[1] + hgt * v, a[2] + (b[2] - a[2]) * u + 0.006], 3, 1.2, () => [s * 0.6, 0, 1]);
    K.add('body', 'hazard', w); K.add('body', 'yellow', y);
  }
  // Eye stalks: yellow, slightly splayed, a side spur, black rounded tips.
  for (const s of [-1, 1]) {
    const a = [s * 0.13, 1.0, 0.48], b = [s * 0.16, 1.27, 0.46], d = V3(THREE, b).sub(V3(THREE, a)).normalize();
    K.add('body', 'yellow', rod(THREE, a, b, 0.036, 6), rod(THREE, [s * 0.135, 1.06, 0.48], [s * 0.22, 1.02, 0.5], 0.022, 6));
    K.add('body', 'black', orient(THREE, new THREE.CapsuleGeometry(0.04, 0.12, 4, 10), d.toArray(), V3(THREE, b).addScaledVector(d, 0.065).toArray()));
  }

  // Right claw, closed: a tall faceted pod (two front facets) leaning back
  // toward a rounded top, ink over the top, a tan band and a chamfered band of
  // diagonal tan/white stripes; crash-test circles on the front and outside.
  {
    const cx = -0.46, cz = 0.52;
    const plan = [[0.22, -0.4], [-0.22, -0.4], [-0.3, -0.12], [-0.28, 0.2], [-0.14, 0.38], [0.22, 0.4]];
    const shape = new THREE.Shape(plan.map(([x, z]) => new THREE.Vector2(x, z)));
    const pod = new THREE.ExtrudeGeometry(shape, { depth: 0.46, steps: 6, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.16, bevelSegments: 4 })
      .rotateX(Math.PI / 2).translate(cx, 0.72, cz);
    const pp = pod.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const y = pp.getY(i), t = Math.min(1, Math.max(0, (y - 0.4) / 0.48)) ** 2;
      pp.setX(i, cx + 0.2 + (pp.getX(i) - cx - 0.2) * (1 - 0.2 * t));
      pp.setZ(i, cz - 0.4 + (pp.getZ(i) - cz + 0.4) * (1 - 0.4 * t));
    }
    pod.computeVertexNormals();
    const hit = (from, dir) => {
      const h = new THREE.Raycaster(V3(THREE, from), V3(THREE, dir).normalize()).intersectObject(new THREE.Mesh(pod, new THREE.MeshBasicMaterial()))[0];
      return [h.point.toArray(), h.face.normal.toArray()];
    };
    const marks = [hit([cx + 0.06, 0.56, 2], [0, 0, -1]), hit([cx - 2, 0.56, cz + 0.06], [1, 0, 0.12])];
    const [pi, py] = crabSplit(THREE, pod, (x, y, z) => y > 0.74 + 0.06 * crabJag(Math.atan2(x - cx, z - cz) * 1.3));
    K.add('clawR', 'ink', pi); K.add('clawR', 'yellow', py);
    const scaled = (k) => plan.map(([x, z]) => [x * k, z * k]);
    const prism = (k, y0, y1) => new THREE.ExtrudeGeometry(new THREE.Shape(scaled(k).map(([x, z]) => new THREE.Vector2(x, z))), { depth: y1 - y0, bevelEnabled: false })
      .rotateX(Math.PI / 2).translate(cx, y1, cz);
    K.add('clawR', 'crabTan', prism(1.15, 0.13, 0.26));
    const band = (u, v) => { const k = 0.92 + 0.22 * v, [x, z] = crabLoop(plan, u); return [cx + x * k, 0.02 + 0.11 * v, cz + z * k]; };
    const [st, sw] = crabStripes(THREE, band, 26, 0.9, (m) => [m[0] - cx, -0.5, m[2] - cz], null, 2, 3);
    K.add('clawR', 'crabTan', st); K.add('clawR', 'hazard', sw);
    K.add('clawR', 'darkMetal', prism(0.92, 0.015, 0.03), box(THREE, 0.14, 0.16, 0.24, -0.2, 0.6, 0.2));
    K.add('clawR', 'crabMark', ...marks.flatMap(([p, n], i) => crabMark(THREE, i ? 0.085 : 0.1, p, n, 0.004, 0.3)));
  }
  // Left claw, open: crescent shell (ink outside, grey inside, striped hook)
  // round a three-barrel bronze gun with red muzzle rings, on a grey arm.
  {
    const G = [0.48, 0.5, 0.6];
    K.pivot('clawL', [0.3, 0.55, 0.3]);
    const barrels = [], rims = [], holes = [];
    for (const a of [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6]) {
      const x = G[0] + Math.cos(a) * 0.085, y = G[1] + Math.sin(a) * 0.085;
      barrels.push(cylZ(THREE, 0.066, 0.5, 0.9, 12).translate(x, y, 0));
      rims.push(new THREE.TorusGeometry(0.066, 0.015, 6, 16).translate(x, y, 0.895));
      holes.push(new THREE.CircleGeometry(0.042, 12).translate(x, y, 0.907));
    }
    K.add('clawL', 'crabBronze', ...barrels, cylZ(THREE, 0.035, 0.45, 0.93, 8).translate(G[0], G[1], 0));
    K.add('clawL', 'red', ...rims);
    K.add('clawL', 'hole', ...holes);
    K.add('clawL', 'crabGrey', cylZ(THREE, 0.19, 0.36, 0.5, 16).translate(G[0], G[1], 0), rod(THREE, [0.24, 0.54, 0.22], [0.46, 0.5, 0.36], 0.085, 8),
      sphere(THREE, 0.1, 0.24, 0.54, 0.22, 1, 1, 1, 12, 8), box(THREE, 0.38, 0.1, 0.14, 0.65, G[1], 0.4),
      rod(THREE, [0.46, 0.67, 0.38], [0.34, 0.83, 0.24], 0.04, 8), box(THREE, 0.12, 0.06, 0.32, G[0] - 0.04, 0.19, 0.64));
    K.add('clawL', 'chrome', rod(THREE, [0.34, 0.83, 0.24], [0.31, 0.87, 0.2], 0.045, 8));
    K.add('clawL', 'darkMetal', ring(THREE, 0.19, 0.016, 0).rotateX(Math.PI / 2).translate(G[0], G[1], 0.5),
      ...[0, 1, 2, 3, 4].map(i => box(THREE, 0.065, 0.065, 0.065).rotateX(Math.PI / 4).translate(G[0] - 0.04, 0.23, 0.51 + i * 0.065)));
    // Crescent in the plate's (u = z, v = y) plane about the gun, mouth forward.
    const cres = (s) => {
      const p = [], R0 = 0.47 * s, R1 = 0.33 * s, d = Math.PI / 180;
      for (let a = 68; a <= 300; a += 8) p.push([Math.cos(a * d) * R0, Math.sin(a * d) * R0]);
      p.push([Math.cos(326 * d) * 0.43 * s, Math.sin(326 * d) * 0.43 * s]);
      for (let a = 302; a >= 84; a -= 10) p.push([Math.cos(a * d) * R1, Math.sin(a * d) * R1]);
      return new THREE.Shape(p.map(([u, v]) => new THREE.Vector2(u, v)));
    };
    const plate = (s, depth, x) => new THREE.ExtrudeGeometry(cres(s), { depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 })
      .rotateY(-Math.PI / 2).translate(x, G[1], G[2]);
    K.add('clawL', 'ink', plate(1, 0.08, 0.88));
    K.add('clawL', 'crabGrey', plate(0.96, 0.03, 0.795));
    // White stripes across the hook tip on the outer face (Model.png).
    const tipS = crabSoup();
    for (const [a0, a1] of [[262, 271], [282, 291], [302, 311]]) {
      const P = (a, r) => [0.895, G[1] + Math.sin(a * Math.PI / 180) * r, G[2] + Math.cos(a * Math.PI / 180) * r];
      tipS.quad(P(a0, 0.33), P(a1, 0.33), P(a1 + 5, 0.47), P(a0 + 5, 0.47), [1, 0, 0]);
    }
    K.add('clawL', 'hazard', tipS.geo(THREE));
    K.add('clawL', 'crabMark', ...crabMark(THREE, 0.085, [0.893, G[1] + 0.27, G[2] - 0.24], [1, 0, 0], 0.004, 0.3));
  }

  // Legs: three a side splayed back from the body centre; grey hip and knee,
  // long curved yellow blades with white diagonal stripes, tips on the ground.
  [-0.3, -0.75, -1.2].forEach((phi, i) => {
    for (const s of [-1, 1]) {
      const name = `leg${s < 0 ? 'R' : 'L'}${i}`, dir = [s * Math.cos(phi), 0, Math.sin(phi)], W = [-Math.sin(phi), 0, s * Math.cos(phi)];
      const P = (r, y) => [dir[0] * r, y, -0.04 + dir[2] * r];
      K.pivot(name, P(0.46, 0.48));
      K.add(name, 'darkMetal', rod(THREE, P(0.4, 0.48), P(0.56, 0.5), 0.065, 10));
      K.add(name, 'crabGrey', rod(THREE, P(0.5, 0.49), P(0.76, 0.7), 0.05, 8), sphere(THREE, 0.075, ...P(0.77, 0.72), 1, 1, 1, 10, 8), box(THREE, 0.12, 0.08, 0.08, ...P(0.56, 0.53)));
      const b = crabBlade(THREE, [P(0.76, 0.8), P(0.92, 0.74), P(1.01, 0.5), P(0.99, 0.24), P(0.9, 0.04)], W, (u) => 0.16 * (1 - 0.75 * u * u) + 0.02, 0.05);
      K.add(name, 'yellow', b.geo);
      for (const side of [-1, 1]) {
        const [w] = crabStripes(THREE, (u, v) => b.face(side)(0.2 + 0.68 * u, v), 4, 0.8, () => b.normalAt(0.5).map(c => c * side), null, 2, 3);
        K.add(name, 'hazard', w);
      }
    }
  });
  return K.finish(THREE);
}

// Ball form (Model.png, screenshot 01): a faceted yellow ball with a visor
// slot near the top (the folded yellow eye tips inside), crash-test circles
// either side, a tan "smile" band dipping to a V and diagonal white/yellow
// stripes below it; team ink splashed over the back with a blocky edge.
function crabBall(THREE) {
  const K = kit(), R = 0.75;
  const shell = new THREE.IcosahedronGeometry(R, 2);
  shell.computeVertexNormals();
  const [ink, yellow] = crabSplit(THREE, shell, (x, y, z) => (-z * 0.9 - y * 0.35) / R > 0.42 + 0.14 * crabJag(Math.atan2(x, y), 12));
  K.add('body', 'ink', ink); K.add('body', 'yellow', yellow);
  const onS = (az, el, r = R * 1.006) => [r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az)];
  const radial = (p) => { const l = Math.hypot(...p); return [p[0] / l, p[1] / l, p[2] / l]; };
  // Visor slot: a wide dark band on the sphere with a yellow lip, the folded
  // yellow eye tips and a grey block inside.
  const el = 0.55, patch = (r, hw, hh) => new THREE.SphereGeometry(r, 16, 3, Math.PI / 2 - hw, 2 * hw, Math.PI / 2 - el - hh, 2 * hh);
  K.add('body', 'yellow', patch(R * 1.012, 0.6, 0.14));
  K.add('body', 'black', patch(R * 1.018, 0.53, 0.085));
  const rot = (g) => g.rotateX(-el), at = (d) => onS(0, el, d);
  K.add('body', 'yellow', ...[-1, 1].map(s => rot(box(THREE, 0.07, 0.08, 0.05, s * 0.1, 0, 0)).translate(...at(R * 1.01))));
  K.add('body', 'darkMetal', rot(box(THREE, 0.08, 0.07, 0.04)).translate(...at(R * 1.01)));
  // Crash-test circles either side of the slot.
  for (const s of [-1, 1]) { const p = onS(s * 0.6, 0.2, R); K.add('body', 'crabMark', ...crabMark(THREE, 0.08, p, radial(p), 0.025, 0.35)); }
  // Smile band dipping to a V, and stripes below it to the bottom.
  const top = (u) => { const a = (u - 0.5) * 3.2; return [a, -0.04 - 0.46 * Math.max(0, 1 - Math.abs(a) / 1.1)]; };
  const strip = (v0, v1) => (u, v) => { const [a, e] = top(u); return onS(a, e - v0 - (v1 - v0) * (1 - v)); };
  const [tan] = crabStripes(THREE, strip(0, 0.15), 1, 0, (m) => m, radial, 2, 24);
  K.add('body', 'crabTan', tan);
  // Stripes slant toward the V from both sides (Model.png).
  for (const h of [0, 1]) {
    const f = strip(0.15, 0.7), [w, y] = crabStripes(THREE, (u, v) => f(h * 0.5 + u * 0.5, v), 8, h ? -1.6 : 1.6, (m) => m, radial, 4, 3);
    K.add('body', 'hazard', w); K.add('body', 'yellow', y);
  }
  return K.finish(THREE);
}

// ---- Reefslider ----------------------------------------------------------------
// S3 Model render, Promotional 3D Render and the model turntable (24 frames,
// pure side, front and back read off). An inflatable team-ink shark, about
// 3.4x as long as it is tall: a fat rounded body (widest behind the head, a
// slightly flat belly), a pale belly and lower jaw, a thick swept-back dorsal
// over the gills, a fat crescent tail, broad drooping pectorals and small
// pelvic fins with black tips, a black snout tip. Face: angry red/white eyes
// with a pointed black lid, three gill slashes, a wide grin of red gums and
// white teeth. A periwinkle muzzle cage (tilted rear hoop, front ring with a
// cross, top/side/lower bars, side arms to lilac straps) covers the snout;
// the straps run up to two black grab handles on the upper flanks. An orange
// saddle with an upturned rear sits on two teal cords; two pale ink bottles a
// side with flower caps (cap forward-up-out, hex nozzle back-down) are
// strapped to the rear flanks with pale-blue harness bands. Nose +Z.
registerFinish('sharkBelly', 0xe4eef2, { roughness: 0.3, metalness: 0 });
registerFinish('cageBlue', 0x5a62d6, { roughness: 0.42, metalness: 0.05 });
registerFinish('lilac', 0xcac6e8, { roughness: 0.6, metalness: 0 });
registerFinish('harnessBlue', 0x9fc0f2, { roughness: 0.45, metalness: 0 });
registerInkFinish('inkPale', { roughness: 0.3, metalness: 0, emissive: 0.32 });
function reefShark(THREE) {
  const K = kit();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const geo = (pos, idx) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (idx) g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  // Grid surface: f(i, j) -> [x, y, z]; quads go to pick(i, j) (finish name).
  // Each triangle is wound to face away from ref(p) (the body axis, or the
  // mid-plane of a fin), so mapped decals and both fin skins face outward.
  const axisRef = (p) => { const z = Math.max(-0.66, Math.min(0.74, p[2])); return [0, sec(z).cy, z]; };
  const grid = (nu, nv, f, pick = () => 'a', ref = axisRef) => {
    const P = [], W = nu + 1;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) P.push(V(...f(i, j)));
    const at = (i, j) => P[j * W + i];
    let wrap = true;
    for (let j = 0; j <= nv; j++) if (at(0, j).distanceTo(at(nu, j)) > 1e-6) { wrap = false; break; }
    // Smooth normals from grid differences, turned away from ref.
    const Nn = P.map((p, q) => {
      const i = q % W, j = Math.floor(q / W);
      const iu = wrap && (i === 0 || i === nu) ? [nu - 1, 1] : [Math.max(0, i - 1), Math.min(nu, i + 1)];
      const du = at(iu[1], j).clone().sub(at(iu[0], j)), dv = at(i, Math.min(nv, j + 1)).clone().sub(at(i, Math.max(0, j - 1)));
      let n = du.cross(dv);
      const r = V(...ref(p.toArray())), away = p.clone().sub(r);
      if (n.lengthSq() < 1e-14) n = away.clone();
      n.normalize();
      return n.dot(away) < 0 ? n.negate() : n;
    });
    const out = {};
    const put = (L, a, b, c) => {
      const n = at(...b).clone().sub(at(...a)).cross(at(...c).clone().sub(at(...a))), m = at(...a).clone().add(at(...b)).add(at(...c)).divideScalar(3);
      const r = V(...ref(m.toArray())), tri = n.dot(m.sub(r)) < 0 ? [a, c, b] : [a, b, c];
      for (const t of tri) { L.p.push(...at(...t).toArray()); L.n.push(...Nn[t[1] * W + t[0]].toArray()); }
    };
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = pick(i, j), L = out[k] || (out[k] = { p: [], n: [] });
      put(L, [i, j], [i + 1, j], [i, j + 1]); put(L, [i + 1, j], [i + 1, j + 1], [i, j + 1]);
    }
    for (const k in out) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(out[k].p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(out[k].n, 3));
      out[k] = g;
    }
    return out;
  };

  // Body: superellipse sections (z, top, bottom, half width), flatter below,
  // rounded caps at the snout and the tail stalk.
  const ST = [[0.80, 0.375, 0.065, 0.17], [0.72, 0.435, 0.038, 0.232], [0.62, 0.497, 0.024, 0.278], [0.48, 0.54, 0.018, 0.306],
    [0.30, 0.56, 0.016, 0.318], [0.10, 0.556, 0.02, 0.312], [-0.10, 0.535, 0.026, 0.292], [-0.30, 0.5, 0.042, 0.252],
    [-0.48, 0.462, 0.075, 0.195], [-0.62, 0.43, 0.115, 0.14], [-0.70, 0.41, 0.14, 0.11]];
  const NOSE = 0.1, TAILC = 0.07;
  const cr = (z, k) => {   // Catmull-Rom through the stations (z descending)
    let i = 0;
    while (i < ST.length - 2 && z < ST[i + 1][0]) i++;
    const p0 = ST[Math.max(0, i - 1)][k], p1 = ST[i][k], p2 = ST[i + 1][k], p3 = ST[Math.min(ST.length - 1, i + 2)][k];
    const t = (ST[i][0] - z) / (ST[i][0] - ST[i + 1][0]);
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  };
  const sec = (z) => {
    let zz = z, f = 1, tipCy = null;
    if (z > ST[0][0]) { f = Math.cos(Math.asin(Math.min(1, (z - ST[0][0]) / NOSE))); zz = ST[0][0]; tipCy = 0.215; }
    const zl = ST[ST.length - 1][0];
    if (z < zl) { f = Math.cos(Math.asin(Math.min(1, (zl - z) / TAILC))); zz = zl; tipCy = 0.28; }
    const top = cr(zz, 1), bot = cr(zz, 2), hw = cr(zz, 3);
    let cy = (top + bot) / 2;
    if (tipCy != null) cy = tipCy + (cy - tipCy) * f;
    return { cy, hh: (top - bot) / 2 * f, hw: hw * f };
  };
  const pexp = (c) => (c >= 0 ? 2.15 : 2.15 + 0.9 * -c);
  const surf = (z, th) => {
    const s = sec(z), c = Math.cos(th), sn = Math.sin(th), p = pexp(c);
    return [s.hw * Math.sign(sn) * Math.abs(sn) ** (2 / p), s.cy + s.hh * Math.sign(c) * Math.abs(c) ** (2 / p), z];
  };
  const nrm = (z, th) => {
    const e = 1e-3, a = V(...surf(z, th)), dz = V(...surf(z - e, th)).sub(a), dt = V(...surf(z, th + e)).sub(a);
    const n = dt.cross(dz).normalize();
    return n.lengthSq() ? n : V(0, 0, 1);
  };
  const on = (z, th, off) => { const n = nrm(z, th); return V(...surf(z, th)).addScaledVector(n, off); };
  // Angle of the surface point at height y on the +x side of section z.
  const thAt = (z, y) => {
    const s = sec(z), v = Math.max(-0.999, Math.min(0.999, (y - s.cy) / Math.max(1e-6, s.hh)));
    let th = Math.PI / 2;
    for (let k = 0; k < 6; k++) { const p = pexp(Math.cos(th)); th = Math.acos(Math.sign(v) * Math.abs(v) ** (p / 2)); }
    return th;
  };
  // Side decal point: (z, y) on the body, side s, raised by off.
  const dp = (z, y, s, off) => { const p = on(z, thAt(z, y), off); return [p.x * s, p.y, p.z]; };
  const decal = (nu, nv, f, s, off, fin) => {   // f(u, w) -> [z, y]
    const g = grid(nu, nv, (i, j) => { const [z, y] = f(i / nu, j / nv); return dp(z, y, s, off); }, () => fin);
    K.add('body', fin, g[fin]);
  };
  const tri = (pts, s, off) => geo(s > 0 ? pts.flatMap(([z, y]) => dp(z, y, s, off)) : [pts[0], pts[2], pts[1]].flatMap(([z, y]) => dp(z, y, s, off)));

  // Rows: dense in the caps, belly split at a waterline.
  const zs = [];
  for (let k = 6; k >= 1; k--) zs.push(ST[0][0] + NOSE * Math.sin(k / 6 * Math.PI / 2) * 0.999);
  for (let k = 0; k <= 22; k++) zs.push(ST[0][0] + (ST[ST.length - 1][0] - ST[0][0]) * k / 22);
  for (let k = 1; k <= 4; k++) zs.push(ST[ST.length - 1][0] - TAILC * Math.sin(k / 4 * Math.PI / 2) * 0.999);
  const belly = (z) => 0.085 + 0.09 * Math.max(0, z - 0.3) ** 1.3 + 0.2 * Math.max(0, -0.2 - z) ** 1.4;
  const NA = 32, ang = (j, i) => {
    const z = zs[j], tb = thAt(z, belly(z)), u = i / NA;
    return u <= 0.5 ? -tb + (2 * tb) * (u / 0.5) : tb + (2 * Math.PI - 2 * tb) * ((u - 0.5) / 0.5);
  };
  const bodyG = grid(NA, zs.length - 1, (i, j) => surf(zs[j], ang(j, i)), (i) => (i < NA / 2 ? 'inkGloss' : 'sharkBelly'));
  K.add('body', 'inkGloss', bodyG.inkGloss);
  K.add('body', 'sharkBelly', bodyG.sharkBelly);
  // Black snout tip (seen through the cage's top window).
  K.add('body', 'inkDark', grid(16, 4, (i, j) => { const th = -1.1 + 2.2 * i / 16, z = 0.84 + 0.059 * j / 4; return on(z, th, 0.002).toArray(); }, () => 'b').b);

  // Inflated fin ("pillow"): outline [[u, v]] round centre c in the plane
  // O + uU + vV, thickness tc at the centre to tEdge(u, v) toward the rim.
  const pillow = (outline, c, tc, tEdge, O, U, Vv, pick) => {
    const N = U.clone().cross(Vv).normalize(), R = 4, n = outline.length, C = O.clone().addScaledVector(U, c[0]).addScaledVector(Vv, c[1]);
    const out = {};
    for (const side of [1, -1]) {
      const g = grid(n, R, (i, k) => {
        const [pu, pv] = outline[i % n], t = Math.sin(k / R * Math.PI / 2);
        const u = c[0] + (pu - c[0]) * t, v = c[1] + (pv - c[1]) * t;
        const th = (tc + (tEdge(pu, pv) - tc) * t) * Math.sqrt(Math.max(0, 1 - t * t)) * side / 2;
        return O.clone().addScaledVector(U, u).addScaledVector(Vv, v).addScaledVector(N, th).toArray();
      }, (i, k) => pick(outline[i % n], outline[(i + 1) % n], k, side), () => C.clone().addScaledVector(N, -0.02 * side).toArray());
      for (const f in g) (out[f] || (out[f] = [])).push(g[f]);
    }
    for (const f in out) K.add('body', f, ...out[f]);
  };
  const ring2 = (pts, n = 40) => {   // smooth closed outline
    const c3 = new THREE.CatmullRomCurve3(pts.map(([a, b]) => V(a, b, 0)), true, 'centripetal');
    return c3.getSpacedPoints(n).slice(0, n).map(p => [p.x, p.y]);
  };
  const Y = V(0, 1, 0), Z = V(0, 0, 1);
  // Dorsal: long sloped leading edge, tip over the rear, concave trailing edge.
  pillow(ring2([[0.5, 0.5], [0.44, 0.6], [0.36, 0.69], [0.29, 0.75], [0.235, 0.77], [0.2, 0.735], [0.185, 0.65], [0.165, 0.56], [0.15, 0.49], [0.33, 0.47]], 28),
    [0.31, 0.57], 0.17, (u, v) => 0.17 - 0.1 * Math.min(1, Math.max(0, (v - 0.55) / 0.2)), V(0, 0, 0), Z, Y,
    (a) => (a[1] > 0.69 ? 'inkDark' : 'inkGloss'));
  // Tail: two fat lobes off a thick stalk.
  const tailT = (u, v) => 0.2 - 0.12 * Math.min(1, Math.max(0, (-0.66 - u) / 0.3));
  pillow(ring2([[-0.6, 0.41], [-0.72, 0.43], [-0.84, 0.47], [-0.93, 0.515], [-0.975, 0.51], [-0.96, 0.46], [-0.9, 0.39], [-0.84, 0.31], [-0.75, 0.26], [-0.62, 0.29]], 24),
    [-0.73, 0.35], 0.21, tailT, V(0, 0, 0), Z, Y, (a) => (a[0] < -0.88 ? 'inkDark' : 'inkGloss'));
  pillow(ring2([[-0.64, 0.3], [-0.76, 0.27], [-0.83, 0.22], [-0.9, 0.13], [-0.945, 0.06], [-0.92, 0.035], [-0.85, 0.06], [-0.76, 0.12], [-0.64, 0.17]], 22),
    [-0.73, 0.2], 0.2, tailT, V(0, 0, 0), Z, Y, (a) => (a[0] < -0.87 ? 'inkDark' : 'inkGloss'));
  // Pectorals: broad, drooping ~14 deg, rounded black tips, pale underside.
  const pecO = [[-0.02, -0.2], [0.14, -0.17], [0.3, -0.13], [0.42, -0.09], [0.48, -0.03], [0.47, 0.04], [0.41, 0.08], [0.28, 0.11], [0.12, 0.16], [-0.02, 0.2]];
  for (const s of [1, -1]) {
    const U = V(s * Math.cos(0.25), -Math.sin(0.25), -0.12).normalize(), Vv = Z.clone().sub(U.clone().multiplyScalar(U.dot(Z))).normalize();
    const up = U.clone().cross(Vv).y > 0 ? 1 : -1;
    pillow(ring2(pecO, 28), [0.16, 0.0], 0.11, (u) => 0.11 - 0.065 * Math.min(1, u / 0.48), V(s * 0.2, 0.16, 0.34), U, Vv,
      (a, b, k, side) => ((a[0] + b[0]) / 2 > 0.38 ? 'black' : side === up ? 'inkGloss' : 'sharkBelly'));
  }
  // Pelvics: small, out-back-down, black tips.
  for (const s of [1, -1]) {
    const U = V(s * 0.75, -0.3, -0.6).normalize(), Vv = Z.clone().sub(U.clone().multiplyScalar(U.dot(Z))).normalize();
    pillow(ring2([[-0.02, -0.08], [0.1, -0.07], [0.19, -0.05], [0.21, 0.0], [0.15, 0.03], [0.06, 0.07], [-0.02, 0.08]], 14), [0.07, 0], 0.07,
      (u) => 0.07 - 0.04 * Math.min(1, u / 0.2), V(s * 0.13, 0.1, -0.42), U, Vv, (a, b) => ((a[0] + b[0]) / 2 > 0.13 ? 'black' : 'inkGloss'));
  }

  // Face decals, both sides.
  for (const s of [1, -1]) {
    // Eye: pointed black lid toward the front-top, white ring, red iris, pupil.
    const ez = 0.615, ey = 0.36;
    decal(20, 1, (u, w) => { const a = u * TAU, r = 0.062 * w, pt = Math.max(0, Math.cos(a - 0.75)) ** 6 * 0.035 * w; return [ez + Math.sin(a) * (r + pt), ey + Math.cos(a) * (r + pt) * 0.95]; }, s, 0.004, 'black');
    decal(20, 1, (u, w) => { const a = u * TAU, r = 0.05 * w; return [ez + Math.sin(a) * r, ey - 0.003 + Math.cos(a) * r * 0.95]; }, s, 0.007, 'white');
    decal(18, 1, (u, w) => { const a = u * TAU, r = 0.032 * w; return [ez + Math.sin(a) * r, ey - 0.003 + Math.cos(a) * r * 0.95]; }, s, 0.01, 'red');
    decal(10, 1, (u, w) => { const a = u * TAU, r = 0.01 * w; return [ez + Math.sin(a) * r, ey - 0.003 + Math.cos(a) * r]; }, s, 0.013, 'black');
    // Three gill slashes bowing to the rear.
    for (let k = 0; k < 3; k++) {
      const z0 = 0.47 - k * 0.045, y0 = 0.425 - k * 0.012;
      decal(10, 1, (u, w) => { const a = u, z = z0 - 0.09 * a + 0.028 * Math.sin(a * Math.PI) - 0.02 * a, y = y0 - 0.1 * a, h = 0.017 * Math.sin(Math.min(1, a * 1.15) * Math.PI) + 0.003; return [z + (w - 0.5) * h * 1.6, y + (w - 0.5) * h * 0.4]; }, s, 0.004, 'black');
    }
    // Grin: black lips, red gums, white teeth, a dark centre line.
    const U = [[0.42, 0.322], [0.5, 0.29], [0.6, 0.256], [0.7, 0.234], [0.8, 0.22]];
    const L = [[0.42, 0.322], [0.5, 0.222], [0.6, 0.152], [0.7, 0.112], [0.8, 0.096]];
    const at = (P, u) => { const x = u * (P.length - 1), i = Math.min(P.length - 2, Math.floor(x)), t = x - i; return [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t]; };
    decal(20, 3, (u, w) => { const a = at(U, u), b = at(L, u), g = 0.012 * Math.min(1, u * 6 + 0.3); return [b[0] + (a[0] - b[0]) * w, b[1] - g + (a[1] - b[1] + 2 * g) * w]; }, s, 0.004, 'black');
    decal(20, 3, (u, w) => { const a = at(U, u), b = at(L, u); return [b[0] + (a[0] - b[0]) * w, b[1] + (a[1] - b[1]) * w]; }, s, 0.007, 'red');
    decal(20, 1, (u, w) => { const a = at(U, u), b = at(L, u), m = 0.45 + 0.1 * w; return [b[0] + (a[0] - b[0]) * m, b[1] + (a[1] - b[1]) * m]; }, s, 0.0095, 'black');
    const teeth = [];
    for (let k = 0; k < 6; k++) {   // upper saw, pointing down
      const u0 = 0.1 + k * 0.15, u1 = u0 + 0.15, a = at(U, u0), b = at(U, u1), m = at(L, (u0 + u1) / 2), h = 0.62;
      teeth.push(tri([a, b, [(a[0] + b[0]) / 2 + (m[0] - (a[0] + b[0]) / 2) * h, (a[1] + b[1]) / 2 + (m[1] - (a[1] + b[1]) / 2) * h]], s, 0.011));
    }
    for (let k = 0; k < 5; k++) {   // lower saw, pointing up
      const u0 = 0.175 + k * 0.15, u1 = u0 + 0.15, a = at(L, u0), b = at(L, u1), m = at(U, (u0 + u1) / 2), h = 0.5;
      teeth.push(tri([b, a, [(a[0] + b[0]) / 2 + (m[0] - (a[0] + b[0]) / 2) * h, (a[1] + b[1]) / 2 + (m[1] - (a[1] + b[1]) / 2) * h]], s, 0.011));
    }
    K.add('body', 'white', ...teeth);
  }

  // Ribbon (rectangular section) along points with outward normals.
  const ribbon = (pts, nrms, w, t, closed = false) => {
    const n = pts.length, P = [], idx = [];
    for (let i = 0; i < n; i++) {
      const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const T = b.clone().sub(a).normalize(), B = nrms[i].clone().cross(T).normalize(), Nn = T.clone().cross(B).normalize();
      for (const [sb, sn] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.push(pts[i].clone().addScaledVector(B, sb * w / 2).addScaledVector(Nn, sn * t / 2));
    }
    const pos = [], q = (a, b, c, d) => pos.push(...P[a].toArray(), ...P[b].toArray(), ...P[c].toArray(), ...P[a].toArray(), ...P[c].toArray(), ...P[d].toArray());
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = i * 4, b = ((i + 1) % n) * 4;
      for (let k = 0; k < 4; k++) { const k1 = (k + 1) % 4; q(a + k, a + k1, b + k1, b + k); }
    }
    if (!closed) { q(3, 2, 1, 0); const e = (n - 1) * 4; q(e, e + 1, e + 2, e + 3); }
    return geo(pos);
  };

  // Muzzle cage: shell between a tilted rear hoop hugging the head and a
  // front ring round the snout tip, bulging outward on top.
  const rear = (ph) => on(0.665 + 0.07 * Math.cos(ph), ph, 0.022 - 0.008 * Math.max(0, -Math.cos(ph)));
  const front = (ph) => V(0.138 * Math.sin(ph), 0.205 + 0.138 * Math.cos(ph), 0.885 - 0.03 * Math.cos(ph));
  const shell = (sv, ph) => {
    const a = rear(ph), b = front(ph), p = a.clone().lerp(b, sv), out = V(p.x, p.y - 0.2, 0).normalize();
    return p.addScaledVector(out, 0.022 * Math.sin(Math.PI * sv) * (0.55 + 0.45 * Math.cos(ph)));
  };
  const shellN = (sv, ph) => {
    const e = 1e-3, s0 = Math.min(sv, 1 - e), p = shell(s0, ph), n = shell(s0, ph + e).sub(p).cross(shell(s0 + e, ph).sub(p)).normalize();
    return n.dot(V(p.x, p.y - 0.2, 0.3)) < 0 ? n.negate() : n;
  };
  const cage = [];
  const loop = (sv, w, t, n = 36) => { const ph = Array.from({ length: n }, (_, i) => i / n * TAU); cage.push(ribbon(ph.map(p => shell(sv, p)), ph.map(p => shellN(sv, p)), w, t, true)); };
  loop(0, 0.078, 0.032);
  // Front ring: a short thick band round the snout tip (width along +Z).
  { const ph = Array.from({ length: 36 }, (_, i) => i / 36 * TAU); cage.push(ribbon(ph.map(p => front(p).add(V(0, 0, -0.012))), ph.map(p => V(Math.sin(p), Math.cos(p), 0)), 0.085, 0.036, true)); }
  for (const ph of [0, 1.62, -1.62, 2.55, -2.55]) {
    const sv = Array.from({ length: 12 }, (_, i) => i / 11);
    cage.push(ribbon(sv.map(v => shell(v, ph)), sv.map(v => shellN(v, ph)), ph ? 0.066 : 0.06, 0.03));
  }
  // Front cross inside the ring.
  const fc = (a, b) => { const P = [], Nn = []; for (let i = 0; i <= 8; i++) { const t = i / 8, p = a.clone().lerp(b, t); p.z += 0.018 * Math.sin(Math.PI * t); P.push(p); Nn.push(V(0, 0, 1)); } cage.push(ribbon(P, Nn, 0.05, 0.028)); };
  fc(front(Math.PI / 2), front(-Math.PI / 2)); fc(front(0), front(Math.PI));
  // Side arms back to the strap buckles; lilac straps up to the grab handles.
  const lilac = [];
  for (const s of [1, -1]) {
    const P = [], Nn = [];
    for (let i = 0; i <= 6; i++) { const z = 0.66 - 0.15 * i / 6, th = s * thAt(z, 0.262), p = on(z, th, 0.028); P.push(p); Nn.push(nrm(z, th)); }
    P.unshift(shell(0.06, s * 1.62)); Nn.unshift(shellN(0.06, s * 1.62));
    cage.push(ribbon(P, Nn, 0.07, 0.03));
    const bz = 0.51, bth = s * thAt(bz, 0.262);
    lilac.push(ribbon([on(bz + 0.025, bth, 0.04), on(bz - 0.025, bth, 0.04)], [nrm(bz, bth), nrm(bz, bth)], 0.04, 0.012));
    const SP = [], SN = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, z = 0.515 - 0.195 * t, y = 0.262 + (0.47 - 0.262) * t, th = s * thAt(z, y); SP.push(on(z, th, 0.018)); SN.push(nrm(z, th)); }
    lilac.push(ribbon(SP, SN, 0.034, 0.008));
    // Black grab handle with a slot, on the upper flank.
    const hz = 0.245, hth = s * thAt(hz, 0.47), hp = on(hz, hth, 0.02), hn = nrm(hz, hth);
    const hb = new THREE.Matrix4().makeBasis(Z.clone().cross(hn).normalize(), hn, Z.clone().sub(hn.clone().multiplyScalar(hn.z)).normalize());
    hb.setPosition(hp);
    K.add('body', 'black', softBox(THREE, 0.075, 0.045, 0.19, 0.4, 4).applyMatrix4(hb));
    K.add('body', 'hole', box(THREE, 0.03, 0.01, 0.11, 0, 0.022, -0.01).applyMatrix4(hb));
  }
  K.add('body', 'cageBlue', ...cage);
  K.add('body', 'lilac', ...lilac);

  // Teal cords round the body under the saddle, with zip-tie knobs.
  const cords = [], knobs = [];
  for (const [z0, dz] of [[-0.02, -0.1], [-0.25, -0.01]]) {
    const P = [];
    for (let i = 0; i < 36; i++) { const th = i / 36 * TAU; P.push(on(z0 + dz * Math.cos(th), th, 0.012).toArray()); }
    cords.push(tube(THREE, P, 0.011, 44, 4, true));
    for (const s of [1, -1]) { const th = s * 1.05, p = on(z0 + dz * Math.cos(th), th, 0.018); knobs.push(box(THREE, 0.022, 0.03, 0.022, p.x, p.y, p.z)); }
  }
  K.add('body', 'teal', ...cords, ...knobs);
  // Orange saddle on the back, rear end turned up.
  {
    const P = [], Nn = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, z = -0.09 - 0.43 * t, top = surf(z, 0)[1], lift = 0.004 + 0.09 * Math.max(0, (t - 0.72) / 0.28) ** 1.7;
      P.push(V(0, top + lift, z)); Nn.push(V(0, 1, 0.9 * Math.max(0, (t - 0.72) / 0.28)).normalize());
    }
    K.add('body', 'orange', ribbon(P, Nn, 0.2, 0.028));
    K.add('body', 'orange', ...[0, 1, 2].map(k => box(THREE, 0.02, 0.03, 0.03, (k - 1) * 0.07, surf(-0.12, 0)[1] + 0.01, -0.1)));
  }
  // Bottles: pale ink bodies, team-ink flower caps forward-up-out, white hex
  // nozzles back-down, pale-blue harness bands round each pair.
  const harness = [], nozzles = [], holes = [], caps = [], bottles = [];
  // Five-lobed flower cap (extruded along +Y, bevelled).
  const fl = new THREE.Shape();
  for (let i = 0; i <= 30; i++) { const a = i / 30 * TAU, r = 0.058 + 0.014 * Math.cos(5 * a); fl[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
  const flower = new THREE.ExtrudeGeometry(fl, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 1, curveSegments: 4 }).rotateX(-Math.PI / 2);
  for (const s of [1, -1]) {
    const pair = [[V(s * 0.42, 0.235, -0.13), V(s * 0.29, 0.06, -0.45)], [V(s * 0.35, 0.26, -0.23), V(s * 0.22, 0.075, -0.53)]];
    for (const [cap, base] of pair) {
      const d = cap.clone().sub(base).normalize(), len = cap.distanceTo(base);
      bottles.push(orient(THREE, latheY(THREE, [[0.03, 0], [0.058, 0.01], [0.064, 0.04], [0.064, len - 0.07], [0.058, len - 0.04]], 16), d.toArray(), base.toArray()));
      caps.push(orient(THREE, flower.clone(), d.toArray(), base.clone().addScaledVector(d, len - 0.055).toArray()));
      nozzles.push(orient(THREE, new THREE.CylinderGeometry(0.03, 0.03, 0.045, 6).translate(0, -0.02, 0), d.toArray(), base.toArray()));
      holes.push(orient(THREE, new THREE.CylinderGeometry(0.014, 0.014, 0.004, 8).translate(0, -0.043, 0), d.toArray(), base.toArray()));
    }
    // Bands: stadium loop round both bottle axes at two heights.
    for (const t of [0.3, 0.68]) {
      const [[c1, b1], [c2, b2]] = pair, d = c1.clone().sub(b1).normalize();
      const A = b1.clone().lerp(c1, t), B = b2.clone().lerp(c2, t), ax = B.clone().sub(A), ex = ax.clone().sub(d.clone().multiplyScalar(ax.dot(d))).normalize(), ey = d.clone().cross(ex).normalize();
      const P = [], Nn = [], r = 0.072;
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * TAU, cen = Math.cos(a) >= 0 ? B : A, dir = ex.clone().multiplyScalar(Math.cos(a)).addScaledVector(ey, Math.sin(a));
        P.push(cen.clone().addScaledVector(dir, r)); Nn.push(dir);
      }
      harness.push(ribbon(P, Nn, 0.045, 0.01, true));
    }
    // Strap from the pair up to the saddle cord.
    const Pz = [V(s * 0.37, 0.23, -0.21), V(s * 0.3, 0.37, -0.24), on(-0.25, s * 0.55, 0.012)];
    harness.push(ribbon(Pz, Pz.map(p => V(p.x, p.y - 0.25, 0).normalize()), 0.045, 0.01));
  }
  K.add('body', 'inkPale', ...bottles);
  K.add('body', 'inkGloss', ...caps);
  K.add('body', 'white', ...nozzles);
  K.add('body', 'hole', ...holes);
  K.add('body', 'harnessBlue', ...harness);
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
  // Marbled team ink, animated (S3 footage: the sheet is a flowing marble of
  // the team colour, darker and lighter bands and thin white veins). Linear colour
  // in, the renderer's colour-space chunks out.
  const base = new THREE.Color(color);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: base }, uTime: { value: 0 }, uOpacity: { value: 0.86 }, uFlow: { value: new THREE.Vector2() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime; uniform float uOpacity; uniform vec2 uFlow; varying vec2 vUv;
      float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1.0,0.0)), u.x), mix(h(i+vec2(0.0,1.0)), h(i+vec2(1.0,1.0)), u.x), u.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n(p); p = p * 2.02 + 7.3; a *= 0.5; } return s; }
      void main(){
        vec2 p = vUv * vec2(2.1, 1.25) + uFlow;   // broad swirls
        float t = uTime;
        vec2 q = vec2(fbm(p + vec2(0.0, t * 0.13)), fbm(p + vec2(5.2, 1.3) - t * 0.09));
        vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 0.11), fbm(p + 3.0 * q + vec2(8.3, 2.8) - t * 0.07));
        float m = fbm(p + 3.4 * r);
        float bands = sin(m * 19.0 + r.x * 6.0);
        // S3 footage (118.6-122.5s): deep, saturated swirls of the team colour with warmer and pinker bands
        // (red with orange and pink for a red team), only a thin light vein; never pastel or white-washed
        vec3 dark = uColor * 0.38, warm = clamp(uColor + vec3(0.12, 0.32, -0.08), 0.0, 1.4), pink = clamp(uColor + vec3(0.05, -0.02, 0.35), 0.0, 1.4);
        vec3 col = mix(dark, uColor, smoothstep(-0.7, 0.0, bands));
        col = mix(col, warm, smoothstep(0.2, 0.55, bands) * (0.5 + 0.5 * sin(m * 7.0 + r.y * 4.0)));
        col = mix(col, pink, smoothstep(0.55, 0.85, bands) * 0.8);
        col = mix(col, uColor * 1.3 + 0.12, smoothstep(0.95, 0.995, bands) * 0.6);
        float edge = smoothstep(0.0, 0.035, vUv.x) * smoothstep(0.0, 0.035, 1.0 - vUv.x);
        float a = min(1.0, uOpacity * 1.1) * mix(0.75, 1.0, edge);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
  // Compatibility with callers that animate `opacity` / `tex.offset`: both drive uniforms.
  Object.defineProperty(mat, 'opacity', { get() { return this.uniforms?.uOpacity?.value ?? 1; }, set(v) { if (this.uniforms?.uOpacity) this.uniforms.uOpacity.value = v; }, configurable: true });
  const tex = { offset: mat.uniforms.uFlow.value, dispose() {} };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'splattercolor-sheet';
  const edge = new THREE.Mesh(new THREE.ShapeGeometry(shp, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  edge.scale.set(1.01, 1.01, 1); edge.position.z = -0.01;
  const group = new THREE.Group(); group.add(edge, mesh); group.userData.s3ScreenSheet = { mat, tex };
  return group;
}
