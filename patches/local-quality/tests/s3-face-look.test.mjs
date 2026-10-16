import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, qualityIdentity } from '../adapter.mjs';
import { adaptS3FaceLook } from '../s3-face-look-adapter.mjs';
import { readSource, UPSTREAM } from '../../reliability/tests/hud-fixture.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';

const S3_FACE_EYES_FILES = ['src/game/character-face.js', 'src/game/character-mats.js', 'src/game/character-geo.js', 'src/game/character.js'];
const compose = (rel, input = readSource(rel)) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, input))));

// The composed face + material modules in one realm (three from the vendored build), as the site serves them.
let realmCache;
async function realm() {
  if (realmCache) return realmCache;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  const load = (file) => {
    if (modules.has(file)) return modules.get(file);
    const rel = path.relative(UPSTREAM, file).split(path.sep).join('/');
    const source = rel.startsWith('src/') ? compose(rel) : readSource(rel);
    const m = new vm.SourceTextModule(source, { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, m); return m;
  };
  const link = (spec, from) => load(spec === 'three' ? path.join(UPSTREAM, 'vendor/three/build/three.module.js') : path.resolve(path.dirname(from.identifier), spec));
  const face = load(path.join(UPSTREAM, 'src/game/character-face.js'));
  const mats = load(path.join(UPSTREAM, 'src/game/character-mats.js'));
  for (const m of [face, mats]) { await m.link(link); await m.evaluate(); }
  return (realmCache = { face: face.namespace, mats: mats.namespace, matsSource: compose('src/game/character-mats.js') });
}

// The eye opening (aperture rim on the eyeball) in the head's (az, el), left eye.
function aperture(face) {
  const { EYE_FRAMES, EYEB, HEAD_C } = face, F = EYE_FRAMES[0], pts = [];
  for (let k = 0; k < 64; k++) {
    const phi = (k / 64) * Math.PI * 2, s = Math.sin(phi);
    const x = EYEB.xh * Math.cos(phi), lam = EYEB.l0 + s * (s > 0 ? EYEB.hu : EYEB.hl), c = Math.sqrt(1 - x * x);
    const p = F.C.clone().add(new F.C.constructor(x, c * Math.sin(lam), c * Math.cos(lam)).applyMatrix3(F.M));
    const q = p.clone().sub(HEAD_C);
    pts.push({ p, az: Math.atan2(q.x, q.z), el: Math.asin(q.y / q.length()) });
  }
  return pts;
}

test('S3 face look: composed modules parse and the adapter is a build-only quality module', () => {
  for (const rel of S3_FACE_EYES_FILES) new vm.SourceTextModule(compose(rel));
  assert.ok(JSON.stringify(qualityIdentity()).includes('s3-face-look-adapter.mjs'));
  assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/s3-face-look-adapter.mjs'));
});

test('S3 face look: the opening is wider than tall and spaced across the face', async () => {
  const { face } = await realm();
  const pts = aperture(face);
  const xs = pts.map((q) => q.p.x), ys = pts.map((q) => q.p.y);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  assert.ok(w / h > 1.2 && w / h < 1.6, `opening aspect ${w / h}`);
  // centre-to-centre spacing about two opening widths of the face's half width (the amiibo/model sheet proportions)
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  assert.ok(cx > 0.075 && cx < 0.1, `eye centre x ${cx}`);
});

test('S3 face look: the goggle covers the opening with a thin border and no wings', async () => {
  const { face } = await realm();
  const { visorSD } = face, pts = aperture(face);
  const ca = pts.reduce((s, q) => s + q.az, 0) / pts.length, ce = pts.reduce((s, q) => s + q.el, 0) / pts.length;
  for (const q of pts) {
    // the rim and a lid margin just outside it are pigment
    const da = q.az - ca, de = q.el - ce, n = Math.hypot(da, de);
    assert.ok(visorSD(q.az, q.el) > 0 && visorSD(q.az + 0.02 * da / n, q.el + 0.02 * de / n) > 0, `mask covers the rim at ${q.az},${q.el}`);
    // and the border stays thin: well past the rim is skin again (toward the nose the bridge carries on)
    if (da / n > -0.5) assert.ok(visorSD(q.az + 0.13 * da / n, q.el + 0.13 * de / n) < 0, `thin border at ${q.az},${q.el}`);
  }
  // a nose bridge joins the two lobes below the eye line, dipping at the centre
  assert.ok(visorSD(0, ce - 0.06) > 0 && visorSD(0, ce + 0.12) < 0);
  // no long wings toward the ears (the previous mask swept up past az 1.2)
  for (let el = -0.3; el <= 0.6; el += 0.02) assert.ok(visorSD(1.1, el) < 0 && visorSD(-1.1, el) < 0);
});

test('S3 face look: the mask top is one smooth line falling from over the eye to the bridge', async () => {
  const { face } = await realm();
  // top edge elevation per azimuth (bisection on the signed distance, searching down from the forehead)
  const topAt = (az) => { let lo = -0.1, hi = 0.6; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (face.visorSD(az, m) > 0) lo = m; else hi = m; } return lo; };
  const xs = [], ts = [];
  for (let az = 0; az <= 0.54; az += 0.02) { xs.push(az); ts.push(topAt(az)); }   // bridge → middle of the eye
  for (let i = 1; i < ts.length; i++) assert.ok(ts[i] >= ts[i - 1] - 1e-6, `top keeps rising outward at az ${xs[i].toFixed(2)}`);
  // no step: the slope changes gradually everywhere between the bridge and the eye
  for (let i = 2; i < ts.length; i++) {
    const s1 = (ts[i - 1] - ts[i - 2]) / 0.02, s2 = (ts[i] - ts[i - 1]) / 0.02;
    assert.ok(Math.abs(s2 - s1) < 0.35, `top edge bends sharply at az ${xs[i].toFixed(2)} (${s1.toFixed(2)} → ${s2.toFixed(2)})`);
  }
  assert.ok(ts[ts.length - 1] - ts[0] > 0.2, 'the bridge sits well below the top over the eye');
});

