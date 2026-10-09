# #716: one authoritative world-health display

## Reference and scope

The repository targets Splatoon 3 11.3.0. Nintendo's [version 11.0.0 overview](https://www.nintendo.com/au/news-and-articles/whats-new-in-the-splatoon-3-version-11-update/)
explains that damaged enemies display a temporary health bar, subject to cover
and ink concealment, with tracking/mark exceptions; injured teammates also have
bars. The article describes a short duration qualitatively. This change keeps
the existing three-second implementation and does not claim new retail timing,
tracking-distance, or visual-size measurements.

## Reproduction on integrated PR #1182

At `909a7014`, production `install.mjs` first installs `installUi` and then
`installHealthBarHud`. The former renders `Game._updateHud`'s existing
`healthMarkers`, whose producer owns authoritative damage age, private tracking,
team reveal, concealment and new-life state. The latter independently rebuilds
another health layer from the same actors.

With an injured enemy and an injured ally on screen, both layers render:
there are **four bars for two actors**. When the existing producer intentionally
returns no enemy row for wall climbing or an expired damage age, the additional
layer can continue showing that enemy. This is a disclosure error, not only a
cosmetic duplicate.

## Change

`runtime/health-bars.mjs` now lets the existing renderer exclusively own frames
with a `healthMarkers` array, including empty arrays. Any previous fallback DOM
and actor records are retired. Frames without the canonical producer retain the
existing fallback. Neither producer eligibility nor gameplay/HP/network state
is changed.

The production path consequently retains its existing Thermal Ink private
visibility, team-only marks, concealment, damage-age expiry, and freshly injured
first snapshot after a new life without a competing overlay.

## Verification

`health-bar-composition-716.test.mjs` composes real production-adapted Actors and
`buildHealthMarkers` with both real UI installer wrappers in production order.
The DOM, projection display target and underlying HUD method are test doubles;
this is Node composition evidence, not a browser screenshot or Switch test.

Before the change, two of three new tests fail: four bars instead of two, and an
extra visible enemy despite an empty canonical frame. After the change, all
three pass, including private tracking non-disclosure to a teammate, submerged
hiding, explicit reveal expiry, damage age, new-life first injury, and cleanup
when adopting the canonical path.

Focused command:

```sh
node --experimental-vm-modules --test \
  patches/splatoon3/tests/health-bar-composition-716.test.mjs \
  patches/splatoon3/tests/remaining-health-bar.test.mjs \
  patches/splatoon3/tests/score-hud.test.mjs \
  patches/splatoon3/tests/private-tracking.test.mjs \
  patches/splatoon3/tests/sub-hud.test.mjs
```

Result: **33 passed, 0 failed, 0 skipped**. Diff whitespace check passes.
No full build, CI wait, browser render, online-peer session, or retail-device
comparison was run for this bounded correction.
