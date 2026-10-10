// Original Wii U BFRES coefficients. No key resampling; no Catmull-Rom substitution.
import * as THREE from 'three';
export const mod = (x, n) => ((x % n) + n) % n;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const STRIDE = 10, CURVE = 10;

/** Evaluate the normalized-segment polynomial stored by BFRES, in double precision. */
export function curveValue(data, o, frame) {
  const flags = data[o + 1], kind = (flags >> 4) & 7;
  const fo = data[o + 7], n = data[o + 8], ko = data[o + 9];
  frame = clamp(frame, data[fo], data[fo + n - 1]);
  let lo = 0, hi = n;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (data[fo + mid] <= frame) lo = mid + 1; else hi = mid; }
  const i = Math.max(0, lo - 1);
  const u = i + 1 < n ? (frame - data[fo + i]) / (data[fo + i + 1] - data[fo + i]) : 0;
  let v;
  if (kind === 0) { const j = ko + i * 4; v = ((data[j + 3] * u + data[j + 2]) * u + data[j + 1]) * u + data[j]; }
  else if (kind === 1) { const j = ko + i * 2; v = data[j] + data[j + 1] * u; }
  else if (kind === 2) v = data[ko + i] + (i + 1 < n ? (data[ko + i + 1] - data[ko + i]) * u : 0);
  else if ([4, 5, 6, 7].includes(kind)) v = data[ko + i];
  else throw new RangeError(`Unsupported BFRES curve kind ${kind}`);
  return v * data[o + 4] + data[o + 5];
}

export class SourcePose {
  constructor(bank) {
    this.bank = bank; this.raw = new Float64Array(bank.bones.length * STRIDE);
    this.p = bank.bones.map(() => new THREE.Vector3()); this.q = bank.bones.map(() => new THREE.Quaternion());
    this.s = bank.bones.map(() => new THREE.Vector3(1, 1, 1)); this.world = bank.bones.map(() => new THREE.Matrix4());
    this.wp = bank.bones.map(() => new THREE.Vector3()); this.wq = bank.bones.map(() => new THREE.Quaternion());
    this.flags = Uint32Array.from(bank.bones, b => b.flags); this.euler = new THREE.Euler(0, 0, 0, 'ZYX');
    this.local = new THREE.Matrix4(); this.rest();
  }
  rest() {
    for (let i = 0; i < this.bank.bones.length; i++) {
      const b = this.bank.bones[i]; this.raw.set([...b.scale, ...b.translation, ...b.rotation], i * STRIDE);
      this.flags[i] = b.flags;
    }
    return this.fromRaw('eulerXYZ');
  }
  fromRaw(mode) {
    for (let i = 0; i < this.bank.bones.length; i++) {
      const j = i * STRIDE, r = this.raw;
      this.s[i].set(r[j], r[j + 1], r[j + 2]); this.p[i].set(r[j + 3], r[j + 4], r[j + 5]);
      // BFRES applies X, then Y, then Z to COLUMN vectors => Rz*Ry*Rx, Three's ZYX.
      if (mode === 'eulerXYZ') this.q[i].setFromEuler(this.euler.set(r[j + 6], r[j + 7], r[j + 8], 'ZYX'));
      else if (mode === 'quaternion') this.q[i].set(r[j + 6], r[j + 7], r[j + 8], r[j + 9]).normalize();
      else throw new Error(`Unsupported rotation mode ${mode}`);
    }
    return this.fk();
  }
  // Copies local TRS only. Call fk() after composing/blending, before accessing world/wp/wq.
  copy(other) {
    for (let i = 0; i < this.p.length; i++) { this.p[i].copy(other.p[i]); this.q[i].copy(other.q[i]); this.s[i].copy(other.s[i]); this.flags[i] = other.flags[i]; }
    return this;
  }
  mix(other, weight) {
    weight = clamp(weight, 0, 1);
    for (let i = 0; i < this.p.length; i++) { this.p[i].lerp(other.p[i], weight); this.q[i].slerp(other.q[i], weight); this.s[i].lerp(other.s[i], weight); }
    return this;
  }
  fk() {
    const bones = this.bank.bones;
    for (let i = 0; i < bones.length; i++) {
      const parent = bones[i].parent, m = this.local.compose(this.p[i], this.q[i], this.s[i]);
      // Maya segment-scale compensation: Parent * T * inverse(parent LOCAL scale) * R * S.
      if (parent >= 0 && (this.flags[i] & (1 << 23))) {
        const ps = this.s[parent], e = m.elements;
        const x = Math.abs(ps.x) > 1e-12 ? 1 / ps.x : 0;
        const y = Math.abs(ps.y) > 1e-12 ? 1 / ps.y : 0;
        const z = Math.abs(ps.z) > 1e-12 ? 1 / ps.z : 0;
        for (const k of [0, 4, 8]) e[k] *= x;
        for (const k of [1, 5, 9]) e[k] *= y;
        for (const k of [2, 6, 10]) e[k] *= z;
      }
      if (parent >= 0) { this.world[i].multiplyMatrices(this.world[parent], m); this.wq[i].copy(this.wq[parent]).multiply(this.q[i]).normalize(); }
      else { this.world[i].copy(m); this.wq[i].copy(this.q[i]); }
      this.wp[i].setFromMatrixPosition(this.world[i]);
    }
    return this;
  }
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
    this.rest = new SourcePose(this); this.profiles = new Map(Object.entries(meta.profiles || {}));
  }
  sample(name, frame, out, loop = undefined) {
    const c = typeof name === 'string' ? this.clips.get(name) : name;
    if (!c) throw new Error(`Missing source clip: ${name}`);
    if (!Number.isFinite(frame)) throw new RangeError('Nonfinite source frame');
    frame = (loop ?? c.loop) && c.frames > 0 ? mod(frame, c.frames) : clamp(frame, 0, c.frames);
    out.raw.set(this.data.subarray(c.base, c.base + out.raw.length));
    for (let i = 0; i < c.curveCount; i++) {
      const o = c.curves + i * CURVE, dst = this.data[o];
      // Preserve unbound tracks in the bank and oracle, but do not invent their missing skeleton.
      if (dst >= 0) out.raw[dst] = curveValue(this.data, o, frame);
    }
    out.flags.set(c.boneFlags);
    return out.fromRaw(c.rotationMode);
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