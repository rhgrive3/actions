// Presentation-only state for the current Triple Splashdown. Legacy Tidal
// Slam keeps its existing wp phase clock. Actor position, hit authority and
// the two independent catalogue fists remain on their original wire paths.
const life = actor => Math.max(actor?.netLife || 0, actor?.net?.lastLife || 0);
const integer = value => Number.isSafeInteger(value) && value >= 0;
export function splashdownProtected(actor) {
  const s = actor?.specialActive;
  return !!actor?.alive && s?.id === 'tripleSplashdown'
    && (s.superJump === true || Number.isFinite(s.age) && s.age + 1e-10 >= 50 / 60);
}
export function readSplashdownSnapshot(row, sourceLife, eligible) {
  if (!eligible || !Array.isArray(row) || row.length !== 5
    || !integer(row[0]) || row[0] !== sourceLife
    || !Number.isSafeInteger(row[1]) || row[1] < 1 || row[1] >= 1e9
    || ![1, 2].includes(row[2]) || !Number.isFinite(row[3]) || row[3] < 0 || row[3] > 2.5
    || ![0, 1].includes(row[4]) || row[4] === 1 && row[2] !== 2) return null;
  return { life: row[0], activation: row[1], phase: row[2] === 1 ? 'rise' : 'drop', age: row[3], superJump: row[4] === 1 };
}
export function packSplashdownSnapshot(actor) {
  const s = actor?.specialActive;
  if (!actor?.alive || actor.remote || s?.id !== 'tripleSplashdown') return null;
  const row = [life(actor), s.activation, s.phase === 'rise' ? 1 : s.phase === 'drop' ? 2 : 0, s.age, s.superJump ? 1 : 0];
  return readSplashdownSnapshot(row, life(actor), true) ? row : null;
}
export function interpolateSplashdownSnapshot(a, b, u) {
  if (!a || !b || a.life !== b.life || a.activation !== b.activation || a.phase !== b.phase || a.superJump !== b.superJump) return a || null;
  return { ...a, age: a.age + (b.age - a.age) * u };
}
export function applySplashdownSnapshot(actor, sample) {
  if (!actor?.remote || !actor.alive || actor.weapon?.special !== 'tripleSplashdown'
    || actor.specialActive?.id !== 'tripleSplashdown' || !sample) return;
  // Reuse the token across samples so Character motion does not restart every
  // network tick. A new activation receives a new token, just as local play.
  let s = actor.specialActive;
  if (s.activation !== sample.activation) actor.specialActive = s = { id: 'tripleSplashdown', net: true };
  Object.assign(s, { activation: sample.activation, age: sample.age, phase: sample.phase, superJump: sample.superJump });
}
