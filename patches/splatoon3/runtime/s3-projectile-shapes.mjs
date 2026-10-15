// Splatoon 3 in-flight projectile silhouettes for Shooters, Brellas,
// Stringers, Splatanas, Sloshing Machine, Explosher and Bloblobber.
//
// Render only. Position, velocity, lifetime, collision, damage, paint and
// network packets keep their existing owners; this module only reads them.
// Each shape below was compared against Nintendo footage at 60 fps and from
// several angles (side, behind, front, top). Sources and the per-weapon
// observations are recorded in reports/inkwave-s3-projectile-shapes-2026-10-15.md.
//
// - Shooter: one long smooth rod with a blunt, slightly fatter rounded head and
//   a gently tapering body; while its tail is still joined to the muzzle the
//   back end tears into flat ragged sheets (S3 About video 05, Splattershot).
// - Brella pellet: thin double-pointed spindles in a diverging cone
//   (S3 About video 04, Splat Brella).
// - Stringer arrow: very thin needle with a small pointed head whose back
//   half frays into torn sheets (S3 About video 03, Tri-Stringer).
// - Splatana: a thick glossy crescent slab, convex side leading; standing for
//   the charged vertical slash, lying flat for the horizontal swing (Splatana
//   Wiper promotional screenshot). Span/bow from BulletSaber*Param.CollisionParam.
// - Sloshing Machine: a glob trailed by a two-strand corkscrew of droplets.
// - Explosher: a lumpy glob wrapped in white glitter.
// - Bloblobber: a clear soap-film bubble with a smaller ink ball inside, plus
//   tiny empty bubbles drifting behind it.
//
// Lengths, radii, counts and timings marked "calibration" are INKWAVE values
// read off footage, not extracted Nintendo mesh data.
import { MAIN_WEAPON_CATALOG } from './main-weapon-catalog-data.mjs';
import { ALTERNATE_WEAPON_KITS } from './alternate-weapon-kits-data.mjs';
import { shotTailFrames } from './weapons-fidelity.mjs';

