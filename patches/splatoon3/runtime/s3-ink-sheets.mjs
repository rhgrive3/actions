// Splatoon 3 firing ink: the torn, streaked ink sheets that each main weapon
// throws out at the moment of firing, separate from the flying round.
// Render only: never touches projectiles, collision, paint or packets.
//
// Observed in Nintendo footage (60 fps, zoomed frames; sources in
// reports/inkwave-s3-projectile-shapes-2026-10-15.md):
// - Shooter: every shot opens a flat, jagged ink "crown" at the nozzle with
//   holes torn through it and spiky fingers, for ~6 frames, plus a few fast
//   specks (About video 05, 2.70-2.80 s).
// - Brella: a large splattered bloom around the canopy front with ink running
//   down, ~10 frames (About video 04, 1.52-1.62 s).
// - Stringer: twisted ink ribbons wrap the bow on release while many round
//   droplets hang in the air (About video 03, 1.70-1.82 s).
// - Splatana: the swing leaves a huge layered, streaked wave of ink along the
//   blade arc, its outer edge torn (Splatana Wiper promotional screenshot).
// Sizes and lifetimes are calibration read off footage, not extracted data.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const SHEET_STYLE = Object.freeze({ crown: 0, arc: 1 });
// [style, life frames, length/radius, radius/width, arc0, arc1, layers]
export const FIRE_INK = Object.freeze({
  shot: Object.freeze({ style: 0, life: 7, length: 0.36, radius: 0.46, layers: 1, specks: 5 }),
  pellet: Object.freeze({ style: 0, life: 11, length: 0.6, radius: 0.95, layers: 2, specks: 8, drip: true }),
  arrow: Object.freeze({ style: 1, life: 14, radius: 0.62, width: 0.7, arc0: -2.6, arc1: 3.6, length: 1.9, layers: 4, specks: 16, hang: true }),
  'slash-v': Object.freeze({ style: 1, life: 12, radius: 2.2, width: 0.72, arc0: 1.95, arc1: -1.05, layers: 3, specks: 4, pivotY: 0.95 }),
  'slash-h': Object.freeze({ style: 1, life: 10, radius: 1.55, width: 0.55, arc0: 1.75, arc1: -1.75, layers: 2, specks: 3, pivotY: 0.9 }),
});

function sheetGeometry(THREE, nu = 28, nv = 9) {
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

// aSheetA: (style, age 0..1, seed, length)   aSheetB: (radius, width, arc0, arc1)
const SHEET_VERTEX = `
  attribute vec4 aSheetA;
  attribute vec4 aSheetB;
  varying vec2 vS3Uv;
  varying vec4 vS3A;
  ${NOISE}
  vec3 s3SheetP(float u, float v) {
    float age = aSheetA.y, seed = aSheetA.z;
    float grow = 1.0 - pow(1.0 - clamp(age * 2.2, 0.0, 1.0), 2.0);
    if (aSheetA.x < 0.5) {
      // crown: a torn cone opening along +Z; v runs from the nozzle outwards
      // flat, lopsided splat: irregular reach per direction, warped angles,
      // crumpled surface (no regular ribs)
      float th = u * 6.2831853 + (s3n(vec2(u * 5.0 + seed * 3.0, seed)) - 0.5) * 0.9;
      float reach = 0.45 + 0.75 * s3n(vec2(u * 4.0 + seed * 17.0, seed * 2.0)) + 0.35 * s3n(vec2(u * 11.0, seed * 7.0));
      float r = v * aSheetB.x * grow * reach;
      float z = v * aSheetA.w * grow * (0.4 + 0.6 * reach) - v * v * 0.3 * aSheetA.w * age;
      float crumple = (s3n(vec2(u * 13.0 + seed, v * 4.0)) - 0.5) * 0.45 * v * aSheetB.x;
      return vec3(cos(th) * r, sin(th) * r, z + crumple);
    }
    // arc: swept ribbon in the local XY plane, u along the sweep, v across it
    float sweep = clamp(age * 3.0, 0.0, 1.0);
    float phi = mix(aSheetB.z, aSheetB.w, u * sweep);
    float rho = aSheetB.x * (1.0 - aSheetB.y + aSheetB.y * v) * (0.9 + 0.1 * grow);
    float curl = (s3n(vec2(u * 4.0 + seed * 7.0, v * 2.0)) - 0.5) * 0.35 * aSheetB.y * aSheetB.x;
    curl += (v - 0.5) * 0.25 * aSheetB.y * aSheetB.x * sin(u * 3.1 + seed * 9.0);
    // a positive length winds the ribbon forward into a spiral (Stringer)
    return vec3(cos(phi) * rho, sin(phi) * rho, curl + u * sweep * aSheetA.w);
  }
  vec3 s3SheetPos;`;

const SHEET_FRAGMENT = `
  varying vec2 vS3Uv;
  varying vec4 vS3A;
  ${NOISE}`;

// Tears: a ragged outer edge, holes that open as the sheet ages, and streaks
// running along the flow. Fragment discard only; no textures.
const SHEET_CUT = `
  {
    float age = vS3A.y, seed = vS3A.z;
    vec2 uv = vS3Uv;
    float edge, flow;
    if (vS3A.x < 0.5) {
      // sharp fingers: a few long points over a ragged, bitten rim
      float fingers = pow(s3n(vec2(uv.x * 14.0 + seed * 13.0, seed)), 3.0);
      edge = 0.5 + 0.25 * s3n(vec2(uv.x * 37.0 + seed * 5.0, seed * 3.0)) + 0.5 * fingers;
      if (uv.y > edge * (1.0 - 0.3 * age)) discard;
      // thin fingers: narrow towards their tips
      if (uv.y > 0.55 && s3n(vec2(uv.x * 60.0 + seed, uv.y * 2.0)) < (uv.y - 0.55) * 1.4) discard;
      flow = uv.x * 40.0;
    } else {
      float lip = 0.7 + 0.3 * s3n(vec2(uv.x * 18.0 + seed * 11.0, seed * 3.0));
      if (uv.y > lip) discard;
      // the wave is several poured ribbons with gaps between them
      float band = fract(uv.y * 3.0 + 0.35 * s3n(vec2(uv.x * 5.0 + seed * 9.0, seed)));
      if (band < 0.1 + 0.08 * age) discard;
      // the oldest end of the sweep thins out first; the wave stays whole early
      float tail = smoothstep(0.0, 0.08 + 0.5 * age * age, uv.x);
      if (s3n(vec2(uv.x * 9.0, uv.y * 3.0 + seed)) > tail + 0.3) discard;
      flow = uv.y * 26.0;
    }
    float holes = s3n(vec2(uv.x * 11.0 + seed * 3.7, uv.y * 7.0 - seed));
    // a crown tears from its first frames; a swept wave holds together longer
    if (vS3A.x < 0.5) holes = s3n(vec2(uv.x * 17.0 + seed * 3.7, uv.y * 6.0 - seed));
    // a crown is already holed in its first frame; a swept wave holds together longer
    if (holes < (vS3A.x < 0.5 ? 0.12 + age * 0.9 : age * 1.4 - 0.75)) discard;
    vS3Streak = 0.86 + 0.22 * s3n(vec2(flow + seed * 5.0, 0.5)) + 0.08 * sin(flow * 1.7);
  }`;

function sheetMaterial(THREE, nearDither, rim) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.1, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + SHEET_VERTEX)
      .replace('#include <beginnormal_vertex>', `
        vec3 objectNormal;
        {
          vec2 uv0 = position.xy;
          s3SheetPos = s3SheetP(uv0.x, uv0.y);
          vec3 du = s3SheetP(min(uv0.x + 0.01, 1.0), uv0.y) - s3SheetP(max(uv0.x - 0.01, 0.0), uv0.y);
          vec3 dv = s3SheetP(uv0.x, min(uv0.y + 0.01, 1.0)) - s3SheetP(uv0.x, max(uv0.y - 0.01, 0.0));
          vec3 n = cross(dv, du); // matches the grid's triangle winding
          objectNormal = dot(n, n) > 1e-14 ? normalize(n) : vec3(0.0, 0.0, 1.0);
          vS3Uv = uv0; vS3A = aSheetA;
        }`)
      .replace('#include <begin_vertex>', 'vec3 transformed = s3SheetPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + SHEET_FRAGMENT + '\nfloat vS3Streak = 1.0;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + SHEET_CUT + nearDither)
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vS3Streak;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + rim);
  };
  mat.customProgramCacheKey = () => 's3-ink-sheet-1';
  return mat;
}

