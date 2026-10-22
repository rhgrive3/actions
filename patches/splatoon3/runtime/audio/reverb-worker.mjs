import { renderReverbPair } from './reverb-impulse.mjs';
self.onmessage = ({ data }) => {
  const { sampleRate, generation } = data;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate > 192000) return;
  const pair = renderReverbPair(sampleRate);
  self.postMessage({ sampleRate, generation, pair }, pair.flat().map(a => a.buffer));
};
