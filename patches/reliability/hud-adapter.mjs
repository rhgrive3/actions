// Build-only ownership of the judging presentation; default HUD/lab timing stays shared.
function replaceOnce(code, before, after, rel) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) {
    throw new Error(`Reliability HUD anchor mismatch: ${rel}`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptHud(rel, code) {
  if (rel === 'src/main.js') {
    // The results/start overlays reserve this owner before entering HUD judging.
    const begin = code.indexOf('  async _judge() {'), end = code.indexOf('\n  _fade(to, ms)', begin);
    const method = code.slice(begin, end);
    if (begin < 0 || end < begin || !method.includes('    const resultsCurrent = () => ')) {
      throw new Error(`Reliability HUD owner missing: ${rel}; apply results/start first`);
    }
    const plainJudge = 'names: this.palette.names || TEAM_NAMES });\n    await (judgeP || new Promise((r) => setTimeout(r, 4000)));';
    const authoritativeJudge = 'names: this.palette.names || TEAM_NAMES, winner: m.result.winner });\n    await (judgeP || new Promise((r) => setTimeout(r, 4000)));';
    if (code.includes(authoritativeJudge)) {
      code = replaceOnce(code, authoritativeJudge,
        'names: this.palette.names || TEAM_NAMES, winner: m.result.winner, isCurrent: resultsCurrent });\n    const judged = await (judgeP || new Promise((r) => setTimeout(r, 4000)));\n    if (judged?.cancelled === true) return;', rel);
    } else {
      code = replaceOnce(code, plainJudge,
        'names: this.palette.names || TEAM_NAMES, isCurrent: resultsCurrent });\n    const judged = await (judgeP || new Promise((r) => setTimeout(r, 4000)));\n    if (judged?.cancelled === true) return;', rel);
    }
  }
  if (rel !== 'src/ui/hud.js') return code;
  const plainHud = "  judge({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES } = {}) {\n    return new Promise((resolve) => {";
  const authoritativeHud = "  judge({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES, winner: authoritativeWinner = null } = {}) {\n    return new Promise((resolve) => {";
  if (code.includes(authoritativeHud)) {
    code = replaceOnce(code, authoritativeHud,
      `  judge({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES, winner: authoritativeWinner = null, isCurrent = () => true } = {}) {
    const current = () => { try { return !!isCurrent(); } catch { return false; } };
    if (this._judgeDisposed || !current()) return Promise.resolve({ cancelled: true });
    this._judgeOwner?.cancel();
    return new Promise((resolve) => {`, rel);
  } else {
    code = replaceOnce(code, plainHud,
      `  judge({ colors = ['#ff8a14', '#2f5bff'], percents = [50, 50], names = TEAM_NAMES, isCurrent = () => true } = {}) {
    const current = () => { try { return !!isCurrent(); } catch { return false; } };
    if (this._judgeDisposed || !current()) return Promise.resolve({ cancelled: true });
    this._judgeOwner?.cancel();
    return new Promise((resolve) => {`, rel);
  }
  code = replaceOnce(code, '      const snd = (n) => this._snd(n);', `      const sounds = new Set();
      const stopSound = (voice) => {
        try { if (voice?.stop) voice.stop(0); else voice?.v?.dispose?.(); } catch { /* optional audio */ }
      };
      const snd = (n) => {
        if (this._judgeOwner !== owner || !current()) { owner.cancel(); return; }
        const voice = this._snd(n);
        if (voice) {
          if (this._judgeOwner !== owner || !current()) stopSound(voice);
          else sounds.add(voice);
        }
      };`, rel);
  code = replaceOnce(code,
    '      let t = 0, drum = false, reveal = false, punched = false, finished = false;',
    `      let t = 0, drum = false, reveal = false, punched = false, finished = false;
      let tick, settled = false, removeT = null;
      const settle = (result) => { if (!settled) { settled = true; resolve(result); } };
      const cleanup = (stop) => {
        clearTimeout(removeT); removeT = null;
        el.remove();
        if (this._fxMap?.get('judge') === tick) this._fxMap.delete('judge');
        if (this._judgeOwner === owner) this._judgeOwner = null;
        if (stop) for (const voice of sounds) stopSound(voice);
        sounds.clear();
        if (!this._fxMap?.size) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
      };
      const owner = { current, cancel: () => { finished = true; cleanup(true); settle({ cancelled: true }); } };
      this._judgeOwner = owner;`, rel);
  code = replaceOnce(code, "      this._addFx('judge', (dt) => {\n        t = this._fxTime - t0;", `      tick = (dt) => {
        if (this._judgeOwner !== owner || !current()) { owner.cancel(); return false; }
        if (finished) return true; // guard the original outgoing fade until its removal timer
        t = this._fxTime - t0;`, rel);
  code = replaceOnce(code, "        if (!drum) { drum = true; snd('judge_drumroll'); el.classList.add('is-racing'); }", `        if (!drum) { drum = true; snd('judge_drumroll'); if (finished) return false; el.classList.add('is-racing'); }`, rel);
  code = replaceOnce(code, "          reveal = true; snd('judge_reveal');", "          reveal = true; snd('judge_reveal');\n          if (finished) return false;", rel);
  code = replaceOnce(code,
    "          resolve({ winner });\n          el.classList.add('is-out');\n          setTimeout(() => el.remove(), 650);\n          return false;",
    "          settle({ winner });\n          el.classList.add('is-out');\n          removeT = setTimeout(() => cleanup(false), 650);\n          return true;", rel);
  code = replaceOnce(code, `        return true;
      });
    });
  }

  dispose() {`, `        return true;
      };
      this._addFx('judge', tick);
    });
  }

  dispose() {`, rel);
  code = replaceOnce(code, `  dispose() {
    removeEventListener('resize', this._onResize);
    cancelAnimationFrame(this._rafId);`, `  dispose() {
    this._judgeDisposed = true;
    this._judgeOwner?.cancel();
    removeEventListener('resize', this._onResize);
    cancelAnimationFrame(this._rafId); this._rafId = 0;
    this._fxMap?.clear();`, rel);
  code = replaceOnce(code, 'try { this.playSound && this.playSound(name, o); } catch', 'try { return this.playSound && this.playSound(name, o); } catch', rel);
  code = replaceOnce(code,
    '    if (this.paused) { this._rafId = requestAnimationFrame(this._fxLoop); return; }',
    `    if (this._judgeOwner && !this._judgeOwner.current()) this._judgeOwner.cancel();
    if (this.paused) { this._rafId = this._fxMap.size ? requestAnimationFrame(this._fxLoop) : 0; return; }`, rel);
  code = replaceOnce(code, 'if (!keep) this._fxMap.delete(name);', 'if (!keep && this._fxMap.get(name) === fn) this._fxMap.delete(name);', rel);
  return code;
}
