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

  // Preserve the current payload (precision, damage group and later sidecars).
  // Only take ownership of the existing sequence expression and pending receipt.
  const sequence = "h: (this._hitSeq = (this._hitSeq ?? 0) + 1),";
  if (code.includes(sequence)) {
    patch('    if (victim.owner === this.myId) return false;',
      `    if (victim.owner === this.myId) return false;
    const h = (this._hitSeq = (this._hitSeq ?? 0) + 1);
    (this._pendingHits || (this._pendingHits = new Map())).set(h, { a: attacker.nid, v: victim.nid, vo: victim.owner, vl: victim.netLife ?? 0, al: attacker.netLife ?? 0, ao: attacker.owner, w: wid, d: dmg });
    if (this._pendingHits.size > 120) this._pendingHits.delete(this._pendingHits.keys().next().value);`,
      'track pending hit');
    patch(sequence, 'h,', 'pending sequence uses existing payload');
  }

  // Keep the existing grouped/ungrouped damage call intact inside the ACK scope.
  const applyHitCall = code.includes('G.projectiles?.applyHit(atk, v, d.d, d.w, d.g);')
    ? 'G.projectiles?.applyHit(atk, v, d.d, d.w, d.g);'
    : 'G.projectiles?.applyHit(atk, v, d.d, d.w);';
  patch(
    "    const applying = this._applyingHit;\n    this._applyingHit = true;\n    try { " + applyHitCall + " }\n    finally { this._applyingHit = applying; }",
    `    const applying = this._applyingHit;
    this._applyingHit = true;
    let acceptedDmg = 0, killed = false;
    const unDmg = on('damage', ev => { if (ev.victim === v && ev.attacker === atk) acceptedDmg += ev.amount; });
    const unSplat = on('splatted', ev => { if (ev.victim === v && ev.attacker === atk) killed = true; });
    try { ${applyHitCall} }
    finally {
      unDmg();
      unSplat();
      this._applyingHit = applying;
    }
    this.s.tr?.sendTo(from ?? atk.owner, { k: 'hit_ack', h: d.h, v: v.nid, a: atk.nid, d: r2(acceptedDmg), kld: killed ? 1 : 0, vl: v.netLife ?? 0 });`,
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
    "    // your own kills: the confirm sting / marker (the hit that did it was only a prediction)\n    if (attacker && !attacker.remote) emit('hit', { attacker, victim, damage: 0, killed: true, weaponId: cause });\n    emit('combat:terminal', { victim, attacker, victimLife: victim.netLife ?? 0 });",
    'terminal assist event'
  );

  // Append retirement after the live owner's complete reset, preserving other fields.
  const respawnOpen = '  _remoteRespawn(a) {';
  const respawnStart = code.indexOf(respawnOpen);
  const respawnEnd = code.indexOf('\n  }\n', respawnStart);
  if (respawnStart < 0 || respawnEnd < respawnStart || code.indexOf(respawnOpen, respawnStart + respawnOpen.length) >= 0)
    throw new Error('INKWAVE issue-427 patch conflict (remote respawn boundary)');
  const respawnMethod = code.slice(respawnStart, respawnEnd + 4);
  patch(respawnMethod,
    respawnMethod.slice(0, -4) + `
    if (this._pendingHits) {
      for (const [h, p] of this._pendingHits) if (p.v === a.nid) this._pendingHits.delete(h);
    }
    emit('combat:respawn', { actor: a });
  }`, 'clean pending on remote respawn');

  // Clear pending hits on reconnect/dispose
  // Keep the native dispose() opening intact for the later network-replication
  // adapter, which inserts ghost retirement at that exact boundary.
  patch(
    "    for (const u of this.unsubs) u();",
    "    for (const u of this.unsubs) u();\n    this._pendingHits?.clear();",
    'clear pending on dispose'
  );
  patch(
    "  bind(match) {\n    this.match = match;",
    "  bind(match) {\n    this._pendingHits?.clear();\n    this.match = match;",
    'clear pending on bind'
  );

  // Clear pending hits on local actor death/respawn
  patch(
    "  _onLocalEvent(name, e) {\n    const a = e.actor || e.victim;\n    if (!a || a.remote || a.nid === undefined || G.netm !== this) return;\n    this._rec(['ev', name, packEvent(e)]);\n  }",
    "  _onLocalEvent(name, e) {\n    const a = e.actor || e.victim;\n    if (!a || a.remote || a.nid === undefined || G.netm !== this) return;\n    if ((name === 'splatted' || name === 'respawn') && this._pendingHits) {\n      for (const [h, p] of this._pendingHits) if (p.a === a.nid || p.v === a.nid) this._pendingHits.delete(h);\n    }\n    this._rec(['ev', name, packEvent(e)]);\n  }",
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
    if (v.netLife !== undefined && v.netLife > pending.vl) return;
    const atk = this.byNid.get(d.a);
    if (!atk || atk.remote || atk.owner !== this.myId || atk.owner !== pending.ao) return;
    if (atk.netLife !== pending.al) return;
    if (!atk.alive) return;
    this._pendingHits.delete(h);
    if (d.d === 0 && d.kld === 0) return;
    emit('combat:confirmed', { attacker: atk, victim: v, damage: d.d, killed: d.kld === 1, weaponId: pending.w, victimLife: pending.vl, helperLife: pending.al });
  }

  // ---- host clock / state / result`,
    '_hitAck handler'
  );

  return code;
}

