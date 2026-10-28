let IW_NORMAL_SCRATCH=new Float32Array(0);
// INKWAVE — squidkid LOD kit (used by character.js only).
//   • tier policy: hero / game / far picked by the kid's projected screen height, per quality setting, with hysteresis
//   • screen-door dither cross-fade: per-kid clones of the body materials that discard complementary pixel sets, so two
//     tiers overlap for ~0.3 s with every pixel drawn exactly once (no pop, no double-blend, no sorting)
//   • bone-aware clustering decimator: builds the 'far' tier from any skinned geometry the builders hand us, keeping
//     limbs / strands / fingers separate (clusters never straddle two dominant bones → no webbing when joints bend)
import * as THREE from 'three';

export const TIERS = ['hero', 'game', 'far'];
export const T_HERO = 0, T_GAME = 1, T_FAR = 2;
export const KID_H = 1.32;          // head-top height of the kid (m) for the screen-size estimate
export const FADE_S = 0.3;          // cross-fade duration (s)

// Screen height (CSS px) of the kid: above `hero` → hero tier in a match (`heroLocal` for the local player — the kid
// you look at all match), below `far` → far tier; `menu` = tier out of a match (showcase pedestal, locker, lobby line-up).
// Hysteresis ±12 %. (Default FOV: the local player stands ≈ 28 % of the viewport tall — 250 px at 900 — so from
// 720p up (≈ 200 px) it is hero at high; a kid across the plaza is ≈ 40–90 px.)
export const LOD_QUALITY = {
  low: { hero: Infinity, heroLocal: Infinity, far: 150, menu: T_GAME },
  medium: { hero: 760, heroLocal: 260, far: 110, menu: T_HERO },
  high: { hero: 430, heroLocal: 150, far: 78, menu: T_HERO },
  ultra: { hero: 300, heroLocal: 110, far: 54, menu: T_HERO },
};
export const HYST = 0.12;
/** Tier for a screen height `px` given the current tier `cur` (hysteresis), quality row `Q` and hero threshold `H`. */
export function pickTier(px, cur, Q, H = Q.hero) {
  const up = 1 + HYST, dn = 1 - HYST;
  let t = cur < 0 ? (px >= H ? T_HERO : px < Q.far ? T_FAR : T_GAME) : cur;
  if (t === T_HERO && px < H * dn) t = px < Q.far ? T_FAR : T_GAME;
  else if (t === T_GAME && px >= H * up) t = T_HERO;
  else if (t === T_GAME && px < Q.far * dn) t = T_FAR;
  else if (t === T_FAR && px >= Q.far * up) t = px >= H * up ? T_HERO : T_GAME;
  return t;
}

