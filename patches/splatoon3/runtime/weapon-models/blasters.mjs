// Blaster family models (Splatoon 3 Ver.11.3.0 main weapons). Shapes follow the
// official per-weapon 3D renders and the turntable videos on Inkipedia; scale is
// set by the pistol handle (11 cm). Internal model names come from Leanny/splat3
// ActorInfo (Fmdb). Ink-coloured parts are the ones that take the team colour in
// the turntable videos / gameplay footage (rear cans, Luna shell, crayons, ammo
// window slats).
//
// Moving parts: the standard Blaster keeps the S3 per-shot mechanism channels
// (`lever` = the black arm on the left of the pressure drum, `front` = the flame
// paint can thrown forward by the centre spring, muzzle parented to it); the
// spring between them stretches with the front. No other S3 Blaster has a
// published or observed per-shot part motion, so their `front` / `lever`
// channels are empty and the muzzle stays on the static body.
import { THREE, Pieces, M, V, box, sphere, zlathe, ylathe, zcyl, ycyl, xcyl, ring, pipe, pipeR, slab, rotateAbout,
  pistolGrip, gripSpec, part, rebuild, TRIGGER_PIVOT, GRIP_PISTOL, smoothOutline, emptyGeometry } from './kit.mjs';
import { BLASTER_MECHANISM, blasterMechanismCycle } from '../blaster-mechanism.mjs';

// Reference pixel → weapon space helper for a side render (muzzle right, 400 px frame).
// (gx, gy) = handle centre (grip origin) in the image, s = metres per pixel.
const px = (gx, gy, s) => (x, y) => [(x - gx) * s, (gy - y) * s];
const TAU = Math.PI * 2;
// Low-poly rounded box for small details (the kit default 12×8 is meant for main shells).
const bx = (w, h, d, x = 0, y = 0, z = 0, e = 0.38, ws = 8, hs = 6) => box(w, h, d, x, y, z, e, ws, hs);
const _c = new THREE.Color(), _c2 = new THREE.Color();

/** Add a geometry and recolour its vertices with fn(x, y, z, out: THREE.Color). */
function painted(p, geo, fn, mat = M.gloss) {
  p.add(geo, '#000000', mat);
  const g = p.list[p.list.length - 1], pos = g.attributes.position, col = g.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), _c);
    col.setXYZ(i, _c.r, _c.g, _c.b);
  }
  return g;
}
/** Hot-rod flame paint along +Z: black rear, tongues licking backward from a hot front.
 *  u = 0 at the rear edge, 1 at the front; a = angle around the axis. */
function flameColor(u, a, out, hot = '#e2302c', mid = '#f2741f', tip = '#f6b13a', base = '#141418', tongues = 7) {
  const f = Math.abs(Math.sin(tongues * a * 0.5 + 0.55 * Math.sin(3 * a + 1.3)));
  const g = Math.abs(Math.sin(tongues * a * 0.5 + 1.5708 + 0.4 * Math.sin(2 * a)));
  const edge = Math.min(0.78 - 0.55 * f ** 3, 0.86 - 0.3 * g ** 4); // flame boundary in u
  if (u < edge) return out.set(base);
  const k = Math.min(1, (u - edge) / 0.28);
  if (k < 0.25) return out.set(tip).lerp(_c2.set(mid), k / 0.25);
  return out.set(mid).lerp(_c2.set(hot), (k - 0.25) / 0.75);
}
/** Clip a closed geometry by the plane n·p = d: vertices on the dropped side are projected onto
 *  the plane (keep = +1 keeps n·p ≥ d). Used to split a shell into two coloured halves. */
function clipPlane(g, n, d, keep) {
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), s = n.x * x + n.y * y + n.z * z - d;
    if (s * keep < 0) pos.setXYZ(i, x - n.x * s, y - n.y * s, z - n.z * s);
  }
  pos.needsUpdate = true; g.computeVertexNormals(); return g;
}
/** Thin disc decal of radius r at `at` facing `normal`. */
function disc(r, t, at, normal, seg = 14) {
  const g = zcyl(r, -t / 2, t / 2, 0, 0, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V(...normal).normalize()));
  return g.translate(...at);
}
/** Ring of points (circle) around the Z axis for pipe() paths. */
const arcPts = (R, y, z, a0, a1, n, x0 = 0) => Array.from({ length: n + 1 }, (_, k) => {
  const a = a0 + (a1 - a0) * k / n; return [x0 + Math.cos(a) * R, y + Math.sin(a) * R, z];
});
/** Ribbed gray stand plate used by the Blaster / Range Blaster: from (z0, y0) to (z1, y1),
 *  centred on x, width w, with cross ribs on top. */
function rampPlate(p, z0, y0, z1, y1, x, w, color = '#9c9c98', rib = '#6e6e6c') {
  const len = Math.hypot(z1 - z0, y1 - y0), ang = Math.atan2(y1 - y0, z1 - z0), t = 0.008;
  const q = new Pieces();
  q.add(bx(w, t, len, 0, 0, len / 2, 0.15), color, M.metal);
  const n = Math.floor(len / 0.014);
  for (let k = 1; k < n; k++) q.add(box(w * 0.86, 0.0025, 0.0035, 0, t / 2, k * len / n, 0.3, 4, 2), rib, M.metal);
  q.add(bx(w, t * 1.4, 0.01, 0, -t * 0.2, len - 0.005, 0.2), '#4a4a4a', M.rubber);
  q.transform(g => g.rotateX(-ang).translate(x, y0, z0));
  p.merge(q);
}
/** Helix spring along +Z: radius R, wire r, from z0 to z1 with `turns` turns. */
function spring(R, r, y, z0, z1, turns, seg = 12) {
  const n = Math.round(turns * seg), pts = [];
  for (let k = 0; k <= n; k++) { const a = k / seg * TAU; pts.push([Math.cos(a) * R, y + Math.sin(a) * R, z0 + (z1 - z0) * k / n]); }
  return pipe(pts, r, n, 5);
}

