// Splatoon 3 Turf Map enemy reveal rule.
//
// This is presentation-only HUD state and must not touch authoritative
// movement/damage/weapon/ink timing. In Splatoon 3 an opponent's position is
// shown on the Turf Map only once that player carries at least 18 points of
// damage since their last full heal, or is marked by an explicit recon effect.
// Undamaged opponents stay hidden regardless of kid/squid/wall-climb form, and
// submerging does not erase a reveal that damage already granted.
//
// The damage threshold is the community-verified S3 value used by issue #220
// (17.9 hidden / 18.0 and above shown). The optional `s3.revealed` flag models
// the explicit recon marking hook; no reco support in this build populates it
// yet, matching the issue's "no recon sub/gear equipped" premise.
export const MAP_REVEAL_DAMAGE = 18;

export function enemyRevealedOnMap(actor, maxHp) {
  if (!actor || actor.alive === false) return false;
  // Explicit recon marking (Point Sensor / Wave Breaker / team callout hook).
  if (actor.s3?.revealed === true) return true;
  const max = Number.isFinite(maxHp) ? maxHp : actor.maxHp;
  const hp = actor.hp;
  // Fail closed: an actor without finite HP state is never revealed.
  if (!Number.isFinite(max) || !Number.isFinite(hp)) return false;
  return max - hp >= MAP_REVEAL_DAMAGE;
}
