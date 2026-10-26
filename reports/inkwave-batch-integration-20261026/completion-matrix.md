# INKWAVE four-worker bug batch: completion matrix

Base: `48511150bbaeab182dd04c712d39bd5b26df18f3`. All four workers used this
base. This is a partial draft integration, **not completion or merge approval**.
Worker-head evidence is distinguished from final combined-head checks below.

| Request / behavior | Actual implementation in this draft | Evidence and limits |
| --- | --- | --- |
| Non-Splat Charger charge sound | Shared selected Splat rise, real asset readiness at START, pitch-preserving offline duration variants; own charge/range/ammo/shot clocks retained, including scopes/Bamboo/Pencil | Prior emitted real AudioContext output 8/8, missing-asset negative control, source and emitted regressions. Fixed-90bb native touch E-liter also reached full, played its recorded 1× / 1.863016 s worker phrase, measured nonzero charge-gain PCM and fired a real head. Splatune 2 proxy is not claimed S3 11.3.0 sound identity; physical speaker output unmeasured. |
| Non-Splat Charger airborne stripe paint | Shared native Splat falling-paint leases; high samples remain visible and claim turf on landing instead of projecting immediately or disappearing | Real production/emitted projectile, draw-buffer and final-turf checks at 30/60/120 Hz. Ordinary-input short flight capture incomplete in software Chromium; no original-engine gravity/timing equivalence claim. |
| Bow two-stage charge | Source-specific Mid/Full stages, stage sound/pulse, two successive fills of the existing native annulus; release/reset/switch cleanup. Existing charge-dependent arrows/damage/speed/spread/cost/keep/explosions retained | Tri 30/72F, LACT 12/34F, Fluid 40/80F from pinned source. No added circle/marker/path/CSS; native track/arc colors remain unchanged after original-pixel review. Component 15 cases passed. Fixed-90bb native touch Tri crossed 0/1/2, updated first/second/full DOM progress, emitted both boundary cues and released three arrows. Mid-stage captures are canvas-only, so they do not prove HUD pixels. Exact original phase fractions, complete cycle and timing remain unobserved. |
| Downward Shooter / Dualies guide | Guides stop on the actual head's first field contact; native launch/integrator/contact and moving-actor cache inputs are used | Worker source/emitted negative controls and actual-head comparison; combined source recheck. Original outer-guide pixel/retail timing comparison remains incomplete. |
| Repeated Shooter-guide cost | **Open regression; not performance-approved.** Reticle owner is preparing safe reuse/invalidation alongside the actual owner-projection diagnosis | Independent review of fixed 90bb measured 120 identical horizontal Shooter calls → 960 sphere sweeps (baseline 0), downward calls → 120; static Dualies cache → 0. Integration adds no competing cache change. World-revision invalidation is independently under review. |
| Collision revision producers | Audited Level/NativeLevel append/index rebuild and actual Tower transform/removal publish collision revisions; queries and unchanged Tower transforms do not | Producer `fee0c005f` integrated separately from the pending consumer. Unknown worlds remain unversioned; invalid/exhausted revisions disable reuse. Source mutation/contact and emitted regressions pass. This supplies an invalidation contract, not a completed guide-cost fix or retail UI evidence. |
| Dualies shot-kick jump / accumulated effects / turret display | Projection has a parent SVG group; kick has one bounded Animation per hand; cleanup and DOM/cache reset; merged guide follows actual turret target | Worker controlled emitted browser active-kick center 60.55px → 0, animation owners 50/hand → 1 and hidden → 0, native admitted roll display 1 then 2. Controlled component evidence is not ordinary-input or original pixel proof. |
| Horizontal Shooter inner-marker visibility | **Unresolved.** The new `contact age > ShotGuideFrame` hide condition was removed from production in integration commit `1ad7af7b3`; existing full-flight admission is preserved | `ShotGuideFrame=8` is source data, not original UI cutoff evidence. Independent reticle review supplied a concrete counterexample: an actual projectile launched from 1.25 m contacts a wall 12 m away at 9F with prediction error 0, but the proposed 8F cutoff hides that valid obstacle marker. This is additional evidence against blanket hiding; it does not solve the horizontal-floor owner projection. Tests retain contact accuracy without certifying the heuristic. |
| Walking step and speed presentation | Monotone visual step correction and smoothed display speed; gameplay walking/collision remain unchanged | Worker source/CPU and controlled render checks, combined 17-case checkpoint. Original unpublished locomotion curves and live hardware comparison remain unverified. |
| Roller downhill painting | Native and catalogue continuous floor tracing share the contact result, preserving support and paint along a continuous downhill surface | Real contact/turf at 30/60/120 Hz, combined source and emitted checks. No assertion of recovered Nintendo collision implementation. |
| Roller flat-ground tracing cost | Existing cheap support test now precedes detailed collision tracing; the two support predicates and independent paint-continuity gate are preserved | Verified worker follow-up `53c472776` integrated. Combined source 20, selected paint-boundary 5 and emitted 8 cases passed. Flat 4096 calls use zero detailed rays and 8192 queries; downhill still traces and cliff/air/gap checks remain. Fresh controlled emitted browser passed at 30/60/120 Hz. This is call-count evidence, not a device FPS claim. |
| Low-speed floor/wall swim splash | Bounded surface-rooted curls and ballistic drops; lifecycle, stealth, air and cadence handling | Worker source/emitted and controlled rendered surface checks. Shape/low-speed/wall curves remain INKWAVE calibration, not measured retail agreement. |
| Mop / Dread Wringer low births | Both delayed streams use the established body-relative Slosher launch fallback; source velocity/lift/range/damage/paint retained | Source/emitted posed and delayed-birth checks at 30/60/120 Hz. Body fallback is INKWAVE calibration, not a measured original muzzle joint. |
| Splat / Curling / Autobomb cues | Rolling Splat warning follows current supported surface and clears stale support; Curling forecast removed; Autobomb landing acquisition rim uses existing search radius/window | Worker source/emitted cue and render-readback evidence; final combined tests selected. Native fuse/collision/search/paint are unchanged. Thin-rim/fade pixels remain unmeasured retail art. |
| Hissen main blob size | **Unfinished; no size fix is claimed.** | New private original references are under review. No reference media or private locator is added to this repository. |
| Slosher falling floor droplets | **Unfinished; no family-wide visual correction is claimed.** | Existing native render/readback evidence is diagnostic only; generic falling bead shape is not accepted as original agreement. |
| Machine / Bloblobber / Explosher first falling-splash distance | Replace the absent Shooter-nearest-field fallback distance 1 with each explicit Slosher first-rate interval × runtime spacing, using the already admitted seed | Safe `f41a353` + `a40ca317` above accepted `67ea075`; rejected visibility candidate excluded. Distances .36–1.26 / 3 / 1.55–1.705; no extra RNG draw or suppression of positive-radius drops. Combined phase/protected source 28 and selected emitted checks pass. Main physics/damage/count/size remain preserved. Generic travel metric and original silhouettes remain unverified. |

