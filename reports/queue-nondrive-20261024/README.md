# INKWAVE: non-Drive optimization queue, 2026-10-24

## Scope and isolation

Library /INKWAVE Issue Queue/ contained **384** queue Markdown files, of which **358** exact filenames were already present in the Google Drive unprocessed-queue folder. This leaves exactly **26 not-in-Drive** candidate tasks assigned to this independent branch. The 358 Drive items are handled in PR #1861 and were not edited here. No Drive uploads, background tasks, or main merge.

## 26-ticket disposition

| Queue task (filename stem) | Disposition | Updated source |
| --- | --- | --- |
| zevant-workers-ci-sparse-checkout-omit-199mb-modeler | Done | .github/workflows/zevant-account.yml |
| ranked-rainmaker-pickup-avoid-readonly-position-copies | Done | ranked/rainmaker.mjs |
| ranked-tower-fuse-rider-latch-and-offset-prepass | Done | ranked/world.mjs |
| prevent-audio-worker-fallback-render-exception-from-stalling-warm-queue | Done | audio/bank.mjs |
| native-source-compact-inactive-display-during-obj-parse | Done, regression fixture | native-stages/runtime/source-convert.mjs; source-worker.mjs |
| native-ink-partition-avoid-transient-tile-index-arrays | Done | native-stages/runtime/native-ink-chunks.mjs |
| native-ink-chunks-drop-retained-identity-index | Done | native-stages/runtime/native-ink-chunks.mjs |
| mobile-swipe-aim-cache-touch-sensitivity-power | Done | inkwave-public/src/core/mobile.js |
| source-controller-defer-intermediate-mixupper-fk | Done | motion/source-controller.js |
| gait-targets-sparse-six-bone-buffer-allocation | Done | motion/gait-targets.js |
| catalog-bloblobber-cache-bounce-param-per-unit | Done | main-weapon-catalog.mjs |
| tenta-missiles-hud-bracket-constant-corners-and-phase-hoist | Done | special-vfx.mjs |
| network-interpolation-rolling-quantile-avoid-resort | Done | inkwave-public/src/net/netmatch.js |
| lobby-set-neon-share-breathing-sine | Done | inkwave-public/src/game/lobbySet.js |
| weapon-lod-qa-overlapping-visual-artifacts | Done | .github/workflows/inkwave-weapon-lod-boundaries.yml |
| pages-native-stage-production-input-missing-push-trigger | Already fixed in main | .github/workflows/pages-inkwave.yml already has native-stages push path |
| ranked-tower-sync-reuse-yaw-sin-cos-per-call | Done | ranked/world.mjs |
| ranked-hud-cache-attached-stylesheet-presence | Done | ranked/ui.mjs |
| hud-timer-turf-counters-skip-unchanged-number-formatting | Done | inkwave-public/src/ui/hud.js |
| native-constrained-reentry-avoid-repeat-obj-conversion-with-bounded-derived-artifact | **Deferred, not fixed** | Requires verified derived binary and iPad low-memory A/B measurements |
| native-source-obj-lines-typedarray-indexof-newline-scan | Done | native-stages/runtime/source-convert.mjs |
| body-balance-share-strafe-clamp-across-rotation-gains | Done | motion/body-balance.js |
| classify-permanent-recorded-mp3-404-and-bound-refetch | Done | audio/real-s3-loader.mjs |
| splattercolor-screen-reuse-world-history-clones-per-source-tick | Done | all-specials.mjs |
| tenta-missiles-lock-preview-reuse-target-screen-projection | Done | all-specials.mjs + special-vfx.mjs |
| ink-flight-runtime-splash-plan-direct-ordinal-count-cache | Done | inkwave-public/src/game/inkFlight.js |

**Totals: 24 implemented, 1 already fixed in main, 1 deferred (still open).** The deferred reentry item was not bypassed by simply enabling IndexedDB derived-cache reads on iPad: that has an established out-of-memory risk. A separately authenticated, bounded, per-stage derived artifact and cold/warm/offline iPad tests are prerequisites. No verified built binary is available on this branch.

## Native OBJ parser invariants

The browser worker opts into active-only display allocation while retaining inactive-source validity checks, original source ordinal numbering, bounds and OBJ index validation. Collision/BVH/paint consume the same active object geometry. The manifest records full original geometry in sourceGeometry and compacted output in geometry, matching the existing post-worker-compaction contract. The existing post-conversion compact function stays for legacy paths; source placements use the old noncompact parser.

The isolated Node regression fixture tests all ten binary output arrays against a reference reconstruction of the pre-change worker packing. It also checks multi-object ordinal and bounds preservation, BOM/CRLF byte input, fully active geometry and malformed inactive geometry.

## Validation and limitations

The PR-only Non-Drive queue regression workflow runs Node syntax checks on 19 changed source files and Node native-OBJ parity fixtures. Neither source review nor green unit tests alone prove the native five-stage live hashes, iPad mini 6 peak-RAM improvement, FPS p95, screenshots, online sync, or full 65-weapon matrix. These performance/real-device checks remain acceptance gates before merging. The previous queue 358-item Drive PR is intentionally isolated.
