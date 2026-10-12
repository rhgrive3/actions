# Exact paint work reduction during bot crowds

## Scope and provenance

User reported severe slowdown when bots gather, initially on iPad mini 6, and clarified that the issue likely affects other devices. This is an all-device CPU candidate, not an iPad quality downgrade. Baseline is public INKWAVE main `ed3a046574208471c5db5309e2469d263cacfdfd`, composed from `inkwave-public/` and the production adapters. All 689 baseline input SHA-256 values and emitted contentHash `5f967f1dc85094ccbca443250caa97207e81286a86a70a73768087580781ff95` were verified. No unmerged weapon models, source-motion changes, floor-shape PR1302, VFX changes or other gameplay proposals are included.

## Two narrowly bounded changes

1. CPU body membership can stop before evaluating narrow cosine-power spikes only when the five-sine subtotal and the remaining nonnegative contribution bounds prove inclusion/exclusion. Ambiguous cells retain the original addition order, multiplication, division and strict comparison. A 1e-12 guard retains near-equality cases. The exact original wobble formula is a fail-closed source anchor. GPU shader text is unchanged.
2. The main branch already proves that tiny ancillary pieces whose maximum signed-distance depth cannot exceed the ownership margin can never claim a sample. That pruning was restricted to native triangle stages. Apply only the same zero-contribution test to legacy block stages too. Do not extend native dead-cell exclusions or native mask caching to block stages. Keep every growth tick, submitted GPU command, and event.

The source-body adapter accepts either the current uncapped expression or an explicitly earlier-applied capped expression from PR1302. It preserves whichever expression it receives and applies that cap to every bound and fallback. This does not adopt PR1302. Both PRs edit the same adapter hunk and require reviewed conflict resolution plus repeated combined tests before integration.

## Behavior contract and Splatoon comparison

No weapon parameters, AI perception/path/cadence, bot count, hit geometry, shot timing, ink cost, paint shape, chronology, ownership order, score or growth timing is intentionally changed. The existing Split/Spatter/Drip signed-distance ownership rules remain the oracle. This is exact implementation equivalence to INKWAVE's current reconstruction; it is not a claim that the reconstruction's shape, physical area or timing equals retail Splatoon 3 11.3.0. No new retail numeric value is invented. Existing Switch-comparison/calibration gaps remain open.

## Verification

- Protected formula and duplicate-application rejection.
- Main and future-capped body predicates, historical0.97/current1 cutoffs, 35,000 randomized cases per combination, with each true boundary, neighboring Float64s, guard-edge samples, extreme radii, negative seeds/angles and nonfinite/degenerate scalar handling.
- Canonical full-runtime overlapping paint at30/60/120Hz: exact cell grid, ownership records/orders, score, special credit, RNG, growth and ordered GPU-command arguments.
- Ancillary old/new comparison for all8 kinds, block/native surfaces, floor/wall,6 pixel densities,5 radii,5 growth phases, masked/dead cells and newer competing paint orders.
- Existing local-quality hotpath, native mask, piece-local and temporal-ownership regression suites remain unweakened. Focused local run:33 tests passed,0failed,0skipped (plus native mask test separately passed).
- Dedicated CI requires exact-head Chromium and WebKit source/built WebGL ownership checks and unchanged existing paint workload A/B/B/A/A/B in both8-Actor aggregate and1-Actor continuous profiles. It requires equal work and exact canvas PNG hashes, not a tolerance.

## Measurements and limitations

An initial diagnostic dropped pending growth to locate body hot spots. It measured1.65s total and0.825s inside854 splats, but is explicitly **not** representative of the full paint workload; its apparent whole-CPU improvement is withdrawn. The replacement8-bot CPU fixture retains every60Hz paint growth update for600ticks. Actor display/audio and GPU rendering are excluded and clearly labeled; this is not full-game FPS.

The body-only optimization improved its measured phase but did not establish a whole-workload win. Full-growth sampling instead found ancillary cell/piece signed-distance evaluation dominated. A first combined candidate run reduced that Node workload from9.44s to5.62s while preserving every cell, ownership order, actor state/score, RNG state and41,850 GPU commands. This single comparison is provisional; final same-process-class ABBA and browser results must be reviewed before performance acceptance.

Local Chromium could not start: its process-singleton socket failed with EPERM in both available execution modes. No local browser result is claimed. GitHub-hosted software-renderer/browser results, once complete, must stay distinct from native iPad mini6/Safari measurements. Actual device FPS, thermals and full-match speedup remain unmeasured. Draft only; no merge or deployment.

## Why the ancillary bound is stage-independent

`pointInsideAncillary` uses a strict `SDF < -margin`, with `margin=1.5/ max(ppm,1)`. Coordinate stretching changes sample positions, not the nonnegativity of distance. Therefore:

- Type0 tapered segment: Euclidean distance is nonnegative, so inward depth is at most `max(ra,rb)`.
- Type1 circle and type2 transformed ellipse: inward depth is at most `radius`.
- Type3 drip: the stream is bounded by its widest half-width `w`; the bulb is bounded by `w*(1.2+.35*h2)*(.6+.4*dT)`. Existing growth constrains `dT` to[0,1].

All source hash outputs `h1/h2/h3` lie in[0,1). Ray base width is at most `.115*r`; radius-driven ray heads at most `.072*r`; pixel-driven heads at most `1.35*pixel`. Satellite radius is at most `.113*r`; spatter radius at most `max(.031*r,.9*pixel)`. Drip width is at most `.082*1.1*r`, and the bulb at most `.082*1.1*1.55*r=.13981*r`. Hence the already-adopted conservative global maximum `max(.14*r,1.35*pixel)+1e-10` applies to block faces exactly as to native faces. If it remains below `1.5*pixel`, no sample can pass. Individual-piece pruning retains an additional near-equality guard and unknown piece types. No result depends on a face being rectangular or triangulated, and the five interior sample positions are unchanged.

This skips CPU claims only. It neither changes shader pieces nor removes GPU-visible sub-cell details. The existing native-specific treatment of dead cells is kept behind the native condition; block dead cells retain their prior sampling behavior. Ownership comparison, order records and score credit remain untouched.
