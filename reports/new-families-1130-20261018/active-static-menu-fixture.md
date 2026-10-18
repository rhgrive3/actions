# Static menu / full-active observation fixture — 2026-10-18

The final production artifact is `2de467e5e75d67587e0e296e65f6fb7cc59cd3e829940349c35a0152aaa05298`.

The first unchanged full-active checker failed at `Accepted default: native loadout owner`. Exact source/artifact identity, native game boot, and trusted pointer/keyboard appearance selection passed; no page or console errors occurred. Original evidence is retained in `.ci-scratch/final-active/` and `/workspace/final-active.log`.

This is an obsolete observation setup: the static menu adapter intentionally replaces automatic `Showcase.showLoadout` with `Showcase.hide`. The existing accepted-default observer requires a mounted native3D owner before proving50 actual default models. The menu's intended resource behavior must remain hidden and must not be reported as an automatic3D preview.

The checker now validates the actual live loadout screen, shared menu/game API, real profile weapon, team colors and native Showcase. If hidden, it prepares a temporary observation owner with the public `Showcase.showLoadout` and native update clock, then invokes the unchanged observer. No replacement Character, private model mutation, forced geometry or skipped default is used. The `observeAcceptedDefaults.toString()` hash remains `6262b5d27a06082b2b793cf49ff1adb032462c15fcb200b5b95bcaaba0720e4c`, equal to the prior committed function.

Finally, the wrapper restores saved Showcase color values through the public API, hides the temporary owner and advances its native retirement. It checks hidden mode/zero mounted Characters and unchanged game/menu/profile/palette owners. Hidden internal weapon/style/opponent caches need not equal an uninitialized constructor `null`; the restored contract is hidden visibility plus unchanged player data. Empty hidden opponent caches use the actual team1 palette for the public Patternz guard during both preparation and restoration. Existing visible loadout owners retain their owner/visibility contract.

Primary and cleanup failures remain fatal. Aggregate cause/errors and partial results are serialized into evidence across the page boundary. The original observer's owner,50-row denominator, geometry, actual draw and cleanup assertions are unchanged.

Validation:46 unit tests pass, including actual default geometry/render negative controls, hidden setup, existing owner, foreign/detached menu, mismatched API/profile/palette, partial preparation failure, primary+cleanup failure, Color.copy restoration, live Showcase replacement and Patternz opponent-palette restoration. The full-active production browser rerun is recorded separately when complete. Runtime/build inputs are unchanged; this change affects only checker setup/tests/documentation.
