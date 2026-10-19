// Splatoon 3 firing ink: the torn ink sheets each main weapon throws out at the
// moment of firing, and the Sloshing Machine's spinning membrane. Separate
// from the other flying rounds. Render only: never touches projectiles, collision, paint
// or packets.
//
// The shapes follow SplatoonSWEPs (github.com/zerokizo/splatoonsweps @ a7459272,
// Splatoon 2 effects re-made for Garry's Mod), with its textures and model used
// as-is (./s3-sweps-assets.mjs):
// - Shooter / Brella: lua/effects/SplatoonSWEPsMuzzleSplash.lua. Two cones of
//   16 segments open forward from the nozzle with the muzzlesplash texture
//   square-mapped onto them (apex = texture centre). The alpha-test reference
//   rises 0.1 -> 0.9 over the life so the splat tears from its thin centre out
//   to its fingers. It follows the muzzle while it lives. Length t = Lerp(f, 3, rad * scale), radius
//   r = Lerp(4f(1 - f), rad / 5, rad); the second cone runs at 2f with
//   t = Lerp(1.4f, ...). Shooter dispatch: 7 frames, scale 2, radius 25 HU.
// - Sloshing Machine: not SWEPs (its box glob and translucent spiral swirls
//   do not match Splatoon 3); see MACHINE_DRILL below.
// - Stringer / Splatana are not in SWEPs. Their swept ribbons keep the footage
//   calibration below and take the inkring membrane texture for holes and edge.
//   Stringer: twisted ribbons wrap the bow on release while droplets hang
//   (About video 03, 1.70-1.82 s). Splatana: a huge layered wave along the
//   blade arc with a torn outer edge (Splatana Wiper promotional screenshot).
// Built the same way as SWEPs, at its own scale: ss.ToHammerUnits
// (.1 * 3.28084 * 16 * 1.00965 / 1.5 HU per DU) with INKWAVE's 10 DU per metre.
import { MUZZLE_SPLASH, INK_RING } from './s3-sweps-assets.mjs';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (f, a, b) => a + (b - a) * clamp(f, 0, 1); // GMod Lerp clamps
const HU = 0.1 / (0.1 * 3.28084 * 16 * (1.00965 / 1.5)); // metres per Hammer unit

export const SHEET_STYLE = Object.freeze({ splash: 0, arc: 1 });
export const FIRE_INK = Object.freeze({
  // SWEPs shooter: a, s, r = 7, 2, 25 (MinLength 3)
  shot: Object.freeze({ style: 0, life: 7, radius: 25 * HU, length: 50 * HU, minLength: 3 * HU, layers: 2, specks: 5 }),
  // Brella has no SWEPs counterpart: same splash, sized to the canopy bloom in footage
  pellet: Object.freeze({ style: 0, life: 11, radius: 0.75, length: 1.8, minLength: 3 * HU, layers: 2, specks: 8, drip: true }),
  // tiles: inkring repeats along the sweep; solid: the wave stays whole and
  // only its outer edge tears (Splatana screenshot: no holes inside the wave)
  arrow: Object.freeze({ style: 1, life: 14, radius: 0.62, width: 0.7, arc0: -2.6, arc1: 3.6, length: 1.9, layers: 4, tiles: 3, specks: 16, hang: true }),
  'slash-v': Object.freeze({ style: 1, life: 12, radius: 2.2, width: 0.72, arc0: 1.95, arc1: -1.05, layers: 3, tiles: 3, solid: true, specks: 4, pivotY: 0.95 }),
  'slash-h': Object.freeze({ style: 1, life: 10, radius: 1.55, width: 0.55, arc0: 1.75, arc1: -1.75, layers: 2, tiles: 2, solid: true, specks: 3, pivotY: 0.9 }),
});

// Splash cone at normalised life f, per SWEPs MuzzleSplash.lua Render().
export function splashCone(cfg, f, layer) {
  if (layer) f *= 2;
  return { length: lerp(layer ? f * 0.7 : f, cfg.minLength, cfg.length), radius: lerp(4 * f * (1 - f), cfg.radius / 5, cfg.radius) };
}

