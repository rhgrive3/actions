// GPU effect pools for the Splatoon 3 special presentation (special-vfx.mjs).
//
// Presentation only. Nothing here reads or writes gameplay state: the special
// directors push effect instances; these pools simulate, draw and recycle them.
// Every pool is one draw call with a fixed capacity, owns its geometry and
// material for the lifetime of the FX instance it is attached to (fx.root), and
// always keeps one degenerate instance alive so the shader program is compiled
// by the game's boot warm-up (compileAsync on the whole scene) rather than on
// the first activation mid-match.
//
// Colours are linear HDR: the game's bloom threshold is 2.4, so cores meant to
// glow are pushed above it and ink bodies stay below it.
//
// Pools
//   sparks   additive camera-facing quads: streak (velocity-stretched line), star, glow, ring, ray
//   puffs    alpha camera-facing quads: smoke, ink mist, ink chunk, dust
//   ribbons  CPU-built camera-facing strips that follow a moving point (smoke, ink, glow)
//   beams    instanced cylinders between two points (laser, ink jet, thin line, light pillar, twister)
//   shells   instanced spheres (ink dome, energy orb, hologram dome, shock sphere)
//   bands    instanced open cylinders standing on the ground (wave wall, shock band, swirl)
//   discs    instanced oriented quads (shock ring, lock reticle, target marker, flash disc, rune circle)

