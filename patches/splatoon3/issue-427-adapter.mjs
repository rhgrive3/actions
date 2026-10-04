// Cross-owner confirmed combat progression (Flow and s3.splatsThisLife/QuickRespawn).
// Issue #427 narrow build-only adapter.
// Standalone progression uses narrow confirmation ACK for owner's pending hit.
// Authoritative victim-confirmed accepted damage/killed is eligible.
// Emits scoped 'combat:confirmed' and 'combat:terminal' events consumed by Flow and gear handlers.

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-427 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptIssue427(rel, code) {
  if (rel === 'src/net/netmatch.js') code = adaptIssue427Net(code);
  else if (rel === 'patches/splatoon3/runtime/flow.mjs') code = adaptIssue427Flow(code);
  else if (rel === 'patches/splatoon3/runtime/gear.mjs') code = adaptIssue427Gear(code);
  return code;
}

function adaptIssue427Net(code) {
  const patch = (before, after, label) => {
    code = replaceOnce(code, before, after, 'issue-427 net: ' + label);
  };

  // Track pending hit on shooter owner when sending cross-owner hit, binding observed victim life
  if (code.includes("h: (this._hitSeq = (this._hitSeq ?? 0) + 1),")) {
    patch(
      "  sendHit(attacker, victim, dmg, wid) {\n    if (victim.owner === this.myId) return false;\n    this.s.tr?.sendTo(victim.owner, { k: 'hit', v: victim.nid, a: attacker.nid, l: victim.netLife, h: (this._hitSeq = (this._hitSeq ?? 0) + 1), d: r2(dmg), w: wid });\n    return true;\n  }",
      "  sendHit(attacker, victim, dmg, wid) {\n    if (victim.owner === this.myId) return false;\n    const h = (this._hitSeq = (this._hitSeq ?? 0) + 1);\n    (this._pendingHits || (this._pendingHits = new Map())).set(h, { a: attacker.nid, v: victim.nid, vo: victim.owner, vl: victim.netLife ?? 0, al: attacker.netLife ?? 0, ao: attacker.owner, w: wid, d: dmg });\n    if (this._pendingHits.size > 120) this._pendingHits.delete(this._pendingHits.keys().next().value);\n    this.s.tr?.sendTo(victim.owner, { k: 'hit', v: victim.nid, a: attacker.nid, l: victim.netLife, h, d: r2(dmg), w: wid });\n    return true;\n  }",
      'track pending hit'
    );
  }

  // Victim owner captures actual accepted damage and killed state during applyHit and sends ACK with victim life
  patch(
    "    const applying = this._applyingHit;\n    this._applyingHit = true;\n    try { G.projectiles?.applyHit(atk, v, d.d, d.w); }\n    finally { this._applyingHit = applying; }",
    "    const applying = this._applyingHit;\n    this._applyingHit = true;\n    let acceptedDmg = 0, killed = false;\n    const unDmg = on('damage', ev => { if (ev.victim === v && ev.attacker === atk) acceptedDmg += ev.amount; });\n    const unSplat = on('splatted', ev => { if (ev.victim === v && ev.attacker === atk) killed = true; });\n    try { G.projectiles?.applyHit(atk, v, d.d, d.w); }\n    finally {\n      unDmg();\n      unSplat();\n      this._applyingHit = applying;\n    }\n    this.s.tr?.sendTo(from ?? atk.owner, { k: 'hit_ack', h: d.h, v: v.nid, a: atk.nid, d: r2(acceptedDmg), kld: killed ? 1 : 0, vl: v.netLife ?? 0 });",
    'victim send hit_ack'
  );

  // Route hit_ack in onMessage
  patch(
    "      case 'bhit': if (this.isHost) this.match?.boss?.remoteHit(d); break;",
    "      case 'hit_ack': this._hitAck(d, from); break;\n      case 'bhit': if (this.isHost) this.match?.boss?.remoteHit(d); break;",
    'route hit_ack'
  );

  // Terminal notification for assistants on remote splat
  patch(
    "    // your own kills: the confirm sting / marker (the hit that did it was only a prediction)\n    if (attacker && !attacker.remote) emit('hit', { attacker, victim, damage: 0, killed: true, weaponId: cause });",
    "    // your own kills: the confirm sting / marker (the hit that did it was only a prediction)\n    if (attacker && !attacker.remote) emit('hit', { attacker, victim, damage: 0, killed: true, weaponId: cause });\n    emit('combat:terminal', { victim, attacker });",
    'terminal assist event'
  );

  // Clear pending hits on reconnect/dispose/handoff
  patch(
    "  dispose() {\n    for (const u of this.unsubs) u();",
    "  dispose() {\n    this._pendingHits?.clear();\n    for (const u of this.unsubs) u();",
    'clear pending on dispose'
  );
  patch(
    "  _ownership() { /* reserved: explicit transfers */ }",
    "  _ownership() { this._pendingHits?.clear(); }",
    'clear pending on handoff'
  );
  patch(
    "  bind(match) {\n    this.match = match;",
    "  bind(match) {\n    this._pendingHits?.clear();\n    this.match = match;",
    'clear pending on bind'
  );

  // Clear pending hits on local actor death/respawn
  patch(
    "  _onLocalEvent(name, e) {\n    const a = e.actor || e.victim;\n    if (!a || a.remote || a.nid === undefined || G.netm !== this) return;\n    this._rec(['ev', name, packEvent(e)]);\n  }",
    "  _onLocalEvent(name, e) {\n    const a = e.actor || e.victim;\n    if (!a || a.remote || a.nid === undefined || G.netm !== this) return;\n    if ((name === 'splatted' || name === 'respawn') && this._pendingHits) {\n      for (const [h, p] of this._pendingHits) if (p.a === a.nid) this._pendingHits.delete(h);\n    }\n    this._rec(['ev', name, packEvent(e)]);\n  }",
    'clear pending on local actor death/respawn'
  );

  // Implement strictly-validated _hitAck handler with per-pending-request once semantics
  patch(
    "  // ---- host clock / state / result",
    `  _hitAck(d, from) {
    if (!d || typeof d !== 'object') return;
    const h = d.h;
    if (!Number.isSafeInteger(h) || h < 1) return;
    const pending = this._pendingHits?.get(h);
    if (!pending) return;
    if (from === undefined || from !== pending.vo) return;
    if (d.v !== pending.v || d.a !== pending.a) return;
    if (!Number.isSafeInteger(d.vl) || d.vl < 0 || d.vl !== pending.vl) return;
    if (typeof d.d !== 'number' || !Number.isFinite(d.d) || d.d < 0) return;
    if (d.kld !== 0 && d.kld !== 1) return;
    const v = this.byNid.get(d.v);
    if (!v || v.owner !== from || v.owner !== pending.vo) return;
    const atk = this.byNid.get(d.a);
    if (!atk || atk.remote || atk.owner !== this.myId || atk.owner !== pending.ao) return;
    if (atk.netLife !== pending.al) return;
    if (!atk.alive) return;
    this._pendingHits.delete(h);
    if (d.d === 0 && d.kld === 0) return;
    emit('combat:confirmed', { attacker: atk, victim: v, damage: d.d, killed: d.kld === 1, weaponId: pending.w });
  }

  // ---- host clock / state / result`,
    '_hitAck handler'
  );

  return code;
}

