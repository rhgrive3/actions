# Portrait transition browser contract correction

CI run 37268081215 / job 111629034229 stopped at the old assertion that FIRE could be held in portrait. Issue #142 deliberately rejects input under the rotate overlay, so that setup is no longer valid.

The browser case now requires: portrait FIRE and pointer ownership are rejected; the same rejected gesture cannot acquire controls merely by moving after a same-angle landscape transition; a fresh landscape pointer delivers exactly one FIRE owner and a real press edge; release plus normal edge consumption clears all ownership. Fixed-angle gyro resync remains forbidden. Existing same-angle landscape held-button/stick/look tests, fixed-stick normalization, true-rotation reset, and capture-loss checks are retained.

The new verifier contract accepts one valid receipt and rejects ten concrete false-pass cases, including portrait FIRE, stale ownership/edges, spurious gyro resync, missing fresh input, duplicate owners and retained release. Source portrait/Map/relayout plus contract: 32 pass, one emitted-only optional. Explicit emitted runs: 33/33, no skips. Build 30af7443fcef.

The canonical browser runner was attempted locally with only its output-root assertion adjusted in a private copy for this environment. Local loopback succeeds, but Playwright's default Chromium headless executable is missing. No browser pass is claimed from that attempt. Combined CI must run the real gesture checks.
