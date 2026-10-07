export const AUDIO_LISTENER_SOURCE = 'src/audio/audio.js';

export function adaptAudioListener(rel, code) {
  if (rel !== AUDIO_LISTENER_SOURCE) return code;
  const startMarker = '  setListener(pos, forward, up) {';
  const endMarker = '\n  _dist(p) {';
  const start = code.indexOf(startMarker);
  const end = start < 0 ? -1 : code.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || code.indexOf(startMarker, start + startMarker.length) !== -1) {
    throw new Error('INKWAVE audio-listener patch conflict: native AudioEngine.setListener was not unique');
  }
  const native = code.slice(start, end);
  if (!native.includes('positionX.setTargetAtTime') || !native.includes('setOrientation') ||
      !native.includes('validPos(forward)') || !native.includes('validPos(up)')) {
    throw new Error('INKWAVE audio-listener patch conflict: native listener behavior changed');
  }
  const replacement = `  setListener(pos, forward, up) {
    return updateAudioListener(this, pos, forward, up);
  }`;
  return `import { updateAudioListener } from '../../patches/local-quality/runtime/audio-listener.mjs';\n` +
    code.slice(0, start) + replacement + code.slice(end);
}
