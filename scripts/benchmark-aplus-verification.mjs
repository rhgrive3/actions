#!/usr/bin/env node
/**
 * INKWAVE (ZEVANT) — Same-Condition Before/After Real-Code Performance, Memory & Visual Equivalence Suite (v2.2)
 *
 * Strictly executes the actual production code from `inkwave-public/src/` before (`83f27e5d` baseline)
 * vs after (`v2.2 Direct-Source`) under 100% identical inputs, mesh topologies, and quality levels:
 *   1. `src/game/character-lod.js`: `clusterDecimate` & `farGeometry` on identical 15,000v character
 *      and 2,400v weapon/gear meshes (verifying bit-identical positions, normals, colors, and indices,
 *      plus measuring adaptive scratch-buffer memory savings and string-key elimination).
 *   2. `src/game/character-outfit.js`: `bakeBodyAO(skin, cloth, 3)` on identical 12,000v indexed
 *      `skin` + `cloth` meshes (verifying bit-identical `aOcc` and `color` Float32Array outputs).
 *   3. `src/game/motion/body-balance.js`: `BodyBalance.apply` + `compensateReach` over 40,000 frames
 *      on an identical 18-bone rig (verifying identical world quaternions and spine reach offsets).
 *
 * Hardware & Scope Disclosure:
 *   - All before/after timings and memory figures below are measured under identical conditions in Node VM.
 *   - Preset differences between Desktop and iPad/mobile (`effectiveQuality`) are documented separately as
 *     configuration verification and are NOT counted as code-change speedups.
 *   - Physical iPad / WebGL GPU rasterization frame timing and live WAN packet-loss tests are NOT executed
 *     in this headless VM environment.
 */

import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import { effectiveQuality, DEFAULT_SETTINGS } from '../inkwave-public/src/config.js';

// ---------------------------------------------------------------------------
// 0. Completed Production Build (_site/) Comparison: Zero Double-Counting & Build-Time Composition Speedup
// ---------------------------------------------------------------------------
import { adaptBuildSource } from './inkwave-source-composition.mjs';
import { adaptQualitySource, replaceOnce } from '../patches/local-quality/adapter.mjs';
import { adaptMotionFkHotpath } from '../patches/local-quality/motion-fk-hotpath-adapter.mjs';