## Integration and evidence ownership

- Charge/audio/flight/stages: `inkwave-charge-flight-bow-2026-10-26.md`.
- Movement: `locomotion-surface-20261026/README.md` and the four verified
  commits ending at `6142e49045700b7c8ad70a902f963c1a64fe8c70`.
- Reticle: `shooter-dualies-projection-20261026.md`, verified source/evidence
  commits plus strict fixture follow-up `ad38e1f96bb2938f879b7fd0276f344bdbee65c7`.
  #575 keeps all six event keys and normal/turret/left/right/dedup assertions.
  The later integration removal supersedes historical cutoff screenshots/tests.
- Mop/bombs: `slosher-bomb-cues-20261026/README.md`, verified commits ending
  at `67ea07501387f282464ac8b76d93842650c976d1`.
- Merge conflicts were limited to source imports, adjacent floor tracing,
  build-only registrations and append-only behavior-report entries. Both
  Charger drops and movement contact tracing were retained.
- No hair/model editing, security changes, storage cleanup, private reference
  media, manual CI launch or unrelated open-PR import is part of this batch.

## Final combined checks and release state

The final combined source/build/emitted/browser receipt will be recorded in
`final-validation.json` with exact commit and content/input hashes. Earlier
branch-head counts and the prior `checkpoint.json` do not establish that later
combined head passed. Ordinary-input limitations, original comparisons and
hardware checks above remain open even when component/CPU checks pass.

The initial partial branch was published before the flat-ground cost correction.
`pre-flat-fastpath/` records source 22, emitted 19,
real audio 8/8 and corrected-style HUD component 15/15 checks, plus a 1490-input /
2194-artifact identity audit with zero mismatches. This is bounded intermediate
evidence, not final-head CI or completion of the unfinished rows.

`post-flat-fastpath/validation.json` records the fast-path fix combined with
new upstream main `ce34bf34359ca5e8ee82d1effc50e649783a1d3d`. Source 20,
selected paint-boundary 5 and emitted 8 checks passed. The controlled browser
kept all 60 observed downhill contact/paint ticks at 30/60/120 Hz, with matching
1074 cells and no browser errors. The new optimized build has 1490 input /
2194 artifact hashes with no mismatches. Audio/HUD evidence is carried only
for 428 byte-identical emitted artifacts, not presented as newly replayed.

`native-touch-90bb/` adds one bounded ordinary shipping-touch check of that fixed
historical build: trusted menus/loadout/Fire, live E-liter recorded audio and
shot, native Tri first/second/full HUD progress and three-arrow release, with
zero page/pointer-lock errors. Browser sandbox remained enabled in one approved
command-sandbox exception. Render snapshots missed E-liter's short head and all
falling drops; mid-stage canvas PNGs omit the DOM HUD. This is neither component
input injection nor hardware/original pixel/performance proof. The new repeated
Shooter-guide cost above keeps the final head open.

`producer-phase-append/validation.json` records the next bounded integration:
producer `fee0c005f`, the safe two-commit Slosher phase branch and newer upstream
main `d88aa683074f8c85765308b274a04a03feeb99f6`. Producer/upstream source 29 and
selected Tower 2 passed before the phase append; phase/protected source 28 and
emitted 23 passed on the combined build. All 1490 inputs / 2194 artifacts match,
with build/budget/quick gates passing. New upstream Charger piercing and
moving-target changes were preserved, not reimplemented by this batch.
The reticle consumer is still pending, and no guide-cost acceptance is claimed.
Fixed-90bb touch evidence stays historical; no new browser/audio matrix was run.

The branch push succeeded. Draft PR creation was rejected twice by automatic
approval review, including one retry after explicit parent appointment. No PR
exists for this head branch; creation is stopped without an alternate API or
actor. See `publication-status.json` for the exact rejection and remote state.

Only one draft PR is authorized at this stage. Required automatic PR/main CI
must run on the eventual final head; no skip flags, weakened assertions, forced
merge or historical-head substitution is permitted. Merge is not authorized
until scope, unfinished items and exact final checks are reviewed.