const INSTALLED = Symbol.for('inkwave.s3.projectile-shapes.v1');
const RECORDS = new Map(MAIN_WEAPON_CATALOG.records.map(r => [r.id, r]));
// Alternate kits share their base weapon's main behaviour and projectiles.
for (const kit of ALTERNATE_WEAPON_KITS) if (RECORDS.has(kit.baseId)) RECORDS.set(kit.id, RECORDS.get(kit.baseId));
const SLOSH_SHAPES = Object.freeze({
  WeaponSlosherLauncher: 'machine', WeaponSlosherWashtub: 'explosher', WeaponSlosherBathtub: 'bubble',
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const finite = (v, f) => Number.isFinite(v) ? v : f;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fract = x => x - Math.floor(x);
const hash = (a, b = 0) => fract(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

// Body kinds (shader branch) and calibration.
export const BODY_KIND = Object.freeze({ shot: 0, pellet: 1, arrow: 2 });
export const S3_SHAPE = Object.freeze({
  // Head radius = existing drawn ink radius x width. The rod body starts at
  // 0.86 of the head and narrows to ~0.6 at the tail (blunt bulb and taper in
  // the 60 fps Splattershot side frames).
  shot: Object.freeze({ width: 1.0, raggedFrames: 4 }),
  // Pellet head radius from the player collider; streak covers 1.5 frames of
  // travel (calibration: Splat Brella side frames 1.5-1.9 s).
  pellet: Object.freeze({ radiusOfCollider: 0.3, frames: 2, minLengthRadii: 4 }),
  // Arrow: thin needle (calibration: Tri-Stringer About video 1.6-2.0 s).
  arrow: Object.freeze({ radiusOfCollider: 0.36, frames: 1.2, minLengthRadii: 6, stuckLengthRadii: 7 }),
  // Splatana crescents: half span = outer collider offset + its radius;
  // bow = tip lag of the source collider chain (horizontal 0.2), the vertical
  // slab follows the screenshot's stronger curve and chord.
  slashH: Object.freeze({ halfSpan: 1.32, bow: 0.2, depth: 0.5, thickness: 0.15 }),
  slashV: Object.freeze({ halfSpan: 1.95, bow: 0.9, depth: 0.8, thickness: 0.22 }),
  machine: Object.freeze({ radius: 0.2, helixRadius: 0.24, beads: 7, beadSpacing: 0.12, spin: 24 }),
  explosher: Object.freeze({ radius: 0.24, sparkles: 28 }),
  bubble: Object.freeze({ core: 0.7, trailing: 3 }),
});

export function s3ShapeKind(p) {
  if (!p || p.s3SpecialWeapon || p.type !== 'shot') return null;
  const r = p.catalog?.r || RECORDS.get(p.wid);
  if (!r) return null;
  const key = p.catalog?.descriptor?.key;
  switch (r.family) {
    case 'shooter': return 'shot';
    case 'brella': return key === 'pellet' ? 'pellet' : null;
    case 'stringer': return key === 'arrow' ? 'arrow' : null;
    case 'splatana': return key === 'saber-horizontal' ? 'slash-h' : key === 'saber-vertical' ? 'slash-v' : null;
    case 'slosher': return p.catalog ? SLOSH_SHAPES[r.sourceActor] ?? null : null;
    default: return null;
  }
}

// Unit body: rings of (cos t, sin t, s); s in [0,1] is the head (tip at 1),
// s in [-1,0) the body (tail tip at -1). The vertex shader shapes it.
function bodyGeometry(THREE, around = 14, headRings = 7, bodyRings = 18) {
  const ss = [];
  for (let i = 0; i <= headRings; i++) ss.push(1 - i / headRings);
  for (let j = 1; j <= bodyRings; j++) ss.push(-j / bodyRings);
  const pos = new Float32Array(ss.length * (around + 1) * 3), idx = [];
  let k = 0;
  for (const s of ss) for (let a = 0; a <= around; a++) {
    const t = a / around * Math.PI * 2;
    pos[k++] = Math.cos(t); pos[k++] = Math.sin(t); pos[k++] = s;
  }
  const row = around + 1;
  for (let i = 0; i < ss.length - 1; i++) for (let a = 0; a < around; a++) {
    const p = i * row + a, q = p + row;
    idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 64);
  return g;
}

// Crescent slab in absolute units: X = span, Y = thickness, Z = travel.
// Leading edge convex, pointed tips trailing by `bow`; a baked low-frequency
// ripple keeps the liquid, uneven rim of the reference.
export function crescentGeometry(THREE, { halfSpan, bow, depth, thickness }, span = 28, ring = 12) {
  const pos = [], idx = [];
  for (let i = 0; i <= span; i++) {
    const a = -1 + 2 * i / span, w = Math.max(0, 1 - a * a);
    const centre = -bow * a * a;
    const d = depth * Math.pow(w, 0.65) * (1 + 0.08 * Math.sin(a * 9.1 + 0.6));
    const t = thickness * Math.pow(w, 0.5) * (1 + 0.12 * Math.sin(a * 6.3 + 1.3));
    for (let j = 0; j < ring; j++) {
      const th = j / ring * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      // leading edge (c > 0) fuller than the feathered trailing edge
      const z = centre + (c > 0 ? 0.55 : 0.45) * d * c;
      const ripple = 1 + 0.1 * Math.sin(a * 13 + th * 2) * (c < 0 ? 1 : 0.4);
      pos.push(a * halfSpan, 0.5 * t * s * ripple, z);
    }
  }
  for (let i = 0; i < span; i++) for (let j = 0; j < ring; j++) {
    const p = i * ring + j, q = (i + 1) * ring + j, p1 = i * ring + (j + 1) % ring, q1 = (i + 1) * ring + (j + 1) % ring;
    idx.push(p, p1, q, p1, q1, q);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), halfSpan + depth + 1);
  return g;
}

const NEAR_DITHER = `
        {
          float iwNear = smoothstep(0.55, 1.6, length(vViewPosition));
          float iwIgn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (iwIgn > iwNear) discard;
        }`;
const RIM = `
        {
          float iwRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
          totalEmissiveRadiance += vColor.rgb * (0.16 + 0.55 * iwRim);
        }`;

function glossy(THREE, key, vertex) {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.15 });
  mat.onBeforeCompile = sh => {
    if (vertex) vertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + NEAR_DITHER)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + RIM);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