function decodeAlpha(THREE, { width, height, alpha }, repeat) {
  // plain base64 decode: no atob/Buffer in every host (workers, test VMs)
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', lut = new Uint8Array(128);
  for (let i = 0; i < 64; i++) lut[B64.charCodeAt(i)] = i;
  const data = new Uint8Array(width * height);
  for (let i = 0, o = 0; i < alpha.length && o < data.length; i += 4) {
    const n = lut[alpha.charCodeAt(i)] << 18 | lut[alpha.charCodeAt(i + 1)] << 12 | lut[alpha.charCodeAt(i + 2)] << 6 | lut[alpha.charCodeAt(i + 3)];
    data[o++] = n >> 16 & 255; if (o < data.length) data[o++] = n >> 8 & 255; if (o < data.length) data[o++] = n & 255;
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.flipY = false; tex.unpackAlignment = 1; tex.needsUpdate = true;
  return tex;
}

function sheetGeometry(THREE, nu = 32, nv = 8) {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3), idx = [];
  let k = 0;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { pos[k++] = i / nu; pos[k++] = j / nv; pos[k++] = 0; }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + nu + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 64);
  return g;
}

const NOISE = `
  float s3h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float s3n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(s3h(i), s3h(i + vec2(1.0, 0.0)), f.x), mix(s3h(i + vec2(0.0, 1.0)), s3h(i + vec2(1.0, 1.0)), f.x), f.y); }`;

// aSheetA: (0 = splash | arc texture tiles (+0.25 = solid), age 0..1, seed, length)
// aSheetB: (radius, width, arc0, arc1)
const SHEET_VERTEX = `
  attribute vec4 aSheetA;
  attribute vec4 aSheetB;
  varying vec2 vS3Uv;
  varying vec4 vS3A;
  ${NOISE}
  vec3 s3SheetP(float u, float v) {
    float age = aSheetA.y, seed = aSheetA.z;
    if (aSheetA.x < 0.5) {
      // SWEPs muzzle splash: apex at the nozzle, rim (radius r) at length t along +Z
      float th = u * 6.2831853;
      return vec3(cos(th) * aSheetB.x * v, sin(th) * aSheetB.x * v, aSheetA.w * v);
    }
    // arc: swept ribbon in the local XY plane, u along the sweep, v across it
    float grow = 1.0 - pow(1.0 - clamp(age * 2.2, 0.0, 1.0), 2.0);
    float sweep = clamp(age * 3.0, 0.0, 1.0);
    float phi = mix(aSheetB.z, aSheetB.w, u * sweep);
    float rho = aSheetB.x * (1.0 - aSheetB.y + aSheetB.y * v) * (0.9 + 0.1 * grow);
    float curl = (s3n(vec2(u * 4.0 + seed * 7.0, v * 2.0)) - 0.5) * 0.35 * aSheetB.y * aSheetB.x;
    curl += (v - 0.5) * 0.25 * aSheetB.y * aSheetB.x * sin(u * 3.1 + seed * 9.0);
    // a positive length winds the ribbon forward into a spiral (Stringer)
    return vec3(cos(phi) * rho, sin(phi) * rho, curl + u * sweep * aSheetA.w);
  }
  vec3 s3SheetPos;`;

// The texture alpha doubles as a height field: screen-space bump as in three's
// perturbNormalArb, from the derivatives of the height already sampled for the
// cut, so the splat's ridges and fingers catch the light (SWEPs: ssbump).
const BUMP = `
  vec3 s3Bump(vec3 surfPos, vec3 n, vec2 dh, float face) {
    vec3 sx = normalize(dFdx(surfPos)), sy = normalize(dFdy(surfPos));
    vec3 r1 = cross(sy, n), r2 = cross(n, sx);
    float det = dot(sx, r1) * face;
    return normalize(abs(det) * n - sign(det) * (dh.x * r1 + dh.y * r2));
  }`;
const FRAGMENT_STATE = '\nfloat vS3Streak = 1.0; vec2 vS3Dh = vec2(0.0);';

