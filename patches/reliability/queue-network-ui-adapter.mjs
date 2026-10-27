// Build-only reductions after the existing source owners. Inputs and gameplay constants are unchanged.
const patches = {
  "src/net/netmatch.js": [
    [
      "  _pathAt(buf, t, S) {\n    let s0 = buf[0], s1 = null;\n    for (let i = 0; i < buf.length - 1; i++) { if (buf[i].t <= t && buf[i + 1].t > t) { s0 = buf[i]; s1 = buf[i + 1]; break; } }",
      "  _pathAt(buf, t, S) {\n    let s0 = buf[0], s1 = null;\n    // Admission keeps timestamps strictly increasing. Current playback is\n    // normally near the newest entries; past/future endpoints need no scan.\n    if (t >= s0.t && t < buf[buf.length - 1].t) {\n      for (let i = buf.length - 2; i >= 0; i--) { if (buf[i].t <= t && buf[i + 1].t > t) { s0 = buf[i]; s1 = buf[i + 1]; break; } }\n    }",
      1
    ],
    [
      "    const a = [], sq = Object.create(null), dr = Object.create(null), wp = Object.create(null), bw = Object.create(null), rf = Object.create(null), pg = Object.create(null);",
      "    const a = [], sjEpochs = Object.create(null);\n    let sq = null, dr = null, wp = null, bw = null, rf = null, pg = null;",
      1
    ],
    [
      "pg[x.nid] = splashdown;",
      "(pg || (pg = Object.create(null)))[x.nid] = splashdown;",
      1
    ],
    [
      "rf[x.nid] = flick;",
      "(rf || (rf = Object.create(null)))[x.nid] = flick;",
      1
    ],
    [
      "sq[x.nid] = visual;",
      "(sq || (sq = Object.create(null)))[x.nid] = visual;",
      1
    ],
    [
      "dr[x.nid] = dropRoll;",
      "(dr || (dr = Object.create(null)))[x.nid] = dropRoll;",
      1
    ],
    [
      "wp[x.nid] = [slosh, phase, slamT];",
      "(wp || (wp = Object.create(null)))[x.nid] = [slosh, phase, slamT];",
      1
    ],
    [
      "bw[x.nid] = Math.min(1, windup);",
      "(bw || (bw = Object.create(null)))[x.nid] = Math.min(1, windup);",
      1
    ],
    [
      "if (Object.keys(sq).length) msg.sq = sq;",
      "if (sq) msg.sq = sq;",
      1
    ],
    [
      "if (Object.keys(dr).length) msg.dr = dr;",
      "if (dr) msg.dr = dr;",
      1
    ],
    [
      "if (Object.keys(wp).length) msg.wp = wp;",
      "if (wp) msg.wp = wp;",
      1
    ],
    [
      "if (Object.keys(bw).length) msg.bw = bw;",
      "if (bw) msg.bw = bw;",
      1
    ],
    [
      "if (Object.keys(rf).length) msg.rf = rf;",
      "if (rf) msg.rf = rf;",
      1
    ],
    [
      "if (Object.keys(pg).length) msg.pg = pg;",
      "if (pg) msg.pg = pg;",
      1
    ],
    [
      "      a.push(packActor(x));",
      "      a.push(packActor(x));\n      if (Number.isSafeInteger(x.nid)) { const epoch = x._s3SuperJumpEpoch; sjEpochs[x.nid] = Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0; }",
      1
    ],
    [
      "    msg.sjEpochs = Object.create(null);\n    for (const actor of this.byNid.values()) if (!actor.remote && Number.isSafeInteger(actor.nid)) {\n      const epoch = actor._s3SuperJumpEpoch;\n      msg.sjEpochs[actor.nid] = Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0;\n    }",
      "    msg.sjEpochs = sjEpochs;",
      1
    ],
    [
      "    if (Array.isArray(d?.e)) d = { ...d, _eventOverBudget: d.e.length > 256, e: d.e.slice(0, 256).filter(Array.isArray) };",
      "    if (Array.isArray(d?.e)) {\n      const rows = [], limit = Math.min(d.e.length, 256);\n      for (let i = 0; i < limit; i++) if (Array.isArray(d.e[i])) rows.push(d.e[i]);\n      d = { ...d, _eventOverBudget: d.e.length > 256, e: rows };\n    }",
      1
    ],
    [
      "      if (consumed) p.events.splice(0, consumed);",
      "      if (consumed) { p.events.copyWithin(0, consumed); p.events.length -= consumed; }",
      1
    ],
    [
      "      for (const c of ['x', 'y', 'z']) { const x0 = err[c], v0 = ev[c], q = v0 + w * x0; err[c] = (x0 + q * dt) * k; ev[c] = (v0 - w * q * dt) * k; }",
      "      { const x0 = err.x, v0 = ev.x, q = v0 + w * x0; err.x = (x0 + q * dt) * k; ev.x = (v0 - w * q * dt) * k; }\n      { const x0 = err.y, v0 = ev.y, q = v0 + w * x0; err.y = (x0 + q * dt) * k; ev.y = (v0 - w * q * dt) * k; }\n      { const x0 = err.z, v0 = ev.z, q = v0 + w * x0; err.z = (x0 + q * dt) * k; ev.z = (v0 - w * q * dt) * k; }",
      2
    ],
    [
      "      const wr = a.weaponRunner, near = a.alive && a._nearCamera();\n      const k = a.weapon.kind;",
      "      const wr = a.weaponRunner, k = a.weapon.kind, loops = a.net.loops;\n      if (!(wr.charging && (k === 'charger' || k === 'catalog' && a.weapon.behaviorKind === 'charger')) && !((wr.charging || wr.streaming) && (k === 'splatling' || a.weapon.behaviorKind === 'splatling' || a.weapon.catalogRecord?.family === 'splatling' || a.weapon.id?.startsWith('s3-spinner-'))) && !wr.rolling && !loops.charge && !loops.spinnerCharge && !loops.spin && !loops.roll && !a.net._chargerRise && !a.net._chargerOnsetActive) continue;\n      const near = a.alive && a._nearCamera();",
      1
    ],
    [
      "    if (d.e != null && !Array.isArray(d.e)) return;",
      "    if (d.e != null && !Array.isArray(d.e)) return;\n    if (Array.isArray(d.a) && d.a.length > this.byNid.size) return;",
      1
    ],
    [
      "      if (!validActorSnapshotRow(s, d.ts)) continue;",
      "      if (!validActorSnapshotRow(s, d.ts)) continue;\n      const a = this.byNid.get(s[0]);\n      if (!a || !a.remote || a.owner !== from) continue;\n      const buf = a.net.buf;\n      if (buf.length && d.ts <= buf[buf.length - 1].t) continue;",
      1
    ],
    [
      "      const a = this.byNid.get(s[0]);\n      if (!a || !a.remote || a.owner !== from) continue;\n      const buf = a.net.buf;\n      const snap = unpackActor(s, d.ts);",
      "      const snap = unpackActor(s, d.ts);",
      1
    ],
    [
      "    const W = p.win || (p.win = { late: [], gap: [], sorted: [] });\n    W.late.push(o - p.off); W.gap.push(p.prevTs !== undefined ? Math.min(0.25, Math.max(0, d.ts - p.prevTs)) : TICK);\n    p.prevTs = d.ts;\n    if (W.late.length > 60) { W.late.shift(); W.gap.shift(); }\n    p.want = Math.min(0.3, Math.max(0.07, quantile(W.gap, 0.95, W.sorted) + quantile(W.late, 0.9, W.sorted) + 0.012));",
      "    const W = p.win || (p.win = { late: [], gap: [], lateSorted: [], gapSorted: [] });\n    pushQuantileSample(W.late, W.lateSorted, o - p.off);\n    pushQuantileSample(W.gap, W.gapSorted, p.prevTs !== undefined ? Math.min(0.25, Math.max(0, d.ts - p.prevTs)) : TICK);\n    p.prevTs = d.ts;\n    p.want = Math.min(0.3, Math.max(0.07, orderedQuantile(W.gapSorted, 0.95) + orderedQuantile(W.lateSorted, 0.9) + 0.012));",
      1
    ],
    [
      "import { installCombatProvenance } from '../../patches/network-replication/combat-provenance.mjs';",
      "import { pushQuantileSample, orderedQuantile } from '../../patches/network-replication/rolling-quantile.mjs';\nimport { installCombatProvenance } from '../../patches/network-replication/combat-provenance.mjs';",
      1
    ],
    [
      "    const at = (t, O) => {\n      let s0 = buf[0], s1 = null;\n      for (let i = 0; i < buf.length - 1; i++) if (buf[i].t <= t && buf[i + 1].t > t) { s0 = buf[i]; s1 = buf[i + 1]; break; }\n      if (s1) {\n        const d = Math.max(1e-3, s1.t - s0.t), u = Math.min(1, Math.max(0, (t - s0.t) / d)), u2 = u * u, u3 = u2 * u;\n        const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;\n        O.x = h00 * s0.x + h10 * d * s0.vx + h01 * s1.x + h11 * d * s1.vx;\n        O.z = h00 * s0.z + h10 * d * s0.vz + h01 * s1.z + h11 * d * s1.vz;\n        O.y = s0.y + (s1.y - s0.y) * u; O.yaw = s0.yaw + angDiff(s0.yaw, s1.yaw) * u; O.bt = s0.bt + (s1.bt - s0.bt) * u;\n        O.vx = s0.vx + (s1.vx - s0.vx) * u; O.vz = s0.vz + (s1.vz - s0.vz) * u;\n        O.s0 = s0; O.s1 = s1; O.u = u;\n        return 0;\n      }\n      const last = buf[buf.length - 1], e = t > last.t ? Math.min(t - last.t, 0.15) : 0;\n      const s = t >= last.t ? last : s0;\n      O.x = s.x + s.vx * e; O.z = s.z + s.vz * e; O.y = s.y; O.yaw = s.yaw; O.bt = s.bt + e; O.vx = s.vx; O.vz = s.vz;\n      O.s0 = s; O.s1 = null; O.u = 0;\n      return e > 0 ? 2 : 1;\n    };\n",
      "",
      1
    ],
    [
      "    at(tr, S);",
      "    queueBossPath(buf, tr, S);",
      1
    ],
    [
      "      at(n.prevT, P);",
      "      queueBossPath(buf, n.prevT, P);",
      1
    ],
    [
      "const ascending = (x, y) => x - y;",
      "function queueBossPath(buf, t, O) {\n      let s0 = buf[0], s1 = null;\n      for (let i = 0; i < buf.length - 1; i++) if (buf[i].t <= t && buf[i + 1].t > t) { s0 = buf[i]; s1 = buf[i + 1]; break; }\n      if (s1) {\n        const d = Math.max(1e-3, s1.t - s0.t), u = Math.min(1, Math.max(0, (t - s0.t) / d)), u2 = u * u, u3 = u2 * u;\n        const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;\n        O.x = h00 * s0.x + h10 * d * s0.vx + h01 * s1.x + h11 * d * s1.vx;\n        O.z = h00 * s0.z + h10 * d * s0.vz + h01 * s1.z + h11 * d * s1.vz;\n        O.y = s0.y + (s1.y - s0.y) * u; O.yaw = s0.yaw + angDiff(s0.yaw, s1.yaw) * u; O.bt = s0.bt + (s1.bt - s0.bt) * u;\n        O.vx = s0.vx + (s1.vx - s0.vx) * u; O.vz = s0.vz + (s1.vz - s0.vz) * u;\n        O.s0 = s0; O.s1 = s1; O.u = u;\n        return 0;\n      }\n      const last = buf[buf.length - 1], e = t > last.t ? Math.min(t - last.t, 0.15) : 0;\n      const s = t >= last.t ? last : s0;\n      O.x = s.x + s.vx * e; O.z = s.z + s.vz * e; O.y = s.y; O.yaw = s.yaw; O.bt = s.bt + e; O.vx = s.vx; O.vz = s.vz;\n      O.s0 = s; O.s1 = null; O.u = 0;\n      return e > 0 ? 2 : 1;\n}\nconst QUEUE_BOSS_FIELDS = Object.freeze(['hp', 'phase', 'f', 'mv', 'anim', 'turn', 'fl', 'wk', 'killer', 'maxHp', 'move']);\nconst ascending = (x, y) => x - y;",
      1
    ],
    [
      "for (const k of ['hp', 'phase', 'f', 'mv', 'anim', 'turn', 'fl', 'wk', 'killer', 'maxHp', 'move']) S[k] = s0[k];",
      "for (const k of QUEUE_BOSS_FIELDS) S[k] = s0[k];",
      1
    ],
    [
      "    nextCrabs.clear();\n    for (const c of s1?.crabs || []) nextCrabs.set(c[0], c);",
      "    const successorCrabs = s1?.crabs || null;\n    if (n._crabLookupSource !== successorCrabs) {\n      n._crabLookupSource = successorCrabs; nextCrabs.clear();\n      for (const c of successorCrabs || []) nextCrabs.set(c[0], c);\n    }\n    const crabRows = n._crabRows || (n._crabRows = []);",
      1
    ],
    [
      "      if (c1) cr.push([c[0], c[1] + (c1[1] - c[1]) * S.u, c[2] + (c1[2] - c[2]) * S.u, c[3] + (c1[3] - c[3]) * S.u, c[4] + angDiff(c[4], c1[4]) * S.u, c1[5]]);",
      "      if (c1) {\n        const row = crabRows[cr.length] || (crabRows[cr.length] = new Array(6));\n        row[0] = c[0]; row[1] = c[1] + (c1[1] - c[1]) * S.u; row[2] = c[2] + (c1[2] - c[2]) * S.u;\n        row[3] = c[3] + (c1[3] - c[3]) * S.u; row[4] = c[4] + angDiff(c[4], c1[4]) * S.u; row[5] = c1[5];\n        cr.push(row);\n      }",
      1
    ],
    [
      "    else if (n.prevRaw && n.prevT !== undefined) {\n      this._pathAt(buf, n.prevT, _P);",
      "    else if (n.prevRaw && n.prevT !== undefined && (n._queuePathBuffer !== buf || n._queuePathFirst !== buf[0] || n._queuePathLast !== buf[buf.length - 1] || n._queuePathLength !== buf.length || n._queuePathOwner !== a.owner || n._queuePathTp !== n.tp)) {\n      this._pathAt(buf, n.prevT, _P);",
      1
    ],
    [
      "    if (this.debug) n.dbg = [mode,",
      "    n._queuePathBuffer = buf; n._queuePathFirst = buf[0]; n._queuePathLast = buf[buf.length - 1]; n._queuePathLength = buf.length; n._queuePathOwner = a.owner; n._queuePathTp = n.tp;\n    if (this.debug) n.dbg = [mode,",
      1
    ],
    [
      "    tickOnlineContinuation(this);",
      "    tickOnlineContinuation(this);\n    const snapshotMatch = this.match, inResults = snapshotMatch?.state === 'results';\n    const publishActors = !inResults || this._queueResultSnapshotMatch !== snapshotMatch;\n    if (!inResults) this._queueResultSnapshotMatch = null;",
      1
    ],
    [
      "    for (const x of this.byNid.values()) if (!x.remote) {",
      "    for (const x of this.byNid.values()) if (publishActors && !x.remote) {",
      1
    ],
    [
      "    return sendOutboundTick(this, msg, packPaintTick, G);",
      "    const accepted = sendOutboundTick(this, msg, packPaintTick, G);\n    if (accepted && inResults && this.match === snapshotMatch) this._queueResultSnapshotMatch = snapshotMatch;\n    return accepted;",
      1
    ],
    [
      "packOwnerGear(this)",
      "(publishActors ? packOwnerGear(this) : {})",
      1
    ],
    [
      "packConditionalGear(this)",
      "(publishActors ? packConditionalGear(this) : {})",
      1
    ],
    [
      "packTransientGear(this, G.time)",
      "(publishActors ? packTransientGear(this, G.time) : {})",
      1
    ],
    [
      "  bind(match) {",
      "  bind(match) {\n    this._queueResultSnapshotMatch = null;",
      1
    ],
    [
      "  dispose() {\n",
      "  dispose() {\n    this._queueResultSnapshotMatch = null;\n",
      1
    ],
    [
      "import { installCombatProvenance } from '../../patches/network-replication/combat-provenance.mjs';",
      "import { indexedGhostBudget, matchingGhostRounds } from '../../patches/network-replication/ghost-live-index.mjs';\nimport { installCombatProvenance } from '../../patches/network-replication/combat-provenance.mjs';",
      1
    ],
    [
      "  if (!Array.isArray(live) || typeof projectiles.ghostProjectile !== 'function') return false;",
      "  if (!Array.isArray(live) || typeof projectiles.ghostProjectile !== 'function') return false;\n  const indexed = indexedGhostBudget(projectiles, actor, NETWORK_GHOST_TOTAL_LIMIT, NETWORK_GHOST_PEER_LIMIT, NETWORK_GHOST_ACTOR_LIMIT);\n  if (indexed !== null) return indexed;",
      1
    ],
    [
      "for (const p of G.projectiles?.list || []) if (p.ghost && p.owner?.nid === e[2] && p._netId === e[3])",
      "for (const p of matchingGhostRounds(G.projectiles, e[2], e[3])) if (p.ghost && p.owner?.nid === e[2] && p._netId === e[3])",
      1
    ]
  ],
  "src/net/transport.js": [
    [
      "  broadcast(obj) { return this._raw('b|' + JSON.stringify(obj), obj?.[OUTBOUND_RECEIPT]); }\n  sendTo(id, obj) { return this._raw('s|' + id + '|' + JSON.stringify(obj)); }",
      "  broadcast(obj) {\n    const receipt = obj?.[OUTBOUND_RECEIPT], ws = this.ws;\n    if (!ws || ws.readyState !== 1 || ws.bufferedAmount > 512 * 1024) { if (receipt) receipt.reason = 'unavailable'; return false; }\n    return this._raw('b|' + JSON.stringify(obj), receipt);\n  }\n  sendTo(id, obj) {\n    const ws = this.ws;\n    if (!ws || ws.readyState !== 1 || ws.bufferedAmount > 512 * 1024) return false;\n    return this._raw('s|' + id + '|' + JSON.stringify(obj));\n  }",
      1
    ],
    [
      "// WebSocket link",
      "import { utf8ByteLength } from '../../patches/network-replication/utf8-length.mjs';\n// WebSocket link",
      1
    ],
    [
      "outboundUtf8Encoder.encode(s).byteLength",
      "utf8ByteLength(s)",
      1
    ]
  ],
  "src/core/mobile.js": [
    [
      "    this.s = { touchSens: 0, touchScale: 1, touchOpacity: 0.85, stickMode: 'float', fireAim: true, gyro: false, rumble: 1 };",
      "    this.s = { touchSens: 0, touchScale: 1, touchOpacity: 0.85, stickMode: 'float', fireAim: true, gyro: false, rumble: 1 };\n    this._touchSensMul = touchSensMul(this.s.touchSens);",
      1
    ],
    [
      "    if (this.root) { this.root.style.setProperty('--iwm-op', String(clamp(+S.touchOpacity || 0.85, 0.2, 1))); this._layoutAll(); }",
      "    this._touchSensMul = touchSensMul(S.touchSens);\n    if (this.root) { this.root.style.setProperty('--iwm-op', String(clamp(+S.touchOpacity || 0.85, 0.2, 1))); this._layoutAll(); }",
      1
    ],
    [
      "* touchSensMul(this.s.touchSens);",
      "* this._touchSensMul;",
      1
    ],
    [
      "    for (const type of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, block, { passive: false, signal: sig });",
      "    for (const target of [root, this.canvas]) for (const type of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'gestureend']) target.addEventListener(type, block, { passive: false, signal: sig });",
      1
    ],
    [
      "    this._destroyed = true; ++this._gyroIntent;",
      "    if (this._destroyed) return;\n    this._destroyed = true; ++this._gyroIntent;",
      1
    ],
    [
      "this.root?.remove(); document.documentElement.classList.remove('iw-mobile');",
      "this.root?.remove();\n    if (!document.querySelector('#iw-mobile-controls')) document.documentElement.classList.remove('iw-mobile');",
      1
    ],
    [
      "      const b = this._box(id);\n      el.style.width",
      "      const b = this._box(id);\n      (this._hitBoxes || (this._hitBoxes = Object.create(null)))[id] = b;\n      el.style.width",
      1
    ],
    [
      "      const b = this._box(id);\n      if (Math.hypot",
      "      const b = this._hitBoxes?.[id] || this._box(id);\n      if (Math.hypot",
      1
    ],
    [
      "    this.knob.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`;",
      "    const knobTransform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`;\n    const knobStyle = this.knob.style;\n    if (this._knobStyle !== knobStyle || this._knobTransform !== knobTransform || knobStyle.transform !== this._knobActual) {\n      knobStyle.transform = knobTransform; this._knobStyle = knobStyle; this._knobTransform = knobTransform; this._knobActual = knobStyle.transform;\n    }",
      1
    ],
    [
      "      this.dirEl.style.opacity = String(Math.min(1, mag * 1.4));",
      "      const opacity = String(Math.min(1, mag * 1.4));\n      const directionStyle = this.dirEl.style;\n      if (this._directionStyle !== directionStyle || this._directionOpacity !== opacity || directionStyle.opacity !== this._directionOpacityActual) {\n        directionStyle.opacity = opacity; this._directionStyle = directionStyle; this._directionOpacity = opacity; this._directionOpacityActual = directionStyle.opacity;\n      }",
      1
    ],
    [
      "      this.dirEl.style.transform = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;",
      "      const direction = `rotate(${Math.atan2(dy, dx).toFixed(3)}rad)`;\n      if (this._directionTransformStyle !== this.dirEl.style || this._directionTransform !== direction || this.dirEl.style.transform !== this._directionActual) {\n        this.dirEl.style.transform = direction; this._directionTransformStyle = this.dirEl.style; this._directionTransform = direction; this._directionActual = this.dirEl.style.transform;\n      }",
      1
    ],
    [
      "    } else this.dirEl.style.opacity = '0';",
      "    } else if (this.dirEl.style.opacity !== '0') this.dirEl.style.opacity = '0';",
      1
    ],
    [
      "this._abort.abort(); this.gyro.stop();",
      "this._abort.abort(); this.gyro.stop(); this.gyro.disposePlatform?.(); this._queueSafeLayout?.dispose(); this._queueSafeLayout = null;",
      1
    ],
    [
      "    if (sp !== L.sp) { L.sp = sp; E.special.querySelectorAll('.iwm-sp-segment').forEach((segment, i) => segment.classList.toggle('is-filled', i < sp)); }",
      "    if (sp !== L.sp || L.spNode !== E.special) {\n      const previous = L.spNode === E.special ? L.sp : undefined;\n      if (L.spNode !== E.special) { L.spNode = E.special; L.spElements = E.special.querySelectorAll('.iwm-sp-segment'); }\n      const begin = previous === undefined ? 0 : Math.min(previous, sp), end = previous === undefined ? L.spElements.length : Math.max(previous, sp);\n      for (let i = begin; i < end; i++) L.spElements[i]?.classList.toggle('is-filled', i < sp);\n      L.sp = sp;\n    }",
      1
    ],
    [
      "      el.style.width = el.style.height = `${b.d.toFixed(1)}px`;\n      if (id === 'stick') {\n        el.style.transform = `translate3d(${(b.x - b.d / 2).toFixed(1)}px,${(b.y - b.d / 2).toFixed(1)}px,0)`;\n      } else {\n        el.style.left = (b.x - b.d / 2).toFixed(1) + 'px';\n        el.style.top = (b.y - b.d / 2).toFixed(1) + 'px';\n        el.style.transform = 'none';\n      }",
      "      const diameter = `${b.d.toFixed(1)}px`, left = (b.x - b.d / 2).toFixed(1) + 'px', top = (b.y - b.d / 2).toFixed(1) + 'px';\n      const transform = id === 'stick' ? `translate3d(${left},${top},0)` : 'none';\n      const key = diameter + '|' + left + '|' + top + '|' + transform;\n      if (el._queueGeometry !== key) {\n        el.style.width = el.style.height = diameter;\n        if (id === 'stick') el.style.transform = transform;\n        else { el.style.left = left; el.style.top = top; el.style.transform = transform; }\n        el._queueGeometry = key;\n      }",
      1
    ],
    [
      "import { installMobilePlatform } from '../../patches/local-quality/mobile-platform.mjs';",
      "import { LayoutSample } from '../../patches/local-quality/layout-sample.mjs';\nimport { installMobilePlatform } from '../../patches/local-quality/mobile-platform.mjs';",
      1
    ],
    [
      "    const r = p.getBoundingClientRect();",
      "    if (!this._queueSafeLayout) {\n      const root = this.root;\n      this._queueSafeLayout = new LayoutSample(root, { contains: node => node !== root && node !== p && root.contains(node) });\n    }\n    this._queueSafeLayout.begin();\n    const r = this._queueSafeLayout.rect(p);",
      1
    ]
  ],
  "src/fx/screenfx.js": [
    [
      "    r.setRenderTarget(this.rt);\n    r.setClearColor(0x000000, 0);\n    r.clear(true, false, false);\n    if (n) r.render(this.scene, this.cam);\n    r.setRenderTarget(prevRT);\n    r.setClearColor(_cc, ca);\n    this.dirty = false;",
      "    const clearColor = _cc.clone();\n    try {\n      r.setRenderTarget(this.rt);\n      r.setClearColor(0x000000, 0);\n      r.clear(true, false, false);\n      if (n) r.render(this.scene, this.cam);\n      this.dirty = false;\n    } finally {\n      try { r.setRenderTarget(prevRT); } finally { r.setClearColor(clearColor, ca); }\n    }",
      1
    ],
    [
      "    if (lensOn && !game?._skipRender) this.lens.render(this._aspect);",
      "    if (lensOn && !game?._skipRender && this.lens.dirty) this.lens.render(this._aspect);",
      1
    ],
    [
      "    this._bind();",
      "    this._unsubs = [];\n    this._bind();",
      1
    ],
    [
      "  _bind() {\n    const G = this.G;",
      "  _bind() {\n    const G = this.G;\n    const subscribe = (name, handler) => this._unsubs.push(on(name, handler));",
      1
    ],
    [
      "    on('damage', ({ victim, attacker, amount, source }) => {",
      "    subscribe('damage', ({ victim, attacker, amount, source }) => {",
      1
    ],
    [
      "    on('hit', ({ attacker, killed }) => {",
      "    subscribe('hit', ({ attacker, killed }) => {",
      1
    ],
    [
      "    on('splatted', ({ victim, attacker, cause }) => {",
      "    subscribe('splatted', ({ victim, attacker, cause }) => {",
      1
    ],
    [
      "    on('respawn', ({ actor }) => { if (isLocal(actor)) this._startReveal(actor); });",
      "    subscribe('respawn', ({ actor }) => { if (isLocal(actor)) this._startReveal(actor); });",
      1
    ],
    [
      "    on('superjump', ({ actor, phase }) => {",
      "    subscribe('superjump', ({ actor, phase }) => {",
      1
    ],
    [
      "    on('superjump:land', ({ actor }) => { if (isLocal(actor)) this._land(actor); });",
      "    subscribe('superjump:land', ({ actor }) => { if (isLocal(actor)) this._land(actor); });",
      1
    ],
    [
      "    on('special:use', ({ actor, id }) => {",
      "    subscribe('special:use', ({ actor, id }) => {",
      1
    ],
    [
      "    on('shake', ({ amount, pos }) => { if (pos) blast(pos, amount, null); });",
      "    subscribe('shake', ({ amount, pos }) => { if (pos) blast(pos, amount, null); });",
      1
    ],
    [
      "    on('bomb:explode', ({ pos, team }) => blast(pos, 0.6, G.teamColors?.[team]));",
      "    subscribe('bomb:explode', ({ pos, team }) => blast(pos, 0.6, G.teamColors?.[team]));",
      1
    ],
    [
      "    on('special:slam', ({ pos, actor }) => {",
      "    subscribe('special:slam', ({ pos, actor }) => {",
      1
    ],
    [
      "    on('match:state', ({ state, match }) => {",
      "    subscribe('match:state', ({ state, match }) => {",
      1
    ],
    [
      "    on('weapon:impact', (e) => {",
      "    subscribe('weapon:impact', (e) => {",
      1
    ],
    [
      "    on('match:count', ({ n }) => {",
      "    subscribe('match:count', ({ n }) => {",
      1
    ],
    [
      "  dispose() { this.lens.dispose(); this.mat.dispose(); }",
      "  dispose() {\n    if (this._disposed) return;\n    this._disposed = true;\n    for (const off of this._unsubs) off();\n    this._unsubs.length = 0;\n    if (this.G.screenfx === this) this.G.screenfx = null;\n    if (this.R.extraPass === this.pass) this.R.setExtraPass(null);\n    this.lens.dispose(); this.mat.dispose();\n  }",
      1
    ]
  ],
  "src/core/input.js": [
    [
      "  constructor(canvas) {\n    this.canvas = canvas;\n    this.keys = new Set();\n    this.pressed = new Set();       // keys pressed this frame\n    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false };\n    this.locked = false;\n    this.enabled = true;\n    this.pad = null;\n    this.padPrev = [];\n    this._padIdentity = null; this._padIdentityLost = false; this._padDisconnected = false; this._padEpoch = 0;\n    this._padTakeoverBlocked = new Set(); this._padTakeoverAxes = false;\n    window.addEventListener('gamepaddisconnected', e => {\n      if (this._padIdentity && e.gamepad && (e.gamepad.index === this._padIdentity.index || this._padIdentity.joyconIndices?.includes(e.gamepad.index))) this._padIdentityLost = true;\n    });\n    this.padPressed = new Set();\n    this.padMenuPressed = new Set();\n    this.padMenuBlocked = new Set();\n    this._dev = touchPrimary ? 'touch' : 'kbm';   // phones / tablets start on touch (never shown key prompts)\n    this.onDevice = null;           // (mode) => void  when the last-used device changes (menus prompts, touch UI)\n    this.onKey = null;              // (e) => bool consumed  (menus)\n    window.addEventListener('keydown', (e) => {\n      // the menus call preventDefault themselves when needed (text fields must still receive keystrokes)\n      // auto-repeat must be swallowed too: holding TAB for the map used to let the repeats move browser focus off the\n      // canvas → pointer lock dropped → the round paused (\"opening the map opens the menu\")\n      if (e.repeat) {\n        if (e.code === 'Tab' || (this.locked && GAME_KEYS.has(e.code))) e.preventDefault();\n        if (this.onKey) this.onKey(e, true);\n        return;\n      }\n      // Keyboard state remains live while an existing touch contact owns its gesture.\n      const touchContact = this.lastDevice === 'touch' && this.mobile?.active && !this.mobile._destroyed &&\n        ((this.mobile._ptr?.size || 0) > 0 || (this.mobile._stick?.id ?? -1) >= 0);\n      this._mapToggleKey = e.code === 'Tab' || e.code === 'KeyM';\n      if (!touchContact) this.lastDevice = 'kbm';\n      this._mapToggleKey = false;\n      if (this.onKey && this.onKey(e, false)) return;\n      this.keys.add(e.code);\n      this.pressed.add(e.code);\n      if (GAME_KEYS.has(e.code) && this.locked) e.preventDefault();\n      if (e.code === 'Tab') e.preventDefault();\n    });\n    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });\n    // Stale input is cleared by the PlatformLifecycle owner.\n    window.addEventListener('mousemove', (e) => {\n      if (!this.locked || this._touchUnlockPending || this.lastDevice === 'touch') return;\n      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;\n      this.lastDevice = 'kbm';\n    });\n    // a real touch anywhere switches hybrids (touch laptops, iPad + keyboard) back to touch mode\n    window.addEventListener('pointerdown', (e) => {\n      if (isMobilePointer(e)) this.lastDevice = 'touch';\n      else if (e.pointerType === 'mouse' && this.enabled && (this._touchRelockWanted || this._dev === 'touch') && this._isTouchOverlayReacquireTarget(e.target, true) &&\n        !this.mobile?._ptr?.size && !(this.mobile?._stick?.id >= 0)) {\n        const touchBoot = !this._touchRelockWanted && this._dev === 'touch';\n        // onDeviceChange may close the touch map/editor while hiding controls.\n        // The same gesture must still honor the UI state it started in.\n        const touchUiBlocked = this.mobile?.editing || this.mobile?.mapOpen || !this._isTouchOverlayReacquireTarget(e.target);\n        this._touchLockAdmissionBlocked = !!touchUiBlocked;\n        this.lastDevice = 'kbm';\n        if (touchBoot) this._dev = 'kbm';\n        if (!this._touchUnlockPending && !touchUiBlocked && !this.mobile?.editing && !this.mobile?.mapOpen && G.mode === 'match' && G.match?.state === 'playing' &&\n          !G.match.paused && !G.match.attract && !G.game?.menus?.current) {\n          if (document.pointerLockElement === this.canvas) { this.locked = true; this._touchRelockWanted = false; }\n          else this.requestLock();\n        }\n      }\n    }, { capture: true, passive: true });\n    window.addEventListener('mousedown', (e) => {\n      if (!this.locked) return;\n      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }\n      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }\n    });\n    window.addEventListener('mouseup', (e) => {\n      if (e.button === 0) this.mouse.left = false;\n      if (e.button === 2) this.mouse.right = false;\n    });\n    window.addEventListener('contextmenu', (e) => e.preventDefault());\n    document.addEventListener('pointerlockerror', () => { if (!this._pointerLockPending?.modern) this._finishPointerLockRequest(this._pointerLockPending); });\n    document.addEventListener('pointerlockchange', () => {\n      const wasLocked = this.locked;\n      const locked = document.pointerLockElement === this.canvas;\n      if (locked && (!this.enabled || this._pointerLockCancelled || (this._pointerLockPending && !this._pointerLockRequestCurrent(this._pointerLockPending)) || this.lastDevice === 'touch' || this._touchUnlockPending || this._touchLockAdmissionBlocked || this.mobile?.editing || this.mobile?.mapOpen || G.match?.paused || G.game?.menus?.current)) {\n        this._finishPointerLockRequest(this._pointerLockPending);\n        this.locked = false;\n        if (!this._touchUnlockPending) this._releaseMouseForTouch();\n        return;\n      }\n      this.locked = locked;\n      if (locked) { this._finishPointerLockRequest(this._pointerLockPending); this._touchRelockWanted = false; return; }\n      const touchUnlock = this._touchUnlockPending;\n      this._touchUnlockPending = false;\n      this.mouse.left = this.mouse.right = false; this.mouse.leftPressed = this.mouse.rightPressed = false; this.mouse.dx = this.mouse.dy = 0;\n      if (!touchUnlock && wasLocked) this.onUnlock?.();\n    });\n    this.mobile = new MobileInput(canvas, this);\n  }\n",
      "  constructor(canvas) {\n    this.canvas = canvas;\n    this._inputUnsubs = []; this._disposed = false;\n    this.keys = new Set();\n    this.pressed = new Set();       // keys pressed this frame\n    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false };\n    this.locked = false;\n    this.enabled = true;\n    this.pad = null;\n    this.padPrev = [];\n    this._padIdentity = null; this._padIdentityLost = false; this._padDisconnected = false; this._padEpoch = 0;\n    this._padTakeoverBlocked = new Set(); this._padTakeoverAxes = false;\n    this._listen(window, 'gamepaddisconnected', e => {\n      if (this._padIdentity && e.gamepad && (e.gamepad.index === this._padIdentity.index || this._padIdentity.joyconIndices?.includes(e.gamepad.index))) this._padIdentityLost = true;\n    });\n    this.padPressed = new Set();\n    this.padMenuPressed = new Set();\n    this.padMenuBlocked = new Set();\n    this._dev = touchPrimary ? 'touch' : 'kbm';   // phones / tablets start on touch (never shown key prompts)\n    this.onDevice = null;           // (mode) => void  when the last-used device changes (menus prompts, touch UI)\n    this.onKey = null;              // (e) => bool consumed  (menus)\n    this._listen(window, 'keydown', (e) => {\n      // the menus call preventDefault themselves when needed (text fields must still receive keystrokes)\n      // auto-repeat must be swallowed too: holding TAB for the map used to let the repeats move browser focus off the\n      // canvas → pointer lock dropped → the round paused (\"opening the map opens the menu\")\n      if (e.repeat) {\n        if (e.code === 'Tab' || (this.locked && GAME_KEYS.has(e.code))) e.preventDefault();\n        if (this.onKey) this.onKey(e, true);\n        return;\n      }\n      // Keyboard state remains live while an existing touch contact owns its gesture.\n      const touchContact = this.lastDevice === 'touch' && this.mobile?.active && !this.mobile._destroyed &&\n        ((this.mobile._ptr?.size || 0) > 0 || (this.mobile._stick?.id ?? -1) >= 0);\n      this._mapToggleKey = e.code === 'Tab' || e.code === 'KeyM';\n      if (!touchContact) this.lastDevice = 'kbm';\n      this._mapToggleKey = false;\n      if (this.onKey && this.onKey(e, false)) return;\n      this.keys.add(e.code);\n      this.pressed.add(e.code);\n      if (GAME_KEYS.has(e.code) && this.locked) e.preventDefault();\n      if (e.code === 'Tab') e.preventDefault();\n    });\n    this._listen(window, 'keyup', (e) => { this.keys.delete(e.code); });\n    // Stale input is cleared by the PlatformLifecycle owner.\n    this._listen(window, 'mousemove', (e) => {\n      if (!this.locked || this._touchUnlockPending || this.lastDevice === 'touch') return;\n      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;\n      this.lastDevice = 'kbm';\n    });\n    // a real touch anywhere switches hybrids (touch laptops, iPad + keyboard) back to touch mode\n    this._listen(window, 'pointerdown', (e) => {\n      if (isMobilePointer(e)) this.lastDevice = 'touch';\n      else if (e.pointerType === 'mouse' && this.enabled && (this._touchRelockWanted || this._dev === 'touch') && this._isTouchOverlayReacquireTarget(e.target, true) &&\n        !this.mobile?._ptr?.size && !(this.mobile?._stick?.id >= 0)) {\n        const touchBoot = !this._touchRelockWanted && this._dev === 'touch';\n        // onDeviceChange may close the touch map/editor while hiding controls.\n        // The same gesture must still honor the UI state it started in.\n        const touchUiBlocked = this.mobile?.editing || this.mobile?.mapOpen || !this._isTouchOverlayReacquireTarget(e.target);\n        this._touchLockAdmissionBlocked = !!touchUiBlocked;\n        this.lastDevice = 'kbm';\n        if (touchBoot) this._dev = 'kbm';\n        if (!this._touchUnlockPending && !touchUiBlocked && !this.mobile?.editing && !this.mobile?.mapOpen && G.mode === 'match' && G.match?.state === 'playing' &&\n          !G.match.paused && !G.match.attract && !G.game?.menus?.current) {\n          if (document.pointerLockElement === this.canvas) { this.locked = true; this._touchRelockWanted = false; }\n          else this.requestLock();\n        }\n      }\n    }, { capture: true, passive: true });\n    this._listen(window, 'mousedown', (e) => {\n      if (!this.locked) return;\n      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }\n      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }\n    });\n    this._listen(window, 'mouseup', (e) => {\n      if (e.button === 0) this.mouse.left = false;\n      if (e.button === 2) this.mouse.right = false;\n    });\n    this._listen(window, 'contextmenu', (e) => e.preventDefault());\n    this._listen(document, 'pointerlockerror', () => { if (!this._pointerLockPending?.modern) this._finishPointerLockRequest(this._pointerLockPending); });\n    this._listen(document, 'pointerlockchange', () => {\n      const wasLocked = this.locked;\n      const locked = document.pointerLockElement === this.canvas;\n      if (locked && (!this.enabled || this._pointerLockCancelled || (this._pointerLockPending && !this._pointerLockRequestCurrent(this._pointerLockPending)) || this.lastDevice === 'touch' || this._touchUnlockPending || this._touchLockAdmissionBlocked || this.mobile?.editing || this.mobile?.mapOpen || G.match?.paused || G.game?.menus?.current)) {\n        this._finishPointerLockRequest(this._pointerLockPending);\n        this.locked = false;\n        if (!this._touchUnlockPending) this._releaseMouseForTouch();\n        return;\n      }\n      this.locked = locked;\n      if (locked) { this._finishPointerLockRequest(this._pointerLockPending); this._touchRelockWanted = false; return; }\n      const touchUnlock = this._touchUnlockPending;\n      this._touchUnlockPending = false;\n      this.mouse.left = this.mouse.right = false; this.mouse.leftPressed = this.mouse.rightPressed = false; this.mouse.dx = this.mouse.dy = 0;\n      if (!touchUnlock && wasLocked) this.onUnlock?.();\n    });\n    this.mobile = new MobileInput(canvas, this);\n  }\n",
      1
    ],
    [
      "  get lastDevice() { return this._dev; }",
      "  _listen(target, type, handler, options) {\n    target.addEventListener(type, handler, options);\n    this._inputUnsubs.push(() => target.removeEventListener(type, handler, options));\n  }\n  dispose() {\n    if (this._disposed) return;\n    this._disposed = true; this.enabled = false;\n    this.disposePlatform?.();\n    for (const off of this._inputUnsubs) off();\n    this._inputUnsubs.length = 0;\n    this._pointerLockCancelled = true;\n    this._finishPointerLockRequest?.(this._pointerLockPending);\n    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();\n    this.locked = false;\n    if (!this._platformInputDisposed) this.mobile?.destroy?.();\n    this.onKey = this.onDevice = this.onUnlock = null;\n    this.keys.clear(); this.pressed.clear(); this.padPressed.clear(); this.padMenuPressed.clear();\n    this.padMenuBlocked.clear(); this.pad = null; this.padPrev.length = 0;\n    this.mouse.dx = this.mouse.dy = 0;\n    this.mouse.left = this.mouse.right = this.mouse.leftPressed = this.mouse.rightPressed = false;\n    if (G.input === this) G.input = null;\n  }\n\n  get lastDevice() { return this._dev; }",
      1
    ]
  ],
  "src/main.js": [
    [
      "  _padMenus() {",
      "  _padMenus(dt = 1 / 60) {",
      1
    ],
    [
      "      this._stickT = (this._stickT || 0) - 1 / 60;",
      "      this._stickT = (this._stickT || 0) - Math.min(0.25, Math.max(0, Number.isFinite(dt) ? dt : 0));",
      1
    ],
    [
      "      this._padMenus?.();",
      "      this._padMenus?.(dt);",
      1
    ],
    [
      "      this._padMenus();",
      "      this._padMenus(dt);",
      1
    ],
    [
      "    setTimeout(() => { if (this.match === m && m.state === 'intro') this.hud?.banner('ready'); }, 1700);\n    setTimeout(() => { if (this.match === m && m.state === 'intro') this.hud?.setVisible(true); }, 3000);",
      "    beginIntroPresentation(this, m, [[1.7, 'ready'], [3, 'show']]);",
      1
    ],
    [
      "    setTimeout(() => { if (this.match === m && m.state === 'intro') this.hud?.banner('ready'); }, 5300);\n    setTimeout(() => { if (this.match === m && m.state === 'intro') this.hud?.setVisible(true); }, 5600);",
      "    beginIntroPresentation(this, m, [[5.3, 'ready'], [5.6, 'show']]);",
      1
    ],
    [
      "import { sanitizeSettings, sanitizeSettingsChange } from './core/save-validation.mjs';",
      "import { beginIntroPresentation } from '../patches/splatoon3/runtime/intro-presentation.mjs';\nimport { sanitizeSettings, sanitizeSettingsChange } from './core/save-validation.mjs';",
      1
    ],
    [
      "import { hudFrameSnapshot } from '../patches/local-quality/hud-snapshots.mjs';",
      "import { hudFrameSnapshot, mobileHudSnapshot } from '../patches/local-quality/hud-snapshots.mjs';",
      1
    ],
    [
      "    if (!a?.weapon || !a.weaponRunner) return;\n    const showMinimap",
      "    if (!a?.weapon || !a.weaponRunner) return;\n    if (m.state === 'intro' && this.hud._visible === false) {\n      this._hintT += dt;\n      this.hud.updateHiddenIntro(dt, this.settings.showFps ? this.fps : undefined);\n      this.input.mobile?.setHud(mobileHudSnapshot(this, a, a.weapon, PLAYER, selectedSubCost(a, SUB)));\n      return;\n    }\n    const showMinimap",
      1
    ]
  ],
  "src/game/match.js": [
    [
      "      if (!a.alive || !b.alive) continue;",
      "      if (!a.alive || !b.alive || (a.remote && b.remote)) continue;",
      1
    ]
  ],
  "src/game/showcase.js": [
    [
      "    for (const M of [...L.members.values()]) {\n      this._lobStep(M, dt);",
      "    const memberScratch = this._lobMemberScratch || (this._lobMemberScratch = []);\n    const members = this._lobMembersBusy ? [] : memberScratch;\n    for (const M of L.members.values()) members.push(M);\n    const wasBusy = this._lobMembersBusy; this._lobMembersBusy = true;\n    try { for (const M of members) {\n      this._lobStep(M, dt);",
      1
    ],
    [
      "    for (let i = ci; i < 10; i++) L.contact.setMatrixAt(i, ZERO_M);",
      "    } finally { members.length = 0; this._lobMembersBusy = wasBusy; }",
      1
    ],
    [
      "    _v.set(S.pos.x, S.pos.y + PLATE_H - 0.35, S.pos.z);\n    return this._lobProject(_v, out, free && L.launchT < 0 ? 1 : 0, row, i);",
      "    if (!free || L.launchT >= 0) { out.vis = 0; out.row = row; out.slot = i; return out; }\n    _v.set(S.pos.x, S.pos.y + PLATE_H - 0.35, S.pos.z);\n    return this._lobProject(_v, out, 1, row, i);",
      1
    ],
    [
      "    L.contact.count = Math.max(ci, 1);\n    L.contact.instanceMatrix.needsUpdate = true;\n    if (L.contact.instanceColor) L.contact.instanceColor.needsUpdate = true;",
      "    L.contact.count = ci;\n    if (ci) {\n      L.contact.instanceMatrix.needsUpdate = true;\n      if (L.contact.instanceColor) L.contact.instanceColor.needsUpdate = true;\n    }",
      1
    ],
    [
      "  lobbySlotAnchor(row, i, out = {}) {",
      "  lobbySlotOccupancy() {\n    let mask = 0;\n    for (const M of this.lob?.members?.values() || []) if (!M.dead && !M.leaving) {\n      if (Number.isInteger(M.mark) && M.mark >= 0 && M.mark < 8) mask |= 1 << M.mark;\n      if (Number.isInteger(M.dest) && M.dest >= 0 && M.dest < 8) mask |= 1 << M.dest;\n    }\n    return mask;\n  }\n\n  lobbySlotAnchor(row, i, out = {}, occupancy) {",
      1
    ],
    [
      "    let free = true;\n    for (const M of L.members.values()) if (!M.dead && !M.leaving && (M.mark === mark || M.dest === mark)) { free = false; break; }",
      "    let free = true;\n    if (Number.isInteger(occupancy)) free = !(occupancy & (1 << mark));\n    else for (const M of L.members.values()) if (!M.dead && !M.leaving && (M.mark === mark || M.dest === mark)) { free = false; break; }",
      1
    ]
  ],
  "src/audio/audio.js": [
    [
      "  stats() {\n    for (let i = this.voices.length - 1;",
      "  dispose() {\n    if (this._disposed) return;\n    this._disposed = true;\n    const context = this.ctx;\n    this.disposePlatform?.(); this.disposeWeaponAudio?.(); this.stopAll(0);\n    if (this.music?.ctx === context) this.music.dispose();\n    this.ctx = null; this.ready = false;\n    this.last.clear(); this.byName.clear(); this._warned.clear();\n    if (!this.opts.context && !this.offline && context?.close) Promise.resolve(context.close()).catch(() => {});\n  }\n\n  stats() {\n    for (let i = this.voices.length - 1;",
      1
    ],
    [
      "    v.ondispose = () => { voice.done = true; };",
      "    v.ondispose = () => {\n      voice.done = true;\n      let at = this.voices.indexOf(voice); if (at >= 0) this.voices.splice(at, 1);\n      at = list.indexOf(voice); if (at >= 0) list.splice(at, 1);\n      if (!list.length && this.byName.get(emitterKey) === list) this.byName.delete(emitterKey);\n    };",
      1
    ],
    [
      "    for (const vc of this.voices) this._steal(vc, now);",
      "    for (let i = this.voices.length - 1; i >= 0; i--) this._steal(this.voices[i], now);",
      1
    ],
    [
      "  init() {",
      "  init() {\n    if (this._disposed) return this;",
      1
    ]
  ],
  "src/ui/menus.js": [
    [
      "        fill.style.transform = `translateX(${(-100 + p * 100).toFixed(2)}%)`;",
      "        const transform = `translateX(${(-100 + p * 100).toFixed(2)}%)`;\n        if (fill._iwMeterTransform !== transform || fill.style.transform !== fill._iwMeterActual) {\n          fill.style.transform = transform; fill._iwMeterTransform = transform; fill._iwMeterActual = fill.style.transform;\n        }",
      1
    ],
    [
      "{ const acc = colors().join() + (bossMode() ? '|b' : '');",
      "{ const style = this.el.style; const acc = (style.getPropertyValue('--a').trim() || TEAM_PALETTES[0].a) + ',' + (style.getPropertyValue('--b').trim() || TEAM_PALETTES[0].b) + (bossMode() ? '|b' : '');",
      1
    ],
    [
      "      clockNum.textContent = fmtTime(tLeft);",
      "      const clockText = fmtTime(tLeft); if (clockNum.textContent !== clockText) clockNum.textContent = clockText;",
      1
    ],
    [
      "      clock.style.setProperty('--f', frac.toFixed(4));",
      "      const clockFraction = frac.toFixed(4); if (clock.style.getPropertyValue('--f') !== clockFraction) clock.style.setProperty('--f', clockFraction);",
      1
    ],
    [
      "      sTurf.b.innerHTML = `${fmtInt(me.turf || 0)}<small>p</small>`;",
      "      const turfHtml = `${fmtInt(me.turf || 0)}<small>p</small>`; if (sTurf.b.innerHTML !== turfHtml) sTurf.b.innerHTML = turfHtml;",
      1
    ],
    [
      "      sSplat.b.textContent = String(me.splats || 0);",
      "      const splats = String(me.splats || 0); if (sSplat.b.textContent !== splats) sSplat.b.textContent = splats;",
      1
    ],
    [
      "      sDeath.b.textContent = String(me.deaths || 0);",
      "      const deaths = String(me.deaths || 0); if (sDeath.b.textContent !== deaths) sDeath.b.textContent = deaths;",
      1
    ],
    [
      "      sSp.b.textContent = me.special ? tr('READY') : `${Math.round(clamp(me.specialFrac || 0) * 100)}%`;",
      "      const specialText = me.special ? tr('READY') : `${Math.round(clamp(me.specialFrac || 0) * 100)}%`; if (sSp.b.textContent !== specialText) sSp.b.textContent = specialText;",
      1
    ],
    [
      "      sSp.el.style.setProperty('--sp', clamp(me.specialFrac || 0).toFixed(3));",
      "      const specialFraction = clamp(me.specialFrac || 0).toFixed(3); if (sSp.el.style.getPropertyValue('--sp') !== specialFraction) sSp.el.style.setProperty('--sp', specialFraction);",
      1
    ],
    [
      "    const plates = new Map();",
      "    const plates = new Map(), plateVis = [], platePlaced = [], platePool = [];\n    let plateScratchBusy = false;",
      1
    ],
    [
      "          const vis = [];",
      "          const wasBusy = plateScratchBusy; plateScratchBusy = true;\n          const vis = wasBusy ? [] : plateVis, placedRows = wasBusy ? [] : platePlaced, rowPool = wasBusy ? [] : platePool;\n          vis.length = placedRows.length = 0;\n          try {",
      1
    ],
    [
      "if (on) vis.push(P);",
      "if (on) { P._queueIsYou = P.el.classList.contains('is-you'); vis.push(P); }",
      1
    ],
    [
      "vis.sort((p, q) => (q.el.classList.contains('is-you') - p.el.classList.contains('is-you')) || (q.as - p.as));",
      "vis.sort((p, q) => (q._queueIsYou - p._queueIsYou) || (q.as - p.as));",
      1
    ],
    [
      "          const placed = [];",
      "          const placed = placedRows;",
      1
    ],
    [
      "            placed.push({ x: P.ax, y, w, h: hh, b: bb });",
      "            const placedRow = rowPool[placed.length] || (rowPool[placed.length] = {});\n            placedRow.x = P.ax; placedRow.y = y; placedRow.w = w; placedRow.h = hh; placedRow.b = bb;\n            placed.push(placedRow);",
      1
    ],
    [
      "        }\n        S.age += dt;",
      "          } finally { vis.length = placedRows.length = 0; plateScratchBusy = wasBusy; }\n        }\n        S.age += dt;",
      1
    ],
    [
      "      destroy: () => {\n        S.alive = false;",
      "      destroy: () => {\n        plateVis.length = platePlaced.length = platePool.length = 0;\n        S.alive = false;",
      1
    ],
    [
      "  _updateCursor(dt) {\n    const C = this._cur, f = this._focus;",
      "  _updateCursor(dt) {\n    const C = this._cur, f = this._focus, layout = menuLayoutSample(this, f);",
      1
    ],
    [
      "parseFloat(getComputedStyle(f).opacity) > 0.6",
      "parseFloat(layout.opacity(f)) > 0.6",
      1
    ],
    [
      "        const r = f.getBoundingClientRect(), pad = f.dataset.curPad != null ? +f.dataset.curPad : 7;",
      "        const r = layout.rect(f), pad = f.dataset.curPad != null ? +f.dataset.curPad : 7;",
      1
    ],
    [
      "    const r = f.getBoundingClientRect();\n    const pad = f.dataset.curPad",
      "    const r = layout.rect(f);\n    const pad = f.dataset.curPad",
      1
    ],
    [
      "      const b = sc.getBoundingClientRect();\n      const ct = r.top",
      "      const b = layout.rect(sc);\n      const ct = r.top",
      1
    ],
    [
      "    st.transform = `translate3d(${C.x.x.toFixed(1)}px,${C.y.x.toFixed(1)}px,0)`;",
      "    { const value = `translate3d(${C.x.x.toFixed(1)}px,${C.y.x.toFixed(1)}px,0)`; if (st.transform !== value) st.transform = value; }",
      1
    ],
    [
      "    st.width = Math.max(0, C.w.x).toFixed(1) + 'px';",
      "    { const value = Math.max(0, C.w.x).toFixed(1) + 'px'; if (st.width !== value) st.width = value; }",
      1
    ],
    [
      "    st.height = Math.max(0, C.h.x).toFixed(1) + 'px';",
      "    { const value = Math.max(0, C.h.x).toFixed(1) + 'px'; if (st.height !== value) st.height = value; }",
      1
    ],
    [
      "import { tu } from '../i18n.js';",
      "import { menuLayoutSample } from '../../patches/local-quality/layout-sample.mjs';\nimport { tu } from '../i18n.js';",
      1
    ],
    [
      "  dispose() {",
      "  dispose() {\n    this._queueLayoutSample?.dispose(); this._queueLayoutSample = null;",
      1
    ],
    [
      "          const bots = lob.bots !== false;\n          for (const O of open) {",
      "          const bots = lob.bots !== false, occupancy = sc.lobbySlotOccupancy?.();\n          for (const O of open) {",
      1
    ],
    [
      "sc.lobbySlotAnchor(O.row, O.i, A)",
      "sc.lobbySlotAnchor(O.row, O.i, A, occupancy)",
      1
    ]
  ],
  "src/ui/hud.js": [
    [
      "  _project(cam, x, y, z) {",
      "  _project(cam, x, y, z, out) {",
      1
    ],
    [
      "    return { x: cx / cw, y: cy / cw, z: cw < 0 ? 2 : cz / cw };",
      "    out = out || {}; out.x = cx / cw; out.y = cy / cw; out.z = cw < 0 ? 2 : cz / cw;\n    return out;",
      1
    ],
    [
      "this._project(cam, d.x, d.y, d.z)",
      "this._project(cam, d.x, d.y, d.z, this._projection_down || (this._projection_down = {}))",
      1
    ],
    [
      "this._project(guideCam, point.x, point.y, point.z)",
      "this._project(guideCam, point.x, point.y, point.z, this._projection_guide || (this._projection_guide = {}))",
      1
    ],
    [
      "this._project(guideCam, pair[i].x, pair[i].y, pair[i].z)",
      "this._project(guideCam, pair[i].x, pair[i].y, pair[i].z, this._projection_pair || (this._projection_pair = {}))",
      1
    ],
    [
      "this._project(cam, ch.chargerCurrent.x, ch.chargerCurrent.y, ch.chargerCurrent.z)",
      "this._project(cam, ch.chargerCurrent.x, ch.chargerCurrent.y, ch.chargerCurrent.z, this._projection_current || (this._projection_current = {}))",
      1
    ],
    [
      "this._project(cam, ch.chargerFull.x, ch.chargerFull.y, ch.chargerFull.z)",
      "this._project(cam, ch.chargerFull.x, ch.chargerFull.y, ch.chargerFull.z, this._projection_full || (this._projection_full = {}))",
      1
    ],
    [
      "this._project(G.camera, me.pos.x, me.pos.y + 0.3, me.pos.z)",
      "this._project(G.camera, me.pos.x, me.pos.y + 0.3, me.pos.z, this._projection_tank || (this._projection_tank = {}))",
      1
    ],
    [
      "    for (let it = 0; it < 6; it++) {\n      for (let i = 0; i < tg.length;",
      "    for (let it = 0; it < 6; it++) {\n      let moved = false;\n      for (let i = 0; i < tg.length;",
      1
    ],
    [
      "        const push = (minD - d) / 2;",
      "        const push = (minD - d) / 2;\n        moved = true;",
      1
    ],
    [
      "      }\n    }\n    for (let i = 0; i < tg.length; i++) {",
      "      }\n      if (!moved) break;\n    }\n    for (let i = 0; i < tg.length; i++) {",
      1
    ],
    [
      "    const allies = (G.actors || []).filter((o) => o.team === me.team && o !== me);",
      "    const allies = this._allyScratch || (this._allyScratch = []);\n    allies.length = 0;\n    for (const o of G.actors || []) if (o.team === me.team && o !== me) allies.push(o);",
      1
    ],
    [
      "  releaseMatchActors(actors, match) {",
      "  releaseMatchActors(actors, match) {\n    if (this._allyScratch) this._allyScratch.length = 0;\n    if (this._beaconRows) for (const row of this._beaconRows) if (row) { row.actor = null; row.pad = null; }\n    if (this._beaconScratch) this._beaconScratch.fill(null);",
      1
    ],
    [
      "    const out = [null, null, null, null];",
      "    const out = this._beaconScratch || (this._beaconScratch = []), rows = this._beaconRows || (this._beaconRows = []);\n    for (const row of rows) if (row) { row.actor = null; row.pad = null; }\n    out.length = 4; out.fill(null);",
      1
    ],
    [
      "    const tc = { x: 0, y: 0 };",
      "    const tc = this._beaconPoint || (this._beaconPoint = { x: 0, y: 0 });",
      1
    ],
    [
      "      out[i] = { x: tc.x / mm.w, y: tc.y / mm.h, name: o.name, weapon: o.weaponId, ok: !!(o.alive && (!o.superJumpState || hasCommittedSuperJumpDestination(o))), dead: !o.alive, actor: o };",
      "      const row = rows[i] || (rows[i] = {});\n      row.x = tc.x / mm.w; row.y = tc.y / mm.h; row.name = o.name; row.weapon = o.weaponId;\n      row.ok = !!(o.alive && (!o.superJumpState || hasCommittedSuperJumpDestination(o))); row.dead = !o.alive; row.actor = o;\n      out[i] = row;",
      1
    ],
    [
      "    if (pad && mm) { mm.toCanvas(pad.x, pad.z, tc); out[3] = { x: tc.x / mm.w, y: tc.y / mm.h, name: tr('Base'), ok: true, home: true, pad }; }",
      "    if (pad && mm) { mm.toCanvas(pad.x, pad.z, tc); const row = rows[3] || (rows[3] = {}); row.x = tc.x / mm.w; row.y = tc.y / mm.h; row.name = tr('Base'); row.ok = true; row.home = true; row.pad = pad; out[3] = row; }",
      1
    ],
    [
      "        out.push({ kind: 'bubbler', domeId: target.id, serial: target.serial, team: target.team,\n          x: tc.x / mm.w, y: tc.y / mm.h, name: `Bubbler ${i + 1}`, weapon: 'bubbler', ok: true });",
      "        const row = rows[out.length] || (rows[out.length] = {});\n        row.kind = 'bubbler'; row.domeId = target.id; row.serial = target.serial; row.team = target.team;\n        row.x = tc.x / mm.w; row.y = tc.y / mm.h; row.name = `Bubbler ${i + 1}`; row.weapon = 'bubbler'; row.ok = true;\n        out.push(row);",
      1
    ],
    [
      "  update(dt, f) {",
      "  updateHiddenIntro(dt, fps) {\n    // Banner/lineup DOM animations and independent boss/defeat overlays keep\n    // their original clocks; hidden tank, roster, map and markers wait for the\n    // first visible owner frame, which takes the full update path immediately.\n    flushTeamWipeHud(this, G.match, tr);\n    this._t += dt;\n    this._updDamageDirs(dt); this._updDowns(dt); this._updFps(fps, dt);\n    this.boss.update(dt);\n  }\n\n  update(dt, f) {",
      1
    ],
    [
      "import { tu } from '../i18n.js';",
      "import { canvasCssSize } from '../../patches/local-quality/layout-sample.mjs';\nimport { tu } from '../i18n.js';",
      1
    ],
    [
      "  dispose() {",
      "  dispose() {\n    this._queueCanvasLayout?.dispose(); this._queueCanvasLayout = null;",
      1
    ]
  ],
  "src/ui/diorama.js": [
    [
      "    const allies = (G.actors || []).filter((o) => o.team === me.team && o !== me);",
      "    const allies = this._allyScratch || (this._allyScratch = []);\n    allies.length = 0;\n    for (const o of G.actors || []) if (o.team === me.team && o !== me) allies.push(o);",
      1
    ],
    [
      "  releaseMatchActors(actors = null, match) {",
      "  releaseMatchActors(actors = null, match) {\n    if (this._allyScratch) this._allyScratch.length = 0;",
      1
    ]
  ],
  "src/ui/hud-boss.js": [
    [
      "    const p = this.hud._project(cam, w.x, w.y, w.z);",
      "    const p = this.hud._project(cam, w.x, w.y, w.z, this._ndcScratch || (this._ndcScratch = {}));",
      1
    ],
    [
      "    const sp = w && this._screen(w, { x: 0, y: 0 });",
      "    const sp = w && this._screen(w, this._callScratch || (this._callScratch = {}));",
      1
    ],
    [
      "        const a0 = this._screen({ x: p.x, y: p.y + 1, z: p.z }, { x: 0, y: 0 }), a1 = this._screen({ x: p.x + fx * 6, y: p.y + 1, z: p.z + fz * 6 }, { x: 0, y: 0 });",
      "        const w0 = this._chargeWorld0 || (this._chargeWorld0 = {}), w1 = this._chargeWorld1 || (this._chargeWorld1 = {});\n        w0.x = p.x; w0.y = p.y + 1; w0.z = p.z;\n        w1.x = p.x + fx * 6; w1.y = p.y + 1; w1.z = p.z + fz * 6;\n        const a0 = this._screen(w0, this._chargeScreen0 || (this._chargeScreen0 = {})), a1 = this._screen(w1, this._chargeScreen1 || (this._chargeScreen1 = {}));",
      1
    ]
  ],
  "src/net/session.js": [
    [
      "    if (!p) return;\n    const beforeWeapon = p.weapon;",
      "    if (!p) return;\n    if (o.ping != null && o.name == null && o.weapon == null && o.style == null && o.ready == null && o.team == null && p.ping === Math.round(o.ping)) return;\n    const beforeWeapon = p.weapon;",
      1
    ],
    [
      "        else this.tr.sendTo(this.hostId, { k: 'me', ping });",
      "        else {\n          const last = this._lastLobbyPing;\n          if (!last || last.ping !== ping || last.host !== this.hostId || last.transport !== this.tr || last.lobby !== this.lobby) {\n            if (this.tr.sendTo(this.hostId, { k: 'me', ping }) === true) this._lastLobbyPing = { ping, host: this.hostId, transport: this.tr, lobby: this.lobby };\n          }\n        }",
      1
    ]
  ],
  "src/audio/music.js": [
    [
      "    while (this.t0 + this.n * this.stepDur < now - 0.03 && this.t0 + this.n * this.stepDur < this.stopAt) this.advance();",
      "    const cutoff = Math.min(now - 0.03, this.stopAt);\n    if (this.t0 + this.n * this.stepDur < cutoff) {\n      let target = Math.max(this.n, Math.ceil((cutoff - this.t0) / this.stepDur));\n      while (target > this.n && !(this.t0 + (target - 1) * this.stepDur < cutoff)) target--;\n      while (this.t0 + target * this.stepDur < cutoff) target++;\n      const steps = this.step + target - this.n, bars = Math.floor(steps / 16);\n      this.n = target; this.step = steps % 16; this.bar += bars;\n      if (this.bar >= this.song.bars.length) this.bar = this.song.loopFrom + (this.bar - this.song.bars.length) % (this.song.bars.length - this.song.loopFrom);\n    }",
      1
    ]
  ],
  "src/game/lobbySet.js": [
    [
      "    let bi = 0;\n    _q.identity();",
      "    let bi = 0, colorDirty = false;\n    _q.identity();",
      1
    ],
    [
      "      this.glows.setMatrixAt(i, _m); this.glows.setColorAt(i, gl.color);",
      "      this.glows.setMatrixAt(i, _m);\n      if (gl._uploadedR !== gl.color.r || gl._uploadedG !== gl.color.g || gl._uploadedB !== gl.color.b) {\n        this.glows.setColorAt(i, gl.color); colorDirty = true;\n        gl._uploadedR = gl.color.r; gl._uploadedG = gl.color.g; gl._uploadedB = gl.color.b;\n      }",
      1
    ],
    [
      "    this.glows.instanceMatrix.needsUpdate = true; this.glows.instanceColor.needsUpdate = true;",
      "    this.glows.instanceMatrix.needsUpdate = true; if (colorDirty) this.glows.instanceColor.needsUpdate = true;",
      1
    ]
  ],
  "src/game/weapons.js": [
    [
      "import { constrainMuzzle } from '../../patches/splatoon3/runtime/camera-aim-controls.mjs';",
      "import { recordGhostPush, retireGhostRound, clearGhostIndex } from '../../patches/network-replication/ghost-live-index.mjs';\nimport { constrainMuzzle } from '../../patches/splatoon3/runtime/camera-aim-controls.mjs';",
      1
    ],
    [
      "    this.list = [];",
      "    this.list = [];\n    this._queueGhostLifecycle = true;",
      1
    ],
    [
      "    this.list.push(p);",
      "    this.list.push(p);\n    recordGhostPush(this, p);",
      2
    ],
    [
      "  _recycle(p) {",
      "  _recycle(p) {\n    retireGhostRound(this, p);",
      1
    ],
    [
      "  clear() {\n    this.projectileVisuals.clear();",
      "  clear() {\n    clearGhostIndex(this);\n    this.projectileVisuals.clear();",
      1
    ]
  ]
};
export function adaptQueueNetworkUi(rel, input) {
  let code = input;
  for (const [before, after, expected] of patches[rel] || []) {
    let connection = before, replacement = after;
    // Current main's earlier network owner already performs this exact prefix
    // compaction. Admit only that complete equivalent statement, never a loose
    // substring or an arbitrary already-transformed queue module.
    if (rel === 'src/net/netmatch.js' && before === '      if (consumed) p.events.splice(0, consumed);') {
      const original = code.split(before).length - 1, owned = code.split(after).length - 1;
      if (original + owned !== 1) throw new Error('INKWAVE network/UI queue conflict: remote event prefix owner');
      if (owned) connection = replacement = after;
    }
    if (rel === 'src/audio/audio.js' && before === '    v.ondispose = () => { voice.done = true; };') {
      const currentOwner = `    v.ondispose = () => {
      voice.done = true;
      // Release finished nodes without waiting for this sound ID to play again.
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
      const owners = this.byName.get(name);
      if (owners) {
        const j = owners.indexOf(voice);
        if (j >= 0) owners.splice(j, 1);
        if (!owners.length && this.byName.get(name) === owners) this.byName.delete(name);
      }
    };`;
      const original = code.split(before).length - 1, owned = code.split(currentOwner).length - 1;
      if (original + owned !== 1) throw new Error('INKWAVE network/UI queue conflict: completed one-shot owner');
      // The earlier emitter adapter keys by sound plus emitter identity. Close
      // over its actual list/key rather than main's unqualified sound name.
      if (owned) connection = currentOwner;
    }
    if (rel === 'src/audio/audio.js' && before === '    for (const vc of this.voices) this._steal(vc, now);') {
      const snapshotOwner = '    for (const vc of [...this.voices]) this._steal(vc, now);';
      const original = code.split(before).length - 1, owned = code.split(snapshotOwner).length - 1;
      if (original + owned !== 1) throw new Error('INKWAVE network/UI queue conflict: stopAll voice owner');
      if (owned) connection = snapshotOwner;
    }
    // Current main captures constructor listeners in the earlier platform
    // layer. Preserve that owner (Game.disposePlatform calls it), and let the
    // explicit Input.dispose API delegate to the same lifetime exactly once.
    if (rel === 'src/core/input.js' && before.startsWith('  constructor(canvas) {')) {
      const listeners = [...before.matchAll(/\b(window|document)\.addEventListener\(/g)];
      if (listeners.length !== 10) throw new Error('INKWAVE network/UI queue conflict: input original listener inventory');
      const platform = before.replace(/\b(window|document)\.addEventListener\(/g, 'this._listenPlatform($1, ');
      const original = code.split(before).length - 1, owned = code.split(platform).length - 1;
      if (original + owned !== 1) throw new Error('INKWAVE network/UI queue conflict: input constructor listener owner');
      if (owned) {
        connection = platform;
        replacement = platform.replace('    this.canvas = canvas;', '    this.canvas = canvas;\n    this._inputUnsubs = []; this._disposed = false;');
      }
    }
    const count = code.split(connection).length - 1;
    if (count !== expected) throw new Error('INKWAVE network/UI queue conflict (' + rel + '): expected ' + expected + ' anchors, found ' + count + ': ' + connection.slice(0, 70));
    code = code.split(connection).join(replacement);
  }
  return code;
}
