// Remaining source-confirmed UI/network queue items. The upstream snapshot is
// immutable; moved or repeated anchors must fail the production composition.
function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) throw Error('Remaining UI/network queue conflict: ' + label);
  return code.slice(0, at) + after + code.slice(at + before.length);
}
export function adaptQueueRemainingUiNetwork20261026(rel, code) {
  const patch = (before, after, label) => { code = once(code, before, after, label); };
  if (rel === 'src/ui/hud.js') {
    patch('    this.paused = false;    // freezes self-driven effects (judge, smears, splatted ring)',
      `    this._queueFxPaused = false;
    Object.defineProperty(this, 'paused', { configurable: true, enumerable: true,
      get: () => this._queueFxPaused,
      set: value => {
        const wasPaused = !!this._queueFxPaused; this._queueFxPaused = value;
        if (value) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
        else if (wasPaused && !this._worldPaused && this._fxMap?.size && !this._rafId) {
          this._lastFx = performance.now(); this._rafId = requestAnimationFrame(this._fxLoop);
        }
      }
    });`, 'pause owns the effect RAF');
    patch('      if (this._fxMap?.size && !this._rafId) {', '      if (!this.paused && this._fxMap?.size && !this._rafId) {', 'world resume respects effect pause');
    patch('    if (!this._rafId && !this._worldPaused) { this._lastFx = performance.now(); this._rafId = requestAnimationFrame(this._fxLoop); }',
      '    if (!this._rafId && !this._worldPaused && !this.paused) { this._lastFx = performance.now(); this._rafId = requestAnimationFrame(this._fxLoop); }', 'paused additions stay parked');
    patch('    if (this.paused) { this._rafId = this._fxMap.size ? requestAnimationFrame(this._fxLoop) : 0; return; }',
      '    if (this.paused) { this._rafId = 0; return; }', 'paused queued callback stays parked');
    patch('  _fxLoop(t) {', '  _fxLoop(t) {\n    this._rafId = 0;', 'running effect callback releases its RAF slot');
    patch('    this._rafId = this._fxMap.size ? requestAnimationFrame(this._fxLoop) : 0;',
      '    if (this._fxMap.size && !this.paused && !this._worldPaused) { if (!this._rafId) this._rafId = requestAnimationFrame(this._fxLoop); }\n    else { cancelAnimationFrame(this._rafId); this._rafId = 0; }', 'effect can pause and resume its own callback');
  }
  if (rel === 'src/ui/diorama.js') {
    patch('      const d = Math.hypot(p.x - this.cx * W, p.y - 34 - this.cy * H);',
      '      const dx = p.x - this.cx * W, dy = p.y - 34 - this.cy * H;\n      if (Math.abs(dx) >= bd || Math.abs(dy) >= bd) continue;\n      const d = Math.hypot(dx, dy);', 'snap radius axis bound');
  }
  if (rel === 'src/ui/news.js') {
    patch('    clearTimeout(this._t);\n    // fetch both hero renders now:',
      '    clearTimeout(this._t); this._cancelHeroWait(); this._heroDone = null;\n    // fetch both hero renders now:', 'replace previous hero wait');
    patch("    if (this.el || M.current !== 'main' || !M._scr || G.mode === 'match') return;",
      "    if (this.el || M.current !== 'main' || !M._scr || G.mode === 'match') { this._cancelHeroWait(); this._pre = this._heroDone = null; return; }", 'retire aborted preload ownership');
    patch('    if (hero && !hero.complete && performance.now() - this._waitFrom < 4000) { this._t = setTimeout(() => this._tryOpen(n), 150); return; }',
      `    if (hero && hero !== this._heroDone && !hero.complete && performance.now() - this._waitFrom < 4000) {
      if (!this._heroWait) {
        const finish = () => {
          if (this._heroWait !== cleanup) return;
          this._heroDone = hero; this._cancelHeroWait(); this._tryOpen(n);
        };
        const cleanup = () => {
          hero.removeEventListener('load', finish); hero.removeEventListener('error', finish);
          clearTimeout(timer); this._heroWait = null;
        };
        const timer = setTimeout(finish, Math.max(0, 4000 - (performance.now() - this._waitFrom)));
        this._heroWait = cleanup;
        hero.addEventListener('load', finish); hero.addEventListener('error', finish);
        if (hero.complete) finish();
      }
      return;
    }`, 'hero load/error/deadline owner');
    patch('  // ================================================================ build',
      '  _cancelHeroWait() { if (this._heroWait) this._heroWait(); }\n\n  // ================================================================ build', 'hero wait teardown');
    patch('    this._render(0, true);',
      '    this._render(0, true);\n    this._cancelHeroWait(); clearTimeout(this._t); this._t = 0; this._pre = this._heroDone = null;', 'release preload owners after DOM image handoff');
    patch('  dispose() { this._pre = null;',
      '  dispose() { this._cancelHeroWait(); this._heroDone = null; this._pre = null;', 'dispose image callbacks');
  }
  if (rel === 'src/net/netmatch.js') {
    patch('const s3kit = kitBombPacket(b); if (!s3kit) return; const birth =',
      'const s3kit = kitBombPacket(b); if (!s3kit) return; const kitBirthMeta = kitBombBirthMetadata(this,b); const birth =', 'one local birth metadata snapshot');
    patch('...(kitBombBirthMetadata(this,b) ? [kitBombBirthMetadata(this,b)] : [])',
      '...(kitBirthMeta?[kitBirthMeta]:[])', 'reuse birth metadata');
    patch('    const present = HIT_AUTHORITY_FIELDS.filter((key) => d?.[key] !== undefined).length;',
      '    const present = Number(d?.hp !== undefined) + Number(d?.hr !== undefined) + Number(d?.ht !== undefined) + Number(d?.la !== undefined);', 'fixed authority presence count');
    patch('    const hasAuthority = HIT_AUTHORITY_FIELDS.some((key) => d[key] !== undefined);',
      '    const hasAuthority = d.hp !== undefined;', 'validated all-or-none authority presence');
    patch('    for (const e of prepareKitPaintEvents(this, from, { ...d, e: kitPreparedEvents })) {',
      '    const kitReadyEvents = d.r === 2 ? prepareKitPaintEvents(this, from, { ...d, e: kitPreparedEvents }) : kitPreparedEvents;\n    for (const e of kitReadyEvents) {', 'non-r2 identity preparation');
    patch('  for (let index = 1; index < buf.length; index++) if (t <= buf[index].t) { left = buf[index - 1]; right = buf[index]; break; }',
      '  const start = buf.length > 5 && t > buf[buf.length - 5].t ? buf.length - 4 : 1;\n  for (let index = start; index < buf.length; index++) if (t <= buf[index].t) { left = buf[index - 1]; right = buf[index]; break; }', 'adoption monotonic tail bracket');
  }
  return code;
}