// ===================================================================================== Blaster
// Wmn_Blaster_Middle. Side render: handle 62 px → s = 0.00177 m/px (overall ≈ 0.63 m).
// Rear: ink can (team colour; pale in the render) with silver rims, two "eye" decals and a wire
// hoop; a carry bar over the joint; black pressure drum with a silver face; the left-hand lever
// arm; a centre spring with red hoses; a black ribbed foregrip block underneath; the front
// flame-painted paint can with a silver lid, threaded nozzle, slatted vent and wire bail; a gray
// ribbed bracket around the can's rear rim that runs down into a long stand plate (left side).
const BL = { Y: 0.141, R: 0.082, YF: 0.133, RF: 0.106, ZF0: 0.157, ZF1: 0.384 };
function blaster(d) {
  const s = 0.00177, P = px(157, 243, s);
  const C = { silver: '#c9ccd0', steel: '#8d9299', black: '#16171b', dark: '#2a2b30', red: '#d5262b', gray: '#9c9c98' };
  const { Y, R, YF, RF, ZF0, ZF1 } = BL;
  const body = new Pieces(), ink = new Pieces(), front = new Pieces(), lever = new Pieces(), spr = new Pieces();
  const trig = pistolGrip(body, { color: C.black, triggerColor: C.dark, guard: false, len: 0.055, w: 0.013, d: 0.017 });
  // frame from the grip up to the drum, trigger strut forward to the foregrip block
  body.add(slab([[-0.03, 0.03], [0.035, 0.03], [0.05, 0.066], [-0.035, 0.07]], 0.03, 0, 0.004), C.black, M.satin);
  body.add(pipe([[0, 0.035, 0.022], [0, 0.012, 0.03], [0, 0.011, 0.094]], 0.0035, 12, 6), C.black, M.metal);
  // rear ink can: team-colour wrapper between silver rims; dished silver end
  const [z0] = P(22, 0), [z1] = P(152, 0);
  ink.add(zlathe([[0, z0 + 0.012], [R - 0.002, z0 + 0.012], [R, z0 + 0.016], [R, z1 - 0.016], [R - 0.002, z1 - 0.012], [0, z1 - 0.012]], 0, Y, 0, 28));
  body.add(zlathe([[0.058, z0 + 0.006], [0.07, z0], [R + 0.002, z0 + 0.004], [R + 0.003, z0 + 0.016], [R - 0.004, z0 + 0.018], [R - 0.012, z0 + 0.014], [0.06, z0 + 0.012]], 0, Y, 0, 28), C.silver, M.metal);
  body.add(zlathe([[0, z0 + 0.01], [0.06, z0 + 0.01], [0.06, z0 + 0.007], [0, z0 + 0.004]], 0, Y, 0, 20), C.steel, M.metal);
  body.add(zlathe([[R - 0.004, z1 - 0.018], [R + 0.003, z1 - 0.016], [R + 0.002, z1 - 0.002], [0.074, z1 + 0.004], [0.066, z1 + 0.012], [0.06, z1 + 0.014]], 0, Y, 0, 28), C.silver, M.metal);
  for (const z of [z0 + 0.05, z1 - 0.045]) body.add(ring(R + 0.003, 0.0026, 0, Y, z, 'z', 5, 30), C.silver, M.metal);
  for (const sx of [-1, 1]) body.add(pipe([[sx * (R + 0.003), Y + 0.012, z0 + 0.05], [sx * (R + 0.003), Y + 0.012, z1 - 0.045]], 0.0024, 10, 5), C.silver, M.metal);
  // "eye" decals on the right flank
  for (const [ex, ey] of [[100, 160], [97, 186]]) {
    const [ez, yy] = P(ex, ey), a = Math.asin(Math.max(-1, Math.min(1, (yy - Y) / R))), nx = -Math.cos(a), ny = Math.sin(a);
    body.add(disc(0.0115, 0.002, [nx * (R + 0.001), Y + ny * (R + 0.001), ez], [nx, ny, 0]), '#f4f4f0', M.print);
    body.add(disc(0.004, 0.003, [nx * (R + 0.002), Y + ny * (R + 0.002), ez], [nx, ny, 0]), C.black, M.print);
  }
  // carry bar over the can / drum joint
  { const [hz0, ht] = P(117, 102), [hz1] = P(176, 0);
    body.add(pipe([[0, Y + R - 0.004, hz0 + 0.004], [0, ht - 0.006, hz0], [0, ht, hz0 + 0.012], [0, ht, hz1 - 0.012], [0, ht - 0.006, hz1], [0, Y + 0.07, hz1 + 0.004]], 0.0045, 30, 7), C.silver, M.metal); }
  // neck and black pressure drum with a silver face plate and hub
  body.add(zlathe([[0.06, z1 + 0.012], [0.072, z1 + 0.014], [0.07, 0.012], [0.05, 0.014]], 0, Y, 0, 24), C.silver, M.metal);
  body.add(zlathe([[0, 0.01], [0.07, 0.01], [0.077, 0.018], [0.077, 0.058], [0.07, 0.066], [0, 0.066]], 0, Y, 0, 28), C.black, M.gloss);
  body.add(zlathe([[0, 0.064], [0.066, 0.064], [0.068, 0.07], [0.062, 0.078], [0.032, 0.08], [0.03, 0.09], [0, 0.092]], 0, Y, 0, 24), C.silver, M.metal);
  for (let k = 0; k < 6; k++) { const a = k * TAU / 6; body.add(sphere(0.004, 0.004, 0.003, Math.cos(a) * 0.05, Y + Math.sin(a) * 0.05, 0.079, 6, 4), C.steel, M.metal); }
  // left lever: a black arm hugging the drum on the holder's left (+X), pulled down per shot
  lever.add(pipe(arcPts(0.084, Y, 0.038, 0.95, -1.05, 10), 0.0065, 16, 6).scale(1, 1, 1.6).translate(0, 0, -0.038 * 0.6), C.black, M.satin);
  { const e = [Math.cos(-1.05) * 0.084, Y + Math.sin(-1.05) * 0.084, 0.038];
    lever.add(pipe([e, [e[0] - 0.002, e[1] - 0.03, e[2] - 0.01], [0.02, 0.045, 0.012]], 0.0055, 10, 6), C.black, M.satin);
    lever.add(sphere(0.007, 0.007, 0.007, 0.022, 0.044, 0.012, 10, 8), C.silver, M.metal); }
  // centre spring (stretches with the front) and its guide rod
  body.add(zcyl(0.012, 0.09, 0.165, 0, YF + 0.004, 12), C.steel, M.metal);
  spr.add(spring(0.03, 0.0042, 0, 0, 0.068, 5.5, 9), C.silver, M.metal);
  // red hoses looping under from the drum face into the front can, one per side
  for (const sx of [-1, 1]) body.add(pipe([[sx * 0.05, Y + 0.035, 0.08], [sx * 0.058, Y - 0.03, 0.09], [sx * 0.05, Y - 0.07, 0.118], [sx * 0.056, Y - 0.02, 0.15], [sx * 0.05, YF + 0.03, 0.163]], 0.0055, 20, 6), C.red, M.gloss);
  for (const sx of [-1, 1]) body.add(bx(0.016, 0.014, 0.016, sx * 0.03, Y - 0.045, 0.1, 0.3), C.steel, M.metal);
  // black ribbed foregrip block under the spring (the support hand's grip)
  { const [bz0, by0] = P(203, 207), [bz1] = P(234, 0);
    body.add(bx(0.05, by0 + 0.004, bz1 - bz0, 0, (by0 + 0.004) / 2 - 0.002, (bz0 + bz1) / 2, 0.2), C.black, M.rubber);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) body.add(bx(0.006, by0 - 0.012, 0.009, sx * 0.027, by0 / 2, bz0 + 0.012 + k * 0.016, 0.3), C.dark, M.rubber);
    body.add(bx(0.03, 0.03, 0.03, 0, by0 + 0.012, (bz0 + bz1) / 2, 0.3), C.black, M.satin); }
  // front: flame paint can, rims, lid, threaded nozzle, vent and bail (thrown forward per shot)
  const prof = [[0, ZF0 + 0.004], [RF - 0.012, ZF0 + 0.004]];
  for (let k = 0; k <= 18; k++) prof.push([RF, ZF0 + 0.008 + (ZF1 - ZF0 - 0.016) * k / 18]);
  prof.push([RF - 0.012, ZF1 - 0.004], [0, ZF1 - 0.004]);
  painted(front, zlathe(prof, 0, YF, 0, 40), (x, y, z, out) => {
    const u = (z - ZF0) / (ZF1 - ZF0), a = Math.atan2(y - YF, x);
    if (u > 0.93) return out.set(C.red);
    return flameColor(u / 0.93, a, out);
  });
  for (const z of [ZF0 + 0.004, ZF1 - 0.003]) front.add(ring(RF + 0.0005, 0.0045, 0, YF, z, 'z', 4, 32), C.silver, M.metal);
  front.add(zlathe([[0, ZF1 - 0.004], [RF - 0.004, ZF1 - 0.004], [RF - 0.006, ZF1 + 0.002], [RF - 0.016, ZF1 + 0.004], [RF - 0.02, ZF1 + 0.001], [0, ZF1 + 0.001]], 0, YF, 0, 32), C.silver, M.satin);
  front.add(zlathe([[0, ZF0 - 0.012], [0.05, ZF0 - 0.012], [0.054, ZF0 - 0.004], [0.054, ZF0 + 0.004], [0, ZF0 + 0.004]], 0, YF, 0, 20), C.black, M.satin);
  for (let k = 0; k < 2; k++) front.add(ring(0.054, 0.0018, 0, YF, ZF0 - 0.008 + k * 0.006, 'z', 3, 18), C.dark, M.satin);
  const NY = YF + 0.038, NZ = ZF1 + 0.001;
  front.add(zlathe([[0.012, NZ], [0.019, NZ], [0.021, NZ + 0.004], [0.017, NZ + 0.006], [0.017, NZ + 0.022], [0.019, NZ + 0.024], [0.012, NZ + 0.026], [0.012, NZ + 0.01]], 0, NY, 0, 18), C.silver, M.metal);
  for (let k = 0; k < 3; k++) front.add(ring(0.018, 0.0016, 0, NY, NZ + 0.01 + k * 0.005, 'z', 3, 14), C.steel, M.metal);
  front.add(zcyl(0.0122, NZ + 0.002, NZ + 0.02, 0, NY, 14), '#3a3d44', M.satin);
  front.add(bx(0.046, 0.026, 0.012, 0, YF - 0.036, ZF1 + 0.005, 0.25), C.silver, M.metal);
  for (let k = 0; k < 4; k++) front.add(bx(0.04, 0.0025, 0.004, 0, YF - 0.046 + k * 0.0065, ZF1 + 0.012, 0.3, 6, 4), C.steel, M.metal);
  for (const sx of [-1, 1]) front.add(sphere(0.006, 0.008, 0.006, sx * (RF + 0.003), YF, ZF1 - 0.02, 8, 6), C.silver, M.metal);
  { const pts = []; for (let k = 0; k <= 16; k++) { const a = Math.PI * k / 16;
    pts.push([-Math.cos(a) * (RF + 0.005), YF - Math.sin(a) * (RF + 0.02), ZF1 - 0.02 + Math.sin(a) * 0.05]); }
    front.add(pipe(pts, 0.0022, 24, 4), C.silver, M.metal); }
  // gray ribbed bracket around the can's rear rim (left half) running down into the stand plate
  { const band = new Pieces();
    band.add(ring(RF + 0.007, 0.007, 0, 0, 0, 'z', 4, 26, Math.PI).rotateZ(-Math.PI / 2).scale(1, 1, 1.9), C.gray, M.metal);
    for (let k = 0; k <= 8; k++) { const a = -Math.PI / 2 + Math.PI * k / 8;
      band.add(box(0.004, 0.004, 0.028, Math.cos(a) * (RF + 0.013), Math.sin(a) * (RF + 0.013), 0, 0.3, 4, 2), '#6e6e6c', M.metal); }
    band.add(ring(RF + 0.006, 0.0035, 0, 0, 0, 'z', 4, 36).scale(1, 1, 2.2), C.gray, M.metal);
    body.merge(band.transform(g => g.translate(0, YF, ZF0 + 0.012))); }
  { const [rz1, ry1] = P(378, 296); rampPlate(body, ZF0 + 0.004, YF - RF - 0.004, rz1, ry1, 0.022, 0.062); }
  const d2 = rebuild(d, {
    body, ink,
    parts: {
      trigger: part(trig, TRIGGER_PIVOT),
      lever: part(lever, [0, Y, 0.038]),
      front: part(front, [0, YF, (ZF0 + ZF1) / 2]),
      spring: part(spr.transform(g => g.translate(0, YF + 0.004, 0.092)), [0, YF + 0.004, 0.092]),
    },
    // support hand closes on the ribbed block under the spring (gameplay: left hand under the middle)
    gripL: gripSpec([0, 0.03, 0.105], [0, 1, -0.1], [0.5, -0.05, -1]),
    muzzle: [0, NY, NZ + 0.027],
  });
  d2.muzzlePart = 'front';
  return d2;
}
function blasterAnimate(w, st) {
  // The spring between drum and front stretches with the front throw (same event-owned cycle
  // weapon-detail-motion uses for `front`, read from the time since the actual emission).
  const sp = w.parts.spring; if (!sp) return;
  const k = blasterMechanismCycle(st.sinceShoot ?? 99, BLASTER_MECHANISM.front);
  sp.scale.z = 1 + BLASTER_MECHANISM.frontPeak * k / 0.068;
}

