// INKWAVE — touch controls for phones and tablets (no gameplay logic: produces a unified touch input state).
//
//   · floating (or fixed) move stick on the left — reaches full run speed at ~60 % deflection, the base follows the
//     thumb, so walking is never "stuck slow" on glass
//   · swipe-to-aim on the right, scaled to the screen size (same feel on a phone and an iPad) + optional gyro
//   · FIRE / SQUID / SUB can be dragged while held to keep aiming ("aim while firing")
//   · SP button doubles as the special gauge; MAP / Ⅱ / GYRO quick buttons
//   · every control can be moved and resized in the layout editor (saved per device, anchored to the nearest edges
//     so a layout survives rotation and different aspect ratios)
import { Gyro, touchSensMul } from './gyro.js';
import { touchPrimary, touchCapable } from './device.js';
import { t } from '../i18n.js';
import { WEAPON_ICONS, SUB_ICONS, SQUID, specialIcon } from '../ui/ui-icons.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const LAYOUT_KEY = 'inkwave.touchLayout';

// Anchor-relative defaults. dx/dy: distance from the anchor edges to the control's centre, in units of the screen's
// short side (H). d: diameter in H. Tuned so nothing overlaps from 16:9 tablets to 21:9 phones.
export const CONTROLS = {
  stick:   { ax: 'l', ay: 'b', dx: 0.33, dy: 0.33, d: 0.32, label: 'Move' },
  fire:    { ax: 'r', ay: 'b', dx: 0.21, dy: 0.25, d: 0.30, label: 'Fire', hold: true, aim: true },
  squid:   { ax: 'r', ay: 'b', dx: 0.52, dy: 0.14, d: 0.21, label: 'SQUID', hold: true, aim: true },
  jump:    { ax: 'r', ay: 'b', dx: 0.46, dy: 0.39, d: 0.19, label: 'Jump', hold: true },
  sub:     { ax: 'r', ay: 'b', dx: 0.14, dy: 0.53, d: 0.16, label: 'SUB', hold: true, aim: true },
  special: { ax: 'r', ay: 'b', dx: 0.33, dy: 0.62, d: 0.19, label: 'SP', hold: true },
  map:     { ax: 'l', ay: 't', dx: 0.10, dy: 0.40, d: 0.12, label: 'Map', toggle: true },
  gyro:    { ax: 'r', ay: 't', dx: 0.20, dy: 0.08, d: 0.10, label: 'GYRO', press: true },
  pause:   { ax: 'r', ay: 't', dx: 0.07, dy: 0.08, d: 0.10, label: 'Ⅱ', press: true },
};
const ORDER = ['stick', 'map', 'gyro', 'pause', 'special', 'sub', 'jump', 'squid', 'fire'];
// names only for the layout editor / screen readers — the buttons themselves are icon-only
const JA_LABEL = { fire: 'メイン', squid: 'イカ', jump: 'ジャンプ', sub: 'サブ', special: 'スペシャル', map: 'マップ', gyro: 'ジャイロ', pause: 'ポーズ', stick: 'スティック' };
const EN_LABEL = { fire: 'Main', squid: 'Squid', jump: 'Jump', sub: 'Sub', special: 'Special', map: 'Map', gyro: 'Gyro', pause: 'Pause', stick: 'Stick' };
const JUMP_ICON = '<svg class="iw-ico" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 10 L52 34 H40 V54 H24 V34 H12 Z" fill="currentColor" stroke="#15121c" stroke-width="3.5" stroke-linejoin="round"/></svg>';
const MAP_ICON = '<svg class="iw-ico" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 16 L24 10 L40 16 L56 10 V48 L40 54 L24 48 L8 54 Z" fill="currentColor" stroke="#15121c" stroke-width="3.5" stroke-linejoin="round"/><path d="M24 10 V48 M40 16 V54" stroke="#15121c" stroke-width="3.5"/></svg>';
const PAUSE_ICON = '<svg class="iw-ico" viewBox="0 0 64 64" aria-hidden="true"><rect x="17" y="13" width="11" height="38" rx="4" fill="currentColor" stroke="#15121c" stroke-width="3"/><rect x="36" y="13" width="11" height="38" rx="4" fill="currentColor" stroke="#15121c" stroke-width="3"/></svg>';
const GYRO_ICON = '<svg class="iw-ico" viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="20" width="36" height="24" rx="6" fill="currentColor" stroke="#15121c" stroke-width="3.5" transform="rotate(-14 32 32)"/><path d="M9 20 A26 26 0 0 1 29 7 M55 44 A26 26 0 0 1 35 57" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/></svg>';

