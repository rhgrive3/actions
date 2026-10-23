# Killer Wail pair retirement — source-stage review candidate

Base: `726e338ac256ba9609086ce65e25a68ddd99df85` (`rhgrive3/actions`). This comparison branch is for source review only; main integration and rendered/native visual acceptance are not claimed.

## Evidence and reproduction

The existing `all-specials.mjs` commits three pairs with immutable source origins, pair indices, activation identity and a gear-adjusted `until`. Damage runs every 5/60 s. A detached tail is removed after its final damage tick, which can be 5/60 s before `until`. `special-presentation.mjs` previously used that tail list for surviving speakers; `special-vfx.mjs` uses 0.14 s laser freshness and whole-special mouth cleanup. None is a per-pair terminal notification.

Reproduce with Killer Wail, no Special Power Up, local actor: fire the first pair, die or Super Jump at 1 s, and advance the source past the last damage tick at approximately 3.5167 s but before its nominal lifetime at 3.6 s. The original source has removed the damage tail and speakers without a pair-retirement identity. Source tests also cover 57 AP, three ordinary pair endings, cancellation and actor reuse.

The parent supplied a description of an authorized retail capture: upper beam absent at encoded frame 152, speaker present through 157, spherical burst at 158; middle/lower bursts at 176/194 followed by round flecks. These are **30 fps encoded frames**, not native ticks. Media bytes were not supplied to this task; no frames were directly inspected or compared. Retail version, weapon, gear and other capture conditions are uncertified. Existing source identifies the lifetime parameter table as 11.3.0; that does not certify the capture's version or establish its speaker-burst delay.

## Candidate

- `wail-pair-presentation.mjs` creates a local-only record when `fireWailTick` first commits a pair. Identity includes Actor, captured life, owner, match, activation and pair index. Origins are copied and frozen. A WeakMap retains the consumed pair marker.
- Its deadline is `G.time + max(0, pair.until - state.t)` at that commit. It reads the existing simulation clock and lifetime; it never changes damage timing, tail removal, pools or wire rows. It survives earlier damage-tail removal and body end. Reset/clear and lost source authority cancel silently.
- `presentation:wail-pair-retired` consumes the record before notifying, exactly once at that local lifetime. Fired mouth discs and detached speakers use the same record; unfired mouths still end with the body. A later life or activation cannot reuse the consumed pair.
- The effect reuses existing pools: one small SHOCK sphere and four GLOW flecks per speaker. Local beam records end with their exact pair identity. Shape, colour, burst onset and any post-beam hang are **INKWAVE calibration**, pending reference-aware rendered acceptance. No native delay is inferred from the supplied frame description.

## Remote boundary

Remote rendering remains on its existing accepted replay/freshness path. A `laser` row has an activation, speaker index and damage tick, but no accepted per-pair normal terminal record. Activation duration and `end` describe the body action; interruption can leave already-fired pairs running. Missing/late packets and missing tail entries therefore cannot distinguish retirement from a gap.

Safely extending retirement to remote actors needs an owner-authored per-pair terminal (or equally authoritative committed lifetime/completion state), bound to the accepted actor owner/life, activation and pair, retaining its fixed origins and distinguishing normal completion from reset/clear. It also needs consumed terminal state across replay/late snapshots. This patch adds no wire field, action, parser, envelope or remote timer inference.

## Verification

