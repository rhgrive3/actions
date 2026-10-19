// Build-only settings fixes. Preserve the captured input and the native controls.
export function adaptSettingsUi(rel, code, once) {
  if (rel === 'styles/ui.css') {
    if (code.includes('/* Settings tabs keep each label together. */')) throw new Error('settings UI: repeated CSS transform');
    return code + '\n/* Settings tabs keep each label together. */\n.iw-settings .iw-tab { flex: 1 0 auto; }\n.iw-settings .iw-tab > span { white-space: nowrap; }\n';
  }
  if (rel !== 'src/ui/menus.js') return code;
  const patch = (before, after, label) => { code = once(code, before, after, 'settings UI: ' + label); };
  patch(`    track.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { track.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      const r = track.getBoundingClientRect();
      const move = (ev) => set(min + clamp((ev.clientX - r.left) / r.width) * (max - min), 'mouse');
      const up = () => { el.classList.remove('is-drag'); track.removeEventListener('pointermove', move); track.removeEventListener('pointerup', up); track.removeEventListener('pointercancel', up); };
      el.classList.add('is-drag'); move(e);
      track.addEventListener('pointermove', move); track.addEventListener('pointerup', up); track.addEventListener('pointercancel', up);
    });`, `    let drag = null;
    const endDrag = () => {
      if (!drag) return;
      const { id, move, end } = drag; drag = null;
      el.classList.remove('is-drag');
      track.removeEventListener('pointermove', move);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) track.removeEventListener(type, end);
      window.removeEventListener('blur', endDrag);
      try { if (track.hasPointerCapture(id)) track.releasePointerCapture(id); } catch (err) { /* already released */ }
    };
    track.addEventListener('pointerdown', (e) => {
      if (drag || e.button !== 0) return;
      const r = track.getBoundingClientRect();
      if (!(r.width > 0)) return;
      e.preventDefault(); e.stopPropagation();
      const focusRow = track.closest?.('[data-nav]');
      if (focusRow) this._setFocus(focusRow);
      const id = e.pointerId;
      const move = (ev) => {
        if (ev.pointerId === id) set(min + clamp((ev.clientX - r.left) / r.width) * (max - min), 'mouse');
      };
      const end = (ev) => { if (ev.pointerId === id) endDrag(); };
      drag = { id, move, end };
      track.addEventListener('pointermove', move);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) track.addEventListener(type, end);
      window.addEventListener('blur', endDrag);
      try { track.setPointerCapture(id); } catch (err) { /* synthetic events */ }
      el.classList.add('is-drag'); move(e);
    });`, 'single pointer owner and complete drag cleanup');
  patch(`      refresh: (nv) => { v = +nv; render(); },`, `      refresh: (nv) => { if (v !== +nv) { v = +nv; render(); } },
      destroy: endDrag,`, 'release active slider on row retirement');

  // Scope all screen-only replacements so similarly named locker/lobby helpers stay intact.
  const start = code.indexOf('  _scr_settings() {');
  const end = code.indexOf('\n  // ================================================================ SCREEN: howto', start);
  if (start < 0 || end < start) throw new Error('settings UI: missing screen boundary');
  let screen = code.slice(start, end);
  const edit = (before, after, label) => { screen = once(screen, before, after, 'settings UI: ' + label); };
  edit('    const controls = new Map();', `    const controls = new Map();
    let destroyed = false, savedTimer = null, layoutDirty = true, layoutObserver = null;
    const invalidateLayout = () => { layoutDirty = true; };
    const previewTimers = new Set();
    const destroyControls = () => { for (const c of controls.values()) c.destroy?.(); controls.clear(); };
    const syncPreview = (s) => {
      if (!P.cur || !rowDef(P.key)) return;
      safeCall(() => P.cur.set(s[P.key], s));
      pvVal.textContent = fmtVal(rowDef(P.key), s[P.key]);
      pvVal.classList.toggle('is-empty', !pvVal.textContent);
    };`, 'screen owns controls and callbacks');
  edit(`setTimeout(() => old.remove(), 260);`, `const timer = setTimeout(() => { previewTimers.delete(timer); old.remove(); }, 260); previewTimers.add(timer);`, 'track outgoing preview timers');
  edit(`      rowsEl.innerHTML = '';
      rowsEl.scrollTop = 0;
      controls.clear();`, `      destroyControls();
      rowsEl.innerHTML = '';
      rowsEl.scrollTop = 0;`, 'retire controls before row rebuild');
  edit(`      for (const [k, c] of controls) c.refresh(s[k]);`, `      for (const [k, c] of controls) c.refresh(s[k]);
      syncPreview(s);`, 'reset preview uses applied defaults');
  edit(`    const savedPulse = () => { saved.lastChild.textContent = tr('Saved!'); restartAnim(saved, 'is-on'); clearTimeout(this._savedT); this._savedT = setTimeout(() => { if (saved.isConnected) saved.lastChild.textContent = tr('Changes save automatically'); }, 1400); };`, `    const savedPulse = () => {
      if (destroyed) return;
      saved.lastChild.textContent = tr('Saved!'); restartAnim(saved, 'is-on');
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => { savedTimer = null; if (!destroyed && saved.isConnected) saved.lastChild.textContent = tr('Changes save automatically'); }, 1400);
    };`, 'saved feedback has a screen lifetime');
  edit(`      refreshControl: (key) => { const c = controls.get(key); if (c) safeCall(() => c.refresh(this._settings()[key])); if (P.key === key && P.cur) { safeCall(() => P.cur.set(this._settings()[key], this._settings())); pvVal.textContent = fmtVal(rowDef(key), this._settings()[key]); } },`, `      refreshControl: (key) => {
        const c = controls.get(key);
        if (!c && P.key !== key) return;
        const s = this._settings();
        if (c) safeCall(() => c.refresh(s[key]));
        if (P.key === key) syncPreview(s);
      },
      onInputMode: (mode) => {
        const hideMouseRows = mode === 'touch';
        if (hideMouseRows === hiddenMouseRows) return;
        hiddenMouseRows = hideMouseRows;
        if (!SETTINGS_TABS[tabIdx].rows.some(r => r.kbm)) return;
        const old = this._focus, id = old?.dataset.id, scroll = rowsEl.scrollTop;
        const inRows = rowsEl.contains(old);
        buildRows(1);
        if (inRows) this._setFocus([...rowsEl.children].find(r => r.dataset.id === id) || rowsEl.querySelector('[data-nav]'));
        rowsEl.scrollTop = scroll;
        this._refit?.();
      },
      destroy: () => {
        destroyed = true; destroyControls();
        clearTimeout(savedTimer);
        for (const timer of previewTimers) clearTimeout(timer);
        previewTimers.clear(); P.cur = null;
      },`, 'single snapshot refresh and input mode reconciliation');
  edit(`        rowsEl.appendChild(row);
      });
    };`, `        rowsEl.appendChild(row);
      });
      invalidateLayout();
      if (layoutObserver) {
        layoutObserver.disconnect();
        for (const target of [tabsEl, ...tabBtns, rowsEl, ...rowsEl.children]) layoutObserver.observe(target);
      }
    };`, 'observe only current row geometry');
  edit(`    tabsEl.style.setProperty('--n', SETTINGS_TABS.length);`, `    if (typeof ResizeObserver !== 'undefined') layoutObserver = new ResizeObserver(invalidateLayout);
    rowsEl.addEventListener('scroll', invalidateLayout, { passive: true });
    window.addEventListener('resize', invalidateLayout);
    tabsEl.style.setProperty('--n', SETTINGS_TABS.length);`, 'invalidate layout on scroll and resize');
  edit(`        destroyed = true; destroyControls();`, `        destroyed = true; destroyControls();
        layoutObserver?.disconnect();
        rowsEl.removeEventListener('scroll', invalidateLayout);
        window.removeEventListener('resize', invalidateLayout);`, 'release screen layout observation');
  edit(`        const more = rowsEl.scrollHeight - rowsEl.clientHeight > 1;
        const up = more && rowsEl.scrollTop > 1, down = more && rowsEl.scrollTop < rowsEl.scrollHeight - rowsEl.clientHeight - 1;
        if (up !== rowsEl._up) { rowsEl._up = up; rowsEl.classList.toggle('is-more-up', up); }
        if (down !== rowsEl._down) { rowsEl._down = down; rowsEl.classList.toggle('is-more-down', down); }`, `        if (layoutDirty || !layoutObserver) {
          layoutDirty = false; movePill(false);
          const overflow = rowsEl.scrollHeight - rowsEl.clientHeight, top = rowsEl.scrollTop;
          const up = overflow > 1 && top > 1, down = overflow > 1 && top < overflow - 1;
          if (up !== rowsEl._up) { rowsEl._up = up; rowsEl.classList.toggle('is-more-up', up); }
          if (down !== rowsEl._down) { rowsEl._down = down; rowsEl.classList.toggle('is-more-down', down); }
        }`, 'read stable scroll geometry only after invalidation');
  edit(`    let tabIdx = this._settingsTab || 0;`, `    let tabIdx = this._settingsTab || 0;
    let hiddenMouseRows = this._input === 'touch';`, 'track visible row policy');
  edit(`        const real = this._settings()[key];`, `        const s = this._settings();
        const real = s[key];`, 'one applied snapshot per setting event');
  edit(`c.refresh(this._settings()[k])`, `c.refresh(s[k])`, 'profile refresh reuses snapshot');
  edit(`          const s = this._settings();
          safeCall(() => P.cur.set(value, s));`, `          safeCall(() => P.cur.set(value, s));`, 'preview reuses snapshot');
  edit(`P.cur.set(this._settings()[P.key], this._settings())`, `P.cur.set(s[P.key], s)`, 'audio preview reuses snapshot');
  return code.slice(0, start) + screen + code.slice(end);
}
