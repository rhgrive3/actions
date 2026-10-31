// Canonical unchanged stereo impulse arithmetic, shared by sync and Worker.
export function mulberry32(a) {
  a = a >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEFAULT_TAPS=Object.freeze([[0.011,0.5],[0.019,0.36],[0.027,0.3],[0.041,0.22],[0.058,0.15]].map(Object.freeze));
export function buildImpulse(ctx, seconds = 1.6, decay = 3.2, opt = {}) {
  const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor((opt.pre ?? 0.01) * sr);
  const bright = opt.bright ?? 0.85, dark = opt.dark ?? 0.12;
  const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1);
  const rnd0 = mulberry32((opt.seed ?? 71) + 0), rnd1 = mulberry32((opt.seed ?? 71) + 101);
  let lp0 = 0, lp1 = 0;
  const attackFrames=0.002*sr;
  // Envelope and damping are identical in both ears; retain each ear's independent noise and filter state.
  for (let i = pre; i < len; i++) {
    const x = (i - pre) / (len - pre);
    const attack=attackFrames>0&&i-pre>=attackFrames?1:Math.min(1,(i-pre)/attackFrames);
    const env = Math.exp(-x * decay * 2.3) * (1 - x) * attack;
    const a = dark + (bright - dark) * Math.exp(-x * 4);
    lp0 += ((rnd0() * 2 - 1) - lp0) * a; d0[i] = lp0 * env;
    lp1 += ((rnd1() * 2 - 1) - lp1) * a; d1[i] = lp1 * env;
  }
  for (let ch = 0; ch < 2; ch++) {
    const d = ch === 0 ? d0 : d1;
    // early reflections (plaza walls), different per ear
    const taps = opt.taps ?? DEFAULT_TAPS;
    for (const [tt, amp] of taps) {
      const i = pre + Math.floor((tt + (ch ? 0.0031 : 0)) * sr);
      if (i < len - 2) { d[i] += amp * (ch ? -1 : 1); d[i + 1] += amp * 0.4; }
    }
  }
  return buf;
}

export const REVERB_RECIPES = Object.freeze([
  Object.freeze({ seconds: 1.5, decay: 3.4, opt: Object.freeze({ pre: .012, seed: 3 }) }),
  Object.freeze({ seconds: 2.2, decay: 2.4, opt: Object.freeze({ seed: 5, bright: .7, dark: .08 }) }),
]);
export function renderReverbPair(sampleRate, includeMusic = true) {
  const ctx = { sampleRate, createBuffer(channels, length) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { data, getChannelData: i => data[i] };
  } };
  return (includeMusic ? REVERB_RECIPES : REVERB_RECIPES.slice(0, 1)).map(r => buildImpulse(ctx, r.seconds, r.decay, r.opt).data);
}
