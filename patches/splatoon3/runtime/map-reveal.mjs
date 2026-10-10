// Splatoon 3 Turf Map enemy reveal rule (damage part).
//
// This is presentation-only HUD state and must not touch authoritative
// movement/damage/weapon/ink timing. An opponent's position is shown on the
// Turf Map once that player carries at least 18 points of damage since their
// last full heal. Undamaged opponents stay hidden regardless of kid/squid/
// wall-climb form, and submerging does not erase a reveal that damage already
// granted.
//
// Explicit marks are NOT handled here. They are team-scoped and expiring
// (`s3.revealedUntil[team]`, checked by `mapActorVisible` in combat-info.mjs),
// so an unscoped flag such as `s3.revealed` must never disclose an enemy: it
// has no owning team or lifetime and would leak to both teams indefinitely.
//
// The damage threshold is the community-verified value used by issue #220
// (17.9 hidden / 18.0 and above shown); it is not confirmed by an official table.
export const MAP_REVEAL_DAMAGE = 18;

export function enemyRevealedOnMap(actor, maxHp) {
  if (!actor || actor.alive === false) return false;
  const max = Number.isFinite(maxHp) ? maxHp : actor.maxHp;
  const hp = actor.hp;
  // Fail closed: an actor without finite HP state is never revealed.
  if (!Number.isFinite(max) || !Number.isFinite(hp)) return false;
  return max - hp >= MAP_REVEAL_DAMAGE;
}
