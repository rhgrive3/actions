// Remaining Library visual/UI queue, 2026-10-27. Applied after existing composition.
// Legacy adapter sources remain hash-pinned; direct-owned modules are authored directly.
// Fail closed if a reviewed legacy anchor changes.
const changes = [
  {
    "rel": "src/ui/hud-boss.js",
    "old": "    const f = (v) => `translateX(${((v - 1) * 100).toFixed(3)}%)`;\n",
    "new": "",
    "slug": "boss-hud-deduplicate-identical-hp-bar-transform-formatting",
    "count": 1
  },
  {
    "rel": "src/ui/hud-boss.js",
    "old": "if (force || a !== L.a) { L.a = a; this.fill.style.transform = f(S.shown); this.edge.style.transform = f(S.shown); }",
    "new": "if (force || a !== L.a) { L.a = a; const transform = `translateX(${((S.shown - 1) * 100).toFixed(3)}%)`; this.fill.style.transform = transform; this.edge.style.transform = transform; }",
    "slug": "boss-hud-deduplicate-identical-hp-bar-transform-formatting",
    "count": 1
  },
  {
    "rel": "src/ui/hud-boss.js",
    "old": "this.chip.style.transform = f(S.chip);",
    "new": "this.chip.style.transform = `translateX(${((S.chip - 1) * 100).toFixed(3)}%)`;",
    "slug": "boss-hud-deduplicate-identical-hp-bar-transform-formatting",
    "count": 1
  },
  {
    "rel": "src/ui/hud-boss.js",
    "old": "  _updNums() {\n    const S = this.S, now = this._t(), u = this._u();",
    "new": "  _updNums() {\n    const S = this.S;\n    if (!S.nums.length) return;\n    const now = this._t(), u = this._u();",
    "slug": "boss-hud-skip-empty-damage-number-viewport-metrics",
    "count": 1
  },
  {
    "rel": "src/game/character-geo.js",
    "old": "dirAE(az, e, _hd); headShape(_hd.x, _hd.y, _hd.z, _ha);",
    "new": "if (Object.is(e, el)) _ha.copy(_h0); else { dirAE(az, e, _hd); headShape(_hd.x, _hd.y, _hd.z, _ha); }",
    "slug": "character-headsurf-reuse-unclamped-base-sample",
    "count": 1
  },
  {
    "rel": "src/game/character-face.js",
    "old": "    for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]]) need[b * nAz + (a % nAz)] = 1;",
    "new": "    const a = j * nAz + i, b = j * nAz + (i + 1 === nAz ? 0 : i + 1);\n    need[a] |= 3; need[b] |= 1; need[a + nAz] |= 1; need[b + nAz] |= 1;",
    "slug": "character-face-pack-quad-visibility-and-inline-corner-marks",
    "count": 1
  },
  {
    "rel": "src/game/character-face.js",
    "old": "    if (skipQ(i, j)) continue;",
    "new": "    if (!(need[j * nAz + i] & 2)) continue;",
    "slug": "character-face-pack-quad-visibility-and-inline-corner-marks",
    "count": 1
  },
  {
    "rel": "src/game/character-geo.js",
    "old": "    return r - skin - capOffset(az, el) * sstep(hairline(az) - 0.08, hairline(az), el);",
    "new": "    const cap = capOffset(az, el), line = hairline(az);\n    return r - skin - cap * sstep(line - 0.08, line, el);",
    "slug": "character-hair-occlusion-evaluate-hairline-once-per-vertex",
    "count": 1
  },
  {
    "rel": "src/game/character-geo.js",
    "old": "  const tA = tube.t, cA = tube.cs, sA = tube.sn, hA = tube.thick;",
    "new": "  const tA = tube.t, cA = tube.cs, sA = tube.sn, hA = tube.thick;\n  let lastI = -1, lastT;\n  const mappedAt = (i) => { if (!o.cacheMappedT) return o.tm(tA[i]); if (i !== lastI) { lastT = o.tm(tA[i]); lastI = i; } return lastT; };",
    "slug": "character-hair-lock-tmain-once-per-builder-vertex",
    "count": 1
  },
  {
    "rel": "src/game/character-geo.js",
    "old": "color: (q, i) => _c.setRGB(o.tm(tA[i]),",
    "new": "color: (q, i) => _c.setRGB(mappedAt(i),",
    "slug": "character-hair-lock-tmain-once-per-builder-vertex",
    "count": 1
  },
  {
    "rel": "src/game/character-geo.js",
    "old": "uv: (i) => [o.tm(tA[i]) * o.len,",
    "new": "uv: (i) => [mappedAt(i) * o.len,",
    "slug": "character-hair-lock-tmain-once-per-builder-vertex",
    "count": 1
  },
  {
    "rel": "src/game/character-geo.js",
    "old": "weights: (q, i) => o.weights(o.tm(tA[i])),",
    "new": "weights: (q, i) => o.weights(mappedAt(i)),",
    "slug": "character-hair-lock-tmain-once-per-builder-vertex",
    "count": 1
  },
  {
    "rel": "src/game/character-geo.js",
    "old": "{ tm: (t) => lk.tMain(t), len: LS.len,",
    "new": "{ cacheMappedT: true, tm: (t) => lk.tMain(t), len: LS.len,",
    "slug": "character-hair-lock-tmain-once-per-builder-vertex",
    "count": 1
  },
  {
    "rel": "src/ui/news.js",
    "old": "[...e.touches].find((p) => p.identifier === start.identifier)",
    "new": "findTouchById(e.touches, start.identifier)",
    "slug": "news-touch-tap-tracking-avoid-touchlist-spread",
    "count": 1
  },
  {
    "rel": "src/ui/news.js",
    "old": "[...e.changedTouches].find((p) => p.identifier === start.identifier)",
    "new": "findTouchById(e.changedTouches, start.identifier)",
    "slug": "news-touch-tap-tracking-avoid-touchlist-spread",
    "count": 1
  },
  {
    "rel": "src/ui/news.js",
    "old": "import { h, clamp,",
    "new": "function findTouchById(list, id) { for (let i = 0; i < list.length; i++) { const point = list[i]; if (point.identifier === id) return point; } }\nimport { h, clamp,",
    "slug": "news-touch-tap-tracking-avoid-touchlist-spread",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "el.querySelector('.iw-sq__w')",
    "new": "(el._queueSquadWeapon || (el._queueSquadWeapon = el.querySelector('.iw-sq__w')))",
    "slug": "hud-squad-lazy-cache-stable-child-dom-nodes",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "el.querySelector('.iw-sq__n')",
    "new": "(el._queueSquadNumber || (el._queueSquadNumber = el.querySelector('.iw-sq__n')))",
    "slug": "hud-squad-lazy-cache-stable-child-dom-nodes",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "el.querySelector('.iw-sq__ring circle')",
    "new": "(el._queueSquadRing || (el._queueSquadRing = el.querySelector('.iw-sq__ring circle')))",
    "slug": "hud-squad-lazy-cache-stable-child-dom-nodes",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "el.querySelector('.iw-bcn__icon')",
    "new": "(el._queueBeaconIcon || (el._queueBeaconIcon = el.querySelector('.iw-bcn__icon')))",
    "slug": "hud-superjump-beacon-and-legend-lazy-cache-child-dom-references",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "el.querySelector('.iw-bcn__key')",
    "new": "(el._queueBeaconKey || (el._queueBeaconKey = el.querySelector('.iw-bcn__key')))",
    "slug": "hud-superjump-beacon-and-legend-lazy-cache-child-dom-references",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "row.querySelector('.iw-lg__w')",
    "new": "(row._queueLegendWeapon || (row._queueLegendWeapon = row.querySelector('.iw-lg__w')))",
    "slug": "hud-superjump-beacon-and-legend-lazy-cache-child-dom-references",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "row.querySelector('.iw-lg__name')",
    "new": "(row._queueLegendName || (row._queueLegendName = row.querySelector('.iw-lg__name')))",
    "slug": "hud-superjump-beacon-and-legend-lazy-cache-child-dom-references",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "row.querySelector('.iw-lg__st')",
    "new": "(row._queueLegendState || (row._queueLegendState = row.querySelector('.iw-lg__st')))",
    "slug": "hud-superjump-beacon-and-legend-lazy-cache-child-dom-references",
    "count": 1
  },
  {
    "rel": "src/ui/menus.js",
    "old": "        roll.style.transform = `translate3d(0,${y.toFixed(1)}px,0)`;",
    "new": "        const transform = `translate3d(0,${y.toFixed(1)}px,0)`;\n        if (roll._queueRollTransform !== transform) { roll._queueRollTransform = transform; roll.style.transform = transform; }",
    "slug": "menus-credits-elide-identical-roll-transform-writes",
    "count": 1
  },
  {
    "rel": "src/ui/menus.js",
    "old": "          P.el.classList.toggle('is-you', !!p.you);",
    "new": "          P._queueIsYou = !!p.you;\n          P.el.classList.toggle('is-you', P._queueIsYou);",
    "slug": "lobby-nameplate-cache-player-self-flag-for-sort",
    "count": 1
  },
  {
    "rel": "src/ui/menus.js",
    "old": "P._queueIsYou = P.el.classList.contains('is-you'); vis.push(P);",
    "new": "vis.push(P);",
    "slug": "lobby-nameplate-cache-player-self-flag-for-sort",
    "count": 1
  },
  {
    "rel": "src/ui/menus.js",
    "old": "P.el.style.zIndex = P.el.classList.contains('is-you') ? 300",
    "new": "P.el.style.zIndex = P._queueIsYou ? 300",
    "slug": "lobby-nameplate-cache-player-self-flag-for-sort",
    "count": 1
  },
  {
    "rel": "src/ui/menus.js",
    "old": "    while (this._toasts.childElementCount > max) this._toasts.firstElementChild.remove();\n    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 420); }, ms);",
    "new": "    const timers = this._toastTimers || (this._toastTimers = new Map());\n    const removeToast = (el) => { const pending = timers.get(el); if (pending !== undefined) { clearTimeout(pending); timers.delete(el); } el.remove(); };\n    while (this._toasts.childElementCount > max) removeToast(this._toasts.firstElementChild);\n    timers.set(t, setTimeout(() => {\n      timers.delete(t);\n      if (!t.isConnected) return;\n      t.classList.add('is-out');\n      timers.set(t, setTimeout(() => { timers.delete(t); t.remove(); }, 420));\n    }, ms));",
    "slug": "menus-toast-eviction-cancel-detached-timeouts",
    "count": 1
  },
  {
    "rel": "src/ui/menus.js",
    "old": "  dispose() {\n    this._queueLayoutSample",
    "new": "  dispose() {\n    if (this._toastTimers) { for (const timer of this._toastTimers.values()) clearTimeout(timer); this._toastTimers.clear(); }\n    this._queueLayoutSample",
    "slug": "menus-toast-eviction-cancel-detached-timeouts",
    "count": 1
  },
  {
    "rel": "src/game/showcase.js",
    "old": "const TAU = Math.PI * 2;",
    "new": "const TAN_22 = Math.tan((22 * Math.PI) / 360), TAN_23 = Math.tan((23 * Math.PI) / 360), TAN_25 = Math.tan((25 * Math.PI) / 360);\nconst TAU = Math.PI * 2;",
    "slug": "showcase-overlay-camera-precompute-fixed-half-fov-tangents",
    "count": 1
  },
  {
    "rel": "src/game/showcase.js",
    "old": "const fov = locker ? 23 : 25, tanH = Math.tan((fov * Math.PI) / 360);",
    "new": "const fov = locker ? 23 : 25, tanH = locker ? TAN_23 : TAN_25;",
    "slug": "showcase-overlay-camera-precompute-fixed-half-fov-tangents",
    "count": 1
  },
  {
    "rel": "src/game/showcase.js",
    "old": "const fov = 22, tanH = Math.tan((fov * Math.PI) / 360);",
    "new": "const fov = 22, tanH = TAN_22;",
    "slug": "showcase-overlay-camera-precompute-fixed-half-fov-tangents",
    "count": 1
  },
  {
    "rel": "src/game/showcase.js",
    "old": "    this.slots = SLOTS.slice(0, Math.max(1, n));",
    "new": "    this.slots = SLOTS.slice(0, Math.max(1, n));\n    { const yFeet = this.slots[0].top, yHead = this.slots[0].top + CHAR_H + 0.28;\n    let xL = 0, xR = 0, yTopL = yHead;\n    for (const S of this.slots) {\n      if (S.x - 0.42 < xL) { xL = S.x - 0.42; yTopL = S.top + CHAR_H + 0.28; }\n      xR = Math.max(xR, S.x + S.R + 0.12);\n    }\n      this._resultFrameExtents = { yFeet, yHead, xL, xR, yTopL };\n    }",
    "slug": "showcase-results-cache-static-podium-camera-extrema",
    "count": 1
  },
  {
    "rel": "src/game/showcase.js",
    "old": "    let xL = 0, xR = 0, yTopL = yHead;\n    for (const S of this.slots) {\n      if (S.x - 0.42 < xL) { xL = S.x - 0.42; yTopL = S.top + CHAR_H + 0.28; }\n      xR = Math.max(xR, S.x + S.R + 0.12);\n    }\n    let sx0 = W * 0.5;",
    "new": "    const { xL, xR, yTopL } = this._resultFrameExtents;\n    let sx0 = W * 0.5;",
    "slug": "showcase-results-cache-static-podium-camera-extrema",
    "count": 1
  },
  {
    "rel": "src/game/showcase.js",
    "old": "    const S0 = this.slots[0];\n    const yFeet = S0.top, yHead = S0.top + CHAR_H + 0.28;",
    "new": "    const { yFeet, yHead } = this._resultFrameExtents;",
    "slug": "showcase-results-cache-static-podium-camera-extrema",
    "count": 1
  },
  {
    "rel": "src/game/showcase.js",
    "old": "    if (this.contact.instanceColor) this.contact.instanceColor.needsUpdate = true;",
    "new": "    if (this._contactColorDirty && this.contact.instanceColor) { this.contact.instanceColor.needsUpdate = true; this._contactColorDirty = false; }",
    "slug": "showcase-overlay-contact-shadow-dirty-only-colors",
    "count": 1
  },
  {
    "rel": "src/game/showcase.js",
    "old": "    this.contact.setColorAt(i, this._c.setRGB(alpha, 0, 0));",
    "new": "    const attribute = this.contact.instanceColor;\n    if (this._contactColorAttribute !== attribute) { this._contactColorAttribute = attribute; this._contactAlphas = []; }\n    if (!Object.is(this._contactAlphas[i], alpha)) {\n      this._contactAlphas[i] = alpha;\n      this.contact.setColorAt(i, this._c.setRGB(alpha, 0, 0)); this._contactColorDirty = true;\n    }",
    "slug": "showcase-overlay-contact-shadow-dirty-only-colors",
    "count": 1
  },
  {
    "rel": "src/game/showcase.js",
    "old": "    this.contact.count = 0; this.contact.instanceMatrix.needsUpdate = true;",
    "new": "    this._contactAlphas = []; this._contactColorAttribute = this.contact.instanceColor;\n    this.contact.count = 0; this.contact.instanceMatrix.needsUpdate = true;",
    "slug": "showcase-overlay-contact-shadow-dirty-only-colors",
    "count": 1
  },
  {
    "rel": "src/fx/screenfx.js",
    "old": "    for (const key of IDLE_DECAY_KEYS) {\n      s[key] *= k; if (s[key] < 0.001) s[key] = 0;\n    }",
    "new": "    s.speed *= k; if (s.speed < 0.001) s.speed = 0;\n    s.stretch *= k; if (s.stretch < 0.001) s.stretch = 0;\n    s.blast *= k; if (s.blast < 0.001) s.blast = 0;\n    s.chroma *= k; if (s.chroma < 0.001) s.chroma = 0;\n    s.edgeInk *= k; if (s.edgeInk < 0.001) s.edgeInk = 0;\n    s.aura *= k; if (s.aura < 0.001) s.aura = 0;\n    s.auraPulse *= k; if (s.auraPulse < 0.001) s.auraPulse = 0;\n    s.heart *= k; if (s.heart < 0.001) s.heart = 0;\n    s.hurt *= k; if (s.hurt < 0.001) s.hurt = 0;\n    s.urg *= k; if (s.urg < 0.001) s.urg = 0;\n    s.swim *= k; if (s.swim < 0.001) s.swim = 0;\n    s.focus *= k; if (s.focus < 0.001) s.focus = 0;\n    s.chargePulse *= k; if (s.chargePulse < 0.001) s.chargePulse = 0;\n    s.shimmer *= k; if (s.shimmer < 0.001) s.shimmer = 0;\n    s.kill *= k; if (s.kill < 0.001) s.kill = 0;\n    s.flash *= k; if (s.flash < 0.001) s.flash = 0;\n    s.desat *= k; if (s.desat < 0.001) s.desat = 0;\n    s.satPop *= k; if (s.satPop < 0.001) s.satPop = 0;\n    s.flood *= k; if (s.flood < 0.001) s.flood = 0;",
    "slug": "screenfx-idle-decay-use-direct-static-state-fields",
    "count": 1
  },
  {
    "rel": "src/fx/screenfx.js",
    "old": "const IDLE_DECAY_KEYS = Object.freeze([\"speed\", \"stretch\", \"blast\", \"chroma\", \"edgeInk\", \"aura\", \"auraPulse\", \"heart\", \"hurt\", \"urg\", \"swim\", \"focus\", \"chargePulse\", \"shimmer\", \"kill\", \"flash\", \"desat\", \"satPop\", \"flood\"]);\n",
    "new": "",
    "slug": "screenfx-idle-decay-use-direct-static-state-fields",
    "count": 1
  },
  {
    "rel": "src/main.js",
    "old": "    const inkF = a.ink / PLAYER.inkMax;",
    "new": "    const inkF = a.ink / PLAYER.inkMax, specialReady = a.specialReady();",
    "slug": "hud-reuse-specialready-check-across-prompt-and-frame",
    "count": 1
  },
  {
    "rel": "src/main.js",
    "old": "else if (a.specialReady() && (this._hints.specialT",
    "new": "else if (specialReady && (this._hints.specialT",
    "slug": "hud-reuse-specialready-check-across-prompt-and-frame",
    "count": 1
  },
  {
    "rel": "src/main.js",
    "old": "if (!a.specialReady()) this._hints.specialT = 0;",
    "new": "if (!specialReady) this._hints.specialT = 0;",
    "slug": "hud-reuse-specialready-check-across-prompt-and-frame",
    "count": 1
  },
  {
    "rel": "src/main.js",
    "old": "m.controller?.chargerReachVisible ? m.controller.chargerFullReach : null);",
    "new": "m.controller?.chargerReachVisible ? m.controller.chargerFullReach : null, specialReady);",
    "slug": "hud-reuse-specialready-check-across-prompt-and-frame",
    "count": 1
  },
  {
    "rel": "src/game/motion/retarget.js",
    "old": "if(angle>0.35)this.ccdWorld.identity().slerp(this.ccdLocal.setFromUnitVectors(this.ccdB,this.ccdC),0.35/angle);",
    "new": "if(angle>0.35){this.ccdLocal.copy(this.ccdWorld);this.ccdWorld.identity().slerp(this.ccdLocal,0.35/angle);}",
    "slug": "source-retarget-ccd-reuse-capped-rotation-quaternion",
    "count": 1
  },
  {
    "rel": "src/game/motion/retarget.js",
    "old": "this.groundInvQ=new THREE.Quaternion();",
    "new": "this.groundInvQ=new THREE.Quaternion();this.groundForwardQ=new THREE.Quaternion();",
    "slug": "source-retarget-share-kid-quaternion-forward-across-feet",
    "count": 1
  },
  {
    "rel": "src/game/motion/retarget.js",
    "old": "invRot=(c.kid.matrixWorld.decompose(this.ccdA,this.groundInvQ,this.ccdB),this.groundInvQ.invert());",
    "new": "invRot=(c.kid.matrixWorld.decompose(this.ccdA,this.groundInvQ,this.ccdB),this.groundForwardQ.copy(this.groundInvQ),this.groundInvQ.invert());",
    "slug": "source-retarget-share-kid-quaternion-forward-across-feet",
    "count": 1
  },
  {
    "rel": "src/game/motion/retarget.js",
    "old": "q.copy(this.groundInvQ).invert().multiply(f.orientation);",
    "new": "q.copy(this.groundForwardQ).multiply(f.orientation);",
    "slug": "source-retarget-share-kid-quaternion-forward-across-feet",
    "count": 1
  },
  {
    "rel": "src/game/motion/root-hair.js",
    "old": "this.head=new THREE.Quaternion();",
    "new": "this.head=new THREE.Quaternion();this.headInverse=new THREE.Quaternion();",
    "slug": "root-hair-inertia-cache-head-inverse-per-update",
    "count": 1
  },
  {
    "rel": "src/game/motion/root-hair.js",
    "old": "this.q.copy(this.head).invert();this.axis.set(0,rootTurnRate,0).applyQuaternion(this.q);",
    "new": "this.headInverse.copy(this.head).invert();this.axis.set(0,rootTurnRate,0).applyQuaternion(this.headInverse);",
    "slug": "root-hair-inertia-cache-head-inverse-per-update",
    "count": 1
  },
  {
    "rel": "src/game/motion/root-hair.js",
    "old": ".multiply(this.delta.copy(this.head).invert());",
    "new": ".multiply(this.headInverse);",
    "slug": "root-hair-inertia-cache-head-inverse-per-update",
    "count": 1
  },
  {
    "rel": "src/game/motion/squid-rig.js",
    "old": "  base.computeBoundingBox();",
    "new": "  if (base.boundingBox == null) base.computeBoundingBox();",
    "slug": "source-squid-rig-skip-repeated-shared-bounding-box-scan",
    "count": 1
  },
  {
    "rel": "src/game/character.js",
    "old": "      const gp = this._tierParts(T_GAME), byKey = {};\n      for (const p of gp) byKey[p.key] = p.geo;",
    "new": "      const built = this.lodSets[T_GAME], byKey = {};\n      if (built) { for (const key in built.meshes) byKey[key] = built.meshes[key].geometry; }\n      else for (const p of this._tierParts(T_GAME)) byKey[p.key] = p.geo;",
    "slug": "character-far-lod-reuse-built-game-tier-geometry-index",
    "count": 1
  },
  {
    "rel": "src/game/character.js",
    "old": "    // optional bones (docs/RIG.md) — animated when present",
    "new": "    this.hairCollision = new Float64Array(HAIR_MAX * 4);\n    for (let s = 0; s < this.hairMeta.length; s++) {\n      const d = this.hairMeta[s].dir, ix = this.hairIn[s * 3], iy = this.hairIn[s * 3 + 1], iz = this.hairIn[s * 3 + 2];\n      const wx = d.y * iz - d.z * iy, wy = d.z * ix - d.x * iz, wz = d.x * iy - d.y * ix, j = s * 4;\n      this.hairCollision[j] = wx; this.hairCollision[j + 1] = wy; this.hairCollision[j + 2] = wz; this.hairCollision[j + 3] = wx * wx + wy * wy + wz * wz;\n    }\n    // optional bones (docs/RIG.md) — animated when present",
    "slug": "character-native-hair-precompute-inward-collision-projection-axis",
    "count": 1
  },
  {
    "rel": "src/game/character.js",
    "old": "      const ix = hin[si * 3], iy = hin[si * 3 + 1], iz = hin[si * 3 + 2];\n      const wx = uy * iz - uz * iy, wy = uz * ix - ux * iz, wz = ux * iy - uy * ix;\n      const ww = wx * wx + wy * wy + wz * wz;",
    "new": "      const collision = this.hairCollision, ci = si * 4;\n      const wx = collision[ci], wy = collision[ci + 1], wz = collision[ci + 2], ww = collision[ci + 3];",
    "slug": "character-native-hair-precompute-inward-collision-projection-axis",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "const lm=s.localMove||{};this.treadmill=!c.inWorld&&dist<1e-10&&Number(s.speed)>0&&Math.hypot(lm.x||0,lm.z||0)>0;",
    "new": "const lm=s.localMove||{};let treadmillLength;this.treadmill=!c.inWorld&&dist<1e-10&&Number(s.speed)>0&&(treadmillLength=Math.hypot(lm.x||0,lm.z||0))>0;",
    "slug": "source-motion-share-treadmill-length-and-cache-pivot-radius",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "const n=this.treadmill?Math.hypot(lm.x||0,lm.z||0):dist;",
    "new": "const n=this.treadmill?treadmillLength:dist;",
    "slug": "source-motion-share-treadmill-length-and-cache-pivot-radius",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "  this.gaitSpeed=this.pivoting?Math.max(this.speed,Math.abs(this.turnRate)*Math.hypot(c.rest.footL.x,c.rest.footL.z+0.11)):this.speed;",
    "new": "  if(this.pivoting&&(!Object.is(this._pivotRestX,c.rest.footL.x)||!Object.is(this._pivotRestZ,c.rest.footL.z))){this._pivotRestX=c.rest.footL.x;this._pivotRestZ=c.rest.footL.z;this._pivotRadius=Math.hypot(c.rest.footL.x,c.rest.footL.z+0.11);}\n  this.gaitSpeed=this.pivoting?Math.max(this.speed,Math.abs(this.turnRate)*this._pivotRadius):this.speed;",
    "slug": "source-motion-share-treadmill-length-and-cache-pivot-radius",
    "count": 1
  },
  {
    "rel": "src/game/motion/locomotion-profile.js",
    "old": "export function sampleContact(profile,side,phase){",
    "new": "export function sampleContactPair(profile,phase,out){\n const n=profile.samples,x=mod(phase,1)*n,i=Math.floor(x),u=smooth5(x-i),j=i%n,k=(i+1)%n;\n for(let side=0;side<2;side++){const foot=profile.feet[side];out[side]=Number(foot.contact[j])*(1-u)+Number(foot.contact[k])*u;}\n return out;\n}\nexport function sampleContact(profile,side,phase){",
    "slug": "source-contact-sample-pair-share-periodic-phase-basis",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "locomotionProfile,sampleContact,feasibleContact,smooth5",
    "new": "locomotionProfile,sampleContact,sampleContactPair,feasibleContact,smooth5",
    "slug": "source-contact-sample-pair-share-periodic-phase-basis",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "    for(let i=0;i<2;i++){\n     this.contact[i]+=sampleContact(p,i,normalizedFrame)",
    "new": "    const contactSamples=sampleContactPair(p,normalizedFrame,this._contactSamples||(this._contactSamples=new Float64Array(2)));\n    for(let i=0;i<2;i++){\n     this.contact[i]+=contactSamples[i]",
    "slug": "source-contact-sample-pair-share-periodic-phase-basis",
    "count": 1
  },
  {
    "rel": "src/game/motion/locomotion-profile.js",
    "old": " const foot=profile.feet[side],worldCycle=Math.max(0,speed)/Math.max(1e-6,cadenceHz);\n const duty=Math.min(foot.duty,legReach*0.62/Math.max(1e-6,worldCycle));",
    "new": " const worldCycle=Math.max(0,speed)/Math.max(1e-6,cadenceHz);\n return feasibleContactPrepared(profile,side,phase,legReach*0.62/Math.max(1e-6,worldCycle));\n}\nexport function feasibleContactPrepared(profile,side,phase,reachDuty){\n const foot=profile.feet[side],duty=Math.min(foot.duty,reachDuty);",
    "slug": "source-gait-feasible-contact-share-reach-duty",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "sampleContactPair,feasibleContact,smooth5",
    "new": "sampleContactPair,feasibleContact,feasibleContactPrepared,smooth5",
    "slug": "source-gait-feasible-contact-share-reach-duty",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "   contactArg.speed=this.speed;contactArg.cadenceHz=cadenceHz;contactArg.legReach=this.character.limbs.legL.a+this.character.limbs.legL.b;",
    "new": "   contactArg.speed=this.speed;contactArg.cadenceHz=cadenceHz;contactArg.legReach=this.character.limbs.legL.a+this.character.limbs.legL.b;\n   const worldCycle=Math.max(0,contactArg.speed)/Math.max(1e-6,contactArg.cadenceHz),reachDuty=contactArg.legReach*0.62/Math.max(1e-6,worldCycle);",
    "slug": "source-gait-feasible-contact-share-reach-duty",
    "count": 1
  },
  {
    "rel": "src/game/motion/source-controller.js",
    "old": "feasibleContact(p,i,normalizedFrame,contactArg)",
    "new": "feasibleContactPrepared(p,i,normalizedFrame,reachDuty)",
    "slug": "source-gait-feasible-contact-share-reach-duty",
    "count": 1
  },
  {
    "rel": "src/game/character-hair.js",
    "old": "    for (let i = 0; i < Pp.count; i += 7) { S.frame(tt[i], sp, _b, _c, _d); tmp.fromBufferAttribute(Pp, i).sub(sp); nn.fromBufferAttribute(N, i); acc += nn.dot(tmp); }",
    "new": "    let previousT;\n    for (let i = 0; i < Pp.count; i += 7) { const t = tt[i]; if (i === 0 || !Number.isFinite(t) || !Object.is(t, previousT)) { S.frame(t, sp, _b, _c, _d); previousT = t; } tmp.fromBufferAttribute(Pp, i).sub(sp); nn.fromBufferAttribute(N, i); acc += nn.dot(tmp); }",
    "slug": "hair-suction-cup-winding-reuse-contiguous-spine-frame",
    "count": 1
  },
  {
    "rel": "src/game/minimap.js",
    "old": "    if (!ca || !cb) return [[255, 138, 20], [47, 91, 255]];\n    return [[lin2s(ca.r), lin2s(ca.g), lin2s(ca.b)], [lin2s(cb.r), lin2s(cb.g), lin2s(cb.b)]];",
    "new": "    if (!ca || !cb) return this._teamFallback || (this._teamFallback = [[255, 138, 20], [47, 91, 255]]);\n    const ar = ca.r, ag = ca.g, ab = ca.b, br = cb.r, bg = cb.g, bb = cb.b, saved = this._teamRGBCache;\n    if (saved && Object.is(saved.ar, ar) && Object.is(saved.ag, ag) && Object.is(saved.ab, ab) && Object.is(saved.br, br) && Object.is(saved.bg, bg) && Object.is(saved.bb, bb)) return saved.rgb;\n    const rgb = [[lin2s(ar), lin2s(ag), lin2s(ab)], [lin2s(br), lin2s(bg), lin2s(bb)]];\n    this._teamRGBCache = { ar, ag, ab, br, bg, bb, rgb }; return rgb;",
    "slug": "minimap-cache-team-linear-to-srgb-conversion-by-color-components",
    "count": 1
  },
  {
    "rel": "src/fx/screenfx.js",
    "old": "    const q = effectiveQuality(G.settings, G.mobile);",
    "new": "    const quality = G.settings?.quality, touch = !!G.mobile?.touch, ios = !!G.mobile?.ios;\n    if (!this._screenQuality || !Object.is(this._screenQualityKey, quality) || this._screenTouch !== touch || this._screenIOS !== ios || (quality !== null && (typeof quality === 'object' || typeof quality === 'function'))) {\n      this._screenQuality = effectiveQuality(G.settings, G.mobile); this._screenQualityKey = quality; this._screenTouch = touch; this._screenIOS = ios;\n    }\n    const q = this._screenQuality;",
    "slug": "screenfx-skip-unchanged-quality-and-lens-resize-bookkeeping",
    "count": 1
  },
  {
    "rel": "src/fx/screenfx.js",
    "old": "    this.lens.resize(W, H, q.particles >= 1 ? 1 / 3 : 1 / 4);",
    "new": "    const lens = this.lens, lensScale = q.particles >= 1 ? 1 / 3 : 1 / 4;\n    if (this._lensOwner !== lens || this._lensW !== W || this._lensH !== H || this._lensScale !== lensScale || lens._wantW !== this._lensWantW || lens._wantH !== this._lensWantH || ((!lens._parked || lens.parts.length) && (lens._parked || lens.rt.width !== lens._wantW || lens.rt.height !== lens._wantH))) {\n      lens.resize(W, H, lensScale); this._lensOwner = lens; this._lensW = W; this._lensH = H; this._lensScale = lensScale; this._lensWantW = lens._wantW; this._lensWantH = lens._wantH;\n    }",
    "slug": "screenfx-skip-unchanged-quality-and-lens-resize-bookkeeping",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "    for (let i = 0; i < tg.length; i++) { const b = tg[i], p = P[i]; p.on = !!b; if (b) { p.x = p.ox = b.x * bw; p.y = p.oy = b.y * bh; } }\n    for (let it = 0; it < 6; it++) {",
    "new": "    const layout = this._beaconLayout || (this._beaconLayout = { count: -1, minD: NaN, input: [] });\n    let layoutChanged = layout.count !== tg.length || !Object.is(layout.minD, minD) || !Number.isFinite(minD);\n    for (let i = 0; i < tg.length; i++) {\n      const b = tg[i], on = !!b, x = b ? b.x * bw : 0, y = b ? b.y * bh : 0, j = i * 3;\n      if (layout.input[j] !== on || !Object.is(layout.input[j + 1], x) || !Object.is(layout.input[j + 2], y) || !Number.isFinite(x) || !Number.isFinite(y)) layoutChanged = true;\n      layout.input[j] = on; layout.input[j + 1] = x; layout.input[j + 2] = y;\n    }\n    layout.count = tg.length; layout.minD = minD;\n    if (layoutChanged) {\n    for (let i = 0; i < tg.length; i++) { const p = P[i], j = i * 3; p.on = layout.input[j]; if (p.on) { p.x = p.ox = layout.input[j + 1]; p.y = p.oy = layout.input[j + 2]; } }\n    for (let it = 0; it < 6; it++) {",
    "slug": "hud-beacons-cache-static-overlap-relaxation",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "      if (!moved) break;\n    }\n    for (let i = 0; i < tg.length; i++) {",
    "new": "      if (!moved) break;\n    }\n    }\n    for (let i = 0; i < tg.length; i++) {",
    "slug": "hud-beacons-cache-static-overlap-relaxation",
    "count": 1
  },
  {
    "rel": "src/game/motion/squid-rig.js",
    "old": " resetDeformation(){\n  for(let i=",
    "new": " resetDeformation(){\n  if(!this._restReset){\n  for(let i=",
    "slug": "source-motion-reset-squid-rig-only-on-fallback-transition",
    "count": 1
  },
  {
    "rel": "src/game/motion/squid-rig.js",
    "old": "  this.refreshGeometry();this.root.updateWorldMatrix(true,true);this.skeleton.update();",
    "new": "  this._restReset=true;\n  }\n  this.refreshGeometry();this.root.updateWorldMatrix(true,true);this.skeleton.update();",
    "slug": "source-motion-reset-squid-rig-only-on-fallback-transition",
    "count": 1
  },
  {
    "rel": "src/game/motion/squid-rig.js",
    "old": "  const c=this.character,sq=c.squid;\n  for(let i=",
    "new": "  this._restReset=false;\n  const c=this.character,sq=c.squid;\n  for(let i=",
    "slug": "source-motion-reset-squid-rig-only-on-fallback-transition",
    "count": 1
  },
  {
    "rel": "src/fx/fxHooks.js",
    "old": "    let budget = 48;\n    const fireFallback",
    "new": "    let budget = 48;\n    // Preserve ordinary event order; only oversubscribed trail candidates rotate.\n    let trailSelected = null;\n    if (list.length > budget) {\n      const candidates = this._trailCandidates || (this._trailCandidates = []); candidates.length = 0;\n      for (let i = 0; i < list.length; i++) {\n        const p = list[i]; if (!p.owner || !(p.age > 0.03) || !(p.delay === undefined || p.age > p.delay)) continue;\n        const slosh = p.type === 'slosh' || bucketSheetProjectile(p);\n        const step = p.type === 'blast' ? 0.55 : p.type === 'drop' ? 1.1 : slosh ? (bucketSheetHead(p) ? 0.45 : 1.0) : 0.8;\n        const distance = (p._fxAge === undefined || p.age < p._fxAge ? 0 : p._fxD) + Math.hypot(p.vel.x, p.vel.y, p.vel.z) * dt;\n        if (distance >= step && this._near(p.pos, 30)) candidates.push(i);\n      }\n      if (candidates.length > budget) {\n        trailSelected = this._trailSelected || (this._trailSelected = new Set()); trailSelected.clear();\n        const cursor = this._trailCursor || 0;\n        let start = candidates.findIndex(i => i >= cursor); if (start < 0) start = 0;\n        for (let k = 0; k < budget; k++) trailSelected.add(candidates[(start + k) % candidates.length]);\n        this._trailCursor = (candidates[(start + budget - 1) % candidates.length] + 1) % list.length;\n      } else this._trailCursor = 0;\n    } else this._trailCursor = 0;\n    const fireFallback",
    "slug": "fxhooks-projectile-trail-48-budget-roster-starvation",
    "count": 1
  },
  {
    "rel": "src/fx/fxHooks.js",
    "old": "if (budget > 0 && p.age > 0.03 &&",
    "new": "if (budget > 0 && (!trailSelected || trailSelected.has(i)) && p.age > 0.03 &&",
    "slug": "fxhooks-projectile-trail-48-budget-roster-starvation",
    "count": 1
  },
  {
    "rel": "src/fx/fx.js",
    "old": "    if(this.dN===0){this.dGeo.instanceCount=0;return;}\n    for (let i = 0; i < this.dN; i++) {",
    "new": "    if(this.dN===0){this.dGeo.instanceCount=0;return;}\n    this._dropCheckMask = null;\n    const remainingChecks = Math.max(0, Math.ceil(this.maxChecks - this._checks));\n    if (col && this.dN > remainingChecks && remainingChecks > 0) {\n      const candidates = this._dropCheckCandidates || (this._dropCheckCandidates = []); candidates.length = 0;\n      for (let i = 0; i < this.dN; i++) {\n        const i3 = i * 3, i8 = i * 8, age = A[i8 + 1] + dt, flags = A[i8 + 7];\n        if (age >= A[i8 + 2] || (flags & F_NOCOL)) continue;\n        const oy = P[i3 + 1], ny = oy + (Vv[i3 + 1] * drag - g * A[i8 + 3] * dt) * dt;\n        if (!shouldDeferCosmeticDrop(flags, A[i8], A[i8 + 2] - age, oy, ny, wy, dt, this.dN, i, _dropPhase)) candidates.push(i);\n      }\n      if (candidates.length > remainingChecks) {\n        const mask = this._dropCheckStorage?.length >= this.dN ? this._dropCheckStorage : (this._dropCheckStorage = new Uint8Array(this.dCap)); mask.fill(0); this._dropCheckMask = mask;\n        const cursor = this._dropCheckCursor || 0;\n        let start = candidates.findIndex(i => i >= cursor); if (start < 0) start = 0;\n        for (let k = 0; k < remainingChecks; k++) mask[candidates[(start + k) % candidates.length]] = 1;\n        this._dropCheckCursor = (candidates[(start + remainingChecks - 1) % candidates.length] + 1) % this.dN;\n      } else this._dropCheckCursor = 0;\n    } else this._dropCheckCursor = 0;\n    for (let i = 0; i < this.dN; i++) {",
    "slug": "fx-droplet-collision-check-budget-index-starvation",
    "count": 1
  },
  {
    "rel": "src/fx/fx.js",
    "old": "if (!(flags & F_NOCOL) && !_defer && col && this._checks < this.maxChecks)",
    "new": "if (!(flags & F_NOCOL) && !_defer && col && (!this._dropCheckMask || this._dropCheckMask[i]) && this._checks < this.maxChecks)",
    "slug": "fx-droplet-collision-check-budget-index-starvation",
    "count": 1
  },
  {
    "rel": "src/fx/fx.js",
    "old": "  _killDrop(i) {\n    const last = --this.dN;",
    "new": "  _killDrop(i) {\n    const last = --this.dN;\n    if (this._dropCheckMask) this._dropCheckMask[i] = this._dropCheckMask[last];",
    "slug": "fx-droplet-collision-check-budget-index-starvation",
    "count": 1
  },
  {
    "rel": "src/ui/hud.js",
    "old": "    this._updHp(f.hp);\n    this._updMap(f.map, dt);\n    this._updMarkers(f.markers);",
    "new": "    const hiddenIntro = !this._visible && G.match?.state === 'intro';\n    if (!hiddenIntro) this._updHp(f.hp);\n    this._updMap(f.map, dt);\n    if (!hiddenIntro) this._updMarkers(f.markers);",
    "slug": "hud-intro-hidden-avoid-full-per-frame-dom-update",
    "count": 1
  }
];
export function adaptRemainingVisualQueue20261027(rel, code) {
  for (const change of changes) {
    if (change.rel !== rel) continue;
    const count = code.split(change.old).length - 1;
    if (count !== change.count) {
      // A previous, separately reviewed retarget optimization may already
      // supply the exact desired forward quaternion. Accept that exact
      // equivalent once; missing/duplicated or unrelated anchors remain red.
      const exactShared = change.slug === 'source-retarget-share-kid-quaternion-forward-across-feet'
        && count === 0 && change.new.length > 0 && code.split(change.new).length - 1 === 1;
      if (exactShared) continue;
      throw new Error(`Remaining visual queue ${change.slug}: expected ${change.count} anchors in ${rel}, found ${count} (anchor ${JSON.stringify(change.old.slice(0,110))})`);
    }
    code = code.split(change.old).join(change.new);
  }
  return code;
}