/** Layout unit: the screen's short side, capped so controls keep a thumb-sized PHYSICAL size on tablets (an iPad's
 *  834 px short side would otherwise make FIRE ~5 cm wide) and swipes turn the same amount per centimetre. */
const layoutUnit = () => clamp(Math.min(innerWidth, innerHeight), 300, 460);

function stop(e) { if (e.cancelable) e.preventDefault(); e.stopPropagation(); }
function loadLayout() {
  try { const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function saveLayout(v) { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(v)); } catch { /* private mode */ } }

export class MobileInput {
  constructor(canvas, owner) {
    this.canvas = canvas;
    this.owner = owner;
    this.active = touchCapable;           // listeners installed (hybrids too)
    this.moveX = 0; this.moveY = 0;
    this.lookDX = 0; this.lookDY = 0;     // radians this frame (already scaled; +x = turn right, +y = look down)
    this.buttons = Object.create(null);
    this.pressed = new Set();
    this.mapOpen = false;
    this.jumpTarget = -1;
    this.onPause = null;
    this.onGyroToggle = null;
    this.gyro = new Gyro();
    this.s = { touchSens: 0, touchScale: 1, touchOpacity: 0.85, stickMode: 'float', fireAim: true, gyro: false, rumble: 1 };
    this.layout = loadLayout();
    this.visible = false;
    this.editing = false;
    this._ptr = new Map();                // pointerId → { kind, id, x, y, ... }
    this._stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this._abort = new AbortController();
    if (!this.active) return;
    this._install();
  }

  // ------------------------------------------------------------------------------------------ public
  down(name) { return !!this.buttons[name]; }
  wasPressed(name) { return this.pressed.has(name); }
  consumeJumpTarget() {
    const v = this.jumpTarget; this.jumpTarget = -1;
    if (v >= 0) this.setMap(false);
    return v;
  }
  applySettings(s) {
    const S = this.s;
    for (const k of ['touchSens', 'touchScale', 'touchOpacity', 'stickMode', 'fireAim', 'rumble']) if (s[k] != null) S[k] = s[k];
    this.gyro.configure({ sens: s.gyroSens, invX: s.gyroInvertX, invY: s.gyroInvertY });
    if (this.root) { this.root.style.setProperty('--iwm-op', String(clamp(+S.touchOpacity || 0.85, 0.2, 1))); this._layoutAll(); }
  }
  /** Turn gyro aim on/off. Turning on from a tap asks for iOS permission first. Resolves to the final state. */
  setGyro(on) {
    if (!on) { this.gyro.stop(); this.s.gyro = false; this._gyroBtn(); return Promise.resolve(false); }
    const go = () => { this.gyro.start(); this.s.gyro = true; this._gyroBtn(); return true; };
    if (this.gyro.needsPermission) return this.gyro.request().then((ok) => (ok ? go() : (this._gyroBtn(), false)));
    if (!this.gyro.supported) return Promise.resolve(false);
    return Promise.resolve(go());
  }
  setVisible(on) {
    this.visible = !!on;
    this._syncVisible();
    if (!on) this.reset();
  }
  setMap(open) {
    this.mapOpen = !!open; this.buttons.map = this.mapOpen;
    this.root?.classList.toggle('is-map', this.mapOpen);
    this.els?.map?.classList.toggle('is-on', this.mapOpen);
    if (this.mapOpen) this._releaseAll(true);
  }
  /** HUD feed: special gauge on the SP button, weapon icon on FIRE. */
  setHud({ special = 0, ready = false, activeSp = false, weapon = null, specialId = null, ink = 1, subCost = 0.7 } = {}) {
    const E = this.els; if (!E) return;
    const L = this._hud || (this._hud = {});
    const sp = Math.round(clamp(special, 0, 1) * 100);
    if (sp !== L.sp) { L.sp = sp; E.special.style.setProperty('--g', (sp / 100).toFixed(2)); }
    if (ready !== L.ready) { L.ready = ready; E.special.classList.toggle('is-ready', ready); if (ready) this._buzz(18); }
    if (activeSp !== L.act) { L.act = activeSp; E.special.classList.toggle('is-active', activeSp); }
    if (weapon && weapon !== L.w) { L.w = weapon; E.fire.querySelector('.iwm-b__ico').innerHTML = WEAPON_ICONS[weapon] || WEAPON_ICONS.shooter; }
    if (specialId && specialId !== L.spId) { L.spId = specialId; E.special.querySelector('.iwm-b__ico').innerHTML = specialIcon(specialId); }
    const noSub = ink < subCost - 1e-3;
    if (noSub !== L.noSub) { L.noSub = noSub; E.sub.classList.toggle('is-dim', noSub); }
    const ik = Math.round(clamp(ink, 0, 1) * 50) / 50;
    if (ik !== L.ink) { L.ink = ik; E.fire.style.setProperty('--ink', ik.toFixed(2)); E.fire.classList.toggle('is-low', ik < 0.2); }
  }

