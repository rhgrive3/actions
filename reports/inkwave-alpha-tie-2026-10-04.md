# INKWAVE exact-Turf-tie policy (#158)

## Scope and ownership

Fresh main was `866fd45992be33c51966a8acc55596bb5bac15a8`. This small follow-up
explicitly depends on HUD PR486 head `dad4d386acb0b6a524babf7a493aa74ec5eceac9`
so the authoritative decision reaches Judd unchanged. PR486 remains responsible
for the 23-segment gauge and its browser fixtures. No merge or deployment is
performed here.

[Issue158](https://github.com/rhgrive3/actions/issues/158) had no owner comment.
Current open/closed PR search found only PR486's explicit non-implementation
reference. Actual relevant PR182/317/331/486 diffs did not replace the random
Turf tie decision. The public owner comment was posted and read back before
implementation. The separate 90-second match option is untouched.

## Reference rule and limits

Acceptance target: Splatoon3 Ver.11.3.0, as listed in Nintendo's
[update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/).
Nintendo's [Turf guide](https://www.nintendo.com/jp/ichikara/av5ja/03_en.html)
provides the ordinary most-coverage-wins rule. The issue's supplied
[Turf War reference](https://splatoonwiki.org/wiki/Turf_War) documents an
assigned-Alpha tiebreak rather than a new coin flip at judgment. Its explicit
0.1% display-addition note names the original Splatoon, so that number is **not
imported as a newly verified Splatoon3 numerical parameter**. S3-specific
[community discussion](https://gamefaqs.gamespot.com/boards/313532-splatoon-3/80227366)
also describes assigned-Alpha selection, but is not Nintendo source code.

The implementation follows the issue's deterministic assigned-side policy.
It does not claim a new Switch experiment, extracted Nintendo judge code,
modern exact display-bonus calibration, or Nintendo's matchmaking assignment
randomizer. Actual CPU coverage stays unchanged; no fake painted area or
unverified 0.1% bonus is added.

## Why Alpha is team0 here

This is not a choice based on which side of the HUD looks convenient:

- Native lobby protocol controls pass integer0 for ALPHA and integer1 for BRAVO:
  `src/ui/menus.js`, TEAM_LABEL and teamSeg/requestTeam -> `net.setMe({team:v})`.
- The same protocol's mock transport diagnoses `want ? Bravo : Alpha` and
  preserves the chosen integer in its player patch (`src/net/mock.js::setMe`).
- Actual `Match._setupRoster()` transfers `r.team` directly to each Actor and
  selects the corresponding stage spawn pad. It does not rebase teams to the
  locally viewed side.
- Actual NetMatch result packets carry a global `win` index, and `_result()`
  stores that exact index. Local-player ownership and host ownership are
  separate fields.

[Native roster mapping](https://github.com/rhgrive3/actions/blob/866fd45992be33c51966a8acc55596bb5bac15a8/inkwave-public/src/game/match.js#L94-L119)
and [native team request](https://github.com/rhgrive3/actions/blob/866fd45992be33c51966a8acc55596bb5bac15a8/inkwave-public/src/ui/menus.js#L2858)
are pinned to the refreshed source. A regression actually runs the native roster
method with the **host/local player on Bravo** and confirms Alpha still wins.

## Implementation

An exact, unique build adapter connection changes only the native Turf winner
comparison from random-at-equality to `cov[0] >= cov[1] ? 0 : 1`.

- 0/0 and equal nonzero coverage deterministically choose assigned Alpha.
- Every non-equal valid coverage pair retains its old outcome.
- The actual frozen coverage array is returned unchanged.
- Boss result calculation and send/state ordering bypass this rule unchanged.
- Native host packet, receiver, Game result/fanfare and PR486 Judd all preserve
  the same winner index, including when the local player is on Bravo.
- Vendored `inkwave-public/` is unchanged. Existing source hash compatibility
  already covers `src/game/match.js`; missing/duplicate anchors stop the build.

## Verification

- Dedicated native-source/protocol/Judd cases: 9/9.
- Complete emitted/minified Match module with actual dependencies: 1/1.
- Production build passed, content digest prefix `daf7b3c7bea9`.
- Negative control proves the old native judge can award either team for the
  same exact coverage depending on a fresh Math.random sample.
- Tests cover 0/0, several equal nonzero values, both local teams, a host on
  Bravo, sub-display-unit non-ties, coverage immutability, repeated decisions,
  Boss bypass, actual sendResult/_result methods, and actual Game/Judd outcomes.
- The active browser gate also invokes the loaded native Match judge with frozen
  test coverage and an isolated state/result sink. It does not finish the live
  rendering match or transmit test packets. This is compiled native-method
  acceptance, not latency-injected real-peer or physical Switch proof.

Complete-suite and exact-head CI status will be recorded on the Draft PR.
A conditional emitted-module test may be skipped by a source-only suite, but
was explicitly run with the built-site environment for the 10/10 result above.