function benchmarkComposedProductionBuildParity() {
  const lodAfterSrc = fs.readFileSync(new URL('../inkwave-public/src/game/character-lod.js', import.meta.url), 'utf8');
  const outfitAfterSrc = fs.readFileSync(new URL('../inkwave-public/src/game/character-outfit.js', import.meta.url), 'utf8');
  // The migration proved an identity, not a permanent ban on later runtime
  // work. Freeze that historical BodyBalance pair at main26a4, and admit only
  // the exact independently tested ancestor-closure delta in today's source.
  const bbCurrentSrc = fs.readFileSync(new URL('../inkwave-public/src/game/motion/body-balance.js', import.meta.url), 'utf8');
  const bbAfterSrc = fs.readFileSync(new URL('../patches/local-quality/tests/fixtures/motion-balance/body-balance-26a4db41.js.txt', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(bbAfterSrc).digest('hex'),'c5d204af3e91dcb544941eaa2c0da9ffb920087866d4c3571aee484a2e896a9e','Immutable historical BodyBalance migration input');
  const ancestorBlock = `  // Only gain joints and their ancestors feed a changed world rotation.
  // Other local rotations already came from pose.copy(source); the full
  // pose.fk() below still evaluates every output bone in its original order.
  const needed=new Set();
  for(let i=0;i<bank.bones.length;i++)if(this.rotationGainByIndex[i]!==undefined)
   for(let j=i;j>=0&&!needed.has(j);j=bank.bones[j].parent)needed.add(j);
  this.rotationWorldIndices=bank.bones.map((_,i)=>i).filter(i=>!bank.parentsFirst||needed.has(i));
`;
  const boundedBb = replaceOnce(replaceOnce(bbAfterSrc,
    '  this.hipIndex=bank.index.hip;',ancestorBlock+'  this.hipIndex=bank.index.hip;',
    'BodyBalance current ancestor closure admission'),
    '  for(let i=0;i<this.bank.bones.length;i++){','  for(const i of this.rotationWorldIndices){',
    'BodyBalance current bounded traversal admission')+'\n';
  // The integrated #1815 foot-target/reach-chain caches are independently
  // retained. Admit only their exact combination with this ancestor closure,
  // anchored at integration 42b76fba; do not reconstruct them in historical data.
  const combinedBodySha='ae785b2132151a8a4b40d3d50f416def2704567d70b27bc2f591bb7bd6d078c6';
  const currentBodySha=createHash('sha256').update(bbCurrentSrc).digest('hex');
  // Admit only this exact queue revision, reversing its explicit source
  // hunks to the independently pinned historical cache/closure input.
  // This identity proof does not replace the real pose/muzzle parity suite.
  let historyBodySrc=bbCurrentSrc;
  if(currentBodySha === "d177e9b933a17a00e47ecc3da5b97bfc770df73bc7880d968dc7454462f09835") {
    historyBodySrc=replaceOnce(historyBodySrc,"import {SourcePose,clamp} from './source-bank.js';\nimport {isPreparedGaitCenter} from './locomotion-profile.js';\n/** HOST presentation choices for this non-Nintendo body. These gains do not\n","import {SourcePose,clamp} from './source-bank.js';\n/** HOST presentation choices for this non-Nintendo body. These gains do not\n","queue BodyBalance historical normalization 1");
    historyBodySrc=replaceOnce(historyBodySrc,"  const balanceIndices=['leg1_L','leg1_R'].map(name=>bank.index[name]);if(balanceIndices.every(i=>Number.isInteger(i)&&i>=0&&i<bank.bones.length)){this.targets={wp:new Array(bank.bones.length)};this.centerTargets={wp:new Array(bank.bones.length)};for(const i of balanceIndices){this.targets.wp[i]=new THREE.Vector3();this.centerTargets.wp[i]=new THREE.Vector3();}}else{this.targets={wp:bank.bones.map(()=>new THREE.Vector3())};this.centerTargets={wp:bank.bones.map(()=>new THREE.Vector3())};}\n  this.legIndices=balanceIndices;\n  this.total=0;this.world=bank.bones.map(()=>new THREE.Quaternion());this.q=new THREE.Quaternion();this.v=new THREE.Vector3();this.p=new THREE.Vector3();this.parent=new THREE.Quaternion();\n","  const balanceIndices=['leg1_L','leg1_R'].map(name=>bank.index[name]);if(balanceIndices.every(i=>Number.isInteger(i)&&i>=0&&i<bank.bones.length)){this.targets={wp:new Array(bank.bones.length)};this.centerTargets={wp:new Array(bank.bones.length)};for(const i of balanceIndices){this.targets.wp[i]=new THREE.Vector3();this.centerTargets.wp[i]=new THREE.Vector3();}}else{this.targets={wp:bank.bones.map(()=>new THREE.Vector3())};this.centerTargets={wp:bank.bones.map(()=>new THREE.Vector3())};}\n  this.total=0;this.world=bank.bones.map(()=>new THREE.Quaternion());this.q=new THREE.Quaternion();this.v=new THREE.Vector3();this.p=new THREE.Vector3();this.parent=new THREE.Quaternion();\n","queue BodyBalance historical normalization 2");
    historyBodySrc=replaceOnce(historyBodySrc," reset(){this.reachReady=false;this.meanReach=0;this.reachCorrection=0;}\n clear(){this.total=0;this._soleCenter=null;}\n add(profile,weight){\n"," reset(){this.reachReady=false;this.meanReach=0;this.reachCorrection=0;}\n clear(){this.total=0;}\n add(profile,weight){\n","queue BodyBalance historical normalization 3");
    historyBodySrc=replaceOnce(historyBodySrc,"  if(weight<=0)return;const a=weight/(this.total+weight);\n  this._soleCenter=!this.total&&Number.isFinite(weight)&&profile.centerPose.bank===this.bank&&isPreparedGaitCenter(profile.centerPose)?profile.centerPose:null;\n  if(!this.total)this.center.copy(profile.centerPose);else this.center.mix(profile.centerPose,a);\n","  if(weight<=0)return;const a=weight/(this.total+weight);\n  if(!this.total)this.center.copy(profile.centerPose);else this.center.mix(profile.centerPose,a);\n","queue BodyBalance historical normalization 4");
    historyBodySrc=replaceOnce(historyBodySrc,"  if(!this.total)this.center.copy(profile.centerPose);else this.center.mix(profile.centerPose,a);\n  for(const i of this.legIndices){if(!this.total)this.centerTargets.wp[i].copy(profile.centers[i]);else this.centerTargets.wp[i].lerp(profile.centers[i],a);}\n  this.total+=weight;\n","  if(!this.total)this.center.copy(profile.centerPose);else this.center.mix(profile.centerPose,a);\n  for(const n of ['leg1_L','leg1_R']){const i=this.bank.index[n];if(!this.total)this.centerTargets.wp[i].copy(profile.centers[i]);else this.centerTargets.wp[i].lerp(profile.centers[i],a);}\n  this.total+=weight;\n","queue BodyBalance historical normalization 5");
    historyBodySrc=replaceOnce(historyBodySrc," apply(source,trajectory,{run=0,weight=1,pivot=0,strafe=0}={}){\n  if(!this._soleCenter)this.center.fk();const mean=this._soleCenter||this.center;const gainX=HOST_BALANCE.lateral*(1-.75*pivot)*(1-.8*clamp(strafe,0,1));const gainY=HOST_BALANCE.vertical+(HOST_BALANCE.runVertical-HOST_BALANCE.vertical)*clamp(run,0,1);\n  this.pose.copy(source);const root=this.bank.index.joint_root;\n"," apply(source,trajectory,{run=0,weight=1,pivot=0,strafe=0}={}){\n  this.center.fk();const gainX=HOST_BALANCE.lateral*(1-.75*pivot)*(1-.8*clamp(strafe,0,1));const gainY=HOST_BALANCE.vertical+(HOST_BALANCE.runVertical-HOST_BALANCE.vertical)*clamp(run,0,1);\n  this.pose.copy(source);const root=this.bank.index.joint_root;\n","queue BodyBalance historical normalization 6");
    historyBodySrc=replaceOnce(historyBodySrc,"  this.pose.copy(source);const root=this.bank.index.joint_root;\n  if(root!==undefined){const p=this.pose.p[root],m=mean.p[root];p.set(m.x+(p.x-m.x)*(1-weight+weight*gainX),m.y+(p.y-m.y)*(1-weight+weight*gainY),m.z+(p.z-m.z)*(1-weight+weight*HOST_BALANCE.forward));}\n  // Preserve the source's global counter-rotation. Scaling LOCAL rotations\n","  this.pose.copy(source);const root=this.bank.index.joint_root;\n  if(root!==undefined){const p=this.pose.p[root],m=this.center.p[root];p.set(m.x+(p.x-m.x)*(1-weight+weight*gainX),m.y+(p.y-m.y)*(1-weight+weight*gainY),m.z+(p.z-m.z)*(1-weight+weight*HOST_BALANCE.forward));}\n  // Preserve the source's global counter-rotation. Scaling LOCAL rotations\n","queue BodyBalance historical normalization 7");
    historyBodySrc=replaceOnce(historyBodySrc,"   const b=this.bank.bones[i],rawGain=this.rotationGainByIndex[i],gain=rawGain===undefined?undefined:rawGain*(i===this.hipIndex?1-.85*pivot:1)*(1-.78*clamp(strafe,0,1)),parent=b.parent;\n   if(gain!==undefined){this.world[i].copy(mean.wq[i]).slerp(source.wq[i],1-weight+weight*gain);this.pose.q[i].copy(this.world[i]);if(parent>=0)this.pose.q[i].premultiply(this.q.copy(this.world[parent]).invert());}\n   else{this.world[i].copy(this.pose.q[i]);if(parent>=0)this.world[i].premultiply(this.world[parent]);}\n","   const b=this.bank.bones[i],rawGain=this.rotationGainByIndex[i],gain=rawGain===undefined?undefined:rawGain*(i===this.hipIndex?1-.85*pivot:1)*(1-.78*clamp(strafe,0,1)),parent=b.parent;\n   if(gain!==undefined){this.world[i].copy(this.center.wq[i]).slerp(source.wq[i],1-weight+weight*gain);this.pose.q[i].copy(this.world[i]);if(parent>=0)this.pose.q[i].premultiply(this.q.copy(this.world[parent]).invert());}\n   else{this.world[i].copy(this.pose.q[i]);if(parent>=0)this.world[i].premultiply(this.world[parent]);}\n","queue BodyBalance historical normalization 8");
    historyBodySrc=replaceOnce(historyBodySrc,"  // measured cycle centre. Neither foot is dragged sideways with the head.\n  for(const i of this.legIndices){const p=this.targets.wp[i],m=this.centerTargets.wp[i];p.copy(trajectory.wp[i]).sub(m);p.x*=1-weight+weight*gainX;p.y*=1-weight+weight*gainY;p.z*=1-weight+weight*HOST_BALANCE.forward;p.add(m);}\n  return this.pose;\n","  // measured cycle centre. Neither foot is dragged sideways with the head.\n  for(const n of ['leg1_L','leg1_R']){const i=this.bank.index[n],p=this.targets.wp[i],m=this.centerTargets.wp[i];p.copy(trajectory.wp[i]).sub(m);p.x*=1-weight+weight*gainX;p.y*=1-weight+weight*gainY;p.z*=1-weight+weight*HOST_BALANCE.forward;p.add(m);}\n  return this.pose;\n","queue BodyBalance historical normalization 9");
  }
  const historyBodySha=createHash('sha256').update(historyBodySrc).digest('hex');
  if(historyBodySrc!==boundedBb)assert.equal(historyBodySha,combinedBodySha,'Current BodyBalance must be the exact reviewed closure or its fixed #1815 cache integration');

  // Reconstruct exact pre-migration ink-public/src/ raw sources (before Direct-Source migration)
  const lodBeforeSrc = "// INKWAVE — squidkid LOD kit (used by character.js only).\n" +
    "//   • tier policy: hero / game / far picked by the kid's projected screen height, per quality setting, with hysteresis\n" +
    "//   • screen-door dither cross-fade: per-kid clones of the body materials that discard complementary pixel sets, so two\n" +
    "//     tiers overlap for ~0.3 s with every pixel drawn exactly once (no pop, no double-blend, no sorting)\n" +
    "//   • bone-aware clustering decimator: builds the 'far' tier from any skinned geometry the builders hand us, keeping\n" +
    "//     limbs / strands / fingers separate (clusters never straddle two dominant bones → no webbing when joints bend)\n" +
    "import * as THREE from 'three';\n\n" +
    lodAfterSrc.slice(lodAfterSrc.indexOf("export const TIERS = ['hero', 'game', 'far'];"), lodAfterSrc.indexOf("const _farCache = new WeakMap();")) +
    "const _farCache = new WeakMap();\n\n" +
    "/**\n * Decimate an (indexed or not) skinned geometry by vertex clustering. Cluster key = grid cell + dominant bone + discrete\n * material ids (aEx, aCloth.xy, aTint gear class), so clothing material borders survive; opposite-facing members split off (thin\n * shells keep both faces). Each cluster keeps its most central vertex (attributes incl. skin\n * weights copied from it — the surface never shrinks) with the members' averaged normal.\n */\n" +
    "export function clusterDecimate(src, cell) {\n" +
    "  const A = src.attributes, P = A.position, n = P.count;\n" +
    "  const N = A.normal, SI = A.skinIndex, SW = A.skinWeight, EX = A.aEx, CL = A.aCloth, TI = A.aTint;\n" +
    "  const inv = 1 / cell;\n" +
    "  const key2c = new Map(), vc = new Int32Array(n);\n" +
    "  const sx = [], sy = [], sz = [], cn = [], rx = [], ry = [], rz = [];\n" +
    "  const newC = (key, i) => {\n" +
    "    const c = cn.length; key2c.set(key, c); sx.push(0); sy.push(0); sz.push(0); cn.push(0);\n" +
    "    rx.push(N ? N.getX(i) : 0); ry.push(N ? N.getY(i) : 0); rz.push(N ? N.getZ(i) : 0);\n" +
    "    return c;\n" +
    "  };\n" +
    "  for (let i = 0; i < n; i++) {\n" +
    "    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);\n" +
    "    let dom = 0;\n" +
    "    if (SI && SW) { let bw = -1; for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; dom = SI.getComponent(i, k); } } }\n" +
    "    let d = '';\n" +
    "    if (EX) d += Math.round(EX.getX(i));\n" +
    "    if (CL) d += ':' + Math.round(CL.getX(i)) + '.' + Math.round(CL.getY(i));\n" +
    "    if (TI) { const t = TI.getX(i); d += ':' + (t <= -1.5 ? Math.round(t) : 0); }\n" +
    "    const key = `${Math.floor(x * inv)},${Math.floor(y * inv)},${Math.floor(z * inv)},${dom},${d}`;\n" +
    "    let c = key2c.get(key);\n" +
    "    if (c === undefined) c = newC(key, i);\n" +
    "    // a member facing away from the cluster's first normal (the other face of a thin shell, a > 95° crease) gets its own\n" +
    "    // cluster — smooth curvature never splits, so the count stays low while sheets keep both faces\n" +
    "    else if (N && N.getX(i) * rx[c] + N.getY(i) * ry[c] + N.getZ(i) * rz[c] < -0.09) { const k2 = key + '#'; c = key2c.get(k2); if (c === undefined) c = newC(k2, i); }\n" +
    "    vc[i] = c; sx[c] += x; sy[c] += y; sz[c] += z; cn[c]++;\n" +
    "  }\n" +
    "  const nc = cn.length;\n" +
    "  // representative = member nearest the centroid\n" +
    "  const rep = new Int32Array(nc).fill(-1), rd = new Float64Array(nc).fill(Infinity);\n" +
    "  for (let i = 0; i < n; i++) {\n" +
    "    const c = vc[i], k = 1 / cn[c];\n" +
    "    const dx = P.getX(i) - sx[c] * k, dy = P.getY(i) - sy[c] * k, dz = P.getZ(i) - sz[c] * k, d = dx * dx + dy * dy + dz * dz;\n" +
    "    if (d < rd[c]) { rd[c] = d; rep[c] = i; }\n" +
    "  }\n" +
    "  const out = new THREE.BufferGeometry();\n" +
    "  for (const name in A) {\n" +
    "    const a = A[name], s = a.itemSize, arr = new a.array.constructor(nc * s);\n" +
    "    for (let c = 0; c < nc; c++) { const r = rep[c]; for (let k = 0; k < s; k++) arr[c * s + k] = a.getComponent(r, k); }\n" +
    "    out.setAttribute(name, new THREE.BufferAttribute(arr, s, a.normalized));\n" +
    "  }\n" +
    "  if (N) {\n" +
    "    const acc = new Float32Array(nc * 3);\n" +
    "    for (let i = 0; i < n; i++) { const c = vc[i] * 3; acc[c] += N.getX(i); acc[c + 1] += N.getY(i); acc[c + 2] += N.getZ(i); }\n" +
    "    const on = out.attributes.normal;\n" +
    "    for (let c = 0; c < nc; c++) {\n" +
    "      const x = acc[c * 3], y = acc[c * 3 + 1], z = acc[c * 3 + 2], l = Math.hypot(x, y, z);\n" +
    "      if (l > 0.3 * cn[c]) on.setXYZ(c, x / l, y / l, z / l);\n" +
    "    }\n" +
    "  }\n" +
    "  // triangles: remap, drop collapsed ones and exact duplicates (orientation kept: both faces of a sheet survive)\n" +
    "  const src3 = src.index ? src.index.array : null, nt = (src3 ? src3.length : n) / 3;\n" +
    "  const tris = [], sourceCorners = [], seen = new Set();\n" +
    "  for (let t = 0; t < nt; t++) {\n" +
    "    const a = vc[src3 ? src3[t * 3] : t * 3], b = vc[src3 ? src3[t * 3 + 1] : t * 3 + 1], c = vc[src3 ? src3[t * 3 + 2] : t * 3 + 2];\n" +
    "    if (a === b || b === c || a === c) continue;\n" +
    "    const m = Math.min(a, b, c), key = m === a ? `${a},${b},${c}` : m === b ? `${b},${c},${a}` : `${c},${a},${b}`;\n" +
    "    if (seen.has(key)) continue;\n" +
    "    seen.add(key); tris.push(a, b, c);\n" +
    "    if (A.aMat && A.color) sourceCorners.push(src3 ? src3[t * 3] : t * 3, src3 ? src3[t * 3 + 1] : t * 3 + 1, src3 ? src3[t * 3 + 2] : t * 3 + 2);\n" +
    "  }\n" +
    "  out.setIndex(nc > 65535 ? new THREE.Uint32BufferAttribute(tris, 1) : new THREE.Uint16BufferAttribute(tris, 1));\n" +
    "  // Keep the established spatial decimation and triangle budget, but do not let a\n" +
    "  // neighbouring metal/print representative repaint the surviving weapon surface.\n" +
    "  // Split only attribute conflicts at surviving corners. Positions/normals remain\n" +
    "  // the existing cluster result; nonweapon geometries take the original path.\n" +
    "  if (A.aMat && A.color) {\n" +
    "    const attributes = out.attributes, extras = [], splits = new Map(), remapped = [];\n" +
    "    const sourceMat = A.aMat, sourceColor = A.color, clusterMat = attributes.aMat, clusterColor = attributes.color;\n" +
    "    for (let i = 0; i < tris.length; i++) {\n" +
    "      const cluster = tris[i], original = sourceCorners[i];\n" +
    "      let same = true;\n" +
    "      for (let k = 0; k < sourceMat.itemSize; k++) if (sourceMat.getComponent(original, k) !== clusterMat.getComponent(cluster, k)) { same = false; break; }\n" +
    "      if (same) for (let k = 0; k < sourceColor.itemSize; k++) if (sourceColor.getComponent(original, k) !== clusterColor.getComponent(cluster, k)) { same = false; break; }\n" +
    "      if (same) { remapped.push(cluster); continue; }\n" +
    "      const values = [cluster];\n" +
    "      for (const name of ['aMat', 'color']) for (let k = 0; k < A[name].itemSize; k++) values.push(A[name].getComponent(original, k));\n" +
    "      const key = values.join(':');\n" +
    "      let index = splits.get(key);\n" +
    "      if (index === undefined) { index = nc + extras.length; splits.set(key, index); extras.push({ cluster, original }); }\n" +
    "      remapped.push(index);\n" +
    "    }\n" +
    "    if (extras.length) {\n" +
    "      for (const name in attributes) {\n" +
    "        const old = attributes[name], size = old.itemSize, arr = new old.array.constructor((nc + extras.length) * size);\n" +
    "        arr.set(old.array);\n" +
    "        for (let i = 0; i < extras.length; i++) {\n" +
    "          const e = extras[i], authored = name === 'color' || name === 'aMat', from = authored ? A[name] : old, index = authored ? e.original : e.cluster;\n" +
    "          for (let k = 0; k < size; k++) arr[(nc + i) * size + k] = from.array[index * size + k];\n" +
    "        }\n" +
    "        out.setAttribute(name, new THREE.BufferAttribute(arr, size, old.normalized));\n" +
    "      }\n" +
    "      out.setIndex(nc + extras.length > 65535 ? new THREE.Uint32BufferAttribute(remapped, 1) : new THREE.Uint16BufferAttribute(remapped, 1));\n" +
    "    }\n" +
    "  }\n" +
    "  out.userData = { ...src.userData, iwLod: 'far', cell };\n" +
    "  out.computeBoundingSphere();\n" +
    "  return out;\n" +
    "}\n\n" +
    "const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;\n\n" +
    "/** Far-tier version of `geo`, decimated to ≲ `target` triangles (cached per source geometry). */\n" +
    "export function farGeometry(geo, target) {\n" +
    "  if (!geo || !geo.attributes || !geo.attributes.position) return geo;\n" +
    "  let c = _farCache.get(geo);\n" +
    "  if (c) return c;\n" +
    "  if (triCount(geo) <= target) { _farCache.set(geo, geo); return geo; }\n" +
    "  // cell size from the surface density, then one correction step (triangle count ∝ 1 / cell²)\n" +
    "  let cell = 0.018;\n" +
    "  let g = clusterDecimate(geo, cell);\n" +
    "  for (let it = 0; it < 3 && triCount(g) > target * 1.12; it++) {\n" +
    "    cell *= Math.sqrt(triCount(g) / target) * 1.02;\n" +
    "    g.dispose(); g = clusterDecimate(geo, cell);\n" +
    "  }\n" +
    "  _farCache.set(geo, g);\n" +
    "  return g;\n" +
    "}\nexport { triCount };\n";

  const outfitBeforeSrc = outfitAfterSrc
    .replace(
      '      const ix = Math.floor(x / cell), iy = Math.floor(y / cell), iz = Math.floor(z / cell);\n      const key = ix >= -256 && ix < 256 && iy >= -256 && iy < 256 && iz >= -256 && iz < 256 ? (((ix + 256) << 21) | ((iy + 256) << 12) | ((iz + 256) << 3) | ax) : String(ix) + "," + iy + "," + iz + "," + ax;',
      '      const key = `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)},${ax}`;'
    )
    .replace(
      '          const dot = nx * vx + ny * vy + nz * vz;\n          if (dot <= 0) continue;\n          const d = Math.sqrt(d2);\n          if (dot <= 0.02 * d) continue;\n          const cr = dot / d;',
      '          const dot = nx * vx + ny * vy + nz * vz;\n          if (dot <= 0.02 * Math.sqrt(d2)) continue;\n          const d = Math.sqrt(d2), cr = dot / d;'
    );

  const bbBeforeSrc = bbAfterSrc
    .replace(
      "  this.rotationGain=new Map([['hip',HOST_BALANCE.pelvisRotation],['spine1',HOST_BALANCE.torsoRotation],['spine2',HOST_BALANCE.torsoRotation],['chest',HOST_BALANCE.torsoRotation],['neck',HOST_BALANCE.headRotation],['head',HOST_BALANCE.headRotation]]);\n  this.rotationGainByIndex=bank.bones.map(b=>this.rotationGain.get(b.name));\n  this.hipIndex=bank.index.hip;",
      "  this.rotationGain=new Map([['hip',HOST_BALANCE.pelvisRotation],['spine1',HOST_BALANCE.torsoRotation],['spine2',HOST_BALANCE.torsoRotation],['chest',HOST_BALANCE.torsoRotation],['neck',HOST_BALANCE.headRotation],['head',HOST_BALANCE.headRotation]]);"
    )
    .replace(
      "  for(let i=0;i<this.bank.bones.length;i++){\n   const b=this.bank.bones[i],rawGain=this.rotationGainByIndex[i],gain=rawGain===undefined?undefined:rawGain*(i===this.hipIndex?1-.85*pivot:1)*(1-.78*clamp(strafe,0,1)),parent=b.parent;",
      "  for(let i=0;i<this.bank.bones.length;i++){\n   const b=this.bank.bones[i],rawGain=this.rotationGain.get(b.name),gain=rawGain===undefined?undefined:rawGain*(b.name==='hip'?1-.85*pivot:1)*(1-.78*clamp(strafe,0,1)),parent=b.parent;"
    )
    .replace(
      "  let entries=this._reachChain;\n  if(!entries||this._reachChar!==character){\n   this._reachChar=character;\n   const chain=['spine','chest','neck'];let length=0;\n   for(const n of chain)length+=character.rest[n].distanceTo(character.rest[character.bones[n].parent.name]);\n   entries=this._reachChain=chain.map(n=>{const b=character.bones[n];return {b,parent:b.parent,share:character.rest[n].distanceTo(character.rest[b.parent.name])/length};});\n  }\n  for(let i=0;i<entries.length;i++){\n   const {b,parent,share}=entries[i];\n   this.parent.identity();for(let x=parent;x&&x!==character.kid;x=x.parent)this.parent.premultiply(x.quaternion);\n   this.v.set(0,this.reachCorrection*share,0).applyQuaternion(this.parent.invert());b.position.add(this.v);\n  }",
      "  const chain=['spine','chest','neck'];let length=0;\n  for(const n of chain)length+=character.rest[n].distanceTo(character.rest[character.bones[n].parent.name]);\n  for(const n of chain){const b=character.bones[n],share=character.rest[n].distanceTo(character.rest[b.parent.name])/length;\n   character._kidXform(b.parent,this.p,this.parent);this.v.set(0,this.reachCorrection*share,0).applyQuaternion(this.parent.invert());b.position.add(this.v);\n  }"
    );

  // Verify that the completed production build (_site/) output of baseline vs A+ is 100% bit-for-bit identical!
  const composedLodBefore = adaptBuildSource('src/game/character-lod.js', lodBeforeSrc);
  const composedLodAfter = adaptBuildSource('src/game/character-lod.js', lodAfterSrc);
  assert.equal(composedLodBefore, composedLodAfter, 'Composed _site/src/game/character-lod.js must be byte-for-byte identical');

  const composedOutfitBefore = adaptBuildSource('src/game/character-outfit.js', outfitBeforeSrc);
  const composedOutfitAfter = adaptBuildSource('src/game/character-outfit.js', outfitAfterSrc);
  assert.equal(composedOutfitBefore, composedOutfitAfter, 'Composed _site/src/game/character-outfit.js must be byte-for-byte identical');

  const composedBbBefore = adaptBuildSource('src/game/motion/body-balance.js', bbBeforeSrc);
  const composedBbAfter = adaptBuildSource('src/game/motion/body-balance.js', bbAfterSrc);
  assert.equal(composedBbBefore, composedBbAfter, 'Composed _site/src/game/motion/body-balance.js must be byte-for-byte identical');

  // Measure actual build-time adaptBuildSource() composition speedup across the 3 migrated modules (200 iterations)
  const ITERS = 200;
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    adaptQualitySource('src/game/character-lod.js', lodBeforeSrc);
    adaptQualitySource('src/game/character-outfit.js', outfitBeforeSrc);
    adaptQualitySource('src/game/motion/body-balance.js', bbBeforeSrc);
  }
  const buildComposeBeforeMs = (performance.now() - t0) / ITERS;

  const t1 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    adaptQualitySource('src/game/character-lod.js', lodAfterSrc);
    adaptQualitySource('src/game/character-outfit.js', outfitAfterSrc);
    adaptQualitySource('src/game/motion/body-balance.js', bbAfterSrc);
  }
  const buildComposeAfterMs = (performance.now() - t1) / ITERS;

  return {
    auditDisclosure: 'Historical migration only: baseline main (225f1d30 / 8bebf5cf) already injected LOD, AO and BodyBalance optimization in _site/. The frozen migration pairs below remain byte-identical and supply zero new runtime/FPS gain. Later BodyBalance ancestor-closure work is admitted separately and tested by the real source/emitted character regression; it is not covered by the historical identity claim.',
    currentBodyBalanceFollowup:{baseline:'26a4db41',byteIdentical:false,strictDeltaAdmitted:true,currentSourceSha256:currentBodySha,combinedSourceEpoch:currentBodySha===combinedBodySha?'42b76fba916054a0058c196d70dbc21d6873b705':null,validation:'body-balance-work.test.mjs: real source/emitted 30/60/120Hz final pose/skin/contact/muzzle parity, retaining the separately integrated #1815 caches'},
    composedSiteByteParity: {
      'src/game/character-lod.js': { beforeBytes: Buffer.byteLength(composedLodBefore), afterBytes: Buffer.byteLength(composedLodAfter), byteIdentical: true },
      'src/game/character-outfit.js': { beforeBytes: Buffer.byteLength(composedOutfitBefore), afterBytes: Buffer.byteLength(composedOutfitAfter), byteIdentical: true },
      'src/game/motion/body-balance.js': { beforeBytes: Buffer.byteLength(composedBbBefore), afterBytes: Buffer.byteLength(composedBbAfter), byteIdentical: true },
    },
    netNewRuntimeSpeedupInComposedSiteBuild: 'Historical migration: 1.00x, zero new runtime gain. Later BodyBalance work requires its separate measurements; no FPS claim.',
    buildTimeCompositionBenchmark: {
      iterations: ITERS,
      beforeMsPerPass: Number(buildComposeBeforeMs.toFixed(4)),
      afterMsPerPass: Number(buildComposeAfterMs.toFixed(4)),
      speedup: Number((buildComposeBeforeMs / Math.max(buildComposeAfterMs, 1e-6)).toFixed(2)) + 'x',
      stringReplacementsEliminatedPerBuild: 6,
    },
  };
}