function adaptIssue427Flow(code) {
  const patch = (before, after, label) => {
    code = replaceOnce(code, before, after, 'issue-427 flow: ' + label);
  };
  patch(
    "  on('damage', ({ victim, attacker, amount, source }) => {\n    if (!attacker || attacker === victim || source === 'ink' || victim.team === attacker.team) return;\n    const map = credits.get(victim) || new Map(); map.set(attacker, G.time); credits.set(victim, map);\n    award(attacker, 'damage', amount);\n  });\n  on('splatted', ({ victim, attacker }) => {\n    if (attacker && attacker !== victim && attacker.team !== victim.team) award(attacker, 'splat', 1);\n    for (const [helper, time] of credits.get(victim) || []) if (helper !== attacker && G.time - time <= cfg.assistWindow) award(helper, 'assist', 1);\n    credits.delete(victim); victim.s3 ||= {}; victim.s3.flow = createFlow();\n  });",
    "  on('damage', ({ victim, attacker, amount, source }) => {\n    if (!attacker || attacker === victim || source === 'ink' || victim.team === attacker.team) return;\n    const map = credits.get(victim) || new Map(); map.set(attacker, G.time); credits.set(victim, map);\n    if (!attacker.remote) award(attacker, 'damage', amount);\n  });\n  on('splatted', ({ victim, attacker }) => {\n    if (attacker && !attacker.remote && attacker !== victim && attacker.team !== victim.team) award(attacker, 'splat', 1);\n    for (const [helper, time] of credits.get(victim) || []) if (helper !== attacker && G.time - time <= cfg.assistWindow && !helper.remote) award(helper, 'assist', 1);\n    credits.delete(victim); victim.s3 ||= {}; victim.s3.flow = createFlow();\n  });\n  on('combat:confirmed', ({ attacker, victim, damage, killed }) => {\n    if (!attacker || attacker.remote || attacker === victim || attacker.team === victim?.team) return;\n    if (damage > 0) {\n      const map = credits.get(victim) || new Map(); map.set(attacker, G.time); credits.set(victim, map);\n      award(attacker, 'damage', damage);\n    }\n    if (killed) {\n      award(attacker, 'splat', 1);\n      for (const [helper, time] of credits.get(victim) || []) if (helper !== attacker && G.time - time <= cfg.assistWindow && !helper.remote) award(helper, 'assist', 1);\n      credits.delete(victim);\n    }\n  });\n  on('combat:terminal', ({ victim, attacker }) => {\n    if (!victim) return;\n    for (const [helper, time] of credits.get(victim) || []) if (helper !== attacker && G.time - time <= cfg.assistWindow && !helper.remote) award(helper, 'assist', 1);\n    credits.delete(victim);\n  });",
    'flow remote proxy isolation, combat:confirmed and combat:terminal listeners'
  );
  return code;
}

function adaptIssue427Gear(code) {
  const patch = (before, after, label) => {
    code = replaceOnce(code, before, after, 'issue-427 gear: ' + label);
  };
  patch(
    "  api.on('splatted', ({ attacker }) => { if (attacker?.s3) attacker.s3.splatsThisLife = (attacker.s3.splatsThisLife || 0) + 1; });",
    "  api.on('splatted', ({ attacker }) => { if (attacker && !attacker.remote && attacker?.s3) attacker.s3.splatsThisLife = (attacker.s3.splatsThisLife || 0) + 1; });\n  api.on('combat:confirmed', ({ attacker, killed }) => { if (killed && attacker && !attacker.remote && attacker?.s3) attacker.s3.splatsThisLife = (attacker.s3.splatsThisLife || 0) + 1; });",
    'gear remote proxy isolation and combat:confirmed listener'
  );
  return code;
}
