// Issue #435 — build-only adapter: Splat Slosher swim-exit first release
// 17f -> Splatoon 3 Ver. 11.3.0's 18f.
//
// Root
//   inkwave-public/src/game/actor.js admits the main-weapon runner through one
//   global decimal emerge gate (`kidT >= PLAYER.emergeDelay`, 0.07 s), whose
//   first accepted fixed tick after a swim ZR edge is F5 (4/60 = 0.0667 < 0.07,
//   5/60 = 0.0833 >= 0.07). The active S3 Slosher wrapper
//   (patches/splatoon3/runtime/weapons.mjs) then holds its sourced 12f lift, so
//   the swim first release lands at F5 + 12f = F17 instead of the S3 18f.
//
// Fix (narrow, weapon-aware)
//   kind === 'slosher' only: admission uses a fixed-frame-derived boundary —
//   6f @60Hz (18f swim total - 12f humanoid lift) — with the same 1e-10
//   epsilon the S3 slosher wrapper uses at its windup boundary. The epsilon is
//   load-bearing: six accumulated 1/60 steps equal 0.09999999999999999, so a
//   bare `>= 6 / 60` would admit at F7 (19f). Every other weapon keeps the
//   byte-identical native `this.kidT >= P.emergeDelay` comparison, so shared
//   timings (12f humanoid startup, 29f held repeat, other classes' gates,
//   the 16f post-shot lock) cannot drift.
//
// Sources (Splatoon 3 Ver. 11.3.0, as pinned by issue #435)
//   - https://splatoonwiki.org/wiki/Slosher
//   - https://wikiwiki.jp/splatoon3mix/%E3%82%AC%E3%83%81%E3%83%9B%E3%82%B3%E3%83%9C%E3%82%A2%E3%83%88%E3%83%AB (29F repeat / 12F windup)
//   - https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/ (Ver. 11.3.0 current)
//   The 6f admission delta is the issue's own reference sequence:
//   `swim + ZR -> 6f emerge/action admission -> 12f lift -> release at 18f`.
//   No gameplay number is guessed here; 12f and 29f come from the active
//   profile/wrapper and 6f is 18f - 12f.
//
// Scope
//   Only `src/game/actor.js`, actual swim transition and admission with lifecycle clears. No raw
//   inkwave-public mutation (strings in, strings out), no shared dispatcher
//   adapter.mjs / profile.json edits. Wiring into the build chain is reported
//   to the orchestrator; parent owns integration and release decisions.
import { replaceOnce } from './adapter.mjs';

export const SLOSHER_EMERGE_REL = 'src/game/actor.js';
export const SLOSHER_EMERGE_ANCHOR = '    if (!isSquid && this.kidT >= P.emergeDelay) {';
export const SLOSHER_EMERGE_REPLACEMENT =
  '    // #435 S3 Slosher swim exit: fixed-frame admission (18f total - 12f lift = 6f @60Hz) at the same epsilon boundary\n' +
  '    // the S3 slosher wrapper uses; every other weapon keeps the native emergeDelay comparison unchanged.\n' +
  "    if (!isSquid && (this.weapon?.kind === 'slosher' && this._s435SwimExit ? this.kidT + 1e-10 >= 6 / 60 : this.kidT >= P.emergeDelay)) {\n" +
  '      this._s435SwimExit = false;\n';

// Build-only: identical connection semantics as the shared dispatcher
// (exactly one anchor or a hard build error; never a silent no-op).
export function adaptSlosherEmergeGate(rel, code) {
  if (rel !== SLOSHER_EMERGE_REL) return code;
  code = replaceOnce(code, '      if (!wantSquid) this.kidT = 0;',
    "      if (!wantSquid) { this.kidT = 0; this._s435SwimExit = this.weapon?.kind === 'slosher'; }",
    'issue #435 actual swim exit');
  for (const anchor of ['  reset() {', '  superJump(target) {', '  _startSpecial() {']) {
    code = replaceOnce(code, anchor, anchor + '\n    this._s435SwimExit = false;', 'issue #435 lifecycle ' + anchor);
  }
  return replaceOnce(code, SLOSHER_EMERGE_ANCHOR, SLOSHER_EMERGE_REPLACEMENT,
    'issue #435 slosher swim-exit emerge gate');
}