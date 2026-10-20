// #1665 / #1666: an owner-authenticated hit claim (`hit` to the victim's owner,
// `bhit` to the host for Boss Battle) must be backed by attack evidence the
// claimant's own ordered owner stream already produced: a projectile birth
// (`p`), a Charger beam fire event, a bomb/storm birth (`b`), a Special in
// progress, or Roller-type body contact. The ledger is built only from packets
// NetMatch itself accepted for that owner (sender, clock, sequence), is keyed
// by the attacker's equipped kit, and every receipt carries a lifetime, a
// bounded hit budget and (where the wire gives one) a reach around its origin.
//
// This is a bounded plausibility gate, NOT host/receiver simulation: a client
// that forges its own event stream consistently still passes (the existing
// "trusted peer channel" limit). What it rejects: claims with no attack at
// all, causes outside the attacker's equipped main/sub/special, damage beyond
// the equipped weapon's own implemented maximum, hits beyond the weapon reach
// carried by the receipt, and hit rates the observed attacks cannot supply.
// Line of sight/occlusion and exact trajectory are NOT verified.
//
// Unproven claims are not discarded at once: a hitscan hit reaches the victim
// before the attacker's next 20 Hz tick, so such claims wait <= 0.4 s for
// their evidence. Rejected/waiting claims reach none of the original handlers,
// so no hit/boss sequence watermark advances for them.
const PENDING_AGE = 0.4, MAX_PENDING = 32, MAX_RECEIPTS = 96;
const EVENT_PAST = 1.4, EVENT_FUTURE = 0.075;
const EVENT_RATE = 90;           // accepted evidence events per actor per second
const VICTIM_HITS_PER_RECEIPT = 3;
const FLAG = { rolling: 256, subAim: 2048, special: 8192 };
// Boss multipliers (boss.js BOSS.weak / BOSS.stunned) bound one boss claim.
const BOSS_WEAK = 2.5, BOSS_STUNNED = 1.25;
const GENERIC_MAIN = new Set(['shot', 'slosh', 'blast', 'drop', 'roller', 'brush-body']);
const GENERIC_SUB = new Set(['bomb', 'splat-bomb-far', 'torpedo-splash']);
const finite = Number.isFinite;
const vec3 = v => Array.isArray(v) && v.length === 3 && v.every(n => finite(n) && Math.abs(n) <= 4096);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const point = v => v && finite(v.x) && finite(v.y) && finite(v.z) ? [v.x, v.y, v.z] : null;

// Largest implemented damage figure of one weapon record: numeric leaves under
// top-level keys that mention damage/bands (arrays one level deep). Catalogue
// weapons register such records at runtime, so this follows the equipped
// weapon, never a fixed table. Raw source parameter blocks (catalogRecord,
// parameters) are in source units and are deliberately not read. Cached per record.
const ceilingCache = new WeakMap();
export function weaponDamageCeiling(weapon, fallback) {
  if (!weapon || typeof weapon !== 'object') return fallback;
  let max = ceilingCache.get(weapon);
  if (max === undefined) {
    max = 0;
    const take = (value, depth) => {
      if (typeof value === 'number') { if (finite(value) && value > max) max = value; }
      else if (depth < 2 && Array.isArray(value)) for (const inner of value) take(inner, depth + 1);
    };
    for (const [key, value] of Object.entries(weapon)) if (/damage|band/i.test(key)) take(value, 0);
    ceilingCache.set(weapon, max);
  }
  return max > 0 ? Math.min(fallback, max * 1.5 + 1) : fallback;
}

