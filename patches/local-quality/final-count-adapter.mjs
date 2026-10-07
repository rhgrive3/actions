// #831: final-countdown numbers are one-shot presentation milestones, not clock
// readouts. On an online follower netmatch._hostClock() half-corrects match.time
// toward delayed host snapshots, so Math.ceil(this.time) can move upward (stale
// sample) or jump across several second boundaries (late sample). A bare
// `c !== lastCount` therefore re-arms an already-presented number (9 after 8)
// or replays it after a rewind, and a forward jump leaves the crossed numbers
// with no defined policy. Gating emission on a strictly smaller milestone makes
// the sequence monotonic by construction: offline, where time only decreases,
// the emitted sequence is identical to before; a backward correction can never
// re-arm or reverse a number; a forward correction presents only the current
// number and skips the crossed ones once — and a skipped number can never
// replay later because lastCount already moved past it. TIME UP authority, the
// 1:00 milestone, the smoothing clock and all gameplay timing stay untouched;
// only the ordering of the match:count presentation events changes.
export function adaptFinalCount(rel, code, once) {
  if (rel !== 'src/game/match.js') return code;
  return once(code,
    "if (this.time <= MATCH.finalCountdown && c !== this.lastCount && c > 0) { this.lastCount = c; emit('match:count', { n: c }); }",
    "if (this.time <= MATCH.finalCountdown && c > 0 && c < this.lastCount) { this.lastCount = c; emit('match:count', { n: c }); }",
    'monotonic final-count milestone');
}
