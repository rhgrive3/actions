// Build-time queue fixes. Source snapshots remain unchanged; all anchors fail closed.
const CHANGES = [
  [
    "src/core/shadowcache.js",
    "    const sig = `${sun.position.x},${sun.position.y},${sun.position.z}|${sh.mapSize.x}|${sh.camera.left},${sh.camera.right},${sh.camera.top},${sh.camera.bottom},${sh.camera.near},${sh.camera.far}`;\n    if (sig !== this.sig) { this.sig = sig; this.dirty = true; }\n",
    "    const p = sun.position, c = sh.camera;\n    const prior = this._sunState || (this._sunState = {});\n    if (prior.x !== p.x || prior.y !== p.y || prior.z !== p.z || prior.size !== sh.mapSize.x ||\n        prior.left !== c.left || prior.right !== c.right || prior.top !== c.top || prior.bottom !== c.bottom || prior.near !== c.near || prior.far !== c.far) {\n      const sig = `${p.x},${p.y},${p.z}|${sh.mapSize.x}|${c.left},${c.right},${c.top},${c.bottom},${c.near},${c.far}`;\n      if (sig !== this.sig) { this.sig = sig; this.dirty = true; }\n      Object.assign(prior, { x: p.x, y: p.y, z: p.z, size: sh.mapSize.x, left: c.left, right: c.right, top: c.top, bottom: c.bottom, near: c.near, far: c.far });\n    }\n"
  ],
  [
    "src/fx/screenfx.js",
    "      speedT = 0.55 + 0.45 * Math.abs(Math.cos(kk * Math.PI));   // fast launch, float at the apex, dive\n      stretchT = 0.06 * (0.4 + 0.6 * Math.abs(Math.cos(kk * Math.PI)));\n",
    "      const apexCos = Math.abs(Math.cos(kk * Math.PI));\n      speedT = 0.55 + 0.45 * apexCos;   // fast launch, float at the apex, dive\n      stretchT = 0.06 * (0.4 + 0.6 * apexCos);\n"
  ],
  [
    "src/fx/swimWake.js",
    "      let s = this.slots.find((o) => o.actor === a);\n      if (!s) s = this.slots.find((o) => !o.actor);\n",
    "      let s = null, free = null;\n      for (const slot of this.slots) {\n        if (slot.actor === a) { s = slot; break; }\n        if (!free && !slot.actor) free = slot;\n      }\n      if (!s) s = free;\n"
  ],
  [
    "src/game/showcase.js",
    "    const key = `${W}x${H}:${Math.round(U.l)}:${Math.round(U.r)}:${Math.round(U.t)}:${Math.round(U.b)}`;\n",
    "    const ul = Math.round(U.l), ur = Math.round(U.r), ut = Math.round(U.t), ub = Math.round(U.b);\n"
  ],
  [
    "src/game/showcase.js",
    "    if (!f || f.key !== key) {\n",
    "    if (!f || f.W !== W || f.H !== H || f.ul !== ul || f.ur !== ur || f.ut !== ut || f.ub !== ub) {\n"
  ],
  [
    "src/game/showcase.js",
    "      f = L.fits[kind] = { key, fov, sx: W * 0.5 + (cx - bcx), sy: H * 0.5 + (cy - bcy) };\n",
    "      f = L.fits[kind] = { W, H, ul, ur, ut, ub, fov, sx: W * 0.5 + (cx - bcx), sy: H * 0.5 + (cy - bcy) };\n"
  ],
  [
    "src/ui/hud.js",
    "  _resizeCanvas() {\n",
    "  _resizeCanvas(force = false) {\n    this._smearSizeDirty = true;\n    if (!force && (this.fx || !this._smears.length)) return;\n    this._smearSizeDirty = false;\n"
  ],
  [
    "src/ui/hud.js",
    "  _spawnSmear(amount, hex, angle = null) {\n",
    "  _spawnSmear(amount, hex, angle = null) {\n    if (this._smearSizeDirty) this._resizeCanvas(true);\n"
  ],
  [
    "src/ui/menus.js",
    "    cancelAnimationFrame(this._raf);\n",
    "    cancelAnimationFrame(this._raf);\n    this._news?.dispose();\n"
  ],
  [
    "src/ui/menus.js",
    "    this._portraitInto(avatar, { kind: 'head', size: 160 });\n    this._preloadStages();\n",
    "    this._portraitInto(avatar, { kind: 'head', size: 160 });\n"
  ],
  [
    "src/ui/menus.js",
    "      const na = ps.filter((p) => teamOf(p) === 0).length, nb = ps.length - na;\n",
    "      const teamA = ps.filter((p) => teamOf(p) === 0), teamB = ps.filter((p) => teamOf(p) === 1);\n      const na = teamA.length, nb = ps.length - na;\n"
  ],
  [
    "src/ui/menus.js",
    "          const pl = ps.filter((p) => teamOf(p) === t)[k];\n",
    "          const pl = (t === 0 ? teamA : teamB)[k];\n"
  ],
  [
    "src/audio/audio.js",
    "    this.master.gain.setTargetAtTime(taper(this.vol.master), t, 0.04);\n    this.musicBus.gain.setTargetAtTime(taper(this.vol.music), t, 0.04);\n    this.sfxBus.gain.setTargetAtTime(taper(this.vol.sfx), t, 0.04);",
    "    // Cache by actual AudioParam identity; new contexts/buses always get their first schedule.\n    const targets = this._volumeTargets || (this._volumeTargets = new WeakMap());\n    const schedule = (param, value) => { if (!targets.has(param) || targets.get(param) !== value) { param.setTargetAtTime(value, t, 0.04); targets.set(param, value); } };\n    schedule(this.master.gain, taper(this.vol.master));\n    schedule(this.musicBus.gain, taper(this.vol.music));\n    schedule(this.sfxBus.gain, taper(this.vol.sfx));"
  ],
  [
    "src/main.js",
    "    const m = this.match, a = m && !m.attract && !m.paused ? m.local : null;",
    "    const m = this.match, a = m && !m.attract && !m.paused ? m.local : null;\n    if (!(a && a.alive) && !this._loops?.swim && !this._loops?.climb && !this._loops?.enemy_ink_sizzle) return;"
  ],
  [
    "src/ui/news.js",
    "    if (how === 'try') { finish(); this._tryBoss(); return; }",
    "    if (how === 'try') { cancelAnimationFrame(this._raf); this._raf = 0; this._tweens.length = 0; finish(); this._tryBoss(); return; }"
  ],
  [
    "src/fx/screenfx.js",
    "const TAU = Math.PI * 2;",
    "const TAU = Math.PI * 2;\nconst IDLE_DECAY_KEYS = Object.freeze([\"speed\", \"stretch\", \"blast\", \"chroma\", \"edgeInk\", \"aura\", \"auraPulse\", \"heart\", \"hurt\", \"urg\", \"swim\", \"focus\", \"chargePulse\", \"shimmer\", \"kill\", \"flash\", \"desat\", \"satPop\", \"flood\"]);"
  ],
  [
    "src/fx/screenfx.js",
    "for (const key of ['speed', 'stretch', 'blast', 'chroma', 'edgeInk', 'aura', 'auraPulse', 'heart', 'hurt', 'urg', 'swim', 'focus', 'chargePulse', 'shimmer', 'kill', 'flash', 'desat', 'satPop', 'flood'])",
    "for (const key of IDLE_DECAY_KEYS)"
  ],
  [
    "src/game/showcase.js",
    "      const a = (i / n) * TAU + rnd() * 0.45;",
    "      const a = (i / n) * TAU + rnd() * 0.45, sa = Math.sin(a), ca = Math.cos(a);"
  ],
  [
    "src/game/showcase.js",
    "x + Math.sin(a) * rr, y + 0.01, z + Math.cos(a) * rr, Math.sin(a) * out, up, Math.cos(a) * out",
    "x + sa * rr, y + 0.01, z + ca * rr, sa * out, up, ca * out"
  ],
  [
    "src/game/showcase.js",
    "        const a = (q / n) * TAU + rnd() * 0.6, sp = 0.9 + rnd() * 1.3;",
    "        const a = (q / n) * TAU + rnd() * 0.6, sp = 0.9 + rnd() * 1.3, sa = Math.sin(a), ca = Math.cos(a);"
  ],
  [
    "src/game/showcase.js",
    "x + Math.sin(a) * r, y + 0.02, z + Math.cos(a) * r, Math.sin(a) * sp, 1.3 + rnd() * 1.8, Math.cos(a) * sp",
    "x + sa * r, y + 0.02, z + ca * r, sa * sp, 1.3 + rnd() * 1.8, ca * sp"
  ],
  [
    "src/fx/swimWake.js",
    "const BREAK = -9;",
    "const BREAK = -9;\nconst compareWakeDistance = (x, y) => x._wakeD2 - y._wakeD2;"
  ],
  [
    "src/fx/swimWake.js",
    "      cand.sort((x, y) => x._wakeD2 - y._wakeD2);",
    "      if (cand.length > 1) cand.sort(compareWakeDistance);"
  ],
  [
    "src/fx/fx.js",
    "      const hx = Math.cos(a) * (0.6 + rand() * 1.8), hz = Math.sin(a) * (0.6 + rand() * 1.8);\n      this._spawnDrop(pos.x + Math.cos(a) * r, pos.y + 0.1, pos.z + Math.sin(a) * r, hx, sp, hz,",
    "      const ca = Math.cos(a), sa = Math.sin(a);\n      const hx = ca * (0.6 + rand() * 1.8), hz = sa * (0.6 + rand() * 1.8);\n      this._spawnDrop(pos.x + ca * r, pos.y + 0.1, pos.z + sa * r, hx, sp, hz,"
  ],
  [
    "src/fx/fx.js",
    "      this._sprite(this.puffs, pos.x + Math.cos(a) * 0.8, pos.y + 0.3, pos.z + Math.sin(a) * 0.8, Math.cos(a) * 2.5, 0.8, Math.sin(a) * 2.5,",
    "      const ca = Math.cos(a), sa = Math.sin(a);\n      this._sprite(this.puffs, pos.x + ca * 0.8, pos.y + 0.3, pos.z + sa * 0.8, ca * 2.5, 0.8, sa * 2.5,"
  ],
  [
    "src/game/weapons.js",
    "      c.group.children.forEach((m) => { m.position.y += Math.sin(G.time * 1.6 + m.userData.bob) * 0.0025; });",
    "      for (const m of c.group.children) {\n        // Closed form of the old 60 Hz sine sum, anchored to creation phase.\n        // Local elapsed time freezes with this cloud, including pause/resume.\n        const bob = m.userData._stormBob || (m.userData._stormBob = { y: m.position.y, phase: (c.bobPhase ?? (G.time - dt) * 1.6) + m.userData.bob, age: 0 });\n        bob.age += dt;\n        m.position.y = bob.y + .0025 * (Math.cos(bob.phase + 1.6 / 120) - Math.cos(bob.phase + bob.age * 1.6 + 1.6 / 120)) / (2 * Math.sin(1.6 / 120));\n      }"
  ],
  [
    "src/audio/bossAudio.js",
    "  const pos = (name, e) => {",
    "  const pos = (name, e, out = null) => {"
  ],
  [
    "src/audio/bossAudio.js",
    "      try { const v = m.getSocket(name, new b.pos.constructor()); if (Number.isFinite(v.x) && (v.x || v.y || v.z)) return { x: v.x, y: v.y, z: v.z }; } catch (err) { /* model not ready */ }",
    "      try {\n        let socket;\n        if (out) { if (out._socketCtor !== b.pos.constructor) { out._socketCtor = b.pos.constructor; out._socketVector = new b.pos.constructor(); } socket = out._socketVector; }\n        else socket = new b.pos.constructor();\n        const v = m.getSocket(name, socket);\n        if (Number.isFinite(v.x) && (v.x || v.y || v.z)) { if (out) { out.x=v.x; out.y=v.y; out.z=v.z; return out; } return { x: v.x, y: v.y, z: v.z }; }\n      } catch (err) { /* model not ready */ }"
  ],
  [
    "src/audio/bossAudio.js",
    "    return { x: b.pos.x, y: b.pos.y + 3, z: b.pos.z };",
    "    if (out) { out.x=b.pos.x; out.y=b.pos.y+3; out.z=b.pos.z; return out; }\n    return { x: b.pos.x, y: b.pos.y + 3, z: b.pos.z };"
  ],
  [
    "src/audio/bossAudio.js",
    "      for (const h of st.loops.values()) { const p = pos(h._sock); if (p) try { h.set({ pos: p }); } catch (e) { /* */ } }",
    "      for (const h of st.loops.values()) { const out = h._followPos || (h._followPos = { x: 0, y: 0, z: 0 }); const p = pos(h._sock, null, out); if (p) try { h.set(h._followUpdate || (h._followUpdate = { pos: p })); } catch (e) { /* */ } }"
  ],
  [
    "src/fx/fxHooks.js",
    "    const sa = a.specialActive;",
    "    const sa = a.specialActive;\n    const trailPhase = sa?.id === 'slam' && (sa.phase === 'fall' || sa.phase === 'rise') ? 'slam:' + sa.phase : a.superJumpState?.phase === 'flight' ? 'jump' : null;\n    if (s._trailVfxPhase !== trailPhase) { s._trailVfxPhase = trailPhase; s._trailVfxCarry = 0; }\n    let trailTicks = 0;\n    if (trailPhase && Number.isFinite(dt) && dt > 0) { const frames = (s._trailVfxCarry || 0) + Math.min(2, dt * 60); trailTicks = Math.min(2, Math.floor(frames + 1e-9)); s._trailVfxCarry = Math.max(0, frames - trailTicks); }"
  ],
  [
    "src/fx/fxHooks.js",
    "      else if (sa.phase === 'fall') this.fx.slamFall?.(pos, a.color);",
    "      else if (sa.phase === 'fall') for (let tick = 0; tick < trailTicks; tick++) this.fx.slamFall?.(pos, a.color);"
  ],
  [
    "src/fx/fxHooks.js",
    "      else if (sa.phase === 'rise') this.fx.superJumpTrail?.(_v.copy(pos).setY(pos.y + 0.5), a.vel, a.color);",
    "      else if (sa.phase === 'rise') for (let tick = 0; tick < trailTicks; tick++) this.fx.superJumpTrail?.(_v.copy(pos).setY(pos.y + 0.5), a.vel, a.color);"
  ],
  [
    "src/fx/fxHooks.js",
    "        fx.superJumpTrail?.(pos, a.vel, a.color);",
    "        for (let tick = 0; tick < trailTicks; tick++) fx.superJumpTrail?.(pos, a.vel, a.color);"
  ],
  ["src/game/weapons.js", "rainT: 0, loop, groundY });", "rainT: 0, loop, groundY, bobPhase: G.time * 1.6 });"],
  ["src/main.js", "        const k = Math.min((W / 2 - 40) / Math.max(1e-3, Math.abs(Math.cos(angle))), (H / 2 - 40) / Math.max(1e-3, Math.abs(Math.sin(angle))));\n        x = W / 2 + Math.cos(angle) * k; y = H / 2 + Math.sin(angle) * k;", "        const cosAngle = Math.cos(angle), sinAngle = Math.sin(angle);\n        const k = Math.min((W / 2 - 40) / Math.max(1e-3, Math.abs(cosAngle)), (H / 2 - 40) / Math.max(1e-3, Math.abs(sinAngle)));\n        x = W / 2 + cosAngle * k; y = H / 2 + sinAngle * k;"],
  ["src/fx/fx.js", "      this._sprite(this.puffs, pos.x + Math.cos(a) * 0.25, pos.y + 0.12 + rand() * 0.12, pos.z + Math.sin(a) * 0.25, Math.cos(a) * sp, 0.3 + rand() * 0.5, Math.sin(a) * sp,", "      const ca = Math.cos(a), sa = Math.sin(a);\n      this._sprite(this.puffs, pos.x + ca * 0.25, pos.y + 0.12 + rand() * 0.12, pos.z + sa * 0.25, ca * sp, 0.3 + rand() * 0.5, sa * sp,"],
  ["src/ui/diorama.js", "const K = '#15121c';", "const K = '#15121c';\n// CSSOM serializes spacing/zeroes; retain the actual written form and restore external overrides.\nfunction setDioramaTransform(owner, key, el, value) {\n  const prior = owner[key];\n  if (!prior || prior.el !== el || prior.authored !== value || el.style.transform !== prior.serialized) {\n    el.style.transform = value;\n    owner[key] = { el, authored: value, serialized: el.style.transform };\n  }\n}"],
  ["src/ui/diorama.js", "      p.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;", "      setDioramaTransform(p, '_positionTransform', p.el, `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`);"],
  ["src/ui/diorama.js", "        p.icon.style.transform = `rotate(${Math.atan2(sx, -sy).toFixed(3)}rad)`;", "        setDioramaTransform(p, '_arrowTransform', p.icon, `rotate(${Math.atan2(sx, -sy).toFixed(3)}rad)`);"],
  ["src/ui/diorama.js", "    this.cursor.style.transform = `translate3d(${cxp.toFixed(1)}px,${cyp.toFixed(1)}px,0)`;", "    setDioramaTransform(this._last, 'cursorTransform', this.cursor, `translate3d(${cxp.toFixed(1)}px,${cyp.toFixed(1)}px,0)`);"],
  ["src/ui/diorama.js", "    this.cursor.classList.toggle('is-snap', this.hover >= 0);", "    const snapped = this.hover >= 0; if (this.cursor.classList.contains('is-snap') !== snapped) this.cursor.classList.toggle('is-snap', snapped);"],
  ["src/ui/menu-art.js", "  h, clamp, lerp, easeInOutCubic, easeOutBack, easeOutCubic, rng, splatShape, splatSVG, shade, fmtInt, safeCall,", "  h, clamp, lerp, easeInOutCubic, easeOutBack, easeOutCubic, rng, splatShape, splatSVG, shade, fmtInt, safeCall, closedCurve,"],
  ["src/ui/menu-art.js", "/** Radius a splat centred on (x, y) needs before its valleys clear every corner of a W×H box. */", "/** One wipe owns its seeded shape; retain the original radius arithmetic before curve rounding. */\nexport function createSplatClip(seed = 3) {\n  const R = rng(seed), step = Math.PI * 2 / 9, rot = R() * Math.PI * 2, points = [], pts = [];\n  const add = (angle, kind, factor) => { points.push([Math.cos(angle), Math.sin(angle), kind, factor]); pts.push([0, 0]); };\n  for (let i = 0; i < 9; i++) {\n    const a0 = rot + i * step + (R() - 0.5) * step * 0.25;\n    add(a0, 0, 0.8 + R() * 0.1);\n    const big = R() < 0.62, L = big ? 1 + 0.5 * (0.55 + R() * 0.75) : 0.98 + R() * 0.1;\n    const am = a0 + step * (0.45 + (R() - 0.5) * 0.2);\n    if (big) {\n      const neck = step * (0.12 + R() * 0.05), bulb = step * (0.2 + R() * 0.08);\n      add(am - neck, 1, L); add(am - bulb * 0.9, 2, L); add(am, 3, L); add(am + bulb * 0.9, 2, L); add(am + neck, 1, L);\n    } else add(am, 0, L);\n  }\n  return (x, y, radius) => {\n    const r = Math.max(0.01, radius);\n    for (let i = 0; i < points.length; i++) {\n      const p = points[i], L = r * p[3];\n      const d = p[2] === 1 ? r * 0.98 + (L - r) * 0.35 : p[2] === 2 ? L * 0.96 : p[2] === 3 ? L * 1.02 : L;\n      pts[i][0] = x + p[0] * d; pts[i][1] = y + p[1] * d;\n    }\n    return `path('${closedCurve(pts, 1)}')`;\n  };\n}\n/** Radius a splat centred on (x, y) needs before its valleys clear every corner of a W×H box. */"],
  ["src/ui/news.js", "import { splatClip, splatCover, inkBurst } from './menu-art.js';", "import { createSplatClip, splatCover, inkBurst } from './menu-art.js';"],
  ["src/ui/news.js", "    layer.style.clipPath = splatClip(x, y, 0.01, seed);\n    this._tween(dur, (k) => { layer.style.clipPath = splatClip(x, y, R * easeOutCubic(k), seed); },", "    const clip = createSplatClip(seed);\n    layer.style.clipPath = clip(x, y, 0.01);\n    this._tween(dur, (k) => { layer.style.clipPath = clip(x, y, R * easeOutCubic(k)); },"],
  ["src/ui/news.js", "      this._tween(0.5, (k) => { last.style.clipPath = splatClip(x, y, Math.max(0.01, R * (1 - easeInOutCubic(k))), s.seed + 1); }, finish);", "      const clip = createSplatClip(s.seed + 1);\n      this._tween(0.5, (k) => { last.style.clipPath = clip(x, y, Math.max(0.01, R * (1 - easeInOutCubic(k)))); }, finish);"],
  ["src/game/weapons.js", "    const group = new THREE.Group();\n    const col = G.teamColors[b.team];\n    // a soft cumulus: a flattened ring of big puffs with smaller, paler puffs piled on top; tinted underside\n    const base = new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), 0.12), roughness: 0.95, emissive: col, emissiveIntensity: 0.16, transparent: true, opacity: 0.97 });\n    const top = new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), 0.55), roughness: 0.95, emissive: col, emissiveIntensity: 0.08, transparent: true, opacity: 0.97 });\n    const puff = (x, y, z, r, m) => {\n      const p = new THREE.Mesh(this.cloudGeo, m);\n      p.position.set(x, y, z); p.scale.set(r, r * 0.68, r);\n      p.castShadow = true;\n      p.userData.bob = Math.random() * 6.28;\n      group.add(p);\n    };\n    puff(0, 0, 0, 1.9, base);\n    for (let i = 0; i < 8; i++) {\n      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3, r = 1.7 + Math.random() * 0.6;\n      puff(Math.cos(a) * r, -0.1 + Math.random() * 0.2, Math.sin(a) * r, 1.05 + Math.random() * 0.45, base);\n    }\n    for (let i = 0; i < 5; i++) {\n      const a = (i / 5) * Math.PI * 2 + 0.4, r = 0.6 + Math.random() * 0.8;\n      puff(Math.cos(a) * r, 0.75 + Math.random() * 0.3, Math.sin(a) * r, 0.9 + Math.random() * 0.4, top);\n    }\n    puff(0, 1.15, 0, 1.0, top);\n", "    const group = new THREE.Group();\n    const col = G.teamColors[b.team];\n    let replacement = null;\n    try { replacement = this._s3StormCloudVisualFactory?.(b); } catch { /* optional presentation: retain native fallback */ }\n    group.userData.s3StormCloudFactorySupported = true;\n    const nativeVisuals = !replacement?.isObject3D;\n    if (!nativeVisuals) for (const child of [...replacement.children]) group.add(child);\n    // a soft cumulus: a flattened ring of big puffs with smaller, paler puffs piled on top; tinted underside\n    const base = nativeVisuals ? new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), 0.12), roughness: 0.95, emissive: col, emissiveIntensity: 0.16, transparent: true, opacity: 0.97 }) : null;\n    const top = nativeVisuals ? new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color(1, 1, 1), 0.55), roughness: 0.95, emissive: col, emissiveIntensity: 0.08, transparent: true, opacity: 0.97 }) : null;\n    const puff = (x, y, z, r, m) => {\n      // Every discarded puff still consumes its original bob RNG draw.\n      if (!nativeVisuals) { Math.random(); return; }\n      const p = new THREE.Mesh(this.cloudGeo, m);\n      p.position.set(x, y, z); p.scale.set(r, r * 0.68, r);\n      p.castShadow = true;\n      p.userData.bob = Math.random() * 6.28;\n      group.add(p);\n    };\n    puff(0, 0, 0, 1.9, base);\n    for (let i = 0; i < 8; i++) {\n      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3, r = 1.7 + Math.random() * 0.6;\n      puff(Math.cos(a) * r, -0.1 + Math.random() * 0.2, Math.sin(a) * r, 1.05 + Math.random() * 0.45, base);\n    }\n    for (let i = 0; i < 5; i++) {\n      const a = (i / 5) * Math.PI * 2 + 0.4, r = 0.6 + Math.random() * 0.8;\n      puff(Math.cos(a) * r, 0.75 + Math.random() * 0.3, Math.sin(a) * r, 0.9 + Math.random() * 0.4, top);\n    }\n    puff(0, 1.15, 0, 1.0, top);\n"]
];
export function adaptVisualAudioQueue(rel, code) {
  for (let [file, before, after] of CHANGES) {
    if (rel !== file) continue;
    // Direct quality tests and the full reliability composition have distinct,
    // exact RAF cleanup anchors. Preserve both cleanup owners in either route.
    if (file === 'src/ui/menus.js' && before === "    cancelAnimationFrame(this._raf);\n" && !code.includes(before)) {
      before = "    cancelAnimationFrame(this._raf); cancelAnimationFrame(this._fitQ); this._fitQ = 0;\n";
      after = before + "    this._news?.dispose();\n";
    }
    const expected = 1;
    const count = code.split(before).length - 1;
    if (count !== expected) throw new Error('visual/audio queue anchor: ' + file + ': expected ' + expected + ', got ' + count + ': ' + before.slice(0, 80));
    code = code.replaceAll(before, after);
  }
  return code;
}