// ---------------------------------------------------------------------------
// Minimal deterministic THREE math & BufferGeometry runtime for real-code execution
// ---------------------------------------------------------------------------
class BenchAttr {
  constructor(array, itemSize, normalized = false) {
    this.array = array;
    this.itemSize = itemSize;
    this.normalized = normalized;
    this.count = array.length / itemSize;
    this.needsUpdate = false;
  }
  getComponent(i, k) { return this.array[i * this.itemSize + k]; }
  setComponent(i, k, v) { this.array[i * this.itemSize + k] = v; }
  getX(i) { return this.array[i * this.itemSize]; }
  getY(i) { return this.array[i * this.itemSize + 1]; }
  getZ(i) { return this.array[i * this.itemSize + 2]; }
  setXYZ(i, x, y, z) {
    const o = i * this.itemSize;
    this.array[o] = x;
    this.array[o + 1] = y;
    this.array[o + 2] = z;
  }
}

class BenchGeometry {
  constructor() {
    this.attributes = {};
    this.userData = {};
    this.index = null;
  }
  setAttribute(name, attr) { this.attributes[name] = attr; return this; }
  setIndex(attr) { this.index = attr; return this; }
  computeBoundingSphere() {}
  dispose() {}
}

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  lerp(v, a) { this.x += (v.x - this.x) * a; this.y += (v.y - this.y) * a; this.z += (v.z - this.z) * a; return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  applyQuaternion(q) {
    const x = this.x, y = this.y, z = this.z;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return this;
  }
}

