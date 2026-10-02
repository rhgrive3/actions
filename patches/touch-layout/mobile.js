// Installed inside the existing mobile module; controls and gameplay input stay shared.
function installTouchLayout(MobileInput, controls) {
  const proto = MobileInput.prototype;
  const originalInstall = proto._install;
  const originalBox = proto._box;
  const originalLayout = proto._layoutAll;
  const originalScale = proto._editScale;
  const originalReset = proto.resetPointers;
  const labels = {
    ja: { stick: '移動スティック', fire: '射撃', jump: 'ジャンプ', squid: 'イカ', sub: 'サブ', special: 'スペシャル', map: 'マップ', gyro: 'ジャイロ', pause: 'ポーズ' },
    en: { stick: 'Move stick', fire: 'Fire', jump: 'Jump', squid: 'Squid', sub: 'Sub', special: 'Special', map: 'Map', gyro: 'Gyro', pause: 'Pause' },
  };
  const text = (ja, en) => document.documentElement.lang === 'ja' ? ja : en;
  const names = () => labels[document.documentElement.lang === 'ja' ? 'ja' : 'en'];
  const stopEdit = e => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); };

  // Stored data is user-controlled and may have come from an older device/layout.
  const clean = layout => {
    const result = {};
    for (const id of Object.keys(controls)) {
      const v = layout?.[id];
      if (!v || typeof v !== 'object') continue;
      const d = controls[id];
      result[id] = {
        ax: v.ax === 'l' || v.ax === 'r' ? v.ax : d.ax,
        ay: v.ay === 't' || v.ay === 'b' ? v.ay : d.ay,
        dx: Number.isFinite(v.dx) ? Math.max(0, v.dx) : d.dx,
        dy: Number.isFinite(v.dy) ? Math.max(0, v.dy) : d.dy,
        s: Number.isFinite(v.s) ? clamp(v.s, .5, 1.7) : 1,
      };
    }
    return result;
  };

  proto._install = function () {
    this.layout = clean(this.layout);
    originalInstall.call(this);
    const editor = this.root.querySelector('.iwm-edit');
    editor.setAttribute('role', 'dialog');
    editor.setAttribute('aria-modal', 'true');
    editor.setAttribute('aria-labelledby', 'iwm-layout-title');
    editor.innerHTML = `
      <div class="iwm-edit__bar">
        <div class="iwm-layout-heading"><b class="iwm-edit__title" id="iwm-layout-title"></b><span class="iwm-edit__hint"></span></div>
        <div class="iwm-layout-actions"><button type="button" class="iwm-eb" data-e="reset"></button><button type="button" class="iwm-eb" data-e="cancel"></button><button type="button" class="iwm-eb is-primary" data-e="save"></button></div>
      </div>
      <div class="iwm-edit__sel">
        <div class="iwm-layout-selection"><label class="iwm-layout-select-label" for="iwm-layout-control"></label><select id="iwm-layout-control" class="iwm-layout-control"></select><button type="button" class="iwm-eb" data-e="one"></button></div>
        <label class="iwm-layout-size"><span class="iwm-layout-size-label"></span><input type="range" min="50" max="170" step="5" class="iwm-edit__size"><em class="iwm-edit__pct"></em></label>
        <details class="iwm-layout-position"><summary></summary><label>X<input type="range" min="0" max="100" step="0.5" data-axis="x"></label><label>Y<input type="range" min="0" max="100" step="0.5" data-axis="y"></label></details>
        <span class="iwm-layout-note"></span><span class="iwm-layout-error" role="status" aria-live="polite"></span>
      </div>`;
    const signal = this._abort.signal;
    editor.querySelectorAll('[data-e]').forEach(button => button.addEventListener('click', e => {
      stopEdit(e); this._editAction(button.dataset.e);
    }, { signal }));
    const select = editor.querySelector('select');
    for (const id of ['fire', 'jump', 'stick', 'squid', 'sub', 'special', 'map', 'gyro', 'pause']) {
      const option = document.createElement('option'); option.value = id; select.appendChild(option);
    }
    select.addEventListener('change', () => this._selectEdit(select.value), { signal });
    const size = editor.querySelector('.iwm-edit__size');
    size.addEventListener('input', () => { if (this._sel) this._editScale(this._sel, +size.value / 100); }, { signal });
    for (const range of editor.querySelectorAll('[data-axis]')) range.addEventListener('input', () => {
      const b = this._box(this._sel), safe = this._safeBox, ratio = +range.value / 100;
      this._layoutPosition(this._sel,
        range.dataset.axis === 'x' ? safe.l + b.d / 2 + ratio * (innerWidth - safe.l - safe.r - b.d) : b.x,
        range.dataset.axis === 'y' ? safe.t + b.d / 2 + ratio * (innerHeight - safe.t - safe.b - b.d) : b.y);
    }, { signal });
    for (const [id, element] of Object.entries(this.els)) {
      const label = document.createElement('span'); label.className = 'iwm-layout-label'; element.appendChild(label);
      if (id === 'stick') { element.tabIndex = 0; element.setAttribute('role', 'button'); }
      element.addEventListener('focus', () => { if (this.editing) this._selectEdit(id); }, { signal });
    }
    window.addEventListener('keydown', e => {
      if (!this.editing) return;
      if (e.key === 'Escape') { stopEdit(e); this._closeEditor(false); return; }
      if (e.key === 'Tab') {
        const items = [...this.root.querySelectorAll('button, select, input, [tabindex="0"]')].filter(el => el.getClientRects().length);
        const current = items.indexOf(document.activeElement);
        stopEdit(e); items[(current + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus(); return;
      }
      if (e.target.closest?.('[data-c]') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        stopEdit(e);
        const b = this._box(this._sel), step = e.shiftKey ? 16 : 4;
        this._layoutPosition(this._sel, b.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), b.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0));
      }
      // Keep the settings screen from handling the editor's keys.
      e.stopPropagation();
    }, { capture: true, signal });
  };

  proto._box = function (id) {
    const b = originalBox.call(this, id), safe = this._safeBox;
    // Rotation and larger sizes must never strand a saved control outside the screen.
    b.d = Math.min(b.d, innerWidth - safe.l - safe.r, innerHeight - safe.t - safe.b);
    b.x = clamp(b.x, safe.l + b.d / 2, innerWidth - safe.r - b.d / 2);
    b.y = clamp(b.y, safe.t + b.d / 2, innerHeight - safe.b - b.d / 2);
    return b;
  };
  proto._layoutAll = function () {
    originalLayout.call(this);
    if (this.editing && this._sel) this._layoutCoordinates();
  };
  proto.resetPointers = function () {
    this._stick.active = false;
    this._edit = null;
    originalReset.call(this);
  };
  proto._selectEdit = function (id) {
    if (!controls[id]) return;
    this._sel = id;
    this.root.querySelectorAll('.is-sel').forEach(el => el.classList.remove('is-sel'));
    this.els[id].classList.add('is-sel');
    const size = Math.round(this._cfg(id).s * 100);
    this.root.querySelector('.iwm-edit__size').value = String(size);
    this.root.querySelector('.iwm-edit__pct').textContent = `${size}%`;
    this.root.querySelector('select').value = id;
    this.root.querySelector('.iwm-edit__size').setAttribute('aria-label', text(`${names()[id]}の大きさ`, `${names()[id]} size`));
    this._layoutCoordinates();
  };
  proto._layoutCoordinates = function () {
    if (!this._sel) return;
    const b = this._box(this._sel), safe = this._safeBox;
    for (const axis of ['x', 'y']) {
      const start = axis === 'x' ? safe.l : safe.t;
      const travel = (axis === 'x' ? innerWidth - safe.l - safe.r : innerHeight - safe.t - safe.b) - b.d;
      const range = this.root.querySelector(`[data-axis="${axis}"]`);
      range.value = String(travel > 0 ? 100 * (b[axis] - start - b.d / 2) / travel : 50);
      range.setAttribute('aria-label', text(`${names()[this._sel]}の${axis === 'x' ? '横' : '縦'}位置`, `${names()[this._sel]} ${axis === 'x' ? 'horizontal' : 'vertical'} position`));
    }
  };
  proto._editScale = function (id, scale) {
    originalScale.call(this, id, scale); this._layoutCoordinates();
  };
  proto.openEditor = function (onClose) {
    if (!this.root || this.editing) return;
    this._editClose = onClose || null;
    this._editBackup = structuredClone(this.layout);
    this._layoutFocus = document.activeElement;
    this.reset(); this.pressed.clear(); this.jumpTarget = -1;
    this.editing = true;
    this._syncVisible(); this._layoutAll(); this._drawStick(false);
    const ui = document.querySelector('.iw-ui');
    const accent = ui && getComputedStyle(ui).getPropertyValue('--a').trim();
    if (accent) this.root.style.setProperty('--iwm-editor-accent', accent);
    const editor = this.root.querySelector('.iwm-edit');
    editor.querySelector('.iwm-edit__title').textContent = text('ボタン配置の編集', 'Edit button layout');
    editor.querySelector('.iwm-edit__hint').textContent = text('ドラッグで移動 · ピンチで大きさ変更', 'Drag to move · pinch to resize');
    for (const [action, words] of Object.entries({ reset: ['全体をリセット', 'Reset all'], cancel: ['キャンセル', 'Cancel'], save: ['保存', 'Save'], one: ['このボタンをリセット', 'Reset selected'] })) {
      editor.querySelector(`[data-e="${action}"]`).textContent = text(...words);
    }
    editor.querySelector('.iwm-layout-select-label').textContent = text('編集するボタン', 'Control');
    editor.querySelector('.iwm-layout-size-label').textContent = text('大きさ', 'Size');
    editor.querySelector('.iwm-layout-position summary').textContent = text('位置を細かく調整', 'Fine-tune position');
    editor.querySelector('.iwm-layout-position').open = false;
    editor.querySelector('.iwm-layout-note').textContent = text('配置はこの端末に保存されます。浮動スティックは触れた位置に出ます。', 'Saved on this device. A floating stick appears where you touch.');
    editor.querySelector('.iwm-layout-error').textContent = '';
    for (const option of editor.querySelectorAll('option')) option.textContent = names()[option.value];
    for (const [id, el] of Object.entries(this.els)) {
      el.setAttribute('aria-label', names()[id]);
      el.querySelector('.iwm-layout-label').textContent = names()[id];
    }
    this._selectEdit('fire');
    editor.querySelector('[data-e="save"]').focus({ preventScroll: true });
  };
  proto._closeEditor = function (save) {
    if (!this.editing) return;
    if (save) {
      try { localStorage.setItem('inkwave.touchLayout', JSON.stringify(this.layout)); }
      catch {
        this.root.querySelector('.iwm-layout-error').textContent = text('保存できませんでした。端末のストレージ設定を確認してください。', 'Could not save. Check your device storage settings.');
        return;
      }
    } else this.layout = this._editBackup;
    this.editing = false; this._sel = null; this._editBackup = null;
    this.resetPointers(); this.pressed.clear(); this.lookDX = this.lookDY = 0;
    this.root.querySelectorAll('.is-sel').forEach(el => el.classList.remove('is-sel'));
    this._layoutAll(); this._syncVisible();
    this._layoutFocus?.isConnected && this._layoutFocus.focus({ preventScroll: true });
    this._layoutFocus = null;
    const callback = this._editClose; this._editClose = null; callback?.(save);
  };
  proto._layoutPosition = function (id, x, y) {
    const b = this._box(id), safe = this._safeBox, unit = this._H;
    const cx = clamp(x, safe.l + b.d / 2, innerWidth - safe.r - b.d / 2);
    const cy = clamp(y, safe.t + b.d / 2, innerHeight - safe.b - b.d / 2);
    const ax = cx < innerWidth / 2 ? 'l' : 'r', ay = cy < innerHeight / 2 ? 't' : 'b';
    this.layout[id] = { ax, ay, dx: (ax === 'l' ? cx - safe.l : innerWidth - safe.r - cx) / unit,
      dy: (ay === 't' ? cy - safe.t : innerHeight - safe.b - cy) / unit, s: this._cfg(id).s };
    this._layoutAll();
    this._layoutCoordinates();
  };
  proto._editDown = function (e) {
    const state = this._edit || (this._edit = { pts: new Map() });
    state.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (state.pts.size === 2) {
      const [a, b] = [...state.pts.values()];
      state.pinch = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), s0: this._cfg(this._sel).s };
      state.drag = null; return;
    }
    if (state.pts.size !== 1) return;
    // DOM selection lets even overlapping controls be chosen after using the selector.
    let id = e.target.closest?.('[data-c]')?.dataset.c || this._hitButton(e.clientX, e.clientY);
    const home = this._stickHome;
    if (!id && Math.hypot(e.clientX - home.x, e.clientY - home.y) <= this._stickR * 1.1) id = 'stick';
    if (!id) return;
    this._selectEdit(id);
    const b = this._box(id);
    state.drag = { id, pointer: e.pointerId, ox: e.clientX - b.x, oy: e.clientY - b.y };
  };
  proto._editMove = function (e) {
    const state = this._edit;
    if (!state?.pts.has(e.pointerId)) return;
    stopEdit(e); state.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (state.pinch && state.pts.size === 2) {
      const [a, b] = [...state.pts.values()];
      this._editScale(this._sel, state.pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y) / state.pinch.d0);
    } else if (state.drag?.pointer === e.pointerId) {
      this._layoutPosition(state.drag.id, e.clientX - state.drag.ox, e.clientY - state.drag.oy);
    }
  };
  proto._editUp = function (e) {
    const state = this._edit;
    if (!state) return;
    state.pts.delete(e.pointerId);
    // Lifting/cancelling either pinch finger ends the gesture; a fresh touch starts the next one.
    state.pinch = null; state.drag = null;
  };
}