const SHEET_FRAGMENT = `
  varying vec2 vS3Uv;
  varying vec4 vS3A;
  uniform sampler2D s3Splash;
  uniform sampler2D s3Ring;
  ${BUMP}`;

// Holes and edges come from the SWEPs textures by a rising alpha-test reference.
const SHEET_CUT = `
  {
    float age = vS3A.y, seed = vS3A.z, h, ref;
    vec2 uv = vS3Uv;
    if (vS3A.x < 0.5) {
      // square mapping of the rim angle (SWEPs MuzzleSplash u/v table)
      float th = uv.x * 6.2831853;
      vec2 d = vec2(cos(th), sin(th));
      h = texture2D(s3Splash, 0.5 + 0.5 * uv.y * d / max(abs(d.x), abs(d.y))).r;
      ref = mix(0.1, 0.9, age);
    } else {
      // inkring membrane laid along the sweep (texture V), across = texture U
      h = texture2D(s3Ring, vec2(uv.y, uv.x * floor(vS3A.x) + seed * 0.37)).r;
      // a solid wave keeps its body; the membrane's holes only reach in from the outer edge
      if (fract(vS3A.x) > 0.1) h = mix(1.0, h, smoothstep(0.45 - 0.35 * age, 0.95, uv.y));
      // the oldest end of the sweep thins out first; the wave stays whole early
      ref = mix(0.06, 0.85, age * age) + 0.5 * (1.0 - smoothstep(0.0, 0.08 + 0.5 * age * age, uv.x));
    }
    vS3Dh = vec2(dFdx(h), dFdy(h)) * 2.5;
    if (h < ref) discard;
    vS3Streak = 0.8 + 0.3 * h;
  }`;

// Sloshing Machine round (Splatoon 3 promotional screenshot shared by the
// owner, 2026-10-15): no ball, a long twisted ink membrane torn with holes,
// pointed and fingered at its leading end, thinning into strands back towards
// the muzzle, spinning about its flight line. Built as one helicoid ribbon:
// u runs head (0) -> tail (1) behind the round, v across through the axis.
// Owner request 2026-10-18: the membrane reads 50% larger (length and radius
// x1.5 from 2.8 / 0.5). Presentation calibration only; the round's collision,
// paint and flight are unchanged.
export const MACHINE_DRILL_SCALE = 1.5;
export const MACHINE_DRILL = Object.freeze({ length: 2.8 * MACHINE_DRILL_SCALE, radius: 0.5 * MACHINE_DRILL_SCALE, turns: 1.1, spin: 12 });
// aDrill: (length, radius, phase, seed)
const DRILL_VERTEX = `
  attribute vec4 aDrill;
  varying vec2 vS3Uv;
  varying vec2 vS3S;
  ${NOISE}
  vec3 s3DrillP(float u, float v) {
    float s = v * 2.0 - 1.0, seed = aDrill.w;
    // pointed head, widest a third back, thinning tail
    float r = aDrill.y * smoothstep(0.0, 0.22, u) * (1.0 - 0.7 * smoothstep(0.4, 1.0, u));
    r *= 0.85 + 0.3 * s3n(vec2(u * 6.0 + seed * 11.0, s * 2.0));
    float a = aDrill.z + u * ${(Math.PI * 2 * MACHINE_DRILL.turns).toFixed(5)} + (s3n(vec2(u * 3.0, seed * 5.0)) - 0.5) * 0.6;
    // the membrane billows: its two halves bow back like a wake
    float z = -u * aDrill.x - abs(s) * r * 0.35;
    return vec3(cos(a) * s * r, sin(a) * s * r, z);
  }
  vec3 s3DrillPos;`;
const DRILL_CUT = `
  {
    float u = vS3Uv.x, v = vS3Uv.y;
    float h = texture2D(s3Ring, vec2(v, u * 3.0 + vS3S.y)).r;
    vS3Dh = vec2(dFdx(h), dFdy(h)) * 2.5;
    // whole near the head, torn into strands towards the muzzle
    if (h < 0.05 + 0.5 * smoothstep(0.3, 1.0, u)) discard;
    vS3Streak = 0.8 + 0.3 * h;
  }`;

