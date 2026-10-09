# #569 residual: malformed host move timeline records

The existing guest/old-host Boss authority checks remain correct. On PR #1182 base `b1626ee8`, however, a current-host `bm` record was admitted whenever its `t0` was finite. `{t0:1}` therefore entered the real Boss hazard list and threw in native `moveTimes` during the next `BossHazards.update`: `undefined is not iterable`.

The timeline now shares the existing native Boss snapshot move validator instead of maintaining a weaker second schema. Boss payload and current-host checks precede event sequence admission, so a rejected malformed move does not suppress a subsequent valid record with the same not-yet-admitted sequence. Existing stale/duplicate filtering, host changes, crablet authority, actor/projectile/paint paths and native move parameters are preserved. The adjacent legacy Boss test input now supplies the native Slam `rings` field rather than an incomplete synthetic shape.

## Verification

- Retained negative control removes only the stronger move schema and reproduces native hazard-list mutation and the exception.
- Real `onMessage` → event timeline → `Boss.onMove` → `BossHazards.add/update` rejects missing duration, invalid duration, missing/malformed Slam rings and unknown move types before replay admission. The next valid same-sequence record applies once; a replay does not duplicate it.
- Actual `BossBrain._start` generates all six move types at each of three phases; JSON-round-tripped records reach the actual native hazard consumer.
- All six build adapters plus the S3 install and all eight extra bootstrap installers run in source-verified order. Construction/navigation/render sinks are bounded fixtures, not a browser or live relay.
- Combined Boss snapshot/boundary, Boss timeline and canonical paint tests: **33/33 passed**, no skips, concurrency 1. Syntax, quick source/reference and whitespace checks pass.

This addresses the malformed-event acceptance residual of #569 without changing its closed state or claiming its earlier ownership fix was absent. HULLBREAKER is INKWAVE-specific, with no asserted Nintendo equivalent. Splatoon 3 comparison remains 11.3.0; no balance, frame, rate, physics or Nintendo calibration value changes. Browser/WebGL, live relay and Switch testing remain unperformed.