export function equippedKit(actor) {
  const w = actor?.weapon || {};
  return { mains: new Set([w.id, w.catalogRecord?.id, w.catalogId].filter(x => typeof x === 'string')), sub: w.sub, special: w.special, weapon: w };
}
// 'main' | 'sub' | 'special' | 'any' for a claimed cause, or null when the cause is
// a catalogue id / sub / special of ANOTHER kit (or unusable for this claim type).
// Raw family ids (shooter, blaster, roller, charger ...) and the projectile-type
// fallbacks are shared by every weapon of the family, so they stay allowed.
export function classifyCause(actor, cause, tables, { strict = false } = {}) {
  if (typeof cause !== 'string') return null;
  if (cause === 'crab') return 'any';
  const kit = equippedKit(actor);
  if (cause === kit.special) return 'special';
  if (cause === kit.sub) return 'sub';
  if (kit.mains.has(cause)) return 'main';
  if (GENERIC_MAIN.has(cause)) return 'main';
  if (GENERIC_SUB.has(cause)) return 'sub';
  if (tables.catalog(cause) || tables.subs.has(cause) || tables.specials.has(cause)) return null;
  if (tables.mains(cause)) return 'main';
  return strict ? null : 'any';
}
const KIND_FOR = { main: ['main', 'contact'], sub: ['sub'], special: ['special'], any: ['main', 'contact', 'sub', 'special'] };

function ledger(nm) { return nm._combatClaims ||= { actors: new Map(), pending: new Map(), stats: { ok: 0, wait: 0, reject: 0, reasons: Object.create(null) } }; }
function actorLedger(nm, nid) {
  const map = ledger(nm).actors;
  let a = map.get(nid);
  if (!a) map.set(nid, a = { receipts: [], standing: Object.create(null), window: [] });
  return a;
}
function ownedRemote(nm, from, nid) {
  const a = Number.isSafeInteger(nid) ? nm.byNid?.get(nid) : null;
  return a && a.remote && a.owner === from ? a : null;
}
function addReceipt(nm, actor, receipt, now) {
  const A = actorLedger(nm, actor.nid);
  // evidence events are rate bounded per actor: forging them is as costly as playing
  const w = A.window;
  while (w.length && now - w[0] > 1) w.shift();
  if (w.length >= EVENT_RATE) return false;
  w.push(now);
  A.receipts.push({ hits: new Map(), used: 0, ...receipt });
  if (A.receipts.length > MAX_RECEIPTS) A.receipts.splice(0, A.receipts.length - MAX_RECEIPTS);
  return true;
}
function standing(A, kind, now, pos, active, { rate, cap, ttl, reach }) {
  const s = A.standing[kind] ||= { tokens: 0, lastOn: -Infinity, until: -Infinity, pos: null, reach };
  if (active) {
    s.tokens = Math.min(cap, s.tokens + Math.min(0.25, Math.max(0, now - s.lastOn)) * rate);
    s.lastOn = now; s.until = now + ttl; s.pos = pos; s.reach = reach;
  }
}