// ===================================================================================== Luna Blaster
// Wmn_Blaster_Short. Handle 75 px → s = 0.00147. An egg-shaped shell: white rear, a front cap cut
// on a slanted plane (translucent team-ink in the videos), a white ball on a stalk at the
// front-top, an ink ball on a short metal stalk at the back, a curved white handle.
function luna(d) {
  const s = 0.00147, P = px(124, 312, s);
  const C = { white: '#e9e6df', shade: '#d4d0c8', steel: '#8f949b', dark: '#2c2e33' };
  const body = new Pieces(), ink = new Pieces(), knob = new Pieces();
  const trig = pistolGrip(body, { color: C.white, triggerColor: C.dark, guard: false, base: false, len: 0.058, w: 0.017, d: 0.024, mat: M.gloss, e: 0.6 });
  body.add(pipe([[0, -0.05, -0.018], [0, -0.062, -0.03], [0, -0.07, -0.024]], 0.012, 8, 10), C.white, M.gloss);
  body.add(pipeR([[0, 0.03, -0.004], [0, 0.06, 0.008], [0, 0.085, 0.03]], t => 0.017 + 0.008 * t, 8, 12), C.white, M.gloss);
  // egg shell profile (rear blunt, front tapering to the nozzle ring)
  const [ez0, ] = P(107, 0), [ez1] = P(338, 0), [, ey] = P(0, 223), RM = 0.113, L = ez1 - ez0;
  const prof = [[0, ez0]];
  for (let k = 1; k < 24; k++) { const t = k / 24, u = 2 * Math.pow(t, 0.78) - 1, r = RM * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.12 * t * t);
    prof.push([Math.max(r, t > 0.9 ? 0.042 : 0), ez0 + L * t]); }
  prof.push([0.04, ez1], [0, ez1]);
  // the cut plane: top of the cut at render (200, 150), bottom at (285, 295)
  const [ta, tb] = P(200, 150), [ba, bb] = P(285, 295), n = V(0, ta - ba, -(tb - bb)).normalize();
  if (n.z < 0) n.negate();
  const dd = n.y * tb + n.z * ta;
  body.add(clipPlane(zlathe(prof, 0, ey, 0, 32), n, dd, -1), C.white, M.gloss);
  ink.add(clipPlane(zlathe(prof.map(([r, z]) => [r * 1.004, z]), 0, ey, 0, 32), n, dd, +1));
  // nozzle ring and dark bore at the front tip
  body.add(zlathe([[0.016, ez1 - 0.03], [0.036, ez1 - 0.03], [0.04, ez1 - 0.012], [0.036, ez1 + 0.006], [0.024, ez1 + 0.008], [0.017, ez1], [0.016, ez1 - 0.02]], 0, ey, 0, 24), '#b8bcc2', M.metal);
  body.add(zcyl(0.017, ez1 - 0.03, ez1 - 0.006, 0, ey, 16), '#16171a', M.satin);
  // front-top ball on a tapered stalk (sways after each shot)
  const [kz0, ky0] = P(296, 165), [kz1, ky1] = P(345, 90);
  knob.add(pipeR([[0, ky0 - 0.012, kz0 - 0.01], [0, ky0 + 0.02, kz0 + 0.01], [0, ky1 - 0.05, kz1 - 0.022]], t => 0.013 - 0.006 * Math.sin(Math.PI * t * 0.8), 14, 10), C.white, M.gloss);
  knob.add(sphere(0.062, 0.062, 0.062, 0, ky1, kz1, 20, 14), C.white, M.gloss);
  // rear ink ball on a short steel stalk with a washer
  const [rz0, ry0] = P(110, 220), [rz1, ry1] = P(47, 212);
  body.add(pipe([[0, ry0, rz0 + 0.01], [0, ry1, rz1 + 0.03]], 0.0075, 6, 10), C.steel, M.metal);
  body.add(zlathe([[0.008, rz1 + 0.026], [0.03, rz1 + 0.024], [0.03, rz1 + 0.03], [0.008, rz1 + 0.032]], 0, ry1, 0, 18), C.steel, M.metal);
  ink.add(sphere(0.039, 0.039, 0.039, 0, ry1, rz1, 18, 12));
  body.add(ring(0.04, 0.003, 0, ry1, rz1 + 0.006, 'z', 4, 20), C.shade, M.gloss);
  // small dark print on the flank
  body.add(bx(0.002, 0.006, 0.03, -RM * 0.98, ey - 0.008, P(175, 0)[0], 0.3), '#55575c', M.print);
  const d2 = rebuild(d, {
    body, ink,
    parts: { trigger: part(trig, TRIGGER_PIVOT), knob: part(knob, [0, ky0, kz0]) },
    // support hand cups the shell from below, in front of the handle
    gripL: gripSpec([0, 0.004, 0.155], [0, 0.15, 1], [0.7, -0.7, 0.05]),
    muzzle: [0, ey, ez1 + 0.012],
  });
  d2.muzzlePart = null;
  return d2;
}
function lunaAnimate(w, st) {
  // Damped sway of the stalk ball after each actual shot (INKWAVE secondary motion).
  const k = w.parts.knob; if (!k) return;
  const t = st.sinceShoot ?? 99;
  k.rotation.x = t < 0.7 ? -0.16 * Math.exp(-6 * t) * Math.sin(t * 26 + 0.3) : 0;
}