// ------------------------------------------------------------------------------------------------
// Dither cross-fade materials
// ------------------------------------------------------------------------------------------------
// uLodFade = (f, side): f ∈ (0,1] fade progress; side +1 = outgoing (keeps IGN ≥ f), −1 = incoming (keeps IGN < f).
// f = 0 disables the test. Interleaved-gradient noise: fine-grained and even at every f.
const DITHER_PARS = 'uniform vec2 uLodFade;\nfloat iwLodIGN(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }\n';
const DITHER_TEST = '\n  if (uLodFade.x > 0.0) { float iwLodN = iwLodIGN(floor(gl_FragCoord.xy)); if ((iwLodN < uLodFade.x) == (uLodFade.y > 0.0)) discard; }\n';
const MAIN_RE = /void\s+main\s*\(\s*\)\s*\{/;

/** A clone of `base` whose fragment shader dithers against `fadeU` ({ value: Vector2 }). Same program for every kid. */
export function ditherMaterial(base, fadeU) {
  const m = base.clone();
  const prev = base.onBeforeCompile;
  const key = (base.customProgramCacheKey ? base.customProgramCacheKey() : '') + '|iwLodZ';
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.uniforms.uLodFade = fadeU;
    if (MAIN_RE.test(sh.fragmentShader)) sh.fragmentShader = sh.fragmentShader.replace(MAIN_RE, (s) => DITHER_PARS + s + DITHER_TEST);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// ------------------------------------------------------------------------------------------------
// Far tier: bone-aware vertex clustering
// ------------------------------------------------------------------------------------------------
const _farCache = new WeakMap();
const _vtxSigCache = new WeakMap();
function getVertexSigs(src) {
  let sigs = _vtxSigCache.get(src);
  if (sigs) return sigs;
  const A = src.attributes, P = A.position, n = P.count;
  const SI = A.skinIndex, SW = A.skinWeight, EX = A.aEx, CL = A.aCloth, TI = A.aTint;
  const siArr = SI && !SI.normalized && !SI.isInterleavedBufferAttribute && SI.itemSize === 4 ? SI.array : null;
  const swArr = SW && !SW.normalized && !SW.isInterleavedBufferAttribute && SW.itemSize === 4 ? SW.array : null;
  const exArr = EX && !EX.normalized && !EX.isInterleavedBufferAttribute ? EX.array : null, exS = EX ? EX.itemSize : 0;
  const clArr = CL && !CL.normalized && !CL.isInterleavedBufferAttribute ? CL.array : null, clS = CL ? CL.itemSize : 0;
  const tiArr = TI && !TI.normalized && !TI.isInterleavedBufferAttribute ? TI.array : null, tiS = TI ? TI.itemSize : 0;
  sigs = new Int32Array(n);
  const dMap = new Map(), rareSigs = new Map();
  let nextRareSig = -1;
  for (let i = 0; i < n; i++) {
    let dom = 0;
    if (siArr && swArr) {
      const i4 = i * 4;
      let bw = swArr[i4]; dom = siArr[i4];
      if (swArr[i4 + 1] > bw) { bw = swArr[i4 + 1]; dom = siArr[i4 + 1]; }
      if (swArr[i4 + 2] > bw) { bw = swArr[i4 + 2]; dom = siArr[i4 + 2]; }
      if (swArr[i4 + 3] > bw) { bw = swArr[i4 + 3]; dom = siArr[i4 + 3]; }
    } else if (SI && SW) {
      let bw = -1; for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; dom = SI.getComponent(i, k); } }
    }
    // Preserve every original material/tint distinction. Packed integers are
    // collision-free only inside the common signed-byte attribute domain.
    const exV = EX ? Math.round(exArr ? exArr[i * exS] : EX.getX(i)) : 0;
    const clX = CL ? Math.round(clArr ? clArr[i * clS] : CL.getX(i)) : 0;
    const clY = CL ? Math.round(clArr ? clArr[i * clS + 1] : CL.getY(i)) : 0;
    const tiRaw = TI ? (tiArr ? tiArr[i * tiS] : TI.getX(i)) : 0;
    const tiV = tiRaw <= -1.5 ? Math.round(tiRaw) : 0;
    const fits = exV >= -128 && exV <= 127 && clX >= -128 && clX <= 127 && clY >= -128 && clY <= 127 && tiV >= -128 && tiV <= 127;
    const dKey = fits ? (((exV + 128) << 24) | ((clX + 128) << 16) | ((clY + 128) << 8) | (tiV + 128)) : String(exV) + ':' + clX + ':' + clY + ':' + tiV;
    let dId = dMap.get(dKey);
    if (dId === undefined) { dId = dMap.size; dMap.set(dKey, dId); }
    // 16 descriptor bits, not 8. Rare overflow signatures get negative IDs.
    if (dId < 65536 && Number.isInteger(dom) && dom >= 0 && dom < 16384) sigs[i] = (dom << 16) | dId;
    else {
      const rareKey = String(dom) + ':' + dId;
      let rare = rareSigs.get(rareKey);
      if (rare === undefined) { rare = nextRareSig--; rareSigs.set(rareKey, rare); }
      sigs[i] = rare;
    }
  }
  _vtxSigCache.set(src, sigs);
  return sigs;
}
let _htSize = 1 << 17, _htMask = _htSize - 1;
let _htStamp = null, _htK1 = null, _htK2 = null, _htVal = null; // allocate on first LOD use, not on page startup
let _htGen = 1, _scratchCap = 0, _vc, _rx, _ry, _rz, _sx, _sy, _sz, _cn;
const _lodTris = [], _lodCorners = [];
function ensureLodScratch(n, triangleCount) {
  // A full hash table otherwise loops forever. Grow only for exceptional meshes.
  const needed = Math.max(n, triangleCount);
  if (!_htStamp || needed >= _htSize) {
    while (_htSize <= needed) _htSize *= 2;
    _htMask = _htSize - 1;
    _htStamp = new Int32Array(_htSize); _htK1 = new Int32Array(_htSize); _htK2 = new Int32Array(_htSize); _htVal = new Int32Array(_htSize);
    _htGen = 1;
  }
  if (n <= _scratchCap) return;
  // Typical 35k-vertex actors keep their 64k capacity; small meshes no longer
  // reserve the same memory as a full actor. Very large meshes grow exactly.
  let cap = 1024;
  while (cap < n && cap < 65536) cap *= 2;
  _scratchCap = Math.max(n, cap);
  _vc = new Int32Array(_scratchCap); _rx = new Float32Array(_scratchCap); _ry = new Float32Array(_scratchCap); _rz = new Float32Array(_scratchCap);
  _sx = new Float64Array(_scratchCap); _sy = new Float64Array(_scratchCap); _sz = new Float64Array(_scratchCap); _cn = new Int32Array(_scratchCap);
}
function clusterTopology(src, cell, sigs) {
  const A = src.attributes, P = A.position, n = P.count, N = A.normal;
  const src3 = src.index ? src.index.array : null, nt = (src3 ? src3.length : n) / 3;
  ensureLodScratch(n, nt);
  const pArr = !P.normalized && !P.isInterleavedBufferAttribute && P.itemSize === 3 ? P.array : null;
  const nArr = N && !N.normalized && !N.isInterleavedBufferAttribute && N.itemSize === 3 ? N.array : null, inv = 1 / cell;
  const vc = _vc, rx = _rx, ry = _ry, rz = _rz, stamp = _htStamp, hk1 = _htK1, hk2 = _htK2, hval = _htVal;
  let overflow = null;
  if (_htGen > 0x7ffffff0) { stamp.fill(0); _htGen = 1; }
  let gen = ++_htGen, nc = 0;
  for (let i = 0; i < n; i++) {
    const i3 = i * 3, x = pArr ? pArr[i3] : P.getX(i), y = pArr ? pArr[i3 + 1] : P.getY(i), z = pArr ? pArr[i3 + 2] : P.getZ(i);
    const nx = N ? (nArr ? nArr[i3] : N.getX(i)) : 0, ny = N ? (nArr ? nArr[i3 + 1] : N.getY(i)) : 0, nz = N ? (nArr ? nArr[i3 + 2] : N.getZ(i)) : 0;
    const fx = Math.floor(x * inv), fy = Math.floor(y * inv), fz = Math.floor(z * inv);
    // Avoid 10-bit wraparound merging distant surfaces. Overflow uses a rare
    // string-key path while ordinary meshes retain the allocation-free hash.
    if (fx < -512 || fx >= 512 || fy < -512 || fy >= 512 || fz < -512 || fz >= 512) {
      if (!overflow) overflow = new Map();
      const key = String(fx) + ',' + fy + ',' + fz + ',' + sigs[i];
      let c = overflow.get(key);
      if (c === undefined) { c = nc++; overflow.set(key, c); rx[c] = nx; ry[c] = ny; rz[c] = nz; }
      else if (N && nx * rx[c] + ny * ry[c] + nz * rz[c] < -0.09) {
        const back = key + '#'; let other = overflow.get(back);
        if (other === undefined) { other = nc++; overflow.set(back, other); rx[other] = nx; ry[other] = ny; rz[other] = nz; }
        c = other;
      }
      vc[i] = c;
      continue;
    }
    const k1 = ((fx + 512) << 20) | ((fy + 512) << 10) | (fz + 512), k2 = sigs[i] << 1;
    let h = (Math.imul(k1 ^ Math.imul(k2, 0x9e3779b1), 0x85ebca6b) >>> 0) & _htMask, c = -1;
    while (stamp[h] === gen) { if (hk1[h] === k1 && hk2[h] === k2) { c = hval[h]; break; } h = (h + 1) & _htMask; }
    if (c === -1) {
      c = nc++; stamp[h] = gen; hk1[h] = k1; hk2[h] = k2; hval[h] = c;
      rx[c] = nx; ry[c] = ny; rz[c] = nz;
    } else if (N && nx * rx[c] + ny * ry[c] + nz * rz[c] < -0.09) {
      const k2b = k2 | 1;
      let h2 = (Math.imul(k1 ^ Math.imul(k2b, 0x9e3779b1), 0x85ebca6b) >>> 0) & _htMask, c2 = -1;
      while (stamp[h2] === gen) { if (hk1[h2] === k1 && hk2[h2] === k2b) { c2 = hval[h2]; break; } h2 = (h2 + 1) & _htMask; }
      if (c2 === -1) {
        c2 = nc++; stamp[h2] = gen; hk1[h2] = k1; hk2[h2] = k2b; hval[h2] = c2;
        rx[c2] = nx; ry[c2] = ny; rz[c2] = nz;
      }
      c = c2;
    }
    vc[i] = c;
  }
  gen = ++_htGen;
  const tris = _lodTris, sourceCorners = _lodCorners, wantCorners = !!(A.aMat && A.color);
  tris.length = 0; sourceCorners.length = 0;
  const wideTris = nc > 65535 ? new Set() : null;
  for (let t = 0; t < nt; t++) {
    const t3 = t * 3, i0 = src3 ? src3[t3] : t3, i1 = src3 ? src3[t3 + 1] : t3 + 1, i2 = src3 ? src3[t3 + 2] : t3 + 2;
    const a = vc[i0], b = vc[i1], c = vc[i2];
    if (a === b || b === c || a === c) continue;
    let u, v, w;
    if (a <= b && a <= c) { u = a; v = b; w = c; }
    else if (b <= a && b <= c) { u = b; v = c; w = a; }
    else { u = c; v = a; w = b; }
    if (wideTris) {
      const key = String(u) + ',' + v + ',' + w;
      if (wideTris.has(key)) continue;
      wideTris.add(key);
    } else {
      const tk1 = (u << 16) | v, tk2 = w;
      let h = (Math.imul(tk1 ^ Math.imul(tk2, 0x9e3779b1), 0x85ebca6b) >>> 0) & _htMask, dup = false;
      while (stamp[h] === gen) { if (hk1[h] === tk1 && hk2[h] === tk2) { dup = true; break; } h = (h + 1) & _htMask; }
      if (dup) continue;
      stamp[h] = gen; hk1[h] = tk1; hk2[h] = tk2;
    }
    tris.push(a, b, c);
    if (wantCorners) sourceCorners.push(i0, i1, i2);
  }
  return { nc, tris, sourceCorners };
}

