# INKWAVE four-worker bug batch: completion matrix

Base: `48511150bbaeab182dd04c712d39bd5b26df18f3`. All four workers used this
base. This is a partial draft integration, **not completion or merge approval**.
Worker-head evidence is distinguished from final combined-head checks below.

| Request / behavior | Actual implementation in this draft | Evidence and limits |
| --- | --- | --- |
| Non-Splat Charger charge sound | Shared selected Splat rise, real asset readiness at START, pitch-preserving offline duration variants; own charge/range/ammo/shot clocks retained, including scopes/Bamboo/Pencil | Prior emitted real AudioContext output 8/8, missing-asset negative control, source and emitted regressions. Splatune 2 proxy is not claimed S3 11.3.0 sound identity; physical speaker output unmeasured. |
| Non-Splat Charger airborne stripe paint | Shared native Splat falling-paint leases; high samples remain visible and claim turf on landing instead of projecting immediately or disappearing | Real production/emitted projectile, draw-buffer and final-turf checks at 30/60/120 Hz. Ordinary-input short flight capture incomplete in software Chromium; no original-engine gravity/timing equivalence claim. |
| Bow two-stage charge | Source-specific Mid/Full stages, stage sound/pulse, two successive fills of the existing native annulus; release/reset/switch cleanup. Existing charge-dependent arrows/damage/speed/spread/cost/keep/explosions retained | Tri 30/72F, LACT 12/34F, Fluid 40/80F from pinned source. No added circle/marker/path/CSS; native track/arc colors remain unchanged after original-pixel review. Final emitted component recheck required after that style correction. Exact original phase fractions, complete cycle and timing remain unobserved. |
| Downward Shooter / Dualies guide | Guides stop on the actual head's first field contact; native launch/integrator/contact and moving-actor cache inputs are used | Worker source/emitted negative controls and actual-head comparison; combined source recheck. Original outer-guide pixel/retail timing comparison remains incomplete. |
| Dualies shot-kick jump / accumulated effects / turret display | Projection has a parent SVG group; kick has one bounded Animation per hand; cleanup and DOM/cache reset; merged guide follows actual turret target | Worker controlled emitted browser active-kick center 60.55px → 0, animation owners 50/hand → 1 and hidden → 0, native admitted roll display 1 then 2. Controlled component evidence is not ordinary-input or original pixel proof. |
| Horizontal Shooter inner-marker visibility | **Unresolved.** The new `contact age > ShotGuideFrame` hide condition was removed from production in integration commit `1ad7af7b3`; existing full-flight admission is preserved | `ShotGuideFrame=8` is source data, not original UI cutoff evidence. Tests now verify contact accuracy without certifying that heuristic. |
| Walking step and speed presentation | Monotone visual step correction and smoothed display speed; gameplay walking/collision remain unchanged | Worker source/CPU and controlled render checks, combined 17-case checkpoint. Original unpublished locomotion curves and live hardware comparison remain unverified. |
| Roller downhill painting | Native and catalogue continuous floor tracing share the contact result, preserving support and paint along a continuous downhill surface | Real contact/turf at 30/60/120 Hz, combined source and emitted checks. No assertion of recovered Nintendo collision implementation. |
| Low-speed floor/wall swim splash | Bounded surface-rooted curls and ballistic drops; lifecycle, stealth, air and cadence handling | Worker source/emitted and controlled rendered surface checks. Shape/low-speed/wall curves remain INKWAVE calibration, not measured retail agreement. |
| Mop / Dread Wringer low births | Both delayed streams use the established body-relative Slosher launch fallback; source velocity/lift/range/damage/paint retained | Source/emitted posed and delayed-birth checks at 30/60/120 Hz. Body fallback is INKWAVE calibration, not a measured original muzzle joint. |
| Splat / Curling / Autobomb cues | Rolling Splat warning follows current supported surface and clears stale support; Curling forecast removed; Autobomb landing acquisition rim uses existing search radius/window | Worker source/emitted cue and render-readback evidence; final combined tests selected. Native fuse/collision/search/paint are unchanged. Thin-rim/fade pixels remain unmeasured retail art. |
| Hissen main blob size | **Unfinished; no size fix is claimed.** | New private original references are under review. No reference media or private locator is added to this repository. |
| Slosher falling floor droplets | **Unfinished; no family-wide visual correction is claimed.** | Existing native render/readback evidence is diagnostic only; generic falling bead shape is not accepted as original agreement. |

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

Only one draft PR is authorized at this stage. Required automatic PR/main CI
must run on the eventual final head; no skip flags, weakened assertions, forced
merge or historical-head substitution is permitted. Merge is not authorized
until scope, unfinished items and exact final checks are reviewed.
