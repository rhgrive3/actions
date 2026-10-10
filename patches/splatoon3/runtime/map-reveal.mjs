// #710: conditional S3 enemy Turf Map visibility. A player's humanoid form,
// global truthy 'revealed' flag, or another team's recon data are never proof.
// Damage >= 18 HP is the publicly verified map-information threshold (#220).
// Recon currently enters through the team's expiring revealedUntil[team] field;
// deploying and replicating each recon sub is a separately owned weapon feature.
export const MAP_REVEAL_DAMAGE = 18;

export function enemyRevealedOnMap(actor, maxHp, viewer = null, now = 0) {
  if (!actor?.alive) return false;
  const max = Number.isFinite(maxHp) ? maxHp : actor.maxHp;
  const hp = actor.hp;
  if (!Number.isFinite(max) || !Number.isFinite(hp)) return false;
  if (max - hp + 1e-9 >= MAP_REVEAL_DAMAGE) return true;
  // Only an explicitly scoped, finite, unexpired team mark may reveal a
  // recovered/undamaged opponent. Never accept actor.s3.revealed === true.
  const team = viewer?.team;
  if (!Number.isInteger(team) || team < 0 || team > 1 || actor.team === team ||
      !Number.isFinite(now)) return false;
  const until = actor.s3?.revealedUntil?.[team];
  return Number.isFinite(until) && until > now;
}
