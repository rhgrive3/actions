// INKWAVE issue #438: Turf War result player ranking by inked turf.
//
// Splatoon 3 orders each team's Turf War result rows from highest to lowest
// individual turf inked. The native comparator in src/ui/menus.js
// (`(y.turf - x.turf)`) is raw subtraction: any missing/NaN turf poisons the
// whole team ordering into NaN (compare always false -> roster order kept),
// and there is no documented stable tiebreak. This helper coerces the
// authoritative turf payload to a finite non-negative rank value so the
// build-only adapter can sort a *copy* of each team's rows deterministically.
//
// Pure presentation ordering: no winner/Judd, team assignment, podium, XP,
// or boss damage-ranked path changes. Ties keep existing roster order
// (Array.prototype.sort is stable).
export function turfRankValue(player) {
  const value = Number(player?.turf);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

// Descending turf comparator for same-team result rows.
export function compareTurfRows(a, b) {
  return turfRankValue(b) - turfRankValue(a);
}

// Stable descending copy; never mutates the shared players array.
export function orderTeamRows(rows) {
  return rows.slice().sort(compareTurfRows);
}