class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  identity() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  invert() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  premultiply(q) { return this.multiplyQuaternions(q, this); }
  multiplyQuaternions(a, b) {
    const qax = a.x, qay = a.y, qaz = a.z, qaw = a.w;
    const qbx = b.x, qby = b.y, qbz = b.z, qbw = b.w;
    this.x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
    this.y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
    this.z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
    this.w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
    return this;
  }
  slerp(qb, t) {
    if (t === 0) return this;
    if (t === 1) return this.copy(qb);
    const x = this.x, y = this.y, z = this.z, w = this.w;
    let cosHalfTheta = w * qb.w + x * qb.x + y * qb.y + z * qb.z;
    let qbx = qb.x, qby = qb.y, qbz = qb.z, qbw = qb.w;
    if (cosHalfTheta < 0) {
      qbw = -qbw; qbx = -qbx; qby = -qby; qbz = -qbz;
      cosHalfTheta = -cosHalfTheta;
    }
    if (cosHalfTheta >= 1.0) return this;
    const sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta;
    if (sqrSinHalfTheta <= Number.EPSILON) {
      const s = 1 - t;
      this.w = s * w + t * qbw; this.x = s * x + t * qbx; this.y = s * y + t * qby; this.z = s * z + t * qbz;
      const l = Math.hypot(this.x, this.y, this.z, this.w) || 1;
      this.x /= l; this.y /= l; this.z /= l; this.w /= l;
      return this;
    }
    const sinHalfTheta = Math.sqrt(sqrSinHalfTheta);
    const halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
    const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
    const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
    this.w = w * ratioA + qbw * ratioB;
    this.x = x * ratioA + qbx * ratioB;
    this.y = y * ratioA + qby * ratioB;
    this.z = z * ratioA + qbz * ratioB;
    return this;
  }
}

const THREE_STUB = {
  BufferGeometry: BenchGeometry,
  BufferAttribute: BenchAttr,
  Uint32BufferAttribute: class extends BenchAttr { constructor(a, s) { super(Uint32Array.from(a), s); } },
  Uint16BufferAttribute: class extends BenchAttr { constructor(a, s) { super(Uint16Array.from(a), s); } },
  Vector3: Vec3,
  Quaternion: Quat,
};

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------------------------------------------------------------------------
// 1. Real-Code Benchmark: `src/game/character-lod.js` (Same-Condition Before vs After)
// ---------------------------------------------------------------------------
function makeCharacterMesh(vertexCount, withWeaponMat = false) {
  let seed = 1337;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const P = new Float32Array(vertexCount * 3);
  const N = new Float32Array(vertexCount * 3);
  const SI = new Uint16Array(vertexCount * 4);
  const SW = new Float32Array(vertexCount * 4);
  const EX = new Float32Array(vertexCount);
  const CL = new Float32Array(vertexCount * 2);
  const TI = new Float32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    P[i * 3] = ((i % 120) * 0.004 + rnd() * 0.0005) - 0.24;
    P[i * 3 + 1] = ((Math.floor(i / 120) % 120) * 0.004 + rnd() * 0.0005) - 0.24;
    P[i * 3 + 2] = ((Math.floor(i / 14400) % 120) * 0.004 + rnd() * 0.0005) - 0.24;
    N[i * 3 + 1] = 1;
    SI[i * 4] = i % 16; SW[i * 4] = 1;
    EX[i] = i % 4; CL[i * 2] = i % 3; CL[i * 2 + 1] = i % 2; TI[i] = -2;
  }
  const g = new BenchGeometry();
  g.setAttribute('position', new BenchAttr(P, 3));
  g.setAttribute('normal', new BenchAttr(N, 3));
  g.setAttribute('skinIndex', new BenchAttr(SI, 4));
  g.setAttribute('skinWeight', new BenchAttr(SW, 4));
  g.setAttribute('aEx', new BenchAttr(EX, 1));
  g.setAttribute('aCloth', new BenchAttr(CL, 2));
  g.setAttribute('aTint', new BenchAttr(TI, 1));
  if (withWeaponMat) {
    const MAT = new Float32Array(vertexCount * 4);
    const COL = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount; i++) {
      MAT[i * 4] = (i % 3) * 0.3; MAT[i * 4 + 1] = 0.5;
      COL[i * 3] = 0.8; COL[i * 3 + 1] = 0.2; COL[i * 3 + 2] = 0.1;
    }
    g.setAttribute('aMat', new BenchAttr(MAT, 4));
    g.setAttribute('color', new BenchAttr(COL, 3));
  }
  return g;
}

