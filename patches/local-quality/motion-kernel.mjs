// Zero-dependency Rust (#![no_std] + SIMD128) WebAssembly motion + scoring kernel bridge.
// Uses compact ID-indexed Wasm pose/clip/coverage tables, FinalizationRegistry slot/buffer
// recycling, fused locomotion batching, and exact JS-parity synchronization.

let wasmExports = null;
let wasmMemBuf = null;
let f32View = null;
let f64View = null;
let i32View = null;
let u32View = null;
let u8View = null;
let loadPromise = null;
let covOutPtr = 0;

const NATIVE_SIN = Math.sin;
const NATIVE_COS = Math.cos;
const NATIVE_SQRT = Math.sqrt;
const NATIVE_MIN = Math.min;
const NATIVE_MAX = Math.max;
const NATIVE_ACOS = Math.acos;

function refreshViews() {
  if (!wasmExports) return false;
  const buf = wasmExports.memory.buffer;
  if (buf !== wasmMemBuf) {
    wasmMemBuf = buf;
    f32View = new Float32Array(buf);
    f64View = new Float64Array(buf);
    i32View = new Int32Array(buf);
    u32View = new Uint32Array(buf);
    u8View = new Uint8Array(buf);
  }
  return true;
}

function allocBytes(bytes) {
  const ptr = wasmExports.wasm_alloc(bytes);
  if (!ptr) return 0;
  refreshViews();
  return ptr;
}

export function isMotionWasmReady() {
  return wasmExports !== null;
}

export function initMotionWasm(wasmUrlOrBytes) {
  if (wasmExports) return Promise.resolve(true);
  if (loadPromise) return loadPromise;
  const p = (async () => {
    try {
      let bytes;
      if (wasmUrlOrBytes instanceof Uint8Array || wasmUrlOrBytes instanceof ArrayBuffer) {
        bytes = wasmUrlOrBytes;
      } else {
        const url = wasmUrlOrBytes || new URL('./motion-kernel.wasm', import.meta.url);
        if (typeof fetch === 'function') {
          const res = await fetch(url);
          if (!res.ok) return false;
          bytes = await res.arrayBuffer();
        } else {
          return false;
        }
      }
      const { instance } = await WebAssembly.instantiate(bytes, {});
      wasmExports = instance.exports;
      refreshViews();
      covOutPtr = allocBytes(16);
      return true;
    } catch {
      loadPromise = null;
      return false;
    }
  })();
  loadPromise = p;
  return p;
}

if (
  typeof window !== 'undefined' &&
  typeof fetch === 'function' &&
  typeof WebAssembly === 'object' &&
  /^https?:/.test(import.meta.url)
) {
  initMotionWasm();
}

function mathUntouched() {
  return (
    Math.sin === NATIVE_SIN &&
    Math.cos === NATIVE_COS &&
    Math.sqrt === NATIVE_SQRT &&
    Math.min === NATIVE_MIN &&
    Math.max === NATIVE_MAX &&
    Math.acos === NATIVE_ACOS
  );
}

