# INKWAVE: health HUD stability and redundant DOM writes

Base: `2cf6555297d2b8ba2af5d528cb2f25cbddf07a81` (main).

## Change and reproduction

The canonical producer is `buildHealthMarkers` and the renderer is
`updateHealthBars` in `patches/splatoon3/runtime/combat-info.mjs`.

- Render an injured ally at a stationary projected position. Previously, every
  frame assigned `hidden`, the position transform, the team colour and the fill
  transform again. Cache the last rendered strings by the pooled DOM node and
  change only fields whose rendered value changes. Reused/mutated marker rows
  and reassignment of a bar to another actor still repaint immediately.
- Render an empty health frame repeatedly after showing a bar. Previously,
  every frame set the already-hidden node to hidden. Set visibility only when it
  changes, including when the bar returns with a new HP value.
- Give the projected head a NaN component. Range comparisons previously let it
  through; invalid CSS could leave an old position visible. Reject nonfinite
  projections at the producer and hide invalid coordinate/HP rows at the DOM
  boundary. Invalid initial rows do not allocate nodes; valid later rows recover.

For an already-painted stationary bar, one second at 30/60/120 Hz previously
performed 120/240/480 redundant setter calls respectively; now it performs zero.
This counts instrumented DOM setters, not browser layout time or whole-game FPS.
The existing subpixel display precision, HP clamping and pooling are preserved.
The small per-bar cache uses a WeakMap and does not keep disposed nodes alive.

## Splatoon 3 comparison

Reference remains Splatoon 3 11.3.0, all weapons/gear: the Nintendo
[Ver.11 introduction](https://www.nintendo.com/au/news-and-articles/whats-new-in-the-splatoon-3-version-11-update/)
and pinned [SplPlayer table](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json)
are already recorded in the main behavior report and `health-bar-source.test.mjs`.
`RecvDmgReactDispFrm = 180` remains 3 seconds. Eligibility, concealment, line of
sight, private tracking, respawn lifetime, damage and scoring are unchanged.
These changes preserve the existing INKWAVE comparison baseline; they do not
establish Nintendo's rendering implementation, exact placement, reaction colour,
hardware performance or retail equivalence.

## Local validation

- Negative control on the unmodified base: all five new regression cases fail
  with actual assertions, including the invalid projected head passing through.
- Source health suites: 35/35, including canonical/fallback composition, private
  tracking, authoritative damage observation and the 3-second window.
- Adjacent score HUD, sub HUD, responsive tank and workflow tests: 36/36.
- Production minified build: esbuild 0.28.2; startup/offline budgets pass.
- Actual emitted helper: all five new cases and three canonical health
  composition cases pass; DOM setters are instrumented test doubles.
- Committed-candidate rebuild: emitted regression/composition and packaging
  18/18 with no skips, including input-commit identity and the offline runtime
  graph. Source plus adjacent plus emitted/packaging: 89 passing cases.
  A pre-commit build correctly failed the input-commit check because the runtime
  edit was not yet in HEAD; the committed rebuild resolved it.

The standard validation workflow includes a new emitted regression step after
the existing build, without removing existing gates. Chromium is not installed
in this local environment, so browser rendering and mobile hardware checks are
unverified. Full repository CI results are separate from these focused checks.