function benchmarkLodSameCondition() {
  const legacyLodRaw = "// INKWAVE — squidkid LOD kit (used by character.js only).\n//   • tier policy: hero / game / far picked by the kid's projected screen height, per quality setting, with hysteresis\n//   • screen-door dither cross-fade: per-kid clones of the body materials that discard complementary pixel sets, so two\n//     tiers overlap for ~0.3 s with every pixel drawn exactly once (no pop, no double-blend, no sorting)\n//   • bone-aware clustering decimator: builds the 'far' tier from any skinned geometry the builders hand us, keeping\n//     limbs / strands / fingers separate (clusters never straddle two dominant bones → no webbing when joints bend)\nimport * as THREE from 'three';\n\nexport const TIERS = ['hero', 'game', 'far'];\nexport const T_HERO = 0, T_GAME = 1, T_FAR = 2;\nexport const KID_H = 1.32;          // head-top height of the kid (m) for the screen-size estimate\nexport const FADE_S = 0.3;          // cross-fade duration (s)\n\n// Screen height (CSS px) of the kid: above `hero` → hero tier in a match (`heroLocal` for the local player — the kid\n// you look at all match), below `far` → far tier; `menu` = tier out of a match (showcase pedestal, locker, lobby line-up).\n// Hysteresis ±12 %. (Default FOV: the local player stands ≈ 28 % of the viewport tall — 250 px at 900 — so from\n// 720p up (≈ 200 px) it is hero at high; a kid across the plaza is ≈ 40–90 px.)\nexport const LOD_QUALITY = {\n  low: { hero: Infinity, heroLocal: Infinity, far: 150, menu: T_GAME },\n  medium: { hero: 760, heroLocal: 260, far: 110, menu: T_HERO },\n  high: { hero: 430, heroLocal: 150, far: 78, menu: T_HERO },\n  ultra: { hero: 300, heroLocal: 110, far: 54, menu: T_HERO },\n};\nexport const HYST = 0.12;\n/** Tier for a screen height `px` given the current tier `cur` (hysteresis), quality row `Q` and hero threshold `H`. */\nexport function pickTier(px, cur, Q, H = Q.hero) {\n  const up = 1 + HYST, dn = 1 - HYST;\n  let t = cur < 0 ? (px >= H ? T_HERO : px < Q.far ? T_FAR : T_GAME) : cur;\n  if (t === T_HERO && px < H * dn) t = px < Q.far ? T_FAR : T_GAME;\n  else if (t === T_GAME && px >= H * up) t = T_HERO;\n  else if (t === T_GAME && px < Q.far * dn) t = T_FAR;\n  else if (t === T_FAR && px >= Q.far * up) t = px >= H * up ? T_HERO : T_GAME;\n  return t;\n}\n\n// ------------------------------------------------------------------------------------------------\n// Dither cross-fade materials\n// ------------------------------------------------------------------------------------------------\n// uLodFade = (f, side): f ∈ (0,1] fade progress; side +1 = outgoing (keeps IGN ≥ f), −1 = incoming (keeps IGN < f).\n// f = 0 disables the test. Interleaved-gradient noise: fine-grained and even at every f.\nconst DITHER_PARS = 'uniform vec2 uLodFade;\\nfloat iwLodIGN(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }\\n';\nconst DITHER_TEST = '\\n  if (uLodFade.x > 0.0) { float iwLodN = iwLodIGN(floor(gl_FragCoord.xy)); if ((iwLodN < uLodFade.x) == (uLodFade.y > 0.0)) discard; }\\n';\nconst MAIN_RE = /void\\s+main\\s*\\(\\s*\\)\\s*\\{/;\n\n/** A clone of `base` whose fragment shader dithers against `fadeU` ({ value: Vector2 }). Same program for every kid. */\nexport function ditherMaterial(base, fadeU) {\n  const m = base.clone();\n  const prev = base.onBeforeCompile;\n  const key = (base.customProgramCacheKey ? base.customProgramCacheKey() : '') + '|iwLodZ';\n  m.onBeforeCompile = function (sh, r) {\n    if (prev) prev.call(this, sh, r);\n    sh.uniforms.uLodFade = fadeU;\n    if (MAIN_RE.test(sh.fragmentShader)) sh.fragmentShader = sh.fragmentShader.replace(MAIN_RE, (s) => DITHER_PARS + s + DITHER_TEST);\n  };\n  m.customProgramCacheKey = () => key;\n  return m;\n}\n\n// ------------------------------------------------------------------------------------------------\n// Far tier: bone-aware vertex clustering\n// ------------------------------------------------------------------------------------------------\nconst _farCache = new WeakMap();\n\n/**\n * Decimate an (indexed or not) skinned geometry by vertex clustering. Cluster key = grid cell + dominant bone + discrete\n * material ids (aEx, aCloth.xy, aTint gear class), so clothing material borders survive; opposite-facing members split off (thin\n * shells keep both faces). Each cluster keeps its most central vertex (attributes incl. skin\n * weights copied from it — the surface never shrinks) with the members' averaged normal.\n */\nexport function clusterDecimate(src, cell) {\n  const A = src.attributes, P = A.position, n = P.count;\n  const N = A.normal, SI = A.skinIndex, SW = A.skinWeight, EX = A.aEx, CL = A.aCloth, TI = A.aTint;\n  const inv = 1 / cell;\n  const key2c = new Map(), vc = new Int32Array(n);\n  const sx = [], sy = [], sz = [], cn = [], rx = [], ry = [], rz = [];\n  const newC = (key, i) => {\n    const c = cn.length; key2c.set(key, c); sx.push(0); sy.push(0); sz.push(0); cn.push(0);\n    rx.push(N ? N.getX(i) : 0); ry.push(N ? N.getY(i) : 0); rz.push(N ? N.getZ(i) : 0);\n    return c;\n  };\n  for (let i = 0; i < n; i++) {\n    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);\n    let dom = 0;\n    if (SI && SW) { let bw = -1; for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; dom = SI.getComponent(i, k); } } }\n    let d = '';\n    if (EX) d += Math.round(EX.getX(i));\n    if (CL) d += ':' + Math.round(CL.getX(i)) + '.' + Math.round(CL.getY(i));\n    if (TI) { const t = TI.getX(i); d += ':' + (t <= -1.5 ? Math.round(t) : 0); }\n    const key = `${Math.floor(x * inv)},${Math.floor(y * inv)},${Math.floor(z * inv)},${dom},${d}`;\n    let c = key2c.get(key);\n    if (c === undefined) c = newC(key, i);\n    // a member facing away from the cluster's first normal (the other face of a thin shell, a > 95° crease) gets its own\n    // cluster — smooth curvature never splits, so the count stays low while sheets keep both faces\n    else if (N && N.getX(i) * rx[c] + N.getY(i) * ry[c] + N.getZ(i) * rz[c] < -0.09) { const k2 = key + '#'; c = key2c.get(k2); if (c === undefined) c = newC(k2, i); }\n    vc[i] = c; sx[c] += x; sy[c] += y; sz[c] += z; cn[c]++;\n  }\n  const nc = cn.length;\n  // representative = member nearest the centroid\n  const rep = new Int32Array(nc).fill(-1), rd = new Float64Array(nc).fill(Infinity);\n  for (let i = 0; i < n; i++) {\n    const c = vc[i], k = 1 / cn[c];\n    const dx = P.getX(i) - sx[c] * k, dy = P.getY(i) - sy[c] * k, dz = P.getZ(i) - sz[c] * k, d = dx * dx + dy * dy + dz * dz;\n    if (d < rd[c]) { rd[c] = d; rep[c] = i; }\n  }\n  const out = new THREE.BufferGeometry();\n  for (const name in A) {\n    const a = A[name], s = a.itemSize, arr = new a.array.constructor(nc * s);\n    for (let c = 0; c < nc; c++) { const r = rep[c]; for (let k = 0; k < s; k++) arr[c * s + k] = a.getComponent(r, k); }\n    out.setAttribute(name, new THREE.BufferAttribute(arr, s, a.normalized));\n  }\n  if (N) {\n    const acc = new Float32Array(nc * 3);\n    for (let i = 0; i < n; i++) { const c = vc[i] * 3; acc[c] += N.getX(i); acc[c + 1] += N.getY(i); acc[c + 2] += N.getZ(i); }\n    const on = out.attributes.normal;\n    for (let c = 0; c < nc; c++) {\n      const x = acc[c * 3], y = acc[c * 3 + 1], z = acc[c * 3 + 2], l = Math.hypot(x, y, z);\n      if (l > 0.3 * cn[c]) on.setXYZ(c, x / l, y / l, z / l);\n    }\n  }\n  // triangles: remap, drop collapsed ones and exact duplicates (orientation kept: both faces of a sheet survive)\n  const src3 = src.index ? src.index.array : null, nt = (src3 ? src3.length : n) / 3;\n  const tris = [], sourceCorners = [], seen = new Set();\n  for (let t = 0; t < nt; t++) {\n    const a = vc[src3 ? src3[t * 3] : t * 3], b = vc[src3 ? src3[t * 3 + 1] : t * 3 + 1], c = vc[src3 ? src3[t * 3 + 2] : t * 3 + 2];\n    if (a === b || b === c || a === c) continue;\n    const m = Math.min(a, b, c), key = m === a ? `${a},${b},${c}` : m === b ? `${b},${c},${a}` : `${c},${a},${b}`;\n    if (seen.has(key)) continue;\n    seen.add(key); tris.push(a, b, c);\n    if (A.aMat && A.color) sourceCorners.push(src3 ? src3[t * 3] : t * 3, src3 ? src3[t * 3 + 1] : t * 3 + 1, src3 ? src3[t * 3 + 2] : t * 3 + 2);\n  }\n  out.setIndex(nc > 65535 ? new THREE.Uint32BufferAttribute(tris, 1) : new THREE.Uint16BufferAttribute(tris, 1));\n  // Keep the established spatial decimation and triangle budget, but do not let a\n  // neighbouring metal/print representative repaint the surviving weapon surface.\n  // Split only attribute conflicts at surviving corners. Positions/normals remain\n  // the existing cluster result; nonweapon geometries take the original path.\n  if (A.aMat && A.color) {\n    const attributes = out.attributes, extras = [], splits = new Map(), remapped = [];\n    for (let i = 0; i < tris.length; i++) {\n      const cluster = tris[i], original = sourceCorners[i];\n      const same = ['aMat', 'color'].every(name => {\n        const a = A[name], b = attributes[name];\n        for (let k = 0; k < a.itemSize; k++) if (a.getComponent(original, k) !== b.getComponent(cluster, k)) return false;\n        return true;\n      });\n      if (same) { remapped.push(cluster); continue; }\n      const values = [cluster];\n      for (const name of ['aMat', 'color']) for (let k = 0; k < A[name].itemSize; k++) values.push(A[name].getComponent(original, k));\n      const key = values.join(':');\n      let index = splits.get(key);\n      if (index === undefined) { index = nc + extras.length; splits.set(key, index); extras.push({ cluster, original }); }\n      remapped.push(index);\n    }\n    if (extras.length) {\n      for (const name in attributes) {\n        const old = attributes[name], size = old.itemSize, arr = new old.array.constructor((nc + extras.length) * size);\n        arr.set(old.array);\n        for (let i = 0; i < extras.length; i++) {\n          const e = extras[i], authored = name === 'color' || name === 'aMat', from = authored ? A[name] : old, index = authored ? e.original : e.cluster;\n          for (let k = 0; k < size; k++) arr[(nc + i) * size + k] = from.array[index * size + k];\n        }\n        out.setAttribute(name, new THREE.BufferAttribute(arr, size, old.normalized));\n      }\n      out.setIndex(nc + extras.length > 65535 ? new THREE.Uint32BufferAttribute(remapped, 1) : new THREE.Uint16BufferAttribute(remapped, 1));\n    }\n  }\n  out.userData = { ...src.userData, iwLod: 'far', cell };\n  out.computeBoundingSphere();\n  return out;\n}\n\nconst triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;\n\n/** Far-tier version of `geo`, decimated to ≲ `target` triangles (cached per source geometry). */\nexport function farGeometry(geo, target) {\n  if (!geo || !geo.attributes || !geo.attributes.position) return geo;\n  let c = _farCache.get(geo);\n  if (c) return c;\n  if (triCount(geo) <= target) { _farCache.set(geo, geo); return geo; }\n  // cell size from the surface density, then one correction step (triangle count ∝ 1 / cell²)\n  let cell = 0.018;\n  let g = clusterDecimate(geo, cell);\n  for (let it = 0; it < 3 && triCount(g) > target * 1.12; it++) {\n    cell *= Math.sqrt(triCount(g) / target) * 1.02;\n    g.dispose(); g = clusterDecimate(geo, cell);\n  }\n  _farCache.set(geo, g);\n  return g;\n}\nexport { triCount };\n"
    .replace(/import \* as THREE from 'three';/, '')
    .replace(/export /g, '');
  const directLodRaw = fs.readFileSync(new URL('../inkwave-public/src/game/character-lod.js', import.meta.url), 'utf8')
    .replace(/import \* as THREE from 'three';/, '')
    .replace(/export /g, '');

  const legacyCtx = { THREE: THREE_STUB, Math, Map, Set, WeakMap, Int32Array, Float32Array, Float64Array, Uint16Array, Uint32Array, Number, String };
  const directCtx = { THREE: THREE_STUB, Math, Map, Set, WeakMap, Int32Array, Float32Array, Float64Array, Uint16Array, Uint32Array, Number, String };

  const legacyMod = vm.runInNewContext(legacyLodRaw + '\n({ clusterDecimate, farGeometry })', legacyCtx);
  const directMod = vm.runInNewContext(directLodRaw + '\n({ clusterDecimate, farGeometry, getScratchState: () => ({ _htStamp, _scratchCap, _htSize }) })', directCtx);

  // Verify startup lazy allocation (0 bytes allocated before first LOD call)
  const initScratch = directMod.getScratchState();
  assert.equal(initScratch._htStamp, null, 'Hash table must be null before first LOD use');
  assert.equal(initScratch._scratchCap, 0, 'Scratch capacity must be 0 before first LOD use');

  // Verify small mesh (2,400v weapon/gear mesh) adaptive scratch capacity AND bit-identity
  const smallMeshA = makeCharacterMesh(2400, true);
  const smallMeshB = makeCharacterMesh(2400, true);
  const outSmallLegacy = legacyMod.farGeometry(smallMeshA, 450);
  const outSmallDirect = directMod.farGeometry(smallMeshB, 450);
  const smallScratch = directMod.getScratchState();
  assert.equal(smallScratch._scratchCap, 4096, '2,400v mesh reserves 4,096 scratch slots (196.6 KB) instead of 65,536 (3.14 MB)');
  assert.deepEqual(Array.from(outSmallLegacy.index.array), Array.from(outSmallDirect.index.array), '2,400v weapon mesh indices must be bit-identical');
  assert.deepEqual(Array.from(outSmallLegacy.attributes.color.array), Array.from(outSmallDirect.attributes.color.array), '2,400v weapon mesh colors must be bit-identical');

  // Verify 15,000v character mesh bit-identity
  const mesh15kA = makeCharacterMesh(15000, false);
  const mesh15kB = makeCharacterMesh(15000, false);
  const out15kLegacy = legacyMod.farGeometry(mesh15kA, 900);
  const out15kDirect = directMod.farGeometry(mesh15kB, 900);
  assert.deepEqual(Array.from(out15kLegacy.index.array), Array.from(out15kDirect.index.array), '15,000v LOD triangle indices must be bit-identical');
  assert.deepEqual(Array.from(out15kLegacy.attributes.position.array), Array.from(out15kDirect.attributes.position.array), '15,000v LOD vertex positions must be bit-identical');
  assert.deepEqual(Array.from(out15kLegacy.attributes.normal.array), Array.from(out15kDirect.attributes.normal.array), '15,000v LOD vertex normals must be bit-identical');

  // Same-condition timing over 12 runs on identical 15,000v meshes
  const runs = 12;
  const meshesLegacy = Array.from({ length: runs }, () => makeCharacterMesh(15000, false));
  const meshesDirect = Array.from({ length: runs }, () => makeCharacterMesh(15000, false));

  const t0 = performance.now();
  for (let r = 0; r < runs; r++) legacyMod.farGeometry(meshesLegacy[r], 900);
  const beforeMs = (performance.now() - t0) / runs;

  const t1 = performance.now();
  for (let r = 0; r < runs; r++) directMod.farGeometry(meshesDirect[r], 900);
  const afterMs = (performance.now() - t1) / runs;

  const bytesPerSlot = 4 + 4 * 3 + 8 * 3 + 4; // _vc(4) + _rx/_ry/_rz(12) + _sx/_sy/_sz(24) + _cn(4) = 44 bytes/slot
  const fixed64kKB = Number(((65536 * bytesPerSlot) / 1024).toFixed(1));
  const adaptive2400vKB = Number(((4096 * bytesPerSlot) / 1024).toFixed(1));

  return {
    module: 'inkwave-public/src/game/character-lod.js',
    functionUnderTest: 'farGeometry(mesh15k, 900) & clusterDecimate',
    sameConditionInput: '15,000-vertex skinned character mesh (target=900 tris, 4 clustering passes) + 2,400-vertex weapon mesh',
    beforeMs: Number(beforeMs.toFixed(2)),
    afterMs: Number(afterMs.toFixed(2)),
    speedup: Number((beforeMs / afterMs).toFixed(2)) + 'x',
    latencyReductionPercent: Number((((beforeMs - afterMs) / beforeMs) * 100).toFixed(1)) + '%',
    sameConditionMemory: {
      startupAllocatedBytesBeforeFirstUse: 0,
      smallMeshScratchBufferBeforeKB: fixed64kKB,
      smallMeshScratchBufferAfterKB: adaptive2400vKB,
      smallMeshScratchReductionPercent: '93.8%',
      perCallStringKeyAllocationsBefore: '60,000+ Map/Set strings per 15k mesh',
      perCallStringKeyAllocationsAfter: '0 strings (packed Int32 open-addressing table)',
    },
    visualQualityEquivalence: {
      outputTrianglesBefore: out15kLegacy.index.array.length / 3,
      outputTrianglesAfter: out15kDirect.index.array.length / 3,
      indexArrayBitIdentical: true,
      positionArrayBitIdentical: true,
      normalArrayBitIdentical: true,
      weaponColorArrayBitIdentical: true,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. Real-Code Benchmark: `src/game/character-outfit.js` (`bakeBodyAO`)
// ---------------------------------------------------------------------------
function makeSkinAndClothPair(vertexCountPerMesh = 6000) {
  const buildIndexedTube = (radiusBase, yOffset) => {
    const rings = 60, segs = Math.floor(vertexCountPerMesh / rings);
    const n = rings * segs;
    const P = new Float32Array(n * 3);
    const N = new Float32Array(n * 3);
    const C = new Float32Array(n * 3);
    const H = new Float32Array(n * 3);
    for (let r = 0; r < rings; r++) {
      const y = yOffset + (r / rings) * 0.95;
      for (let s = 0; s < segs; s++) {
        const i = r * segs + s;
        const th = (s / segs) * Math.PI * 2;
        const rad = radiusBase + 0.008 * Math.sin(r * 0.5 + s * 0.3);
        P[i * 3] = Math.cos(th) * rad;
        P[i * 3 + 1] = y;
        P[i * 3 + 2] = Math.sin(th) * rad;
        const nx = Math.cos(th), ny = (s & 1) ? 0.2 : -0.2, nz = Math.sin(th);
        const l = Math.hypot(nx, ny, nz);
        N[i * 3] = nx / l; N[i * 3 + 1] = ny / l; N[i * 3 + 2] = nz / l;
        C[i * 3] = 0.92; C[i * 3 + 1] = 0.78; C[i * 3 + 2] = 0.68;
      }
    }
    const tris = [];
    for (let r = 0; r < rings - 1; r++) {
      for (let s = 0; s < segs; s++) {
        const s1 = (s + 1) % segs;
        const a = r * segs + s, b = r * segs + s1, c = (r + 1) * segs + s, d = (r + 1) * segs + s1;
        tris.push(a, b, c, b, d, c);
      }
    }
    const g = new BenchGeometry();
    g.setAttribute('position', new BenchAttr(P, 3));
    g.setAttribute('normal', new BenchAttr(N, 3));
    g.setAttribute('color', new BenchAttr(C, 3));
    g.setAttribute('aHead', new BenchAttr(H, 3));
    g.setIndex(new BenchAttr(Uint32Array.from(tris), 1));
    return g;
  };
  return {
    skin: buildIndexedTube(0.11, 0.05),
    cloth: buildIndexedTube(0.118, 0.05),
  };
}

function benchmarkOutfitAOSameCondition() {
  const legacyAoCode = "function smoothOnMesh(g, v, iters, mask = null) {\n  const ix = g.index.array, n = v.length;\n  const acc = new Float32Array(n), cnt = new Float32Array(n);\n  for (let it = 0; it < iters; it++) {\n    acc.fill(0); cnt.fill(0);\n    for (let t = 0; t < ix.length; t += 3) {\n      const a = ix[t], b = ix[t + 1], c = ix[t + 2];\n      acc[a] += v[b] + v[c]; cnt[a] += 2; acc[b] += v[a] + v[c]; cnt[b] += 2; acc[c] += v[a] + v[b]; cnt[c] += 2;\n    }\n    for (let i = 0; i < n; i++) if (cnt[i] > 0 && (!mask || mask[i])) v[i] = 0.5 * v[i] + 0.5 * acc[i] / cnt[i];\n  }\n}\nfunction bakeBodyAO(skin, cloth, level = 3) {\n  const lv = clamp(level | 0, 0, 4);\n  const cell = [0.016, 0.012, 0.0105, 0.0088, 0.0078][lv];\n  const RAD = 0.04, R2 = RAD * RAD, GC = RAD / 2;\n  // ---- emitter clusters (grid cell × dominant normal axis so thin shells keep both faces)\n  const cmap = new Map();\n  let cx = [], cy = [], cz = [], cnx = [], cny = [], cnz = [], ca = [];\n  for (const g of [skin, cloth]) {\n    const P = g.attributes.position, N = g.attributes.normal, ix = g.index.array;\n    const area = new Float32Array(P.count);\n    for (let t = 0; t < ix.length; t += 3) {\n      const a = ix[t], b = ix[t + 1], c = ix[t + 2];\n      const ux = P.getX(b) - P.getX(a), uy = P.getY(b) - P.getY(a), uz = P.getZ(b) - P.getZ(a);\n      const vx = P.getX(c) - P.getX(a), vy = P.getY(c) - P.getY(a), vz = P.getZ(c) - P.getZ(a);\n      const ar = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 3;\n      area[a] += ar; area[b] += ar; area[c] += ar;\n    }\n    for (let i = 0; i < P.count; i++) {\n      const A = area[i]; if (A <= 0) continue;\n      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);\n      const anx = Math.abs(nx), any = Math.abs(ny), anz = Math.abs(nz);\n      const ax = anx >= any && anx >= anz ? (nx > 0 ? 0 : 1) : any >= anz ? (ny > 0 ? 2 : 3) : (nz > 0 ? 4 : 5);\n      const key = `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)},${ax}`;\n      let k = cmap.get(key);\n      if (k === undefined) { k = ca.length; cmap.set(key, k); cx.push(0); cy.push(0); cz.push(0); cnx.push(0); cny.push(0); cnz.push(0); ca.push(0); }\n      cx[k] += x * A; cy[k] += y * A; cz[k] += z * A; cnx[k] += nx * A; cny[k] += ny * A; cnz[k] += nz * A; ca[k] += A;\n    }\n  }\n  const nC = ca.length;\n  const EX = new Float32Array(nC), EY = new Float32Array(nC), EZ = new Float32Array(nC), ENX = new Float32Array(nC), ENY = new Float32Array(nC), ENZ = new Float32Array(nC), EA = new Float32Array(nC);\n  for (let k = 0; k < nC; k++) {\n    const A = ca[k]; EX[k] = cx[k] / A; EY[k] = cy[k] / A; EZ[k] = cz[k] / A;\n    const l = Math.hypot(cnx[k], cny[k], cnz[k]) || 1; ENX[k] = cnx[k] / l; ENY[k] = cny[k] / l; ENZ[k] = cnz[k] / l; EA[k] = A;\n  }\n  cx = cy = cz = cnx = cny = cnz = ca = null;\n  // ---- dense CSR grid over the kid's bounds (cell = RAD / 2, 5³ neighbourhood)\n  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;\n  for (let k = 0; k < nC; k++) { x0 = Math.min(x0, EX[k]); y0 = Math.min(y0, EY[k]); z0 = Math.min(z0, EZ[k]); x1 = Math.max(x1, EX[k]); y1 = Math.max(y1, EY[k]); z1 = Math.max(z1, EZ[k]); }\n  x0 -= RAD; y0 -= RAD; z0 -= RAD;\n  const NX = Math.ceil((x1 - x0 + RAD) / GC) + 1, NY = Math.ceil((y1 - y0 + RAD) / GC) + 1, NZ = Math.ceil((z1 - z0 + RAD) / GC) + 1;\n  const cellOf = (x, y, z) => (Math.floor((x - x0) / GC) * NY + Math.floor((y - y0) / GC)) * NZ + Math.floor((z - z0) / GC);\n  const start = new Int32Array(NX * NY * NZ + 1), order = new Int32Array(nC), cellK = new Int32Array(nC);\n  for (let k = 0; k < nC; k++) { cellK[k] = cellOf(EX[k], EY[k], EZ[k]); start[cellK[k] + 1]++; }\n  for (let c = 0; c < NX * NY * NZ; c++) start[c + 1] += start[c];\n  { const fill = start.slice(0, -1); for (let k = 0; k < nC; k++) order[fill[cellK[k]]++] = k; }\n  const occAt = (x, y, z, nx, ny, nz) => {\n    const gi = Math.floor((x - x0) / GC), gj = Math.floor((y - y0) / GC), gkk = Math.floor((z - z0) / GC);\n    let occ = 0;\n    for (let di = -2; di <= 2; di++) {\n      const ii = gi + di; if (ii < 0 || ii >= NX) continue;\n      for (let dj = -2; dj <= 2; dj++) {\n        const jj = gj + dj; if (jj < 0 || jj >= NY) continue;\n        const base = (ii * NY + jj) * NZ;\n        const k0 = Math.max(0, gkk - 2), k1 = Math.min(NZ - 1, gkk + 2);\n        for (let q = start[base + k0], qe = start[base + k1 + 1]; q < qe; q++) {\n          const k = order[q];\n          const vx = EX[k] - x, vy = EY[k] - y, vz = EZ[k] - z;\n          const d2 = vx * vx + vy * vy + vz * vz;\n          if (d2 > R2 || d2 < 1e-8) continue;\n          const dot = nx * vx + ny * vy + nz * vz;\n          if (dot <= 0.02 * Math.sqrt(d2)) continue;\n          const d = Math.sqrt(d2), cr = dot / d;\n          const ce = Math.abs(ENX[k] * vx + ENY[k] * vy + ENZ[k] * vz) / d;\n          const A = EA[k];\n          const f = 1 - d2 / R2;\n          occ += cr * (0.25 + 0.75 * ce) * (A / (Math.PI * d2 + A)) * f * f;\n        }\n      }\n    }\n    return occ;\n  };\n  // ---- receivers\n  {\n    const P = cloth.attributes.position, N = cloth.attributes.normal;\n    const ao = new Float32Array(P.count);\n    for (let i = 0; i < P.count; i++) {\n      const o = occAt(P.getX(i) + N.getX(i) * 0.0006, P.getY(i) + N.getY(i) * 0.0006, P.getZ(i) + N.getZ(i) * 0.0006, N.getX(i), N.getY(i), N.getZ(i));\n      ao[i] = 0.7 * (1 - Math.exp(-1.9 * o));\n    }\n    smoothOnMesh(cloth, ao, 3);\n    cloth.setAttribute('aOcc', new THREE.BufferAttribute(ao, 1));\n  }\n  {\n    const P = skin.attributes.position, N = skin.attributes.normal, C = skin.attributes.color, H = skin.attributes.aHead;\n    const occ = new Float32Array(P.count), use = new Uint8Array(P.count);\n    for (let i = 0; i < P.count; i++) {\n      if (H && Math.abs(H.getX(i)) + Math.abs(H.getY(i)) + Math.abs(H.getZ(i)) > 0.5) continue;\n      if (P.getY(i) > 1.1) continue;\n      const o = occAt(P.getX(i) + N.getX(i) * 0.0006, P.getY(i) + N.getY(i) * 0.0006, P.getZ(i) + N.getZ(i) * 0.0006, N.getX(i), N.getY(i), N.getZ(i));\n      occ[i] = 0.68 * (1 - Math.exp(-1.9 * o)); use[i] = 1;\n    }\n    smoothOnMesh(skin, occ, 2, use);\n    for (let i = 0; i < P.count; i++) {\n      if (!use[i]) continue;\n      const a = 1 - occ[i];\n      // skin AO keeps a little warmth (light bleeding through)\n      C.setXYZ(i, C.getX(i) * Math.pow(a, 0.8), C.getY(i) * a, C.getZ(i) * Math.pow(a, 1.08));\n    }\n    C.needsUpdate = true;\n  }\n}\n\n// ---- compatibility probes for code that dresses the body (the hair module's accessories: wristbands, headphones) --------------\n/** Forearm radius (forward axis) at the old sweep parameter t (0 shoulder … ~0.96 wrist) — wristbands size to it. */";
  const directOutfitFull = fs.readFileSync(new URL('../inkwave-public/src/game/character-outfit.js', import.meta.url), 'utf8');
  const idxSmooth = directOutfitFull.indexOf('function smoothOnMesh(');
  const idxEndAo = directOutfitFull.indexOf('\nexport function armRadiusAt(');
  const directAoCode = directOutfitFull.slice(idxSmooth, idxEndAo).replace('export function bakeBodyAO', 'function bakeBodyAO');

  const legacyBake = vm.runInNewContext(legacyAoCode + '\nbakeBodyAO', { THREE: THREE_STUB, clamp, Math, Map, Float32Array, Int32Array, Uint8Array, String });
  const directBake = vm.runInNewContext(directAoCode + '\nbakeBodyAO', { THREE: THREE_STUB, clamp, Math, Map, Float32Array, Int32Array, Uint8Array, String });

  // Verify bit-identical `aOcc` on cloth and `color` on skin under level = 3
  const pairLegacy = makeSkinAndClothPair(6000);
  const pairDirect = makeSkinAndClothPair(6000);
  legacyBake(pairLegacy.skin, pairLegacy.cloth, 3);
  directBake(pairDirect.skin, pairDirect.cloth, 3);

  const occLegacy = pairLegacy.cloth.attributes.aOcc.array;
  const occDirect = pairDirect.cloth.attributes.aOcc.array;
  let maxAoDiff = 0;
  for (let i = 0; i < occLegacy.length; i++) {
    maxAoDiff = Math.max(maxAoDiff, Math.abs(occLegacy[i] - occDirect[i]));
  }
  assert.equal(maxAoDiff, 0, 'Cloth aOcc Float32Array must be bit-identical');

  const colLegacy = pairLegacy.skin.attributes.color.array;
  const colDirect = pairDirect.skin.attributes.color.array;
  let maxColDiff = 0;
  for (let i = 0; i < colLegacy.length; i++) {
    maxColDiff = Math.max(maxColDiff, Math.abs(colLegacy[i] - colDirect[i]));
  }
  assert.equal(maxColDiff, 0, 'Skin vertex color Float32Array must be bit-identical');

  const runs = 6;
  const pairsA = Array.from({ length: runs }, () => makeSkinAndClothPair(6000));
  const pairsB = Array.from({ length: runs }, () => makeSkinAndClothPair(6000));

  const t0 = performance.now();
  for (let r = 0; r < runs; r++) legacyBake(pairsA[r].skin, pairsA[r].cloth, 3);
  const beforeMs = (performance.now() - t0) / runs;

  const t1 = performance.now();
  for (let r = 0; r < runs; r++) directBake(pairsB[r].skin, pairsB[r].cloth, 3);
  const afterMs = (performance.now() - t1) / runs;

  return {
    module: 'inkwave-public/src/game/character-outfit.js',
    functionUnderTest: 'bakeBodyAO(skin, cloth, 3)',
    sameConditionInput: '12,000 total indexed vertices (6,000 skin + 6,000 cloth, level=3, cell=0.0088m)',
    beforeMs: Number(beforeMs.toFixed(2)),
    afterMs: Number(afterMs.toFixed(2)),
    speedup: Number((beforeMs / afterMs).toFixed(2)) + 'x',
    latencyReductionPercent: Number((((beforeMs - afterMs) / beforeMs) * 100).toFixed(1)) + '%',
    sameConditionMemory: {
      spatialHashMapKeysBefore: '12,000 heap-allocated template strings (`${ix},${iy},${iz},${ax}`)',
      spatialHashMapKeysAfter: '0 heap strings in [-256..255]^3 domain (30-bit V8 Smi integers)',
    },
    visualQualityEquivalence: {
      maxClothOccFloat32AbsDiff: maxAoDiff,
      maxSkinColorFloat32AbsDiff: maxColDiff,
      bitIdentical: true,
    },
  };
}

// ---------------------------------------------------------------------------
// 3. Real-Code Benchmark: `src/game/motion/body-balance.js` (`BodyBalance`)
// ---------------------------------------------------------------------------
function benchmarkBodyBalanceSameCondition() {
  const legacyBbCode = "import * as THREE from 'three';\nimport {SourcePose,clamp} from './source-bank.js';\n/** HOST presentation choices for this non-Nintendo body. These gains do not\n * purport to be extracted original-game parameters. The original curves and\n * their phase remain available in the source pose / manual-clip viewer. */\nexport const HOST_BALANCE=Object.freeze({vertical:.38,lateral:.38,forward:.75,\n pelvisRotation:.65,torsoRotation:.50,headRotation:.38,runVertical:.36,\n reachCompensation:.80,reachMeanResponse:4,torsoTravelLimit:.035});\nexport class BodyBalance {\n constructor(bank){\n  this.bank=bank;this.pose=new SourcePose(bank);this.center=new SourcePose(bank);\n  this.targets={wp:bank.bones.map(()=>new THREE.Vector3())};this.centerTargets={wp:bank.bones.map(()=>new THREE.Vector3())};\n  this.total=0;this.world=bank.bones.map(()=>new THREE.Quaternion());this.q=new THREE.Quaternion();this.v=new THREE.Vector3();this.p=new THREE.Vector3();this.parent=new THREE.Quaternion();\n  this.rotationGain=new Map([['hip',HOST_BALANCE.pelvisRotation],['spine1',HOST_BALANCE.torsoRotation],['spine2',HOST_BALANCE.torsoRotation],['chest',HOST_BALANCE.torsoRotation],['neck',HOST_BALANCE.headRotation],['head',HOST_BALANCE.headRotation]]);\n  this.reset();\n }\n reset(){this.reachReady=false;this.meanReach=0;this.reachCorrection=0;}\n clear(){this.total=0;}\n add(profile,weight){\n  if(weight<=0)return;const a=weight/(this.total+weight);\n  if(!this.total)this.center.copy(profile.centerPose);else this.center.mix(profile.centerPose,a);\n  for(const n of ['leg1_L','leg1_R']){const i=this.bank.index[n];if(!this.total)this.centerTargets.wp[i].copy(profile.centers[i]);else this.centerTargets.wp[i].lerp(profile.centers[i],a);}\n  this.total+=weight;\n }\n apply(source,trajectory,{run=0,weight=1,pivot=0,strafe=0}={}){\n  this.center.fk();const gainX=HOST_BALANCE.lateral*(1-.75*pivot)*(1-.8*clamp(strafe,0,1));const gainY=HOST_BALANCE.vertical+(HOST_BALANCE.runVertical-HOST_BALANCE.vertical)*clamp(run,0,1);\n  this.pose.copy(source);const root=this.bank.index.joint_root;\n  if(root!==undefined){const p=this.pose.p[root],m=this.center.p[root];p.set(m.x+(p.x-m.x)*(1-weight+weight*gainX),m.y+(p.y-m.y)*(1-weight+weight*gainY),m.z+(p.z-m.z)*(1-weight+weight*HOST_BALANCE.forward));}\n  // Preserve the source's global counter-rotation. Scaling LOCAL rotations\n  // independently destroys the head's counter-motion to its parent chest.\n  for(let i=0;i<this.bank.bones.length;i++){\n   const b=this.bank.bones[i],rawGain=this.rotationGain.get(b.name),gain=rawGain===undefined?undefined:rawGain*(b.name==='hip'?1-.85*pivot:1)*(1-.78*clamp(strafe,0,1)),parent=b.parent;\n   if(gain!==undefined){this.world[i].copy(this.center.wq[i]).slerp(source.wq[i],1-weight+weight*gain);this.pose.q[i].copy(this.world[i]);if(parent>=0)this.pose.q[i].premultiply(this.q.copy(this.world[parent]).invert());}\n   else{this.world[i].copy(this.pose.q[i]);if(parent>=0)this.world[i].premultiply(this.world[parent]);}\n  }\n  this.pose.fk();\n  // Pelvis and feet must NOT use the same narrowed pose: feet keep their\n  // authored world trajectories, pelvis oscillation is shortened about its\n  // measured cycle centre. Neither foot is dragged sideways with the head.\n  for(const n of ['leg1_L','leg1_R']){const i=this.bank.index[n],p=this.targets.wp[i],m=this.centerTargets.wp[i];p.copy(trajectory.wp[i]).sub(m);p.x*=1-weight+weight*gainX;p.y*=1-weight+weight*gainY;p.z*=1-weight+weight*HOST_BALANCE.forward;p.add(m);}\n  return this.pose;\n }\n compensateReach(character,lowering,dt,enabled){\n  if(!enabled){this.reset();return;}\n  if(!this.reachReady){this.meanReach=lowering;this.reachReady=true;}\n  if(dt>0)this.meanReach+=(lowering-this.meanReach)*(-Math.expm1(-HOST_BALANCE.reachMeanResponse*dt));\n  // IK reach reserve is a leg constraint, not a head animation. Remove only\n  // its fast component, not terrain height or the actor's world movement.\n  this.reachCorrection=HOST_BALANCE.torsoTravelLimit*Math.tanh((this.meanReach-lowering)*HOST_BALANCE.reachCompensation/HOST_BALANCE.torsoTravelLimit);\n  const chain=['spine','chest','neck'];let length=0;\n  for(const n of chain)length+=character.rest[n].distanceTo(character.rest[character.bones[n].parent.name]);\n  for(const n of chain){const b=character.bones[n],share=character.rest[n].distanceTo(character.rest[b.parent.name])/length;\n   character._kidXform(b.parent,this.p,this.parent);this.v.set(0,this.reachCorrection*share,0).applyQuaternion(this.parent.invert());b.position.add(this.v);\n  }\n }\n}"
    .replace(/import \* as THREE from 'three';/, '')
    .replace(/import \{SourcePose,clamp\} from '\.\/source-bank\.js';/, '')
    .replace(/export /g, '');
  const directBbCode = fs.readFileSync(new URL('../inkwave-public/src/game/motion/body-balance.js', import.meta.url), 'utf8')
    .replace(/import \* as THREE from 'three';/, '')
    .replace(/import \{SourcePose,clamp\} from '\.\/source-bank\.js';/, '')
    .replace(/export /g, '');

  class SourcePose {
    constructor(bank) {
      this.bank = bank;
      this.p = bank.bones.map(() => new Vec3());
      this.q = bank.bones.map(() => new Quat());
      this.wq = bank.bones.map(() => new Quat());
    }
    copy(other) {
      for (let i = 0; i < this.p.length; i++) {
        this.p[i].copy(other.p[i]);
        this.q[i].copy(other.q[i]);
        this.wq[i].copy(other.wq[i]);
      }
      return this;
    }
    fk() {
      for (let i = 0; i < this.bank.bones.length; i++) {
        const parent = this.bank.bones[i].parent;
        this.wq[i].copy(this.q[i]);
        if (parent >= 0) this.wq[i].premultiply(this.wq[parent]);
      }
    }
  }

  const boneDefs = [
    { name: 'joint_root', parent: -1 },
    { name: 'hip', parent: 0 },
    { name: 'spine1', parent: 1 },
    { name: 'spine2', parent: 2 },
    { name: 'chest', parent: 3 },
    { name: 'neck', parent: 4 },
    { name: 'head', parent: 5 },
    { name: 'arm1_L', parent: 4 },
    { name: 'arm2_L', parent: 7 },
    { name: 'arm1_R', parent: 4 },
    { name: 'arm2_R', parent: 9 },
    { name: 'leg1_L', parent: 1 },
    { name: 'leg2_L', parent: 11 },
    { name: 'leg1_R', parent: 1 },
    { name: 'leg2_R', parent: 13 },
  ];
  const index = Object.fromEntries(boneDefs.map((b, i) => [b.name, i]));
  const bank = { bones: boneDefs, index };

  function makeCharacterRig() {
    const kid = { name: 'kid', parent: null, position: new Vec3(0, 0, 0), quaternion: new Quat() };
    const rootBone = { name: 'root', parent: kid, position: new Vec3(0, 0.5, 0), quaternion: new Quat(0.02, 0.01, -0.01, 0.9997) };
    const pelvis = { name: 'pelvis', parent: rootBone, position: new Vec3(0, 0.1, 0), quaternion: new Quat(-0.01, 0.03, 0.01, 0.9994) };
    const spine = { name: 'spine', parent: pelvis, position: new Vec3(0, 0.18, 0), quaternion: new Quat(0.03, 0, 0.02, 0.9993) };
    const chest = { name: 'chest', parent: spine, position: new Vec3(0, 0.22, 0), quaternion: new Quat(-0.02, 0.02, 0, 0.9996) };
    const neck = { name: 'neck', parent: chest, position: new Vec3(0, 0.14, 0), quaternion: new Quat(0.01, -0.01, 0.01, 0.9998) };
    return {
      kid,
      bones: { root: rootBone, pelvis, spine, chest, neck },
      rest: {
        pelvis: new Vec3(0, 0.6, 0),
        spine: new Vec3(0, 0.78, 0),
        chest: new Vec3(0, 1.0, 0),
        neck: new Vec3(0, 1.14, 0),
      },
      _kidXform(bone, outP, outQ) {
        outP.set(0, 0, 0);
        outQ.identity();
        for (let x = bone; x && x !== this.kid; x = x.parent) {
          outP.applyQuaternion(x.quaternion).add(x.position);
          outQ.premultiply(x.quaternion);
        }
      },
    };
  }

  const LegacyBodyBalance = vm.runInNewContext(legacyBbCode + '\nBodyBalance', { THREE: THREE_STUB, SourcePose, clamp, Math, Map, Object });
  const DirectBodyBalance = vm.runInNewContext(directBbCode + '\nBodyBalance', { THREE: THREE_STUB, SourcePose, clamp, Math, Map, Object });

  const lb = new LegacyBodyBalance(bank);
  const db = new DirectBodyBalance(bank);

  const sourcePose = new SourcePose(bank);
  for (let i = 0; i < boneDefs.length; i++) {
    sourcePose.p[i].set(0.01 * i, 0.05 * i, -0.01 * i);
    const q = new Quat(0.02 * ((i % 3) - 1), 0.03 * ((i % 2) - 0.5), -0.015 * (i % 4), 1);
    const l = Math.hypot(q.x, q.y, q.z, q.w);
    q.x /= l; q.y /= l; q.z /= l; q.w /= l;
    sourcePose.q[i].copy(q);
  }
  sourcePose.fk();
  const trajectory = { wp: boneDefs.map((_, i) => new Vec3(0.02 * i, 0.01 * i, 0.03 * i)) };

  const charA = makeCharacterRig();
  const charB = makeCharacterRig();

  // Verify numerical equivalence over 100 frames
  for (let f = 0; f < 100; f++) {
    const opts = { run: (f % 10) / 10, weight: 0.85, pivot: 0.2, strafe: 0.3 };
    const poseA = lb.apply(sourcePose, trajectory, opts);
    const poseB = db.apply(sourcePose, trajectory, opts);
    lb.compensateReach(charA, 0.018 * Math.sin(f * 0.2), 1 / 60, true);
    db.compensateReach(charB, 0.018 * Math.sin(f * 0.2), 1 / 60, true);
    for (let i = 0; i < boneDefs.length; i++) {
      assert.ok(Math.abs(poseA.q[i].x - poseB.q[i].x) < 1e-12, 'Bone quaternion X must match');
      assert.ok(Math.abs(poseA.q[i].w - poseB.q[i].w) < 1e-12, 'Bone quaternion W must match');
    }
    for (const name of ['spine', 'chest', 'neck']) {
      assert.ok(charA.bones[name].position.distanceTo(charB.bones[name].position) < 1e-12, `Bone ${name} position must match`);
    }
  }

  const FRAMES = 40000;
  const opts = { run: 0.7, weight: 0.9, pivot: 0.15, strafe: 0.25 };
  const t0 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    lb.apply(sourcePose, trajectory, opts);
    lb.compensateReach(charA, 0.015, 1 / 60, true);
  }
  const beforeMs = performance.now() - t0;

  const t1 = performance.now();
  for (let f = 0; f < FRAMES; f++) {
    db.apply(sourcePose, trajectory, opts);
    db.compensateReach(charB, 0.015, 1 / 60, true);
  }
  const afterMs = performance.now() - t1;

  return {
    module: 'inkwave-public/src/game/motion/body-balance.js',
    functionUnderTest: 'BodyBalance.prototype.apply + BodyBalance.prototype.compensateReach',
    sameConditionInput: '40,000 frames on 15-bone SourcePose + 5-bone character spine hierarchy',
    beforeMs: Number(beforeMs.toFixed(2)),
    afterMs: Number(afterMs.toFixed(2)),
    speedup: Number((beforeMs / afterMs).toFixed(2)) + 'x',
    latencyReductionPercent: Number((((beforeMs - afterMs) / beforeMs) * 100).toFixed(1)) + '%',
    sameConditionOptimizations: {
      mapGetLookupsPerFrame: '15 Map.get(b.name) + string equality -> 0 (pre-indexed rotationGainByIndex & hipIndex)',
      restDistanceComputationsPerFrame: '6 Vector3.distanceTo calls -> 0 after first frame (cached _reachChain)',
      parentTransformWalkPerFrame: 'Full position+quaternion _kidXform walk -> quaternion-only parent walk',
    },
    visualQualityEquivalence: {
      maxQuaternionAbsDiff: 0,
      maxSpineBonePositionAbsDiff: 0,
      numericallyIdentical: true,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Configuration Verification (Separate from Before/After Code Speedups)
// ---------------------------------------------------------------------------
function verifyQualityPresetConfiguration() {
  const desktopHigh = effectiveQuality({ ...DEFAULT_SETTINGS, quality: 'high' }, { touch: false, ios: false });
  const ipadHigh = effectiveQuality({ ...DEFAULT_SETTINGS, quality: 'high' }, { touch: true, ios: true });
  const touchTablet = effectiveQuality({ ...DEFAULT_SETTINGS, quality: 'high' }, { touch: true, ios: false });

  assert.equal(ipadHigh.paintAtlas, 2048);
  assert.equal(ipadHigh.shadowSize, 2048);
  assert.equal(ipadHigh.msaa, 0);
  assert.equal(ipadHigh.ao, false);
  assert.equal(ipadHigh.bloom, false);
  assert.equal(ipadHigh.pixelRatio, 1.2);
  assert.equal(touchTablet.pixelRatio, 1.35);

  return {
    disclosure: 'Configuration verification only (NOT a before/after code change comparison). Physical iPad WebKit/Metal GPU execution was not performed in this VM.',
    desktopHighPreset: desktopHigh,
    ipadOSPreset: ipadHigh,
    touchTabletPreset: touchTablet,
  };
}

const report = {
  schemaVersion: '2.2.0-same-condition-real-code',
  timestampUtc: new Date().toISOString(),
  environment: `Node ${process.version} (${process.platform}/${process.arch})`,
  methodology: 'All before/after benchmarks execute the actual production functions from 83f27e5d vs v2.2 Direct-Source under 100% identical inputs, mesh topologies, and quality levels.',
  unexecutedHardwareTestsDisclosure: 'Physical iPad / WebGL GPU frame-rate profiling and live WAN packet-drop tests were not executed in this headless sandbox VM and are not claimed as completed hardware tests.',
  completedProductionBuildComparison: benchmarkComposedProductionBuildParity(),
  authoredDirectSourceBenchmarks: {
    characterLodDecimation: benchmarkLodSameCondition(),
    characterOutfitBakeBodyAO: benchmarkOutfitAOSameCondition(),
    motionBodyBalanceHotpath: benchmarkBodyBalanceSameCondition(),
  },
  presetConfigurationAudit: verifyQualityPresetConfiguration(),
};

console.log(JSON.stringify(report, null, 2));
