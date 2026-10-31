// Exact final-source changes for the 2026-10-30 UI/audio queue batch. Build-only.
export const UI_AUDIO_CHANGES = [
  {
    "rel": "src/ui/menu-art.js",
    "before": "      if (key === 'gyroInvertY') dev.style.transform = `perspective(300px) rotateX(${(s * 26).toFixed(1)}deg)`;\n      else dev.style.transform = `perspective(300px) rotateY(${(s * 30).toFixed(1)}deg)`;",
    "after": "      const transform = key === 'gyroInvertY' ? `perspective(300px) rotateX(${(s * 26).toFixed(1)}deg)` : `perspective(300px) rotateY(${(s * 30).toFixed(1)}deg)`;\n      writeQueueTransform(dev, transform);",
    "label": "gyro preview serialized DOM write",
    "count": 1,
    "queue": "settings-touch-gyro-preview-skip-identical-transform-writes"
  },
  {
    "rel": "src/ui/menu-art.js",
    "before": "  const tf = (e, x, y, s = 1) => e && e.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})${s !== 1 ? ` scale(${s.toFixed(3)})` : ''}`);",
    "after": "  const tf = (e, x, y, s = 1) => { if (!e) return; const value = `translate(${x.toFixed(1)} ${y.toFixed(1)})${s !== 1 ? ` scale(${s.toFixed(3)})` : ''}`; if (e.getAttribute('transform') !== value) e.setAttribute('transform', value); };",
    "label": "touch SVG transform actual attribute comparison",
    "count": 1,
    "queue": "settings-touch-gyro-preview-skip-identical-transform-writes"
  },
  {
    "rel": "src/ui/menu-art.js",
    "before": "      if (shown !== v || !Number.isFinite(dt)) shown += (v - shown) * (1 - Math.exp(-dt * 10));",
    "after": "      if (shown !== v || !Number.isFinite(shown) || !Number.isFinite(v) || !Number.isFinite(dt)) shown += (v - shown) * (1 - Math.exp(-dt * 10));",
    "label": "retain exceptional-value preview interpolation",
    "count": 1,
    "queue": "settings-look-preview-skip-identical-transform-and-settled-exp"
  },
  {
    "rel": "src/main.js",
    "before": "    this._amb?.set?.({ volume: this._ambV });",
    "after": "    if (this._amb?.set) {\n      const arg = this._ambientSetBusy ? {volume: this._ambV} : (this._ambientSetArg || (this._ambientSetArg = {volume: 0}));\n      arg.volume = this._ambV; const busy = this._ambientSetBusy; this._ambientSetBusy = true;\n      try { this._amb.set(arg); } finally { this._ambientSetBusy = busy; }\n    }",
    "label": "ambient synchronous argument lease",
    "count": 1,
    "queue": "main-audio-control-set-arguments-reuse-per-game-scratch"
  },
  {
    "rel": "src/main.js",
    "before": "      h.set({ volume: h._v, pitch });",
    "after": "      const args = this._loopSetArgs || (this._loopSetArgs = Object.create(null));\n      const entry = args[name] || (args[name] = {arg: {volume: 0, pitch: 1}, busy: false});\n      const arg = entry.busy ? {volume: h._v, pitch} : entry.arg; arg.volume = h._v; arg.pitch = pitch;\n      const busy = entry.busy; entry.busy = true;\n      try { h.set(arg); } finally { entry.busy = busy; }",
    "label": "per-name local loop argument lease",
    "count": 1,
    "queue": "main-audio-control-set-arguments-reuse-per-game-scratch"
  },
  {
    "rel": "src/core/input.js",
    "before": "    if (!pad) { this.padPrev = []; this.padMenuBlocked.clear(); return; }",
    "after": "    if (!pad) { this.padPrev.length = 0; this.padMenuBlocked.clear(); return; }",
    "label": "no-device preserves empty previous button storage",
    "count": 1,
    "queue": "gamepad-focused-no-device-reuse-empty-padprev"
  },
  {
    "rel": "src/core/mobile.js",
    "before": "    this.layout[id] = { ax, ay, dx: +dx.toFixed(4), dy: +dy.toFixed(4), s: this._cfg(id).s };\n    this._layoutAll();",
    "after": "    this.layout[id] = { ax, ay, dx: +dx.toFixed(4), dy: +dy.toFixed(4), s: this._cfg(id).s };\n    this._layoutOne(id);",
    "label": "drag updates selected control and existing viewport fallback",
    "count": 1,
    "queue": "mobile-editor-selected-control-incremental-layout"
  },
  {
    "rel": "src/game/player.js",
    "before": "  captureMapGyro(open) {\n    const mobile=this.input.mobile, gyro=mobile?.active && mobile.root && mobile.gyro;\n    const zero={yaw:0,pitch:0};\n    if (!gyro?.enabled) { this.clearMapGyro(); return zero; }\n    open=!!open;\n    if (open !== !!this._mapGyroOpen) {\n      this.clearMapGyro(); this._mapGyroOpen=open; gyro.discard(); return zero;\n    }\n    const delta=gyro.consume(this._gyro || (this._gyro={yaw:0,pitch:0}));\n    if (!open) return delta;\n    this._mapGyroYaw=(this._mapGyroYaw || 0)+(Number.isFinite(delta.yaw)?delta.yaw:0);\n    this._mapGyroPitch=(this._mapGyroPitch || 0)+(Number.isFinite(delta.pitch)?delta.pitch:0);\n    return zero;\n  }\n",
    "after": "  captureMapGyro(open) {\n    const mobile=this.input.mobile, gyro=mobile?.active && mobile.root && mobile.gyro;\n    if (!gyro?.enabled) { this.clearMapGyro(); return {yaw:0,pitch:0}; }\n    open=!!open;\n    if (open !== !!this._mapGyroOpen) {\n      this.clearMapGyro(); this._mapGyroOpen=open; gyro.discard(); return {yaw:0,pitch:0};\n    }\n    const delta=gyro.consume(this._gyro || (this._gyro={yaw:0,pitch:0}));\n    if (!open) return delta;\n    this._mapGyroYaw=(this._mapGyroYaw || 0)+(Number.isFinite(delta.yaw)?delta.yaw:0);\n    this._mapGyroPitch=(this._mapGyroPitch || 0)+(Number.isFinite(delta.pitch)?delta.pitch:0);\n    return {yaw:0,pitch:0};\n  }\n",
    "label": "zero result is allocated only on paths returning zero",
    "count": 1,
    "queue": "map-gyro-capture-lazy-zero-return-on-live-aim"
  },
  {
    "rel": "src/game/player.js",
    "before": "  consumeMapGyro() {\n    const result={yaw:this._mapGyroYaw || 0,pitch:this._mapGyroPitch || 0};",
    "after": "  consumeMapGyro(out) {\n    const result=out || {yaw:0,pitch:0}; result.yaw=this._mapGyroYaw || 0; result.pitch=this._mapGyroPitch || 0;",
    "label": "optional caller-owned gyro delta preserves default fresh result",
    "count": 1,
    "queue": "map-gyro-diorama-reuse-consumed-delta-record"
  },
  {
    "rel": "src/ui/diorama.js",
    "before": "    const motion = navigation?.consumeMapGyro?.();",
    "after": "    const motion = navigation?.consumeMapGyro?.(this._mapGyroDelta || (this._mapGyroDelta = {yaw:0,pitch:0}));",
    "label": "diorama owns synchronous gyro result storage",
    "count": 1,
    "queue": "map-gyro-diorama-reuse-consumed-delta-record"
  },
  {
    "rel": "src/ui/hud.js",
    "before": "    if (filled !== L.spSegments) {\n      L.spSegments = filled;\n      this.spSegments.forEach((segment, i) => segment.classList.toggle('is-filled', i < filled));\n      this.sp.setAttribute('aria-valuenow', String(filled));\n    }",
    "after": "    const previous = L.spSegments, segments = this.spSegments;\n    const sameNodes = L.spSegmentNodes === segments && L.spSegmentFirst === segments[0] && L.spSegmentLast === segments[segments.length - 1];\n    if (filled !== previous || !sameNodes) {\n      const valid = sameNodes && Number.isInteger(previous) && previous >= 0 && previous <= segments.length && Number.isInteger(filled) && filled >= 0 && filled <= segments.length;\n      const begin = valid ? Math.min(previous, filled) : 0, end = valid ? Math.max(previous, filled) : segments.length;\n      for (let i = begin; i < end; i++) segments[i].classList.toggle('is-filled', i < filled);\n      L.spSegments = filled; L.spSegmentNodes = segments; L.spSegmentFirst = segments[0]; L.spSegmentLast = segments[segments.length - 1];\n      this.sp.setAttribute('aria-valuenow', String(filled));\n    }",
    "label": "special gauge updates changed segment interval and resets replaced node collections",
    "count": 1,
    "queue": "hud-special-gauge-delta-segment-class-updates"
  },
  {
    "rel": "src/ui/diorama.js",
    "before": "      const key = `${label}|${st}|${dead ? 1 : 0}|${p.ok ? 1 : 0}|${this.hover === i ? 1 : 0}|${weapon}`;",
    "after": "      const hover = this.hover === i, raw = p._displayKey || (p._displayKey = {});\n      const same = raw.key === p.key && raw.valid && raw.label === label && raw.st === st && raw.dead === dead && raw.ok === !!p.ok && raw.hover === hover && raw.weapon === weapon;\n      const key = same ? raw.key : `${label}|${st}|${dead ? 1 : 0}|${p.ok ? 1 : 0}|${hover ? 1 : 0}|${weapon}`;\n      if (!same) { raw.key = key; raw.valid = true; raw.label = label; raw.st = st; raw.dead = dead; raw.ok = !!p.ok; raw.hover = hover; raw.weapon = weapon; }",
    "label": "stationary diorama pin skips display key formatting",
    "count": 1,
    "queue": "diorama-pin-state-dirty-check-without-frame-strings"
  },
  {
    "rel": "src/ui/hud.js",
    "before": "    const W = innerWidth, H = innerHeight;\n    const u = Math.min(W / 100, (H * 1.7778) / 100);\n    const asp = (m.canvas.width || 1) / (m.canvas.height || 1);\n    const small = 14.5 * u, large = Math.min(H * 0.78, W * 0.6);\n    const w0 = asp >= 1 ? small : small * asp, h0 = asp >= 1 ? small / asp : small;\n    const w1 = asp >= 1 ? large : large * asp, h1 = asp >= 1 ? large / asp : large;\n    const t = this._mapT;\n    const bw = lerp(w0, w1, t), bh = lerp(h0, h1, t);\n    // touch: the move stick owns the bottom-left, so the small map lives top-left (tap it to open the big map)\n    const touchUI = G.input?.lastDevice === 'touch';\n    const sb = touchUI ? (G.input?.mobile?._safeBox || null) : null;\n    const x0 = touchUI ? Math.max(2.2 * u, (sb?.l ?? 8) + 4) : 2.2 * u, y0 = touchUI ? Math.max(1.6 * u, (sb?.t ?? 6) + 4) : H - 2.2 * u - h0;\n    const x = lerp(x0, (W - w1) / 2, t), y = lerp(y0, (H - h1) / 2 + u * 1.2, t);\n    const inside = (W - w1) / 2 < 22 * u;",
    "after": "    const W = innerWidth, H = innerHeight, canvas = m.canvas;\n    const cw = canvas.width, ch = canvas.height, t = this._mapT;\n    const touchUI = G.input?.lastDevice === 'touch';\n    const sb = touchUI ? (G.input?.mobile?._safeBox || null) : null;\n    const safeLeft = sb?.l, safeTop = sb?.t;\n    const metrics = this._mapMetrics || (this._mapMetrics = {});\n    if (metrics.canvas !== canvas || !Object.is(metrics.W, W) || !Object.is(metrics.H, H) || !Object.is(metrics.cw, cw) || !Object.is(metrics.ch, ch) || !Object.is(metrics.t, t) || metrics.touch !== touchUI || !Object.is(metrics.left, safeLeft) || !Object.is(metrics.top, safeTop)) {\n      const u = Math.min(W / 100, (H * 1.7778) / 100);\n      const asp = (cw || 1) / (ch || 1);\n      const small = 14.5 * u, large = Math.min(H * 0.78, W * 0.6);\n      const w0 = asp >= 1 ? small : small * asp, h0 = asp >= 1 ? small / asp : small;\n      const w1 = asp >= 1 ? large : large * asp, h1 = asp >= 1 ? large / asp : large;\n      const bw = lerp(w0, w1, t), bh = lerp(h0, h1, t);\n      const x0 = touchUI ? Math.max(2.2 * u, (safeLeft ?? 8) + 4) : 2.2 * u, y0 = touchUI ? Math.max(1.6 * u, (safeTop ?? 6) + 4) : H - 2.2 * u - h0;\n      metrics.u = u; metrics.bw = bw; metrics.bh = bh;\n      metrics.x = lerp(x0, (W - w1) / 2, t); metrics.y = lerp(y0, (H - h1) / 2 + u * 1.2, t);\n      metrics.inside = (W - w1) / 2 < 22 * u;\n      metrics.canvas = canvas; metrics.W = W; metrics.H = H; metrics.cw = cw; metrics.ch = ch; metrics.t = t;\n      metrics.touch = touchUI; metrics.left = safeLeft; metrics.top = safeTop;\n    }\n    const u = metrics.u, bw = metrics.bw, bh = metrics.bh, x = metrics.x, y = metrics.y, inside = metrics.inside;",
    "label": "cache stationary minimap metrics with canvas/viewport/spring/device/safe-area invalidation",
    "count": 1,
    "queue": "hud-minimap-cache-stationary-layout-metrics"
  },
  {
    "rel": "src/ui/hud.js",
    "before": "        const k = `sq${t}${i}`;",
    "after": "        const keys = this._squadSlotKeys || (this._squadSlotKeys = [[\"sq00\", \"sq01\", \"sq02\", \"sq03\"], [\"sq10\", \"sq11\", \"sq12\", \"sq13\"]]);\n        const k = keys[t][i];",
    "label": "reuse finite squad slot keys alongside existing scalar display key cache",
    "count": 1,
    "queue": "hud-squad-stable-slot-state-elide-frame-keys"
  },
  {
    "rel": "src/ui/hud.js",
    "before": "        barA.style.transform = `scaleX(${a.toFixed(4)})`;\n        barB.style.transform = `scaleX(${b.toFixed(4)})`;",
    "after": "        writeQueueTransform(barA, `scaleX(${a.toFixed(4)})`);\n        writeQueueTransform(barB, `scaleX(${b.toFixed(4)})`);",
    "label": "guard repeated judge bar transforms",
    "count": 1,
    "queue": "hud-turf-judge-suspense-and-settled-bar-dirty-writes"
  },
  {
    "rel": "src/ui/hud.js",
    "before": "        edgeA.style.transform = `translateX(${(a * trackW).toFixed(1)}px)`;\n        edgeB.style.transform = `translateX(${(-b * trackW).toFixed(1)}px)`;",
    "after": "        writeQueueTransform(edgeA, `translateX(${(a * trackW).toFixed(1)}px)`);\n        writeQueueTransform(edgeB, `translateX(${(-b * trackW).toFixed(1)}px)`);",
    "label": "guard repeated judge end-cap transforms",
    "count": 1,
    "queue": "hud-turf-judge-suspense-and-settled-bar-dirty-writes"
  },
  {
    "rel": "src/ui/hud.js",
    "before": "        numA.textContent = fmt(pa * nk); numB.textContent = fmt(pb * nk);",
    "after": "        const textA = fmt(pa * nk), textB = fmt(pb * nk);\n        if (numA.textContent !== textA) numA.textContent = textA;\n        if (numB.textContent !== textB) numB.textContent = textB;",
    "label": "guard settled judge percentage text",
    "count": 1,
    "queue": "hud-turf-judge-suspense-and-settled-bar-dirty-writes"
  },
  {
    "rel": "src/main.js",
    "before": "projectShotGuide(m.controller?.enabled && m.controller?.a?.alive ? m.controller.shotGuide : null, cam, W, H)",
    "after": "projectShotGuide(m.controller?.enabled && m.controller?.a?.alive ? m.controller.shotGuide : null, cam, W, H, m._hudProjectedGuide || (m._hudProjectedGuide = {x:0,y:0,frames:0}))",
    "label": "match-owned projected guide output; public API retains fresh snapshots",
    "count": 1,
    "queue": "shot-guide-projection-reuse-per-match-hud-frame-record"
  },
  {
    "rel": "src/audio/audio.js",
    "before": "const MAX_VOICES = 48;",
    "after": "const RESOLVE_WEAPON_OCCLUSION = Symbol.for(\"inkwave.weapon-audio.resolve-occlusion\");\nconst MAX_VOICES = 48;",
    "label": "shared deferred one-shot occlusion symbol",
    "count": 1,
    "queue": "defer-recorded-impact-occlusion-until-voice-admission"
  },
  {
    "rel": "src/audio/audio.js",
    "before": "    const pitch = Math.max(0.05, o.pitch ?? 1) * (1 + (this.rng() * 2 - 1) * (d.jitter ?? 0.06));",
    "after": "    // Spatial LOS belongs to an admitted audible voice, after mute/minGap/volume/priority gates.\n    o[RESOLVE_WEAPON_OCCLUSION]?.(o);\n    const pitch = Math.max(0.05, o.pitch ?? 1) * (1 + (this.rng() * 2 - 1) * (d.jitter ?? 0.06));",
    "label": "resolve one-shot occlusion only after mixer admission",
    "count": 1,
    "queue": "defer-recorded-impact-occlusion-until-voice-admission"
  },
  {
    "rel": "src/ui/menus.js",
    "before": "// Drive visual/audio queue 20261024",
    "after": "import { createSplatClip, createSweepClip } from './menu-art.js';\n// Drive visual/audio queue 20261024",
    "label": "stage wipes import existing per-seed template and local sweep factory",
    "count": 1,
    "queue": "menu-news-splat-precompute-seeded-core-geometry"
  },
  {
    "rel": "src/ui/menus.js",
    "before": "          const grow = (el, s, k) => { el.style.clipPath = splatClip(ox, oy, R * easeOutCubic(k), s); };\n          tween(D, (k) => grow(ink2, seed + 7, k));\n          tween(D, (k) => grow(ink, seed, k), null, 0.05);\n          tween(D, (k) => grow(L, seed + 3, k), finish, 0.12);",
    "after": "          const clipBack = createSplatClip(seed + 7), clipInk = createSplatClip(seed), clipArt = createSplatClip(seed + 3);\n          const grow = (el, clip, k) => { el.style.clipPath = clip(ox, oy, R * easeOutCubic(k)); };\n          tween(D, (k) => grow(ink2, clipBack, k));\n          tween(D, (k) => grow(ink, clipInk, k), null, 0.05);\n          tween(D, (k) => grow(L, clipArt, k), finish, 0.12);",
    "label": "each stage reveal owns one precomputed seed shape for its lifetime",
    "count": 1,
    "queue": "menu-news-splat-precompute-seeded-core-geometry"
  },
  {
    "rel": "src/ui/menus.js",
    "before": "          tween(D, (k) => { ink.style.clipPath = sweepClip(edge, W, H, easeInOutCubic(k), dir); });\n          tween(D, (k) => { L.style.clipPath = sweepClip(edge, W, H, easeInOutCubic(k), dir); }, finish, 0.11);",
    "after": "          const clipInk = createSweepClip(edge, W, H, dir), clipArt = createSweepClip(edge, W, H, dir);\n          tween(D, (k) => { ink.style.clipPath = clipInk(easeInOutCubic(k)); });\n          tween(D, (k) => { L.style.clipPath = clipArt(easeInOutCubic(k)); }, finish, 0.11);",
    "label": "independent per-tween scratch for overlapping time-of-day sweeps",
    "count": 1,
    "queue": "menu-stage-time-sweep-reuse-point-scratch"
  },
  {
    "rel": "src/ui/menu-art.js",
    "before": "export function sweepClip(edge, W, H, f, dir = 1) {",
    "after": "export function createSweepClip(edge, W, H, dir = 1) {\n  const points = edge.map(() => [0, 0]);\n  return f => sweepClip(edge, W, H, f, dir, points);\n}\nexport function sweepClip(edge, W, H, f, dir = 1, scratch) {",
    "label": "optional caller-owned sweep projection scratch",
    "count": 1,
    "queue": "menu-stage-time-sweep-reuse-point-scratch"
  },
  {
    "rel": "src/ui/menu-art.js",
    "before": "  const pts = edge.map(([x, y]) => [dir > 0 ? base + x * W : W - base - x * W, y * H]);",
    "after": "  const pts = scratch || edge.map(() => [0, 0]);\n  pts.length = edge.length;\n  for (let i = 0; i < edge.length; i++) {\n    const point = pts[i] || (pts[i] = [0, 0]), x = edge[i][0], y = edge[i][1];\n    point[0] = dir > 0 ? base + x * W : W - base - x * W; point[1] = y * H;\n  }",
    "label": "reuse sweep points with exact original arithmetic",
    "count": 1,
    "queue": "menu-stage-time-sweep-reuse-point-scratch"
  },
  {
    "rel": "src/game/minimap.js",
    "before": "import { buildNativeMinimap, buildNativeMinimapAsync }",
    "after": "import {rememberLegacyProjection,reuseLegacyProjectionFlip} from '../../patches/local-quality/legacy-minimap-projection.mjs';\nimport { buildNativeMinimap, buildNativeMinimapAsync }",
    "label": "legacy projection proof import",
    "count": 1,
    "queue": "legacy-minimap-team-flip-reuse-static-projection"
  },
  {
    "rel": "src/game/minimap.js",
    "before": "    this.flip = f;\n    this._build();",
    "after": "    const canonical = this._build === Minimap.prototype._build && this.toCanvas === Minimap.prototype.toCanvas && this._worldX === Minimap.prototype._worldX && this._worldZ === Minimap.prototype._worldZ && this._drawBase === Minimap.prototype._drawBase;\n    if (reuseLegacyProjectionFlip(this, f, canonical)) { this.version = -1; return; }\n    this.flip = f;\n    this._build();",
    "label": "reuse only completed matching canonical legacy projection at viewer flip",
    "count": 1,
    "queue": "legacy-minimap-team-flip-reuse-static-projection"
  },
  {
    "rel": "src/game/minimap.js",
    "before": "    this._built = true;\n  }\n\n  _drawBase() {",
    "after": "    this._built = true;\n    rememberLegacyProjection(this, this._build === Minimap.prototype._build && this.toCanvas === Minimap.prototype.toCanvas && this._worldX === Minimap.prototype._worldX && this._worldZ === Minimap.prototype._worldZ && this._drawBase === Minimap.prototype._drawBase);\n  }\n\n  _drawBase() {",
    "label": "remember exact geometry and bounded dead-mask proof after full legacy build",
    "count": 1,
    "queue": "legacy-minimap-team-flip-reuse-static-projection"
  },
  {
    "rel": "src/game/minimap.js",
    "before": "    this._retired = true; this._cancelBuild?.(); this._cancelBuild = null;",
    "after": "    this._retired = true; this._cancelBuild?.(); this._cancelBuild = null; this._legacyProjectionCache = null;",
    "label": "release legacy projection proof on minimap retirement",
    "count": 1,
    "queue": "legacy-minimap-team-flip-reuse-static-projection"
  }
];

export function adaptQueueUiAudio20261030(rel, code) {
  if (!UI_AUDIO_CHANGES.some(change => change.rel === rel)) return code;
  const marker = "// INKWAVE queue UI/audio 20261030 applied";
  if (code.includes(marker)) throw new Error("UI/audio queue adapter already applied");
  for (const change of UI_AUDIO_CHANGES) {
    if (change.rel !== rel) continue;
    const parts = code.split(change.before);
    if (parts.length - 1 !== change.count) throw new Error(`UI/audio queue anchor ${change.label}: ${parts.length - 1}`);
    code = parts.join(change.after);
  }
  return marker + "\n" + code;
}
