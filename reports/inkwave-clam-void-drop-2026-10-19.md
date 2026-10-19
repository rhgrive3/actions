# Clam unsupported death drops — 2026-10-19

## Reproduction and bounded correction

On main `d966ac25b60154727333b5c60b1a1070be51544f`, a losing player carrying the final Power Clam can die in water while comeback overtime is active. The real `Actor.update` water check splats the actor. `Match.advanceRanked` then receives `alive=false` and a null supporting-floor result from `RankedWorld.floorAt`. `_dropInventory` nevertheless creates a grounded object. Grounded clams skip projectile gravity/void checks, so this submerged Power Clam keeps overtime alive for its ten-second lifetime. At 60 Hz the reproduced match ends at elapsed 10.033333 seconds instead of the water-loss tick at 0.033333 seconds.

The sole runtime change is in `patches/splatoon3/runtime/ranked/clams.mjs`, `_dropInventory`. A provided floor callback returning null marks the new drop airborne; the existing gravity and void-loss path handles it. A supported floor retains the original position, grounded flag, reduced small-clam count and full ten-second lifetime. A missing floor callback retains legacy behavior. An above-water unsupported drop falls normally rather than being deleted immediately. No new timer, fall threshold, velocity, hitbox, score or penalty value is introduced.

The helper also serves existing special-triggered inventory drops; their supported-floor behavior and no-floor-query fallback are regression controls. The separate `removeActor` path has no terrain callback and remains unchanged. Individual scattered small-clam offsets beyond the holder's supporting surface, every stage/water model, and disconnect-time terrain context are outside this correction.

## Reference

- [Splatoon 3 verification Wiki: ガチアサリ](https://wikiwiki.jp/splatoon3mix/ガチアサリ), sections アサリの消滅 and ガチアサリ. Retrieved 2026-10-19, page last modified 2026-10-08 00:14:26. It lists pit fall / water submersion among disappearance conditions, including Power Clams. Short excerpt: 「穴へ落下、または水没した」. This is a public empirical rule reference. No new Switch capture or exact retail disappearance-frame measurement is claimed.
- [Nintendo Ver.3.0.0 update, 2023-02-28](https://support.nintendo.com/jp/switch/software_support/av5ja/300.html) documents the scoreless-overtime timeout/barrier-break ordering. The corresponding existing behavior is preserved by a regression; this patch does not alter its implementation. Ordinary goal closure versus same-tick projectile arrival retains current runtime order, with exact retail subframe priority still unmeasured.

## Portable verification

`ranked-clam-void-drop.test.mjs` uses the existing source-loaded production Actor fixture. Its optional `extraExports` hook is the same two-line extension used by the separately staged presentation work. World and the Tidewater layout are imported into the same VM module namespace as Actor/Match/Engine; no host-class substitute or absolute local path is used.

The tests cover 30/60/120 Hz and both teams; actual water death; small 1/3/7 inventory; supported drops and the full ten-second expiry; above-void fall; a supported trench below the nominal water line; multiple Power Clams; generation/loss at regulation expiry; death before input versus a previously released projectile; terminal-match immutability; current goal-closure ordering; scoreless timeout/barrier break; snapshot restore/host migration; and current death-paint metadata/credit. The initial sixteen portable cases passed together. The browser callback is additionally executed verbatim against production Actor/Match/World and the native Tidewater Level.

Existing source tests run through the ranked workflow's `ranked-*.test.mjs` glob. A new explicit step after its one production build runs the same file with `INKWAVE_BUILT_SITE=_site-ranked`, so emitted runtime and source-bank imports come from the tested build. The existing 25-minute timeout remains unchanged.

The existing ranked Chromium harness adds a bounded two-scene terminal proof after its last offline Clam capture/deadline. Initial losing counts, remaining regulation time and one held Power Clam are seeded. Water coordinates are found through at most 625 real terrain queries. Actor.update produces water death, then Match.advanceRanked and RankedWorld update must produce zero dropped clams and the overtime result on that tick. The floor control uses native Actor.splat and must retain its Power Clam through tick 599 and expire on tick 600. The fixture never writes an expected ball count or winner. It records results in `result.json` under `clamVoidDrop`.

This is a terminal native fixture: its two actors really die and G.time/effects progress. The temporary Match references and clocks are restored in finally, while the subsequent online test starts a fresh match, or an offline-only run closes the context. It is not a general Actor/effects rollback utility. Existing Rainmaker target-reset setup, relay tests, build identity checks and screenshots are unchanged.

## Evidence status and remaining gates

Source production-composed checks and independent rule/Actor/network review are available. The unchanged rule is a failing negative control for the water-loss boundaries. The separate event-envelope correction is byte-commutable and is not included here. Exact-emitted CI and actual Chromium execution of this new case still require the eventual fixed PR head; wiring or a CPU execution of the callback is not reported as a real-browser pass.

This correction is independent of PR1627's staged model/barrier/event work and PR1643's post-wave throw admission. It neither completes the Clam throw animation nor changes ball presentation or weapon input.