const DRILL_FRAGMENT = `
  varying vec2 vS3Uv;
  varying vec2 vS3S;
  uniform sampler2D s3Ring;
  ${BUMP}`;

function inkMaterial(THREE, key, nearDither, rim, uniforms, { vertexHead, vertexBody, fragmentHead, cut }) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.1, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    let vs = sh.vertexShader.replace('#include <common>', '#include <common>' + vertexHead);
    for (const [from, to] of vertexBody) vs = vs.replace(from, to);
    sh.vertexShader = vs;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + fragmentHead + FRAGMENT_STATE)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + cut + nearDither)
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vS3Streak;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = s3Bump(-vViewPosition, normal, vS3Dh, faceDirection);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + rim);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

const MAX_SHEET = 48, MAX_BURST = 24, MAX_DRILL = 16;

export function createInkSheets(THREE, scene, { nearDither, rim }) {
  const splashTex = decodeAlpha(THREE, MUZZLE_SPLASH, false), ringTex = decodeAlpha(THREE, INK_RING, true);
  const uniforms = { s3Splash: { value: splashTex }, s3Ring: { value: ringTex } };
  const mesh = new THREE.InstancedMesh(sheetGeometry(THREE), inkMaterial(THREE, 's3-ink-sheet-2', nearDither, rim, uniforms, {
    vertexHead: SHEET_VERTEX,
    vertexBody: [['#include <beginnormal_vertex>', `
        vec3 objectNormal;
        {
          vec2 uv0 = position.xy;
          s3SheetPos = s3SheetP(uv0.x, uv0.y);
          vec3 du = s3SheetP(min(uv0.x + 0.01, 1.0), uv0.y) - s3SheetP(max(uv0.x - 0.01, 0.0), uv0.y);
          vec3 dv = s3SheetP(uv0.x, min(uv0.y + 0.01, 1.0)) - s3SheetP(uv0.x, max(uv0.y - 0.01, 0.0));
          vec3 n = cross(dv, du); // matches the grid's triangle winding
          objectNormal = dot(n, n) > 1e-14 ? normalize(n) : vec3(0.0, 0.0, -1.0);
          vS3Uv = uv0; vS3A = aSheetA;
        }`], ['#include <begin_vertex>', 'vec3 transformed = s3SheetPos;']],
    fragmentHead: SHEET_FRAGMENT, cut: SHEET_CUT,
  }), MAX_SHEET);
  const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHEET * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const b = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHEET * 4), 4).setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aSheetA', a); mesh.geometry.setAttribute('aSheetB', b);
  const drillMesh = new THREE.InstancedMesh(sheetGeometry(THREE, 40, 8), inkMaterial(THREE, 's3-ink-drill-1', nearDither, rim, uniforms, {
    vertexHead: DRILL_VERTEX,
    vertexBody: [['#include <beginnormal_vertex>', `
        vec3 objectNormal;
        {
          vec2 uv0 = position.xy;
          s3DrillPos = s3DrillP(uv0.x, uv0.y);
          vec3 du = s3DrillP(min(uv0.x + 0.01, 1.0), uv0.y) - s3DrillP(max(uv0.x - 0.01, 0.0), uv0.y);
          vec3 dv = s3DrillP(uv0.x, min(uv0.y + 0.01, 1.0)) - s3DrillP(uv0.x, max(uv0.y - 0.01, 0.0));
          vec3 n = cross(dv, du);
          objectNormal = dot(n, n) > 1e-14 ? normalize(n) : vec3(0.0, 0.0, 1.0);
          vS3Uv = uv0; vS3S = aDrill.zw;
        }`], ['#include <begin_vertex>', 'vec3 transformed = s3DrillPos;']],
    fragmentHead: DRILL_FRAGMENT, cut: DRILL_CUT,
  }), MAX_DRILL);
  const da = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DRILL * 4), 4).setUsage(THREE.DynamicDrawUsage);
  drillMesh.geometry.setAttribute('aDrill', da);
  const drills = [];
  const white = new THREE.Color(1, 1, 1);
  // GTAO/depth override passes would draw the raw unit grids.
  const gate = (r, sc, c, geometry) => { geometry.drawRange.count = sc.overrideMaterial ? 0 : Infinity; };
  for (const o of [mesh, drillMesh]) {
    o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    o.setColorAt(0, white); o.instanceColor.setUsage(THREE.DynamicDrawUsage);
    o.frustumCulled = false; o.count = 0; o.visible = false; o.onBeforeRender = gate;
  }
  scene.add(mesh, drillMesh);
  const bursts = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s = new THREE.Vector3(),
    x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3(), basis = new THREE.Matrix4(),
    Z = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0), drop = new THREE.Vector3();
  const upload = (o, n, attrs, size) => {
    o.count = n; o.visible = n > 0;
    if (!n) return;
    for (const attr of attrs) { attr.clearUpdateRanges(); attr.addUpdateRange(0, n * size); attr.needsUpdate = true; }
    o.instanceMatrix.clearUpdateRanges(); o.instanceMatrix.addUpdateRange(0, n * 16); o.instanceMatrix.needsUpdate = true;
    o.instanceColor.clearUpdateRanges(); o.instanceColor.addUpdateRange(0, n * 3); o.instanceColor.needsUpdate = true;
  };
  return {
    mesh, drillMesh, bursts, drills,
    // One Sloshing Machine round this frame: head at `at`, flying along `dir`,
    // `length` clamped to its travelled distance.
    drill(at, dir, color, seed, time, length) {
      if (drills.length >= MAX_DRILL) return;
      drills.push({ at, dir, color, seed, time, length });
    },
    // Remember one firing; `at` is the nozzle (or the swing pivot), `dir` the shot direction.
    // `owner` (SWEPs splash only) keeps the splash on that actor's muzzle.
    add(kind, at, dir, color, seed, time, owner = null) {
      const cfg = FIRE_INK[kind];
      if (!cfg) return null;
      if (bursts.length >= MAX_BURST) bursts.shift();
      const burst = { kind, cfg, t0: time, seed, color: color.clone ? color.clone() : color,
        at: at.clone(), dir: dir.clone().normalize(), owner };
      bursts.push(burst);
      return burst;
    },
    // Fire-and-forget droplets go through the existing FX droplet pool.
    specks(fx, burst) {
      if (!fx?._spawnDrop) return;
      const { cfg, at, dir, color, seed } = burst;
      if (Math.abs(dir.y) < 0.95) x.set(-dir.z, 0, dir.x).normalize(); else x.set(1, 0, 0);
      y.crossVectors(dir, x);
      for (let i = 0; i < cfg.specks; i++) {
        const h1 = Math.sin(seed * 91 + i * 12.9) * 43758.5453, h2 = Math.sin(seed * 37 + i * 78.2) * 43758.5453;
        const a1 = (h1 - Math.floor(h1)) * 6.2832, spread = cfg.hang ? 0.9 : cfg.drip ? 0.6 : 0.35;
        const r = spread * (0.3 + 0.7 * (h2 - Math.floor(h2)));
        drop.copy(dir).addScaledVector(x, Math.cos(a1) * r).addScaledVector(y, Math.sin(a1) * r).normalize();
        const speed = cfg.hang ? 1.2 + 1.5 * r : cfg.drip ? 2 + 2 * r : 7 + 6 * r;
        const size = cfg.hang ? 0.035 + 0.03 * r : 0.02 + 0.025 * r;
        const vy = cfg.drip ? -1.5 : 0;
        fx._spawnDrop(at.x, at.y, at.z, drop.x * speed, drop.y * speed + vy, drop.z * speed, color,
          size, cfg.hang ? 0.7 : 0.35, cfg.hang ? 0.25 : 1, cfg.hang ? 1 : 1.5, 0);
      }
    },
    draw(time, cam) {
      const A = a.array, B = b.array;
      let n = 0;
      for (let i = bursts.length - 1; i >= 0; i--) {
        const burst = bursts[i], cfg = burst.cfg, age = (time - burst.t0) * 60 / cfg.life;
        if (!(age >= 0) || age >= 1) { bursts.splice(i, 1); continue; }
        if (cam && cam.distanceToSquared(burst.at) > 1600) continue;
        const d = burst.dir;
        for (let layer = 0; layer < cfg.layers && n < MAX_SHEET; layer++) {
          const ls = burst.seed + layer * 0.37, o = n * 4;
          if (cfg.style === 0) {
            // SWEPs: each cone at its own random roll
            const cone = splashCone(cfg, age, layer);
            q.setFromUnitVectors(Z, d); q2.setFromAxisAngle(Z, (ls * 7.31 % 1) * 6.2832); q.multiply(q2);
            m.compose(burst.at, q, s.setScalar(1));
            A[o] = 0; A[o + 3] = cone.length; B[o] = cone.radius;
          } else {
            // sweep plane: X = forward, Y = up (vertical) or right (horizontal)
            z.copy(d).setY(0); if (z.lengthSq() < 1e-6) z.set(0, 0, 1); z.normalize();
            x.crossVectors(UP, z).normalize();
            if (burst.kind === 'slash-h') { basis.makeBasis(z, x, UP); }
            else if (burst.kind === 'arrow') {
              // ribbons wrap the bow around the shot axis, each rolled differently
              y.copy(UP).applyAxisAngle(d, ls * 6.2832 * 0.7);
              x.crossVectors(y, d).normalize();
              basis.makeBasis(x, y, d.clone());
            } else basis.makeBasis(z, UP, x);
            q.setFromRotationMatrix(basis);
            const off = (layer - (cfg.layers - 1) / 2) * 0.12 * cfg.radius;
            m.compose(drop.copy(burst.at).addScaledVector(x, burst.kind === 'arrow' ? 0 : off), q, s.setScalar(1 - 0.12 * layer));
            A[o] = cfg.tiles + (cfg.solid ? 0.25 : 0); A[o + 3] = cfg.length || 0; B[o] = cfg.radius;
          }
          mesh.setMatrixAt(n, m); mesh.setColorAt(n, burst.color);
          A[o + 1] = clamp(age, 0, 1); A[o + 2] = ls;
          B[o + 1] = cfg.width || 0; B[o + 2] = cfg.arc0 || 0; B[o + 3] = cfg.arc1 || 0;
          n++;
        }
      }
      upload(mesh, n, [a, b], 4);
      const D = da.array;
      let nd = 0;
      for (const d of drills) {
        if (cam && cam.distanceToSquared(d.at) > 1600) continue;
        // roll 0 keeps the ribbon's phase steady under pitch/yaw; spin is time-driven
        x.crossVectors(UP, d.dir); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); x.normalize();
        y.crossVectors(d.dir, x);
        basis.makeBasis(x, y, d.dir); q.setFromRotationMatrix(basis);
        m.compose(d.at, q, s.setScalar(1));
        drillMesh.setMatrixAt(nd, m); drillMesh.setColorAt(nd, d.color);
        D[nd * 4] = Math.max(0.05, d.length); D[nd * 4 + 1] = MACHINE_DRILL.radius;
        // wrapped in double precision so a long match keeps float32 phase steps exact
        D[nd * 4 + 2] = (d.seed * 6.2832 + d.time * MACHINE_DRILL.spin) % 6.283185307179586; D[nd * 4 + 3] = d.seed;
        nd++;
      }
      drills.length = 0;
      upload(drillMesh, nd, [da], 4);
      return { sheets: n, drills: nd };
    },
    clear() { bursts.length = 0; drills.length = 0; for (const o of [mesh, drillMesh]) { o.count = 0; o.visible = false; } },
    dispose() {
      scene.remove(mesh, drillMesh);
      for (const o of [mesh, drillMesh]) { o.geometry.dispose(); o.material.dispose(); }
      splashTex.dispose(); ringTex.dispose();
    },
  };
}
