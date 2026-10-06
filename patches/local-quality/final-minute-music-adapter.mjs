// Only the fixed match milestone bypasses the native beat-matched transition.
export function adaptFinalMinuteMusic(rel, code, once) {
  if (rel !== 'src/main.js') return code;
  code = once(code,
    '_playMusic(t) { this._musicTrack = t; try { G.music?.play(t, { fade: 1.2 }); }',
    '_playMusic(t, fade = 1.2) { this._musicTrack = t; try { G.music?.play(t, { fade }); }',
    'one-minute music: retain ordinary fade as default');
  return once(code,
    "if (this.match?.mode !== 'boss') this._playMusic('battle_final');",
    "if (this.match?.mode !== 'boss') this._playMusic('battle_final', 0);",
    'one-minute music: use existing immediate transition at the deadline');
}