function adaptCurrentFlow427(code) {
  const patch = (before, after, label) => { code = replaceOnce(code, before, after, 'issue-427 current flow: ' + label); };
  patch('credits = new WeakMap(), respawning = new WeakMap();', 'credits = new WeakMap(), respawning = new WeakMap(), terminals = new WeakMap();', 'owner terminal storage');
  patch('    if (!a?.alive || a.isBot && cfg.bots === false || G.match?.attract) return;', '    if (a?.remote || !a?.alive || a.isBot && cfg.bots === false || G.match?.attract) return;', 'local progression only');
  patch('    credits.delete(this);', '    credits.delete(this); terminals.delete(this);', 'reset terminal history');
  patch('    const map = credits.get(victim) || new Map(); map.set(attacker, G.time); credits.set(victim, map);', '    const map = credits.get(victim) || new Map(); map.set(attacker, { time: G.time, victimLife: victim?.netLife ?? 0, helperLife: attacker.netLife ?? 0 }); credits.set(victim, map);', 'credit epochs');
  if (code.includes('    const life = splatLife(victim);')) {
    patch("    const hostile = !!(attacker && attacker !== victim && attacker.team !== victim.team);",
      "    const hostile = !!(attacker && attacker !== victim && attacker.team !== victim.team);\n    const term = terminal427(victim, attacker, victim?.netLife ?? 0);",
      'deduped terminal state');
    patch("      award(attacker, 'splat', 1);", "      splat427(attacker, victim, term);", 'deduped local terminal splat');
  } else {
    patch("    if (attacker && attacker !== victim && attacker.team !== victim.team) award(attacker, 'splat', 1);",
      "    const term = terminal427(victim, attacker, victim?.netLife ?? 0);\n    splat427(attacker, victim, term);",
      'local terminal splat');
  }
  patch('const candidates = Array.isArray(event.assists) ? event.assists :', 'const candidates = Array.isArray(event.assists) ? event.assists.filter(helper => validAssist427(helper, victim, event)) :', 'authoritative assist still requires current local credit life');
  patch("[...(credits.get(victim) || [])].filter(([, credit]) => G.time - (typeof credit === 'number' ? credit : credit.time) <= cfg.assistWindow).map(([helper]) => helper);", '[...(credits.get(victim) || [])].filter(([helper, credit]) => validCredit427(helper, victim, credit)).map(([helper]) => helper);', 'typed credit filtering');
  patch("      helper.stats.assists = (helper.stats.assists || 0) + 1;\n      award(helper, 'assist', assistValue(helper, victim));\n      emit('actor:assist', { actor: helper, victim, attacker });", '      assist427(helper, victim, attacker, term);', 'one assist owner');
  patch('    penalizeFlowDeath(state(victim), cause, cfg);', '    if (!victim.remote) penalizeFlowDeath(state(victim), cause, cfg);', 'keep local death progress');
  const helpers = `  function terminal427(victim, attacker, life) {
    if (!victim || life !== (victim.netLife ?? 0)) return null;
    const deaths = Number.isFinite(victim.stats?.deaths) ? victim.stats.deaths : 0;
    // A network actor is identified by its authoritative netLife across owner
    // adoption and replay; local death counters must not create a second award.
    // Legacy/offline actors without netLife retain the normalized death fallback.
    // _remoteSplat increments stats.deaths before replay listeners run. A local
    // prediction for that same death therefore observes N while owner replay
    // observes N+1. Normalize the dead remote actor back to its pre-death epoch;
    // after _remoteRespawn the next accepted death advances this value by one.
    const deathEpoch = victim.remote ? Math.max(0, deaths - (victim.alive === false ? 1 : 0)) : deaths;
    const epoch = Number.isFinite(victim.netLife)
      ? 'life:' + String(life)
      : (victim.remote ? 'remote:' : 'offline:') + String(deathEpoch);
    let term = terminals.get(victim);
    if (!term || term.epoch !== epoch) {
      term = { epoch, life, time: G.time, killer: attacker, assisted: new Set(), splatAwarded: false };
      terminals.set(victim, term);
    }
    return term;
  }
  function validAssist427(helper, victim, event) {
    if (!helper) return false;
    if (event.assistLives !== undefined) {
      const lives = event.assistLives;
      if (!lives || typeof lives !== 'object' || Array.isArray(lives) || !Object.hasOwn(lives, helper.nid)) return false;
      const life = lives[helper.nid];
      return Number.isSafeInteger(life) && life >= 0 && life === (helper.netLife ?? 0);
    }
    // Legacy packets carry no helper epoch. Existing local accepted credit is
    // usable; otherwise a later validated ACK can complete the terminal award.
    return validCredit427(helper, victim, credits.get(victim)?.get(helper));
  }
  function validCredit427(helper, victim, credit) {
    if (credit == null) return false;
    const time = typeof credit === 'number' ? credit : credit.time;
    return G.time >= time && G.time - time <= cfg.assistWindow &&
      (typeof credit === 'number' || (credit.victimLife === (victim.netLife ?? 0) && credit.helperLife === (helper.netLife ?? 0)));
  }
  function assist427(helper, victim, attacker, term) {
    if (!term || !helper || helper.remote || helper === attacker || helper === victim || helper.team !== attacker?.team || term.assisted.has(helper)) return;
    term.assisted.add(helper);
    helper.stats.assists = (helper.stats.assists || 0) + 1;
    award(helper, 'assist', assistValue(helper, victim));
    emit('actor:assist', { actor: helper, victim, attacker });
  }
  function splat427(attacker, victim, term) {
    if (!term || !attacker?.alive || attacker.remote || term.splatAwarded || attacker === victim || attacker.team === victim.team || G.match?.attract) return;
    term.splatAwarded = true;
    // Kept as a single build hook for #481's consecutive-splat owner.
    if (attacker && attacker !== victim && attacker.team !== victim.team) award(attacker, 'splat', 1);
  }
  function terminalAssists427(victim, attacker, term) {
    for (const [helper, credit] of credits.get(victim) || []) if (validCredit427(helper, victim, credit)) assist427(helper, victim, attacker, term);
  }
  on('combat:terminal', ({ victim, attacker, victimLife }) => {
    const term = terminal427(victim, attacker, victimLife ?? victim?.netLife ?? 0);
    if (!term) return;
    terminalAssists427(victim, attacker, term);
    credits.delete(victim);
  });
  on('combat:confirmed', ({ attacker, victim, damage, killed, victimLife, helperLife }) => {
    if (!attacker || attacker.remote || !victim || attacker === victim || attacker.team === victim.team ||
      (victimLife ?? victim.netLife ?? 0) !== (victim.netLife ?? 0) ||
      (helperLife ?? attacker.netLife ?? 0) !== (attacker.netLife ?? 0)) return;
    if (damage > 0) {
      award(attacker, 'damage', damage);
      const term = terminals.get(victim);
      if (term && term.life === (victim.netLife ?? 0) && !killed && attacker !== term.killer && Math.abs(G.time - term.time) <= cfg.assistWindow) assist427(attacker, victim, term.killer, term);
      else if (!killed) {
        const map = credits.get(victim) || new Map(); map.set(attacker, { time: G.time, victimLife: victim.netLife ?? 0, helperLife: attacker.netLife ?? 0 }); credits.set(victim, map);
      }
    }
    if (killed) {
      const term = terminal427(victim, attacker, victimLife ?? victim.netLife ?? 0);
      splat427(attacker, victim, term); terminalAssists427(victim, attacker, term); credits.delete(victim);
    }
  });
  for (const event of ['respawn', 'combat:respawn']) on(event, ({ actor }) => { if (actor) { credits.delete(actor); terminals.delete(actor); } });
`;
  patch("  on('turf', ({ actor, area }) => award(actor, 'turf', area));", helpers + "  on('turf', ({ actor, area }) => award(actor, 'turf', area));", 'confirmed owner listeners');
  return code;
}

