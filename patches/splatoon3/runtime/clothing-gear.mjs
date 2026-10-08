// Fixed clothing abilities are equipment identities, not ordinary AP curves.
export const CLOTHING_ABILITIES = Object.freeze(['respawnPunisher', 'abilityDoubler', 'thermalInk', 'haunt']);
export const SPLATFEST_TEE = 'splatfestTee';
export const RESPAWN_PUNISHER_FLAG = 33554432; // bit25; bit24 belongs to Roller vertical state; no tuple-column change

export function clothingAbilityAllowed(id, piece, slot, item) {
  if (!CLOTHING_ABILITIES.includes(id)) return true;
  return piece === 1 && slot === 0 && (id !== 'abilityDoubler' || item === SPLATFEST_TEE);
}
export function respawnPunisherEquipped(actor) {
  if (!actor) return false;
  const s = actor.s3;
  // A queued accepted hit keeps its equipment identity through owner handoff.
  if (typeof s?.clothingHitPunisher === 'boolean') return s.clothingHitPunisher;
  if (actor.remote) {
    return s?.clothingRemote?.owner === actor.owner && s?.clothingRemote?.punisher === true;
  }
  return actor.s3?.loadout?.[1]?.main === 'respawnPunisher';
}
export function receiveClothingSnapshot(actor, owner, flags) {
  actor.s3 ||= {};
  actor.s3.clothingRemote = { owner, punisher: !!(flags & RESPAWN_PUNISHER_FLAG) };
}
export function withHitPunisher(actor, value, run) {
  if (!actor || typeof value !== 'boolean') return run();
  actor.s3 ||= {};
  const previous = actor.s3.clothingHitPunisher;
  actor.s3.clothingHitPunisher = value;
  try { return run(); }
  finally {
    if (previous === undefined) delete actor.s3.clothingHitPunisher;
    else actor.s3.clothingHitPunisher = previous;
  }
}
export function deathGearPenalty(victim, attacker, cause, tuning, points, curve) {
  const cfg = tuning.clothingGear.respawnPunisher;
  const environmental = ['water', 'fall', 'out', 'bounds', 'void'].includes(cause);
  const enemy = !!attacker && attacker !== victim && attacker.team !== victim.team;
  const incoming = !environmental && enemy && respawnPunisherEquipped(attacker);
  // #1130: Respawn Punisher's own Special loss belongs to the wearer even when
  // the splat has no enemy attacker (water/fall/void). Environmental deaths must
  // still skip the extra respawn-time frames, which require an enemy exchange.
  const selfSpecial = respawnPunisherEquipped(victim) && (enemy || environmental);
  const self = !environmental && enemy && selfSpecial;
  const qrAP = incoming ? Math.max(0, Math.ceil((points.quickRespawn || 0) * cfg.quickRespawnAPScale - 1e-10)) : points.quickRespawn || 0;
  const saverAP = incoming ? (points.specialSaver || 0) * cfg.specialSaverAPScale : points.specialSaver || 0;
  const quickFactor = curve(qrAP, ...tuning.gear.quickRespawn);
  // PR323 owns the additional own-camera phase. Consume it when present;
  // standalone main's missing normal phase is not silently reimplemented here.
  const own = tuning.gearExtra.quickRespawnAroundFrames;
  const chase = tuning.respawnChaseTime * 60;
  const quickReduction = own
    ? (own[0] + chase - Math.floor(curve(qrAP, ...own) + 1e-10) - Math.floor(chase * quickFactor + 1e-10)) / 60
    : tuning.respawnChaseTime * (1 - quickFactor);
  return { incoming, self, selfSpecial, qrAP, saverAP, quickReduction,
    frames: (incoming ? cfg.targetFrames : 0) + (self ? cfg.selfFrames : 0),
    loss: (incoming ? cfg.targetSpecialLoss : 0) + (selfSpecial ? cfg.selfSpecialLoss : 0),
    saver: curve(saverAP, ...tuning.gear.specialSaver) };
}
