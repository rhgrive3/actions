// New queue entries only; the 20261030 integration remains independently owned.
function once(code,before,after,label){
  const at=code.indexOf(before);
  if(at<0||code.indexOf(before,at+before.length)>=0)throw new Error('20261031 UI queue anchor: '+label);
  return code.slice(0,at)+after+code.slice(at+before.length);
}
export function adaptQueueUiAudio20261031(rel,code){
  if(rel==='src/net/transport.js'){
    code=once(code,"      if (!this._pingSent) this._pingSent = performance.now();   // time the oldest unanswered one (pongs come in order)\n      this._raw('ping');                                          // always sent: the relay reads silence as a dead link",
      "      const sentAt = performance.now();\n      if (this._raw('ping') === true && !this._pingSent) this._pingSent = sentAt; // oldest accepted unanswered ping",'accepted heartbeat owns RTT origin');
  }
  if(rel==='src/audio/audio.js'){
    code=once(code,'this._reverbPrewarm = new ReverbPrewarm();',
      'this._reverbPrewarm = new ReverbPrewarm({ sampleRate: opts.context?.sampleRate ?? 48000, includeMusic: opts.music !== false });','known-context and music-free reverb work');
    code=once(code,'  _warm() {\n    if (prewarmGrainTextures',
      '  _warm() {\n    if (this._sfxSilent?.()) { this._grainWarmDeferred = true; return; }\n    this._grainWarmDeferred = false;\n    if (prewarmGrainTextures','grain warm admission follows SFX audibility');
    code=once(code,'    const step = () => { const k = kinds.shift(); if (!k || !this.ctx) return; texture(this.ctx, k); setTimeout(step, 40); };',
      '    const warmContext = this.ctx, generation = this._grainWarmGeneration;\n    const step = () => { if (this.ctx !== warmContext || this._grainWarmGeneration !== generation || warmContext?.state === \'closed\') return; if (this._sfxSilent?.()) { this._grainWarmDeferred = true; return; } const k = kinds.shift(); if (!k || !this.ctx) return; texture(this.ctx, k); setTimeout(step, 40); };','grain timer fallback observes mute and context retirement');
    code=once(code,'if (d.loop) ctl = d.loop(v, Math.max(0.05, o.pitch ?? 1), o) || {};',
      'if (d.loop) ctl = d.loop(v, Math.max(d.progressControlled ? 0 : 0.05, o.pitch ?? 1), o) || {};','initial progress-controlled rate');
  }
  return code;
}
