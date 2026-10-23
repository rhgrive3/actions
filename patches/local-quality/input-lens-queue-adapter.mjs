// Audited build-time changes: each source anchor must match exactly once.
const CHANGES = [
  [
    "src/ui/menus.js",
    "    L.shown += (L.target - L.shown) * (1 - Math.exp(-dt * 6));",
    "    if (L.shown !== L.target || !Number.isFinite(L.shown) || !Number.isFinite(dt)) L.shown += (L.target - L.shown) * (1 - Math.exp(-dt * 6));"
  ],
  [
    "src/audio/music.js",
    "    const song = getSong(track);",
    "    const song = !this.offline && typeof window !== 'undefined' && FILE_TRACK_URLS[track] ? { ...SONGS[track], id: track } : getSong(track);"
  ],
  [
    "src/ui/menus.js",
    "    const byCode = {\n      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',\n      Enter: 'accept', NumpadEnter: 'accept', Space: 'accept', Escape: 'back', Backspace: 'back',\n      KeyQ: 'tab_prev', KeyE: 'tab_next', PageUp: 'tab_prev', PageDown: 'tab_next', Tab: e.shiftKey ? 'tab_prev' : 'tab_next', KeyR: 'alt',\n    };\n    const byKey = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'accept', ' ': 'accept', Escape: 'back', Backspace: 'back' };\n    const dir = byCode[e.code] || byKey[e.key];\n",
    "    const dir = e.code === 'Tab' ? (e.shiftKey ? 'tab_prev' : 'tab_next') : MENU_BY_CODE[e.code] || MENU_BY_KEY[e.key];\n"
  ],
  [
    "src/ui/menus.js",
    "['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'OS'].includes(e.key)",
    "MENU_MODIFIERS.includes(e.key)"
  ],
  [
    "src/fx/screenfx.js",
    "  splat(ch, cx, cy, size, aspect, { arms = 6, sats = 6, life = 2.1 } = {}) {\n    const rot0 = Math.random() * TAU;\n    const P = (x, y, a, d) => [x + (Math.cos(a) * d) / aspect, y + Math.sin(a) * d];\n    const core = this.add('drop', ch, cx, cy, size * 0.92, { I: 1.4, life: life * rnd(0.95, 1.15), stick: rnd(0.25, 0.55) });\n    core.mass = 1;\n    // lumps make the core silhouette irregular\n    const nl = 3 + ((Math.random() * 2) | 0);\n    for (let i = 0; i < nl; i++) {\n      const a = rot0 + (i / nl) * TAU + rnd(-0.5, 0.5);\n      const [x, y] = P(cx, cy, a, size * rnd(0.3, 0.55));\n      const l = this.add('drop', ch, x, y, size * rnd(0.5, 0.72), { I: 1.25, life: life * rnd(0.75, 1.0), stick: rnd(0.5, 1.2) });\n      l.mass = 0.6;\n    }\n    // arms: fat necks (elongated metaballs) ending in bulbs; some stubby, one or two long\n    for (let i = 0; i < arms; i++) {\n      const a = rot0 + ((i + rnd(-0.3, 0.3)) / arms) * TAU;\n      const long = Math.random() < 0.3;\n      const L = size * (long ? rnd(1.35, 1.8) : rnd(0.85, 1.2));\n      const [nx, ny] = P(cx, cy, a, L * 0.5);\n      this.add('arm', ch, nx, ny, size * 0.3, { rx: size * rnd(0.2, 0.3) * (long ? 0.8 : 1), ry: L * 0.5, rot: a - Math.PI / 2, I: 1.3, life: life * rnd(0.6, 0.85) });\n      const [bx, by] = P(cx, cy, a, L);\n      const b = this.add('drop', ch, bx, by, size * (long ? rnd(0.26, 0.34) : rnd(0.3, 0.42)), { I: 1.35, life: life * rnd(0.7, 1.0), stick: rnd(0.4, 1.1) });\n      b.mass = 0.4;\n    }\n    // satellites flung outward (a few stretched along their flight direction)\n    for (let i = 0; i < sats; i++) {\n      const a = Math.random() * TAU, d = size * rnd(1.45, 2.5);\n      const sr = size * rnd(0.07, 0.16);\n      const [x, y] = P(cx, cy, a, d);\n      const st = Math.random() < 0.4;\n      this.add('sat', ch, x, y, sr, { rx: sr * (st ? 0.7 : 1), ry: sr * (st ? 1.9 : 1), rot: a - Math.PI / 2, I: 1.3, life: rnd(0.5, 1.3), pop: 0.05 });\n    }\n    this.dirty = true;\n  }\n\n",
    "  splat(ch, cx, cy, size, aspect, { arms = 6, sats = 6, life = 2.1 } = {}) {\n    const rot0 = Math.random() * TAU;\n    const core = this.add('drop', ch, cx, cy, size * 0.92, { I: 1.4, life: life * rnd(0.95, 1.15), stick: rnd(0.25, 0.55) });\n    core.mass = 1;\n    // lumps make the core silhouette irregular\n    const nl = 3 + ((Math.random() * 2) | 0);\n    for (let i = 0; i < nl; i++) {\n      const a = rot0 + (i / nl) * TAU + rnd(-0.5, 0.5);\n      const d = size * rnd(0.3, 0.55);\n      const x = cx + (Math.cos(a) * d) / aspect, y = cy + Math.sin(a) * d;\n      const l = this.add('drop', ch, x, y, size * rnd(0.5, 0.72), { I: 1.25, life: life * rnd(0.75, 1.0), stick: rnd(0.5, 1.2) });\n      l.mass = 0.6;\n    }\n    // arms: fat necks (elongated metaballs) ending in bulbs; some stubby, one or two long\n    for (let i = 0; i < arms; i++) {\n      const a = rot0 + ((i + rnd(-0.3, 0.3)) / arms) * TAU;\n      const long = Math.random() < 0.3;\n      const L = size * (long ? rnd(1.35, 1.8) : rnd(0.85, 1.2));\n      const ca = Math.cos(a), sa = Math.sin(a), neck = L * 0.5;\n      const nx = cx + (ca * neck) / aspect, ny = cy + sa * neck;\n      this.add('arm', ch, nx, ny, size * 0.3, { rx: size * rnd(0.2, 0.3) * (long ? 0.8 : 1), ry: L * 0.5, rot: a - Math.PI / 2, I: 1.3, life: life * rnd(0.6, 0.85) });\n      const bx = cx + (ca * L) / aspect, by = cy + sa * L;\n      const b = this.add('drop', ch, bx, by, size * (long ? rnd(0.26, 0.34) : rnd(0.3, 0.42)), { I: 1.35, life: life * rnd(0.7, 1.0), stick: rnd(0.4, 1.1) });\n      b.mass = 0.4;\n    }\n    // satellites flung outward (a few stretched along their flight direction)\n    for (let i = 0; i < sats; i++) {\n      const a = Math.random() * TAU, d = size * rnd(1.45, 2.5);\n      const sr = size * rnd(0.07, 0.16);\n      const x = cx + (Math.cos(a) * d) / aspect, y = cy + Math.sin(a) * d;\n      const st = Math.random() < 0.4;\n      this.add('sat', ch, x, y, sr, { rx: sr * (st ? 0.7 : 1), ry: sr * (st ? 1.9 : 1), rot: a - Math.PI / 2, I: 1.3, life: rnd(0.5, 1.3), pop: 0.05 });\n    }\n    this.dirty = true;\n  }\n\n"
  ],
  [
    "src/ui/hud.js",
    "      this.mapCursor.style.transform = `translate3d(${(M.cx * bw).toFixed(1)}px,${(M.cy * bh).toFixed(1)}px,0)`;\n      this.mapCursor.classList.toggle('is-snap', M.hover >= 0);",
    "      const cursorTransform = `translate3d(${(M.cx * bw).toFixed(1)}px,${(M.cy * bh).toFixed(1)}px,0)`;\n      writeQueueTransform(this.mapCursor, cursorTransform);\n      const cursorSnap = M.hover >= 0;\n      if (this.mapCursor.classList.contains('is-snap') !== cursorSnap) this.mapCursor.classList.toggle('is-snap', cursorSnap);"
  ],
  [
    "src/ui/menus.js",
    "    const st = el.style;\n    const move = (e) => {\n      if (!r) r = el.getBoundingClientRect();",
    "    const st = el.style;\n    const write = (name, value) => { if (st.getPropertyValue(name) !== value) st.setProperty(name, value); };\n    if (!this._fxLayout) {\n      const layout = this._fxLayout = { epoch: 0, listeners: [], motion: new Map() };\n      const listen = (target, type, fn, options) => { target?.addEventListener?.(type, fn, options); layout.listeners.push(() => target?.removeEventListener?.(type, fn, options)); };\n      const invalidate = () => { layout.epoch++; };\n      for (const type of ['resize', 'orientationchange', 'scroll']) listen(window, type, invalidate, true);\n      const token = e => (e.type.startsWith('transition') ? 't:' : 'a:') + (e.propertyName ?? e.animationName ?? '') + ':' + (e.pseudoElement || '');\n      const begin = e => { let active = layout.motion.get(e.target); if (!active) { active = new Map(); layout.motion.set(e.target, active); } const key = token(e); active.set(key, (active.get(key) || 0) + 1); invalidate(); };\n      const end = e => { const active = layout.motion.get(e.target), key = token(e); if (active) { const count = (active.get(key) || 0) - 1; if (count > 0) active.set(key, count); else active.delete(key); if (!active.size) layout.motion.delete(e.target); } invalidate(); };\n      for (const type of ['transitionrun', 'animationstart']) listen(this.el, type, begin, true);\n      for (const type of ['transitionend', 'transitioncancel', 'animationend', 'animationcancel']) listen(this.el, type, end, true);\n      listen(document.fonts, 'loadingdone', invalidate);\n      if (typeof MutationObserver !== 'undefined') { const observer = new MutationObserver(() => { for (const target of layout.motion.keys()) if (!this.el.contains(target)) layout.motion.delete(target); invalidate(); }); observer.observe(this.el, { childList: true, subtree: true }); layout.listeners.push(() => observer.disconnect()); }\n      if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(invalidate); observer.observe(this.el); layout.listeners.push(() => observer.disconnect()); }\n    }\n    let measuredEpoch = -1;\n    const move = (e) => {\n      const layout = this._fxLayout;\n      let movingAncestor = false;\n      if (layout) for (const target of layout.motion.keys()) { if (target !== el && target.contains?.(el)) { movingAncestor = true; break; } }\n      if (!r || measuredEpoch !== layout?.epoch || movingAncestor) { r = el.getBoundingClientRect(); measuredEpoch = layout?.epoch; }"
  ],
  [
    "src/ui/menus.js",
    "      st.setProperty('--mx', (x * 100).toFixed(1) + '%');",
    "      write('--mx', (x * 100).toFixed(1) + '%');"
  ],
  [
    "src/ui/menus.js",
    "      st.setProperty('--my', (y * 100).toFixed(1) + '%');",
    "      write('--my', (y * 100).toFixed(1) + '%');"
  ],
  [
    "src/ui/menus.js",
    "        st.setProperty('--rx', ((0.5 - y) * tilt).toFixed(2) + 'deg');",
    "        write('--rx', ((0.5 - y) * tilt).toFixed(2) + 'deg');"
  ],
  [
    "src/ui/menus.js",
    "        st.setProperty('--ry', ((x - 0.5) * tilt).toFixed(2) + 'deg');",
    "        write('--ry', ((x - 0.5) * tilt).toFixed(2) + 'deg');"
  ],
  [
    "src/ui/menus.js",
    "        st.setProperty('--px', (x - 0.5).toFixed(3));",
    "        write('--px', (x - 0.5).toFixed(3));"
  ],
  [
    "src/ui/menus.js",
    "        st.setProperty('--py', (y - 0.5).toFixed(3));",
    "        write('--py', (y - 0.5).toFixed(3));"
  ],
  [
    "src/ui/menus.js",
    "      if (tilt) { st.setProperty('--rx', '0deg'); st.setProperty('--ry', '0deg'); st.setProperty('--px', '0'); st.setProperty('--py', '0'); }",
    "      if (tilt) { write('--rx', '0deg'); write('--ry', '0deg'); write('--px', '0'); write('--py', '0'); }"
  ],
  [
    "src/ui/menus.js",
    "  dispose() {",
    "  dispose() {\n    if (this._fxLayout) { for (const off of this._fxLayout.listeners) off(); this._fxLayout.motion.clear(); this._fxLayout = null; }"
  ],
  [
    "src/ui/menus.js",
    "r = el.getBoundingClientRect(); el.classList.add('is-hover'); move(e);",
    "r = el.getBoundingClientRect(); measuredEpoch = this._fxLayout?.epoch; el.classList.add('is-hover'); move(e);"
  ],
  [
    "src/ui/menus.js",
    "      P.key = key;",
    "      clearPreviewRoot(this.el);\n      P.key = key;"
  ],
  [
    "src/ui/menus.js",
    "          lobbyPill.firstChild.style.setProperty('--f', (left / backIn).toFixed(4));",
    "          const ringFraction = (left / backIn).toFixed(4);\n          if (lobbyPill.firstChild.style.getPropertyValue('--f') !== ringFraction) lobbyPill.firstChild.style.setProperty('--f', ringFraction);"
  ],
  [
    "src/ui/menu-art.js",
    "      shown += (v - shown) * (1 - Math.exp(-dt * 10));",
    "      if (shown !== v || !Number.isFinite(dt)) shown += (v - shown) * (1 - Math.exp(-dt * 10));"
  ],
  [
    "src/ui/menu-art.js",
    "      inputEl.style.transform = `translateX(${(s * 16).toFixed(1)}px)`;",
    "      const inputTransform = `translateX(${(s * 16).toFixed(1)}px)`;\n      writeQueueTransform(inputEl, inputTransform);"
  ],
  [
    "src/ui/menu-art.js",
    "      panoEl.style.transform = `translateX(${(-33.333 - s * 5.2 * shown).toFixed(2)}%)`;",
    "      const panoTransform = `translateX(${(-33.333 - s * 5.2 * shown).toFixed(2)}%)`;\n      writeQueueTransform(panoEl, panoTransform);"
  ],
  [
    "src/ui/menu-art.js",
    "    el, set,\n    tick: (dt) => {\n      t += dt;\n      if (key === 'stickMode') {",
    "    el, set,\n    tick: key === 'touchScale' || key === 'touchOpacity' ? undefined : (dt) => {\n      t += dt;\n      if (key === 'stickMode') {"
  ],
  [
    "src/ui/hud-boss.js",
    "  squadTeams(teams) {",
    "  squadTeams(teams, views = null) {\n    // The HUD supplies synchronous scratch. Other callers retain the original\n    // fresh-array ownership contract.\n    if (views) {\n      const first = views[0].players, second = views[1].players;\n      first.length = 0; second.length = 0;\n      let count = 0;\n      for (const t of teams || []) for (const p of (t && t.players) || []) {\n        if (count < 4) first.push(p); else if (count < 8) second.push(p);\n        count++;\n      }\n      views[0].color = teams && teams[0] && teams[0].color;\n      views[1].color = teams && teams[0] && teams[0].color;\n      return views;\n    }"
  ],
  [
    "src/ui/hud.js",
    "this.boss.squadTeams(f.teams)",
    "this.boss.squadTeams(f.teams, this._bossSquadViews ||= [{color:null,players:[]},{color:null,players:[]}])"
  ],
  [
    "src/audio/music.js",
    "  _init(ctx, dest, opt = {}) {\n    if (this.ctx) return this;",
    "  _init(ctx, dest, opt = {}) {\n    if (this.ctx === ctx && this._musicDest === dest) return this;\n    if (this.ctx) this.dispose();\n    this._musicDest = dest;"
  ],
  [
    "src/audio/music.js",
    "  dispose() {\n    this._cancelFileRetry();",
    "  dispose() {\n    this._musicDest = null;\n    this._preparedMusicImpulse = null;\n    this.dlyIn = this.revIn = this.dA = this.dB = null;\n    this._cancelFileRetry();"
  ],
  [
    "src/ui/hud.js",
    "if (!vis) { d.el.style.opacity = '0'; continue; }",
    "if (!vis) { if (d.el.style.opacity !== '0') d.el.style.opacity = '0'; continue; }"
  ],
  [
    "src/ui/hud.js",
    "      d.el.style.opacity = o.toFixed(2);\n      d.el.style.transform = `translate3d(${((p.x * 0.5 + 0.5) * W).toFixed(1)}px,${((-p.y * 0.5 + 0.5) * H).toFixed(1)}px,0)`;",
    "      const opacity = String(Number(o.toFixed(2)));\n      if (d.el.style.opacity !== opacity) d.el.style.opacity = opacity;\n      const transform = `translate3d(${((p.x * 0.5 + 0.5) * W).toFixed(1)}px,${((-p.y * 0.5 + 0.5) * H).toFixed(1)}px,0)`;\n      writeQueueTransform(d.el, transform);"
  ],
  [
    "src/ui/hud-boss.js",
    "if (!p || p.behind) { c.el.style.opacity = '0'; continue; }",
    "if (!p || p.behind) { if (c.el.style.opacity !== '0') c.el.style.opacity = '0'; continue; }"
  ],
  [
    "src/ui/hud-boss.js",
    "      c.el.style.opacity = '';",
    "      if (c.el.style.opacity !== '') c.el.style.opacity = '';"
  ]
];
export function adaptInputLensQueue(rel, code) {
  if (rel === 'src/audio/music.js') {
    const first = '    // ping-pong delay (dotted 8th, set per track)';
    const last = '    if (!this.offline) this._startTimer();';
    const a = code.indexOf(first), b = code.indexOf(last, a);
    if (a < 0 || b < 0 || code.indexOf(first, a + first.length) >= 0) throw Error('Music FX queue anchor mismatch');
    const graph = code.slice(a, b).replace(
      'this._nodes = [this.mix, hp, comp, this.out,',
      'this._nodes.push('
    ).replace('conv, rOut];', 'conv, rOut);').replace('opt.impulse', 'this._preparedMusicImpulse');
    if (graph.includes('this._nodes =') || !graph.includes('this._nodes.push(')) throw Error('Music FX node ownership mismatch');
    code = code.slice(0, a) + '    this._preparedMusicImpulse = opt.impulse || null;\n    this.dlyIn = this.revIn = this.dA = this.dB = null;\n    this._nodes = [this.mix, hp, comp, this.out];\n' + code.slice(b);
    const method = '  _startTimer() {';
    if (code.split(method).length !== 2) throw Error('Music FX method anchor mismatch');
    code = code.replace(method, '  _ensureProceduralFx() {\n    if (this.dlyIn) return;\n    const ctx = this.ctx;\n    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };\n' + graph + '    this._preparedMusicImpulse = null;\n  }\n\n' + method);
    const player = '    if (!p) p = new Player(this, track, t0, opts);';
    if (code.split(player).length !== 2) throw Error('Music FX player anchor mismatch');
    code = code.replace(player, '    if (!p) { this._ensureProceduralFx(); p = new Player(this, track, t0, opts); }');
    const delay = '    this.dA.delayTime.setTargetAtTime(beat * 0.75, t0, 0.05); this.dB.delayTime.setTargetAtTime(beat * 0.75, t0, 0.05);';
    if (code.split(delay).length !== 2) throw Error('Music FX delay anchor mismatch');
    code = code.replace(delay, '    if (this.dA) { this.dA.delayTime.setTargetAtTime(beat * 0.75, t0, 0.05); this.dB.delayTime.setTargetAtTime(beat * 0.75, t0, 0.05); }');
  }
  for (const [owner, before, after] of CHANGES) {
    if (rel !== owner) continue;
    const at = code.indexOf(before);
    if (at < 0 || code.indexOf(before, at + before.length) >= 0) throw Error('Input/lens queue anchor mismatch: ' + rel + ' ' + before.slice(0, 60));
    code = code.slice(0, at) + after + code.slice(at + before.length);
  }
  if (rel === 'src/ui/menus.js') code = "import { clearPreviewRoot } from '../../patches/local-quality/menu-preview.mjs';\n" + "const MENU_MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'OS'];\nconst MENU_BY_CODE = {\n      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',\n      Enter: 'accept', NumpadEnter: 'accept', Space: 'accept', Escape: 'back', Backspace: 'back',\n      KeyQ: 'tab_prev', KeyE: 'tab_next', PageUp: 'tab_prev', PageDown: 'tab_next', KeyR: 'alt',\n    };\nconst MENU_BY_KEY = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'accept', ' ': 'accept', Escape: 'back', Backspace: 'back' };\n" + code;
  if (rel === 'src/ui/hud.js' || rel === 'src/ui/menu-art.js') code = `const QUEUE_TRANSFORMS = new WeakMap();
function writeQueueTransform(el, text) {
  let row = QUEUE_TRANSFORMS.get(el);
  if (row && row.text === text && el.style.transform === row.serialized) return;
  el.style.transform = text;
  if (!row) { row = {}; QUEUE_TRANSFORMS.set(el, row); }
  row.text = text; row.serialized = el.style.transform;
}
` + code;
  return code;
}