// ===================================================================================== Range Blaster
// Wmn_Blaster_Long. Handle 52 px → s = 0.00212 (overall ≈ 0.82 m, a shouldered launcher).
// Rear ink can with a label band and silver rims, a carry bar, two fat black corrugated hoses,
// a gray drum with a grille, a black ribbed foregrip block with three silver studs above it, the
// big flame-painted egg (black hood lip on top, hot red face rim, silver grille face with the
// nozzle high on it) and the ribbed stand plate under the egg.
function rangeBlaster(d) {
  const s = 0.00212, P = px(145, 242, s);
  const C = { silver: '#c9ccd0', steel: '#8d9299', black: '#16171b', dark: '#2a2b30', gray: '#9c9c98', label: '#f2c531', labelRed: '#d8322a' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.black, triggerColor: C.dark, guard: false });
  body.add(slab([[-0.03, 0.03], [0.05, 0.03], [0.07, 0.08], [-0.04, 0.09]], 0.034, 0, 0.004), C.black, M.satin);
  body.add(pipe([[0, 0.035, 0.022], [0, 0.012, 0.03], [0, 0.012, 0.15]], 0.0038, 12, 6), C.black, M.metal);
  const Y = 0.172, R = 0.084;
  const [z0] = P(3, 0), [z1] = P(102, 0);
  ink.add(zlathe([[0, z0 + 0.012], [R - 0.002, z0 + 0.012], [R, z0 + 0.016], [R, z1 - 0.014], [0, z1 - 0.014]], 0, Y, 0, 28));
  body.add(zlathe([[0.058, z0 + 0.006], [0.07, z0], [R + 0.002, z0 + 0.004], [R + 0.003, z0 + 0.016], [R - 0.012, z0 + 0.014], [0.06, z0 + 0.012]], 0, Y, 0, 28), C.silver, M.metal);
  body.add(zlathe([[0, z0 + 0.01], [0.06, z0 + 0.01], [0.06, z0 + 0.007], [0, z0 + 0.004]], 0, Y, 0, 20), C.steel, M.metal);
  body.add(zlathe([[R - 0.004, z1 - 0.016], [R + 0.003, z1 - 0.014], [R + 0.002, z1], [0.06, z1 + 0.012]], 0, Y, 0, 28), C.silver, M.metal);
  body.add(zcyl(R + 0.002, z0 + 0.026, z0 + 0.05, 0, Y, 28), C.label, M.print);
  body.add(zcyl(R + 0.0025, z0 + 0.034, z0 + 0.04, 0, Y, 28), C.labelRed, M.print);
  for (const [ex, ey] of [[90, 168], [92, 186]]) {
    const [ez, yy] = P(ex, ey), a = Math.asin(Math.max(-1, Math.min(1, (yy - Y) / R))), nx = -Math.cos(a), ny = Math.sin(a);
    body.add(disc(0.012, 0.002, [nx * (R + 0.001), Y + ny * (R + 0.001), ez], [nx, ny, 0]), '#f4f4f0', M.print);
    body.add(disc(0.006, 0.003, [nx * (R + 0.002), Y + ny * (R + 0.002), ez], [nx, ny, 0]), C.black, M.print);
  }
  { const [hz0, ht] = P(115, 119), [hz1] = P(175, 0);
    body.add(pipe([[0, Y + R - 0.004, hz0 + 0.004], [0, ht - 0.006, hz0], [0, ht, hz0 + 0.012], [0, ht, hz1 - 0.012], [0, ht - 0.006, hz1], [0, Y + 0.07, hz1 + 0.004]], 0.0048, 30, 7), C.silver, M.metal); }
  // black corrugated hoses (one per side) and the centre coupling
  body.add(zlathe([[0, z1], [0.062, z1], [0.066, z1 + 0.02], [0.06, 0.06], [0, 0.06]], 0, Y - 0.006, 0, 20), C.black, M.rubber);
  for (const sx of [-1, 1]) body.add(pipeR([[sx * 0.04, Y + 0.035, z1 - 0.004], [sx * 0.075, Y + 0.02, -0.06], [sx * 0.082, Y - 0.025, -0.01], [sx * 0.06, Y - 0.05, 0.04], [sx * 0.045, Y - 0.01, 0.085]],
    t => 0.026 + 0.006 * Math.cos(t * TAU * 5), 40, 8), C.black, M.rubber);
  // gray drum with a grille, three silver studs, black ribbed foregrip block
  body.add(zlathe([[0, 0.06], [0.078, 0.06], [0.082, 0.07], [0.082, 0.12], [0.07, 0.13], [0, 0.13]], 0, Y - 0.008, 0, 28), C.black, M.gloss);
  body.add(zlathe([[0, 0.125], [0.074, 0.125], [0.074, 0.2], [0, 0.2]], 0, Y - 0.012, 0, 28), C.silver, M.metal);
  for (let k = 0; k < 7; k++) body.add(bx(0.15, 0.003, 0.004, 0, Y - 0.05 + k * 0.012, 0.155, 0.3, 6, 4).scale(1, 1, 1), C.steel, M.metal);
  for (let k = 0; k < 3; k++) body.add(xcyl(0.009, -0.07, -0.05, P(0, 190)[1], P(228 + k * 11, 0)[0], 10), C.silver, M.metal);
  { const [bz0, by0] = P(215, 205), [bz1] = P(277, 0);
    body.add(bx(0.06, by0 + 0.002, bz1 - bz0, 0, by0 / 2, (bz0 + bz1) / 2, 0.2), C.black, M.rubber);
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) body.add(bx(0.006, by0 - 0.012, 0.01, sx * 0.032, by0 / 2, bz0 + 0.016 + k * 0.03, 0.3), C.dark, M.rubber); }
  // the flame egg: rear point under a black hood lip, max girth mid-way, flat silver face
  const EZ0 = P(195, 0)[0], EZ1 = P(386, 0)[0], EY = 0.15, ER = 0.132, EF = 0.098;
  const prof = [[0, EZ0]];
  for (let k = 1; k <= 26; k++) { const t = k / 26, r = t < 0.55 ? ER * Math.sin(Math.PI / 2 * Math.pow(t / 0.55, 0.7)) : ER - (ER - EF) * Math.pow((t - 0.55) / 0.45, 1.6);
    prof.push([Math.max(0.05, r), EZ0 + (EZ1 - EZ0) * t]); }
  prof.push([EF - 0.012, EZ1 + 0.004], [0, EZ1 + 0.004]);
  painted(body, zlathe(prof, 0, EY, 0, 44), (x, y, z, out) => {
    const u = (z - EZ0) / (EZ1 - EZ0), a = Math.atan2(y - EY, x);
    if (u > 0.965) return out.set('#e8344a');
    return flameColor(u * 1.05, a, out, '#e83a3a', '#f0702a', '#f39a35', '#141418', 8);
  });
  // black hood lip sweeping back over the top of the egg
  body.add(slab(smoothOutline([[EZ0 - 0.018, EY + 0.088], [EZ0 + 0.05, EY + ER - 0.004], [EZ0 + 0.13, EY + ER + 0.003], [EZ0 + 0.13, EY + ER - 0.022], [EZ0 + 0.04, EY + 0.07]], 20), 0.085, 0, 0.01), C.black, M.gloss);
  // silver grille face with the nozzle high on it
  body.add(zlathe([[0, EZ1 - 0.002], [EF - 0.01, EZ1 - 0.002], [EF - 0.012, EZ1 + 0.008], [0, EZ1 + 0.008]], 0, EY, 0, 36), C.silver, M.satin);
  for (let k = 0; k < 9; k++) { const yy = -0.06 + k * 0.012, hw = Math.sqrt(Math.max(0, (EF - 0.02) ** 2 - yy * yy));
    if (hw > 0.01) body.add(bx(hw * 2, 0.003, 0.004, 0, EY + yy, EZ1 + 0.009, 0.3, 6, 4), C.steel, M.metal); }
  const NY = EY + 0.045;
  body.add(zlathe([[0.014, EZ1], [0.026, EZ1], [0.028, EZ1 + 0.016], [0.022, EZ1 + 0.02], [0.014, EZ1 + 0.012]], 0, NY, 0, 18), '#5a5d63', M.metal);
  body.add(zcyl(0.0145, EZ1 + 0.004, EZ1 + 0.017, 0, NY, 14), '#101114', M.satin);
  // ribbed bracket on the egg's rear (left) and the stand plate
  body.add(ring(0.1, 0.007, 0, 0, 0, 'z', 4, 24, Math.PI).rotateZ(-Math.PI / 2).scale(1, 1, 1.8).translate(0, EY - 0.01, P(262, 0)[0]), C.gray, M.metal);
  { const [rz0, ry0] = P(272, 236), [rz1, ry1] = P(396, 292); rampPlate(body, rz0, ry0, rz1, ry1, 0.025, 0.07); }
  const d2 = rebuild(d, {
    body, ink,
    parts: { trigger: part(trig, TRIGGER_PIVOT) },
    // support hand on the ribbed block, its rear half (Octoling key art)
    gripL: gripSpec([0, 0.035, 0.175], [0, 1, -0.1], [0.5, -0.05, -1]),
    muzzle: [0, NY, EZ1 + 0.022],
  });
  d2.muzzlePart = null;
  return d2;
}

