// Regular Turf War, full 3-minute match, no food multiplier. These are rank XP,
// not turf score, money, catalog XP, or weapon freshness. Boss mode is separate.
export function turfExperience(points, won) {
  const turf = Math.min(500, Math.floor(Math.max(0, Number(points) || 0) / 100) * 100);
  const time = 300, win = won ? 600 : 0;
  return { time, turf, win, total: time + turf + win };
}
export function turfExperienceBreakdown(points, won) {
  const xp = turfExperience(points, won);
  return [['TIME', xp.time], ['TURF', xp.turf], ...(xp.win ? [['WIN BONUS', xp.win]] : [])];
}
