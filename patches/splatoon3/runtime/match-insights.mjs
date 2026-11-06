// Detailed result statistics (2026-11-05). Counts what this client actually
// simulates; nothing here changes gameplay.
//
//  attacks  - main-weapon attacks: one per 'weapon:fire' (a Brella volley, a
//             Blaster shell, a Charger release, a Roller flick each count 1).
//  landed   - attacks that produced at least one accepted damaging hit on an
//             enemy player. Projectile hits are attributed to the exact shot
//             that pushed the projectile (serial tagged at Projectiles._push,
//             read while that projectile is stepped or bursts). Non-projectile
//             main hits (Roller rolling, Splatana melee) count for the latest
//             attack of that actor.
//  hits     - accepted damaging main-weapon hits on enemy players (one shell
//             hitting two players is 2 hits, 1 landed attack).
//  damage   - accepted damage dealt to enemy players by any source.
//  subs     - sub weapons thrown/placed ('bomb:throw' for native bomb records,
//             'all:sub' spawn for the other sub owners).
// Kills, assists, deaths, specials and turf stay on Actor.stats (their
// existing owners). Remote proxies are not measured here: their attacks are
// simulated on their owner's client, so their fields are reported as null.

const INSTALLED = Symbol.for('inkwave.match-insights.v1');
const RECENT = 16;

export function blankInsights() {
  return { attacks: 0, landed: 0, hits: 0, damage: 0, subs: 0, serial: 0, landedSerials: [] };
}
export function insightsOf(actor) {
  if (!actor || actor.remote) return null;
  return actor.s3Insights || (actor.s3Insights = blankInsights());
}
export function resetInsights(actors) {
  for (const a of actors || []) if (a) a.s3Insights = a.remote ? null : blankInsights();
}
export function recordAttack(actor) {
  const s = insightsOf(actor);
  if (!s) return 0;
  s.attacks++; s.serial++;
  return s.serial;
}
export function recordSub(actor) {
  const s = insightsOf(actor);
  if (s) s.subs++;
}
/** One accepted damaging hit. `serial` is the attack it came from (0 = unknown -> latest). */
export function recordHit(attacker, victim, damage, weaponId, serial = 0) {
  const s = insightsOf(attacker);
  if (!s || !victim || victim.team === attacker.team || !(damage > 0)) return false;
  s.damage += damage;
  if (weaponId !== attacker.weaponId) return true;
  s.hits++;
  const shot = serial > 0 ? serial : s.serial;
  if (shot > 0 && !s.landedSerials.includes(shot)) {
    s.landed++;
    s.landedSerials.push(shot);
    if (s.landedSerials.length > RECENT) s.landedSerials.shift();
  }
  return true;
}

/** Plain row for the result screen. null fields: not measured on this client. */
export function summarizeInsights(actor) {
  const st = actor?.stats || {};
  const base = {
    splats: st.splats || 0, assists: st.assists || 0, deaths: st.deaths || 0,
    specials: st.specials || 0, turf: Math.round(st.turf || 0),
  };
  const s = actor && !actor.remote ? actor.s3Insights : null;
  if (!s) return { ...base, measured: false, attacks: null, landed: null, accuracy: null, hits: null, damage: null, subs: null };
  return {
    ...base, measured: true,
    attacks: s.attacks, landed: s.landed, hits: s.hits, damage: Math.round(s.damage), subs: s.subs,
    accuracy: s.attacks > 0 ? Math.min(1, s.landed / s.attacks) : null,
  };
}

export function installMatchInsights({ Projectiles, Match, on }) {
  const P = Projectiles?.prototype;
  if (!P || Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, { value: true });
  let current = null;
  const push = P._push;
  if (typeof push === 'function') P._push = function (p, ...rest) {
    const o = p?.owner;
    if (o && !p.ghost && !o.remote && p.wid === o.weaponId && o.s3Insights) p.s3ShotSerial = o.s3Insights.serial;
    return push.call(this, p, ...rest);
  };
  for (const name of ['_step', '_blastBurst']) {
    const native = P[name];
    if (typeof native !== 'function') continue;
    P[name] = function (p, ...rest) {
      const previous = current; current = p;
      try { return native.call(this, p, ...rest); } finally { current = previous; }
    };
  }
  on('weapon:fire', e => recordAttack(e?.actor));
  on('bomb:throw', e => recordSub(e?.actor));
  on('all:sub', e => { if (e?.phase === 'spawn' && !e.replay) recordSub(e.actor); });
  on('hit', e => {
    const a = e?.attacker;
    const serial = current && current.owner === a && current.s3ShotSerial > 0 ? current.s3ShotSerial : 0;
    recordHit(a, e?.victim, e?.damage, e?.weaponId, serial);
  });
  const setup = Match?.prototype?.setup;
  if (typeof setup === 'function') Match.prototype.setup = function (...args) {
    const result = setup.apply(this, args);
    resetInsights(this.actors);
    return result;
  };
}
