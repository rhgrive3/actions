# Pencil five-shot event/flight candidate

Base: `f8b5eafc38f8d80641d823c950cbe7d560c9bfc0`. Separate branch:
`fix/pencil-five-shot-cycle-20261026`. Code:
`68cf341170a4c5c19d9ac76ea68c8974cfdbd591`. The protected integration remains
at f8 pending parent acceptance.

The new production-path checks found two concrete defects: loaded shots2–5
fired on button press, and unused rounds survived squid form. Nintendo's
[official announcement](https://x.com/SplatoonJP/status/1593167058514026497)
describes release-owned shots; its indexed text was retrieved, while opening
the post directly returned403. No original video/pixels were retrieved. The
existing pinned11.3.0 catalogue grants Pencil no charge keep; the fix extends
that existing cancellation policy to its remaining divided rounds.

Only `main-weapon-catalog.mjs` production changes: loaded shots use the existing
previous-held/current-released edge and cooldown; unused rounds enter the
existing squid cancel path. There are no new clocks, guessed refunds, numeric
stats, render shapes or audio assets. Both kits retain72F charge,15F post-delay,
5shots,37.5% reservation,68 damage,288WU/s and26.037WU source range. The data
module and all390 packaged audio files are unchanged.

| Check | Result |
| --- | --- |
| Source charge/flight/stage/keep file | 7/7 |
| Existing five-round payment and retained-Charger keep | 2/2 |
| Fresh minified Pencil cases | 2/2 |
| Both new cases against f8 source/emitted | Fail on premature press emission and retained squid rounds |
| Optimized build/startup | Passed; one build |
| Exact input/artifact hashes | 1490/2194, zero mismatches |

Both base and5B complete all five shots at fixed60Hz. Each actual release has
one full-shot audio event, a moving head matching native draw-buffer positions,
visible-buffer falling ink and five delayed CPU landing stamps. Each head/drop
retires. There is one rise/ready per pack, no repeat during shots2–5, and no
cancel cue layered on real shots. After depletion, the next press begins a
fresh partial charge/rise. Actual Squid/sub input, public runner reset and
weapon change discard the unused pack in both kits and require new charging.

[Validation](validation.json), [ten-shot/interrupt traces](traces.json) and
compressed raw logs preserve the results. The emitted contentHash is
`69d67eabf58f3e095f94f361fa2f6c816f79835dcac14344037c81c4b7d6837e`.

This closes the deterministic event/flight state gap for this candidate. It
does **not** close actual sound playback, native browser input, presented
pixels, hardware, retail intervals/keep-cancel ink settlement or original-game
agreement. The Actor fixture freezes integration, simplifies Character and
uses an elevated fixed firing position; it is not a jumping-Actor/browser
capture. The existing30/60/120Hz high-flight check is separate from this60Hz
five-shot cycle. No broad browser/audio matrix, PR retry, merge or manual CI.
