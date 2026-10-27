// Pure deterministic sea bytes, shared by the worker and synchronous fallback.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function makeWaveData(size = 256, seed = 11) {
  const rnd = mulberry(seed);
  const waves = [];
  const wind = 0.55;
  for (let i = 0; i < 44; i++) {
    const f = 2 + Math.pow(rnd(), 1.5) * 26;
    const ang = wind + (rnd() - 0.5) * 2.4;
    let kx = Math.round(Math.cos(ang) * f), ky = Math.round(Math.sin(ang) * f);
    if (kx === 0 && ky === 0) kx = 2;
    const kl = Math.hypot(kx, ky);
    const amp = 1 / Math.pow(kl, 1.3);
    // Keep each gradient's original amplitude product once for every texel.
    waves.push([kx, ky, amp, rnd() * Math.PI * 2, amp * kx, amp * ky]);
  }
  const N = size * size;
  const H = new Float32Array(N), GX = new Float32Array(N), GY = new Float32Array(N);
  let hMin = Infinity, hMax = -Infinity, gMax = 0;
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let h = 0, gx = 0, gy = 0;
      for (let k = 0; k < waves.length; k++) {
        const w = waves[k];
        const ph = TAU * (w[0] * u + w[1] * v) + w[3];
        const s = Math.sin(ph), c = Math.cos(ph);
        h += w[2] * s; gx += w[4] * c; gy += w[5] * c;
      }
      const i = y * size + x;
      H[i] = h; GX[i] = gx; GY[i] = gy;
      if (h < hMin) hMin = h; if (h > hMax) hMax = h;
      gMax = Math.max(gMax, Math.abs(gx), Math.abs(gy));
    }
  }
  const data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const hn = (H[i] - hMin) / (hMax - hMin);
    data[i * 4] = Math.round((GX[i] / gMax * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((GY[i] / gMax * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round(Math.pow(hn, 1.8) * 255);
    data[i * 4 + 3] = 255;
  }
  return data;
}