const protoEmptyCb = new WeakMap();
function getEmptyQuatCb(q0) {
  const proto = Object.getPrototypeOf(q0);
  if (!proto) return false;
  let cb = protoEmptyCb.get(proto);
  if (cb !== undefined) return cb;
  const protoCb = proto._onChangeCallback;
  cb =
    typeof protoCb === 'function' && /^[^{]*\{\s*\}$/.test(Function.prototype.toString.call(protoCb))
      ? protoCb
      : false;
  protoEmptyCb.set(proto, cb);
  return cb;
}

function hasDefaultQuatCallbacks(arr, count) {
  if (!count) return true;
  const emptyCb = getEmptyQuatCb(arr[0]);
  if (!emptyCb) return false;
  for (let i = 0; i < count; i++) {
    if (arr[i]._onChangeCallback !== emptyCb) return false;
  }
  return true;
}

const bankStates = new WeakMap();
const poseStates = new WeakMap();
const freePoseBuffersByBoneCount = new Map();

const poseFinalizer =
  typeof FinalizationRegistry === 'function'
    ? new FinalizationRegistry((meta) => {
        if (!wasmExports) return;
        wasmExports.unregister_pose(meta.id);
        let pool = freePoseBuffersByBoneCount.get(meta.n);
        if (!pool) {
          pool = [];
          freePoseBuffersByBoneCount.set(meta.n, pool);
        }
        pool.push(meta.bufs);
      })
    : null;

function getBankState(bank) {
  let st = bankStates.get(bank);
  if (st !== undefined) {
    if (!st) return null;
    if (bank.data !== st.dataRef || bank.data.length !== st.dataLen) return null;
    if (st.dataLen <= 4096) {
      refreshViews();
      f32View.set(bank.data, st.dataPtr >>> 2);
    }
    return st;
  }
  if (!wasmExports || !bank?.data || !Array.isArray(bank.bones)) return null;
  const dataLen = bank.data.length;
  const boneCount = bank.bones.length;
  const dataPtr = allocBytes(dataLen * 4);
  const parentsPtr = allocBytes(boneCount * 4);
  if (!dataPtr || !parentsPtr) {
    bankStates.set(bank, false);
    return null;
  }
  f32View.set(bank.data, dataPtr >>> 2);
  const parBase = parentsPtr >>> 2;
  for (let i = 0; i < boneCount; i++) i32View[parBase + i] = bank.bones[i].parent;
  st = {
    dataRef: bank.data,
    dataLen,
    dataPtr,
    parentsPtr,
    boneCount,
    clips: new Map(),
  };
  bankStates.set(bank, st);
  return st;
}

function getClipId(bank, st, clip, layout) {
  let cid = st.clips.get(clip);
  if (cid !== undefined) return cid;
  if (!wasmExports.can_register_clip()) {
    st.clips.set(clip, -1);
    return -1;
  }
  const cc = clip.curveCount;
  const n = st.boneCount;
  const dstPtr = allocBytes(Math.max(1, cc) * 4);
  const sortedPtr = allocBytes(Math.max(1, cc));
  const fixedMaskPtr = allocBytes(Math.max(1, n));
  const fixedQPtr = allocBytes(Math.max(1, n) * 4 * 8);
  if (!dstPtr || !sortedPtr || !fixedMaskPtr || !fixedQPtr) {
    st.clips.set(clip, -1);
    return -1;
  }
  if (cc > 0) {
    i32View.set(layout.dst, dstPtr >>> 2);
    u8View.set(layout.sorted, sortedPtr);
  }
  const qBase = fixedQPtr >>> 3;
  for (let i = 0; i < n; i++) {
    const fq = layout.fixed[i];
    if (fq) {
      u8View[fixedMaskPtr + i] = 1;
      const o = qBase + i * 4;
      f64View[o] = fq[0]; f64View[o + 1] = fq[1]; f64View[o + 2] = fq[2]; f64View[o + 3] = fq[3];
    } else {
      u8View[fixedMaskPtr + i] = 0;
    }
  }
  cid = wasmExports.register_clip(
    st.dataPtr, clip.base, clip.curves, cc, n,
    layout.coversClip ? 1 : 0,
    clip.rotationMode === 'quaternion' ? 1 : 0,
    dstPtr, sortedPtr, fixedMaskPtr, fixedQPtr,
  );
  st.clips.set(clip, cid);
  return cid;
}

function getPoseState(pose) {
  let ps = poseStates.get(pose);
  if (ps !== undefined) return ps || null;
  if (!wasmExports || !pose?.bank?.bones) return null;
  const st = getBankState(pose.bank);
  if (!st) return null;
  if (!wasmExports.can_register_pose()) {
    poseStates.set(pose, false);
    return null;
  }
  const n = st.boneCount;
  const pool = freePoseBuffersByBoneCount.get(n);
  let bufs = pool && pool.length > 0 ? pool.pop() : null;
  if (!bufs) {
    const rawPtr = allocBytes(n * 10 * 8);
    const pPtr = allocBytes(n * 3 * 8);
    const qPtr = allocBytes(n * 4 * 8);
    const sPtr = allocBytes(n * 3 * 8);
    const flagsPtr = allocBytes(n * 4);
    const worldPtr = allocBytes(n * 16 * 8);
    const wpPtr = allocBytes(n * 3 * 8);
    const wqPtr = allocBytes(n * 4 * 8);
    if (!rawPtr || !pPtr || !qPtr || !sPtr || !flagsPtr || !worldPtr || !wpPtr || !wqPtr) {
      poseStates.set(pose, false);
      return null;
    }
    bufs = { rawPtr, pPtr, qPtr, sPtr, flagsPtr, worldPtr, wpPtr, wqPtr };
  }
  const id = wasmExports.register_pose(
    st.parentsPtr, bufs.rawPtr, bufs.pPtr, bufs.qPtr, bufs.sPtr,
    bufs.flagsPtr, bufs.worldPtr, bufs.wpPtr, bufs.wqPtr, n,
  );
  if (id < 0) {
    let p2 = freePoseBuffersByBoneCount.get(n);
    if (!p2) { p2 = []; freePoseBuffersByBoneCount.set(n, p2); }
    p2.push(bufs);
    poseStates.set(pose, false);
    return null;
  }
  ps = {
    id, n, st,
    rawPtr: bufs.rawPtr,
    pPtr: bufs.pPtr,
    qPtr: bufs.qPtr,
    sPtr: bufs.sPtr,
    flagsPtr: bufs.flagsPtr,
    worldPtr: bufs.worldPtr,
    wpPtr: bufs.wpPtr,
    wqPtr: bufs.wqPtr,
    segs: new Map(),
  };
  poseStates.set(pose, ps);
  if (poseFinalizer) poseFinalizer.register(pose, { id, n, bufs });
  return ps;
}

function getSegPtr(ps, clip) {
  let segPtr = ps.segs.get(clip);
  if (segPtr !== undefined) return segPtr;
  const cc = Math.max(1, clip.curveCount);
  segPtr = allocBytes(cc * 4);
  if (!segPtr) return 0;
  const base = segPtr >>> 2;
  for (let i = 0; i < cc; i++) i32View[base + i] = -1;
  ps.segs.set(clip, segPtr);
  return segPtr;
}

function downloadLocalFromWasm(pose, ps, count) {
  const P = pose.p, Q = pose.q, S = pose.s;
  const pBase = ps.pPtr >>> 3;
  const qBase = ps.qPtr >>> 3;
  const sBase = ps.sPtr >>> 3;
  for (let i = 0; i < count; i++) {
    const p3 = pBase + i * 3, q4 = qBase + i * 4, s3 = sBase + i * 3;
    const pv = P[i], qv = Q[i], sv = S[i];
    pv.x = f64View[p3]; pv.y = f64View[p3 + 1]; pv.z = f64View[p3 + 2];
    qv._x = f64View[q4]; qv._y = f64View[q4 + 1]; qv._z = f64View[q4 + 2]; qv._w = f64View[q4 + 3];
    sv.x = f64View[s3]; sv.y = f64View[s3 + 1]; sv.z = f64View[s3 + 2];
  }
}

function downloadWpWqFromWasm(pose, ps, count) {
  const WP = pose.wp, WQ = pose.wq;
  const wpBase = ps.wpPtr >>> 3;
  const wqBase = ps.wqPtr >>> 3;
  for (let i = 0; i < count; i++) {
    const p3 = wpBase + i * 3, q4 = wqBase + i * 4;
    const wp = WP[i], wq = WQ[i];
    wp.x = f64View[p3]; wp.y = f64View[p3 + 1]; wp.z = f64View[p3 + 2];
    wq._x = f64View[q4]; wq._y = f64View[q4 + 1]; wq._z = f64View[q4 + 2]; wq._w = f64View[q4 + 3];
  }
}

function downloadWorldFromWasm(pose, ps, count, skipWorldMat) {
  downloadWpWqFromWasm(pose, ps, count);
  if (skipWorldMat) return;
  const W = pose.world;
  const wBase = ps.worldPtr >>> 3;
  for (let i = 0; i < count; i++) {
    const w16 = wBase + i * 16;
    const we = W[i].elements;
    we[0] = f64View[w16]; we[1] = f64View[w16 + 1]; we[2] = f64View[w16 + 2]; we[3] = f64View[w16 + 3];
    we[4] = f64View[w16 + 4]; we[5] = f64View[w16 + 5]; we[6] = f64View[w16 + 6]; we[7] = f64View[w16 + 7];
    we[8] = f64View[w16 + 8]; we[9] = f64View[w16 + 9]; we[10] = f64View[w16 + 10]; we[11] = f64View[w16 + 11];
    we[12] = f64View[w16 + 12]; we[13] = f64View[w16 + 13]; we[14] = f64View[w16 + 14]; we[15] = f64View[w16 + 15];
  }
}

// Pure JS fast-path copy (zero Wasm boundary crossing, zero subarray allocation, zero staleness)
export function fastCopyPose(dst, src, count) {
  if (count <= 0 || !hasDefaultQuatCallbacks(dst.q, count)) return false;
  if (dst === src) return true;
  const dp = dst.p, dq = dst.q, ds = dst.s, df = dst.flags;
  const sp = src.p, sq = src.q, ss = src.s, sf = src.flags;
  for (let i = 0; i < count; i++) {
    const a = dp[i], b = sp[i]; a.x = b.x; a.y = b.y; a.z = b.z;
    const aq = dq[i], bq = sq[i]; aq._x = bq._x; aq._y = bq._y; aq._z = bq._z; aq._w = bq._w;
    const as = ds[i], bs = ss[i]; as.x = bs.x; as.y = bs.y; as.z = bs.z;
    df[i] = sf[i];
  }
  return true;
}

// Pure JS fast-path pose mix (zero Wasm boundary, zero _onChangeCallback, fast small-angle nlerp + exact slerp)
export function fastMixPose(dst, src, weight, count) {
  if (count <= 0 || weight <= 0) return true;
  if (!hasDefaultQuatCallbacks(dst.q, count)) return false;
  if (dst === src) return true;
  const dp = dst.p, dq = dst.q, ds = dst.s;
  const sp = src.p, sq = src.q, ss = src.s;
  if (weight >= 1) {
    for (let i = 0; i < count; i++) {
      const a = dp[i], b = sp[i]; a.x = b.x; a.y = b.y; a.z = b.z;
      const aq = dq[i], bq = sq[i]; aq._x = bq._x; aq._y = bq._y; aq._z = bq._z; aq._w = bq._w;
      const as = ds[i], bs = ss[i]; as.x = bs.x; as.y = bs.y; as.z = bs.z;
    }
    return true;
  }
  const t = weight, invT = 1 - t;
  for (let i = 0; i < count; i++) {
    const a = dp[i], b = sp[i];
    a.x += (b.x - a.x) * t;
    a.y += (b.y - a.y) * t;
    a.z += (b.z - a.z) * t;
    const as = ds[i], bs = ss[i];
    as.x += (bs.x - as.x) * t;
    as.y += (bs.y - as.y) * t;
    as.z += (bs.z - as.z) * t;
    const aq = dq[i], bq = sq[i];
    let ax = aq._x, ay = aq._y, az = aq._z, aw = aq._w;
    let bx = bq._x, by = bq._y, bz = bq._z, bw = bq._w;
    let dot = ax * bx + ay * by + az * bz + aw * bw;
    if (dot < 0) {
      dot = -dot;
      bx = -bx; by = -by; bz = -bz; bw = -bw;
    }
    if (dot >= 0.9995) {
      const rx = ax + (bx - ax) * t;
      const ry = ay + (by - ay) * t;
      const rz = az + (bz - az) * t;
      const rw = aw + (bw - aw) * t;
      const lenSq = rx * rx + ry * ry + rz * rz + rw * rw;
      if (lenSq > 0) {
        const invLen = 1 / Math.sqrt(lenSq);
        aq._x = rx * invLen; aq._y = ry * invLen; aq._z = rz * invLen; aq._w = rw * invLen;
      } else {
        aq._x = 0; aq._y = 0; aq._z = 0; aq._w = 1;
      }
    } else {
      const sqrSin = 1 - dot * dot;
      if (sqrSin <= Number.EPSILON) {
        const rx = ax * invT + bx * t;
        const ry = ay * invT + by * t;
        const rz = az * invT + bz * t;
        const rw = aw * invT + bw * t;
        const lenSq = rx * rx + ry * ry + rz * rz + rw * rw;
        if (lenSq > 0) {
          const invLen = 1 / Math.sqrt(lenSq);
          aq._x = rx * invLen; aq._y = ry * invLen; aq._z = rz * invLen; aq._w = rw * invLen;
        } else {
          aq._x = 0; aq._y = 0; aq._z = 0; aq._w = 1;
        }
      } else {
        const sinHalf = Math.sqrt(sqrSin);
        const halfTheta = Math.atan2(sinHalf, dot);
        const ratioA = Math.sin(invT * halfTheta) / sinHalf;
        const ratioB = Math.sin(t * halfTheta) / sinHalf;
        aq._x = ax * ratioA + bx * ratioB;
        aq._y = ay * ratioA + by * ratioB;
        aq._z = az * ratioA + bz * ratioB;
        aq._w = aw * ratioA + bw * ratioB;
      }
    }
  }
  return true;
}

export function wasmSamplePose(bank, clip, layout, frame, out, doFk) {
  if (!wasmExports || !mathUntouched()) return false;
  if (clip.rotationMode !== 'eulerXYZ' && clip.rotationMode !== 'quaternion') return false;
  const n = bank.bones.length;
  const fkCount = doFk
    ? (typeof doFk === 'number' && bank.parentsFirst ? Math.min(n, doFk) : n)
    : 0;
  if (!hasDefaultQuatCallbacks(out.q, n)) return false;
  if (fkCount > 0 && !hasDefaultQuatCallbacks(out.wq, fkCount)) return false;

  const st = getBankState(bank);
  if (!st) return false;
  const cid = getClipId(bank, st, clip, layout);
  const ps = getPoseState(out);
  if (cid < 0 || !ps) return false;
  const segPtr = getSegPtr(ps, clip);
  if (!segPtr) return false;

  refreshViews();
  out.flags.set(clip.boneFlags);
  u32View.set(out.flags, ps.flagsPtr >>> 2);

  const rc = wasmExports.sample_and_fk_id(cid, ps.id, segPtr, frame, fkCount);
  if (rc !== 0) return false;

  const skipRawWorld = !!out._iwNoRawWorld;
  if (!skipRawWorld) {
    const rawBase = ps.rawPtr >>> 3;
    const rawLen = n * 10;
    const outRaw = out.raw;
    for (let i = 0; i < rawLen; i++) outRaw[i] = f64View[rawBase + i];
    if (clip.rotationMode === 'eulerXYZ' && n > 0) out._lastEuler(outRaw);
  }

  downloadLocalFromWasm(out, ps, n);
  if (fkCount > 0) downloadWorldFromWasm(out, ps, fkCount, skipRawWorld);
  return true;
}

// ============================================================================
// Tier 2: Bit-Exact Floor Coverage Replay Bridge (scoring.mjs)
// ============================================================================
const coverageStates = new WeakMap();
const covPool = new Map();
const covFinalizer =
  typeof FinalizationRegistry === 'function'
    ? new FinalizationRegistry((held) => {
        if (wasmExports) wasmExports.unregister_coverage_replay(held.id);
        let list = covPool.get(held.key);
        if (!list) {
          list = [];
          covPool.set(held.key, list);
        }
        list.push(held.bufs);
      })
    : null;

function getCoverageState(replay, weights) {
  let cs = coverageStates.get(replay);
  if (cs !== undefined) return cs || null;
  if (!wasmExports || !covOutPtr || !wasmExports.can_register_coverage()) {
    coverageStates.set(replay, false);
    return null;
  }
  const gc = replay.groups.length;
  const wc = replay.words.length;
  const wl = weights.length;
  const cp = replay.prefix0.length;
  const key = `${gc}:${wc}:${wl}:${cp}`;
  const pooled = covPool.get(key);
  let bufs = pooled && pooled.length > 0 ? pooled.pop() : null;
  if (!bufs) {
    const groupsPtr = allocBytes(Math.max(1, gc) * 4);
    const startsPtr = allocBytes(Math.max(1, gc) * 4);
    const weightsPtr = allocBytes(Math.max(1, wl) * 8);
    const wordsPtr = allocBytes(Math.max(1, wc) * 4);
    const ownershipPtr = allocBytes(Math.max(1, gc) * 4);
    const prefix0Ptr = allocBytes(Math.max(1, cp) * 8);
    const prefix1Ptr = allocBytes(Math.max(1, cp) * 8);
    if (!groupsPtr || !startsPtr || !weightsPtr || !wordsPtr || !ownershipPtr || !prefix0Ptr || !prefix1Ptr) {
      coverageStates.set(replay, false);
      return null;
    }
    bufs = { groupsPtr, startsPtr, weightsPtr, wordsPtr, ownershipPtr, prefix0Ptr, prefix1Ptr };
  }
  const { groupsPtr, startsPtr, weightsPtr, wordsPtr, ownershipPtr, prefix0Ptr, prefix1Ptr } = bufs;
  if (gc > 0) {
    u32View.set(replay.groups, groupsPtr >>> 2);
    i32View.set(replay.starts, startsPtr >>> 2);
    u32View.fill(0, ownershipPtr >>> 2, (ownershipPtr >>> 2) + gc);
  }
  if (wl > 0) f64View.set(weights, weightsPtr >>> 3);
  if (cp > 0) {
    f64View.fill(0, prefix0Ptr >>> 3, (prefix0Ptr >>> 3) + cp);
    f64View.fill(0, prefix1Ptr >>> 3, (prefix1Ptr >>> 3) + cp);
  }
  const id = wasmExports.register_coverage_replay(
    groupsPtr, startsPtr, weightsPtr, wordsPtr, ownershipPtr, prefix0Ptr, prefix1Ptr, gc, wc,
  );
  if (id < 0) {
    let list = covPool.get(key);
    if (!list) {
      list = [];
      covPool.set(key, list);
    }
    list.push(bufs);
    coverageStates.set(replay, false);
    return null;
  }
  cs = { id, wordsBase: wordsPtr >>> 2, wc, weightsRef: weights };
  coverageStates.set(replay, cs);
  if (covFinalizer) covFinalizer.register(replay, { id, key, bufs });
  return cs;
}

export function wasmReplayFloorCoverage(replay, weights, full, area) {
  if (!wasmExports || !covOutPtr) return null;
  const cs = getCoverageState(replay, weights);
  if (!cs) return null;
  if (replay.words.length !== cs.wc || weights !== cs.weightsRef) return null;
  refreshViews();
  if (cs.wc > 0) u32View.set(replay.words, cs.wordsBase);
  const ok = wasmExports.replay_floor_coverage_id(cs.id, (full || !replay.valid) ? 1 : 0, covOutPtr);
  if (!ok) return null;
  const outIdx = covOutPtr >>> 3;
  const t0 = f64View[outIdx];
  const t1 = f64View[outIdx + 1];
  replay.valid = true;
  replay.t0 = t0;
  replay.t1 = t1;
  return area > 0 ? [t0 / area, t1 / area] : [0, 0];
}

const MOTION_WASM_INSTALLED = Symbol('iwMotionWasmInstalled');

export function installMotionWasm(SourceBank, SourcePose) {
  if (!SourceBank?.prototype || !SourcePose?.prototype) return;
  if (SourcePose.prototype[MOTION_WASM_INSTALLED]) return;
  Object.defineProperty(SourcePose.prototype, MOTION_WASM_INSTALLED, { value: true });

  const origCopy = SourcePose.prototype.copy;
  const origMix = SourcePose.prototype.mix;
  const origSample = SourceBank.prototype.sample;

  SourcePose.prototype.copy = function wasmCopy(other, count = true) {
    const n = typeof count === 'number' ? Math.min(this.p.length, count) : this.p.length;
    if (fastCopyPose(this, other, n)) return this;
    return origCopy.call(this, other, count);
  };

  SourcePose.prototype.mix = function fastMix(other, weight, count = true) {
    const w = Math.max(0, Math.min(1, weight));
    const n = typeof count === 'number' ? Math.min(this.p.length, count) : this.p.length;
    if (fastMixPose(this, other, w, n)) return this;
    return origMix.call(this, other, weight, count);
  };

  SourceBank.prototype.sample = function wasmSample(name, frame, out, loop = undefined, doFk = true) {
    const c = typeof name === 'string' ? this.clips.get(name) : name;
    if (c && Number.isFinite(frame)) {
      const f = (loop ?? c.loop) && c.frames > 0 ? (((frame % c.frames) + c.frames) % c.frames) : Math.max(0, Math.min(c.frames, frame));
      const layout = this.layouts.get(c);
      if (layout && wasmSamplePose(this, c, layout, f, out, doFk)) return out;
    }
    return origSample.call(this, name, frame, out, loop, doFk);
  };
  if (typeof globalThis !== 'undefined') {
    globalThis.__iwReplayFloorCoverageWasm = wasmReplayFloorCoverage;
  }
}
