// Browser-side diagnostic only. The public loop request is not necessarily
// the live voice registered by the composed AudioEngine.
export function installRankedLiveAudioReader() {
  const engine = globalThis.RG?.audio;
  const state = globalThis.__rankedReplication;
  if (!engine?.loops?.has || !Array.isArray(state?.audio)) throw Error('Ranked audio observation is unavailable');
  state.readAudio = nid => state.audio.filter(r => r.nid === nid).map(r => {
    const requestPlaying = r.handle?.playing === true;
    let live = engine.loops.has(r.handle) ? r.handle : null;
    if (!live && requestPlaying) {
      for (const request of engine._sfxReq || []) {
        if (!request.stopped && request.name === r.name && request.o === r.options && request.o?.actor?.nid === nid) {
          live = request.live;
          break;
        }
      }
    }
    const registered = !!live && live.name === r.name && engine.loops.has(live);
    return {name:r.name, volume:r.volume, playing:requestPlaying && registered && live.playing === true,
      registered, requestPlaying, stops:r.stops};
  });
}
