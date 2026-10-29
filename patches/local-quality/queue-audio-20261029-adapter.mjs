function once(code,before,after,label){
  const at=code.indexOf(before);
  if(at<0||code.indexOf(before,at+before.length)>=0)throw Error('20261029 audio anchor: '+label);
  return code.slice(0,at)+after+code.slice(at+before.length);
}
export function adaptQueueAudio20261029(rel,code){
  if(rel==='src/audio/bossAudio.js')return once(code,'    if (!h) return;\n    h._sock = sock;',
    '    if (!h || h.playing === false) return;\n    h._sock = sock;','inactive Boss loop is never decorated or tracked');
  if(rel==='src/audio/music.js'){
    code=once(code,"          ev[s].push({ i: 'chords', ms, len, v: VEL[c] ?? 0.8, mute: c === 'm' });",
      "          const event = { i: 'chords', ms, len, v: VEL[c] ?? 0.8, mute: c === 'm' };\n          if (def.inst.chords === 'guitar') event.hz = ms.map(mtof);\n          ev[s].push(event);",'compile immutable guitar frequencies once');
    return once(code,"if (inst === 'guitar') guitar(v, T, e.ms.map(mtof), gate, vel, { mute: e.mute });",
      "if (inst === 'guitar') guitar(v, T, e.hz || e.ms.map(mtof), gate, vel, { mute: e.mute });",'reuse compiled frequencies while retaining custom event fallback');
  }
  if(rel!=='src/main.js')return code;
  const cancel='    if (this._resultsMusicTimer != null) clearTimeout(this._resultsMusicTimer); this._resultsMusicTimer = null;\n'
    + "    if (this.hud?._judgeOwner?.kind === 'ranked') this.hud._judgeOwner.cancel();\n";
  for(const header of ['  async startMatch(o = {}, flow = null) {\n','  async startNetMatch(cfg, nm) {\n','  async netMatchEnd() {\n','  async quitToMenu() {\n','  async _judge() {\n'])
    code=once(code,header,header+cancel,'retire results timer at '+header.trim());
  code=once(code,'  _playMusic(t, fade = 1.2) { this._musicTrack = t;',
    '  _playMusic(t, fade = 1.2) { if (this._resultsMusicTimer != null) clearTimeout(this._resultsMusicTimer); this._resultsMusicTimer = null; this._musicTrack = t;','music transition owns results timer');
  return once(code,`    setTimeout(() => {
      if (resultsCurrent() && m.state === 'results' && this.menus?.current === 'results') this._playMusic(won ? 'results_win' : 'results_lose');
    }, 2600);`,`    const resultsTimer = this._resultsMusicTimer = setTimeout(() => {
      if (this._resultsMusicTimer !== resultsTimer) return;
      this._resultsMusicTimer = null;
      if (resultsCurrent() && m.state === 'results' && this.menus?.current === 'results' && this._s3JudgeEpoch === judgeEpoch)
        this._playMusic(won ? 'results_win' : 'results_lose');
    }, 2600);`,'result music retains match and judge epoch ownership');
}