const BODY_GLSL = `
        attribute vec4 aBody;
        vec3 s3BodyP(float s, float th) {
          float kind = aBody.y, L = max(aBody.x, 0.0);
          vec2 cs = vec2(cos(th), sin(th));
          float r, z;
          if (s >= 0.0) {
            if (kind < 0.5) { float ph = s * 1.5707963; r = cos(ph); z = 1.1 * sin(ph); }
            else if (kind < 1.5) { r = pow(max(1.0 - s, 0.0), 0.8); z = 1.9 * s; }
            else { r = pow(max(1.0 - s, 0.0), 0.7); z = 2.6 * s; }
          } else {
            float u = -s; z = -L * u;
            if (kind < 0.5) {
              r = 0.93 - 0.33 * u;
              float c = clamp(0.9 / max(L, 0.9), 0.05, 0.6), e = clamp((u - (1.0 - c)) / c, 0.0, 1.0);
              r *= sqrt(max(0.0, 1.0 - e * e));
            } else if (kind < 1.5) r = pow(max(1.0 - u, 0.0), 1.1);
            else r = mix(1.0, 0.5, smoothstep(0.0, 0.08, u)) * pow(max(1.0 - u, 0.0), 0.3);
            if (aBody.z > 0.0) {
              float t = smoothstep(0.45, 1.0, u) * aBody.z;
              float sp = pow(max(0.0, sin(th * 5.0 + aBody.w * 6.2832 + u * 7.0)), 5.0)
                + 0.7 * pow(max(0.0, sin(th * 3.0 - aBody.w * 9.0 - u * 11.0)), 8.0);
              r = r * mix(1.0, 0.3 + 0.7 * abs(cs.x), t) + t * sp * 2.4;
              z += t * sp * 0.05 * L;
            }
          }
          r *= 1.0 + 0.035 * sin(th * 2.0 + aBody.w * 20.0 + z * 1.7);
          return vec3(cs * r, z);
        }
        vec3 s3BodyPos;`;

function bodyMaterial(THREE) {
  // Double-sided: the torn tail flaps are thin sheets seen from both faces.
  const mat = glossy(THREE, 's3-body-1', sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + BODY_GLSL)
      .replace('#include <beginnormal_vertex>', `
        vec3 objectNormal;
        {
          float th = atan(position.y, position.x), s = position.z;
          s3BodyPos = s3BodyP(s, th);
          vec3 ds = s3BodyP(min(s + 0.012, 1.0), th) - s3BodyP(max(s - 0.012, -1.0), th);
          vec3 dt = s3BodyP(s, th + 0.06) - s3BodyP(s, th - 0.06);
          vec3 n = cross(dt, ds);
          objectNormal = dot(n, n) > 1e-12 ? normalize(n) : vec3(0.0, 0.0, s >= 0.0 ? 1.0 : -1.0);
        }`)
      .replace('#include <begin_vertex>', 'vec3 transformed = s3BodyPos;');
  });
  mat.side = THREE.DoubleSide;
  return mat;
}