// Called after NetMatch accepted tick `d` from `from`.
export function ingestTick(nm, from, d, now, tables) {
  if (Array.isArray(d.a)) for (const row of d.a) {
    const actor = Array.isArray(row) ? ownedRemote(nm, from, row[0]) : null;
    if (!actor || !Number.isSafeInteger(row[10]) || ![row[1], row[2], row[3]].every(finite)) continue;
    const A = actorLedger(nm, actor.nid), pos = [row[1], row[2], row[3]], f = row[10];
    standing(A, 'contact', now, pos, !!(f & FLAG.rolling), { rate: 6, cap: 6, ttl: 0.6, reach: 8 });
    standing(A, 'special', now, pos, !!(f & FLAG.special), { rate: 12, cap: 12, ttl: 1.5, reach: Infinity });
    standing(A, 'sub', now, pos, !!(f & FLAG.subAim), { rate: 4, cap: 8, ttl: 30, reach: 80 });
  }
  if (!Array.isArray(d.e) || !finite(d.ts)) return;
  for (let i = 0; i < Math.min(d.e.length, 256); i++) {
    const e = d.e[i];
    if (!Array.isArray(e) || !finite(e[0]) || e[0] > d.ts + EVENT_FUTURE || d.ts - e[0] > EVENT_PAST) continue;
    if (e[1] === 'p') {
      const actor = ownedRemote(nm, from, e[2]);
      if (!actor || !vec3(e.slice(5, 8)) || !vec3(e.slice(8, 11)) || ![e[11], e[12], e[14], e[15]].every(finite)) continue;
      const kit = equippedKit(actor), wid = e[4];
      const kind = wid === kit.sub ? 'sub' : wid === kit.special ? 'special' : 'main';
      if (kind === 'main' && typeof wid === 'string' && wid && !kit.mains.has(wid) && !GENERIC_MAIN.has(wid)
          && (tables.catalog(wid) || tables.subs.has(wid) || tables.specials.has(wid))) continue; // another kit's projectile
      const speed = Math.hypot(e[8], e[9], e[10]), delay = Math.max(0, e[11]), life = Math.max(0, e[12]);
      addReceipt(nm, actor, { kind, origin: e.slice(5, 8), reach: Math.min(400, 1.5 * speed * (delay + life) + Math.max(0, e[14]) + Math.max(0, e[15]) + 10),
        expires: now + delay + life + 0.5, credits: 6 }, now);
    } else if (e[1] === 'b') {
      const actor = ownedRemote(nm, from, e[2]);
      if (!actor || !vec3(e.slice(4, 7)) || !vec3(e.slice(7, 10))) continue;
      const storm = e[3] === 'storm', speed = Math.hypot(e[7], e[8], e[9]);
      addReceipt(nm, actor, { kind: storm ? 'special' : 'sub', origin: e.slice(4, 7), reach: storm ? Infinity : Math.min(150, 3 * speed + 14),
        expires: now + (storm ? 12 : 30), credits: storm ? 12 : 8 }, now);
    } else if (e[1] === 'ac' && (e[2] === 'sub' || e[2] === 'special')) {
      // Catalogue subs and specials announce themselves with an `ac` row (catalogue.mjs) instead of a `b` row. A quick tap
      // throw never shows the aim flag in a tick, so without this row its hits would find no evidence.
      const actor = ownedRemote(nm, from, e[3]), payload = e[5];
      if (!actor || !payload || typeof payload !== 'object') continue;
      const kit = equippedKit(actor), id = payload.subId ?? payload.id;
      if (typeof id === 'string' && id !== (e[2] === 'sub' ? kit.sub : kit.special)) continue;   // another kit's sub or special is not evidence
      addReceipt(nm, actor, e[2] === 'sub'
        ? { kind: 'sub', origin: null, reach: Infinity, expires: now + 30, credits: 8 }
        : { kind: 'special', origin: null, reach: Infinity, expires: now + 14, credits: 12 }, now);
    } else if (e[1] === 'ev' && typeof e[2] === 'string' && e[3] && typeof e[3] === 'object') {
      const actor = ownedRemote(nm, from, e[3].actor?.n);
      if (!actor) continue;
      if (e[2] === 'weapon:fire') {
        // Hitscan (Charger) carries its beam length; other mains are evidenced by their `p` births.
        if (!finite(e[3].len) || !vec3(e[3].muzzle)) continue;
        const kit = equippedKit(actor);
        if (e[3].weapon !== undefined && !kit.mains.has(e[3].weapon)) continue;
        addReceipt(nm, actor, { kind: 'main', origin: e[3].muzzle, reach: e[3].len + 8, expires: now + 1, credits: 6 }, now);
      } else if (e[2] === 'special:use' || e[2] === 'special:slam') {
        const origin = vec3(e[3].pos) ? e[3].pos : null;
        addReceipt(nm, actor, { kind: 'special', origin, reach: Infinity, expires: now + 14, credits: 12 }, now);
      }
    }
  }
}

function reasonCount(L, reason) { L.stats.reasons[reason] = (L.stats.reasons[reason] || 0) + 1; return reason; }