- New regression suite: **32/32 pass**, raw source and production composition. Covers 30/60/120 Hz normal endings, death/Super Jump, early tail removal, reset/clear including the post-damage gap, unfired death, authority/life/match replacement, packet gaps/late/repeated replay, visual freshness/holder disposal, later activation/life and gear-adjusted lifetime.
- Existing focused suite: **39/39 pass** (`killer-wail-trace-lifecycle`, `special-vfx`, `special-presentation`). Related source/model/motion/control/pool/recipe suite: **188/188 pass**.
- Seeded original-versus-candidate comparison: **18/18 identical** raw/composed × 30/60/120 Hz × normal/death/Super Jump. Every sampled gameplay frame, damage-tail clock/ticks, HP, special gauge, projectile/object counts, random-call count and full `all:special` rows match. Both result files SHA-256: `f224450fdca17f14c7868008f94a4403161f44b4a8ff5b79a156090963a39398`.
- The final regression suite against preserved base versions of the three touched runtime modules gives **20 expected failures / 12 passes** on the missing contract. The negative-run log is retained with the external evidence bundle. This is an intentional regression demonstration.
- Development failures: four initial GPU-origin assertions compared Float32 storage to doubles exactly; corrected to a 1e-6 tolerance. Four later fixture-setup failures were corrected by re-equipping Wail after native reset and applying 57 AP through the native gear refresh instead of mutating its frozen ability table. No runtime correction was needed for those failures.
- Node `v24.19.0`, experimental VM modules; syntax and `git diff --check` pass. No site build or browser run was duplicated. The parent owns reference-aware rendered acceptance and integration with other specials. Original checkout/snapshots and media are untouched.

Run the new suite with `node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/killer-wail-pair-retirement.test.mjs`. This is source-stage completion only; the remote contract and native visual timing/appearance remain unresolved.

## Follow-up: attached holders at the retirement notification

Independent review found an update-order gap in immutable candidate `219b3e88b955efdcb4579172f9392dd82d555742`: production Actor/Character poses before Projectiles retires a pair. The record and burst ended correctly, but the two attached holders stayed visible until the next Character tick. The earlier `make()` fixture disables `_finishFrame` and uses a Character stub, so its passing results did not cover that render opportunity.

The follow-up changes only `special-presentation.mjs`: its existing model owner listens to `presentation:wail-pair-retired` and synchronously hides the exact attached pair before the already-installed FX listener receives the same event. Canonical source state and pair-record identity must match; remote actors are excluded. Other pairs, detached death/Super Jump tails, cancellation and existing remote replay remain on their prior paths. Gameplay clocks, retirement deadline, notification count, damage, pools, geometry and wire are unchanged.

`killer-wail-pair-retirement-order.test.mjs` retains the actual production Actor, `_finishFrame`, Character, geometry, Projectiles and FX. A FixedClock drives Actor/Character → Projectiles with 30/60/120 Hz render opportunities. It observes both the retirement notification and the FX burst callback, before any subsequent Character update. All three pair endings are checked, including untouched later pairs. Additional cases cover death/Super Jump tails, silent reset/clear and old-record/remote isolation. These are source-order observations, not browser renders.

- Source-stage result: **7/7 new tests pass; all original 259/259 pass again**. The original 18-case gameplay/wire comparison remains byte-identical to the frozen base (`f224450fdca17f14c7868008f94a4403161f44b4a8ff5b79a156090963a39398`). Syntax and diff checks pass.
- Negative run against exact old `219b3e88`: **3 expected failures / 4 passes**, at the 30/60/120 Hz render-opportunity assertion: `no burst/body overlap at the render opportunity`, actual visible holder count `2`, expected `0`. The old source/tree and both negative-run logs are preserved. Final negative-log SHA-256: `b634c8ae36241c5419d141cd11536c5d735803bd49b9559050221265b946c39d`. An initial test-helper cross-VM array-prototype assertion was normalized with `Array.from` before the final negative and positive runs; no runtime fix was involved in that helper correction.
- Reproduction: in a separate worktree of old `219b3e88`, copy only the new order test from the follow-up, then run `node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/killer-wail-pair-retirement-order.test.mjs`. The same test passes with the follow-up runtime.
- Publication stage is limited to a fast-forward of the review candidate branch after source verification. PR1854 and main are outside the write scope. Browser/minified-build acceptance, native frame timing/appearance and the remote terminal contract remain unresolved.
