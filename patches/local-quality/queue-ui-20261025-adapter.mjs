// Final UI-only queue reductions. Preserve upstream sources and fail on moved anchors.
function once(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) throw Error('UI queue composition conflict: ' + label);
  return code.slice(0, at) + after + code.slice(at + before.length);
}
export function adaptQueueUi20261025(rel, code) {
  const patch = (before, after, label) => { code = once(code, before, after, label); };
  if (rel === 'src/ui/diorama.js') {
    patch("      pin.el.style.display = i < count ? '' : 'none';", "      const display = i < count ? '' : 'none';\n      if (pin.el.style.display !== display) pin.el.style.display = display;", 'bubbler pin visibility boundary');
    patch("        pin.keyEl.style.display = number ? '' : 'none';\n        pin.keyEl.innerHTML = number ? keycap(number) : '';",
      "        const display = number ? '' : 'none';\n        if (pin.keyEl.style.display !== display) pin.keyEl.style.display = display;\n        if (pin._keyNumber !== number) { pin._keyNumber = number; pin._keyMarkup = number ? keycap(number) : ''; }\n        if (pin.keyEl.innerHTML !== pin._keyMarkup) pin.keyEl.innerHTML = pin._keyMarkup;", 'static bubbler number markup with actual DOM validation');
    patch('    this.pins = [...this.basePins, ...this.bubblerPins.slice(0, count), this.selfPin];',
      '    const pins = this.pins;\n    let used = 0;\n    for (const pin of this.basePins) pins[used++] = pin;\n    for (let i = 0; i < count; i++) pins[used++] = this.bubblerPins[i];\n    pins[used++] = this.selfPin; pins.length = used;', 'reuse owned pin order without retaining retired targets');
  }
  if (rel === 'src/ui/hud.js') {
    patch('let dy = yaw - T.prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); drive += clamp(dy / dt, -8, 8) * 0.55;',
      'let dy = yaw - T.prevYaw; if (dy !== 0) { dy = Math.atan2(Math.sin(dy), Math.cos(dy)); drive += clamp(dy / dt, -8, 8) * 0.55; }', 'zero camera turn');
    patch('    T.level += (ink - T.level) * (1 - Math.exp(-dt * 14));',
      '    if (T.level !== ink || !Number.isFinite(dt) || dt < 0) T.level += (ink - T.level) * (1 - Math.exp(-dt * 14));', 'settled ink level');
    patch('const raw = d._mapKey || (d._mapKey = {}), yaw = +p.yaw || 0, alive = p.alive !== false, self = !!p.isSelf;',
      'const raw = d._mapKey || (d._mapKey = {}), self = !!p.isSelf, yaw = self ? (+p.yaw || 0) : 0, alive = p.alive !== false;', 'only visible dot heading is dirty');
    patch('${(+p.yaw || 0).toFixed(2)}|${p.alive === false ? 0 : 1}', '${yaw.toFixed(2)}|${p.alive === false ? 0 : 1}', 'rendered dot heading key');
    patch('    this.boss?.dispose();', '    this._bossSquadViews?.forEach(view => { view.players.length = 0; }); this._bossSquadViews = null;\n    this.boss?.dispose();', 'retire HUD roster scratch');
  }
  if (rel === 'src/ui/hud-boss.js') {
    patch('    onoff = !!onoff;\n    this.on = onoff;', '    onoff = !!onoff;\n    this.hud._bossSquadViews?.forEach(view => { view.players.length = 0; });\n    this.on = onoff;', 'retire previous boss roster');
  }
  if (rel === 'src/ui/menus.js') {
    patch('    this._qualityDisposed = true;',
      '    this._qualityDisposed = true;\n    const netOff = this._netOff; this._netOff = []; this._netBound = null;\n    for (const off of netOff || []) safeCall(off);\n    safeCall(() => this._news?.dispose?.()); this._news = null;', 'menu owned network and news teardown');
  }
  if (rel === 'src/ui/news.js') {
    patch('    setTimeout(() => { if (!this.el) return; this.card.classList.remove(\'is-out\'); this._render(1, false); this._busy = false; }, this.reduced ? 0 : 300);',
      '    this._nextTimer = setTimeout(() => { this._nextTimer = 0; if (!this.el) return; this.card.classList.remove(\'is-out\'); this._render(1, false); this._busy = false; }, this.reduced ? 0 : 300);', 'news page timer owner');
    patch('    } else setTimeout(finish, this.reduced ? 200 : 450);', '    } else this._closeTimer = setTimeout(() => { this._closeTimer = 0; finish(); }, this.reduced ? 200 : 450);', 'news close timer owner');
    patch('  dispose() { this._pre = null; clearTimeout(this._t); cancelAnimationFrame(this._raf); this._raf = 0; if (this.el) this.el.remove(); this.el = null; }',
      '  dispose() { this._pre = null; clearTimeout(this._t); clearTimeout(this._nextTimer); clearTimeout(this._closeTimer); this._t = this._nextTimer = this._closeTimer = 0; cancelAnimationFrame(this._raf); this._raf = 0; this._tweens.length = 0; if (this.M._modal === this.el) this.M._modal = null; if (this.el) this.el.remove(); this.el = null; this.card = this.inkHost = this.confetti = null; this._busy = false; }', 'news releases all owned work');
  }
  if (rel === 'src/ui/menu-art.js') {
    patch('export function createPreview(key, ctx = {}) { return guardPreview(createNativePreview(key, ctx)); }',
      `export function createPreview(key, ctx = {}) { return guardPreview(queueFreezePreview(createNativePreview(key, ctx), key)); }
function queueFreezePreview(preview, key) {
  // These previews depend only on accumulated time and their own set() values.
  // Wrap inside visibility guarding so an offscreen tick never marks a paint done.
  if (!['gyro', 'gyroSens', 'gyroInvertY', 'gyroInvertX', 'touchSens', 'stickMode', 'fireAim', '_layout'].includes(key) || typeof preview?.tick !== 'function') return preview;
  const tick = preview.tick, set = preview.set;
  let dirty = true;
  if (typeof set === 'function') preview.set = function(...args) { dirty = true; return set.apply(this, args); };
  preview.tick = function(dt) { if (dt === 0 && !dirty) return; const result = tick.call(this, dt); dirty = false; return result; };
  return preview;
}`, 'frozen time-driven previews retain first and changed paint');
    patch("g.classList.toggle('is-in', inside); if (inside) n++;", "if (g.classList.contains('is-in') !== inside) g.classList.toggle('is-in', inside); if (inside) n++;", 'FOV changes classes only on boundary');
    patch('    if (this.r !== r) return; // onMid started another wipe\n    try {',
      '    if (this.r !== r) return; // onMid started another wipe\n    if (r._queuePaintT === r.t && r._queuePaintCtx === this.ctx && r._queuePaintW === this.cv.width && r._queuePaintH === this.cv.height) return;\n    try {', 'frozen wipe keeps first paint');
    patch("      else this._drawFade(r);\n    } catch (e) { console.error('[ui] wipe', e); this._finish(); }",
      "      else this._drawFade(r);\n      r._queuePaintT = r.t; r._queuePaintCtx = this.ctx; r._queuePaintW = this.cv.width; r._queuePaintH = this.cv.height;\n    } catch (e) { console.error('[ui] wipe', e); this._finish(); }", 'wipe caches successful paint only');
  }
  if (rel === 'src/core/mobile.js') {
    patch('    el.style.transform = `translate3d(${(cx - R).toFixed(1)}px,${(cy - R).toFixed(1)}px,0)`;\n    el.classList.toggle(\'is-on\', on);',
      '    const baseTransform = `translate3d(${(cx - R).toFixed(1)}px,${(cy - R).toFixed(1)}px,0)`;\n    if (el._queueStickTransform !== baseTransform || el.style.transform !== el._queueStickActual) { el.style.transform = baseTransform; el._queueStickTransform = baseTransform; el._queueStickActual = el.style.transform; }\n    if (el.classList.contains(\'is-on\') !== !!on) el.classList.toggle(\'is-on\', on);', 'stick base DOM output');
    patch("    el.classList.toggle('is-run', mag > 0.97);", "    if (el.classList.contains('is-run') !== (mag > 0.97)) el.classList.toggle('is-run', mag > 0.97);", 'stick run class boundary');
  }
  if (rel === 'src/game/minimap.js') {
    patch('    // transient effects\n    for (let i = fxList.length - 1;', '    // transient effects\n    let queueJumpPulse;\n    for (let i = fxList.length - 1;', 'per-composite lazy jump pulse');
    patch('        const pulse = 0.5 + 0.5 * Math.sin(t * 10);', '        const pulse = queueJumpPulse === undefined ? (queueJumpPulse = 0.5 + 0.5 * Math.sin(t * 10)) : queueJumpPulse;', 'share jump pulse');
    const start = code.indexOf('    // spawn pads\n', code.indexOf('  _compose(dt) {'));
    const end = code.indexOf('    // transient effects\n', start);
    if (start < 0 || end < start) throw Error('UI queue spawn pad boundary');
    let pads = code.slice(start, end);
    pads = once(pads, '      this.toCanvas(p.x, p.z, tc);\n      const r = (this.level.spawnBarrier || 4) * s * 0.62;',
      '      this.toCanvas(p.x, p.z, tc);\n      const r = (this.level.spawnBarrier || 4) * s * 0.62;\n      let paths = null;\n      if (typeof Path2D === \'function\') {\n        const cache = this._queueSpawnPaths || (this._queueSpawnPaths = []);\n        paths = cache[team];\n        if (!paths || paths.x !== tc.x || paths.y !== tc.y || paths.r !== r || paths.ctor !== Path2D) {\n          const outer = new Path2D(), inner = new Path2D(); outer.arc(tc.x, tc.y, r, 0, TAU); inner.arc(tc.x, tc.y, r * 0.45, 0, TAU);\n          paths = cache[team] = { x: tc.x, y: tc.y, r, ctor: Path2D, outer, inner };\n        }\n      }', 'spawn geometry cache');
    pads = once(pads, '      c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU);', '      if (!paths) { c.beginPath(); c.arc(tc.x, tc.y, r, 0, TAU); }', 'outer fallback');
    pads = pads.replaceAll('c.fill();', 'paths ? c.fill(paths.outer) : c.fill();').replaceAll('c.stroke();', 'paths ? c.stroke(paths.outer) : c.stroke();');
    pads = once(pads, '      c.beginPath(); c.arc(tc.x, tc.y, r * 0.45, 0, TAU); c.fillStyle = hex[team]; paths ? c.fill(paths.outer) : c.fill();\n      c.lineWidth = 2.5; c.strokeStyle = \'#15121c\'; paths ? c.stroke(paths.outer) : c.stroke();',
      '      if (!paths) { c.beginPath(); c.arc(tc.x, tc.y, r * 0.45, 0, TAU); } c.fillStyle = hex[team]; paths ? c.fill(paths.inner) : c.fill();\n      c.lineWidth = 2.5; c.strokeStyle = \'#15121c\'; paths ? c.stroke(paths.inner) : c.stroke();', 'inner cached path');
    code = code.slice(0, start) + pads + code.slice(end);
  }
  if (rel === 'src/game/showcase.js') {
    const start = code.indexOf('class InkFX {'), end = code.indexOf('\nclass Confetti {', start);
    if (start < 0 || end < start) throw Error('UI queue InkFX boundary');
    let part = code.slice(start, end);
    part = once(part, '    this.K = new Uint8Array(N);', '    this._queueFirstFree = 0;\n    this.K = new Uint8Array(N);', 'InkFX slot owner');
    part = once(part, '  _slot() { for (let i = 0; i < this.N; i++) if (!this.K[i]) return i; return -1; }', '  _slot() { for (let i = this._queueFirstFree ?? 0; i < this.N; i++) if (!this.K[i]) return i; return -1; }', 'InkFX lowest free slot');
    part = once(part, 'this.K[i] = kind;', 'this.K[i] = kind; this._queueFirstFree = this.K[i] ? i + 1 : i;', 'slot advance only after occupied write');
    part = once(part, '    this.K.fill(0);', '    this._queueFirstFree = 0; this.K.fill(0);', 'clear restores free floor');
    if (part.split('this.K[i] = 0;').length !== 4) throw Error('UI queue InkFX retirement count');
    part = part.replaceAll('this.K[i] = 0;', 'this.K[i] = 0; this._queueFirstFree = Math.min(this._queueFirstFree, i);');
    code = code.slice(0, start) + part + code.slice(end);
  }
  return code;
}