// target: { pos: [x,y,z], slack } ; claim: { actor, cause, damage, weak, victimKey, kind: 'pvp' | 'boss' | 'crab' }
export function admitClaim(nm, from, claim, now, tables, hooks = {}) {
  const L = ledger(nm), actor = claim.actor;
  const cls = classifyCause(actor, claim.cause, tables, { strict: claim.kind !== 'pvp' });
  if (!cls) return { verdict: 'reject', reason: reasonCount(L, 'cause-not-equipped') };
  const ceiling = hooks.ceiling(actor, cls);
  if (!(claim.damage <= ceiling + 1e-9)) return { verdict: 'reject', reason: reasonCount(L, 'damage-over-equipped-ceiling') };
  const A = ledger(nm).actors.get(actor.nid);
  const kinds = KIND_FOR[cls];
  let sawMatching = false;
  if (A) {
    for (const r of A.receipts) {
      if (!kinds.includes(r.kind) || r.expires < now) continue;
      sawMatching = true;
      if (r.used >= r.credits || (r.hits.get(claim.victimKey) || 0) >= VICTIM_HITS_PER_RECEIPT) continue;
      if (r.origin && finite(r.reach) && dist3(r.origin, claim.target) > r.reach + claim.slack) continue;
      r.used++; r.hits.set(claim.victimKey, (r.hits.get(claim.victimKey) || 0) + 1);
      L.stats.ok++;
      return { verdict: 'ok' };
    }
    for (const kind of kinds) {
      const s = A.standing[kind];
      if (!s || s.until < now) continue;
      sawMatching = true;
      if (s.tokens < 1) continue;
      if (s.pos && finite(s.reach) && dist3(s.pos, claim.target) > s.reach + claim.slack) continue;
      s.tokens -= 1; L.stats.ok++;
      return { verdict: 'ok' };
    }
  }
  // No usable evidence yet: it may be one tick behind (hitscan), or genuinely absent.
  return { verdict: sawMatching ? 'reject' : 'wait', reason: reasonCount(L, sawMatching ? 'evidence-exhausted-or-out-of-reach' : 'no-attack-evidence') };
}