  endFrame() { this.lookDX = 0; this.lookDY = 0; this.pressed.clear(); }
  resetPointers() {
    this._ptr.clear();
    this._stick.id = -1; this.moveX = this.moveY = 0;
    this._drawStick(false);
    for (const k of Object.keys(this.buttons)) if (k !== 'map') this.buttons[k] = false;
    this.root?.querySelectorAll('.iwm-b.is-down').forEach((b) => b.classList.remove('is-down'));
  }
  reset() { this.resetPointers(); this.lookDX = this.lookDY = 0; this.setMap(false); this.gyro.discard(); }
  destroy() { this._abort.abort(); this.gyro.stop(); this.root?.remove(); document.documentElement.classList.remove('iw-mobile'); }

  // ------------------------------------------------------------------------------------------ build
  _install() {
    const sig = this._abort.signal;
    document.documentElement.classList.add('iw-mobile');
    const lab = (id) => t(document.documentElement.lang === 'ja' ? JA_LABEL[id] : EN_LABEL[id]);
    const root = document.createElement('div');
    root.id = 'iw-mobile-controls';
    root.innerHTML = `
      <div class="iwm-rotate"><div class="iwm-rotate__card"><i class="iwm-rotate__phone"></i><b>${document.documentElement.lang === 'ja' ? '横向きにしてプレイしてね' : 'Rotate to landscape'}</b></div></div>
      <div class="iwm-look"></div>
      <div class="iwm-movezone"></div>
      <div class="iwm-stick" data-c="stick"><i class="iwm-stick__ring"></i><i class="iwm-stick__dir"></i><i class="iwm-stick__knob"></i></div>
      ${['fire', 'squid', 'jump', 'sub', 'special', 'map', 'gyro', 'pause'].map((id) => `<button type="button" class="iwm-b iwm-b--${id}" data-c="${id}" aria-label="${lab(id)}">
        ${id === 'special' ? '<svg class="iwm-b__gauge" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" pathLength="100"/></svg>' : ''}
        ${id === 'fire' ? '<i class="iwm-b__ink"></i>' : ''}
        <span class="iwm-b__ico">${id === 'fire' ? WEAPON_ICONS.shooter : id === 'squid' ? SQUID : id === 'jump' ? JUMP_ICON : id === 'sub' ? SUB_ICONS.bomb : id === 'special' ? specialIcon('slam') : id === 'map' ? MAP_ICON : id === 'gyro' ? GYRO_ICON : PAUSE_ICON}</span></button>`).join('')}
      <div class="iwm-toast"></div>
      <div class="iwm-edit">
        <div class="iwm-edit__bar">
          <b class="iwm-edit__title">${document.documentElement.lang === 'ja' ? 'ボタン配置の編集' : 'Edit button layout'}</b>
          <span class="iwm-edit__hint">${document.documentElement.lang === 'ja' ? 'ドラッグで移動 ・ 2本指ピンチか下のスライダーで大きさ変更' : 'Drag to move · pinch or use the slider to resize'}</span>
          <button type="button" class="iwm-eb" data-e="reset">${document.documentElement.lang === 'ja' ? 'リセット' : 'Reset'}</button>
          <button type="button" class="iwm-eb" data-e="cancel">${document.documentElement.lang === 'ja' ? 'キャンセル' : 'Cancel'}</button>
          <button type="button" class="iwm-eb is-primary" data-e="save">${document.documentElement.lang === 'ja' ? '保存' : 'Save'}</button>
        </div>
        <div class="iwm-edit__sel"><b class="iwm-edit__name"></b>
          <label>${document.documentElement.lang === 'ja' ? '大きさ' : 'Size'} <input type="range" min="50" max="170" step="5" class="iwm-edit__size"><em class="iwm-edit__pct"></em></label>
          <button type="button" class="iwm-eb" data-e="one">${document.documentElement.lang === 'ja' ? 'このボタンを初期位置へ' : 'Reset this one'}</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.els = {};
    for (const n of root.querySelectorAll('[data-c]')) this.els[n.dataset.c] = n;
    this.lookEl = root.querySelector('.iwm-look');
    this.moveZone = root.querySelector('.iwm-movezone');
    this.stickEl = this.els.stick;
    this.knob = root.querySelector('.iwm-stick__knob');
    this.dirEl = root.querySelector('.iwm-stick__dir');
    this.toastEl = root.querySelector('.iwm-toast');
    root.style.setProperty('--iwm-op', String(this.s.touchOpacity));

    // keep iOS from scrolling / zooming / selecting while playing
    const block = (e) => { if (this.visible || this.editing) { if (e.target.closest?.('#iw-mobile-controls') || e.target === this.canvas) stop(e); } };
    for (const type of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, block, { passive: false, signal: sig });
    document.addEventListener('dblclick', (e) => { if (this.visible) stop(e); }, { passive: false, signal: sig });
    root.addEventListener('contextmenu', (e) => e.preventDefault(), { signal: sig });

    // every control is driven by one pointer router on the root (multi-touch safe, captured per pointer)
    root.addEventListener('pointerdown', (e) => this._down(e), { signal: sig });
    root.addEventListener('pointermove', (e) => this._move(e), { signal: sig });
    for (const ty of ['pointerup', 'pointercancel', 'lostpointercapture']) root.addEventListener(ty, (e) => this._up(e), { signal: sig });
    // editor buttons
    root.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', (e) => { stop(e); this._editAction(b.dataset.e); }, { signal: sig }));
    const size = root.querySelector('.iwm-edit__size');
    size.addEventListener('input', () => { if (this._sel) { this._editScale(this._sel, +size.value / 100); } }, { signal: sig });
    size.addEventListener('pointerdown', (e) => e.stopPropagation(), { signal: sig });

    window.addEventListener('blur', () => this.reset(), { signal: sig });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); else this.gyro.resync(); }, { signal: sig });
    const relayout = () => { this.gyro.resync(); this.resetPointers(); requestAnimationFrame(() => this._layoutAll()); };
    window.addEventListener('resize', relayout, { signal: sig });
    screen.orientation?.addEventListener?.('change', relayout, { signal: sig });
    window.addEventListener('orientationchange', relayout, { signal: sig });
    this._layoutAll();
    this._syncVisible();
  }

  _syncVisible() {
    if (!this.root) return;
    const on = (this.visible && this.owner.lastDevice === 'touch') || this.editing;
    this.root.classList.toggle('is-active', on);
    this.root.classList.toggle('is-editing', this.editing);
    if (!on) this._releaseAll(false);
  }
  /** Called by Input when the last-used device changes (hybrid devices). */
  onDeviceChange() { this._syncVisible(); }

  // ------------------------------------------------------------------------------------------ layout
  /** Safe-area insets (notch / home indicator) measured from a probe laid out with env(safe-area-inset-*). */
  _safe() {
    const p = this._probe || (this._probe = this.root.appendChild(Object.assign(document.createElement('i'), { className: 'iwm-safe' })));
    const r = p.getBoundingClientRect();
    const W = innerWidth, H = innerHeight;
    // a little breathing room from the physical edge even without a notch
    return { l: Math.max(8, r.left), r: Math.max(8, W - r.right), t: Math.max(6, r.top), b: Math.max(6, H - r.bottom) };
  }
  setColor(hex) { this.root?.style.setProperty('--iwm-c', hex); }
  _cfg(id) {
    const d = CONTROLS[id], o = this.layout[id] || {};
    return { ax: o.ax || d.ax, ay: o.ay || d.ay, dx: o.dx ?? d.dx, dy: o.dy ?? d.dy, s: o.s ?? 1, d: d.d };
  }
  /** Centre + diameter of a control in CSS px. */
  _box(id) {
    const W = innerWidth, Hh = innerHeight, H = layoutUnit(), S = this._safeBox || (this._safeBox = this._safe());
    const c = this._cfg(id);
    const gs = clamp(+this.s.touchScale || 1, 0.5, 1.6);
    const dia = c.d * H * c.s * gs;
    const x = c.ax === 'l' ? S.l + c.dx * H : W - S.r - c.dx * H;
    const y = c.ay === 't' ? S.t + c.dy * H : Hh - S.b - c.dy * H;
    return { x, y, d: dia };
  }
  _layoutAll() {
    if (!this.root) return;
    this._safeBox = this._safe();
    this._H = layoutUnit();
    for (const id of ORDER) {
      const el = this.els[id]; if (!el) continue;
      const b = this._box(id);
      el.style.width = el.style.height = `${b.d.toFixed(1)}px`;
      el.style.transform = `translate3d(${(b.x - b.d / 2).toFixed(1)}px,${(b.y - b.d / 2).toFixed(1)}px,0)`;
      if (id === 'stick') { this._stickHome = b; this._stickR = b.d / 2; }
    }
    if (!this._stick.active) this._drawStick(false);
  }

  // ------------------------------------------------------------------------------------------ pointer routing
  _hitButton(x, y) {
    // topmost first; generous hit area (+14 % radius) so fast thumbs never slip off a button edge
    for (let i = ORDER.length - 1; i >= 0; i--) {
      const id = ORDER[i]; if (id === 'stick') continue;
      const el = this.els[id]; if (!el || el.offsetParent === null) continue;
      const b = this._box(id);
      if (Math.hypot(x - b.x, y - b.y) <= (b.d / 2) * 1.14) return id;
    }
    return null;
  }

  _down(e) {
    if (e.pointerType === 'mouse' && !this.editing) return;
    if (e.target.closest?.('.iwm-edit__bar, .iwm-edit__sel')) return;
    stop(e);
    this.owner.lastDevice = 'touch';
    try { this.root.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    if (this.editing) { this._editDown(e); return; }
    const x = e.clientX, y = e.clientY;
    const btn = this._hitButton(x, y);
    if (this.mapOpen && btn !== 'map') return;     // taps pass to the map beacons (the root is click-through there)
    if (btn) { this._press(btn, e); return; }
    // the corner minimap (HUD, underneath this layer) opens the big map when tapped
    const mm = document.querySelector('.iw-hud:not(.is-hidden) .iw-map');
    if (mm && mm.style.display !== 'none') {
      const r = mm.getBoundingClientRect();
      if (r.width > 0 && x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) { this.setMap(true); this.pressed.add('map'); this._buzz(8); return; }
    }
    // move stick: left zone (floating) or on the stick (fixed)
    const W = innerWidth;
    const inMove = this.s.stickMode === 'fixed'
      ? Math.hypot(x - this._stickHome.x, y - this._stickHome.y) <= this._stickR * 1.6 || (x < W * 0.4 && y > innerHeight * 0.35)
      : x < W * 0.42;
    if (inMove && this._stick.id < 0) { this._stickStart(e); return; }
    // look
    this._ptr.set(e.pointerId, { kind: 'look', x, y });
  }

  _move(e) {
    const p = this._ptr.get(e.pointerId);
    if (this.editing) { this._editMove(e); return; }
    if (e.pointerId === this._stick.id) { stop(e); this._stickMove(e); return; }
    if (!p) return;
    stop(e);
    if (p.kind === 'look' || (p.kind === 'btn' && CONTROLS[p.id].aim && this.s.fireAim)) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      const ex = e.clientX, ey = e.clientY;
      let dx = ex - p.x, dy = ey - p.y;
      p.x = ex; p.y = ey;
      if (p.kind === 'btn' && !p.aiming) {
        // a button starts aiming once the thumb clearly slides (tiny wobble while holding FIRE is ignored)
        p.acc = (p.acc || 0) + Math.hypot(dx, dy);
        if (p.acc < 6) return;
        p.aiming = true;
      }
      dx = clamp(dx, -140, 140); dy = clamp(dy, -140, 140);
      void evs;
      const k = (Math.PI * 2) / (2.8 * (this._H || layoutUnit())) * touchSensMul(this.s.touchSens);
      this.lookDX += dx * k; this.lookDY += dy * k * 0.9;
    }
  }

  _up(e) {
    if (this.editing) { this._editUp(e); return; }
    if (e.pointerId === this._stick.id) { this._stickEnd(); return; }
    const p = this._ptr.get(e.pointerId);
    if (!p) return;
    this._ptr.delete(e.pointerId);
    if (p.kind === 'btn') this._release(p.id);
  }

  _press(id, e) {
    const C = CONTROLS[id], el = this.els[id];
    this._buzz(8);
    if (C.toggle) { this.setMap(!this.mapOpen); this.pressed.add('map'); return; }
    if (C.press) {
      el.classList.add('is-down'); setTimeout(() => el.classList.remove('is-down'), 140);
      if (id === 'pause') { this.pressed.add('pause'); this.onPause?.(); }
      if (id === 'gyro') this._toggleGyroFromTap();
      return;
    }
    this._ptr.set(e.pointerId, { kind: 'btn', id, x: e.clientX, y: e.clientY, acc: 0, aiming: false });
    this.buttons[id] = true; this.pressed.add(id);
    el.classList.add('is-down');
  }
  _release(id) {
    // another finger may still hold the same button
    for (const p of this._ptr.values()) if (p.kind === 'btn' && p.id === id) return;
    this.buttons[id] = false;
    this.els[id]?.classList.remove('is-down');
  }
  _releaseAll(keepMap) {
    for (const [pid, p] of this._ptr) { if (p.kind === 'btn') this._release(p.id); this._ptr.delete(pid); }
    for (const k of Object.keys(this.buttons)) if (!(keepMap && k === 'map')) this.buttons[k] = false;
    this._stickEnd();
  }

  _toggleGyroFromTap() {
    const want = !this.gyro.enabled;
    const p = this.setGyro(want);
    p.then((on) => {
      if (want && !on) this.toast(t(this.gyro.supported ? 'Gyro permission was denied. Allow motion access in Safari settings.' : 'Gyro is not available on this device.'), 3.2);
      else this.toast(t(on ? 'Gyro ON' : 'Gyro OFF'), 1.1);
      this.onGyroToggle?.(on);
      if (on) setTimeout(() => { if (this.gyro.enabled && !this.gyro.working) this.toast(t('Gyro is not available on this device.'), 2.6); }, 1500);
    });
  }
  _gyroBtn() { this.els?.gyro?.classList.toggle('is-on', !!this.gyro.enabled); }
  toast(text, sec = 1.4) {
    const el = this.toastEl; if (!el) return;
    el.textContent = text; el.classList.add('is-on');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => el.classList.remove('is-on'), sec * 1000);
  }
  _buzz(ms) { if ((this.s.rumble ?? 1) > 0) { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } } }

  // ------------------------------------------------------------------------------------------ stick
  _stickStart(e) {
    const S = this._stick;
    S.id = e.pointerId; S.active = true;
    if (this.s.stickMode === 'fixed') { S.ox = this._stickHome.x; S.oy = this._stickHome.y; }
    else { S.ox = e.clientX; S.oy = e.clientY; }
    S.x = e.clientX; S.y = e.clientY;
    this._stickUpdate();
  }
  _stickMove(e) { const S = this._stick; S.x = e.clientX; S.y = e.clientY; this._stickUpdate(); }
  _stickEnd() {
    const S = this._stick;
    if (S.id < 0 && !S.active) return;
    S.id = -1; S.active = false;
    this.moveX = this.moveY = 0;
    this._drawStick(false);
  }
  _stickUpdate() {
    const S = this._stick, R = Math.max(26, this._stickR || 50);
    let dx = S.x - S.ox, dy = S.y - S.oy;
    let d = Math.hypot(dx, dy);
    // the base follows the thumb once it leaves the ring → instant direction changes, no dead travel back
    const lim = R * 1.05;
    if (d > lim) { const k = (d - lim) / d; S.ox += dx * k; S.oy += dy * k; dx = S.x - S.ox; dy = S.y - S.oy; d = lim; }
    // response: 8 % dead zone, FULL run speed from ~60 % deflection (touch has no physical rim to push against)
    const m = d / R, dead = 0.08, full = 0.6;
    const k = m <= dead ? 0 : Math.min(1, (m - dead) / (full - dead));
    const mag = k * k * (3 - 2 * k) * 0.35 + k * 0.65;    // gentle ease-in for fine walking, linear to the top
    if (d > 1e-3) { this.moveX = (dx / d) * mag; this.moveY = -(dy / d) * mag; } else this.moveX = this.moveY = 0;
    this._drawStick(true, dx, dy, mag);
  }
  _drawStick(on, dx = 0, dy = 0, mag = 0) {
    const el = this.stickEl; if (!el) return;
    const S = this._stick, home = this._stickHome;
    if (!home) return;
    const R = home.d / 2;
    const cx = on ? S.ox : home.x, cy = on ? S.oy : home.y;
    el.style.transform = `translate3d(${(cx - R).toFixed(1)}px,${(cy - R).toFixed(1)}px,0)`;
    el.classList.toggle('is-on', on);
    this.knob.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`;
    if (on && mag > 0.02) {
      this.dirEl.style.opacity = String(Math.min(1, mag * 1.4));
      this.dirEl.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;
    } else this.dirEl.style.opacity = '0';
    el.classList.toggle('is-run', mag > 0.97);
  }

