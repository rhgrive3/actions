// Render-only Splatana wave presentation.
//
// The source-backed wave travels ~3.3 m per 60 Hz frame and lives 4-6 frames,
// so the calibrated crescent (s3-projectile-shapes.mjs) is drawn at only two
// or three far-apart places and then vanishes. On screen that reads as a small
// blob jumping away instead of an ink wave. This owner adds, without touching
// position, collision, damage, paint, network packets or the existing meshes:
//   1. an in-flight smear: two thinner crescents between the previous and the
//      current drawn position, so the wave reads as one continuous sweep;
//   2. a dissolve: after the projectile retires, a decelerating crescent that
//      sinks, widens, thins and sheds droplets for a few frames;
//   3. heavier spray: visual-only droplets along the crescent span.
// Every value below is INKWAVE visual calibration, not recovered Nintendo
// effect data. Retail comparison is still pending (see the behaviour report).
import { crescentGeometry, S3_SHAPE, splatanaHorizontalSweep } from './s3-projectile-shapes.mjs';

const INSTALLED = Symbol.for('inkwave.splatana-wave-presentation.v1');
export const SPLATANA_WAVE = Object.freeze({
  smearCopies: 2,          // crescents between the previous and current position
  smearScale: 0.82,
  dissolveSeconds: 0.2,    // after the gameplay projectile retires
  dissolveDrag: 11,        // 1/s exponential slowdown of the carried speed
  dissolveSpeedCap: 26,    // m/s carried into the dissolve
  dissolveSink: 3.2,       // m/s^2 downward pull while dissolving
  flightSpray: 2,          // droplets per drawn flight frame
  dissolveSpray: 12,       // droplets released when the wave breaks
  dropSize: [0.022, 0.05], // fx.drop radius (m); native splashes use 0.012-0.05
  dropForward: [0.06, 0.16], // share of the carried wave speed
  dropUp: [0.8, 2.6],      // m/s
});
const MAX_WAVES = 48;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fract = (x) => x - Math.floor(x);
const hash = (a, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

function isSlash(p) { return p && (p.s3Shape === 'slash-h' || p.s3Shape === 'slash-v') && !(p.delay > 0) && p.owner?.color; }

function createState(THREE, scene) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0, envMapIntensity: 1.2 });
  const mk = (shape) => {
    const mesh = new THREE.InstancedMesh(crescentGeometry(THREE, shape), mat, MAX_WAVES);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false; mesh.castShadow = false;
    scene.add(mesh);
    return mesh;
  };
  return {
    meshH: mk(S3_SHAPE.slashH), meshV: mk(S3_SHAPE.slashV), mat,
    live: new Map(), dissolving: [], lastTime: null,
    m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), v: new THREE.Vector3(),
    x: new THREE.Vector3(), y: new THREE.Vector3(), basis: new THREE.Matrix4(), UP: new THREE.Vector3(0, 1, 0),
    dv: new THREE.Vector3(), THREE,
  };
}

function orient(W, f, horizontal) {
  const { x, y, basis, q, UP } = W;
  x.crossVectors(UP, f); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); x.normalize();
  y.crossVectors(f, x).normalize();
  if (horizontal) basis.makeBasis(x, y, f); else basis.makeBasis(y, x.clone().negate(), f);
  return q.setFromRotationMatrix(basis);
}

// Visual-only droplets along the crescent span (no paint, no collision owner).
function spray(W, fx, rec, at, n, speed, seedBase) {
  if (!fx?.drop || n <= 0) return;
  const { x, y, dv, v } = W;
  const span = rec.kind === 'slash-v' ? S3_SHAPE.slashV.halfSpan : S3_SHAPE.slashH.halfSpan;
  const [s0, s1] = SPLATANA_WAVE.dropSize;
  for (let i = 0; i < n; i++) {
    const h1 = hash(seedBase + i * 1.37, 1), h2 = hash(seedBase + i * 2.11, 2), h3 = hash(seedBase + i * 0.73, 3);
    const a = (h1 * 2 - 1) * span * 0.95;
    v.copy(at);
    if (rec.horizontal) v.addScaledVector(x, a); else v.addScaledVector(y, a);
    const [f0, f1] = SPLATANA_WAVE.dropForward, [u0, u1] = SPLATANA_WAVE.dropUp;
    dv.copy(rec.f).multiplyScalar(speed * (f0 + (f1 - f0) * h2));
    if (rec.horizontal) dv.addScaledVector(x, a * 0.9); else dv.addScaledVector(y, a * 0.6);
    dv.y += u0 + (u1 - u0) * h3;
    fx.drop(v, dv, rec.color, { size: s0 + (s1 - s0) * h2, life: 0.45 + 0.35 * h3, gravity: 1, stretch: 1, quiet: true });
  }
}

