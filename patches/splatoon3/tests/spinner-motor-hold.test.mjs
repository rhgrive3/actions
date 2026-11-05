import test from 'node:test';
import assert from 'node:assert/strict';
import { spinnerMotorHoldBuffer, SPINNER_MOTOR_HOLD } from '../runtime/audio/spinner-motor-hold.mjs';

function buffer(seconds, sr = 8000) {
  // A fading take, like the 2022 Motor recordings (~1 dB/s decay).
  const data = Float32Array.from({ length: Math.round(seconds * sr) }, (_, i) => Math.sin(i * .37) * Math.pow(10, -(i / sr) / 20));
  return { sampleRate: sr, numberOfChannels: 1, length: data.length, duration: seconds, getChannelData: () => data };
}
const ctx = { createBuffer(ch, n, sr) { const d = new Float32Array(n); return { sampleRate: sr, numberOfChannels: ch, length: n, duration: n / sr, getChannelData: () => d }; } };

test('full-charge Motor hold loops a short steady window with a continuous seam', () => {
  const src = buffer(10), hold = spinnerMotorHoldBuffer(ctx, src);
  assert.ok(hold);
  assert.equal(hold.loopStart, SPINNER_MOTOR_HOLD.loopStart);
  assert.equal(hold.loopEnd, SPINNER_MOTOR_HOLD.loopEnd);
  assert.ok(hold.buffer.duration < 2, 'does not loop the fading 10 s take');
  const d = hold.buffer.getChannelData(0), sr = 8000, end = Math.round(hold.loopEnd * sr), start = Math.round(hold.loopStart * sr);
  // The sample played just before the wrap matches the one before loopStart.
  assert.ok(Math.abs(d[end - 1] - src.getChannelData(0)[start - 1]) < .02, 'seam is continuous');
  assert.equal(spinnerMotorHoldBuffer(ctx, src), hold, 'derived once per decoded buffer');
  assert.equal(spinnerMotorHoldBuffer(ctx, buffer(1)), null, 'too-short recordings keep their original loop');
});