export function installCombatClaims(NetMatch, deps) {
  const P = NetMatch.prototype, MARK = Symbol.for('inkwave.combat-claims.v1');
  if (P[MARK]) return;
  Object.defineProperty(P, MARK, { value: true });
  const { G, now, maxDamage } = deps;
  const W = deps.WEAPONS || {};
  const tables = { mains: id => Object.hasOwn(W, id), catalog: id => Object.hasOwn(W, id) && W[id]?.kind === 'catalog',
    subs: new Set(deps.subs || []), specials: new Set(deps.specials || []) };
  const ceiling = (actor, cls) => cls === 'main' ? weaponDamageCeiling(actor.weapon, maxDamage) : maxDamage;
  const oldTick = P._tick, oldHit = P._hit, oldBoss = P._acceptBossHit, oldLeave = P.onLeave, oldDispose = P.dispose;

  const retire = nm => { const L = nm._combatClaims; if (L) { L.actors.clear(); L.pending.clear(); } };
  const queue = (nm, from, item) => {
    const L = ledger(nm), list = L.pending.get(from) || [];
    if (list.length >= MAX_PENDING) list.shift();
    list.push(item); L.pending.set(from, list);
  };
  const pvpClaim = (nm, from, d) => {
    const attacker = nm.byNid?.get(d?.a), victim = nm.byNid?.get(d?.v);
    if (!attacker || !victim || !attacker.remote || attacker.owner !== from || victim.remote) return null; // original handler decides
    const target = point(victim.pos);
    if (!target) return null;
    return { kind: 'pvp', actor: attacker, cause: d.w, damage: d.d, weak: false, victimKey: victim.nid, target, slack: 8 };
  };
  const bossClaim = (nm, from, d) => {
    const boss = nm.match?.boss, attacker = nm.byNid?.get(d?.a);
    if (!boss?.sim || !attacker || !attacker.remote || attacker.owner !== from || !finite(d.d)) return null;
    const crab = d.c >= 0 ? boss.crabs?.get(d.c) : null;
    const target = crab ? [crab.x, crab.y, crab.z] : point(boss.pos);
    if (!target) return null;
    const mult = crab ? 1 : (d.weak === 1 ? BOSS_WEAK : 1) * (boss.stunned ? BOSS_STUNNED : 1);
    return { kind: crab ? 'crab' : 'boss', actor: attacker, cause: d.w, damage: d.d / mult, weak: d.weak === 1, victimKey: crab ? 'c' + d.c : 'boss', target, slack: crab ? 10 : 14 };
  };
  const decide = (nm, from, claim) => {
    try { return admitClaim(nm, from, claim, now(), tables, { ceiling }); }
    catch { return { verdict: 'ok' }; } // an internal defect must not silence legitimate play
  };

  P._tick = function (from, d) {
    const before = this.peers?.get(from)?.lastTs ?? -Infinity;
    const result = oldTick.call(this, from, d);
    const peer = this.peers?.get(from);
    if (peer && peer.lastTs === d?.ts && finite(d.ts) && d.ts > before) {
      const t = now();
      try { ingestTick(this, from, d, t, tables); } catch { /* evidence is advisory; never break replication */ }
      flush(this, from, t);
    }
    return result;
  };
  function flush(nm, from, t) {
    const L = nm._combatClaims, list = L?.pending.get(from);
    if (!list?.length) return;
    const keep = [];
    for (const item of list) {
      if (t - item.at > PENDING_AGE) { L.stats.reject++; reasonCount(L, 'no-attack-evidence-timeout'); continue; }
      const claim = item.type === 'pvp' ? pvpClaim(nm, from, item.d) : bossClaim(nm, from, item.d);
      if (!claim) continue;
      const r = decide(nm, from, claim);
      if (r.verdict === 'ok') {
        if (item.type === 'pvp') oldHit.call(nm, item.d, from);
        else if (oldBoss.call(nm, from, item.d)) nm.match.boss.remoteHit(item.d);
      } else if (r.verdict === 'wait') keep.push(item);
      else L.stats.reject++;
    }
    if (keep.length) L.pending.set(from, keep); else L.pending.delete(from);
  }
  P._hit = function (d, from) {
    if (from === undefined || from === this.myId) return oldHit.call(this, d, from);
    const claim = pvpClaim(this, from, d);
    if (!claim) return oldHit.call(this, d, from);
    const r = decide(this, from, claim), L = ledger(this);
    if (r.verdict === 'ok') return oldHit.call(this, d, from);
    if (r.verdict === 'wait') { L.stats.wait++; queue(this, from, { type: 'pvp', d, at: now() }); }
    else L.stats.reject++;
  };
  if (oldBoss) P._acceptBossHit = function (from, d) {
    if (from === undefined || from === this.myId) return oldBoss.call(this, from, d);
    const claim = bossClaim(this, from, d);
    if (!claim) return oldBoss.call(this, from, d);
    const weakOk = !(claim.weak && claim.kind === 'boss') || bossWeakPointExposed(this.match.boss);
    const r = weakOk ? decide(this, from, claim) : { verdict: 'reject', reason: reasonCount(ledger(this), 'weak-point-not-exposed') };
    const L = ledger(this);
    if (r.verdict === 'ok') return oldBoss.call(this, from, d);
    if (r.verdict === 'wait') { L.stats.wait++; queue(this, from, { type: 'boss', d, at: now() }); }
    else L.stats.reject++;
    return false;
  };
  P.onLeave = function (id, changed) {
    const L = this._combatClaims;
    if (L) { L.pending.delete(id); if (changed) retire(this); }
    return oldLeave.call(this, id, changed);
  };
  P.dispose = function (...args) { retire(this); this._combatClaims = null; return oldDispose.apply(this, args); };
}
// A weak-point hit needs an exposed weak shape on the host's authoritative boss
// (shapes unavailable => no restriction, so a model change cannot lock players out).
function bossWeakPointExposed(boss) {
  const shapes = boss?.model?.hitShapes;
  return !Array.isArray(shapes) || shapes.some(h => h?.active && h.weak);
}
