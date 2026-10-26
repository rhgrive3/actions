import { mulberry32 } from './reverb-impulse.mjs';
// Original per-kind PRNG, Float32 accumulation order and context cache.
export const TEX = {
  bubbles: { dur: 3, rate: 46, f: [230, 950], d: [0.018, 0.065], amp: [0.25, 1], rise: [1.35, 2.3] },
  bubbles_bright: { dur: 2.5, rate: 60, f: [650, 2300], d: [0.01, 0.035], amp: [0.2, 1], rise: [1.4, 2.4] },
  squelch: { dur: 2.5, rate: 75, f: [110, 460], d: [0.03, 0.09], amp: [0.3, 1], rise: [1.1, 1.7] },
  rain: { dur: 3, rate: 280, f: [1500, 5500], d: [0.004, 0.016], amp: [0.05, 1], rise: [1.2, 1.9] },
  sizzle: { dur: 2, rate: 450, crackle: true, d: [0.0006, 0.003], amp: [0.05, 1] },
};
const texCache = new WeakMap();
export function texture(ctx, kind) {
  let m = texCache.get(ctx);
  if (!m) { m = new Map(); texCache.set(ctx, m); }
  let buf = m.get(kind);
  if (buf) return buf;
  const s = TEX[kind], sr = ctx.sampleRate, len = Math.floor(s.dur * sr);
  buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let seed = 0;
  for (const c of kind) seed = (seed * 31 + c.charCodeAt(0)) | 0;
  const rnd = mulberry32(seed);
  const lerp = (r, x) => r[0] + (r[1] - r[0]) * x;
  const n = Math.floor(s.rate * s.dur), atk = 0.0012 * sr;
  // Float64 preserves the exact JS Number factor before Float32 accumulation.
  const attack = s.crackle ? null : new Float64Array(Math.min(len, Math.ceil(s.d[1] * sr * 5) + 1));
  if (attack) for (let i = 0; i < attack.length; i++) attack[i] = 1 - Math.exp(-i / atk);
  for (let k = 0; k < n; k++) {
    const start = Math.floor(rnd() * len);
    const dec = lerp(s.d, rnd()) * sr, amp = lerp(s.amp, Math.pow(rnd(), 3));
    const L = Math.min(len, Math.floor(dec * 5));
    if (s.crackle) {
      for (let i = 0; i < L; i++) d[(start + i) % len] += amp * (rnd() * 2 - 1) * Math.exp(-i / dec);
    } else {
      const f0 = lerp(s.f, rnd()), f1 = f0 * lerp(s.rise, rnd());
      const ratio = f1 / f0, dec2 = dec * 2;
      let ph = rnd() * 0.2;
      for (let i = 0; i < L; i++) {
        const exponent = Math.min(1, i / dec2);
        const f = f0 * (exponent === 1 ? ratio : Math.pow(ratio, exponent));
        ph += (2 * Math.PI * f) / sr;
        d[(start + i) % len] += amp * attack[i] * Math.exp(-i / dec) * Math.sin(ph);
      }
    }
  }
  let ss = 0, pk = 0, mean = 0;
  for (let i = 0; i < len; i++) mean += d[i];
  mean /= len;
  for (let i = 0; i < len; i++) { d[i] -= mean; ss += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); }
  const g = Math.min(0.25 / Math.sqrt(ss / len || 1), 0.95 / (pk || 1));
  for (let i = 0; i < len; i++) d[i] *= g;
  m.set(kind, buf);
  return buf;
}


export function hasTexture(ctx, kind) { return texCache.get(ctx)?.has(kind) || false; }
export function publishTexturePCM(ctx, kind, pcm) {
  if (!Object.hasOwn(TEX, kind) || !(pcm instanceof Float32Array) || pcm.length !== Math.floor(TEX[kind].dur * ctx.sampleRate)) return false;
  let map = texCache.get(ctx); if (!map) { map = new Map(); texCache.set(ctx, map); }
  if (map.has(kind)) return true; // An urgent sync render owns its original buffer identity.
  const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate); buffer.getChannelData(0).set(pcm);
  map.set(kind, buffer); return true;
}
export function renderTexturePCM(sampleRate, kind) {
  const ctx = { sampleRate, createBuffer(_channels, length) {
    const pcm = new Float32Array(length); return { getChannelData: () => pcm };
  } };
  return texture(ctx, kind).getChannelData(0);
}
