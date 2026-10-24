// Exact build-time rewrites for the remaining Drive UI/audio queue.
// Native snapshots and source locks stay unchanged; fail on a moved or duplicate anchor.
const CHANGES = [
  [
    "src/game/showcase.js",
    "this.splats.count = this._span(this.SA, this.SL, this.SN, sTop);\n    this.rings.count = this._span(this.RA, this.RL, this.RN, rTop);",
    "this.splats.count = sTop + 1;\n    this.rings.count = rTop + 1;",
    "fx-forward-span",
    1
  ],
  [
    "src/game/showcase.js",
    "  _span(A, L, n, top) { for (let j = n - 1; j > top; j--) if (A[j] < L[j]) return j + 1; return top + 1; }\n",
    "",
    "fx-remove-tail-helper",
    1
  ],
  [
    "src/game/showcase.js",
    "    let n = top + 1;\n    for (let i = this.N - 1; i >= n; i--) if (this.A[i] < this.L[i]) { n = i + 1; break; }\n    this.mesh.count = n;",
    "    this.mesh.count = top + 1;",
    "fx-forward-tail",
    2
  ],
  [
    "src/game/lobbySet.js",
    "this.dripMesh.count = k; this.dripMesh.instanceMatrix.needsUpdate = true;",
    "this.dripMesh.count = k; if (k > 0) this.dripMesh.instanceMatrix.needsUpdate = true;",
    "drip-empty-upload",
    1
  ],
  [
    "src/fx/fx.js",
    "      const a = rand() * TAU, r = 0.5 + rand() * 0.3;\n      this._spawnDrop(pos.x + Math.cos(a) * r, pos.y + 0.05, pos.z + Math.sin(a) * r, -Math.sin(a) * 1.8, 2.5 + rand() * 3 * (0.5 + k), Math.cos(a) * 1.8, col, 0.025 + rand() * 0.025, 0.7, 0.8, 1.3, F_QUIET);",
    "      const a = rand() * TAU, r = 0.5 + rand() * 0.3;\n      const ca = Math.cos(a), sa = Math.sin(a);\n      this._spawnDrop(pos.x + ca * r, pos.y + 0.05, pos.z + sa * r, -sa * 1.8, 2.5 + rand() * 3 * (0.5 + k), ca * 1.8, col, 0.025 + rand() * 0.025, 0.7, 0.8, 1.3, F_QUIET);",
    "superjump-sincos",
    1
  ],
  [
    "src/audio/music.js",
    "    const tmp = w;\n    for (let pass = 0; pass < 2; pass++) {\n      for (let i = 0; i < len; i++) { const x = d[i]; y = a * (y + x - px); px = x; if (pass) tmp[i] = y; }\n    }\n    d.set(tmp);",
    "    for (let pass = 0; pass < 2; pass++) {\n      // The written pass reads each input once; px retains the unfiltered predecessor.\n      for (let i = 0; i < len; i++) { const x = d[i]; y = a * (y + x - px); px = x; if (pass) d[i] = y; }\n    }",
    "noise-inplace-dc",
    1
  ],
  [
    "src/main.js",
    "      const nav = (d) => this.menus.nav?.(d);\n      const layoutNav = (d) => { if (!editorOwnsPad()) return nav(d); };",
    "      const layoutNav = (d) => { if (!editorOwnsPad()) return this.menus.nav?.(d); };",
    "pad-nav-wrapper",
    1
  ],
  [
    "src/ui/hud-boss.js",
    "const p = this._screen(c.w, { x: 0, y: 0 });",
    "const p = this._screen(c.w, this._damageScreen || (this._damageScreen = { x: 0, y: 0 }));",
    "boss-number-scratch",
    1
  ],
  [
    "src/ui/hud.js",
    "for (const o of G.actors || []) if (o.team === me.team && o !== me) allies.push(o);",
    "for (const o of G.actors || []) if (o.team === me.team && o !== me) { allies.push(o); if (allies.length === 3) break; }",
    "first-three-allies",
    1
  ],
  [
    "src/ui/diorama.js",
    "for (const o of G.actors || []) if (o.team === me.team && o !== me) allies.push(o);",
    "for (const o of G.actors || []) if (o.team === me.team && o !== me) { allies.push(o); if (allies.length === 3) break; }",
    "first-three-allies",
    1
  ],
  [
    "src/core/input.js",
    "    const m = Math.hypot(x, y);",
    "    if (Math.abs(x) + Math.abs(y) <= dz) return out;\n    const m = Math.hypot(x, y);",
    "pad-deadzone-hypot",
    1
  ],
  [
    "src/game/player.js",
    "    const ml = Math.hypot(mx, mz);",
    "    const ml = mx === 0 && mz === 0 ? 0 : Math.hypot(mx, mz);",
    "player-zero-hypot",
    1
  ],
  [
    "src/core/input.js",
    "      let b = buttons[i];\n      // Trigger edges use the same threshold as canonical held fire/swim.\n      if (i === 6 || i === 7) b = { pressed: b.value > 0.3 };\n      if (!b.pressed) this._padTakeoverBlocked.delete(i);\n      const was = this._padTakeoverBlocked.has(i) || this.padPrev[i] || false;\n      if (!b.pressed) this.padMenuBlocked.delete(i);\n      if (b.pressed && !was) { this.padPressed.add(i); this.padMenuPressed.add(i); if (!this._liveTouchContact?.()) this.lastDevice = 'pad'; }\n      this.padPrev[i] = b.pressed;",
    "      const b = buttons[i];\n      // Trigger edges use the same threshold as canonical held fire/swim.\n      const pressed = i === 6 || i === 7 ? b.value > 0.3 : b.pressed;\n      if (!pressed) this._padTakeoverBlocked.delete(i);\n      const was = this._padTakeoverBlocked.has(i) || this.padPrev[i] || false;\n      if (!pressed) this.padMenuBlocked.delete(i);\n      if (pressed && !was) { this.padPressed.add(i); this.padMenuPressed.add(i); if (!this._liveTouchContact?.()) this.lastDevice = 'pad'; }\n      this.padPrev[i] = pressed;",
    "pad-trigger-scalar",
    1
  ],
  [
    "src/core/gyro.js",
    "    const th = screenAngle() * D2R;",
    "    const th = (this._qualityGyro?.screen ?? screenAngle()) * D2R;",
    "gyro-event-screen-angle",
    1
  ],
  [
    "src/ui/menu-art.js",
    "        tf(th, 276 + dx, 138 + dy);\n        tf(ret, 150 + dx * 4, 50 + dy * 2.6, 1 + 0.08 * Math.max(0, Math.sin(t * 9)));\n        tf(fire, 272, 132, 1 - 0.05 * Math.max(0, Math.sin(t * 9)));",
    "        if (v || th?.getAttribute('transform') !== 'translate(276.0 138.0)') tf(th, 276 + dx, 138 + dy);\n        const pulse = Math.max(0, Math.sin(t * 9));\n        tf(ret, 150 + dx * 4, 50 + dy * 2.6, 1 + 0.08 * pulse);\n        tf(fire, 272, 132, 1 - 0.05 * pulse);",
    "fireaim-preview",
    1
  ],
  [
    "src/ui/menus.js",
    "  _bind(el, opts = {}) {\n    el.dataset.nav = opts.type || 'button';\n    if (opts.id) el.dataset.id = opts.id;\n    if (el.tagName === 'BUTTON') { el.type = 'button'; el.tabIndex = -1; el.addEventListener('mousedown', (e) => e.preventDefault()); }\n    this._binds.set(el, opts);\n    el.addEventListener('pointerenter', () => {\n      if (performance.now() - this._lastMove < 150 && !(this._modal && !this._modal.contains(el))) this._setFocus(el, { sound: true });\n    });\n    // a finger has no hover: touching a row focuses it (settings preview, stage info) before any slider drag\n    el.addEventListener('pointerdown', (e) => {\n      if (e.pointerType !== 'mouse' && !(this._modal && !this._modal.contains(el))) this._setFocus(el);\n    }, { passive: true });\n    if (opts.accept && opts.click !== false) {\n      el.addEventListener('click', (e) => {\n        if (this._modal && !this._modal.contains(el)) return;\n        if (e.target.closest('.iw-noclick')) return;\n        this._setFocus(el);\n        opts.accept('mouse');\n      });\n    }\n    return el;\n  }\n",
    "  _bind(el, opts = {}) {\n    el.dataset.nav = opts.type || 'button';\n    if (opts.id) el.dataset.id = opts.id;\n    if (el.tagName === 'BUTTON') { el.type = 'button'; el.tabIndex = -1; }\n    this._binds.set(el, opts);\n    const bound = this._boundElements || (this._boundElements = new WeakSet());\n    if (bound.has(el)) return el;\n    bound.add(el);\n    if (el.tagName === 'BUTTON') el.addEventListener('mousedown', (e) => e.preventDefault());\n    el.addEventListener('pointerenter', () => {\n      if (performance.now() - this._lastMove < 150 && !(this._modal && !this._modal.contains(el))) this._setFocus(el, { sound: true });\n    });\n    el.addEventListener('pointerdown', (e) => {\n      if (e.pointerType !== 'mouse' && !(this._modal && !this._modal.contains(el))) this._setFocus(el);\n    }, { passive: true });\n    el.addEventListener('click', (e) => {\n      const current = this._binds.get(el);\n      if (!current?.accept || current.click === false) return;\n      if (this._modal && !this._modal.contains(el)) return;\n      if (e.target.closest('.iw-noclick')) return;\n      this._setFocus(el);\n      current.accept('mouse');\n    });\n    return el;\n  }\n",
    "menu-bind-once",
    1
  ],
  [
    "src/ui/menus.js",
    "      stNum.innerHTML = `STAGE <b>${String((k < 0 ? maps.indexOf(m) : k) + 1).padStart(2, '0')}</b><em>/ ${String(list.length).padStart(2, '0')}</em>`;",
    "      const stageNumber = `STAGE <b>${String((k < 0 ? maps.indexOf(m) : k) + 1).padStart(2, '0')}</b><em>/ ${String(list.length).padStart(2, '0')}</em>`;\n      if (stNum.innerHTML !== stageNumber) stNum.innerHTML = stageNumber;",
    "lobby-stage-ticket",
    1
  ],
  [
    "src/ui/menus.js",
    "      colorVars(el, 'ta', ca); colorVars(el, 'tb', cb); colorVars(el, 'self', teamOf(me) && !bossMode() ? cb : ca);",
    "      const selfColor = teamOf(me) && !bossMode() ? cb : ca;\n      if (S.barA !== ca) { S.barA = ca; colorVars(el, 'ta', ca); }\n      if (S.barB !== cb) { S.barB = cb; colorVars(el, 'tb', cb); }\n      if (S.barSelf !== selfColor) { S.barSelf = selfColor; colorVars(el, 'self', selfColor); }",
    "lobby-bar-colors",
    1
  ],
  [
    "src/ui/menus.js",
    "  _spatial(from, dir) {\n    const cands = this._candidates();\n    if (!cands.length) return null;\n    if (!from || !cands.includes(from)) return cands[0];\n    const fr = from.getBoundingClientRect();\n    const fcx = fr.left + fr.width / 2, fcy = fr.top + fr.height / 2;\n    let best = null, bestScore = Infinity;\n    for (const c of cands) {\n      if (c === from) continue;\n      const r = c.getBoundingClientRect();\n      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;\n      let primary, ortho;\n      if (dir === 'down' || dir === 'up') {\n        primary = dir === 'down' ? cy - fcy : fcy - cy;\n        if (primary < Math.min(fr.height, r.height) * 0.3) continue;\n        ortho = Math.max(0, Math.max(fr.left, r.left) - Math.min(fr.right, r.right));\n      } else {\n        primary = dir === 'right' ? cx - fcx : fcx - cx;\n        if (primary < Math.min(fr.width, r.width) * 0.3) continue;\n        ortho = Math.max(0, Math.max(fr.top, r.top) - Math.min(fr.bottom, r.bottom));\n      }\n      const score = primary + ortho * 3 + Math.abs(dir === 'down' || dir === 'up' ? cx - fcx : cy - fcy) * 0.15;\n      if (score < bestScore) { bestScore = score; best = c; }\n    }\n    if (!best && this._scr && this._scr.wrap && (dir === 'down' || dir === 'up')) {\n      let ext = null, ev = dir === 'down' ? Infinity : -Infinity;\n      for (const c of cands) {\n        const r = c.getBoundingClientRect();\n        const overl = Math.min(fr.right, r.right) - Math.max(fr.left, r.left);\n        if (overl <= 0) continue;\n        const cy = r.top + r.height / 2;\n        if (dir === 'down' ? cy < ev : cy > ev) { ev = cy; ext = c; }\n      }\n      if (ext && ext !== from) best = ext;\n    }\n    return best;\n  }\n",
    "  _spatial(from, dir) {\n    const cands = this._candidates();\n    if (!cands.length) return null;\n    if (!from || !cands.includes(from)) return cands[0];\n    const rects = new Map();\n    const rect = el => { let r = rects.get(el); if (!r) { r = el.getBoundingClientRect(); rects.set(el, r); } return r; };\n    const fr = rect(from);\n    const fcx = fr.left + fr.width / 2, fcy = fr.top + fr.height / 2;\n    let best = null, bestScore = Infinity;\n    for (const c of cands) {\n      if (c === from) continue;\n      const r = rect(c);\n      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;\n      let primary, ortho;\n      if (dir === 'down' || dir === 'up') {\n        primary = dir === 'down' ? cy - fcy : fcy - cy;\n        if (primary < Math.min(fr.height, r.height) * 0.3) continue;\n        ortho = Math.max(0, Math.max(fr.left, r.left) - Math.min(fr.right, r.right));\n      } else {\n        primary = dir === 'right' ? cx - fcx : fcx - cx;\n        if (primary < Math.min(fr.width, r.width) * 0.3) continue;\n        ortho = Math.max(0, Math.max(fr.top, r.top) - Math.min(fr.bottom, r.bottom));\n      }\n      const score = primary + ortho * 3 + Math.abs(dir === 'down' || dir === 'up' ? cx - fcx : cy - fcy) * 0.15;\n      if (score < bestScore) { bestScore = score; best = c; }\n    }\n    if (!best && this._scr && this._scr.wrap && (dir === 'down' || dir === 'up')) {\n      let ext = null, ev = dir === 'down' ? Infinity : -Infinity;\n      for (const c of cands) {\n        const r = rect(c);\n        const overl = Math.min(fr.right, r.right) - Math.max(fr.left, r.left);\n        if (overl <= 0) continue;\n        const cy = r.top + r.height / 2;\n        if (dir === 'down' ? cy < ev : cy > ev) { ev = cy; ext = c; }\n      }\n      if (ext && ext !== from) best = ext;\n    }\n    return best;\n  }\n",
    "spatial-single-query-rects",
    1
  ],
  [
    "src/game/lobbySet-geo.js",
    "  build() {\n    const out = {};\n    for (const [k, list] of this.buckets) out[k] = list.length === 1 ? list[0] : mergeGeometries(list, false);\n    return out;\n  }",
    "  build({ consume = false } = {}) {\n    const out = {};\n    for (const [k, list] of this.buckets) {\n      out[k] = list.length === 1 ? list[0] : mergeGeometries(list, false);\n      if (consume && out[k]) {\n        if (list.length > 1) for (const g of list) g.dispose();\n        list.length = 0;\n        this.buckets.delete(k);\n      }\n    }\n    return out;\n  }",
    "builder-consume",
    1
  ],
  [
    "src/game/lobbySet.js",
    "const G = B.build();",
    "const G = B.build({ consume: true });",
    "builder-main-consume",
    1
  ],
  [
    "src/game/lobbySet.js",
    "curbB.build().surface",
    "curbB.build({ consume: true }).surface",
    "builder-curb-consume",
    1
  ],
  [
    "src/ui/hud.js",
    "      if (!m) { if (L[k] !== 'x') { L[k] = 'x'; el.style.display = 'none'; } continue; }",
    "      if (!m) { el._markerRaw = null; if (L[k] !== 'x') { L[k] = 'x'; el.style.display = 'none'; } continue; }",
    "marker-clear-raw",
    1
  ],
  [
    "src/ui/hud.js",
    "      const key = `${(+m.x).toFixed(0)}|${(+m.y).toFixed(0)}|${on ? 1 : 0}|${on ? 0 : (+m.angle || 0).toFixed(2)}|${m.name}|${m.color}|${ready ? 1 : 0}|${far.toFixed(1)}|${w || ''}`;",
    "      const mx = +m.x, my = +m.y, ma = on ? 0 : (+m.angle || 0), mw = w || '';\n      const raw = el._markerRaw || (el._markerRaw = {});\n      if (raw.valid && raw.owner === L && Object.is(raw.x, mx) && Object.is(raw.y, my) && Object.is(raw.angle, ma) && raw.on === on && raw.name === m.name && raw.color === m.color && raw.ready === ready && Object.is(raw.far, far) && raw.weapon === mw) continue;\n      raw.valid = true; raw.owner = L; raw.x = mx; raw.y = my; raw.angle = ma; raw.on = on; raw.name = m.name; raw.color = m.color; raw.ready = ready; raw.far = far; raw.weapon = mw;\n      const key = `${mx.toFixed(0)}|${my.toFixed(0)}|${on ? 1 : 0}|${on ? 0 : ma.toFixed(2)}|${m.name}|${m.color}|${ready ? 1 : 0}|${far.toFixed(1)}|${mw}`;",
    "marker-raw-fastpath",
    1
  ],
  [
    "src/ui/hud.js",
    "  // ================================================================ public\n",
    "  get paused() { return !!this._effectsPaused; }\n  set paused(on) {\n    on = !!on;\n    if (on === !!this._effectsPaused) return;\n    this._effectsPaused = on;\n    if (on) { cancelAnimationFrame(this._rafId); this._rafId = 0; }\n    else if (!this._worldPaused && this._fxMap?.size && !this._rafId) {\n      this._lastFx = performance.now(); this._rafId = requestAnimationFrame(this._fxLoop);\n    }\n  }\n\n  // ================================================================ public\n",
    "hud-pause-owner",
    1
  ],
  [
    "src/ui/hud.js",
    "if (this._fxMap?.size && !this._rafId) {",
    "if (!this.paused && this._fxMap?.size && !this._rafId) {",
    "hud-world-resume-paused",
    1
  ],
  [
    "src/ui/hud.js",
    "if (!this._rafId && !this._worldPaused) { this._lastFx",
    "if (!this._rafId && !this._worldPaused && !this.paused) { this._lastFx",
    "hud-addfx-paused",
    1
  ],
  [
    "src/ui/hud.js",
    "if (this.paused) { this._rafId = this._fxMap.size ? requestAnimationFrame(this._fxLoop) : 0; return; }",
    "if (this.paused) { this._rafId = 0; return; }",
    "hud-park-paused",
    1
  ],
  [
    "src/core/mobile.js",
    "    if (this.root) { this.root.style.setProperty('--iwm-op', String(clamp(+S.touchOpacity || 0.85, 0.2, 1))); this._layoutAll(); }",
    "    if (this.root) {\n      const opacity = String(clamp(+S.touchOpacity || 0.85, 0.2, 1));\n      if (this.root.style.getPropertyValue('--iwm-op') !== opacity) this.root.style.setProperty('--iwm-op', opacity);\n      const scale = clamp(+S.touchScale || 1, 0.5, 1.6);\n      if (this._settingsLayoutRoot !== this.root || this._settingsLayoutScale !== scale || this._settingsStickMode !== S.stickMode) {\n        this._settingsLayoutRoot = this.root; this._settingsLayoutScale = scale; this._settingsStickMode = S.stickMode;\n        this._layoutAll();\n      }\n    }",
    "mobile-settings-layout",
    1
  ],
  [
    "src/core/mobile.js",
    "  _layoutAll() {\n    if (!this.root) return;\n    this._safeBox = this._safe();\n    this._H = layoutUnit();\n    for (const id of ORDER) {\n      const el = this.els[id]; if (!el) continue;\n      const b = this._box(id);\n      (this._hitBoxes || (this._hitBoxes = Object.create(null)))[id] = b;\n      const diameter = `${b.d.toFixed(1)}px`, left = (b.x - b.d / 2).toFixed(1) + 'px', top = (b.y - b.d / 2).toFixed(1) + 'px';\n      const transform = id === 'stick' ? `translate3d(${left},${top},0)` : 'none';\n      const key = diameter + '|' + left + '|' + top + '|' + transform;\n      if (el._queueGeometry !== key) {\n        el.style.width = el.style.height = diameter;\n        if (id === 'stick') el.style.transform = transform;\n        else { el.style.left = left; el.style.top = top; el.style.transform = transform; }\n        el._queueGeometry = key;\n      }\n      if (id === 'stick') { this._stickHome = b; this._stickR = b.d / 2; }\n    }\n    if (!this._stick.active) this._drawStick(false);\n  }\n",
    "  _layoutControl(id) {\n      const el = this.els[id]; if (!el) return;\n      const b = this._box(id);\n      (this._hitBoxes || (this._hitBoxes = Object.create(null)))[id] = b;\n      const diameter = `${b.d.toFixed(1)}px`, left = (b.x - b.d / 2).toFixed(1) + 'px', top = (b.y - b.d / 2).toFixed(1) + 'px';\n      const transform = id === 'stick' ? `translate3d(${left},${top},0)` : 'none';\n      const key = diameter + '|' + left + '|' + top + '|' + transform;\n      if (el._queueGeometry !== key) {\n        el.style.width = el.style.height = diameter;\n        if (id === 'stick') el.style.transform = transform;\n        else { el.style.left = left; el.style.top = top; el.style.transform = transform; }\n        el._queueGeometry = key;\n      }\n      if (id === 'stick') { this._stickHome = b; this._stickR = b.d / 2; }\n  }\n  _layoutAll() {\n    if (!this.root) return;\n    this._safeBox = this._safe(); this._H = layoutUnit();\n    this._layoutWidth = innerWidth; this._layoutHeight = innerHeight;\n    for (const id of ORDER) this._layoutControl(id);\n    if (!this._stick.active) this._drawStick(false);\n  }\n  _layoutOne(id) {\n    if (!this.root) return;\n    const safe = this._safe(), prior = this._safeBox, unit = layoutUnit();\n    if (!prior || this._layoutWidth !== innerWidth || this._layoutHeight !== innerHeight || this._H !== unit || safe.l !== prior.l || safe.r !== prior.r || safe.t !== prior.t || safe.b !== prior.b) {\n      this._layoutAll(); return;\n    }\n    this._safeBox = safe;\n    this._layoutControl(id);\n    if (id === 'stick' && !this._stick.active) this._drawStick(false);\n    if (this.editing && this._sel) this._layoutCoordinates?.();\n  }\n",
    "mobile-single-control-layout",
    1
  ],
  [
    "src/core/mobile.js",
    "this.layout[id] = { ax: c.ax, ay: c.ay, dx: c.dx, dy: c.dy, s: clamp(s, 0.5, 1.7) };\n    this._layoutAll();",
    "this.layout[id] = { ax: c.ax, ay: c.ay, dx: c.dx, dy: c.dy, s: clamp(s, 0.5, 1.7) };\n    this._layoutOne(id);",
    "mobile-edit-scale",
    1
  ],
  [
    "src/core/mobile.js",
    "      dy: (ay === 't' ? cy - safe.t : innerHeight - safe.b - cy) / unit, s: this._cfg(id).s };\n    this._layoutAll();",
    "      dy: (ay === 't' ? cy - safe.t : innerHeight - safe.b - cy) / unit, s: this._cfg(id).s };\n    this._layoutOne(id);",
    "mobile-edit-position",
    1
  ],
  [
    "src/core/mobile.js",
    "const el = this.els[id]; if (!el || el.offsetParent === null) continue;\n      const b = this._hitBoxes?.[id] || this._box(id);\n      if (Math.hypot(x - b.x, y - b.y) <= (b.d / 2) * 1.14) return id;",
    "const el = this.els[id]; if (!el) continue;\n      const b = this._hitBoxes?.[id] || this._box(id);\n      if (Math.hypot(x - b.x, y - b.y) <= (b.d / 2) * 1.14 && el.offsetParent !== null) return id;",
    "mobile-candidate-visibility",
    1
  ],
  [
    "src/core/mobile.js",
    "    const E = this.els; if (!E) return;\n    const L = this._hud || (this._hud = {});",
    "    const E = this.els; if (!E) return;\n    const pending = this._pendingHud || (this._pendingHud = {});\n    pending.inkLow = inkLow; pending.special = special; pending.ready = ready; pending.activeSp = activeSp;\n    pending.weapon = weapon; pending.specialId = specialId; pending.ink = ink; pending.subCost = subCost; pending.subReady = subReady;\n    if (ready !== this._hudReadyObserved) { this._hudReadyObserved = ready; if (ready) this._buzz(18); }\n    if (!((this.visible && this.owner?.lastDevice === 'touch') || this.editing)) return;\n    const L = this._hud || (this._hud = {});",
    "mobile-latest-hidden-hud",
    1
  ],
  [
    "src/core/mobile.js",
    "if (ready !== L.ready) { L.ready = ready; E.special.classList.toggle('is-ready', ready); if (ready) this._buzz(18); }",
    "if (ready !== L.ready) { L.ready = ready; E.special.classList.toggle('is-ready', ready); }",
    "mobile-hud-haptic-owner",
    1
  ],
  [
    "src/core/mobile.js",
    "    this.root.classList.toggle('is-active', on);",
    "    if (on && this._pendingHud) this.setHud(this._pendingHud);\n    this.root.classList.toggle('is-active', on);",
    "mobile-flush-before-show",
    1
  ],
  [
    "src/audio/music.js",
    "(failed) => this._onFileFailed(failed)",
    "(failed, error) => this._onFileFailed(failed, error)",
    "music-preload-error-reason",
    1
  ],
  [
    "src/audio/music.js",
    "(player) => this._onFileFailed(player)",
    "(player, error) => this._onFileFailed(player, error)",
    "music-stream-error-reason",
    1
  ],
  [
    "src/audio/music.js",
    "  _cancelFileRetry() {\n",
    "  _cancelFileRetry() {\n    this._clearFileRecovery();\n",
    "music-cancel-recovery",
    1
  ],
  [
    "src/audio/music.js",
    "  // Recorded music is the ONLY soundtrack for live turf battles. Retry transient",
    "  _clearFileRecovery() {\n    const recovery = this._fileRecovery; this._fileRecovery = null;\n    if (recovery) for (const [target, type, listener] of recovery.listeners) target.removeEventListener?.(type, listener);\n  }\n  _armFileRecovery(track, reason) {\n    // A malformed/unsupported media asset needs a new asset, not event-driven retries.\n    if (reason?.code === 3 || reason?.code === 4 || reason?.name === 'NotSupportedError') return;\n    if (this._fileRecovery || typeof window === 'undefined' || this._desiredTrack !== track) return;\n    const recovery = this._fileRecovery = { track, listeners: [] };\n    const retry = event => {\n      if (this._fileRecovery !== recovery || this._desiredTrack !== track || !this.ctx || this.ctx.state === 'closed') return;\n      if (event.type === 'visibilitychange' && globalThis.document?.hidden) return;\n      if ((event.type === 'pointerdown' || event.type === 'keydown') && event.isTrusted !== true) return;\n      if (reason?.name === 'NotAllowedError' && event.type !== 'pointerdown' && event.type !== 'keydown') return;\n      this._clearFileRecovery(); this._fileRetryCount = 0; this._fileErrorReported = false;\n      this._fileFailures.delete(track);\n      try { this.ctx.resume?.()?.catch?.(() => {}); } catch (_) { /* a closed context stays silent */ }\n      this.play(track, { fade: 0.2, _fileRetry: true });\n    };\n    const listen = (target, type) => {\n      if (!target?.addEventListener) return;\n      target.addEventListener(type, retry, { passive: true }); recovery.listeners.push([target, type, retry]);\n    };\n    for (const type of ['online', 'focus', 'pointerdown', 'keydown']) listen(window, type);\n    listen(globalThis.document, 'visibilitychange');\n  }\n\n  // Recorded music is the ONLY soundtrack for live turf battles. Retry transient",
    "music-event-recovery",
    1
  ],
  [
    "src/audio/music.js",
    "        try { this.onFileError?.(track, reason); } catch (_) { /* reporting must not interrupt gameplay */ }\n      }\n      return;",
    "        try { this.onFileError?.(track, reason); } catch (_) { /* reporting must not interrupt gameplay */ }\n      }\n      this._armFileRecovery(track, reason);\n      return;",
    "music-recovery-after-retries",
    1
  ],
  [
    "src/audio/audio.js",
    "  _suspendSfxReqs() {",
    "  canRearmLoop() {\n    if (!this.ctx || this.ctx.state === 'closed' || this._sfxSilent()) return false;\n    for (const handle of this.loops) if (!handle.playing) this.loops.delete(handle);\n    return this.loops.size < MAX_LOOPS;\n  }\n  _suspendSfxReqs() {",
    "loop-rearm-admission",
    1
  ],
  [
    "src/main.js",
    "    if (!this._amb) this._amb = G.audio.loop('harbor_ambience', { volume: 0.55 });",
    "    if (this._amb?.playing === false && !this._amb._sfxDeferred && G.audio.canRearmLoop?.()) { this._amb.stop?.(0); this._amb = null; }\n    if (!this._amb) this._amb = G.audio.loop('harbor_ambience', { volume: 0.55 });",
    "ambient-rearm",
    1
  ],
  [
    "src/main.js",
    "      if (on && !L[name]) L[name] = G.audio?.loop?.(name, { volume: 0 });",
    "      if (on && L[name]?.playing === false && !L[name]._sfxDeferred && G.audio?.canRearmLoop?.()) { L[name].stop?.(0); L[name] = null; }\n      if (on && !L[name]) L[name] = G.audio?.loop?.(name, { volume: 0 });",
    "movement-rearm",
    1
  ],
  [
    "src/game/showcase.js",
    "import { syncStudioShadow, releaseStudioShadow }",
    "import { nonWailVfxTicks } from '../../patches/splatoon3/runtime/nonwail-vfx-clock.mjs';\nimport { syncStudioShadow, releaseStudioShadow }",
    "jumpout-reference-clock",
    1
  ],
  [
    "src/game/showcase.js",
    "          if (this.rand() < 0.8) fx.drop(P.x + (this.rand() - 0.5) * 0.14, P.y + y - 0.2, P.z + (this.rand() - 0.5) * 0.14, (this.rand() - 0.5) * 0.5, -1, (this.rand() - 0.5) * 0.5, 0.012 + this.rand() * 0.016, 1, 2);",
    "          for (let trial = 0, count = nonWailVfxTicks(A, dt); trial < count; trial++)\n            if (this.rand() < 0.8) fx.drop(P.x + (this.rand() - 0.5) * 0.14, P.y + y - 0.2, P.z + (this.rand() - 0.5) * 0.14, (this.rand() - 0.5) * 0.5, -1, (this.rand() - 0.5) * 0.5, 0.012 + this.rand() * 0.016, 1, 2);",
    "jumpout-fixed-trials",
    1
  ],
  [
    "src/ui/hud.js",
    "    this._rafId = this._fxMap.size ? requestAnimationFrame(this._fxLoop) : 0;",
    "    this._rafId = !this.paused && !this._worldPaused && this._fxMap.size ? requestAnimationFrame(this._fxLoop) : 0;",
    "hud-pause-during-effect",
    1
  ]
];
const MARKER = "// Drive visual/audio queue 20261024\n";
export function adaptDriveVisualAudio(rel, code) {
  if (code.startsWith(MARKER)) return code;
  let changed = false;
  for (const [file, before, after, label, expected] of CHANGES) {
    if (file !== rel) continue;
    const count = code.split(before).length - 1;
    if (count !== expected) throw new Error(`Drive visual/audio anchor ${label}: ${file}: expected ${expected}, got ${count}`);
    code = code.replaceAll(before, after); changed = true;
  }
  return changed ? MARKER + code : code;
}