/**
 * Decimate an (indexed or not) skinned geometry by vertex clustering. Cluster key = grid cell + dominant bone + discrete
 * material ids (aEx, aCloth.xy, aTint gear class), so clothing material borders survive; opposite-facing members split off (thin
 * shells keep both faces). Each cluster keeps its most central vertex (attributes incl. skin
 * weights copied from it — the surface never shrinks) with the members' averaged normal.
 */
export function clusterDecimate(src, cell, precomputed = null) {
  const A = src.attributes, P = A.position, n = P.count, N = A.normal;
  const top = precomputed || clusterTopology(src, cell, getVertexSigs(src));
  const { nc, tris, sourceCorners } = top;
  const pArr = !P.normalized && !P.isInterleavedBufferAttribute && P.itemSize === 3 ? P.array : null;
  const nArr = N && !N.normalized && !N.isInterleavedBufferAttribute && N.itemSize === 3 ? N.array : null;
  const vc = _vc, sx = _sx, sy = _sy, sz = _sz, cn = _cn;
  for (let c = 0; c < nc; c++) { sx[c] = 0; sy[c] = 0; sz[c] = 0; cn[c] = 0; }
  for (let i = 0; i < n; i++) {
    const c = vc[i], i3 = i * 3;
    sx[c] += pArr ? pArr[i3] : P.getX(i); sy[c] += pArr ? pArr[i3 + 1] : P.getY(i); sz[c] += pArr ? pArr[i3 + 2] : P.getZ(i); cn[c]++;
  }
  for (let c = 0; c < nc; c++) { const k = 1 / cn[c]; sx[c] *= k; sy[c] *= k; sz[c] *= k; }
  const rep = new Int32Array(nc).fill(-1), rd = new Float64Array(nc).fill(Infinity);
  for (let i = 0; i < n; i++) {
    const c = vc[i], i3 = i * 3;
    const dx = (pArr ? pArr[i3] : P.getX(i)) - sx[c], dy = (pArr ? pArr[i3 + 1] : P.getY(i)) - sy[c], dz = (pArr ? pArr[i3 + 2] : P.getZ(i)) - sz[c], d = dx * dx + dy * dy + dz * dz;
    if (d < rd[c]) { rd[c] = d; rep[c] = i; }
  }
  const out = new THREE.BufferGeometry();
  for (const name in A) {
    const a = A[name], s = a.itemSize, srcArr = !a.normalized && !a.isInterleavedBufferAttribute ? a.array : null;
    const arr = new a.array.constructor(nc * s);
    if (srcArr) {
      for (let c = 0; c < nc; c++) { const r = rep[c] * s, cs = c * s; for (let k = 0; k < s; k++) arr[cs + k] = srcArr[r + k]; }
    } else {
      for (let c = 0; c < nc; c++) { const r = rep[c]; for (let k = 0; k < s; k++) arr[c * s + k] = a.getComponent(r, k); }
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, s, a.normalized));
  }
  if (N) {
    // Dense normal attributes have no callbacks, so this scratch cannot be
    // reentered while borrowed. Keep unusual accessor attributes independent.
    const reusable=!!nArr&&nc*3<=262144;
    if(reusable&&IW_NORMAL_SCRATCH.length<nc*3)IW_NORMAL_SCRATCH=new Float32Array(nc*3);
    const acc=reusable?IW_NORMAL_SCRATCH:new Float32Array(nc*3);
    if(reusable)acc.fill(0,0,nc*3);
    for (let i = 0; i < n; i++) { const c = vc[i] * 3, i3 = i * 3; acc[c] += nArr ? nArr[i3] : N.getX(i); acc[c + 1] += nArr ? nArr[i3 + 1] : N.getY(i); acc[c + 2] += nArr ? nArr[i3 + 2] : N.getZ(i); }
    const onArr = out.attributes.normal.array;
    for (let c = 0; c < nc; c++) {
      const c3 = c * 3, x = acc[c3], y = acc[c3 + 1], z = acc[c3 + 2], l = Math.hypot(x, y, z);
      if (l > 0.3 * cn[c]) { onArr[c3] = x / l; onArr[c3 + 1] = y / l; onArr[c3 + 2] = z / l; }
    }
  }
  let finalIndices = tris, finalCount = nc;
  // Keep the established spatial decimation and triangle budget, but do not let a
  // neighbouring metal/print representative repaint the surviving weapon surface.
  // Split only attribute conflicts at surviving corners. Positions/normals remain
  // the existing cluster result; nonweapon geometries take the original path.
  if (A.aMat && A.color) {
    const attributes = out.attributes, extras = [], splits = new Map(), remapped = [];
    const sourceMat = A.aMat, sourceColor = A.color, clusterMat = attributes.aMat, clusterColor = attributes.color;
    const sm=!sourceMat.normalized&&!sourceMat.isInterleavedBufferAttribute?sourceMat.array:null;
    const sc=!sourceColor.normalized&&!sourceColor.isInterleavedBufferAttribute?sourceColor.array:null;
    const cm=!clusterMat.normalized&&!clusterMat.isInterleavedBufferAttribute?clusterMat.array:null;
    const cc=!clusterColor.normalized&&!clusterColor.isInterleavedBufferAttribute?clusterColor.array:null;
    for (let i = 0; i < tris.length; i++) {
      const cluster = tris[i], original = sourceCorners[i];
      let same = true;
      for (let k = 0; k < sourceMat.itemSize; k++) if ((sm?sm[original*sourceMat.itemSize+k]:sourceMat.getComponent(original,k)) !== (cm?cm[cluster*clusterMat.itemSize+k]:clusterMat.getComponent(cluster,k))) { same = false; break; }
      if (same) for (let k = 0; k < sourceColor.itemSize; k++) if ((sc?sc[original*sourceColor.itemSize+k]:sourceColor.getComponent(original,k)) !== (cc?cc[cluster*clusterColor.itemSize+k]:clusterColor.getComponent(cluster,k))) { same = false; break; }
      if (same) { remapped.push(cluster); continue; }
      const values = [cluster];
      for (let k = 0; k < sourceMat.itemSize; k++) values.push(sourceMat.getComponent(original, k));
      for (let k = 0; k < sourceColor.itemSize; k++) values.push(sourceColor.getComponent(original, k));
      const key = values.join(':');
      let index = splits.get(key);
      if (index === undefined) { index = nc + extras.length; splits.set(key, index); extras.push({ cluster, original }); }
      remapped.push(index);
    }
    if (extras.length) {
      for (const name in attributes) {
        const old = attributes[name], size = old.itemSize, arr = new old.array.constructor((nc + extras.length) * size);
        arr.set(old.array);
        for (let i = 0; i < extras.length; i++) {
          const e = extras[i], authored = name === 'color' || name === 'aMat', from = authored ? A[name] : old, index = authored ? e.original : e.cluster;
          for (let k = 0; k < size; k++) arr[(nc + i) * size + k] = from.array[index * size + k];
        }
        out.setAttribute(name, new THREE.BufferAttribute(arr, size, old.normalized));
      }
      finalIndices = remapped; finalCount = nc + extras.length;
    }
  }
  out.setIndex(finalCount > 65535 ? new THREE.Uint32BufferAttribute(finalIndices, 1) : new THREE.Uint16BufferAttribute(finalIndices, 1));
  out.userData = { ...src.userData, iwLod: 'far', cell };
  out.computeBoundingSphere();
  return out;
}

const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

/** Far-tier version of `geo`, decimated to ≲ `target` triangles (cached per source geometry). */
export function farGeometry(geo, target) {
  if (!geo || !geo.attributes || !geo.attributes.position) return geo;
  let c = _farCache.get(geo);
  if (c) return c;
  if (triCount(geo) <= target) { _farCache.set(geo, geo); return geo; }
  // cell size from the surface density, then one correction step (triangle count ∝ 1 / cell²)
  const sigs = getVertexSigs(geo);
  let cell = 0.018;
  let top = clusterTopology(geo, cell, sigs);
  for (let it = 0; it < 3 && (top.tris.length / 3) > target * 1.12; it++) {
    cell *= Math.sqrt((top.tris.length / 3) / target) * 1.02;
    top = clusterTopology(geo, cell, sigs);
  }
  const g = clusterDecimate(geo, cell, top);
  _farCache.set(geo, g);
  return g;
}
export { triCount };
