// Touch takes the mouse-lock lifetime, including its asynchronous completion.
import {replaceOnce} from './input-adapter.mjs';
export function adaptTouchPointerLock(rel, code) {
  if (rel !== 'src/core/input.js') return code;
  if (code.includes('_releaseMouseForTouch')) throw new Error('INKWAVE touch pointer-lock conflict: already connected');
  code = "import { isMobilePointer } from '../../patches/local-quality/first-touch-adapter.mjs';\n" + code;
  code = replaceOnce(code,
    'if (p && p.catch) p.catch(() => { try { const q = this.canvas.requestPointerLock();',
    "if (p && p.catch) p.catch(() => { if (!this._pointerLockRequestCurrent(lockRequest) || !this.enabled || this.lastDevice === 'touch' || this._touchUnlockPending || this._touchLockAdmissionBlocked || this.mobile?.editing || this.mobile?.mapOpen || G.mode !== 'match' || G.match?.state !== 'playing' || G.match.paused || G.game?.menus?.current) return; try { const q = this.canvas.requestPointerLock();",
    'pointer-lock fallback needs current playing admission');
  code=replaceOnce(code,'    this._dev = v;','    this._dev = v;\n    if (v === \'touch\') this._releaseMouseForTouch();','touch releases mouse ownership');
  code=replaceOnce(code,"    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.lastDevice = 'touch'; }, { capture: true, passive: true });",`    window.addEventListener('pointerdown', (e) => {
      if (isMobilePointer(e)) this.lastDevice = 'touch';
      else if (e.pointerType === 'mouse' && this.enabled && (this._touchRelockWanted || this._dev === 'touch') && this._isTouchOverlayReacquireTarget(e.target, true) &&
        !this.mobile?._ptr?.size && !(this.mobile?._stick?.id >= 0)) {
        const touchBoot = !this._touchRelockWanted && this._dev === 'touch';
        // onDeviceChange may close the touch map/editor while hiding controls.
        // The same gesture must still honor the UI state it started in.
        const touchUiBlocked = this.mobile?.editing || this.mobile?.mapOpen || !this._isTouchOverlayReacquireTarget(e.target);
        this._touchLockAdmissionBlocked = !!touchUiBlocked;
        this.lastDevice = 'kbm';
        if (touchBoot) this._dev = 'kbm';
        if (!this._touchUnlockPending && !touchUiBlocked && !this.mobile?.editing && !this.mobile?.mapOpen && G.mode === 'match' && G.match?.state === 'playing' &&
          !G.match.paused && !G.match.attract && !G.game?.menus?.current) {
          if (document.pointerLockElement === this.canvas) { this._beginPointerLockRequest(); this.locked = true; this._touchRelockWanted = false; }
          else this.requestLock();
        }
      }
    }, { capture: true, passive: true });`,'deliberate mouse reacquisition after touch');
  code=replaceOnce(code,"    window.addEventListener('mousemove', (e) => {\n      if (!this.locked) return;","    window.addEventListener('mousemove', (e) => {\n      if (!this.locked || this._touchUnlockPending || this.lastDevice === 'touch') return;",'ignore queued locked motion during touch');
  code=replaceOnce(code,`      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.mouse.left = this.mouse.right = false; this.mouse.leftPressed = this.mouse.rightPressed = false; this.mouse.dx = this.mouse.dy = 0; this.onUnlock?.(); }`,`      const wasLocked = this.locked;
      const locked = document.pointerLockElement === this.canvas;
      if (locked && (!this.enabled || !this._pointerLockRequestCurrent(this._pointerLockRequest) || this.lastDevice === 'touch' || this._touchUnlockPending || this._touchLockAdmissionBlocked || this.mobile?.editing || this.mobile?.mapOpen || G.match?.paused || G.game?.menus?.current)) {
        this.locked = false;
        if (!this._touchUnlockPending) this._releaseMouseForTouch();
        return;
      }
      this.locked = locked;
      if (locked) { this._touchRelockWanted = false; return; }
      const touchUnlock = this._touchUnlockPending;
      this._touchUnlockPending = false;
      this.mouse.left = this.mouse.right = false; this.mouse.leftPressed = this.mouse.rightPressed = false; this.mouse.dx = this.mouse.dy = 0;
      if (!touchUnlock && wasLocked) this.onUnlock?.();`,'touch unlock is not Escape');
  code = replaceOnce(code,
    "    if (this._dev === 'touch' || this.locked) return;\n    try {",
    "    if (this._dev === 'touch' || this.locked) return;\n    const lockRequest = this._beginPointerLockRequest();\n    try {",
    'pointer-lock request identity');
  code = replaceOnce(code,
    '  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }',
    '  exitLock() { this._pointerLockCanceled = true; this._pointerLockRequest = null; if (document.pointerLockElement) document.exitPointerLock(); }',
    'exit cancels pending pointer-lock request');
  return replaceOnce(code,'  requestLock() {',`  _beginPointerLockRequest() {
    this._pointerLockCanceled = false;
    // Initial/menu and intro capture keeps its existing admission. A live-play
    // reacquisition belongs to this match and cannot survive its replacement/end.
    return this._pointerLockRequest = {
      match: G.mode === 'match' && G.match?.state === 'playing' ? G.match : null,
    };
  }

  _pointerLockRequestCurrent(request) {
    return !this._pointerLockCanceled && request === this._pointerLockRequest &&
      (!request?.match || (G.mode === 'match' && G.match === request.match &&
        G.match.state === 'playing' && !G.match.attract));
  }

  _isTouchOverlayReacquireTarget(target, includeEditor = false) {
    const mobile = this.mobile;
    // A physical mouse can acquire KBM even while map/editor prevent lock.
    // Pointer Lock admission stays in the separate playing-context guard.
    if (!mobile) return false;
    if (target === this.canvas) return true;
    const root = mobile.root;
    if (!root) return false;
    if (typeof target?.closest === 'function') {
      try {
        if (target.closest('#iw-mobile-controls .iwm-edit, #iw-mobile-controls .iwm-rotate')) return includeEditor;
        if (target.closest('#iw-mobile-controls .iwm-look, #iw-mobile-controls .iwm-movezone, #iw-mobile-controls .iwm-b')) return true;
      } catch { return false; }
    }
    try { if (typeof root.contains === 'function' && root.contains(target)) return target !== root; } catch { return false; }
    return false;
  }

  _releaseMouseForTouch() {
    // A handoff ends the mouse hold without a mouse-up: do not release a charge / bomb into a shot (#903).
    const cancelled = this._holdCancelled || (this._holdCancelled = new Set());
    if (this.mouse.left) cancelled.add('fire');
    if (this.mouse.right) cancelled.add('sub');
    this.mouse.left = this.mouse.right = this.mouse.leftPressed = this.mouse.rightPressed = false;
    this.mouse.dx = this.mouse.dy = 0;
    if (!this.locked && document.pointerLockElement !== this.canvas) return;
    this.locked = false; this._touchRelockWanted = true;
    if (this._touchUnlockPending) return;
    this._touchUnlockPending = true;
    try { this.exitLock(); }
    catch { this._touchUnlockPending = false; } // A later explicit mouse gesture can reuse the still-held lock.
  }

  requestLock() {
    // An explicit eligible request is fresh admission too (e.g. keyboard play).
    // Async browser fallback calls the canvas directly and cannot clear this.
    if (this.enabled && this.lastDevice !== 'touch' && !this.locked && !this._touchUnlockPending &&
      !this.mobile?.editing && !this.mobile?.mapOpen && G.mode === 'match' && G.match?.state === 'playing' &&
      !G.match.paused && !G.match.attract && !G.game?.menus?.current) this._touchLockAdmissionBlocked = false;`,'touch pointer-lock lifecycle owner');
}