// ===================================================================================== Clash Blaster
// Wmn_Blaster_LightShort. Handle 96 px → s = 0.00115. A navy wedge frame with a fan of ten
// crayons (team ink) arched over its top and flanks, a translucent silver muzzle box on two
// rails at the front with two sight tabs, a wire bail under the frame and a ribbed grip.
function clash(d) {
  const s = 0.00115, P = px(98, 270, s);
  const C = { navy: '#2b2f7a', navyD: '#1d2058', black: '#1d1e22', box: '#c6ccd6', boxD: '#8f9aa8', wire: '#b9bdc3', label: '#ecebe6' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.black, triggerColor: C.black, guard: false, base: false, len: 0.056, w: 0.0135, d: 0.0165, rake: 0.1 });
  for (let k = 0; k < 6; k++) body.add(ring(0.0145, 0.003, 0, 0, 0, 'y', 4, 14).rotateX(-0.35).translate(0, -0.052 + k * 0.016, -0.004 - (-0.052 + k * 0.016) * 0.36), C.black, M.rubber);
  body.add(bx(0.032, 0.012, 0.036, 0, -0.064, -0.026, 0.4).rotateX(-0.1), C.black, M.rubber);
  // navy frame: wedge side profile, full width
  const frame = [P(27, 150), P(70, 142), P(150, 128), P(240, 112), P(288, 112), P(290, 215), P(282, 250), P(165, 242), P(140, 226), P(80, 222), P(42, 185)];
  body.add(slab(frame, 0.07, 0, 0.006), C.navy, M.satin);
  body.add(slab([P(24, 150), P(60, 152), P(60, 175), P(42, 184)], 0.075, 0, 0.004), C.navyD, M.satin);
  body.add(slab([P(282, 108), P(296, 108), P(296, 228), P(282, 228)], 0.06, 0, 0.003), C.black, M.satin);
  for (const sx of [-1, 1]) { body.add(bx(0.002, 0.012, 0.04, sx * 0.0355, P(0, 232)[1], P(200, 0)[0], 0.3), C.label, M.print);
    body.add(bx(0.002, 0.011, 0.022, sx * 0.0355, P(0, 232)[1], P(268, 0)[0], 0.3), C.label, M.print); }
  // crayons: an arch of ten around the frame's upper axis, staggered lengths
  const [, Ya] = P(0, 162), Rc = 0.064, cr = 0.0182;
  for (let k = 0; k < 10; k++) {
    const a = -0.32 + k * (Math.PI + 0.64) / 9, x = Math.cos(a) * Rc, y = Ya + Math.sin(a) * Rc;
    const zb = P(80 + (k % 3) * 8, 0)[0] + (k === 4 || k === 5 ? 0.025 : 0), zt = zb + 0.15;
    ink.add(zlathe([[0, zb], [cr - 0.002, zb], [cr, zb + 0.003], [cr, zt - 0.03], [cr * 0.92, zt - 0.027], [0.008, zt - 0.004], [0.005, zt], [0, zt]], x, y, 0, 10));
    for (const z of [zb + 0.012, zt - 0.042]) body.add(ring(cr + 0.0006, 0.0012, x, y, z, 'z', 3, 10), '#5c6070', M.print);
  }
  // rails, translucent muzzle box with the bore low on its face, sight tabs
  for (const yy of [P(0, 135)[1], P(0, 190)[1]]) for (const sx of [-1, 1]) body.add(zcyl(0.0055, P(250, 0)[0], P(292, 0)[0], sx * 0.018, yy, 10), C.black, M.metal);
  const [bz0, bt] = P(292, 108), [bz1, bb] = P(358, 222), BY = (bt + bb) / 2;
  body.add(bx(0.084, bt - bb, bz1 - bz0, 0, BY, (bz0 + bz1) / 2, 0.22), C.box, M.gloss);
  body.add(bx(0.072, bt - bb - 0.012, 0.006, 0, BY, bz0 + 0.002, 0.2), C.boxD, M.metal);
  const [, HY] = P(0, 192);
  body.add(zlathe([[0.022, bz1 - 0.02], [0.024, bz1 - 0.002], [0.028, bz1 + 0.003], [0.02, bz1 + 0.003], [0.018, bz1 - 0.02]], 0, HY, 0, 18), C.boxD, M.metal);
  body.add(zcyl(0.0195, bz1 - 0.03, bz1 - 0.004, 0, HY, 16), '#121317', M.satin);
  body.add(slab([P(296, 78), P(326, 78), P(326, 110), P(296, 110)], 0.012, -0.022, 0.002), C.navy, M.satin);
  body.add(slab([P(338, 84), P(355, 84), P(355, 110), P(338, 110)], 0.012, 0.022, 0.002), C.navy, M.satin);
  // wire bail under the frame, in front of the grip
  body.add(pipe([[-0.012, P(0, 228)[1], P(125, 0)[0]], [-0.012, P(0, 282)[1], P(140, 0)[0]], [0.012, P(0, 282)[1], P(150, 0)[0]], [0.012, P(0, 230)[1], P(138, 0)[0]]], 0.0022, 24, 5), C.wire, M.metal);
  const d2 = rebuild(d, {
    body, ink,
    parts: { trigger: part(trig, TRIGGER_PIVOT) },
    gripR: GRIP_PISTOL,
    // support hand cups the frame's lower front from below
    gripL: gripSpec([0, 0.003, 0.14], [0, 0.15, 1], [0.7, -0.7, 0.05]),
    muzzle: [0, HY, bz1 + 0.006],
  });
  d2.muzzlePart = null;
  return d2;
}

