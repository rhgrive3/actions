// Touch takes the mouse-lock lifetime, including its asynchronous completion.
import {replaceOnce} from './input-adapter.mjs';
export function adaptTouchPointerLock(rel, code) {
  if (rel !== 'src/core/input.js') return code;
  if (code.includes('_releaseMouseForTouch')) throw new Error('INKWAVE touch pointer-lock conflict: already connected');
  code=replaceOnce(code,'    this._dev = v;','    this._dev = v;\n    if (v === \'touch\') this._releaseMouseForTouch();','touch releases mouse ownership');
  code=replaceOnce(code,"    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.lastDevice = 'touch'; }, { capture: true, passive: true });",`    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') this.lastDevice = 'touch';
      else if (e.pointerType === 'mouse' && e.target === this.canvas && this.enabled && this._touchRelockWanted &&
        !this.mobile?._ptr?.size && !(this.mobile?._stick?.id >= 0)) {
        this.lastDevice = 'kbm';
        if (!this._touchUnlockPending && G.mode === 'match' && G.match?.state === 'playing' &&
          !G.match.paused && !G.match.attract && !G.game?.menus?.current) {
          if (document.pointerLockElement === this.canvas) { this.locked = true; this._touchRelockWanted = false; }
          else this.requestLock();
        }
      }
    }, { capture: true, passive: true });`,'deliberate mouse reacquisition after touch');
  code=replaceOnce(code,"    window.addEventListener('mousemove', (e) => {\n      if (!this.locked) return;","    window.addEventListener('mousemove', (e) => {\n      if (!this.locked || this._touchUnlockPending || this.lastDevice === 'touch') return;",'ignore queued locked motion during touch');
  code=replaceOnce(code,`      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.mouse.left = this.mouse.right = false; this.mouse.leftPressed = this.mouse.rightPressed = false; this.mouse.dx = this.mouse.dy = 0; this.onUnlock?.(); }`,`      const wasLocked = this.locked;
      const locked = document.pointerLockElement === this.canvas;
      if (locked && (this.lastDevice === 'touch' || this._touchUnlockPending)) {
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
  return replaceOnce(code,'  requestLock() {',`  _releaseMouseForTouch() {
    // A handoff ends the mouse hold without a mouse-up: Actor must not release a charge / bomb into a shot (#903).
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

  requestLock() {`,'touch pointer-lock lifecycle owner');
}
