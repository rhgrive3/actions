// Splatling full-charge hold: S3 keeps the spinning Motor hum going while the
// trigger stays held after a full charge. The 2022 Motor recordings are ~10 s
// takes that fade out by ~1 dB/s, so looping the whole file made the held
// sound sag to near silence and then jump back. Loop a short, near-steady
// window right after the spin-up instead, with an equal-power crossfade baked
// into a derived copy so the seam neither clicks nor steps. Window positions
// are an INKWAVE measurement of the recordings (RMS within about +-1 dB), not
// retail loop markers. Presentation only.
export const SPINNER_MOTOR_HOLD = Object.freeze({ loopStart: .5, loopEnd: 1.75, crossfade: .06 });
const derived = new WeakMap();
export function spinnerMotorHoldBuffer(ctx, buffer, window = SPINNER_MOTOR_HOLD) {
  if (!ctx || typeof ctx.createBuffer !== 'function' || !buffer || typeof buffer.getChannelData !== 'function') return null;
  const cached = derived.get(buffer);
  if (cached) return cached;
  const sr = buffer.sampleRate, start = Math.round(window.loopStart * sr), end = Math.round(window.loopEnd * sr);
  const n = Math.round(window.crossfade * sr);
  if (!(sr > 0) || n < 8 || start - n < 0 || end > buffer.length || end - start < 4 * n) return null;
  const out = ctx.createBuffer(buffer.numberOfChannels, end, sr);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c), dst = out.getChannelData(c);
    dst.set(src.subarray(0, end));
    // The last n samples before loopEnd blend into the n samples before
    // loopStart, so wrapping from loopEnd to loopStart is continuous.
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n, a = Math.cos(t * Math.PI / 2), b = Math.sin(t * Math.PI / 2);
      dst[end - n + i] = src[end - n + i] * a + src[start - n + i] * b;
    }
  }
  const result = { buffer: out, loopStart: start / sr, loopEnd: end / sr };
  derived.set(buffer, result);
  return result;
}