// ===================================================================================== Rapid Blasters
// Wmn_Blaster_Light (handle 82 px → s = 0.00134) and Wmn_Blaster_LightLong (handle 67 px →
// s = 0.00164). Toy-like blocky receiver: pale gray upper with an embossed panel, magenta
// ammo-window frame with three ink slats, a ribbed ink drum at the very back, magenta lower
// plate with a big round side knob, small magenta blocks on top and an orange spool nozzle.
// The Pro adds a long magenta barrel with square ports, a toothed white rear sight and a white
// loop stock / foregrip under the front.
function rapidCore(body, ink, P, C, o) {
  const T = o.thick;
  body.add(slab(o.receiver.map(([x, y]) => P(x, y)), T, 0, 0.005), C.gray, M.satin);
  body.add(slab(o.panel.map(([x, y]) => P(x, y)), T + 0.004, 0, 0.002), C.grayD, M.satin);
  body.add(slab(o.lower.map(([x, y]) => P(x, y)), T + 0.012, 0, 0.005), C.mag, M.gloss);
  const [wz0, wy0] = P(o.win[0], o.win[1]), [wz1, wy1] = P(o.win[2], o.win[3]);
  body.add(slab([[wz0, wy1], [wz1, wy1], [wz1, wy0], [wz0, wy0]], T + 0.016, 0, 0.004,
    [[[wz0 + 0.008, wy1 + 0.008], [wz0 + 0.008, wy0 - 0.008], [wz1 - 0.008, wy0 - 0.008], [wz1 - 0.008, wy1 + 0.008]]]), C.mag, M.gloss);
  for (let k = 0; k < 3; k++) { const z = wz0 + 0.014 + k * (wz1 - wz0 - 0.028) / 2;
    ink.add(bx(T + 0.013, wy0 - wy1 - 0.018, 0.012, 0, (wy0 + wy1) / 2, z, 0.3)); }
  body.add(bx(T + 0.006, wy0 - wy1 - 0.016, wz1 - wz0 - 0.016, 0, (wy0 + wy1) / 2, (wz0 + wz1) / 2, 0.2), '#3a3c42', M.satin);
  const [dz, dy0] = P(o.drum[0], o.drum[1]), [, dy1] = P(0, o.drum[2]);
  ink.add(ylathe([[0, dy1], [o.drumR, dy1], [o.drumR, dy0], [0, dy0]], 0, 0, dz, 20));
  for (let k = 1; k < 7; k++) body.add(ring(o.drumR + 0.0005, 0.0018, 0, dy1 + (dy0 - dy1) * k / 7, dz, 'y', 3, 20), '#8a8d93', M.metal);
  for (const [x0, y0, x1, y1] of o.bumps) { const [a, b] = P(x0, y0), [c, e] = P(x1, y1);
    body.add(bx(T * 0.75, b - e, c - a, 0, (b + e) / 2, (a + c) / 2, 0.25), C.mag, M.gloss); }
  const [kz, ky] = P(o.knob[0], o.knob[1]);
  for (const sx of [-1, 1]) {
    body.add(xcyl(o.knob[2], sx * (T / 2 + 0.004), sx * (T / 2 + 0.016), ky, kz, 16), C.gray, M.satin);
    body.add(xcyl(o.knob[2] * 0.55, sx * (T / 2 + 0.016), sx * (T / 2 + 0.019), ky, kz, 12), C.grayD, M.satin);
  }
  for (const [x, y] of o.screws) for (const sx of [-1, 1]) { const [z, yy] = P(x, y); body.add(sphere(0.0035, 0.0035, 0.002, sx * (T / 2 + 0.006), yy, z, 8, 6), '#3a3c42', M.metal); }
}
function rapidNozzle(body, z0, y, r, C) {
  body.add(zcyl(0.012, z0 - 0.02, z0 + 0.004, 0, y, 12), '#1e1f23', M.metal);
  body.add(zlathe([[0.012, z0], [r * 0.92, z0], [r, z0 + 0.006], [r, z0 + 0.016], [r * 0.82, z0 + 0.02], [r * 0.82, z0 + 0.026], [r, z0 + 0.03],
    [r, z0 + 0.04], [r * 0.7, z0 + 0.046], [0.012, z0 + 0.046]], 0, y, 0, 20), C.orange, M.gloss);
  // front crown: four lugs with notches between them
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4;
    body.add(bx(r * 0.62, r * 0.62, 0.036, Math.cos(a) * r * 0.56, y + Math.sin(a) * r * 0.56, z0 + 0.062, 0.3), C.orange, M.gloss); }
  body.add(zcyl(0.011, z0 + 0.02, z0 + 0.081, 0, y, 12), '#2a1a0a', M.satin);
  return z0 + 0.08;
}
const RAPID_C = { gray: '#d7d6cf', grayD: '#bdbcb4', mag: '#d0234f', orange: '#f5a21f', black: '#26272b', white: '#e8e6dc' };
function rapid(d) {
  const s = 0.00134, P = px(102, 270, s), C = RAPID_C;
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.black, triggerColor: C.black, len: 0.056, w: 0.014, d: 0.019, rake: 0.1 });
  body.add(bx(0.04, 0.012, 0.06, 0, -0.064, -0.03, 0.3).rotateX(0.15), C.black, M.rubber);
  rapidCore(body, ink, P, C, {
    thick: 0.06,
    receiver: [[53, 112], [70, 106], [268, 92], [286, 104], [287, 182], [160, 205], [140, 232], [62, 232], [53, 222]],
    panel: [[160, 105], [262, 96], [278, 108], [278, 150], [230, 160], [175, 158], [160, 140]],
    lower: [[140, 214], [160, 176], [270, 172], [312, 192], [302, 250], [250, 256], [140, 246], [122, 252], [116, 240]],
    win: [73, 117, 145, 196], drum: [40, 222, 124], drumR: 0.017,
    bumps: [[72, 86, 110, 100], [132, 93, 152, 101], [186, 79, 246, 96]],
    knob: [228, 205, 0.026], screws: [[64, 145], [270, 103], [276, 186]],
  });
  const [nz, ny] = P(292, 140);
  const mz = rapidNozzle(body, nz, ny, 0.05, C);
  const d2 = rebuild(d, {
    body, ink, parts: { trigger: part(trig, TRIGGER_PIVOT) },
    // left hand cups the magenta lower body in front of the trigger (Rapid Blaster animation clip)
    gripL: gripSpec([0, 0.0, 0.16], [0, 0.15, 1], [0.7, -0.7, 0.05]),
    muzzle: [0, ny, mz + 0.004],
  });
  d2.muzzlePart = null;
  return d2;
}
function rapidPro(d) {
  const s = 0.00164, P = px(97, 255, s), C = RAPID_C;
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.black, triggerColor: C.black, len: 0.056, w: 0.014, d: 0.019, rake: 0.1 });
  rapidCore(body, ink, P, C, {
    thick: 0.062,
    receiver: [[58, 132], [75, 125], [218, 116], [232, 128], [233, 196], [150, 210], [135, 232], [66, 232], [58, 222]],
    panel: [[140, 128], [210, 120], [225, 130], [225, 160], [190, 168], [150, 166], [140, 150]],
    lower: [[140, 214], [150, 182], [255, 180], [280, 196], [270, 240], [215, 245], [140, 236], [118, 240], [114, 230]],
    win: [70, 135, 132, 196], drum: [48, 202, 132], drumR: 0.017,
    bumps: [[72, 113, 102, 126], [120, 120, 142, 127], [158, 108, 205, 122]],
    knob: [190, 205, 0.024], screws: [[68, 160], [228, 128]],
  });
  // long magenta barrel with square ports
  const [bz0, by] = P(232, 147), [bz1] = P(342, 0);
  body.add(zlathe([[0.012, bz0], [0.034, bz0], [0.036, bz0 + 0.006], [0.036, bz0 + 0.024], [0.028, bz0 + 0.03], [0, bz0 + 0.03]], 0, by, 0, 20), C.mag, M.gloss);
  body.add(zcyl(0.026, bz0 + 0.02, bz1, 0, by, 18), C.mag, M.gloss);
  for (let k = 0; k < 3; k++) body.add(bx(0.054, 0.012, 0.012, 0, by + 0.004, bz0 + 0.07 + k * 0.035, 0.2), '#3a1420', M.satin);
  const mz = rapidNozzle(body, bz1, by, 0.054, C);
  // toothed white rear sight curling up behind the drum
  body.add(slab([P(3, 93), P(18, 92), P(40, 108), P(52, 125), P(50, 140), P(38, 140), P(32, 118), P(15, 104), P(3, 102)], 0.016, 0, 0.003), C.white, M.satin);
  for (let k = 0; k < 4; k++) { const [z, y] = P(26 + k * 7, 102 + k * 9); body.add(bx(0.018, 0.006, 0.008, 0, y + 0.005, z - 0.004, 0.3), C.white, M.satin); }
  body.add(slab([P(28, 200), P(58, 200), P(58, 222), P(28, 222)], 0.04, 0, 0.004), C.mag, M.gloss);
  // white loop: front post (support grip) and bottom bar back to the grip heel
  const [pz, pyT] = P(214, 236), [, pyB] = P(0, 300), [bz] = P(100, 0);
  body.add(slab([[pz - 0.02, pyT], [pz + 0.024, pyT], [pz + 0.02, pyB + 0.006], [pz + 0.012, pyB - 0.006], [bz, pyB - 0.004], [bz - 0.012, pyB + 0.006], [bz, pyB + 0.016],
    [pz - 0.014, pyB + 0.014], [pz - 0.02, pyB + 0.02]], 0.022, 0, 0.004), C.white, M.satin);
  const d2 = rebuild(d, {
    body, ink, parts: { trigger: part(trig, TRIGGER_PIVOT) },
    // the support hand holds the white loop's front post
    gripL: gripSpec([0, (pyT + pyB) / 2 + 0.008, pz + 0.002], [0, 1, -0.1], [0.45, -0.05, -1]),
    muzzle: [0, by, mz + 0.004],
  });
  d2.muzzlePart = null;
  return d2;
}

