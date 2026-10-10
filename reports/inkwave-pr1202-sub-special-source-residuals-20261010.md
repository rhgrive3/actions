# PR1202 Sub/Special source residuals

Baseline: `7d74919cf78dd203e7bd0d1b80eeaf451eaec0f8`. Changes are for the separate `fix/pr1202-data-fidelity-20261010` branch. No main/PR1202 branch update or merge.

## Evidence and limits

Compared the actual parameter files in the user's Drive archive **Splatoon-public-sources-part-02-of-19.zip** against the extracted local bytes. Both matched byte-for-byte. Drive: https://drive.google.com/file/d/17DwQhUw8MPASjNQ3TQn3k_EIB6igrfxW/view

The target is `Splatoon3-resources/splat3/data/parameter/1130/weapon/`, Splatoon 3 **11.3.0**, ordinary versus sub-weapon tables (not Hero/Mission/Rival/Coop variants). Public pinned source counterpart: `Leanny/splat3` at `7280ff9cde8bb1c5dcef46c700c326471584d2e6`.

- `WeaponBombCurling.game__GameParameterTable.json`: SHA256 `aa1d1c0a13d13c4f5d236524fb0452ccf6bfadf736274cb207181cb75b8fe815`.
- `WeaponBombSuction.game__GameParameterTable.json`: SHA256 `a64c24c3167e5a7ec201cf8377fbeb3f6f8870ecd0be4549c50b9c3c57e840f7`.

Public field sources: [Curling](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponBombCurling.game__GameParameterTable.json), [Suction](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponBombSuction.game__GameParameterTable.json).

Only small derived gameplay constants are included in code. No archive, decompilation source, or raw data file is added. This is parameter-data comparison and real INKWAVE runtime testing, **not** proof of Nintendo's exact native integration algorithm, retail Switch behavior, or rendering.

Conversions follow the repository's existing calibration: 60 reference frames/s; velocity ×60; gravity ×3600; source radius/offset lengths use existing world-unit mapping. Existing horizontal player carry and linear intermediate Curling charge remain INKWAVE calibration. The patch does not change them or claim retail-exact parity.

## Three actual fixes

1. **Curling launch consumed Splat Bomb's vertical tuple.** `SpawnSpeedY=0.12/F` and max-charge same value become 7.2 world units/s, rather than 14.4. Curling's `YPlusRate=2`, `YMax=0.16/F` and `SpawnSpeedYWorldMin=-0.5/F` are used within scoped Curling launch/preview calls. Falling velocity remains non-inherited (`YMinusRate=0`). Suction/Splat/Storm retain their existing tuples. Scope restores even if native launch throws. Horizontal carry remains unchanged pending independently verified axis semantics.
2. **Curling release fuse was initialized but did not run in the air.** The shared Splat contact guard only exempted `rolling` Curling. It now exempts the Curling mode through flight too, preserving source-backed release lifetime of 210F at tap and 90F at full charge. Suction still requires sticking, and Splat still requires contact. Owner/replay lifetime stays on the existing native countdown. Related completed issue [#1099](https://github.com/rhgrive3/actions/issues/1099) was inspected for ownership and a residual-work comment added.
3. **Splat overlay corrupted the newer kit-specific paint owner.** Full installation intercepted the first six Suction/Curling stamps, then appended sixteen Splat stamps. Suction produced 26 effective marks instead of 16. The overlay now delegates known authoritative Suction/Curling records directly to their existing native kit paint owner. Curling's 1+12 and charge-selected center radius remain intact, turf is credited once, Splat keeps 1+15, ghosts stay non-authoritative. Related completed issue [#1123](https://github.com/rhgrive3/actions/issues/1123) was inspected and residual ownership noted.
## Two candidates excluded after source review

- **Curling FlyPositionAirResist .05866** exists in the table, but no inspected native/decompiled function establishes whether it affects all velocity axes, its order relative to gravity, or fractional-frame behavior. A proposed all-axis exponential retention law was removed. Both actual flight and preview preserve the baseline integration. Further work requires the matching native function or controlled flight measurements before selecting an algorithm.
- **Suction PaintOffsetY .45 / satellite OffsetY .5** exist in the table, but their world-Y versus contact-normal semantics have not been established from native source. Replacing the existing .1 normal offset could change wall/ceiling receiving surfaces. The proposed normal-projection change was removed, preserving baseline paint locations and existing floor/wall/ceiling calibration. Resolve coordinate-frame semantics and actual paint-surface tests before changing these offsets.

These are unresolved evidence gaps, not delivered fixes. No raw decompilation is published.

## Verification

New test: `patches/splatoon3/tests/sub-special-source-residuals.test.mjs`, actual adapted native Projectiles, full runtime installer and production adapter composition. Display/audio/terrain interfaces are stubbed; the projectile/fuse/paint code is real.

- Negative control: replacing the three changed production files with exact baseline versions made all three retained primary tests fail: Y14.4 vs7.2; airborne timer never detonates; Suction26 vs16 stamps. The earlier five-candidate experiment is not the delivered patch.
- Positive: three primary tests plus ghost and exception-scope controls, 5/5 passed. Adjacent tests plus these controls: 58/58 passed.
- Adjacent coverage: kit-subs, sub-special-fidelity, sub-special-fidelity-source, bomb-contact-fuse, plus new tests.
- Lifetimes replayed via fixed simulation at 30/60/120Hz rendering. Float boundary tolerance at most one 60Hz tick; no claim of exact retail timer rounding.
- Arc's second vertex matches the same two free-flight integration steps at nonzero pitch.
- Real kit explosion verifies minimum/full Curling radius, Suction radius/count, one credit, Splat control and ghost paint suppression.

Browser/GPU output, network transport between real devices, and Switch side-by-side recording were not run. The parent owns final aggregate and emitted-build validation after combining all lanes.