// Clear soap film: fresnel-weighted rim, sharp highlight and a faint
// thin-film tint; nearly invisible face-on like the reference bubbles.
function bubbleMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `
      varying vec3 vN, vV, vC;
      void main() {
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vV = cameraPosition - wp.xyz;
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #else
          vC = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      varying vec3 vN, vV, vC;
      void main() {
        vec3 n = normalize(vN), v = normalize(vV);
        float f = pow(1.0 - abs(dot(n, v)), 2.2);
        float near = smoothstep(0.55, 1.6, length(vV));
        vec3 film = 0.5 + 0.5 * cos(6.2832 * (f * 1.3 + vec3(0.0, 0.33, 0.67)));
        vec3 h = normalize(normalize(vec3(0.35, 0.85, 0.4)) + v);
        float spec = pow(max(dot(n, h), 0.0), 90.0);
        vec3 col = mix(vec3(1.0), vC, 0.35) * (0.55 + 0.45 * film) + spec * 1.5;
        float a = clamp(0.05 + 0.6 * f + spec, 0.0, 0.9) * near;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  });
}

function sparkleMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `
      attribute float aSize;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * 380.0 / max(0.5, -mv.z);
        vA = aSize > 0.0 ? 1.0 : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float d = dot(q, q), core = exp(-d * 9.0), cross = exp(-abs(q.x * q.y) * 40.0) * (1.0 - d);
        float a = clamp(core * 1.2 + cross * 0.5, 0.0, 1.0) * vA;
        if (a < 0.02) discard;
        gl_FragColor = vec4(vec3(1.0, 0.98, 0.92) * 1.6, a);
      }`,
  });
}

const MAX_BODY = 160, MAX_SLASH = 16, MAX_SHELL = 96, MAX_CORE = 32, MAX_SPARK = 160;

function createRenderer(THREE, scene) {
  const body = new THREE.InstancedMesh(bodyGeometry(THREE), bodyMaterial(THREE), MAX_BODY);
  const bodyData = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BODY * 4), 4);
  bodyData.setUsage(THREE.DynamicDrawUsage);
  body.geometry.setAttribute('aBody', bodyData);
  const slashMat = glossy(THREE, 's3-slash-1');
  const slashH = new THREE.InstancedMesh(crescentGeometry(THREE, S3_SHAPE.slashH), slashMat, MAX_SLASH);
  const slashV = new THREE.InstancedMesh(crescentGeometry(THREE, S3_SHAPE.slashV), slashMat, MAX_SLASH);
  const shell = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 24, 16), bubbleMaterial(THREE), MAX_SHELL);
  const core = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), glossy(THREE, 's3-core-1'), MAX_CORE);
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new THREE.BufferAttribute(new Float32Array(MAX_SPARK * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sparkSize = new THREE.BufferAttribute(new Float32Array(MAX_SPARK), 1).setUsage(THREE.DynamicDrawUsage);
  sparkGeo.setAttribute('position', sparkPos); sparkGeo.setAttribute('aSize', sparkSize);
  sparkGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const sparks = new THREE.Points(sparkGeo, sparkleMaterial(THREE));
  const white = new THREE.Color(1, 1, 1);
  for (const m of [body, slashH, slashV, shell, core]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, white); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false; m.count = 0; m.visible = false;
  }
  slashH.castShadow = slashV.castShadow = true;
  // Override passes (GTAO normal/depth) would draw the raw unit body/sphere
  // instead of the shader-shaped silhouette and stamp false dark occlusion
  // blocks; like the native charger ribbons, these meshes sit those passes out.
  const gate = (renderer, sc, camera, geometry) => { geometry.drawRange.count = sc.overrideMaterial ? 0 : Infinity; };
  body.onBeforeRender = gate; shell.onBeforeRender = gate;
  shell.renderOrder = 2;
  sparks.frustumCulled = false; sparks.visible = false; sparks.renderOrder = 3;
  sparks.onBeforeRender = (renderer, sc, camera, geometry) => { geometry.drawRange.count = sc.overrideMaterial ? 0 : sparks.userData.count || 0; };
  scene.add(body, slashH, slashV, shell, core, sparks);
  return { body, bodyData, slashH, slashV, shell, core, sparks, sparkPos, sparkSize,
    bodyParams: { R: 0, L: 0, kind: 0, rag: 0 },
    m: new THREE.Matrix4(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), s: new THREE.Vector3(),
    v: new THREE.Vector3(), v2: new THREE.Vector3(), f: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(),
    basis: new THREE.Matrix4(), Z: new THREE.Vector3(0, 0, 1), UP: new THREE.Vector3(0, 1, 0), c: new THREE.Color(),
    dispose() {
      scene.remove(body, slashH, slashV, shell, core, sparks);
      for (const o of [body, slashH, slashV, shell, core, sparks]) { o.geometry.dispose(); o.material.dispose(); }
    } };
}

function upload(mesh, n) {
  mesh.count = n; mesh.visible = n > 0;
  if (!n) return;
  mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, n * 16); mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, n * 3); mesh.instanceColor.needsUpdate = true;
}

// Unit travel direction, remembered while a stuck arrow has zero velocity.
function direction(p, out) {
  const sp = p.vel.length();
  if (sp > 1e-4) { out.copy(p.vel).multiplyScalar(1 / sp); (p.s3ShapeDir ||= out.clone()).copy(out); }
  else if (p.s3ShapeDir) out.copy(p.s3ShapeDir);
  else out.set(0, 0, 1);
  return sp;
}

function drawRadius(p) { return p.vis || p.size || 0.1; }
// Shooter drawn width is not published; the player collider is a hitbox.
// Native rounds keep their drawn radius, catalog Shooters share 0.1.
function shotRadius(p) { return p.catalog ? 0.1 : p.vis || 0.1; }

export function bodyParams(p, kind, sp, out = {}) {
  const travel = p.start ? p.start.distanceTo(p.pos) : Infinity;
  const grow = clamp(p.age * 20, 0.15, 1);
  if (kind === 'shot') {
    const R = shotRadius(p) * S3_SHAPE.shot.width * grow * (1 + 0.3 * Math.sin(grow * Math.PI));
    const length = Math.max(0, Math.min(travel, sp * shotTailFrames(p) / 60) - R);
    const frames = p.age * 60;
    const rag = clamp(1 - (frames - 1) / S3_SHAPE.shot.raggedFrames, 0, 1);
    out.R = R; out.L = length / Math.max(R, 1e-4); out.kind = BODY_KIND.shot; out.rag = rag;
    return out;
  }
  const c = p.catalog?.descriptor?.c;
  const collider = finite(c?.InitRadiusForPlayer, finite(p.size, 0.2));
  const cfg = S3_SHAPE[kind];
  const R = collider * cfg.radiusOfCollider * grow;
  let length = Math.min(travel, sp * cfg.frames / 60);
  if (kind === 'arrow' && p.catalog?.stuck) length = cfg.stuckLengthRadii * R;
  // A braked pellet has no streak left: it falls as a rounded drop.
  if (kind === 'pellet' && length < cfg.minLengthRadii * R) {
    out.R = R; out.L = Math.max(0.4, length / Math.max(R, 1e-4)); out.kind = BODY_KIND.shot; out.rag = 0;
    return out;
  }
  const L = Math.max(cfg.minLengthRadii, length / Math.max(R, 1e-4));
  // S3 Tri-Stringer arrows fray into thin torn sheets along their back half
  // (About video 03, 1.78-1.82 s); a stuck arrow is a clean stub.
  const rag = kind === 'arrow' && !p.catalog?.stuck ? 0.55 : 0;
  out.R = R; out.L = L; out.kind = BODY_KIND[kind]; out.rag = rag;
  return out;
}

// Blob-mesh entries (glossy ink balls) appended inside the existing draw pass:
// Machine globs and helix beads, Explosher globs (the Bloblobber core is a
// true sphere in its own mesh: the native blob always tapers its back half).
export function appendS3ShapeBlobs(system, B, shp, inkLook, petals, count, capacity, matrix, rotation, scale, dir, axis) {
  const list = system?.list;
  if (!list) return count;
  const tmp = system._s3ShapeTmp || (system._s3ShapeTmp = { v: axis.clone(), r: axis.clone(), u: axis.clone() });
  const write = (at, radius, color, tail, wob, phase, look) => {
    if (count >= capacity) return;
    scale.setScalar(radius); matrix.compose(at, rotation, scale);
    B.setMatrixAt(count, matrix); B.setColorAt(count, color);
    const o = count * 4;
    shp[o] = tail; shp[o + 1] = wob; shp[o + 2] = phase; shp[o + 3] = 0;
    inkLook[o] = look[0]; inkLook[o + 1] = look[1]; inkLook[o + 2] = look[2]; inkLook[o + 3] = look[3];
    petals[count * 2] = 0; petals[count * 2 + 1] = 0;
    count++;
  };
  for (const p of list) {
    const kind = p.s3Shape;
    if (count >= capacity) break;
    if (kind !== 'machine' && kind !== 'explosher') continue;
    if (!p.owner?.color || p.delay > 0) continue;
    const sp = direction(p, dir);
    rotation.setFromUnitVectors(axis, dir);
    const seed = p.seed || 0, ph = seed * 40 + p.age * 18;
    const grow = clamp(p.age * 20, 0.2, 1);
    if (kind === 'explosher') {
      const R = S3_SHAPE.explosher.radius * grow;
      write(p.pos, R, p.owner.color, 1.15 + Math.min(0.3, sp * 0.006), 0.12, ph, [0.32, 3, 1, (seed * 43.98) % 6.2832]);
    } else {
      // Source DrawSizeParam: only the leading unit is visible (unit 1 is 0).
      if (!(p.vis > 0)) continue;
      const cfg = S3_SHAPE.machine, R = cfg.radius * grow;
      write(p.pos, R, p.owner.color, 1.2 + Math.min(0.3, sp * 0.006), 0.05, ph, [0, 1, 1, seed]);
      // two-strand corkscrew trailing the glob
      if (Math.abs(dir.y) < 0.95) tmp.r.set(-dir.z, 0, dir.x).normalize(); else tmp.r.set(1, 0, 0);
      tmp.u.crossVectors(dir, tmp.r);
      const travel = p.start ? p.start.distanceTo(p.pos) : Infinity;
      for (let strand = 0; strand < 2; strand++) for (let i = 1; i <= cfg.beads; i++) {
        const back = i * cfg.beadSpacing + R * 0.6;
        if (back > travel) break;
        const k = i / cfg.beads, ang = -p.age * cfg.spin + i * 0.95 + strand * Math.PI + seed * 6.2832;
        const hr = cfg.helixRadius * grow * (1 - 0.25 * k);
        tmp.v.copy(p.pos).addScaledVector(dir, -back)
          .addScaledVector(tmp.r, Math.cos(ang) * hr).addScaledVector(tmp.u, Math.sin(ang) * hr);
        write(tmp.v, 0.055 * grow * (1 - 0.55 * k), p.owner.color, 1.15, 0.02, ph + i, [0, 1, 1, 0]);
      }
    }
  }
  return count;
}

export function drawS3Shapes(system, THREE, G) {
  const R = system._s3Shapes || (system._s3Shapes = createRenderer(THREE, system.scene));
  const { body, bodyData, slashH, slashV, shell, core, sparkPos, sparkSize, m, q, q2, s, v, f, x, y, basis, Z, UP } = R;
  const bd = bodyData.array, cam = G?.camera?.position;
  let nb = 0, nh = 0, nv = 0, ns = 0, nc = 0, nk = 0;
  for (const p of system.list) {
    const kind = p.s3Shape;
    if (!kind || p.delay > 0 || !p.owner?.color) continue;
    const sp = direction(p, f);
    const color = p.owner.color;
    if (kind === 'shot' || kind === 'pellet' || kind === 'arrow') {
      if (nb >= MAX_BODY) continue;
      const b = bodyParams(p, kind, sp, R.bodyParams);
      if (!(b.R > 0)) continue;
      q.setFromUnitVectors(Z, f);
      // roll the cross-section with the seed so torn tails differ per round
      q2.setFromAxisAngle(Z, (p.seed || 0) * 6.2832); q.multiply(q2);
      m.compose(p.pos, q, s.setScalar(b.R));
      body.setMatrixAt(nb, m); body.setColorAt(nb, color);
      const o = nb * 4; bd[o] = b.L; bd[o + 1] = b.kind; bd[o + 2] = b.rag; bd[o + 3] = p.seed || 0;
      nb++;
    } else if (kind === 'slash-h' || kind === 'slash-v') {
      const mesh = kind === 'slash-h' ? slashH : slashV, n = kind === 'slash-h' ? nh : nv;
      if (n >= MAX_SLASH) continue;
      // forward = travel; span horizontal (H) or vertical (V)
      x.crossVectors(UP, f); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); x.normalize();
      y.crossVectors(f, x).normalize();
      if (kind === 'slash-h') basis.makeBasis(x, y, f); else basis.makeBasis(y, x.negate(), f);
      q.setFromRotationMatrix(basis);
      const frames = p.age * 60, lifeFrames = Math.max(1, (p.life || 0.1) * 60);
      const born = 0.55 + 0.45 * smooth(0, 3, frames), late = smooth(lifeFrames * 0.7, lifeFrames, frames);
      s.set(born * (1 - 0.15 * late), born * (1 - 0.6 * late), born * (1 - 0.35 * late));
      m.compose(p.pos, q, s);
      mesh.setMatrixAt(n, m); mesh.setColorAt(n, color);
      if (kind === 'slash-h') nh++; else nv++;
    } else if (kind === 'bubble') {
      const r = drawRadius(p);
      if (ns < MAX_SHELL && r > 0) {
        m.compose(p.pos, q.identity(), s.setScalar(r));
        shell.setMatrixAt(ns, m); shell.setColorAt(ns, color); ns++;
      }
      // round ink ball floating inside the clear film
      if (nc < MAX_CORE && r > 0) {
        m.compose(p.pos, q.identity(), s.setScalar(r * S3_SHAPE.bubble.core));
        core.setMatrixAt(nc, m); core.setColorAt(nc, color); nc++;
      }
      // tiny empty bubbles drifting behind a young shot (calibration: 0.6 s)
      const fade = 1 - smooth(0.25, 0.6, p.age);
      if (fade > 0 && p.start) for (let i = 0; i < S3_SHAPE.bubble.trailing && ns < MAX_SHELL; i++) {
        const seed = (p.seed || 0) * 13.1 + i * 7.3;
        const back = (0.35 + 0.45 * i) * r + 0.2;
        if (back > p.start.distanceTo(p.pos)) break;
        v.copy(p.pos).addScaledVector(f, -back);
        v.x += (hash(seed, 1) - 0.5) * r; v.y += (hash(seed, 2) - 0.3) * r * 0.8 + p.age * 0.3; v.z += (hash(seed, 3) - 0.5) * r;
        m.compose(v, q.identity(), s.setScalar(r * (0.1 + 0.1 * hash(seed, 4)) * fade));
        shell.setMatrixAt(ns, m); shell.setColorAt(ns, color); ns++;
      }
    } else if (kind === 'explosher') {
      if (cam && cam.distanceToSquared(p.pos) > 3600) continue;
      const n = S3_SHAPE.explosher.sparkles, rad = S3_SHAPE.explosher.radius;
      for (let i = 0; i < n && nk < MAX_SPARK; i++) {
        const seed = (p.seed || 0) * 91.7 + i * 3.17;
        const a = hash(seed, 1) * 6.2832, b = Math.acos(2 * hash(seed, 2) - 1);
        const d = rad * (1.2 + 2.2 * hash(seed, 3)) + 0.35 * fract(p.age * (0.8 + hash(seed, 5)) + hash(seed, 6));
        v.set(Math.sin(b) * Math.cos(a + p.age * 3), Math.cos(b), Math.sin(b) * Math.sin(a + p.age * 3)).multiplyScalar(d);
        v.addScaledVector(f, -0.35 * hash(seed, 7) * Math.min(1, sp * 0.05)).add(p.pos);
        sparkPos.array[nk * 3] = v.x; sparkPos.array[nk * 3 + 1] = v.y; sparkPos.array[nk * 3 + 2] = v.z;
        const tw = 0.5 + 0.5 * Math.sin(p.age * 30 + seed * 10);
        sparkSize.array[nk] = 0.07 + 0.09 * tw * hash(seed, 8);
        nk++;
      }
    }
  }
  bodyData.clearUpdateRanges(); bodyData.addUpdateRange(0, nb * 4); bodyData.needsUpdate = nb > 0;
  upload(body, nb); upload(slashH, nh); upload(slashV, nv); upload(shell, ns); upload(core, nc);
  R.sparks.visible = nk > 0; R.sparks.userData.count = nk; R.sparks.geometry.setDrawRange(0, nk);
  if (nk) {
    sparkPos.clearUpdateRanges(); sparkPos.addUpdateRange(0, nk * 3); sparkPos.needsUpdate = true;
    sparkSize.clearUpdateRanges(); sparkSize.addUpdateRange(0, nk); sparkSize.needsUpdate = true;
  }
  return { body: nb, slashH: nh, slashV: nv, shell: ns, core: nc, sparkles: nk };
}

// Classify every live projectile before the native pass (which skips
// p.s3Shape), then draw the dedicated meshes. Classification is recomputed
// each frame, so pooled projectile reuse can never inherit a stale shape.
export function installS3ProjectileShapes(api) {
  const { Projectiles, THREE, G } = api || {};
  const P = Projectiles?.prototype;
  if (!P || Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  const draw = P._draw, clear = P.clear;
  P._draw = function (...args) {
    for (const p of this.list) p.s3Shape = s3ShapeKind(p);
    const result = draw.apply(this, args);
    this.s3ShapeCounts = drawS3Shapes(this, THREE, G);
    return result;
  };
  if (typeof clear === 'function') P.clear = function (...args) {
    const result = clear.apply(this, args);
    if (this._s3Shapes) drawS3Shapes(this, THREE, G);
    return result;
  };
}
