// iOS / coarse-pointer controls for INKWAVE.
// No gameplay logic lives here: this only produces a unified mobile input state.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const coarseMQ = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;

export const isIOSLike = () => {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};
export const isCoarsePointer = () => !!(coarseMQ?.matches || navigator.maxTouchPoints > 0);
export const mobileProfile = () => ({ ios: isIOSLike(), touch: isCoarsePointer() });

function stop(e) {
  if (e.cancelable) e.preventDefault();
  e.stopPropagation();
}

export class MobileInput {
  constructor(canvas, owner) {
    this.canvas = canvas;
    this.owner = owner;
    this.active = isCoarsePointer();
    this.moveX = 0; this.moveY = 0;
    this.lookDX = 0; this.lookDY = 0;
    this.buttons = Object.create(null);
    this.pressed = new Set();
    this.mapOpen = false;
    this.jumpTarget = -1;
    this.onPause = null;
    this.gyroEnabled = false;
    this.gyroGranted = false;
    this._gyroPrev = null;
    this._lookId = -1;
    this._lookX = 0; this._lookY = 0;
    this._moveId = -1;
    this._moveOriginX = 0; this._moveOriginY = 0;
    this._abort = new AbortController();
    if (!this.active) return;
    this._install();
  }

  down(name) { return !!this.buttons[name]; }
  wasPressed(name) { return this.pressed.has(name); }
  consumeJumpTarget() {
    const v = this.jumpTarget; this.jumpTarget = -1;
    if (v >= 0) { this.mapOpen = false; this.buttons.map = false; this.root?.classList.remove('is-map'); }
    return v;
  }

  async requestGyro() {
    try {
      const DOE = window.DeviceOrientationEvent;
      if (!DOE) return false;
      if (typeof DOE.requestPermission === 'function') {
        const r = await DOE.requestPermission();
        if (r !== 'granted') return false;
      }
      this.gyroGranted = true;
      this.gyroEnabled = true;
      return true;
    } catch { return false; }
  }

  setGyro(on) {
    this.gyroEnabled = !!on && this.gyroGranted;
    this._gyroPrev = null;
  }

  setVisible(on) {
    if (!this.root) return;
    this.root.classList.toggle('is-active', !!on);
    if (!on) this.reset();
  }

  _install() {
    const sig = this._abort.signal;
    document.documentElement.classList.add('iw-mobile');
    const root = document.createElement('div');
    root.id = 'iw-mobile-controls';
    root.innerHTML = `
      <div class="iwm-rotate">↻<b>横向きにしてください</b></div>
      <div class="iwm-look" data-zone="look"></div>
      <div class="iwm-stick" data-zone="move"><i></i></div>
      <div class="iwm-actions">
        <button data-hold="fire" class="iwm-fire">FIRE</button>
        <button data-hold="squid" class="iwm-squid">SQUID</button>
        <button data-hold="jump" class="iwm-jump">JUMP</button>
        <button data-hold="sub" class="iwm-sub">SUB</button>
        <button data-hold="special" class="iwm-special">SPECIAL</button>
      </div>
      <button class="iwm-map" data-toggle="map">MAP</button>
      <button class="iwm-pause" data-press="pause">Ⅱ</button>
      <button class="iwm-gyro" data-toggle="gyro">GYRO</button>
      <div class="iwm-jumps">
        <button data-jump="0">1</button><button data-jump="1">2</button><button data-jump="2">3</button><button data-jump="3">HOME</button>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.stick = root.querySelector('.iwm-stick');
    this.knob = this.stick.firstElementChild;
    this.look = root.querySelector('.iwm-look');
    this.jumps = root.querySelector('.iwm-jumps');
    this.gyroBtn = root.querySelector('.iwm-gyro');

    const block = (e) => { if (e.target.closest?.('#iw-mobile-controls') || e.target === canvas) stop(e); };
    for (const type of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(type, block, { passive: false, signal: sig });
    }
    document.addEventListener('dblclick', block, { passive: false, signal: sig });

    this.stick.addEventListener('pointerdown', (e) => this._moveStart(e), { signal: sig });
    this.stick.addEventListener('pointermove', (e) => this._moveDrag(e), { signal: sig });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) this.stick.addEventListener(t, (e) => this._moveEnd(e), { signal: sig });

    this.look.addEventListener('pointerdown', (e) => this._lookStart(e), { signal: sig });
    this.look.addEventListener('pointermove', (e) => this._lookDrag(e), { signal: sig });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) this.look.addEventListener(t, (e) => this._lookEnd(e), { signal: sig });

    for (const b of root.querySelectorAll('[data-hold]')) {
      const name = b.dataset.hold;
      const on = (e) => { stop(e); b.setPointerCapture?.(e.pointerId); this.buttons[name] = true; this.pressed.add(name); this.owner.lastDevice = 'touch'; };
      const off = (e) => { stop(e); this.buttons[name] = false; b.releasePointerCapture?.(e.pointerId); };
      b.addEventListener('pointerdown', on, { signal: sig });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, off, { signal: sig });
    }

    root.querySelector('[data-toggle="map"]').addEventListener('pointerdown', (e) => {
      stop(e); this.mapOpen = !this.mapOpen; this.buttons.map = this.mapOpen; this.pressed.add('map');
      root.classList.toggle('is-map', this.mapOpen); this.owner.lastDevice = 'touch';
    }, { signal: sig });

    root.querySelector('[data-press="pause"]').addEventListener('pointerdown', (e) => {
      stop(e); this.pressed.add('pause'); this.onPause?.(); this.owner.lastDevice = 'touch';
    }, { signal: sig });

    for (const b of root.querySelectorAll('[data-jump]')) b.addEventListener('pointerdown', (e) => {
      stop(e); this.jumpTarget = Number(b.dataset.jump); this.pressed.add('jumpTarget'); this.owner.lastDevice = 'touch';
    }, { signal: sig });

    this.gyroBtn.addEventListener('pointerdown', async (e) => {
      stop(e);
      if (!this.gyroGranted) await this.requestGyro(); else this.setGyro(!this.gyroEnabled);
      this.gyroBtn.classList.toggle('is-on', this.gyroEnabled);
    }, { signal: sig });

    window.addEventListener('deviceorientation', (e) => this._orientation(e), { passive: true, signal: sig });
    window.addEventListener('blur', () => this.reset(), { signal: sig });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); }, { signal: sig });
    screen.orientation?.addEventListener?.('change', () => { this._gyroPrev = null; this.resetPointers(); }, { signal: sig });
  }

  _moveStart(e) {
    stop(e); this._moveId = e.pointerId; this.stick.setPointerCapture?.(e.pointerId);
    const r = this.stick.getBoundingClientRect(); this._moveOriginX = r.left + r.width / 2; this._moveOriginY = r.top + r.height / 2;
    this._moveDrag(e); this.owner.lastDevice = 'touch';
  }
  _moveDrag(e) {
    if (e.pointerId !== this._moveId) return; stop(e);
    const r = this.stick.getBoundingClientRect(); const max = Math.max(28, r.width * 0.34);
    let dx = e.clientX - this._moveOriginX, dy = e.clientY - this._moveOriginY;
    const d = Math.hypot(dx, dy); if (d > max) { dx *= max / d; dy *= max / d; }
    const mag = Math.min(1, d / max); const dead = 0.08; const k = mag <= dead ? 0 : (mag - dead) / (1 - dead);
    if (d > 0) { this.moveX = (dx / d) * k; this.moveY = -(dy / d) * k; } else this.moveX = this.moveY = 0;
    this.knob.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`;
  }
  _moveEnd(e) {
    if (e.pointerId !== this._moveId) return; stop(e); this._moveId = -1; this.moveX = this.moveY = 0; this.knob.style.transform = 'translate3d(0,0,0)';
  }

