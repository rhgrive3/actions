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

## Third review tranche

- Reefslider ignored its explicit Special Power Up blast mappings. Activation now captures paint radius `[7.51,8.26,9.012]` and damage-distance multiplier `[1,1.1,1.2]`. Damage magnitudes stay 220/70. Actual victims inside/outside the changing range and activation-snapshot stability pass. Existing clustered paint stamps remain <=3.74 and no-special credit; this does not prove the tile union has the exact source outer silhouette, nor repair the separately owned terrain-projection problem.
- Zipcaster/Reefslider raw original blob identities and five relevant source entries are now included in the mandatory Sub/Special source verifier (4 files / 30 explicit fields).
- Optional ranked Last-Ditch compatibility uses the public PR1223 contract without importing or altering that PR. The host reads its own current engine. Followers require a receipt from an actual revision-advancing restore by the current host for the current match. Forged sender, rejected payload, old match/revision, changed engine/counts and host migration cannot reuse a receipt. Turf ignores objective counts. Authoritative count and overtime conditions reach actual Actor ink curves.
- Count AP follows the maintained Sendou analyzer formula `floor(18/21 * (51-count))`, bounded 0..18: 50 gives 0, 49 gives 1, 40 gives 9, 30 gives 18. Source: https://github.com/sendou-ink/sendou.ink/blob/3373f97df008420f5897f79eaf4f1380598733f2/app/features/build-analyzer/core/specialEffects.ts. This is community analysis, not extracted Nintendo controller code. PR1223 itself remains Draft and unmerged; full actual ranked/network integration must be rerun when composed together.
- Ranked PR1223 currently copies `weapon.weight || 'middle'` into frames but no rule consumer was found. This change does not invent an alias for an unproved use of that field.
- Existing conditional-gear network test modeled the superseded shooter-owned Splat Bomb hit path. Updated it to the actual composed victim-owner explosion and rejection of remote hit guesses; no production authority guard is relaxed.
- Initial head 1251a5c passed its seven-claims job, including the compiled 195 weight/AP Actor checks in Chromium and WebKit. Later-head CI remains separately required. Added browser checks for all65 sub-ready movement and native Zipcaster drain plus compiled Tenacity gauge.
- Read-only downloaded PR1223 commit `61c3a954791ae6571e3c317523566c3a809b20b6` pure engine/network modules were exercised against the actual composed Actor: current host restore grants 18 AP, spoofed sender does not, malformed next revision stays rejected and match change removes the bonus. Optional seam test: 4/4 pass with `INKWAVE_RANKED_REFERENCE`; these source files are not added to this PR.

## Fourth review tranche

- Splattercolor Screen also used the fixed middle movement speed (3.18) at every AP. Source WallParam.MoveSpeed `[.04,.053,.06]` is now sampled at activation and converted by 60. Device presentation events carry bounded AP, and remote replay reconstructs the same 2.4..3.6 speed. Its 60F startup/560F movement boundary is interval-integrated.
- Catalogue world effects ran outside the already installed projectile wrappers. An actual composed Booyah explosion reduced a high-HP Actor by 66 / 128.7 / 257.4 at 30 / 60 / 120 Hz respectively. A catalogue-world-only 60 Hz accumulator makes the real HP loss 128.7 at every rate. This preserves the existing 60 Hz sample count; it does not newly prove the retail expansion-hit silhouette. Native projectile movement keeps its original integrator. Clear resets the accumulator.
- Recycled special projectiles retained catalogue blast-paint identity, damage-aging and missile-target fields. Clear these fields when the native pool supplies a new projectile, so subsequent main shots cannot inherit a retired special's behavior.
- Screen owner/remote AP, startup/end travel and catalogue-world damage pass source tests. Before the pool-field addition the broad composed special/catalogue/kit suites passed 286/286; the pool reuse regression passes separately.

## Fifth review tranche

- Inkjet ignored Special Power Up's explicit damage-distance curve `[1,1.15,1.3]` and paint curve `[3.2,3.6,4]`. Both now use activation AP; direct damage stays 120. Native stamp radii remain capped at 3.74; the existing supplemental disk receives the full radius. Exact union silhouette is still not established.
- The native generic projectile footer already transmitted Special Power AP but the generic ghost path did not apply it before rebuilding a special descriptor. It now restores validated AP before reconstruction and resets the pooled AP field. Actual NetMatch JSON round trips at 0/10/57 AP retain the Inkjet blast bands; out-of-range AP is rejected.
- Retained the catalogue projectile wire identity also repaired independently by the paint branch. This is a shared compatibility prerequisite, not a separate claimed paint-branch discovery. Combined integration must preserve its direct-only descriptor, no-special gauge flags and expanded pool cleanup.
- Added original Inkjet blob and two explicit curve entries to the source gate: six files, 33 fields pass. The first source entry omits SpecUpType and uses the source default PaintRadius; no invented explicit enum is asserted.
- Catalogue world clock ignores invalid/negative elapsed time, clears its remainder on reset and exits when the last world object expires. The production render loop bounds dt to 1/24 second; no arbitrary time-dropping clamp was added.
- Source all-specials: 28/28 passed. Real-browser and latest-head CI results remain separately required.