  // ------------------------------------------------------------------------------------------ layout editor
  openEditor(onClose) {
    if (!this.root) return;
    this._editClose = onClose || null;
    this._editBackup = JSON.parse(JSON.stringify(this.layout));
    this.editing = true; this._sel = null;
    this.resetPointers();
    this._syncVisible();
    this._layoutAll();
    this._drawStick(false);
    this._selectEdit('fire');
  }
  _closeEditor(save) {
    if (save) saveLayout(this.layout); else this.layout = this._editBackup || this.layout;
    this.editing = false; this._sel = null;
    this.root.querySelectorAll('.is-sel').forEach((n) => n.classList.remove('is-sel'));
    this._layoutAll(); this._syncVisible();
    const cb = this._editClose; this._editClose = null;
    cb?.(save);
  }
  _editAction(a) {
    if (a === 'save') this._closeEditor(true);
    else if (a === 'cancel') this._closeEditor(false);
    else if (a === 'reset') { this.layout = {}; this._layoutAll(); this._selectEdit(this._sel || 'fire'); }
    else if (a === 'one' && this._sel) { delete this.layout[this._sel]; this._layoutAll(); this._selectEdit(this._sel); }
  }
  _selectEdit(id) {
    this._sel = id;
    this.root.querySelectorAll('.is-sel').forEach((n) => n.classList.remove('is-sel'));
    this.els[id]?.classList.add('is-sel');
    const c = this._cfg(id);
    const ja = document.documentElement.lang === 'ja';
    this.root.querySelector('.iwm-edit__name').textContent = (ja ? JA_LABEL : EN_LABEL)[id];
    const r = this.root.querySelector('.iwm-edit__size');
    r.value = String(Math.round(c.s * 100));
    this.root.querySelector('.iwm-edit__pct').textContent = `${Math.round(c.s * 100)}%`;
  }
  _editScale(id, s) {
    const c = this._cfg(id);
    this.layout[id] = { ax: c.ax, ay: c.ay, dx: c.dx, dy: c.dy, s: clamp(s, 0.5, 1.7) };
    this._layoutAll();
    this.root.querySelector('.iwm-edit__pct').textContent = `${Math.round(this.layout[id].s * 100)}%`;
    this.root.querySelector('.iwm-edit__size').value = String(Math.round(this.layout[id].s * 100));
  }
  _editDown(e) {
    const x = e.clientX, y = e.clientY;
    const P = this._edit || (this._edit = { pts: new Map() });
    P.pts.set(e.pointerId, { x, y });
    if (P.pts.size === 2 && this._sel) {
      const [a, b] = [...P.pts.values()];
      P.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: this._cfg(this._sel).s };
      P.drag = null;
      return;
    }
    let id = this._hitButton(x, y);
    if (!id && this._stickHome && Math.hypot(x - this._stickHome.x, y - this._stickHome.y) <= this._stickR * 1.1) id = 'stick';
    if (!id) return;
    this._selectEdit(id);
    const bx = this._box(id);
    P.drag = { id, ox: x - bx.x, oy: y - bx.y };
  }
  _editMove(e) {
    const P = this._edit; if (!P || !P.pts.has(e.pointerId)) return;
    stop(e);
    P.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (P.pinch && P.pts.size >= 2) {
      const [a, b] = [...P.pts.values()];
      this._editScale(this._sel, P.pinch.s0 * (Math.hypot(a.x - b.x, a.y - b.y) / P.pinch.d0));
      return;
    }
    if (!P.drag) return;
    const W = innerWidth, Hh = innerHeight, H = layoutUnit(), S = this._safeBox;
    const id = P.drag.id;
    const r = this._box(id).d / 2;
    const cx = clamp(e.clientX - P.drag.ox, S.l + r, W - S.r - r), cy = clamp(e.clientY - P.drag.oy, S.t + r, Hh - S.b - r);
    // re-anchor to the nearest edges so the layout adapts to other screen shapes
    const ax = cx < W / 2 ? 'l' : 'r', ay = cy < Hh / 2 ? 't' : 'b';
    const dx = (ax === 'l' ? cx - S.l : W - S.r - cx) / H, dy = (ay === 't' ? cy - S.t : Hh - S.b - cy) / H;
    this.layout[id] = { ax, ay, dx: +dx.toFixed(4), dy: +dy.toFixed(4), s: this._cfg(id).s };
    this._layoutAll();
  }
  _editUp(e) {
    const P = this._edit; if (!P) return;
    P.pts.delete(e.pointerId);
    if (P.pts.size < 2) P.pinch = null;
    if (!P.pts.size) P.drag = null;
  }
}

export { touchPrimary };
