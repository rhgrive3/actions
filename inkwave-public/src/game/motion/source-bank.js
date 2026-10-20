import * as THREE from 'three';
export const mod = (x, n) => ((x % n) + n) % n;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const STRIDE = 10, CURVE = 10;

/** Evaluate the normalized-segment polynomial stored by BFRES, in double precision. */
export function curveValue(data, o, frame) {
  const fo = data[o + 7], n = data[o + 8];
  frame = clamp(frame, data[fo], data[fo + n - 1]);
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (data[fo + mid] <= frame) lo = mid + 1; else hi = mid; }
  return segmentValue(data, o, frame, Math.max(0, lo - 1));
}
function segmentValue(data, o, frame, i) {
  const kind = (data[o + 1] >> 4) & 7, fo = data[o + 7], n = data[o + 8], ko = data[o + 9];
  const u = i + 1 < n ? (frame - data[fo + i]) / (data[fo + i + 1] - data[fo + i]) : 0;
  let v;
  if (kind === 0) { const j = ko + i * 4; v = ((data[j + 3] * u + data[j + 2]) * u + data[j + 1]) * u + data[j]; }
  else if (kind === 1) { const j = ko + i * 2; v = data[j] + data[j + 1] * u; }
  else if (kind === 2) v = data[ko + i] + (i + 1 < n ? (data[ko + i + 1] - data[ko + i]) * u : 0);
  else if (kind >= 4 && kind <= 7) v = data[ko + i];
  else throw new RangeError(`Unsupported BFRES curve kind ${kind}`);
  return v * data[o + 4] + data[o + 5];
}
// BFRES applies X, then Y, then Z to COLUMN vectors => Rz*Ry*Rx, Three's ZYX.
// Native Three.js ZYX formula; exact sin(±0)/cos(±0) are reused.
function eulerZYX(q, rx, ry, rz) {
  const x = rx / 2, y = ry / 2, z = rz / 2;
  const c1=x===0?1:Math.cos(x),c2=y===0?1:Math.cos(y),c3=z===0?1:Math.cos(z);
  const s1=x===0?x:Math.sin(x),s2=y===0?y:Math.sin(y),s3=z===0?z:Math.sin(z);
  q.set(s1*c2*c3-c1*s2*s3,c1*s2*c3+s1*c2*s3,c1*c2*s3-s1*s2*c3,c1*c2*c3+s1*s2*s3);
}
function rotationFromRaw(q, mode, r, j) {
  if (mode === 'eulerXYZ') eulerZYX(q, r[j + 6], r[j + 7], r[j + 8]);
  else if (mode === 'quaternion') q.set(r[j + 6], r[j + 7], r[j + 8], r[j + 9]).normalize();
  else throw new Error(`Unsupported rotation mode ${mode}`);
}

