// Splatoon 3 shooter SplashSpawnParam: SplitNum marks the cycle end,
// ForceSpawnNearestAddNumArray marks extra successful-shot positions.
// This counter is advanced only by the authoritative successful emitter.
export function advanceShooterNearestSlot(runner, spawn) {
  const split = spawn?.SplitNum;
  if (!Number.isInteger(split) || split < 1 || split > 256 ||
      !Array.isArray(spawn.ForceSpawnNearestAddNumArray) ||
      spawn.ForceSpawnNearestAddNumArray.some(v => !Number.isInteger(v) || v < 1 || v > split)) {
    throw new RangeError('Invalid shooter nearest-paint cycle source');
  }
  const slot = ((runner.s3ShooterNearestSlot || 0) % split) + 1;
  runner.s3ShooterNearestSlot = slot;
  return slot === split || spawn.ForceSpawnNearestAddNumArray.includes(slot);
}
