const pending = new WeakMap();

export function hasPendingLethal(actor) {
  return pending.has(actor);
}

export function scheduleLethal(actor, attacker, cause = 'weapon') {
  if (!actor || !actor.alive || pending.has(actor)) return false;
  pending.set(actor, { attacker: attacker || null, cause });
  return true;
}

export function clearPendingLethal(actor) {
  if (actor) pending.delete(actor);
}

// Actor.update owns this flush, so a lethal decision made later in fixed tick N
// cannot become a splat until the actor phase of fixed tick N+1.
export function flushPendingLethal(actor) {
  const state = actor && pending.get(actor);
  if (!state) return false;
  pending.delete(actor);
  if (!actor.alive) return false;
  actor.splat(state.attacker, state.cause);
  return true;
}
