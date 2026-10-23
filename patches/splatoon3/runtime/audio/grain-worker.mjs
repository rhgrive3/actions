import { TEX, renderTexturePCM } from './grain-texture.mjs';
self.onmessage = ({ data }) => {
  const { sampleRate, generation, kinds } = data;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate > 192000 || !Array.isArray(kinds)) return;
  for (const kind of kinds) {
    if (!Object.hasOwn(TEX, kind)) continue;
    const pcm = renderTexturePCM(sampleRate, kind);
    self.postMessage({ sampleRate, generation, kind, pcm }, [pcm.buffer]);
  }
};