export function drawSplatanaWaves(system, THREE, G) {
  let W = system._splatanaWaves;
  const any = system.list.some(isSlash);
  if (!W && !any) return 0;
  if (!W) W = system._splatanaWaves = createState(THREE, system.scene);
  const now = Number.isFinite(G?.time) ? G.time : 0;
  const dt = W.lastTime == null ? 0 : clamp(now - W.lastTime, 0, 0.1);
  W.lastTime = now;
  const fx = G?.fx;
  const seen = new Set();
  let nh = 0, nv = 0;
  const put = (rec, pos, sx, sy, sz) => {
    const horizontal = rec.horizontal, mesh = horizontal ? W.meshH : W.meshV;
    const n = horizontal ? nh : nv;
    if (n >= MAX_WAVES) return;
    orient(W, rec.f, horizontal);
    W.m.compose(pos, W.q, W.s.set(sx, sy, sz));
    mesh.setMatrixAt(n, W.m); mesh.setColorAt(n, rec.color);
    if (horizontal) nh++; else nv++;
  };
  for (const p of system.list) {
    if (!isSlash(p)) continue;
    seen.add(p);
    let rec = W.live.get(p);
    const vel = p.vel, sp = vel ? vel.length() : 0;
    if (!rec || rec.seed !== p.seed || p.age < rec.age) {
      rec = { kind: p.s3Shape, horizontal: splatanaHorizontalSweep(p, p.s3Shape), f: new THREE.Vector3(0, 0, 1),
        pos: p.pos.clone(), prev: p.pos.clone(), color: p.owner.color.clone(), seed: p.seed || 0, age: p.age, speed: sp, sprayN: 0 };
      if (p.start) rec.prev.copy(p.start);
      W.live.set(p, rec);
    } else rec.prev.copy(rec.pos);
    if (sp > 1e-4) rec.f.copy(vel).multiplyScalar(1 / sp);
    rec.pos.copy(p.pos); rec.age = p.age; rec.speed = sp; rec.color.copy(p.owner.color);
    // in-flight smear between the previous and current drawn position
    const k = SPLATANA_WAVE.smearScale;
    for (let i = 1; i <= SPLATANA_WAVE.smearCopies; i++) {
      const t = i / (SPLATANA_WAVE.smearCopies + 1);
      W.v.copy(rec.prev).lerp(rec.pos, t);
      const sc = k * (0.7 + 0.3 * t);
      put(rec, W.v, sc, sc * 0.75, sc * 1.25);
    }
    if (dt > 0 && (p.owner.isLocal || p.owner._nearCamera?.())) {
      spray(W, fx, rec, rec.pos, SPLATANA_WAVE.flightSpray, Math.min(sp, SPLATANA_WAVE.dissolveSpeedCap), rec.seed * 97 + rec.sprayN);
      rec.sprayN += SPLATANA_WAVE.flightSpray;
    }
  }
  // retired projectiles start dissolving from their last drawn place
  for (const [p, rec] of W.live) {
    if (seen.has(p)) continue;
    W.live.delete(p);
    if (W.dissolving.length >= MAX_WAVES) continue;
    rec.t = 0; rec.speed = Math.min(rec.speed, SPLATANA_WAVE.dissolveSpeedCap); rec.vy = 0;
    W.dissolving.push(rec);
    if (p.owner?.isLocal || p.owner?._nearCamera?.()) {
      orient(W, rec.f, rec.horizontal);
      spray(W, fx, rec, rec.pos, SPLATANA_WAVE.dissolveSpray, rec.speed, rec.seed * 131 + 7);
    }
  }
  const life = SPLATANA_WAVE.dissolveSeconds;
  for (let i = W.dissolving.length - 1; i >= 0; i--) {
    const rec = W.dissolving[i];
    rec.t += dt;
    if (rec.t >= life) { W.dissolving.splice(i, 1); continue; }
    rec.speed *= Math.exp(-SPLATANA_WAVE.dissolveDrag * dt);
    rec.vy -= SPLATANA_WAVE.dissolveSink * dt;
    rec.pos.addScaledVector(rec.f, rec.speed * dt); rec.pos.y += rec.vy * dt;
    const u = rec.t / life, e = u * u * (3 - 2 * u);
    // widens and thins while it falls apart
    put(rec, rec.pos, 1 + 0.35 * e, Math.max(0.05, 1 - 0.95 * e), Math.max(0.05, 1 - 0.7 * e));
  }
  for (const [mesh, n] of [[W.meshH, nh], [W.meshV, nv]]) {
    mesh.count = n; mesh.visible = n > 0;
    if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
  }
  return nh + nv;
}

export function installSplatanaWavePresentation(api) {
  const { Projectiles, THREE, G } = api || {};
  const P = Projectiles?.prototype;
  if (!P || !THREE || Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  const draw = P._draw, clear = P.clear;
  P._draw = function (...args) {
    const result = draw.apply(this, args);
    try { this.splatanaWaveCount = drawSplatanaWaves(this, THREE, G); }
    catch (error) { console.error('[inkwave] splatana wave presentation', error); }
    return result;
  };
  if (typeof clear === 'function') P.clear = function (...args) {
    const result = clear.apply(this, args);
    const W = this._splatanaWaves;
    if (W) { W.live.clear(); W.dissolving.length = 0; W.meshH.count = W.meshV.count = 0; W.meshH.visible = W.meshV.visible = false; }
    return result;
  };
}
