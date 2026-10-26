// Immutable decoded Charger onsets enter on transferred PCM copies. Only this
// Worker runs WSOLA; a failure leaves the original authorized recording live.
import { stretchChargerPCM } from './pitch-preserving-charge.mjs';
self.onmessage = ({ data }) => {
  if (!data || !Number.isInteger(data.serial) || typeof data.key !== 'string') return;
  try {
    const samples = stretchChargerPCM(data.samples, data.sampleRate, data.ratio);
    self.postMessage({ serial: data.serial, key: data.key, samples },
      samples.map(channel => channel.buffer));
  } catch {
    self.postMessage({ serial: data.serial, key: data.key, samples: null });
  }
};
