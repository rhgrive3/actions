// Build-time correction of public touch gesture ownership. No runtime module is added.
function replaceOnce(code, before, after, rel) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) >= 0) {
    throw new Error(`Reliability mobile anchor mismatch: ${rel}`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptMobile(rel, code) {
  if (rel !== 'src/core/mobile.js') return code;
  code = replaceOnce(code, '    this.pressed = new Set();', `    this.pressed = new Set();
    this._pendingEdges = new Set(); // separate pending taps from cancelled pointer holds
    this._cancelled = new Set(); // holds the platform ended (pointercancel / reset), not a deliberate finger-up`, rel);
  code = replaceOnce(code, '  wasPressed(name) { return this.pressed.has(name); }',
    '  wasPressed(name) { return this.pressed.has(name); }\n  wasCancelled(name) { return this._cancelled.has(name); }', rel);
  code = replaceOnce(code, `  setMap(open) {
    this.mapOpen = !!open;`, `  setMap(open) {
    const opening = !!open && !this.mapOpen;
    this.mapOpen = !!open;`, rel);
  code = replaceOnce(code, '    if (this.mapOpen) this._releaseAll(true);', '    if (opening) this._releaseAll(true);', rel);
  code = replaceOnce(code, '  endFrame() { this.lookDX = 0; this.lookDY = 0; this.pressed.clear(); }',
    '  endFrame() { this.lookDX = 0; this.lookDY = 0; this.pressed.clear(); this._pendingEdges.clear(); this._cancelled.clear(); }', rel);
  code = replaceOnce(code, `  resetPointers() {
    this._ptr.clear();`, `  resetPointers() {
    // A reset ends holds without a finger-up: Actor must not release charges / bombs into shots (pending taps just drop).
    for (const p of this._ptr.values()) if (p.kind === 'btn' && this.buttons[p.id]) this._cancelled.add(p.id);
    this.pressed.clear(); this._pendingEdges.clear();
    this.jumpTarget = -1;
    this.lookDX = this.lookDY = 0; this.gyro.discard();
    this._ptr.clear();`, rel);
  code = replaceOnce(code, '  reset() { this.resetPointers(); this.lookDX = this.lookDY = 0; this.setMap(false); this.gyro.discard(); }',
    '  reset() { this.resetPointers(); this.setMap(false); }', rel);
  code = replaceOnce(code, '    this._stick.id = -1; this.moveX = this.moveY = 0;',
    '    this._stick.id = -1; this._stick.active = false; this.moveX = this.moveY = 0;', rel);
  code = replaceOnce(code, '    if (!on) this._releaseAll(false);', '    if (!on) this.resetPointers();', rel);
  code = replaceOnce(code, `    // look
    this._ptr.set(e.pointerId, { kind: 'look', x, y });`, `    // Ordinary look is owned by its starting half; buttons and the stick keep priority.
    if (x >= W * 0.5) this._ptr.set(e.pointerId, { kind: 'look', x, y });`, rel);
  code = replaceOnce(code, `    if (p.kind === 'btn') this._release(p.id);`, `    if (p.kind === 'tap') { this._tapEnd(p, e); return; }
    if (p.kind === 'btn') {
      const cancelled = e.type === 'pointercancel' || e.type === 'lostpointercapture';
      if (cancelled) {
        this._pendingEdges.delete(p.edge);
        if (![...this._pendingEdges].some((edge) => edge.id === p.id)) this.pressed.delete(p.id);
      }
      this._release(p.id);
      // A platform cancel is not a finger-up: Actor must not turn the dropped hold into a release shot / throw.
      if (cancelled && !this.buttons[p.id]) this._cancelled.add(p.id);
    }`, rel);
  code = replaceOnce(code, `    this._ptr.set(e.pointerId, { kind: 'btn', id, x: e.clientX, y: e.clientY, acc: 0, aiming: false });`,
    `    const edge = { id };
    this._pendingEdges.add(edge);
    this._cancelled.delete(id); // a new hold supersedes an earlier cancel
    this._ptr.set(e.pointerId, { kind: 'btn', id, edge, x: e.clientX, y: e.clientY, acc: 0, aiming: false });`, rel);
  // MAP / PAUSE are tap controls: a completed tap commits them, so pointercancel (palm rejection, app switch) cannot.
  code = replaceOnce(code, `    if (C.toggle) { this.setMap(!this.mapOpen); this.pressed.add('map'); return; }
    if (C.press) {
      el.classList.add('is-down'); setTimeout(() => el.classList.remove('is-down'), 140);
      if (id === 'pause') { this.pressed.add('pause'); this.onPause?.(); }
      if (id === 'gyro')`, `    if (C.toggle || (C.press && id === 'pause')) { this._tapStart(id, e, false); return; }
    if (C.press) {
      el.classList.add('is-down'); setTimeout(() => el.classList.remove('is-down'), 140);
      if (id === 'gyro')`, rel);
  code = replaceOnce(code, "{ this.setMap(true); this.pressed.add('map'); this._buzz(8); return; }",
    "{ this._tapStart('map', e, true); return; }", rel);
  code = replaceOnce(code, '  _release(id) {', `  _tapStart(id, e, open) {
    this._buzz(8);
    this._ptr.set(e.pointerId, { kind: 'tap', id, open, x: e.clientX, y: e.clientY });
    if (!open) this.els[id]?.classList.add('is-down');
  }
  _tapEnd(p, e) {
    if (!p.open) this.els[p.id]?.classList.remove('is-down');
    // Only a completed tap on the same pointer commits; pointercancel / premature lostpointercapture / drift drop it.
    if (e.type !== 'pointerup' || this.editing || Math.hypot((e.clientX ?? p.x) - p.x, (e.clientY ?? p.y) - p.y) > 24) return;
    if (p.id === 'map') { this.setMap(p.open || !this.mapOpen); this.pressed.add('map'); }
    else { this.pressed.add('pause'); this.onPause?.(); }
  }
  _release(id) {`, rel);
  code = replaceOnce(code, `  _releaseAll(keepMap) {
    for (const [pid, p] of this._ptr) { if (p.kind === 'btn') this._release(p.id); this._ptr.delete(pid); }
    for (const k of Object.keys(this.buttons)) if (!(keepMap && k === 'map')) this.buttons[k] = false;
    this._stickEnd();
  }`, `  _releaseAll(keepMap) {
    this.resetPointers();
    if (!keepMap) this.buttons.map = false;
  }`, rel);
  return code;
}