const TAU = Math.PI * 2;
// Presentation randomness never touches Math.random: gameplay (spread, paint seeds) keeps its own sequence.
let seed32 = 0x9e3779b9;
export function vfxRandom() {
  seed32 = (seed32 + 0x6d2b79f5) >>> 0; let t = seed32;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const OUT = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
const HASH = `
float sxHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sxNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(sxHash(i), sxHash(i+vec2(1.0,0.0)), u.x), mix(sxHash(i+vec2(0.0,1.0)), sxHash(i+vec2(1.0,1.0)), u.x), u.y); }
float sxSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sxCross(vec2 a, vec2 b){ return a.x * b.y - a.y * b.x; }
float sxTri(vec2 p, vec2 a, vec2 b, vec2 c){ float d1 = sxCross(b - a, p - a), d2 = sxCross(c - b, p - b), d3 = sxCross(a - c, p - c);
  return ((d1 <= 0.0 && d2 <= 0.0 && d3 <= 0.0) || (d1 >= 0.0 && d2 >= 0.0 && d3 >= 0.0)) ? 1.0 : 0.0; }
float sxFbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * sxNoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

// Ink lighting shared with the game's own droplets (fx.js DROP_FRAG): the same sun/sky/ground uniforms (the FX
// instance's _dropU objects, so the light follows the stage) and the same terms — sun and hemisphere ambient,
// a darker lens rim, light transmitted through the body on the side away from the sun, sky reflection at grazing
// angles and a crisp sun glint. n and V are view-space (V points to the eye); g is the gloss (0..1).
const INK = `
uniform vec3 uSunDirV; uniform vec3 uUpV; uniform vec3 uSunCol; uniform vec3 uSkyCol; uniform vec3 uGroundCol;
// The droplet terms, balanced for large liquid surfaces as well as drops: ink is a deep, saturated body (diffuse
// kept low so broad sheets don't wash out pale), its rim darker still, and the gloss is carried by a small hot sun
// glint and a sky reflection tinted by the ink itself.
vec3 sxInk(vec3 c, vec3 n, vec3 V, float g){
  float ndl = dot(n, uSunDirV);
  vec3 amb = mix(uGroundCol, uSkyCol, dot(n, uUpV) * 0.5 + 0.5);
  vec3 base = c * (amb * 0.5 + uSunCol * clamp(ndl * 0.5 + 0.5, 0.0, 1.0) * 0.5 + 0.1);
  float edge = 1.0 - clamp(dot(n, V), 0.0, 1.0);
  base += c * (c + 0.25) * pow(clamp(-ndl, 0.0, 1.0), 1.5) * (0.35 + 0.65 * edge) * 0.6 * g;
  base *= mix(1.0, 0.55, pow(edge, 2.0) * g);
  vec3 R = reflect(-V, n);
  vec3 env = mix(uGroundCol * 0.7, uSkyCol * 1.3, smoothstep(-0.15, 0.35, dot(R, uUpV)));
  env = mix(env, env * (c * 0.8 + 0.2) * 1.6, 0.6);
  vec3 col = mix(base, env, (0.03 + 0.97 * pow(edge, 4.0)) * g * 0.3);
  float rl = clamp(dot(R, uSunDirV), 0.0, 1.0);
  col += uSunCol * (pow(rl, 150.0) * 7.0 + pow(rl, 24.0) * 0.22) * g;
  col += vec3(1.0) * smoothstep(0.86, 0.9, rl) * 0.85 * g;             // the crisp, painted-looking gloss spot of S3 ink
  return col * mix(0.85, 1.0, g);
}
`;
export function inkLightUniforms(THREE, fx) {
  const u = fx?._dropU;
  if (u?.uSunDirV && u.uUpV && u.uSunCol && u.uSkyCol && u.uGroundCol) return { uSunDirV: u.uSunDirV, uUpV: u.uUpV, uSunCol: u.uSunCol, uSkyCol: u.uSkyCol, uGroundCol: u.uGroundCol };
  return { uSunDirV: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() }, uUpV: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 0.95, 0.88) }, uSkyCol: { value: new THREE.Color(0.55, 0.7, 0.9) }, uGroundCol: { value: new THREE.Color(0.35, 0.33, 0.3) } };
}

// Screen-space AO (the renderer's GTAOPass) redraws the whole scene with a MeshNormalMaterial override.
// Effect meshes are transparent and place their instances in the vertex shader, so under that override
// they would draw their base shapes (a ribbon strip in place, unit shapes at the world origin) into the
// normal/depth buffer and cast dark occlusion smudges. Skip the draw only while an override material is bound.
export function excludeFromOverridePasses(mesh) {
  if (!mesh || mesh.userData.s3NoOverridePass) return mesh;
  mesh.userData.s3NoOverridePass = true;
  const before = mesh.onBeforeRender, after = mesh.onAfterRender;
  mesh.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
    if (scene?.overrideMaterial && material === scene.overrideMaterial && geometry?.drawRange) {
      this.userData.s3OverrideRange = geometry.drawRange.count; geometry.drawRange.count = 0;
    }
    return before.call(this, renderer, scene, camera, geometry, material, group);
  };
  mesh.onAfterRender = function (renderer, scene, camera, geometry, material, group) {
    if (this.userData.s3OverrideRange !== undefined) { geometry.drawRange.count = this.userData.s3OverrideRange; this.userData.s3OverrideRange = undefined; }
    return after.call(this, renderer, scene, camera, geometry, material, group);
  };
  return mesh;
}

// ---------------------------------------------------------------------------------------------------------------
// Sprite particles (sparks: additive, puffs: alpha)
// ---------------------------------------------------------------------------------------------------------------
export const SPARK = Object.freeze({ STREAK: 0, STAR: 1, GLOW: 2, RING: 3, RAY: 4 });
export const PUFF = Object.freeze({ SMOKE: 0, MIST: 1, CHUNK: 2, DUST: 3, PETAL: 4 });
const SPRITE_VERT = `
attribute vec4 iPos;   // xyz, size
attribute vec4 iDir;   // stretch direction xyz, stretch length (world)
attribute vec4 iCol;   // rgb, alpha
attribute vec4 iPar;   // kind, rotation, age01, seed
varying vec2 vUv; varying vec4 vCol; varying vec4 vPar; varying float vStretch; varying vec2 vAx;
void main(){
  vec4 c = viewMatrix * vec4(iPos.xyz, 1.0);
  vec3 dv = mat3(viewMatrix) * iDir.xyz;
  float l2 = length(dv.xy);
  vec2 ax = l2 > 1e-4 ? dv.xy / l2 : vec2(cos(iPar.y), sin(iPar.y));
  vec2 bx = vec2(ax.y, -ax.x);   // right-handed with ax so the quad faces the camera (a mirrored quad is culled)
  float along = iDir.w * (l2 > 1e-4 ? l2 / max(length(dv), 1e-4) : 0.0) * 0.5;
  float s = iPos.w;
  c.xy += ax * position.y * (s + along) + bx * position.x * s;
  vUv = position.xy; vCol = iCol; vPar = iPar; vStretch = along / max(s, 1e-4); vAx = ax;
  gl_Position = projectionMatrix * c;
}`;
const SPARK_FRAG = `
varying vec2 vUv; varying vec4 vCol; varying vec4 vPar; varying float vStretch;
void main(){
  int kind = int(vPar.x + 0.5);
  vec2 p = vUv; float a = 0.0;
  if (kind == 0) {              // streak: soft capsule with a hot core
    float k = clamp(vStretch / (1.0 + vStretch), 0.0, 1.0);
    float y = abs(p.y); float x = abs(p.x);
    float body = (1.0 - smoothstep(0.0, 1.0, x)) * (1.0 - smoothstep(1.0 - 0.6 * (1.0 - k) - 0.08, 1.0, y));
    a = body * body;
  } else if (kind == 1) {       // star: four rays + core
    float r = length(p);
    float rays = max(0.0, 1.0 - abs(p.x) * 7.0 - abs(p.y) * 0.9) + max(0.0, 1.0 - abs(p.y) * 7.0 - abs(p.x) * 0.9);
    a = clamp(rays * 0.9 + exp(-r * r * 14.0) * 1.2, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, r));
  } else if (kind == 2) {       // glow
    float r = length(p); a = exp(-r * r * 4.0) * (1.0 - smoothstep(0.8, 1.0, r));
  } else if (kind == 3) {       // ring
    float r = length(p); float w = 0.12 + 0.2 * (1.0 - vPar.z);
    a = (1.0 - smoothstep(0.0, w, abs(r - (1.0 - w)))) ;
  } else {                      // ray: a long thin spike, fading towards the tip
    float y = p.y * 0.5 + 0.5;
    a = (1.0 - smoothstep(0.0, 1.0, abs(p.x) * (1.0 + y * 2.0))) * smoothstep(0.0, 0.15, y) * (1.0 - y * 0.85);
  }
  a *= vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * a, a);
  ${OUT}
}`;
const PUFF_FRAG = `
${HASH}
${INK}
uniform float uTime;
varying vec2 vUv; varying vec4 vCol; varying vec4 vPar; varying float vStretch; varying vec2 vAx;
void main(){
  int kind = int(vPar.x + 0.5);
  float ca = cos(vPar.y), sa = sin(vPar.y);
  vec2 p = mat2(ca, -sa, sa, ca) * vUv;
  float r = length(p), a = 0.0; vec3 col = vCol.rgb;
  if (kind == 0 || kind == 3) {        // smoke / dust: billowy edge, darker belly, fades and thins with age
    float n = sxFbm(p * 1.7 + vPar.w * 31.0 + vec2(0.0, uTime * 0.15));
    float edge = 0.62 + 0.38 * n - vPar.z * 0.25;
    a = 1.0 - smoothstep(edge - 0.32, edge, r);
    col *= 0.78 + 0.32 * (p.y * 0.5 + 0.5) + 0.12 * n;
  } else if (kind == 1) {              // ink mist: soft, slightly lumpy
    float n = sxNoise(p * 3.0 + vPar.w * 13.0);
    a = (1.0 - smoothstep(0.25, 1.0, r + n * 0.18)) * 0.8;
  } else if (kind == 4) {              // ink petal (S3 footage 83.0s/96.8s): a pointed leaf of glossy ink, team colour at the
    // rim and a white-hot core, tumbling; lit with the droplet terms
    vec2 q0 = p; float w = 0.3 * (1.0 - 0.15 * vPar.z);
    float half_ = w * pow(max(1.0 - q0.y * q0.y, 0.0), 0.7);
    float sd = abs(q0.x) - half_, fw = max(fwidth(sd), 1e-3);
    a = (1.0 - smoothstep(-fw, fw, sd)) * step(abs(q0.y), 1.0);
    if (a <= 0.0 || vCol.a < 0.03) discard;
    float u = q0.x / max(half_, 1e-3);
    float ca2 = cos(vPar.y), sa2 = sin(vPar.y);
    vec2 ax = vec2(-sa2, ca2), bx = vec2(ca2, sa2);
    vec3 n = normalize(vec3(bx * u * 0.8 + ax * q0.y * 0.35, 0.65));
    col = sxInk(vCol.rgb, n, vec3(0.0, 0.0, 1.0), 1.0);
    float core = (1.0 - smoothstep(0.15, 0.7, abs(u))) * (1.0 - smoothstep(0.35, 0.9, abs(q0.y)));
    col = mix(col, vec3(1.6), core * 0.92);
    gl_FragColor = vec4(col, a);
    ${OUT}
    return;
  } else {                             // ink chunk: a glossy liquid drop, round when slow and a teardrop (head leading)
    // when stretched along its velocity; shaded exactly like the game's droplets (sxInk)
    float st = vStretch, L = 1.0 + st;
    vec2 P = vec2(vUv.x, vUv.y * L);                                   // quad units: x radius 1, y half-length L
    float an = atan(P.y - st, P.x);
    // S3 splatter is never a clean ball: lobed, spiky flecks (two noise octaves round the rim)
    float lump = ((sxNoise(vec2(an * 1.3 + vPar.w * 17.0, vPar.w * 5.0)) - 0.5) * 0.5
               + (sxNoise(vec2(an * 3.8 + vPar.w * 29.0, vPar.w * 11.0)) - 0.5) * 0.32) * (1.0 - 0.6 * min(st, 1.0));
    float rh = 0.92, rt = mix(rh, 0.12, clamp(st * 0.8, 0.0, 1.0));
    vec2 A = vec2(0.0, st - (1.0 - rh)), B = vec2(0.0, -L + rt);
    vec2 pa = P - A, ba = B - A;
    float h = st > 1e-3 ? clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0) : 0.0;
    vec2 o = pa - ba * h; float rad = mix(rh, rt, h) * (1.0 + lump) * mix(0.35, 1.0, clamp(vCol.a, 0.0, 1.0));   // ink shrinks, never turns see-through
    float sd = length(o) - rad, fw = max(fwidth(sd), 1e-3);
    a = 1.0 - smoothstep(-fw, fw, sd);
    if (a <= 0.0) discard;
    vec2 q = o / max(rad, 1e-3); float z = sqrt(max(1.0 - dot(q, q), 0.0));
    vec2 bx = vec2(vAx.y, -vAx.x);   // the same side axis the vertex shader used
    vec3 n = normalize(vec3(bx * q.x + vAx * q.y, z + 0.05));
    col = sxInk(vCol.rgb, n, vec3(0.0, 0.0, 1.0), 1.0);
    if (vCol.a < 0.03) discard;
    gl_FragColor = vec4(col, a);
    ${OUT}
    return;
  }
  a *= vCol.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
  ${OUT}
}`;

class SpritePool {
  constructor(THREE, cap, additive, uTime, light = {}) {
    this.cap = cap; this.n = 0; this.additive = additive;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aDir = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aPar = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iDir', this.aDir); g.setAttribute('iCol', this.aCol); g.setAttribute('iPar', this.aPar);
    g.instanceCount = 1;
    const m = new THREE.ShaderMaterial({ uniforms: { uTime, ...(additive ? {} : light) }, vertexShader: SPRITE_VERT, fragmentShader: additive ? SPARK_FRAG : PUFF_FRAG,
      transparent: true, depthWrite: false, blending: additive ? THREE.CustomBlending : THREE.NormalBlending });
    if (additive) { m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; }
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 7 : 6;
    this.mesh.name = additive ? 'special-vfx:sparks' : 'special-vfx:puffs';
    // particle state: px py pz vx vy vz age life size0 size1 drag grav r g b a0 kind rot spin seed stretch fadeIn buoy
    this.S = 23; this.p = new Float32Array(cap * this.S);
  }
  spawn(x, y, z, vx, vy, vz, life, size0, size1, r, g, b, a, kind = 0, o = null) {
    if (this.n >= this.cap) { this._evict(); }
    const i = this.n++ * this.S, p = this.p;
    p[i] = x; p[i + 1] = y; p[i + 2] = z; p[i + 3] = vx; p[i + 4] = vy; p[i + 5] = vz; p[i + 6] = 0; p[i + 7] = Math.max(1e-3, life);
    p[i + 8] = size0; p[i + 9] = size1; p[i + 10] = o?.drag ?? 1.5; p[i + 11] = o?.grav ?? 0;
    p[i + 12] = r; p[i + 13] = g; p[i + 14] = b; p[i + 15] = a; p[i + 16] = kind; p[i + 17] = o?.rot ?? vfxRandom() * TAU;
    p[i + 18] = o?.spin ?? 0; p[i + 19] = o?.seed ?? vfxRandom(); p[i + 20] = o?.stretch ?? 0; p[i + 21] = o?.fadeIn ?? 0.06; p[i + 22] = o?.buoy ?? 0;
    return true;
  }
  _evict() { // drop the oldest (by age fraction) to keep new, louder effects
    let best = 0, bk = -1;
    for (let j = 0; j < this.n; j++) { const k = this.p[j * this.S + 6] / this.p[j * this.S + 7]; if (k > bk) { bk = k; best = j; } }
    this._kill(best);
  }
  _kill(j) { const S = this.S, last = --this.n; if (j !== last) this.p.copyWithin(j * S, last * S, last * S + S); }
  update(dt) {
    const p = this.p, S = this.S;
    for (let j = this.n - 1; j >= 0; j--) {
      const i = j * S; p[i + 6] += dt;
      if (p[i + 6] >= p[i + 7]) { this._kill(j); continue; }
      const drag = Math.exp(-p[i + 10] * dt);
      p[i + 3] *= drag; p[i + 5] *= drag; p[i + 4] = p[i + 4] * drag - p[i + 11] * dt + p[i + 22] * dt;
      p[i] += p[i + 3] * dt; p[i + 1] += p[i + 4] * dt; p[i + 2] += p[i + 5] * dt; p[i + 17] += p[i + 18] * dt;
    }
    const P = this.aPos.array, D = this.aDir.array, C = this.aCol.array, R = this.aPar.array;
    // instance 0 is the degenerate warm-up instance
    P[0] = P[1] = P[2] = 0; P[3] = 0; C[3] = 0;
    for (let j = 0; j < this.n; j++) {
      const i = j * S, o = (j + 1) * 4, t = p[i + 6] / p[i + 7];
      const fi = Math.min(1, p[i + 6] / Math.max(1e-3, p[i + 21])), fo = 1 - t * t;
      P[o] = p[i]; P[o + 1] = p[i + 1]; P[o + 2] = p[i + 2]; P[o + 3] = p[i + 8] + (p[i + 9] - p[i + 8]) * t;
      const st = p[i + 20];
      if (st > 0) { D[o] = p[i + 3]; D[o + 1] = p[i + 4]; D[o + 2] = p[i + 5]; D[o + 3] = Math.hypot(p[i + 3], p[i + 4], p[i + 5]) * st; }
      else { D[o] = D[o + 1] = D[o + 2] = D[o + 3] = 0; }
      C[o] = p[i + 12]; C[o + 1] = p[i + 13]; C[o + 2] = p[i + 14]; C[o + 3] = p[i + 15] * fi * (this.additive ? fo : 1 - Math.pow(t, 1.6));
      R[o] = p[i + 16]; R[o + 1] = p[i + 17]; R[o + 2] = t; R[o + 3] = p[i + 19];
    }
    const count = this.n + 1;
    for (const a of [this.aPos, this.aDir, this.aCol, this.aPar]) { a.clearUpdateRanges(); a.addUpdateRange(0, count * 4); a.needsUpdate = true; }
    this.mesh.geometry.instanceCount = count;
  }
  clear() { this.n = 0; }
}

// ---------------------------------------------------------------------------------------------------------------
// Ribbon trails
// ---------------------------------------------------------------------------------------------------------------
export const RIBBON = Object.freeze({ SMOKE: 0, INK: 1, GLOW: 2 });
const RIBBON_VERT = `
attribute vec4 aCol; attribute vec4 aRib; // rgb a | along01, side, style, seed
attribute vec3 aSide; attribute vec3 aFace; // world strip side and facing direction (for the ink tube normal)
varying vec4 vCol; varying vec4 vRib; varying vec3 vW; varying vec3 vSide; varying vec3 vFace; varying vec3 vV;
void main(){ vCol = aCol; vRib = aRib; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vec4 mv = viewMatrix * w; vSide = mat3(viewMatrix) * aSide; vFace = mat3(viewMatrix) * aFace; vV = -mv.xyz;
  gl_Position = projectionMatrix * mv; }`;
const RIBBON_FRAG = `
${HASH}
${INK}
uniform float uTime; uniform float uAdd;
varying vec4 vCol; varying vec4 vRib; varying vec3 vW; varying vec3 vSide; varying vec3 vFace; varying vec3 vV;
void main(){
  float along = vRib.x, side = vRib.y; int style = int(vRib.z + 0.5);
  float a = 0.0; vec3 col = vCol.rgb;
  if (style == 0) {            // smoke: billowing, broken edges, widening toward the tail
    float n = sxFbm(vec2(along * 9.0 - uTime * 0.6 + vRib.w * 9.0, side * 1.3 + vRib.w * 4.0));
    a = (1.0 - smoothstep(0.35 + 0.4 * n, 1.0, abs(side))) * smoothstep(0.0, 0.06, along);
    col *= 0.82 + 0.3 * n;
  } else if (style == 1) {     // ink: a glossy liquid tube that necks and breaks up toward its tail
    float s = abs(side);
    float brk = sxNoise(vec2(along * 9.0 - uTime * 0.5 + vRib.w * 5.0, side * 0.7 + 3.0));
    float wid = (1.0 - 0.55 * smoothstep(0.35, 1.0, along) * brk) * clamp(vCol.a * 1.25, 0.0, 1.0)
      * sqrt(clamp(along / 0.05, 0.0, 1.0));   // a rounded head instead of a square cut   // fades by necking, not transparency
    float sd = s - wid, fw = max(fwidth(sd), 1e-3);
    a = 1.0 - smoothstep(-fw, fw, sd);
    float u = clamp(side / max(wid, 0.05), -1.0, 1.0);
    vec3 n = normalize(normalize(vSide) * u * 0.7 + normalize(vFace) * sqrt(max(1.0 - u * u * 0.49, 0.0)));
    if (!gl_FrontFacing) n = reflect(n, normalize(vFace));
    col = sxInk(col, n, normalize(vV), 1.0);
    if (a < 0.005) discard;
    gl_FragColor = uAdd > 0.5 ? vec4(col * a, a) : vec4(col, a);
    ${OUT}
    return;
  } else {                     // glow: soft core
    float s = abs(side);
    a = exp(-s * s * 3.5) * (1.0 - along * 0.6);
  }
  a *= vCol.a;
  if (a < 0.005) discard;
  gl_FragColor = uAdd > 0.5 ? vec4(col * a, a) : vec4(col, a);
  ${OUT}
}`;
class RibbonPool {
  constructor(THREE, trails, points, additive, uTime, light = {}) {
    this.T = trails; this.M = points; this.additive = additive; this.list = [];
    const V = trails * points * 2;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(V * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.rib = new THREE.BufferAttribute(new Float32Array(V * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.side = new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.face = new THREE.BufferAttribute(new Float32Array(V * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos); g.setAttribute('aCol', this.col); g.setAttribute('aRib', this.rib);
    g.setAttribute('aSide', this.side); g.setAttribute('aFace', this.face);
    const idx = [];
    for (let t = 0; t < trails; t++) for (let k = 0; k < points - 1; k++) {
      const a = (t * points + k) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx); g.setDrawRange(0, 6);
    const m = new THREE.ShaderMaterial({ uniforms: { uTime, uAdd: { value: additive ? 1 : 0 }, ...light }, vertexShader: RIBBON_VERT, fragmentShader: RIBBON_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: additive ? THREE.CustomBlending : THREE.NormalBlending });
    if (additive) { m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; }
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 7 : 6;
    this.mesh.name = additive ? 'special-vfx:ribbons+' : 'special-vfx:ribbons';
    this._t = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Vector3();
  }
  // opts: { width, widthTail, color [r,g,b], alpha, style, life (point lifetime s), spacing (m), flat (ground-aligned) }
  start(opts) {
    if (this.list.length >= this.T) { const old = this.list.findIndex(r => r.ended); this.list.splice(old >= 0 ? old : 0, 1); }
    const r = { pts: [], ended: false, o: { width: .2, widthTail: .6, color: [1, 1, 1], alpha: 1, style: 0, life: .6, spacing: .12, seed: vfxRandom(), ...opts } };
    this.list.push(r); return r;
  }
  push(r, x, y, z, now) {
    if (!r || r.ended) return;
    const p = r.pts, last = p[p.length - 1];
    if (last && Math.hypot(x - last[0], y - last[1], z - last[2]) < r.o.spacing) { last[0] = x; last[1] = y; last[2] = z; last[3] = now; return; }
    p.push([x, y, z, now]); if (p.length > this.M) p.shift();
  }
  end(r) { if (r) r.ended = true; }
  update(now, camPos) {
    let v = 0; const P = this.pos.array, C = this.col.array, R = this.rib.array, SD = this.side.array, FC = this.face.array;
    const t = this._t, s = this._s, c = this._c;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const r = this.list[i];
      while (r.pts.length && now - r.pts[0][3] > r.o.life) r.pts.shift();
      if (r.ended && r.pts.length < 2) this.list.splice(i, 1);
    }
    let slot = 0;
    for (const r of this.list) {
      const p = r.pts, n = p.length; if (n < 2) continue;
      const base = slot * this.M * 2; slot++;
      for (let k = 0; k < this.M; k++) {
        const j = Math.min(n - 1, k), q = p[n - 1 - j];                 // head first
        const qa = p[Math.max(0, n - 2 - j)], qb = p[Math.min(n - 1, n - j)];
        t.set(qb[0] - qa[0], qb[1] - qa[1], qb[2] - qa[2]); if (t.lengthSq() < 1e-10) t.set(0, 1, 0); t.normalize();
        if (r.o.flat) c.set(0, 1, 0); else c.set(camPos.x - q[0], camPos.y - q[1], camPos.z - q[2]).normalize();   // flat: lies on the ground
        s.crossVectors(t, c); if (s.lengthSq() < 1e-8) s.set(1, 0, 0); s.normalize();
        const age = Math.min(1, (now - q[3]) / r.o.life), along = n > 1 ? j / (n - 1) : 0;
        const w = (r.o.width + (r.o.widthTail - r.o.width) * Math.max(age, along)) * 0.5;
        const alpha = k < n ? r.o.alpha * (1 - age) * (1 - along * 0.3) : 0;
        for (let side = 0; side < 2; side++) {
          const vi = base + k * 2 + side, sg = side ? 1 : -1;
          P[vi * 3] = q[0] + s.x * w * sg; P[vi * 3 + 1] = q[1] + s.y * w * sg; P[vi * 3 + 2] = q[2] + s.z * w * sg;
          C[vi * 4] = r.o.color[0]; C[vi * 4 + 1] = r.o.color[1]; C[vi * 4 + 2] = r.o.color[2]; C[vi * 4 + 3] = alpha;
          R[vi * 4] = along; R[vi * 4 + 1] = sg; R[vi * 4 + 2] = r.o.style; R[vi * 4 + 3] = r.o.seed;
          SD[vi * 3] = s.x; SD[vi * 3 + 1] = s.y; SD[vi * 3 + 2] = s.z; FC[vi * 3] = c.x; FC[vi * 3 + 1] = c.y; FC[vi * 3 + 2] = c.z;
        }
      }
      v = slot;
    }
    // keep one degenerate segment drawn (warm program); zero alpha
    if (!v) { for (let k = 0; k < 4; k++) { C[k * 4 + 3] = 0; P[k * 3] = P[k * 3 + 1] = P[k * 3 + 2] = 0; } v = 0; }
    this.mesh.geometry.setDrawRange(0, Math.max(6, slot * (this.M - 1) * 6));
    for (const a of [this.pos, this.col, this.rib, this.side, this.face]) { a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, slot) * this.M * 2 * a.itemSize); a.needsUpdate = true; }
  }
  clear() { this.list.length = 0; }
}

// ---------------------------------------------------------------------------------------------------------------
// Instanced shape pools (beams, shells, bands, discs). Effects are retained-mode records with a lifetime; their
// owner may update the record every frame (follow a hand, a target) or let the pool age it.
// ---------------------------------------------------------------------------------------------------------------
export const BEAM = Object.freeze({ LASER: 0, JET: 1, LINE: 2, PILLAR: 3, TWISTER: 4, CHARGE: 5 });
export const SHELL = Object.freeze({ INK: 0, ORB: 1, HOLO: 2, SHOCK: 3, FLASH: 4 });
export const BAND = Object.freeze({ WAVE: 0, SHOCK: 1, SWIRL: 2, TWISTER: 3, CURTAIN: 4 });
export const DISC = Object.freeze({ SHOCK: 0, RETICLE: 1, TARGET: 2, FLASH: 3, RUNE: 4, SPEAKER: 5, SPLAT: 6, CHEVRON: 7 });

const BEAM_VERT = `
attribute vec4 iA; attribute vec4 iB;  // start xyz r0 | end xyz r1
attribute vec4 iCol; attribute vec4 iPar; // rgb a | style, t, seed, speed
varying vec2 vUv; varying vec4 vCol; varying vec4 vPar; varying float vFres; varying float vLen; varying vec3 vNv; varying vec3 vVv;
void main(){
  vec3 A = iA.xyz, B = iB.xyz, d = B - A; float L = max(length(d), 1e-4); vec3 y = d / L;
  vec3 h = abs(y.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 x = normalize(cross(h, y)), z = cross(x, y);
  float k = position.y; float r = mix(iA.w, iB.w, k);
  int style = int(iPar.x + 0.5);
  float tw = style == 4 ? k * 9.0 + iPar.y * 0.0 : 0.0;
  vec3 radial = x * position.x + z * position.z;
  vec3 w = A + d * k + radial * r;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vec3 n = normalize(mat3(viewMatrix) * radial);
  vFres = abs(dot(n, normalize(-mv.xyz))); vNv = n; vVv = -mv.xyz;
  vUv = vec2(atan(position.z, position.x) / 6.2831853 + 0.5, k); vCol = iCol; vPar = iPar; vLen = L;
  gl_Position = projectionMatrix * mv;
}`;
const BEAM_FRAG = `
${HASH}
${INK}
uniform float uTime; uniform float uAdd;
varying vec2 vUv; varying vec4 vCol; varying vec4 vPar; varying float vFres; varying float vLen; varying vec3 vNv; varying vec3 vVv;
void main(){
  int style = int(vPar.x + 0.5); float t = vPar.y, seed = vPar.z, spd = vPar.w;
  float u = vUv.x, along = vUv.y * vLen; float a = 0.0; vec3 col = vCol.rgb;
  if (style == 0) {             // laser (S3 77.1s): a thick, opaque team-colour screw — bright ridges and dark grooves
    // winding along it, lit like ink, the grooves racing outward
    float ridge = 0.5 + 0.5 * sin((u * 3.0 - along * 0.9 + uTime * spd * 0.6) * 6.2831853);
    float groove = smoothstep(0.15, 0.0, ridge), crest = smoothstep(0.75, 1.0, ridge);
    vec3 N = normalize(vNv) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 lit = uAdd > 0.5 ? col : sxInk(col, N, normalize(vVv), 0.9);
    col = lit * (0.55 + 0.6 * ridge) + col * crest * 0.35;
    col *= 1.0 - 0.45 * groove;
    a = smoothstep(0.0, 0.6, along) * (uAdd > 0.5 ? 0.6 : 1.0) * smoothstep(0.0, 0.12, vFres);
  } else if (style == 1) {      // ink jet: a solid glossy liquid column, ripples pouring along it, breaking up at the end
    float streak = sxNoise(vec2(u * 9.0 + seed * 7.0, along * 2.2 - uTime * spd));
    float brk = (1.0 - vUv.y) - 0.35 * sxNoise(vec2(u * 5.0 + seed * 3.0, along * 1.3 - uTime * spd * 1.3));
    float fw = max(fwidth(brk), 1e-3);
    a = smoothstep(-fw, fw, brk - 0.2 - (1.0 - vCol.a) * 0.7) * smoothstep(0.02, 0.2, vFres);
    vec3 N = normalize(vNv); if (!gl_FrontFacing) N = -N;
    N = normalize(N + normalize(vVv) * (streak - 0.5) * 0.5);
    col = uAdd > 0.5 ? col * (0.75 + 0.6 * streak) : sxInk(col, N, normalize(vVv), 1.0);
  } else if (style == 2) {      // line: thin glow, optional dash (seed > .5)
    float dash = seed > 0.5 ? step(0.45, fract(along * 1.2 - uTime * spd)) : 1.0;
    a = pow(vFres, 1.5) * dash;
  } else if (style == 3) {      // pillar: vertical light column fading up
    a = pow(vFres, 2.0) * (1.0 - vUv.y) * (0.75 + 0.25 * sin(uTime * 14.0 + seed * 9.0));
    a *= 0.6 + 0.4 * sxNoise(vec2(u * 6.0, vUv.y * 4.0 - uTime * spd));
  } else if (style == 4) {      // twister: liquid ink wound into a spiral, ragged gaps
    float sw = fract(u * 2.0 + vUv.y * 2.5 - uTime * spd);
    float n = sxNoise(vec2(u * 8.0 + seed * 11.0, vUv.y * 6.0 - uTime * spd * 2.0));
    float body = min(sw - 0.06, 0.8 - sw) + (n - 0.5) * 0.25 - (1.0 - vCol.a) * 0.4;
    float fw = max(fwidth(body), 1e-3);
    a = smoothstep(-fw, fw, body) * smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
    vec3 N = normalize(vNv); if (!gl_FrontFacing) N = -N;
    col = uAdd > 0.5 ? col * (0.65 + 0.55 * n) : sxInk(col, N, normalize(vVv), 1.0);
  } else {                      // charge: converging energy filaments
    float f = pow(0.5 + 0.5 * sin((u * 7.0 + seed * 3.0) * 6.2831853), 10.0);
    float flow = fract(vUv.y + uTime * spd);
    a = f * smoothstep(0.0, 0.3, flow) * (1.0 - smoothstep(0.6, 1.0, flow)) * vFres;
  }
  if (uAdd > 0.5 || (style != 1 && style != 4)) a *= vCol.a;   // liquid styles already eroded by their alpha
  if (a < 0.004) discard;
  gl_FragColor = uAdd > 0.5 ? vec4(col * a, a) : vec4(col, a);
  ${OUT}
}`;
const SHELL_VERT = `
attribute vec4 iPos; attribute vec4 iScl;   // xyz, hemisphere flag | scale xyz, spin
attribute vec4 iCol; attribute vec4 iPar;   // rgb a | style, t, seed, extra
varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec4 vCol; varying vec4 vPar;
void main(){
  vec3 p = position; float s = sin(iScl.w), c = cos(iScl.w);
  p.xz = mat2(c, -s, s, c) * p.xz;
  if (iPos.w > 0.5) p.y = abs(p.y);
  vL = p;
  vec3 w = iPos.xyz + p * iScl.xyz;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vN = normalize(mat3(viewMatrix) * (p / max(iScl.xyz, vec3(1e-4))));
  vV = normalize(-mv.xyz); vCol = iCol; vPar = iPar;
  gl_Position = projectionMatrix * mv;
}`;
const SHELL_FRAG = `
${HASH}
${INK}
uniform float uTime; uniform float uAdd;
varying vec3 vN; varying vec3 vV; varying vec3 vL; varying vec4 vCol; varying vec4 vPar;
void main(){
  int style = int(vPar.x + 0.5); float t = vPar.y, seed = vPar.z;
  float f = 1.0 - abs(dot(normalize(vN), vV));
  vec2 sph = vec2(atan(vL.z, vL.x) / 6.2831853, vL.y);
  float a = 0.0; vec3 col = vCol.rgb;
  if (style == 0) {            // ink dome: an opaque, glossy, lumpy liquid surface tearing into holes as it finishes
    float n = sxFbm(vec2(sph.x * 10.0 + seed * 7.0, sph.y * 4.0 - t * 2.0));
    float hole = n * 0.9 + (1.0 - vL.y) * 0.25 - (t * 1.15 - 0.02) - (1.0 - vCol.a) * 0.9;   // fading tears holes, it never turns see-through
    float fw = max(fwidth(hole), 1e-3);
    a = smoothstep(-fw, fw, hole);
    float e = 0.06;
    float nx = sxFbm(vec2(sph.x * 10.0 + seed * 7.0 + e, sph.y * 4.0 - t * 2.0)) - n;
    float ny = sxFbm(vec2(sph.x * 10.0 + seed * 7.0, sph.y * 4.0 - t * 2.0 + e)) - n;
    vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), N) + vec3(1e-4)), Bt = cross(N, T);
    N = normalize(N - (T * nx + Bt * ny) * 5.0);
    col = sxInk(col, N, vV, 1.0);
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    ${OUT}
    return;
  } else if (style == 1) {     // energy orb: fresnel glow with swirling filaments
    float sw = pow(0.5 + 0.5 * sin((sph.x * 5.0 + sph.y * 2.5 - uTime * (1.2 + seed)) * 6.2831853), 6.0);
    float n = sxNoise(vec2(sph.x * 18.0 + uTime * 0.7, sph.y * 6.0 - uTime * 0.9 + seed * 5.0));
    a = clamp(pow(f, 1.6) * 0.9 + sw * 0.35 + n * 0.12, 0.0, 1.0);
    col = mix(col, vec3(1.0) * max(col.r, max(col.g, col.b)), (1.0 - f) * 0.5);
  } else if (style == 2) {     // hologram: latitude/longitude grid, scanning band
    vec2 gp = vec2(sph.x * 24.0, vL.y * 9.0);
    vec2 g = abs(fract(gp) - 0.5);
    float grid = 1.0 - smoothstep(0.0, 0.07, min(g.x, g.y));
    float scan = exp(-pow((vL.y - fract(uTime * 0.6 + seed)) * 9.0, 2.0));
    a = 0.06 + grid * 0.35 + pow(f, 2.5) * 0.55 + scan * 0.35;
  } else if (style == 3) {     // shock sphere: thin bright edge, distorted
    float n = sxNoise(vec2(sph.x * 12.0 + seed * 3.0, sph.y * 6.0));
    a = pow(f, 4.0 + 3.0 * n) * (1.0 - t);
  } else {                     // flash: blown-out core, soft fresnel falloff
    a = (1.0 - f * f) * (1.0 - t) + pow(f, 3.0) * 0.4 * (1.0 - t);
    col = mix(col, vec3(max(col.r, max(col.g, col.b))), 0.6);
  }
  a *= vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = uAdd > 0.5 ? vec4(col * a, a) : vec4(col, a);
  ${OUT}
}`;
const BAND_VERT = `
attribute vec4 iPos; attribute vec4 iDim;   // xyz, spin | radius, height, taper, twist
attribute vec4 iCol; attribute vec4 iPar;   // rgb a | style, t, seed, speed
varying vec2 vUv; varying vec4 vCol; varying vec4 vPar; varying float vFres; varying vec3 vNv; varying vec3 vVv;
void main(){
  float k = position.y; float ang = atan(position.z, position.x) + iPos.w + iDim.w * k;
  float r = iDim.x * mix(1.0, iDim.z, k);
  vec3 w = iPos.xyz + vec3(cos(ang) * r, k * iDim.y, sin(ang) * r);
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vec3 n = normalize(mat3(viewMatrix) * vec3(cos(ang), 0.0, sin(ang)));
  vFres = abs(dot(n, normalize(-mv.xyz))); vNv = n; vVv = -mv.xyz;
  vUv = vec2(atan(position.z, position.x) / 6.2831853 + 0.5, k); vCol = iCol; vPar = iPar;
  gl_Position = projectionMatrix * mv;
}`;
const BAND_FRAG = `
${HASH}
${INK}
uniform float uTime; uniform float uAdd;
varying vec2 vUv; varying vec4 vCol; varying vec4 vPar; varying float vFres; varying vec3 vNv; varying vec3 vVv;
void main(){
  int style = int(vPar.x + 0.5); float t = vPar.y, seed = vPar.z, spd = vPar.w;
  float u = vUv.x, v = vUv.y, a = 0.0; vec3 col = vCol.rgb;
  if (style == 0) {             // wave wall: a translucent fence of vertical light lines, a bright crest line and a lit base
    float stripe = 1.0 - smoothstep(0.0, 0.32, abs(fract(u * 260.0 + seed * 7.0) - 0.5) * 2.0 - 0.6);
    float top = exp(-pow((v - 0.9) * 13.0, 2.0));
    float base = exp(-v * 7.0);
    float flicker = 0.85 + 0.15 * sxNoise(vec2(u * 40.0 + seed * 9.0, uTime * spd * 2.0));
    a = (0.16 + 0.5 * stripe * (1.0 - v * 0.55) + top * 0.95 + base * 0.45) * flicker * (1.0 - smoothstep(0.96, 1.0, v));
    col = mix(col, vec3(max(col.r, max(col.g, col.b))) * 1.1, top * 0.45);
  } else if (style == 1) {      // shock band: a crown of thrown liquid ink, torn into fingers at the top
    float n = sxFbm(vec2(u * 30.0 + seed * 9.0, v * 2.0 - t * 3.0));
    float n2 = sxNoise(vec2(u * 6.0 + seed * 13.0, seed * 3.0));             // uneven lobes, not a regular comb
    float top = (0.18 + 0.5 * n + 0.42 * n2 * n2) * (1.0 - 0.55 * t) * (uAdd > 0.5 ? 1.0 : clamp(vCol.a, 0.0, 1.0)) - v;
    float fw = max(fwidth(top), 1e-3);
    a = smoothstep(-fw, fw, top) * smoothstep(0.0, 0.04, v) * (uAdd > 0.5 ? 1.0 - smoothstep(0.75, 1.0, t) : 1.0);
    vec3 N = normalize(vNv); if (!gl_FrontFacing) N = -N;
    N = normalize(N + vec3(0.0, (n - 0.5) * 0.8, 0.0));
    col = uAdd > 0.5 ? col * (0.8 + 0.4 * n) : sxInk(col, N, normalize(vVv), 1.0);
  } else if (style == 2) {      // swirl: spinning streaked ribbon
    float sw = pow(0.5 + 0.5 * sin((u * 3.0 + v * 1.5 - uTime * spd) * 6.2831853), 4.0);
    // fade where the cylinder turns edge-on: otherwise its silhouette reads as a hard-edged sheet up close
    a = sw * sin(v * 3.14159) * (1.0 - t) * smoothstep(0.08, 0.55, vFres);
  } else if (style == 3) {      // twister: liquid ink wound in a spiral, with ragged gaps
    float sw = fract(u * 3.0 - v * 1.4 + uTime * spd + seed);
    float n = sxNoise(vec2(u * 16.0 + seed * 3.0, v * 8.0 + uTime * spd * 3.0));
    float body = min(sw - 0.05, 0.72 - sw) + (n - 0.5) * 0.25 - (uAdd > 0.5 ? 0.0 : (1.0 - vCol.a) * 0.4);
    float fw = max(fwidth(body), 1e-3);
    a = smoothstep(-fw, fw, body) * smoothstep(0.0, 0.08, v) * (1.0 - smoothstep(0.85, 1.0, v));
    vec3 N = normalize(vNv); if (!gl_FrontFacing) N = -N;
    N = normalize(N + vec3(0.0, (sw - 0.38) * 1.4, 0.0));
    col = uAdd > 0.5 ? col * (0.6 + 0.5 * n) : sxInk(col, N, normalize(vVv), 1.0);
  } else {                      // curtain: marbled flowing sheet (Splattercolor Screen)
    vec2 q = vec2(u * 6.0, v * 2.5);
    float m = sxFbm(q + vec2(sxFbm(q * 1.3 + uTime * 0.12), sxFbm(q * 1.1 - uTime * 0.1)) * 1.6);
    float stripes = 0.5 + 0.5 * sin(m * 14.0 + v * 4.0);
    a = 0.85 * smoothstep(0.0, 0.03, v) * (1.0 - smoothstep(0.92, 1.0, v));
    col = mix(col * 0.55, col * 1.25 + 0.15, stripes);
  }
  if (uAdd > 0.5 || (style != 1 && style != 3)) a *= vCol.a;   // liquid styles already eroded by their alpha
  if (a < 0.004) discard;
  gl_FragColor = uAdd > 0.5 ? vec4(col * a, a) : vec4(col, a);
  ${OUT}
}`;
const DISC_VERT = `
attribute vec4 iPos; attribute vec4 iNrm;   // xyz, radius | normal xyz, spin
attribute vec4 iCol; attribute vec4 iPar;   // rgb a | style, t, seed, extra
varying vec2 vUv; varying vec4 vCol; varying vec4 vPar; varying vec3 vNv; varying vec3 vTv; varying vec3 vBv; varying vec3 vVv;
void main(){
  vec3 n = normalize(iNrm.xyz); vec3 h = abs(n.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 x = normalize(cross(h, n)), y = cross(n, x);
  float s = sin(iNrm.w), c = cos(iNrm.w); vec2 p = mat2(c, -s, s, c) * position.xy;
  vec3 w = iPos.xyz + (x * p.x + y * p.y) * iPos.w + n * 0.02;
  vUv = position.xy; vCol = iCol; vPar = iPar;
  vec4 mv = viewMatrix * vec4(w, 1.0);
  vNv = mat3(viewMatrix) * n; vTv = mat3(viewMatrix) * (x * c - y * s); vBv = mat3(viewMatrix) * (x * s + y * c); vVv = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const DISC_FRAG = `
${HASH}
${INK}
uniform float uTime; uniform float uAdd;
varying vec2 vUv; varying vec4 vCol; varying vec4 vPar; varying vec3 vNv; varying vec3 vTv; varying vec3 vBv; varying vec3 vVv;
// a glossy puddle: flat on top, its surface rolling over (normal tilting outward) at the blot's edge
vec3 sxPuddle(vec3 c, float edgeK, float bump){
  vec2 d = length(vUv) > 1e-4 ? normalize(vUv) : vec2(0.0);
  vec3 N = normalize(normalize(vNv) + (normalize(vTv) * d.x + normalize(vBv) * d.y) * (edgeK * 1.6 + bump));
  if (!gl_FrontFacing) N = -N;
  return sxInk(c, N, normalize(vVv), 0.9);
}
void main(){
  int style = int(vPar.x + 0.5); float t = vPar.y, seed = vPar.z, ex = vPar.w;
  float r = length(vUv), ang = atan(vUv.y, vUv.x); float a = 0.0; vec3 col = vCol.rgb;
  if (r > 1.0) discard;
  if (style == 0) {            // shock ring: a ragged expanding ring of ink spray (light when additive, liquid otherwise)
    float n = sxNoise(vec2(ang * 6.0 + seed * 20.0, t * 4.0));
    float w = 0.05 + 0.18 * (1.0 - t);
    if (uAdd > 0.5) {
      a = (1.0 - smoothstep(0.0, w, abs(r - (0.86 + 0.1 * n)))) * (1.0 - t);
      a += (1.0 - smoothstep(0.75, 0.95, r)) * 0.18 * (1.0 - t) * n;
    } else {
      float ring = w * (0.6 + 0.8 * n) * clamp(vCol.a, 0.0, 1.0) - abs(r - (0.86 + 0.1 * n));
      float fw = max(fwidth(ring), 1e-3);
      a = smoothstep(-fw, fw, ring);
      col = sxPuddle(col, clamp((r - 0.86 - 0.1 * n) / max(w, 1e-3), -1.0, 1.0) * 0.6, 0.0);
    }
  } else if (style == 1) {     // reticle: double ring, four ticks, rotating brackets
    float ring = 1.0 - smoothstep(0.0, 0.03, abs(r - 0.92));
    float inner = (1.0 - smoothstep(0.0, 0.02, abs(r - 0.62))) * 0.6;
    float ticks = (1.0 - smoothstep(0.0, 0.06, abs(sin(ang * 2.0)))) * step(0.66, r) * step(r, 0.86);
    float br = step(0.5, fract((ang + uTime * 1.5) / 6.2831853 * 4.0)) * (1.0 - smoothstep(0.0, 0.035, abs(r - 0.78))) * 0.7;
    a = max(max(ring, inner), max(ticks, br)) * (0.75 + 0.25 * sin(uTime * 12.0 + seed * 6.0));
  } else if (style == 2) {     // landing target: dashed spinning circle, cross, filled centre pulse
    float dash = step(0.5, fract(ang / 6.2831853 * 24.0));
    float ring = (1.0 - smoothstep(0.0, 0.035, abs(r - 0.93))) * dash;
    float cross = (1.0 - smoothstep(0.0, 0.03, min(abs(vUv.x), abs(vUv.y)))) * step(r, 0.3);
    float pulse = (1.0 - smoothstep(0.0, 0.05, abs(r - fract(uTime * 1.3 + seed)))) * 0.45;
    a = max(max(ring, cross), pulse) + 0.12 * (1.0 - r);
  } else if (style == 3) {     // flash disc: radial burst
    float rays = pow(0.5 + 0.5 * sin(ang * 9.0 + seed * 20.0), 6.0) * (1.0 - r);
    a = (exp(-r * r * 6.0) + rays * 0.6) * (1.0 - t);
  } else if (style == 4) {     // rune circle: concentric rings with marks (special activation)
    float ring1 = 1.0 - smoothstep(0.0, 0.025, abs(r - 0.95));
    float ring2 = 1.0 - smoothstep(0.0, 0.015, abs(r - 0.78));
    float marks = step(0.82, r) * step(r, 0.92) * step(0.7, fract(ang / 6.2831853 * 16.0 + uTime * 0.4));
    a = max(max(ring1, ring2 * 0.7), marks * 0.8) * (1.0 - t);
  } else if (style == 5) {     // speaker ring: thick white ring with a soft inner fill (Killer Wail mouth)
    float ring = 1.0 - smoothstep(0.0, 0.1, abs(r - 0.85));
    a = ring + (1.0 - r) * 0.25 * (0.6 + 0.4 * sin(uTime * 30.0));
    col = mix(col, vec3(max(col.r, max(col.g, col.b))), 0.7);
  } else if (style == 7) {     // charge arrows: three hollow white arrowheads pointing toward local +y (S3: Kraken Royale)
    float o = 1e3, fill = 0.0;
    for (int i = 0; i < 3; i++) {
      vec2 p = vUv - vec2(0.0, -0.58 + float(i) * 0.58);
      vec2 tip = vec2(0.0, 0.26), rt = vec2(0.32, -0.08), nt = vec2(0.0, 0.05), lf = vec2(-0.32, -0.08);
      o = min(o, min(min(sxSeg(p, tip, rt), sxSeg(p, rt, nt)), min(sxSeg(p, nt, lf), sxSeg(p, lf, tip))));
      fill = max(fill, max(sxTri(p, tip, rt, nt), sxTri(p, tip, nt, lf)) * (0.5 + 0.5 * sin(uTime * 8.0 - float(i) * 1.6)));
    }
    a = (1.0 - smoothstep(0.022, 0.04, o)) + fill * 0.22;
  } else {                     // splat: a glossy ink blot with tendrils, drying back in from its rim
    float n = sxFbm(vec2(ang * 2.0 + seed * 9.0, r * 3.0));
    float edge = (0.65 + 0.35 * n) * (1.0 - 0.35 * t * t) * (uAdd > 0.5 ? 1.0 : mix(0.25, 1.0, clamp(vCol.a, 0.0, 1.0)));
    float sd = edge - r, fw = max(fwidth(sd), 1e-3);
    a = smoothstep(-fw, fw, sd) * (uAdd > 0.5 ? 1.0 - smoothstep(0.75, 1.0, t) : 1.0);
    col = uAdd > 0.5 ? col * (0.8 + 0.3 * n) : sxPuddle(col, smoothstep(edge - 0.18, edge, r), (n - 0.5) * 0.3);
  }
  if (uAdd > 0.5 || (style != 0 && style != 6)) a *= vCol.a;   // liquid styles already eroded by their alpha
  if (a < 0.004) discard;
  gl_FragColor = uAdd > 0.5 ? vec4(col * a, a) : vec4(col, a);
  ${OUT}
}`;

// A retained instanced pool. Records: { a: Float32Array(16) attribute values, t, life, follow?(rec,dt)->bool }.
class ShapePool {
  constructor(THREE, name, geometry, cap, attrs, vert, frag, additive, uTime, extra = {}, light = {}) {
    this.cap = cap; this.recs = []; this.attrs = attrs;
    const g = new THREE.InstancedBufferGeometry();
    for (const key of Object.keys(geometry.attributes)) g.setAttribute(key, geometry.attributes[key]);
    if (geometry.index) g.setIndex(geometry.index);
    this.buf = attrs.map(name => { const b = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, b); return b; });
    g.instanceCount = 1;
    const m = new THREE.ShaderMaterial({ uniforms: { uTime, uAdd: { value: additive ? 1 : 0 }, ...light }, vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, side: extra.side ?? THREE.DoubleSide, blending: additive ? THREE.CustomBlending : THREE.NormalBlending });
    if (additive) { m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneFactor; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor; }
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = extra.order ?? (additive ? 8 : 5); this.mesh.name = 'special-vfx:' + name;
    geometry.dispose?.();
  }
  add(life, values, follow = null) {
    if (this.recs.length >= this.cap - 1) this.recs.shift();
    const rec = { v: new Float32Array(16), t: 0, life, follow, dead: false };
    rec.v.set(values);
    this.recs.push(rec);
    return rec;
  }
  update(dt) {
    for (let i = this.recs.length - 1; i >= 0; i--) {
      const r = this.recs[i]; r.t += dt;
      if (r.dead || (r.life > 0 && r.t >= r.life) || (r.follow && r.follow(r, dt) === false)) this.recs.splice(i, 1);
    }
    const n = this.recs.length;
    for (let k = 0; k < this.buf.length; k++) {
      const A = this.buf[k].array;
      A[0] = A[1] = A[2] = A[3] = 0;
      for (let j = 0; j < n; j++) { const v = this.recs[j].v; const o = (j + 1) * 4, s = k * 4; A[o] = v[s]; A[o + 1] = v[s + 1]; A[o + 2] = v[s + 2]; A[o + 3] = v[s + 3]; }
      this.buf[k].clearUpdateRanges(); this.buf[k].addUpdateRange(0, (n + 1) * 4); this.buf[k].needsUpdate = true;
    }
    // degenerate warm instance: alpha 0
    const col = this.buf[2].array; col[3] = 0;
    this.mesh.geometry.instanceCount = n + 1;
  }
  clear() { this.recs.length = 0; }
}

// ---------------------------------------------------------------------------------------------------------------
// The kit attached to one FX instance
// ---------------------------------------------------------------------------------------------------------------
export class SpecialVfxKit {
  constructor(THREE, parent, quality = 1, light = null) {
    this.THREE = THREE; this.q = Math.max(0.35, Math.min(1, quality));
    const L = this.light = light || inkLightUniforms(THREE, null);
    this.uTime = { value: 0 }; this.time = 0;
    this.root = new THREE.Group(); this.root.name = 'special-vfx'; parent.add(this.root);
    const q = this.q, uT = this.uTime;
    this.sparks = new SpritePool(THREE, Math.round(900 * q), true, uT);
    this.puffs = new SpritePool(THREE, Math.round(520 * q), false, uT, L);
    this.ribbons = new RibbonPool(THREE, 40, 48, false, uT, L);
    this.glowRibbons = new RibbonPool(THREE, 28, 40, true, uT, L);
    const cyl = (radial, h = 1, open = true) => { const g = new THREE.CylinderGeometry(1, 1, 1, radial, h, open); g.translate(0, 0.5, 0); return g; };
    const beamAttrs = ['iA', 'iB', 'iCol', 'iPar'];
    this.beams = new ShapePool(THREE, 'beams+', cyl(14, 1), 48, beamAttrs, BEAM_VERT, BEAM_FRAG, true, uT, {}, L);
    this.inkBeams = new ShapePool(THREE, 'beams', cyl(16, 8), 24, beamAttrs, BEAM_VERT, BEAM_FRAG, false, uT, {}, L);
    const shellAttrs = ['iPos', 'iScl', 'iCol', 'iPar'];
    this.shells = new ShapePool(THREE, 'shells+', new THREE.SphereGeometry(1, 36, 20), 40, shellAttrs, SHELL_VERT, SHELL_FRAG, true, uT, { side: THREE.FrontSide }, L);
    this.inkShells = new ShapePool(THREE, 'shells', new THREE.SphereGeometry(1, 36, 20), 24, shellAttrs, SHELL_VERT, SHELL_FRAG, false, uT, { side: THREE.DoubleSide }, L);
    const bandAttrs = ['iPos', 'iDim', 'iCol', 'iPar'];
    this.bands = new ShapePool(THREE, 'bands+', cyl(72, 4), 32, bandAttrs, BAND_VERT, BAND_FRAG, true, uT, {}, L);
    this.inkBands = new ShapePool(THREE, 'bands', cyl(64, 12), 16, bandAttrs, BAND_VERT, BAND_FRAG, false, uT, {}, L);
    const discAttrs = ['iPos', 'iNrm', 'iCol', 'iPar'];
    const quad = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]); return g; };
    this.discs = new ShapePool(THREE, 'discs+', quad(), 96, discAttrs, DISC_VERT, DISC_FRAG, true, uT, { order: 9 }, L);
    this.inkDiscs = new ShapePool(THREE, 'discs', quad(), 48, discAttrs, DISC_VERT, DISC_FRAG, false, uT, { order: 4 }, L);
    this.pools = [this.sparks, this.puffs, this.beams, this.inkBeams, this.shells, this.inkShells, this.bands, this.inkBands, this.discs, this.inkDiscs];
    for (const p of [...this.pools, this.ribbons, this.glowRibbons]) { this.root.add(p.mesh); excludeFromOverridePasses(p.mesh); }
  }
  update(dt, camera) {
    this.time += dt; this.uTime.value = this.time % 1000;
    for (const p of this.pools) p.update(dt);
    const cam = camera?.position || { x: 0, y: 10, z: 0 };
    this.ribbons.update(this.time, cam); this.glowRibbons.update(this.time, cam);
  }
  clear() { for (const p of [...this.pools, this.ribbons, this.glowRibbons]) p.clear(); }
  dispose() {
    this.root.removeFromParent();
    for (const p of [...this.pools, this.ribbons, this.glowRibbons]) { p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
  }
  stats() {
    return { sparks: this.sparks.n, puffs: this.puffs.n, ribbons: this.ribbons.list.length + this.glowRibbons.list.length,
      shapes: this.pools.slice(2).reduce((n, p) => n + p.recs.length, 0), draws: this.pools.length + 2 };
  }
}
