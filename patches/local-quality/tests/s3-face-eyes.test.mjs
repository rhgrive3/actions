import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, qualityIdentity } from '../adapter.mjs';
import { adaptS3FaceEyes } from '../s3-face-eyes-adapter.mjs';
import { readSource, UPSTREAM } from '../../reliability/tests/hud-fixture.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';

const S3_FACE_EYES_FILES = ['src/game/character-face.js', 'src/game/character-mats.js', 'src/game/character-geo.js'];
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

test('S3 face eyes: composed modules parse and the adapter is a build-only quality module', () => {
  for (const rel of S3_FACE_EYES_FILES) new vm.SourceTextModule(compose(rel));
  assert.ok(JSON.stringify(qualityIdentity()).includes('s3-face-eyes-adapter.mjs'));
  assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/s3-face-eyes-adapter.mjs'));
});

test('S3 face eyes: the opening is wider than tall and spaced across the face', async () => {
  const { face } = await realm();
  const pts = aperture(face);
  const xs = pts.map((q) => q.p.x), ys = pts.map((q) => q.p.y);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  assert.ok(w / h > 1.2 && w / h < 1.6, `opening aspect ${w / h}`);
  // centre-to-centre spacing about two opening widths of the face's half width (the amiibo/model sheet proportions)
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  assert.ok(cx > 0.075 && cx < 0.1, `eye centre x ${cx}`);
});

test('S3 face eyes: the goggle covers the opening with a thin border and no wings', async () => {
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

test('S3 face eyes: the shader mask is the same shape as the geometry mask', async () => {
  const { face, matsSource } = await realm();
  const glsl = matsSource.slice(matsSource.indexOf('float iwVisorSD(float az, float el){'), matsSource.indexOf('float iwHairline('));
  // instantiate the template exactly as the module does, then read the GLSL back as JS
  const body = new Function('MASK', 'return `' + glsl.replace(/`/g, '\\`') + '`;')(face.MASK);
  const js = body
    .replace('float iwVisorSD(float az, float el){', 'return (az, el) => {')
    .replace(/\bfloat\b/g, 'let').replace(/\babs\(/g, 'Math.abs(').replace(/\bpow\(/g, 'Math.pow(').replace(/\bexp\(/g, 'Math.exp(')
    .replace(/\bmin\(/g, 'Math.min(').replace(/iwSmax\(/g, 'smax(');
  const smax = (a, b, k) => { const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (a - b) / k)); return b + (a - b) * h + k * h * (1 - h); };
  const shaderSD = new Function('smax', js)(smax);
  for (let az = -1.4; az <= 1.4; az += 0.05) for (let el = -0.4; el <= 0.6; el += 0.05)
    assert.ok(Math.abs(shaderSD(az, el) - face.visorSD(az, el)) < 2e-3, `pigment vs geometry at ${az.toFixed(2)},${el.toFixed(2)}`);
});

test('S3 face eyes: every face detail level builds finite geometry', async () => {
  const { face } = await realm();
  for (let lv = 0; lv <= 4; lv++) {
    const { geo } = face.buildFaceSkin(lv);
    const P = geo.attributes.position.array;
    assert.ok(P.length > 0 && P.every(Number.isFinite), `level ${lv}`);
    assert.ok(geo.index.array.every((i) => i < P.length / 3), `level ${lv} indices`);
  }
});

test('S3 face eyes: blinking lids are mask-black, the iris is round on the wider ball', async () => {
  const { matsSource } = await realm();
  assert.match(matsSource, /vIwLid = abs\(a\);/);
  assert.match(matsSource, /iwVisor = max\(iwVisor, smoothstep\(0\.08, 0\.15, vIwLid\)\);/);
  assert.match(matsSource, /vec2 iq = ip\.xy \* vec2\(\$\{\(FACE_SHADER\.eyeR\.x \/ FACE_SHADER\.eyeR\.y\)\.toFixed\(4\)\}, 1\.0\) \/ sin\(uIrisR\);/);
  assert.match(matsSource, /float pd = length\(iq\) - pr;/);
});

test('S3 face eyes: missing or duplicated anchors fail closed; other files pass through', () => {
  for (const rel of S3_FACE_EYES_FILES) {
    const raw = readSource(rel);
    for (const input of ['', raw + raw]) assert.throws(() => adaptS3FaceEyes(rel, input), /S3 face eyes conflict/);
  }
  assert.equal(adaptS3FaceEyes('src/game/actor.js', 'unchanged'), 'unchanged');
});
