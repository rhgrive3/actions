import { respawnPunisherEquipped, withHitPunisher } from './clothing-gear.mjs';
const pending = new WeakMap();
const MAX_CAUSE_LENGTH = 48;

function actorLife(actor) {
  const life = actor?.netLife ?? actor?.net?.lastLife ?? 0;
  return Number.isSafeInteger(life) && life >= 0 ? life : 0;
}

function validCause(cause) {
  return typeof cause === 'string' && cause.length > 0 && cause.length <= MAX_CAUSE_LENGTH
    && !/[\u0000-\u001f\u007f]/.test(cause);
}

export function hasPendingLethal(actor) {
  return pending.has(actor);
}

export function scheduleLethal(actor, attacker, cause = 'weapon', simTime = NaN) {
  if (!actor || !actor.alive || pending.has(actor)) return false;
  if (!validCause(cause)) cause = 'weapon';
  const previous = Number.isSafeInteger(actor._s3LethalSequence) && actor._s3LethalSequence >= 0 ? actor._s3LethalSequence : 0;
  if (previous >= Number.MAX_SAFE_INTEGER) return false;
  const sequence = previous + 1;
  actor._s3LethalSequence = sequence;
  pending.set(actor, { attacker: attacker || null, cause, punisher: respawnPunisherEquipped(attacker), life: actorLife(actor), sequence,
    admittedAt: Number.isFinite(simTime) ? simTime : null });
  return true;
}

// The accepted hit is transferred only with the same actor life and hit
// identity. A receiver can finish the existing one-fixed-tick delay without
// applying damage or attribution a second time.
export function exportPendingLethal(actor) {
  const state = actor && pending.get(actor);
  if (!state || !actor.alive || state.life !== actorLife(actor) || !validCause(state.cause)
    || !Number.isSafeInteger(state.sequence) || state.sequence < 1) return null;
  const attackerNid = Number.isSafeInteger(state.attacker?.nid) && state.attacker.nid >= 0 ? state.attacker.nid : -1;
  return [state.life, state.sequence, attackerNid, state.cause, state.punisher];
}

export function restorePendingLethal(actor, snapshot, attacker = null) {
  if (!actor || !actor.alive || !(actor.hp <= 0) || !Array.isArray(snapshot) || snapshot.length !== 5) return false;
  const [life, sequence, attackerNid, cause, punisher] = snapshot;
  if (!Number.isSafeInteger(life) || life < 0 || life !== actorLife(actor)
    || !Number.isSafeInteger(sequence) || sequence < 1
    || !Number.isSafeInteger(attackerNid) || attackerNid < -1 || !validCause(cause) || typeof punisher !== 'boolean'
    || (attackerNid >= 0 && attacker?.nid !== attackerNid)) return false;
  const accepted = actor._s3AcceptedLethal;
  if (accepted && accepted.life === life && accepted.sequence >= sequence) return false;
  const existing = pending.get(actor);
  if (existing) return false;
  pending.set(actor, { attacker: attacker || null, cause, punisher, life, sequence });
  actor._s3LethalSequence = Math.max(Number.isSafeInteger(actor._s3LethalSequence) ? actor._s3LethalSequence : 0, sequence);
  actor._s3AcceptedLethal = { life, sequence };
  return true;
}

export function clearPendingLethal(actor) {
  if (actor) { pending.delete(actor); delete actor._s3AcceptedLethal; }
}

// Actor.update owns this flush, so a lethal decision made later in fixed tick N
// cannot become a splat until the actor phase of fixed tick N+1.
export function flushPendingLethal(actor, simTime = NaN) {
  const state = actor && pending.get(actor);
  if (!state) return false;
  // Actor updates are ordered: a hit from an earlier Actor in tick N can be
  // observed by a later Actor in *the same* tick. Do not flush until N+1.
  if (Number.isFinite(state.admittedAt) && (!Number.isFinite(simTime) || simTime <= state.admittedAt)) return false;
  pending.delete(actor);
  if (!actor.alive || state.life !== actorLife(actor)) return false;
  withHitPunisher(state.attacker, state.punisher, () => actor.splat(state.attacker, state.cause));
  return true;
}