const MAX_SHEET = 48, MAX_BURST = 24;

export function createInkSheets(THREE, scene, { nearDither, rim }) {
  const mesh = new THREE.InstancedMesh(sheetGeometry(THREE), sheetMaterial(THREE, nearDither, rim), MAX_SHEET);
  const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHEET * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const b = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SHEET * 4), 4).setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aSheetA', a); mesh.geometry.setAttribute('aSheetB', b);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
  // GTAO/depth override passes would draw the raw unit grid.
  mesh.onBeforeRender = (r, sc, c, geometry) => { geometry.drawRange.count = sc.overrideMaterial ? 0 : Infinity; };
  scene.add(mesh);
  const bursts = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), s = new THREE.Vector3(),
    x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3(), basis = new THREE.Matrix4(),
    Z = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0), drop = new THREE.Vector3();
  return {
    mesh, bursts,
    // Remember one firing; `at` is the nozzle (or the swing pivot), `dir` the shot direction.
    add(kind, at, dir, color, seed, time) {
      const cfg = FIRE_INK[kind];
      if (!cfg) return null;
      if (bursts.length >= MAX_BURST) bursts.shift();
      const burst = { kind, cfg, t0: time, seed, color: color.clone ? color.clone() : color,
        at: at.clone(), dir: dir.clone().normalize() };
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
          const ls = burst.seed + layer * 0.37;
          if (cfg.style === 0) {
            q.setFromUnitVectors(Z, d); q2.setFromAxisAngle(Z, ls * 6.2832); q.multiply(q2);
            m.compose(burst.at, q, s.setScalar(1 - 0.18 * layer));
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
          }
          mesh.setMatrixAt(n, m); mesh.setColorAt(n, burst.color);
          const o = n * 4;
          A[o] = cfg.style; A[o + 1] = clamp(age, 0, 1); A[o + 2] = ls; A[o + 3] = cfg.length || 0;
          B[o] = cfg.radius; B[o + 1] = cfg.width || 0; B[o + 2] = cfg.arc0 || 0; B[o + 3] = cfg.arc1 || 0;
          n++;
        }
      }
      mesh.count = n; mesh.visible = n > 0;
      if (n) {
        for (const attr of [a, b]) { attr.clearUpdateRanges(); attr.addUpdateRange(0, n * 4); attr.needsUpdate = true; }
        mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, n * 3); mesh.instanceColor.needsUpdate = true;
      }
      return n;
    },
    clear() { bursts.length = 0; mesh.count = 0; mesh.visible = false; },
    dispose() { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); },
  };
}
