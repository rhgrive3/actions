# Gear, weapon weight and movement audit — 2026-10-11

## Baseline and scope

Baseline main: d675364691c806af16c001d9cb745da5fdf559c2 (tree 57de973bbc84554001064ce23c77fffc2682dc6c, same content as 86bbf910a7a727c44140ffbba8c6bbe49c513627). Changes target the six-adapter composed public build, not the independent game prototype. PR401 and the separate projectile PR1220 are excluded. Paint ownership/network changes remain separately owned.

This is the first verified implementation tranche of the full gear/physics project, not a claim of complete retail equivalence.

## Primary reference

Pinned Leanny commit: 7280ff9cde8bb1c5dcef46c700c326471584d2e6, Splatoon 3 11.3.0.

- https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon
- https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/params.json
- https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json

All 65 weapon source hashes were checked against the existing pinned catalogue. Exact correspondence, omitted/default versus explicit values and source hashes are in `patches/splatoon3/reference/weapon-weight-1130.json`. Source extraction is reproducible with `scripts/generate-inkwave-weight-reference.mjs` and is required in CI.

## Verified defects and implementation

1. Catalogue numerical curation discarded string enums, including WeaponSpeedType. All added weapons therefore used medium movement. Original source identifies 15 Fast, 43 Mid, 7 Slow weapons. Speed derives from the full weight-specific low/mid/high curves, not a constant multiplier; all weights converge at maximum AP. Engine conversion retains the established 60 frames/second profile scale. Source units are not newly claimed to be physical metres.
2. Added catalogue weapons bypassed Run Speed Up while ordinarily walking. Their ordinary grounded speed now consumes the actor-local modifier. Explicit attack/roll/lunge/charge owners and the existing unverified ordinary-air steering policy remain separate.
3. Flow refresh overwrote movement modifiers with medium curves immediately after gear refresh. Both refresh owners now use the equipped weight, including conditional/drink/Drop Roller effective AP and the existing cap.
4. `-1` MainWeaponSetting sentinels could become negative main-ink consumption (Heavy Edit). Missing Low values discarded valid Mid/High overrides (e.g. Splattershot Pro, Tenta Brella). Resolve each absent or negative field independently to the shared source default. Main ink curves remain positive at all AP.
5. Corrected the displayed Sub Power Up Japanese label.

At zero AP the established engine speeds are Fast run 6.24 / swim 12.096; Mid 5.76 / 11.52; Slow 5.28 / 10.368. At the capped curve endpoint they converge to run 8.64 / swim 14.4. Intermediate Slow swim uses its distinct nonlinear middle value, not a scaled medium curve.

## Validation so far

- 65 actual composed Actors × 0/3/10/30/57 AP: grounded run targets, swim modifiers, equipment refresh and weapon switching passed.
- Heavy Edit and partial source override weapons at the same AP values: positive correct main-ink modifiers passed.
- Actual horizontal velocity: Fast/Mid/Slow, humanoid/swim, axial/diagonal, 30/60/120 Hz passed.
- Flow activation/cap/expiry preserves weight.
- Existing catalogue, Flow and hot-path suites plus focused cases: 38 passed.
- Production minified build passed; built-site focused tests: 6 passed (before the separate optional original-source assertion was added).
- Chromium/WebKit CI adds 195 real compiled Actor weight/run-gear checks. Pending exact-head CI; local Chromium cannot create sockets in this environment.

## Remaining review and verification

No full-project completion claim: all special-power mappings and unique effects, condition/lifecycle combinations, all 65 firing/charge/sub/special movement states, online gear transmission, acceleration/braking/rotation, native input/browser screenshots and controlled retail video remain under review. WeaponAccType is recorded separately; its source defaults and exact controller formula have not been proved, so no invented acceleration multiplier is applied. Existing calibrated ground/air acceleration is not described as retail exact. Ranked last-ditch conditions require coordination with the separate ranked-mode PR.

No GPU or browser FPS speedup is claimed. The added weight map is 65 small immutable entries; speed recomputation remains on the existing gear/Flow refresh boundary. Main merge and published-game verification are parent-owned and not yet complete.

## Second review tranche

- Added-catalogue movement also skipped the common grounded sub-ready movement owner. All 65 now preserve the existing throw-ready speed even under 57 AP; release returns to the weight/AP target.
- Tenacity was entirely missing. Added head-main-only equipment and owner-authoritative passive gauge for the current living-player deficit. Dead/remote/special-active/paused/attract/range/completed states are excluded. Passive gain does not award territory points and is divided by the internal SCU cost multiplier so SCU cannot amplify it. Two-team roster only; Tricolor is not implemented by this game.
- Rate provenance: Nintendo confirms the 5.0.0 buff (https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/); the testing Wiki reports 3.24 points/s per deficit and no SCU amplification (https://wikiwiki.jp/splatoon3mix/ギア/ギアパワー/分割3#tenacity). The scalar is community measurement, not an extracted 11.3.0 parameter.
- Zipcaster incorrectly used the middle Special Power Up values at every AP. Pinned WeaponSpSuperHook WeaponParam supplies hook consumption `[.04,.025,.015]` and per-second consumption `[.15,.1305,.12]`; converted once to the 150-unit special tank's percent-point convention and captured on activation. Actual hook input and time drain pass 0/10/57 AP × 30/60/120 Hz; ordinary ink is preserved.
- Ninja Squid actual swim, Drop Roller buff/expiry and Opening Gambit buff/expiry retain the equipped weight curves.
- Broad gear/movement/swim/respawn regression: 220 passed, one optional raw-source test skipped; that raw-source test separately passed with the fixture.
- Version reconciliation: the Wiki main-ink group list retains old Dynamo/E-liter stronger curves. Nintendo 11.1.0 (2026-03-18) nerfed Dynamo's Main Ink Saver and 11.3.0 (2026-08-19) nerfed E-liter's. The pinned 11.3.0 `-1` source sentinels therefore take precedence over the older Wiki group list. Official current history: https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/.