test('S3 face look: the shader mask is the same shape as the geometry mask', async () => {
  const { face, matsSource } = await realm();
  const glsl = matsSource.slice(matsSource.indexOf('float iwVisorSD(float az, float el){'), matsSource.indexOf('float iwHairline('));
  // instantiate the template exactly as the module does, then read the GLSL back as JS
  const body = new Function('MASK', 'return `' + glsl.replace(/`/g, '\\`') + '`;')(face.MASK);
  const js = body
    .replace('float iwVisorSD(float az, float el){', 'return (az, el) => {')
    .replace(/\bfloat\b/g, 'let').replace(/\babs\(/g, 'Math.abs(').replace(/\bpow\(/g, 'Math.pow(').replace(/\bexp\(/g, 'Math.exp(')
    .replace(/\bmin\(/g, 'Math.min(').replace(/\bmax\(/g, 'Math.max(').replace(/iwSmax\(/g, 'smax(');
  const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const smax = (a, b, k) => { const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (a - b) / k)); return b + (a - b) * h + k * h * (1 - h); };
  const shaderSD = new Function('smax', 'smoothstep', js)(smax, smoothstep);
  for (let az = -1.4; az <= 1.4; az += 0.05) for (let el = -0.4; el <= 0.6; el += 0.05)
    assert.ok(Math.abs(shaderSD(az, el) - face.visorSD(az, el)) < 2e-3, `pigment vs geometry at ${az.toFixed(2)},${el.toFixed(2)}`);
});

test('S3 face look: every face detail level builds finite geometry', async () => {
  const { face } = await realm();
  for (let lv = 0; lv <= 4; lv++) {
    const { geo } = face.buildFaceSkin(lv);
    const P = geo.attributes.position.array;
    assert.ok(P.length > 0 && P.every(Number.isFinite), `level ${lv}`);
    assert.ok(geo.index.array.every((i) => i < P.length / 3), `level ${lv} indices`);
  }
});

test('S3 face look: a thin, even mask border over each eye and a thin bridge', async () => {
  const { face } = await realm();
  const { acc } = face.buildFaceSkin(4);
  const topAt = (az) => { let lo = -0.2, hi = 0.6; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (face.visorSD(az, m) > 0) lo = m; else hi = m; } return lo; };
  const botAt = (az) => { let lo = -0.6, hi = 0.05; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (face.visorSD(az, m) > 0) hi = m; else lo = m; } return hi; };
  // upper lid edge (margin roll) of the left eye, binned by azimuth
  const edge = new Map();
  for (let i = 0; i < acc.P.length; i++) {
    if (acc.part[i] !== 3 || acc.uv[i][0] <= 0.5 || acc.P[i].x <= 0 || !(acc.lid[i][0] > 0)) continue;
    const q = acc.P[i].clone().sub(face.HEAD_C), az = Math.atan2(q.x, q.z), el = Math.asin(q.y / q.length());
    const k = Math.round(az * 50); edge.set(k, Math.max(edge.get(k) ?? -9, el));
  }
  let n = 0;
  for (const [k, el] of edge) {
    const az = k / 50; if (az < 0.36 || az > 0.74) continue;     // over the eye (the inner end slopes into the bridge)
    const gap = topAt(az) - el; n++;
    assert.ok(gap > 0.008 && gap < 0.035, `mask margin over the lid edge ${gap.toFixed(3)} at az ${az.toFixed(2)}`);
  }
  assert.ok(n > 10);
  assert.ok(topAt(0) - botAt(0) < 0.12, `bridge thickness ${(topAt(0) - botAt(0)).toFixed(3)}`);
  // the bottom edge is one smooth curve from the bridge to the outer corner: it falls, then rises, with no bumps
  const bs = []; for (let az = 0; az <= 0.82; az += 0.02) bs.push(botAt(az));
  const sl = bs.slice(1).map((v, i) => v - bs[i]);
  let turns = 0; for (let i = 1; i < sl.length; i++) if (Math.sign(sl[i]) !== Math.sign(sl[i - 1]) && Math.abs(sl[i]) > 1e-5) turns++;
  assert.equal(turns, 1, 'bottom edge has exactly one low point under the eye');
  // and it stays under the lower lid's inner wall, which would otherwise break the line
  for (let i = 0; i < acc.P.length; i++) {
    if (acc.part[i] !== 3 || !(acc.uv[i][0] > 0) || acc.P[i].x <= 0) continue;
    const q = acc.P[i].clone().sub(face.HEAD_C), az = Math.atan2(q.x, q.z), el = Math.asin(q.y / q.length());
    if (az > 0.2 && az < 0.82) assert.ok(el >= botAt(az) - 0.002, `lid wall below the mask line at az ${az.toFixed(2)}`);
  }
});

test('S3 face look: lids move only inside the mask, so a blink closes black within a fixed outline', async () => {
  const { face } = await realm();
  const { acc } = face.buildFaceSkin(4);
  let moving = 0;
  for (let i = 0; i < acc.P.length; i++) {
    const [up, low] = acc.lid[i];
    assert.equal(low, 0, 'the lower lid stays put; the upper lid comes all the way down');
    if (up < 0.02) continue;
    moving++;
    const q = acc.P[i].clone().sub(face.HEAD_C);
    const az = Math.atan2(q.x, q.z), el = Math.asin(q.y / q.length());
    // a few margin vertices tuck under the ball (hidden), so they may project just past the edge from the head centre
    assert.ok(face.visorSD(az, el) > -0.01, `moving lid vertex outside the mask at ${az.toFixed(3)},${el.toFixed(3)}`);
  }
  assert.ok(moving > 100);
});

test('S3 face look: no socket bowl outside the mask, closed lids cover the ball black, round iris', async () => {
  const { face, matsSource } = await realm();
  const { acc } = face.buildFaceSkin(4);
  const s = new face.HEAD_C.constructor();
  let checked = 0;
  for (let i = 0; i < acc.P.length; i++) {
    if (acc.part[i] !== 3 || acc.uv[i][0] > 0) continue;             // eye ring patches (not the lid's inner wall)
    const q = acc.P[i].clone().sub(face.HEAD_C), r = q.length();
    const az = Math.atan2(q.x, q.z), el = Math.asin(q.y / r);
    if (face.visorSD(az, el) > -0.01) continue;                        // under the mask the lids may sit lower
    face.headSurfFace(az, el, 0, s);
    // flush with the face; only past the outer corner may the skin rise a little over the wide eyeball
    // (above its outer-top corner the tilted ball sits up to ~4.6 mm proud of the head sphere, so the skin follows it in a
    // broad, gentle rise; a socket bowl dipped instead)
    const off = r - s.sub(face.HEAD_C).length();
    assert.ok(off > -0.001 && off < 0.005, `skin off the face by ${off.toFixed(4)} m at ${az.toFixed(3)},${el.toFixed(3)}`);
    checked++;
  }
  assert.ok(checked > 100);
  assert.match(matsSource, /vec2 iq = ip\.xy \* vec2\(\$\{\(FACE_SHADER\.eyeR\.x \/ FACE_SHADER\.eyeR\.y\)\.toFixed\(4\)\}, 1\.0\) \/ sin\(uIrisR\);/);
  assert.match(matsSource, /float pd = length\(iq\) - pr;/);
  assert.match(matsSource, /col = mix\(col, vec3\(0\.012, 0\.0135, 0\.02\), lidCover\);/);
});

test('S3 face look: a projecting nose, and the face stays upright through the mouth', async () => {
  const { face } = await realm();
  const V = face.HEAD_C.constructor, n = new V();
  const tip = face.headSurfFace(0, -0.182, 0, new V()), cheek = face.headSurfFace(0.25, -0.182, 0, new V());
  assert.ok(tip.z - cheek.z > 0.02, `nose stands ${(tip.z - cheek.z).toFixed(4)} m proud of the cheeks`);
  face.headSurfFace(0, face.MOUTH.el, 0, new V(), n);
  assert.ok(n.y > -0.42 && n.z > 0.9, `mouth surface normal ${n.y.toFixed(3)},${n.z.toFixed(3)}`);
});

test('S3 face look: missing or duplicated anchors fail closed; other files pass through', () => {
  for (const rel of S3_FACE_EYES_FILES) {
    const raw = readSource(rel);
    for (const input of ['', raw + raw]) assert.throws(() => adaptS3FaceLook(rel, input), /S3 face look conflict/);
  }
  assert.equal(adaptS3FaceLook('src/game/actor.js', 'unchanged'), 'unchanged');
});