function adaptIssue427Flow(code) {
  if (code.includes('credits = new WeakMap(), respawning = new WeakMap();')) return adaptCurrentFlow427(code);
  const patch = (before, after, label) => {
    code = replaceOnce(code, before, after, 'issue-427 flow: ' + label);
  };
  patch(
    "  const cfg = tuning.flow, credits = new WeakMap();",
    "  const cfg = tuning.flow, credits = new WeakMap(), terminals = new WeakMap();",
    'flow credits and terminals maps'
  );
  patch(
    "  Actor.prototype.reset = function (...args) { const result = reset.apply(this, args); this.s3 ||= {}; this.s3.flow = createFlow(); credits.delete(this); return result; };",
    "  Actor.prototype.reset = function (...args) { const result = reset.apply(this, args); this.s3 ||= {}; this.s3.flow = createFlow(); credits.delete(this); terminals.delete(this); return result; };",
    'flow clean credits and terminals on reset'
  );
  patch(
    "  on('damage', ({ victim, attacker, amount, source }) => {\n    if (!attacker || attacker === victim || source === 'ink' || victim.team === attacker.team) return;\n    const map = credits.get(victim) || new Map(); map.set(attacker, G.time); credits.set(victim, map);\n    award(attacker, 'damage', amount);\n  });\n  on('splatted', ({ victim, attacker }) => {\n    if (attacker && attacker !== victim && attacker.team !== victim.team) award(attacker, 'splat', 1);\n    for (const [helper, time] of credits.get(victim) || []) if (helper !== attacker && G.time - time <= cfg.assistWindow) award(helper, 'assist', 1);\n    credits.delete(victim); victim.s3 ||= {}; victim.s3.flow = createFlow();\n  });",
    `  on('damage', ({ victim, attacker, amount, source }) => {
    if (!attacker || attacker === victim || source === 'ink' || victim.team === attacker.team) return;
    const vl = victim?.netLife ?? 0;
    const hl = attacker?.netLife ?? 0;
    const map = credits.get(victim) || new Map();
    map.set(attacker, { time: G.time, victimLife: vl, helperLife: hl });
    credits.set(victim, map);
    if (!attacker.remote) award(attacker, 'damage', amount);
  });
  on('splatted', ({ victim, attacker }) => {
    if (attacker && !attacker.remote && attacker !== victim && attacker.team !== victim.team) award(attacker, 'splat', 1);
    const vl = victim?.netLife ?? 0;
    const term = { time: G.time, killer: attacker, victimLife: vl, assisted: new Set() };
    if (victim) terminals.set(victim, term);
    for (const [helper, cred] of (victim && credits.get(victim)) || []) {
      const cTime = typeof cred === 'number' ? cred : cred.time;
      const cLife = typeof cred === 'object' && cred.victimLife !== undefined ? cred.victimLife : vl;
      const hLife = typeof cred === 'object' && cred.helperLife !== undefined ? cred.helperLife : (helper.netLife ?? 0);
      if (helper !== attacker && cLife === vl && (helper.netLife ?? 0) === hLife && G.time - cTime <= cfg.assistWindow && !helper.remote && helper.alive) {
        award(helper, 'assist', 1);
        term.assisted.add(helper);
      }
    }
    if (victim) { credits.delete(victim); victim.s3 ||= {}; victim.s3.flow = createFlow(); }
  });
  on('combat:terminal', ({ victim, attacker, victimLife }) => {
    if (!victim) return;
    const vl = victimLife ?? victim.netLife ?? 0;
    const term = { time: G.time, killer: attacker, victimLife: vl, assisted: new Set() };
    terminals.set(victim, term);
    for (const [helper, cred] of credits.get(victim) || []) {
      const cTime = typeof cred === 'number' ? cred : cred.time;
      const cLife = typeof cred === 'object' && cred.victimLife !== undefined ? cred.victimLife : vl;
      const hLife = typeof cred === 'object' && cred.helperLife !== undefined ? cred.helperLife : (helper.netLife ?? 0);
      if (helper !== attacker && cLife === vl && (helper.netLife ?? 0) === hLife && G.time - cTime <= cfg.assistWindow && !helper.remote && helper.alive && !term.assisted.has(helper)) {
        award(helper, 'assist', 1);
        term.assisted.add(helper);
      }
    }
    credits.delete(victim);
  });
  on('combat:confirmed', ({ attacker, victim, damage, killed, victimLife, helperLife }) => {
    if (!attacker || attacker.remote || attacker === victim || attacker.team === victim?.team) return;
    const vl = victimLife ?? victim?.netLife ?? 0;
    const hl = helperLife ?? attacker?.netLife ?? 0;
    if (damage > 0) {
      award(attacker, 'damage', damage);
      const term = victim ? terminals.get(victim) : null;
      if (term && term.victimLife === vl && !killed && attacker !== term.killer && !term.assisted.has(attacker)) {
        if (Math.abs(G.time - term.time) <= cfg.assistWindow && attacker.alive && (attacker.netLife ?? 0) === hl) {
          award(attacker, 'assist', 1);
          term.assisted.add(attacker);
        }
      } else if (!killed && victim) {
        const map = credits.get(victim) || new Map();
        map.set(attacker, { time: G.time, victimLife: vl, helperLife: hl });
        credits.set(victim, map);
      }
    }
    if (killed) {
      award(attacker, 'splat', 1);
      const term = (victim && terminals.get(victim)) || { time: G.time, killer: attacker, victimLife: vl, assisted: new Set() };
      term.killer = attacker;
      if (victim) terminals.set(victim, term);
      for (const [helper, cred] of (victim && credits.get(victim)) || []) {
        const cTime = typeof cred === 'number' ? cred : cred.time;
        const cLife = typeof cred === 'object' && cred.victimLife !== undefined ? cred.victimLife : vl;
        const hLife = typeof cred === 'object' && cred.helperLife !== undefined ? cred.helperLife : (helper.netLife ?? 0);
        if (helper !== attacker && cLife === vl && (helper.netLife ?? 0) === hLife && G.time - cTime <= cfg.assistWindow && !helper.remote && helper.alive && !term.assisted.has(helper)) {
          award(helper, 'assist', 1);
          term.assisted.add(helper);
        }
      }
      if (victim) credits.delete(victim);
    }
  });
  on('respawn', ({ actor }) => { if (actor) { credits.delete(actor); terminals.delete(actor); } });
  on('combat:respawn', ({ actor }) => { if (actor) { credits.delete(actor); terminals.delete(actor); } });`,
    'flow remote proxy isolation, bounded terminal state, and confirmed progression'
  );
  return code;
}