// ===================================================================================== S-BLAST '92
// Wmn_Blaster_Precision. Handle 53 px → s = 0.00205 (≈ 0.79 m). A shoulder-fired launcher after
// the Super Scope: pale gray rear stock / top shroud with a printed logo, black shoulder hook and
// rest underneath, dark barrel flaring to a thick red muzzle ring, a black scope on two mounts, a
// purple button, a black front sight hood. The gameplay clips show no shape change between the
// grounded (long-range) and airborne (short-range) modes.
function sblast(d) {
  const s = 0.00205, P = px(188, 260, s);
  const C = { gray: '#a9a9a6', grayD: '#8a8a87', barrel: '#3c3d3f', black: '#1b1c1f', red: '#e2401f', purple: '#4a3fa0' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.black, triggerColor: C.black, guard: false, len: 0.056, w: 0.0135, d: 0.017 });
  const Y = 0.135;
  // dark barrel flaring toward the muzzle
  const [b0] = P(135, 0), [b1] = P(322, 0);
  body.add(zlathe([[0, b0], [0.07, b0], [0.074, b0 + 0.02], [0.082, (b0 + b1) / 2], [0.093, b1], [0, b1]], 0, Y, 0, 32), C.barrel, M.satin);
  // thick red muzzle ring with a dark bore
  body.add(zlathe([[0.07, b1 - 0.01], [0.096, b1 - 0.012], [0.106, b1 + 0.01], [0.109, b1 + 0.045], [0.104, b1 + 0.062], [0.092, b1 + 0.066], [0.078, b1 + 0.06], [0.07, b1 + 0.04]], 0, Y, 0, 36), C.red, M.gloss);
  body.add(zlathe([[0, b1 - 0.02], [0.072, b1 - 0.02], [0.072, b1 + 0.045], [0.06, b1 + 0.04], [0, b1 + 0.02]], 0, Y, 0, 28), '#121214', M.satin);
  // gray stock / top shroud (side profile) and lower receiver behind the grip
  body.add(slab(smoothOutline([P(4, 190), P(22, 165), P(70, 160), P(150, 158), P(200, 162), P(250, 160), P(300, 140), P(318, 146), P(300, 165), P(240, 178),
    P(150, 182), P(140, 230), P(120, 240), P(80, 233), P(25, 213)], 64), 0.13, 0, 0.012), C.gray, M.satin);
  body.add(slab([P(170, 230), P(215, 226), P(212, 245), P(172, 245)], 0.05, 0, 0.004), C.grayD, M.satin);
  body.add(slab([P(105, 238), P(150, 238), P(118, 262), P(100, 262)], 0.06, 0, 0.004), C.gray, M.satin);
  for (let k = 0; k < 3; k++) { const [z, y] = P(40 + k * 22, 163); body.add(bx(0.11, 0.004, 0.022, 0, y + 0.002, z, 0.3).rotateY(0).translate(0, 0, 0), C.grayD, M.satin); }
  for (const sx of [-1, 1]) {
    const [lz, ly] = P(65, 195); body.add(bx(0.002, 0.04, 0.15, sx * 0.0655, ly, lz, 0.2), '#4a4b4e', M.print);
    body.add(bx(0.0025, 0.022, 0.1, sx * 0.0665, ly - 0.002, lz + 0.01, 0.2), '#d8d8d4', M.print);
    const [gz, gy] = P(270, 175); body.add(bx(0.002, 0.02, 0.09, sx * 0.0645, gy, gz, 0.2), C.grayD, M.print);
  }
  // shoulder hook (rear blade) and rest plate under the stock
  body.add(slab([P(12, 243), P(62, 240), P(80, 244), P(76, 254), P(20, 256), P(10, 250)], 0.05, 0, 0.004), C.black, M.rubber);
  body.add(slab([P(78, 252), P(110, 252), P(108, 292), P(84, 292)], 0.045, 0, 0.004), C.black, M.rubber);
  // scope on two mounts, purple button, front sight hood
  const [sz0, sy] = P(138, 135), [sz1] = P(214, 0);
  body.add(zlathe([[0, sz0], [0.026, sz0], [0.028, sz0 + 0.012], [0.019, sz0 + 0.022], [0.019, sz1 - 0.026], [0.027, sz1 - 0.012], [0.027, sz1], [0, sz1]], 0, sy, 0, 20), C.black, M.satin);
  body.add(zcyl(0.02, sz1 - 0.004, sz1 + 0.001, 0, sy, 16), '#3a4a5a', M.lens);
  for (const z of [sz0 + 0.04, sz1 - 0.04]) body.add(bx(0.016, sy - P(0, 160)[1], 0.014, 0, (sy + P(0, 160)[1]) / 2, z, 0.3), C.grayD, M.metal);
  const [pz, py] = P(140, 155);
  body.add(sphere(0.017, 0.012, 0.017, 0, py, pz, 14, 10), C.purple, M.gloss);
  body.add(bx(0.03, 0.01, 0.03, 0, py - 0.008, pz, 0.3), C.black, M.satin);
  const [hz0, hy0] = P(298, 112), [hz1, hy1] = P(358, 142);
  body.add(slab([[hz0, hy1 - 0.01], [hz0 + 0.02, hy0], [hz1, hy0], [hz1, hy1 - 0.02], [hz1 - 0.02, hy1 - 0.035], [hz0, hy1 - 0.035]], 0.05, 0, 0.006), C.black, M.satin);
  body.add(bx(0.014, 0.022, 0.01, -0.02, P(0, 132)[1], P(280, 0)[0], 0.3), C.black, M.satin);
  const d2 = rebuild(d, {
    body, ink, parts: { trigger: part(trig, TRIGGER_PIVOT) },
    // support hand under the barrel ahead of the grip (S-BLAST '92 firing clip)
    gripL: gripSpec([0, 0.03, 0.15], [0, 0.15, 1], [0.7, -0.7, 0.05]),
    muzzle: [0, Y, b1 + 0.03],
  });
  d2.muzzlePart = null;
  return d2;
}

