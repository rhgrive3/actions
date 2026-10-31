// Validate publication boundaries without changing any finite sample or its bits.
// An injected AudioContext may return a Float32Array from another window realm.
const typedArrayTag = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Float32Array.prototype), Symbol.toStringTag).get;
export function isFinitePCM(pcm) {
  if (!ArrayBuffer.isView(pcm) || typedArrayTag.call(pcm) !== 'Float32Array' || pcm.length === 0) return false;
  for (let i = 0; i < pcm.length; i++) if (!Number.isFinite(pcm[i])) return false;
  return true;
}

export function hasFiniteAudioBufferPCM(buffer) {
  try {
    if (!buffer || !Number.isInteger(buffer.length) || buffer.length <= 0 ||
        !Number.isInteger(buffer.numberOfChannels) || buffer.numberOfChannels <= 0 ||
        typeof buffer.getChannelData !== 'function') return false;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const pcm = buffer.getChannelData(c);
      if (pcm.length !== buffer.length || !isFinitePCM(pcm)) return false;
    }
    return true;
  } catch { return false; }
}
