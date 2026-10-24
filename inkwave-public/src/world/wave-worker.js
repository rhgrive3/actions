import { makeWaveData } from './wave-data.js';
self.onmessage = event => {
  if (event.data?.size !== 256 || event.data?.seed !== 11) { self.postMessage({ error: 'Unsupported wave request' }); return; }
  const data = makeWaveData(256, 11);
  self.postMessage({ size: 256, seed: 11, buffer: data.buffer }, [data.buffer]);
};