export class SourcePose {
  constructor(bank) {
    this.bank = bank; this.raw = new Float64Array(bank.bones.length * STRIDE);
    this.p = bank.bones.map(() => new THREE.Vector3()); this.q = bank.bones.map(() => new THREE.Quaternion());
    this.s = bank.bones.map(() => new THREE.Vector3(1, 1, 1)); this.world = bank.bones.map(() => new THREE.Matrix4());
    this.wp = bank.bones.map(() => new THREE.Vector3()); this.wq = bank.bones.map(() => new THREE.Quaternion());
    this.flags = Uint32Array.from(bank.bones, b => b.flags); this.euler = new THREE.Euler(0, 0, 0, 'ZYX');
    this.local = new THREE.Matrix4(); this.segments = new Map(); this.rest();
  }
  rest() {
    for (let i = 0; i < this.bank.bones.length; i++) {
      const b = this.bank.bones[i]; this.raw.set([...b.scale, ...b.translation, ...b.rotation], i * STRIDE);
      this.flags[i] = b.flags;
    }
    return this.fromRaw('eulerXYZ');
  }
  /** doFk: false skips FK, true evaluates every bone, and a positive count
   *  evaluates only that leading bone range (see SourceBank.fkCount). */
  fromRaw(mode, doFk = true) {
    const n = this.bank.bones.length, r = this.raw;
    for (let i = 0; i < n; i++) {
      const j = i * STRIDE;
      this.s[i].set(r[j], r[j + 1], r[j + 2]); this.p[i].set(r[j + 3], r[j + 4], r[j + 5]);
      rotationFromRaw(this.q[i], mode, r, j);
    }
    if (mode === 'eulerXYZ' && n > 0) this._lastEuler(r);
    return doFk ? this.fk(doFk) : this;
  }
  _lastEuler(r) {
    const j = (this.bank.bones.length - 1) * STRIDE, e = this.euler;
    e._x = r[j + 6]; e._y = r[j + 7]; e._z = r[j + 8]; e._order = 'ZYX';
  }
  // Copies local TRS only. Call fk() after composing/blending, before accessing world/wp/wq.
  // `count` limits copy/mix to bones [0, count), like fk(count).
  copy(other, count = true) {
    const n = typeof count === 'number' ? Math.min(this.p.length, count) : this.p.length;
    for (let i = 0; i < n; i++) { this.p[i].copy(other.p[i]); this.q[i].copy(other.q[i]); this.s[i].copy(other.s[i]); this.flags[i] = other.flags[i]; }
    return this;
  }
  mix(other, weight, count = true) {
    weight = clamp(weight, 0, 1);
    const n = typeof count === 'number' ? Math.min(this.p.length, count) : this.p.length;
    for (let i = 0; i < n; i++) { this.p[i].lerp(other.p[i], weight); this.q[i].slerp(other.q[i], weight); this.s[i].lerp(other.s[i], weight); }
    return this;
  }
  /** World transforms. `count` limits evaluation to bones [0, count); with the
   *  bank's parent-before-child order those bones need nothing outside the range.
   *  Bones past `count` keep their previous world values. The arithmetic and
   *  its order are Matrix4.compose / multiplyMatrices and Quaternion.multiply /
   *  normalize, written out so no intermediate object calls are made. */
  fk(count = true) {
    const bones = this.bank.bones, all = bones.length;
    const n = typeof count === 'number' && this.bank.parentsFirst ? Math.min(all, count) : all;
    const te = this.local.elements, P = this.p, Q = this.q, S = this.s, W = this.world, WP = this.wp, WQ = this.wq, flags = this.flags;
    for (let i = 0; i < n; i++) {
      const parent = bones[i].parent, q = Q[i], sc = S[i], pos = P[i];
      const x = q._x, y = q._y, z = q._z, w = q._w;
      const x2 = x + x, y2 = y + y, z2 = z + z;
      const xx = x * x2, xy = x * y2, xz = x * z2;
      const yy = y * y2, yz = y * z2, zz = z * z2;
      const wx = w * x2, wy = w * y2, wz = w * z2;
      const sx = sc.x, sy = sc.y, sz = sc.z;
      te[0] = (1 - (yy + zz)) * sx; te[1] = (xy + wz) * sx; te[2] = (xz - wy) * sx; te[3] = 0;
      te[4] = (xy - wz) * sy; te[5] = (1 - (xx + zz)) * sy; te[6] = (yz + wx) * sy; te[7] = 0;
      te[8] = (xz + wy) * sz; te[9] = (yz - wx) * sz; te[10] = (1 - (xx + yy)) * sz; te[11] = 0;
      te[12] = pos.x; te[13] = pos.y; te[14] = pos.z; te[15] = 1;
      const out = W[i].elements, wq = WQ[i];
      if (parent >= 0) {
        // Maya segment-scale compensation: Parent * T * inverse(parent LOCAL scale) * R * S.
        const ps = S[parent];
        if ((flags[i] & (1 << 23)) && (ps.x !== 1 || ps.y !== 1 || ps.z !== 1)) {
          const ix = Math.abs(ps.x) > 1e-12 ? 1 / ps.x : 0;
          const iy = Math.abs(ps.y) > 1e-12 ? 1 / ps.y : 0;
          const iz = Math.abs(ps.z) > 1e-12 ? 1 / ps.z : 0;
          te[0] *= ix; te[4] *= ix; te[8] *= ix;
          te[1] *= iy; te[5] *= iy; te[9] *= iy;
          te[2] *= iz; te[6] *= iz; te[10] *= iz;
        }
        const ae = W[parent].elements;
        const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
        const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
        const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
        const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
        const b11 = te[0], b12 = te[4], b13 = te[8], b14 = te[12];
        const b21 = te[1], b22 = te[5], b23 = te[9], b24 = te[13];
        const b31 = te[2], b32 = te[6], b33 = te[10], b34 = te[14];
        const b41 = te[3], b42 = te[7], b43 = te[11], b44 = te[15];
        out[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
        out[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
        out[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
        out[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
        out[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
        out[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
        out[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
        out[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
        out[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
        out[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
        out[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
        out[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
        out[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
        out[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
        out[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
        out[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
        const pq = WQ[parent], qax = pq._x, qay = pq._y, qaz = pq._z, qaw = pq._w;
        let rx = qax * w + qaw * x + qay * z - qaz * y;
        let ry = qay * w + qaw * y + qaz * x - qax * z;
        let rz = qaz * w + qaw * z + qax * y - qay * x;
        let rw = qaw * w - qax * x - qay * y - qaz * z;
        let l = Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw);
        if (l === 0) { rx = 0; ry = 0; rz = 0; rw = 1; }
        else { l = 1 / l; rx = rx * l; ry = ry * l; rz = rz * l; rw = rw * l; }
        wq._x = rx; wq._y = ry; wq._z = rz; wq._w = rw; wq._onChangeCallback();
      } else {
        for (let k = 0; k < 16; k++) out[k] = te[k];
        wq._x = x; wq._y = y; wq._z = z; wq._w = w; wq._onChangeCallback();
      }
      const v = WP[i]; v.x = out[12]; v.y = out[13]; v.z = out[14];
    }
    return this;
  }
}

/** Per clip, sampling-invariant facts: which curves are bound and whether each
 *  bone's rotation is animated. Unanimated rotations come from the clip's base
 *  pose only, so their quaternion is evaluated once with the same formula. */
function clipLayout(bank, c) {
  const data = bank.data, n = bank.bones.length, rotCh = c.rotationMode === 'quaternion' ? 4 : 3;
  const animated = new Uint8Array(n), dst = new Int32Array(c.curveCount), sorted = new Uint8Array(c.curveCount);
  for (let i = 0; i < c.curveCount; i++) {
    const o = c.curves + i * CURVE, d = data[o]; dst[i] = d;
    if (d >= 0) { const ch = d % STRIDE; if (ch >= 6 && ch < 6 + rotCh) animated[Math.floor(d / STRIDE)] = 1; }
    const fo = data[o + 7], m = data[o + 8]; let ok = true;
    for (let k = 1; k < m && ok; k++) ok = data[fo + k - 1] <= data[fo + k];
    sorted[i] = ok ? 1 : 0;
  }
  const raw = new Float64Array(n * STRIDE); raw.set(data.subarray(c.base, c.base + raw.length));
  const fixed = [], q = new THREE.Quaternion();
  for (let b = 0; b < n; b++) {
    if (animated[b]) { fixed.push(null); continue; }
    rotationFromRaw(q, c.rotationMode, raw, b * STRIDE); fixed.push([q._x, q._y, q._z, q._w]);
  }
  return {dst, sorted, fixed};
}

export class SourceBank {
  constructor(meta, buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== meta.byteLength || buffer.byteLength % 4) throw new Error('Source motion binary size mismatch');
    this.meta = meta; this.data = new Float32Array(buffer); this.bones = meta.bones;
    this.index = Object.fromEntries(this.bones.map((b, i) => [b.name, i])); this.clips = new Map(meta.clips.map(c => [c.name, c]));
    for (const c of meta.clips) {
      if (c.base < 0 || c.base + this.bones.length * STRIDE > this.data.length || c.curves < 0 || c.curves + c.curveCount * CURVE > this.data.length) throw new Error(`Invalid clip offsets: ${c.name}`);
      for (let i = 0; i < c.curveCount; i++) {
        const o = c.curves + i * CURVE, f = this.data[o + 7], n = this.data[o + 8], k = this.data[o + 9];
        const kind = (this.data[o + 1] >> 4) & 7, width = kind === 0 ? 4 : kind === 1 ? 2 : 1;
        if (n < 1 || f < 0 || f + n > this.data.length || k < 0 || k + n * width > this.data.length) throw new Error('Invalid curve span');
      }
    }
    this.parentsFirst = this.bones.every((b, i) => b.parent < i);
    this.layouts = new Map();
    this.rest = new SourcePose(this); this.profiles = new Map(Object.entries(meta.profiles || {}));
  }
  /** Bone count whose leading-range FK covers `names` and all their ancestors. */
  fkCount(names) {
    if (!this.parentsFirst) return true;
    let n = 0;
    for (const name of names) { const i = this.index[name]; if (i !== undefined) n = Math.max(n, i + 1); }
    return n || true;
  }
  sample(name, frame, out, loop = undefined, doFk = true) {
    const c = typeof name === 'string' ? this.clips.get(name) : name;
    if (!c) throw new Error(`Missing source clip: ${name}`);
    if (!Number.isFinite(frame)) throw new RangeError('Nonfinite source frame');
    frame = (loop ?? c.loop) && c.frames > 0 ? mod(frame, c.frames) : clamp(frame, 0, c.frames);
    let layout = this.layouts.get(c);
    if (!layout) { layout = clipLayout(this, c); this.layouts.set(c, layout); }
    const data = this.data, raw = out.raw;
    raw.set(data.subarray(c.base, c.base + raw.length));
    // Each output pose remembers the last key segment per curve; playback
    // normally stays in, or steps to the next, segment. The hint is only used
    // when it is exactly the segment the binary search would select.
    const segments = out.segments || (out.segments = new Map());
    let seg = segments.get(c);
    if (!seg) { seg = new Int32Array(c.curveCount).fill(-1); segments.set(c, seg); }
    const {dst, sorted} = layout;
    for (let i = 0; i < c.curveCount; i++) {
      const d = dst[i];
      // Preserve unbound tracks in the bank and oracle, but do not invent their missing skeleton.
      if (d < 0) continue;
      const o = c.curves + i * CURVE;
      if (!sorted[i]) { raw[d] = curveValue(data, o, frame); continue; }
      const fo = data[o + 7], n = data[o + 8];
      const f = clamp(frame, data[fo], data[fo + n - 1]);
      let k = seg[i];
      if (!(k >= 0 && data[fo + k] <= f && (k + 1 >= n || data[fo + k + 1] > f))) {
        k++;
        if (!(k >= 1 && k < n && data[fo + k] <= f && (k + 1 >= n || data[fo + k + 1] > f))) {
          let lo = 0, hi = n;
          while (lo < hi) { const mid = (lo + hi) >>> 1; if (data[fo + mid] <= f) lo = mid + 1; else hi = mid; }
          k = Math.max(0, lo - 1);
        }
        seg[i] = k;
      }
      raw[d] = segmentValue(data, o, f, k);
    }
    out.flags.set(c.boneFlags);
    const mode = c.rotationMode, fixed = layout.fixed, n = this.bones.length;
    for (let i = 0; i < n; i++) {
      const j = i * STRIDE;
      out.s[i].set(raw[j], raw[j + 1], raw[j + 2]); out.p[i].set(raw[j + 3], raw[j + 4], raw[j + 5]);
      const q = fixed[i];
      if (q) out.q[i].set(q[0], q[1], q[2], q[3]);
      else rotationFromRaw(out.q[i], mode, raw, j);
    }
    if (mode === 'eulerXYZ' && n > 0) out._lastEuler(raw);
    return doFk ? out.fk(doFk) : out;
  }
  /** Data-derived contact landmarks and stride, not alleged Nintendo contact flags/speeds. */
  profile(name) {
    if (this.profiles.has(name)) return this.profiles.get(name);
    const clip = this.clips.get(name); if (!clip) return null;
    const pose = new SourcePose(this), n = Math.max(8, Math.ceil(clip.frames * 4));
    const sides = ['L', 'R'], tracks = sides.map(() => []), heights = sides.map(() => []), features = sides.map(() => []);
    for (let i = 0; i < n; i++) {
      this.sample(clip, i / n * clip.frames, pose, true);
      for (let j = 0; j < 2; j++) {
        const f = this.index['foot_' + sides[j]], t = this.index['toe_' + sides[j]];
        if (f === undefined) continue;
        const fy=pose.wp[f].y-this.rest.wp[f].y, ty=t===undefined?fy:pose.wp[t].y-this.rest.wp[t].y;
        const toe=ty<fy;tracks[j].push(pose.wp[toe?t:f].clone());heights[j].push(Math.min(fy,ty));features[j].push(toe);
      }
    }
    const back = name.includes('Back'), left = name.includes('Left'), right = name.includes('Right');
    const axis = new THREE.Vector3(left ? 1 : right ? -1 : 0, 0, left || right ? 0 : back ? -1 : 1);
    const feet = tracks.map((p, side) => {
      if (!p.length) return {min:0,max:0,range:0,contact:[],strike:0};
      const ys = heights[side], min = Math.min(...ys), max = Math.max(...ys), range = max - min;
      // The midpoint between airborne and low samples is NOT the ground: it plants a still-swinging foot.
      // Infer the stable floor band robustly from the lowest quartile, keeping this HOST estimator explicit.
      const ordered=[...ys].sort((a,b)=>a-b), floor=ordered.slice(0,Math.max(4,Math.ceil(n/4)));
      const median=a=>a[Math.floor(a.length/2)], floorCenter=median(floor);
      const deviations=floor.map(y=>Math.abs(y-floorCenter)).sort((a,b)=>a-b);
      const threshold=floorCenter+Math.max(6*median(deviations),range*0.02,1e-6);
      const contact = ys.map(y=>range<1e-6 || y<=threshold);
      // Close only sub-frame holes caused by quantized authored floor-height noise.
      const before=[...contact];for(let i=0;i<n;i++)if(!before[i]&&before[(i+n-1)%n]&&before[(i+1)%n])contact[i]=true;
      let strike=0, best=-Infinity; const speeds=[];
      for(let i=0;i<n;i++) {
        const j=(i+1)%n, v=p[j].clone().sub(p[i]).dot(axis)*n;
        if(contact[i]&&contact[j]&&features[side][i]===features[side][j]&&v<0)speeds.push(-v);
        if(contact[i]&&!contact[(i+n-1)%n] && p[i].dot(axis)>best){best=p[i].dot(axis);strike=i/n;}
      }
      speeds.sort((a,b)=>a-b);
      return {min,max,range,threshold,contact,strike,stride:speeds.length?speeds[Math.floor(speeds.length/2)]:0,heights:ys};
    });
    const strideValues=feet.map(f=>f.stride).filter(v=>v>1e-6);
    const profile={clip:name,samples:n,feet,axis:axis.toArray(),stride:strideValues.length?strideValues.reduce((a,b)=>a+b,0)/strideValues.length:0,method:'quarter-frame FK; robust lowest-quartile bind-relative foot/toe height band (6 MAD, 2% excursion floor); median same-landmark opposing stance velocity integrated over one cycle'};
    this.profiles.set(name,profile);return profile;
  }
}

// The source coefficient packs are lossless gzip byte splits, fetched only when a
// character actually requests a source rig. Startup/PWA precache intentionally
// keeps them outside the 5 MiB critical boot payload.
const SOURCE_ASSET_ROOT = () => new URL('../../../assets/source-motion/', import.meta.url);
const SHA = async bytes => {
  if (!globalThis.crypto?.subtle) return null;
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)),
    b => b.toString(16).padStart(2, '0')).join('');
};
const fetchBuffer = async relative => {
  const r = await fetch(new URL(relative, SOURCE_ASSET_ROOT()));
  if (!r.ok) throw new Error(`Motion asset ${relative}: HTTP ${r.status}`);
  return r.arrayBuffer();
};
async function inflateParts(partNames, expectedGzipHash, expectedBytes = undefined) {
  if (!Array.isArray(partNames) || !partNames.length || partNames.some(n=>!/^[A-Za-z0-9_.-]+$/.test(n)))
    throw new Error('Malformed motion pack part manifest');
  const chunks = await Promise.all(partNames.map(fetchBuffer));
  const byteLength = chunks.reduce((sum,chunk)=>sum+chunk.byteLength,0);
  if (expectedBytes !== undefined && byteLength !== expectedBytes) throw new Error('Compressed motion asset length mismatch');
  const merged = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) { merged.set(new Uint8Array(chunk),offset); offset += chunk.byteLength; }
  const digest = await SHA(merged.buffer);
  if (digest && expectedGzipHash && digest !== expectedGzipHash) throw new Error('Motion gzip hash mismatch');
  if (typeof DecompressionStream !== 'function') throw new Error('Browser does not support DecompressionStream(gzip)');
  const output = new Blob([merged]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(output).arrayBuffer();
}
let manifestPromise, catalogPromise;
const bankPromises = new Map();
function getManifest() {
  manifestPromise ||= fetch(new URL('manifest.json', SOURCE_ASSET_ROOT())).then(r=>{
    if(!r.ok) throw new Error(`Motion manifest HTTP ${r.status}`);
    return r.json();
  }).then(m=>{if(m.schema !== 'inkwave-source-motion-gzip-parts-v1')throw new Error('Unsupported source motion pack manifest');return m;})
    .catch(e=>{manifestPromise=undefined;throw e;});
  return manifestPromise;
}
export function loadSourceBank(variant = 'Player00') {
  if (!['Player00', 'Player01', 'Player_Squid'].includes(variant)) return Promise.reject(new Error(`Unknown source variant ${variant}`));
  if (!bankPromises.has(variant)) {
    catalogPromise ||= getManifest().then(async m=>{
      const buffer=await inflateParts(m.catalog.parts,m.catalog.gzipSha256);
      const catalog=JSON.parse(new TextDecoder().decode(buffer));
      if(catalog.format!=='INKWAVE-BFRES-1')throw new Error('Unsupported source motion catalog');
      return catalog;
    }).catch(e=>{catalogPromise=undefined;throw e;});
    bankPromises.set(variant, Promise.all([catalogPromise,getManifest()]).then(async ([catalog,m])=>{
      const meta=catalog.variants[variant];
      const entry=m.variants[variant];
      if(!meta||!entry)throw new Error(`Unknown source clip bank: ${variant}`);
      const data=await inflateParts(entry.parts,entry.gzipSha256,entry.compressedBytes);
      if(data.byteLength!==meta.byteLength)throw new Error('Source motion binary size mismatch');
      const hash=await SHA(data);
      if(hash&&hash!==meta.sha256)throw new Error('Motion binary SHA-256 mismatch');
      return new SourceBank(meta,data);
    }).catch(error=>{bankPromises.delete(variant);throw error;}));
  }
  return bankPromises.get(variant);
}
export async function preloadSourceMotion(variants=['Player00','Player_Squid']) { return Promise.all(variants.map(loadSourceBank)); }