function adaptIssue427Gear(code) {
  const patch = (before, after, label) => {
    code = replaceOnce(code, before, after, 'issue-427 gear: ' + label);
  };
  const conditional = `  api.on('splatted', ({ attacker, victim }) => {
    if (attacker?.s3 && victim && attacker !== victim && attacker.team !== victim.team) {
      attacker.s3.splatsThisLife = (attacker.s3.splatsThisLife || 0) + 1;
      if (attacker.s3.quickRespawnHistory) attacker.s3.quickRespawnHistory.splats++;
    }
  });`;
  if (code.includes(conditional)) {
    const local = conditional.replace('attacker?.s3 && victim', 'attacker?.s3 && !attacker.remote && victim');
    const confirmed = local.replace("api.on('splatted', ({ attacker, victim })", "api.on('combat:confirmed', ({ attacker, victim, killed })")
      .replace('if (attacker?.s3', 'if (killed && attacker?.s3');
    patch(conditional, local + '\n' + confirmed, 'current QR history local and confirmed ownership');
    return code;
  }
  patch(
    "  api.on('splatted', ({ attacker }) => { if (attacker?.s3) attacker.s3.splatsThisLife = (attacker.s3.splatsThisLife || 0) + 1; });",
    "  api.on('splatted', ({ attacker }) => { if (attacker && !attacker.remote && attacker?.s3) attacker.s3.splatsThisLife = (attacker.s3.splatsThisLife || 0) + 1; });\n  api.on('combat:confirmed', ({ attacker, killed }) => { if (killed && attacker && !attacker.remote && attacker?.s3) attacker.s3.splatsThisLife = (attacker.s3.splatsThisLife || 0) + 1; });",
    'gear remote proxy isolation and combat:confirmed listener'
  );
  return code;
}