  _lookStart(e) {
    if (e.target.closest?.('button')) return; stop(e); this._lookId = e.pointerId; this._lookX = e.clientX; this._lookY = e.clientY;
    this.look.setPointerCapture?.(e.pointerId); this.owner.lastDevice = 'touch';
  }
  _lookDrag(e) {
    if (e.pointerId !== this._lookId) return; stop(e);
    const dx = clamp(e.clientX - this._lookX, -80, 80), dy = clamp(e.clientY - this._lookY, -80, 80);
    this._lookX = e.clientX; this._lookY = e.clientY;
    this.lookDX += dx * 1.15; this.lookDY += dy * 1.15; this.owner.lastDevice = 'touch';
  }
  _lookEnd(e) { if (e.pointerId !== this._lookId) return; stop(e); this._lookId = -1; }

  _orientation(e) {
    if (!this.gyroEnabled || e.alpha == null || e.beta == null || e.gamma == null) return;
    const cur = { a: e.alpha, b: e.beta, g: e.gamma };
    const p = this._gyroPrev; this._gyroPrev = cur; if (!p) return;
    const d = (x, y) => { let v = x - y; if (v > 180) v -= 360; if (v < -180) v += 360; return clamp(v, -8, 8); };
    const da = d(cur.a, p.a), db = d(cur.b, p.b), dg = d(cur.g, p.g);
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    let yaw = da, pitch = 0;
    if (Math.abs(angle) === 90) pitch = (angle === 90 ? -dg : dg); else pitch = db;
    this.lookDX += yaw * 1.55; this.lookDY += pitch * 1.35;
    this.owner.lastDevice = 'touch';
  }

  endFrame() { this.lookDX = 0; this.lookDY = 0; this.pressed.clear(); }
  resetPointers() { this._lookId = this._moveId = -1; this.moveX = this.moveY = 0; if (this.knob) this.knob.style.transform = 'translate3d(0,0,0)'; }
  reset() { this.resetPointers(); this.lookDX = this.lookDY = 0; for (const k of Object.keys(this.buttons)) this.buttons[k] = false; this.mapOpen = false; this.root?.classList.remove('is-map'); }
  destroy() { this._abort.abort(); this.root?.remove(); document.documentElement.classList.remove('iw-mobile'); }
}
