// Local presentation only. A fired source pair supplies its lifetime and fixed
// origins; neither packet freshness nor removal of a damage tail is an end.
// This private notification deliberately never enters all:special / the wire.
export const WAIL_PAIR_RETIRED = 'presentation:wail-pair-retired';
const systems = new WeakMap(), pairs = new WeakMap();
const lifeOf = actor => Math.max(Number(actor?.netLife) || 0, Number(actor?.net?.lastLife) || 0);

export function localWailPair(pair) { return pairs.get(pair); }
export function localWailPairs(system) { return systems.get(system)?.values() || []; }
export function findLocalWailPair(system, actor, activation, index) {
  for (const record of localWailPairs(system))
    if (record.actor === actor && record.activation === activation && record.index === index) return record;
}

export function fireLocalWailPair(api, actor, state, pair) {
  if (pairs.has(pair)) return;
  const system = api.G.projectiles;
  if (!system || actor.remote || pair.tick !== 0) return;
  const now = api.G.time || 0;
  const record = {
    actor, owner: actor.owner, life: lifeOf(actor), match: api.G.match,
    activation: state.serial, index: pair.index, state, pair,
    // Copy once: later movement, respawn and activations cannot relocate this pair.
    origins: Object.freeze(pair.origins.map(p => Object.freeze([p.x, p.y, p.z]))),
    bornAt: now, until: now + Math.max(0, pair.until - state.t),
    status: 'fired', detached: false,
  };
  let records = systems.get(system);
  if (!records) systems.set(system, records = new Set());
  records.add(record); pairs.set(pair, record);
}

export function detachLocalWailPairs(api, actor, state, reason) {
  for (const record of localWailPairs(api.G.projectiles)) {
    if (record.actor !== actor || record.state !== state) continue;
    if (reason === 'reset') cancel(api.G.projectiles, record);
    else record.detached = true; // Fired attacks survive body end, death and Super Jump.
  }
}

function cancel(system, record) {
  record.status = 'cancelled'; systems.get(system)?.delete(record);
}
export function clearLocalWailPairs(system, actor = null) {
  for (const record of localWailPairs(system)) if (!actor || record.actor === actor) cancel(system, record);
}

export function stepLocalWailPairs(api, system) {
  const now = api.G.time || 0;
  for (const record of localWailPairs(system)) {
    const actor = record.actor;
    if (system !== api.G.projectiles || actor.remote || actor.owner !== record.owner
      || api.G.match !== record.match || now < record.bornAt
      || !record.detached && (lifeOf(actor) !== record.life || actor._s3AllSpecialState !== record.state)) {
      cancel(system, record); continue;
    }
    if (now + 1e-8 < record.until) continue;
    // Consume before notifying. Re-entry / repeated updates cannot fire twice.
    systems.get(system).delete(record); record.status = 'retired';
    api.emit?.(WAIL_PAIR_RETIRED, record);
  }
}