// ===================================================================================== holds
// Splatoon 3 Blasters are aimed high: the clips (Luna / Rapid / S-BLAST firing, Blaster promo
// screenshot, Octoling Range Blaster key art) show the weapon at shoulder / eye height with the
// rear by the cheek, the long launchers (Range, S-BLAST) resting on the right shoulder.
const HOLD_BLASTER = { aim: { p: [-0.09, -0.045, 0.24], r: [0, 0.05, 0] } };
const HOLD_LUNA = { aim: { p: [-0.04, 0.06, 0.25], r: [0, 0.04, 0] } };
const HOLD_EYE = { aim: { p: [-0.06, 0.0, 0.21], r: [0, 0.04, 0] } };      // Rapid: rear by the cheek, eye level
const HOLD_EYE_LONG = { aim: { p: [-0.06, 0.0, 0.25], r: [0, 0.04, 0] } };
const HOLD_SHOULDER = { aim: { p: [-0.12, -0.05, 0.22], r: [0, 0.03, 0] } }; // launchers on the right shoulder

export const MODELS = {
  blaster: { sourceModel: 'Wmn_Blaster_Middle', build: blaster, animate: blasterAnimate, hold: HOLD_BLASTER },
  's3-blaster-short': { sourceModel: 'Wmn_Blaster_Short', build: luna, animate: lunaAnimate, hold: HOLD_LUNA },
  's3-blaster-long': { sourceModel: 'Wmn_Blaster_Long', build: rangeBlaster, hold: HOLD_SHOULDER },
  's3-blaster-lightshort': { sourceModel: 'Wmn_Blaster_LightShort', build: clash, hold: HOLD_EYE },
  's3-blaster-light': { sourceModel: 'Wmn_Blaster_Light', build: rapid, hold: HOLD_EYE },
  's3-blaster-lightlong': { sourceModel: 'Wmn_Blaster_LightLong', build: rapidPro, hold: HOLD_EYE_LONG },
  's3-blaster-precision': { sourceModel: 'Wmn_Blaster_Precision', build: sblast, hold: HOLD_SHOULDER },
};
