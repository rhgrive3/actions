# INKWAVE Weapons / Ballistics Fidelity — final completion review

## Final integration baseline and provenance

- latest main baseline used for completion: `83d6b088246f760a34d0921c118482bca7cde777`
- PR: #64 — `inkwave/astra-weapons-fidelity`
- supplied local-completion artifact: `INKWAVE-PR64-local-completion.zip`
- pinned Splatoon 3 reference version: **11.3.0**
- pinned public datamine: `Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6`
- source-mirror verification: **7 / 7 whole-file SHA-256**, **63 / 63 prior explicit fields**, **1,045 mirrored numeric leaves**
- mirrored raw data is provenance/input evidence, not a claim that every field's native engine semantics were recovered.

The PR was rebased semantically onto latest main without discarding later weapon work. Latest-main behavior retained here includes the Dualies humanoid first-shot gate, independent grounded Splatling pitch spread, Blaster terrain-splash handling, and the horizontal Roller 12+1 unit owner.

## Final scope

This workstream owns main-weapon projectile/gameplay ballistics for:

- Shooter
- Dualies
- Blaster
- Splatling
- Charger
- Roller
- Slosher

It does **not** own Character animation, movement physics, input admission, Bomb/Special gameplay, PWA/lifecycle, or network protocol shape.

## Production changes

- straight -> brake -> free projectile integration with exact lifetime clipping
- continuous swept player/world collision and nearest-obstruction chronology
- source-connected player and field collision-radius growth
- source-connected Shooter / Dualies / Blaster / Splatling projectile envelopes
- charge-dependent Splatling launch speed, with extracted endpoints and a labelled interpolation model
- **finite Charger flight** using pinned distance/speed/collision endpoints instead of the previous gameplay hitscan
- Charger paint spacing/radius driven by pinned source fields while retaining INKWAVE's rasterizer
- Roller horizontal 12+1 and vertical 1+2+2 unit construction
- Roller 4-band inside/outside damage ownership and age rejection
- Slosher source unit count **9**, per-unit delay/speed/damage mapping, and no unsupported synthetic radial splash damage
- existing projectile packet shape retained; no new weapon-only packet field

## Latest-main ownership preserved

The completion does not undo later main fixes:

- Dualies stable-human first-shot handling remains latest-main owned.
- Splatling horizontal and vertical spread envelopes remain independent; #64 only owns launch-speed/flight ballistics.
- Blaster terrain-splash admission/damage remains latest-main owned and composes with #64 projectile chronology.
- Roller keeps latest-main's 12 native + 1 near-unit creation. #64 owns source collision/flight/damage mapping for the resulting 13 projectiles and does not create a duplicate 14th projectile.

## Deterministic built-site measurements

Fixture conditions: fixed 60 Hz simulation, fixed seed, real production collision and scoring-paint rasterizer. Range geometry tests explicitly neutralize both Splatling spread axes; production Splatling spread behavior is separately regression-tested.

| Case | practical hit | full damage | paint max Z | projectiles |
|---|---:|---:|---:|---:|
| Shooter | **12.6** | **12.2** | **13.125** | 1 |
| Dualies normal | **12.3** | **11.5** | **12.625** | 1 |
| Dualies post-roll | **12.3** | **11.5** | **12.625** | 1 |
| Blaster | **13.5** | **10.8** | **11.875** | 1 |
| Splatling partial | **14.1** | **13.5** | **15.125** | 1 |
| Splatling first-stage end | **19.4** | **18.6** | **20.375** | 1 |
| Splatling full | **19.4** | **18.6** | **20.375** | 1 |
| Charger 0% | **9.8** | **9.8** | **13.375** | finite-flight job |
| Charger 25% | **13.5** | **13.5** | **16.375** | finite-flight job |
| Charger 50% | **17.3** | **17.3** | **20.125** | finite-flight job |
| Charger 75% | **21.0** | **21.0** | **23.625** | finite-flight job |
| Charger full | **24.8** | **24.8** | **26.625** | finite-flight job |
| Roller horizontal | **11.2** | **6.1** | **13.375** | 13 |
| Roller vertical | **16.4** | **6.8** | **15.875** | 5 |
| Slosher | **13.9** | **13.9** | **15.375** | 9 |

Distances are **INKWAVE world units**, not Nintendo metres or Nintendo range-display units. The 0.1 WU hit/full sweep has an inherent half-cell boundary uncertainty.

The latest-main Splatling spread helper consumes its normal spread RNG draws before projectile paint seed generation. The geometry fixture neutralizes both spread angles but intentionally does not rewrite production RNG ordering, so the paint golden is bound to the current production sequence.

## Network / local-remote parity

The completion keeps the existing projectile packet format. CI round-trips Shooter and both Roller modes through the real packet path and checks:

- unchanged packet shape
- reconstructed mode/collision profile
- local/remote trajectory drift bound
- remote ghosts do not apply authoritative damage
- no extra gameplay packet field is introduced for Roller mode

Finite Charger uses the existing `weapon:fire` event payload and transmitted `muzzle / dir / charge / len`; no Charger-specific protocol extension is added.

## CI / source gates

The final branch gates:

- full gameplay patch suite
- local-quality regressions
- motion/integration workflow regressions
- pinned primary numeric sources
- 7 full weapon JSON hashes + explicit-field checks
- completion raw-source mirror + runtime/profile binding checks
- syntax and local-reference verification
- production site build
- built-site weapon hit/full/paint golden measurement
- packet/local-remote parity
- active browser rendering/gameplay
- motion catalog
- Chromium/WebKit touch, input/lifecycle, identity and responsive UI

No acceptance test is skipped or threshold-weakened to make the completion pass.

## Remaining evidence limits

These are evidence limits, not source-integration blockers:

1. **Absolute Switch-to-INKWAVE world scale is not independently calibrated.** Relative/source-coordinate mappings are used and labelled.
2. **Brake/free defaults remain medium-confidence and unversioned.** They are source-guided model assumptions, not pinned 11.3.0 fields.
3. **Splatling interpolation and random-bias law are not recovered Nintendo code.** Endpoints/bounds are pinned; interpolation/distribution are labelled models.
4. **Charger finite flight now exists**, but the exact native nonlinear charge->speed interpolation, paint overlap/noise algorithm, and omitted terminal-paint default semantics are not independently reconstructed.
5. **Roller near-unit probability/position semantics** still inherit latest-main's source-guided owner where the public fields do not uniquely establish the native random law. #64 supplies source collision/damage/flight composition.
6. **Slosher aim/rasterization semantics** are source-guided; source unit delays/speeds/counts/damage are connected, but Nintendo's full paint/noise implementation is not recovered.
7. Physical Switch side-by-side footage is unavailable to the project owner and is **not a merge blocker**. No claim of physical Switch parity is made.

## #59 / #63 ownership

- #59 Movement owns player movement physics. Keep its movement implementation if composed with #64.
- #63 Shooter timing / Charger storage gates can compose with #64 projectile flight.
- #63's simplified duplicate Roller outer-fan damage path must not be stacked with #64. **#64's pinned v11.3.0 four-band outside envelope and 16-degree classification is the authoritative Roller damage owner.**

## Completion criterion

PR #64 is complete for source integration when its exact-head repository validate/browser CI is green. Remaining items above are explicitly unverified native/physical semantics, not hidden implementation TODOs.
