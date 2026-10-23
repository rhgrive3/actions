import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertReceiptSeparate} from './inkwave-source-admission-cli.mjs';

// This is a source-only four-delta contract, not an epoch-wide hash allowlist.
// The official workflow event supplies the immutable base/head. All production
// outside these four paths must retain that actual base's bytes and file modes.
export const REVIEWED_SPECIAL_DELTA_MODE='main-reviewed-special-four-delta-pair';
const REPOSITORY='rhgrive3/actions',BASE_BRANCH='main';
const AREA='patches/splatoon3/runtime/area-special-vfx-clock.mjs';
const BEFORE=[
  {
    "path": "patches/splatoon3/runtime/special-motion.mjs",
    "mode": "100644",
    "sha": "643d89ab8f56c9378b661b4bdc5f0eceb440dc77",
    "sha256": "6935b628c7b5068ded7ea26658d89bb17503ab59d5f388cd3f37aa4cb834bd11"
  },
  {
    "path": "patches/splatoon3/runtime/special-presentation.mjs",
    "mode": "100644",
    "sha": "e15c40dc00487416c2f55ad3936b590562bec2b7",
    "sha256": "dede55c9359a2797cf8a31bc2572b9e1efc1ce18f6ee4c919c1f070e3ed4eac5"
  },
  {
    "path": "patches/splatoon3/runtime/special-vfx.mjs",
    "mode": "100644",
    "sha": "01911bf47b140ecd603d0080d065b280b37295df",
    "sha256": "fd906e61947494f8b5395f548a0b1d174afd6580ba3664da454445ee0a31f55d"
  }
];
// Independently read from actual runtime02154 and cross-checked against the
// runtime author's immutable before/after manifest. Source admission only.
const AFTER=[
  {
    "path": "patches/splatoon3/runtime/area-special-vfx-clock.mjs",
    "mode": "100644",
    "sha": "ab89853da521ba320d2973da32eed25bad824ff2",
    "sha256": "33a7665957f01ab4daa3e1b3b2871c8511432b11a315fa7bd6e2d77f4ba829df"
  },
  {
    "path": "patches/splatoon3/runtime/special-motion.mjs",
    "mode": "100644",
    "sha": "a4c86517cee3a825cc0160f6cf3088410ff27b32",
    "sha256": "a3194e8a627686c18893ddd9c8985bb051324f29b0cc2fddbe4d4d58d4860c50"
  },
  {
    "path": "patches/splatoon3/runtime/special-presentation.mjs",
    "mode": "100644",
    "sha": "90e867dba6bfc4e450b08d1478da0ae310e255a5",
    "sha256": "805133fad74e144c7f63890ad5f09ce648c04a870445e207ffa41de1d76034e4"
  },
  {
    "path": "patches/splatoon3/runtime/special-vfx.mjs",
    "mode": "100644",
    "sha": "c2e921d822f9dee48a330567d977be3f7b0cff81",
    "sha256": "49376532199d68253b2fb05c3ac54260d0650959bfea4ba13f8c13465f51b75c"
  }
];
// Sealed once from the before/after static builder dependency union, excluding
// the separately pinned reviewed four leaves. No caller can choose this fence.
const BUILD_CLOSURE_PATHS=[
  "account/dev/vite-plugins.mjs",
  "account/package.json",
  "inkwave-public/src/config.js",
  "inkwave-public/src/game/inkFlight.js",
  "package.json",
  "patches/loading-cache/adapter.mjs",
  "patches/loading-cache/vendor/acorn.mjs",
  "patches/local-quality/actor-weapon-input-adapter.mjs",
  "patches/local-quality/adapter.mjs",
  "patches/local-quality/added-ui-motion-adapter.mjs",
  "patches/local-quality/aim-profile-adapter.mjs",
  "patches/local-quality/audio-listener-adapter.mjs",
  "patches/local-quality/boss-hit-adapter.mjs",
  "patches/local-quality/bot-edge-guard-adapter.mjs",
  "patches/local-quality/bot-navigation-adapter.mjs",
  "patches/local-quality/bot-paint-observation-adapter.mjs",
  "patches/local-quality/bot-refill-release-adapter.mjs",
  "patches/local-quality/camera-fov-cache-adapter.mjs",
  "patches/local-quality/character-shadow-batch-adapter.mjs",
  "patches/local-quality/cloth-derivative-adapter.mjs",
  "patches/local-quality/collision-hotpath-adapter.mjs",
  "patches/local-quality/composer-format-adapter.mjs",
  "patches/local-quality/composer-target-adapter.mjs",
  "patches/local-quality/distance-hotpath-adapter.mjs",
  "patches/local-quality/final-count-adapter.mjs",
  "patches/local-quality/final-minute-music-adapter.mjs",
  "patches/local-quality/finish-tape-adapter.mjs",
  "patches/local-quality/firefight-tier-budget.mjs",
  "patches/local-quality/first-touch-source-adapter.mjs",
  "patches/local-quality/frame-order-adapter.mjs",
  "patches/local-quality/fx-actor-lifetime-adapter.mjs",
  "patches/local-quality/fx-empty-pools-adapter.mjs",
  "patches/local-quality/geometry-build-storage-adapter.mjs",
  "patches/local-quality/headgear-adapter.mjs",
  "patches/local-quality/hud-authority-adapter.mjs",
  "patches/local-quality/hud-snapshots-adapter.mjs",
  "patches/local-quality/idle-adapter.mjs",
  "patches/local-quality/idle-resources.mjs",
  "patches/local-quality/ink-micro-surface-adapter.mjs",
  "patches/local-quality/ink-ripple-presentation-adapter.mjs",
  "patches/local-quality/ink-volume-adapter.mjs",
  "patches/local-quality/issue-190-adapter.mjs",
  "patches/local-quality/issue-418-adapter.mjs",
  "patches/local-quality/issue-461-sfx-mute.mjs",
  "patches/local-quality/issue-480-camera-shake-fidelity.mjs",
  "patches/local-quality/landing-rigidity-adapter.mjs",
  "patches/local-quality/loading-screen-adapter.mjs",
  "patches/local-quality/lobby-quality-adapter.mjs",
  "patches/local-quality/lobby-resource-adapter.mjs",
  "patches/local-quality/lobby-slot-transform-adapter.mjs",
  "patches/local-quality/map-teammate-status-adapter.mjs",
  "patches/local-quality/match-retainer-adapter.mjs",
  "patches/local-quality/material-handoff-adapter.mjs",
  "patches/local-quality/medal-adapter.mjs",
  "patches/local-quality/menu-navigation-timer-adapter.mjs",
  "patches/local-quality/minimap-resource-adapter.mjs",
  "patches/local-quality/motion-fk-hotpath-adapter.mjs",
  "patches/local-quality/mural-atlas-adapter.mjs",
  "patches/local-quality/paint-hotpath-adapter.mjs",
  "patches/local-quality/perf-readout-adapter.mjs",
  "patches/local-quality/platform-adapter.mjs",
  "patches/local-quality/portrait-guard-adapter.mjs",
  "patches/local-quality/range-frame-pacing-adapter.mjs",
  "patches/local-quality/refl-skip-adapter.mjs",
  "patches/local-quality/resource-adapter.mjs",
  "patches/local-quality/result-continuation-adapter.mjs",
  "patches/local-quality/retarget-branch-update-adapter.mjs",
  "patches/local-quality/root-hair-spring-adapter.mjs",
  "patches/local-quality/runtime-frame-scratch-adapter.mjs",
  "patches/local-quality/s3-face-look-adapter.mjs",
  "patches/local-quality/s3-hud-look-adapter.mjs",
  "patches/local-quality/s3-squid-look-adapter.mjs",
  "patches/local-quality/scenery-bounds-adapter.mjs",
  "patches/local-quality/score-reticle-adapter.mjs",
  "patches/local-quality/screenfx-damage-reset-adapter.mjs",
  "patches/local-quality/screenfx-lens-release-adapter.mjs",
  "patches/local-quality/settings-ui-adapter.mjs",
  "patches/local-quality/shoe-read-transform-adapter.mjs",
  "patches/local-quality/showcase-alpha-adapter.mjs",
  "patches/local-quality/showcase-idle-pools-adapter.mjs",
  "patches/local-quality/showcase-shadow-adapter.mjs",
  "patches/local-quality/splatling-reticle-adapter.mjs",
  "patches/local-quality/squid-form-ease-adapter.mjs",
  "patches/local-quality/squid-motion-binding-adapter.mjs",
  "patches/local-quality/static-menu-adapter.mjs",
  "patches/local-quality/swim-splash-adapter.mjs",
  "patches/local-quality/team-special-signal-adapter.mjs",
  "patches/local-quality/team-wipeout-adapter.mjs",
  "patches/local-quality/tenacity-adapter.mjs",
  "patches/local-quality/texlib-adapter.mjs",
  "patches/local-quality/touch-relayout-adapter.mjs",
  "patches/local-quality/turf-lead-adapter.mjs",
  "patches/local-quality/ui-actor-lifetime-adapter.mjs",
  "patches/native-stages/adapter.mjs",
  "patches/native-stages/rule-availability-adapter.mjs",
  "patches/native-stages/runtime/build-config.mjs",
  "patches/native-stages/runtime/native-projectile-sweep.mjs",
  "patches/native-stages/runtime/source-catalog.mjs",
  "patches/native-stages/runtime/source-terrain-contract.mjs",
  "patches/network-replication/adapter.mjs",
  "patches/network-replication/catalog-paint-admission.mjs",
  "patches/network-replication/combat-provenance-adapter.mjs",
  "patches/network-replication/conditional-gear-adapter.mjs",
  "patches/network-replication/dodge-clock-adapter.mjs",
  "patches/network-replication/gear-loadout-adapter.mjs",
  "patches/network-replication/issue-1088-surge-adapter.mjs",
  "patches/network-replication/kit-paint-adapter.mjs",
  "patches/network-replication/kit-paint-admission.mjs",
  "patches/network-replication/paint-authority-adapter.mjs",
  "patches/network-replication/queue-recovery-adapter.mjs",
  "patches/network-replication/slosher-paint-admission.mjs",
  "patches/network-replication/sprinkler-contact-commit.mjs",
  "patches/network-replication/sub-birth-commit.mjs",
  "patches/network-replication/torpedo-birth-envelope.mjs",
  "patches/network-replication/torpedo-contact-commit.mjs",
  "patches/network-replication/torpedo-launch-set.mjs",
  "patches/network-replication/tower-paint-support.mjs",
  "patches/network-replication/transient-gear-adapter.mjs",
  "patches/practice-range/adapter.mjs",
  "patches/reliability/adapter.mjs",
  "patches/reliability/attract-adapter.mjs",
  "patches/reliability/combat-credit-adapter.mjs",
  "patches/reliability/combat-life-adapter.mjs",
  "patches/reliability/controls-adapter.mjs",
  "patches/reliability/gyro-adapter.mjs",
  "patches/reliability/gyro-invert-adapter.mjs",
  "patches/reliability/hold-cancel-adapter.mjs",
  "patches/reliability/home-jump-adapter.mjs",
  "patches/reliability/hud-adapter.mjs",
  "patches/reliability/inkwave-eight-followup-adapter.mjs",
  "patches/reliability/inkwave-six-followup-adapter.mjs",
  "patches/reliability/input-adapter.mjs",
  "patches/reliability/input-ownership-adapter.mjs",
  "patches/reliability/intro-adapter.mjs",
  "patches/reliability/issue-464-adapter.mjs",
  "patches/reliability/joycon-pair-adapter.mjs",
  "patches/reliability/map-gyro-adapter.mjs",
  "patches/reliability/map-look.mjs",
  "patches/reliability/map-toggle-adapter.mjs",
  "patches/reliability/menu-raf-adapter.mjs",
  "patches/reliability/mobile-adapter.mjs",
  "patches/reliability/navigation-adapter.mjs",
  "patches/reliability/net-adapter.mjs",
  "patches/reliability/net-hit-payload-adapter.mjs",
  "patches/reliability/pad-handoff-adapter.mjs",
  "patches/reliability/pause-adapter.mjs",
  "patches/reliability/pin-tap-adapter.mjs",
  "patches/reliability/queue-network-ui-adapter.mjs",
  "patches/reliability/queue-nine-final-adapter.mjs",
  "patches/reliability/respawn-navigation-adapter.mjs",
  "patches/reliability/results-adapter.mjs",
  "patches/reliability/special-barrier-adapter.mjs",
  "patches/reliability/special-water-adapter.mjs",
  "patches/reliability/start-adapter.mjs",
  "patches/reliability/sub-action-adapter.mjs",
  "patches/reliability/superjump-chain-adapter.mjs",
  "patches/reliability/touch-edge-adapter.mjs",
  "patches/reliability/touch-gyro-owner-adapter.mjs",
  "patches/reliability/touch-pointerlock-adapter.mjs",
  "patches/splatoon3/adapter.mjs",
  "patches/splatoon3/agent3-weapon-physics-adapter.mjs",
  "patches/splatoon3/assist-presentation-adapter.mjs",
  "patches/splatoon3/audio-adapter.mjs",
  "patches/splatoon3/body-proportion-adapter.mjs",
  "patches/splatoon3/brella-guard-facing-adapter.mjs",
  "patches/splatoon3/bubbler-map-adapter.mjs",
  "patches/splatoon3/camera-aim-controls-adapter.mjs",
  "patches/splatoon3/charger-field-adapter.mjs",
  "patches/splatoon3/charger-sight-cache-adapter.mjs",
  "patches/splatoon3/charger-surface-adapter.mjs",
  "patches/splatoon3/clothing-gear-adapter.mjs",
  "patches/splatoon3/combat-range-adapter.mjs",
  "patches/splatoon3/contact-recovery-adapter.mjs",
  "patches/splatoon3/enemy-ink-recovery-adapter.mjs",
  "patches/splatoon3/gear-sub-adapter.mjs",
  "patches/splatoon3/issue-405-adapter.mjs",
  "patches/splatoon3/issue-427-adapter.mjs",
  "patches/splatoon3/issue-435-adapter.mjs",
  "patches/splatoon3/issue-460-adapter.mjs",
  "patches/splatoon3/issue-460-gauge.mjs",
  "patches/splatoon3/issue-460-marker.mjs",
  "patches/splatoon3/issue-465-adapter.mjs",
  "patches/splatoon3/issue-477-adapter.mjs",
  "patches/splatoon3/issue-479-adapter.mjs",
  "patches/splatoon3/issue-481-adapter.mjs",
  "patches/splatoon3/issue-482-adapter.mjs",
  "patches/splatoon3/issue-483-adapter.mjs",
  "patches/splatoon3/issue-484-adapter.mjs",
  "patches/splatoon3/issue-719-dodge-adapter.mjs",
  "patches/splatoon3/issue-batch-1171-adapter.mjs",
  "patches/splatoon3/judd-result-adapter.mjs",
  "patches/splatoon3/kit-rescue-adapter.mjs",
  "patches/splatoon3/lobby-host-team-adapter.mjs",
  "patches/splatoon3/local-batch-01-adapter.mjs",
  "patches/splatoon3/main-ink-footprint-adapter.mjs",
  "patches/splatoon3/match-hud-adapter.mjs",
  "patches/splatoon3/minimap-bomb-fuse-adapter.mjs",
  "patches/splatoon3/minimap-dirty-adapter.mjs",
  "patches/splatoon3/movement-physics-adapter.mjs",
  "patches/splatoon3/pad-sensitivity-adapter.mjs",
  "patches/splatoon3/paint-ownership-adapter.mjs",
  "patches/splatoon3/paint-splat-pool-adapter.mjs",
  "patches/splatoon3/projectile-visual-adapter.mjs",
  "patches/splatoon3/ranked-adapter.mjs",
  "patches/splatoon3/ranked-ui-adapter.mjs",
  "patches/splatoon3/respawn-lifecycle-adapter.mjs",
  "patches/splatoon3/roller-depletion-adapter.mjs",
  "patches/splatoon3/roller-max-paint-adapter.mjs",
  "patches/splatoon3/runtime/action-admission.mjs",
  "patches/splatoon3/runtime/active-special-gauge.mjs",
  "patches/splatoon3/runtime/actor-motion.mjs",
  "patches/splatoon3/runtime/agent3-weapon-physics.mjs",
  "patches/splatoon3/runtime/all-specials.mjs",
  "patches/splatoon3/runtime/all-subs.mjs",
  "patches/splatoon3/runtime/alternate-weapon-kits-data.mjs",
  "patches/splatoon3/runtime/audio/authorized-samples.mjs",
  "patches/splatoon3/runtime/audio/combat-recipes.mjs",
  "patches/splatoon3/runtime/audio/kit-recipes.mjs",
  "patches/splatoon3/runtime/audio/load-deadline.mjs",
  "patches/splatoon3/runtime/audio/source-cue-registry.mjs",
  "patches/splatoon3/runtime/audio/weapon-recipes.mjs",
  "patches/splatoon3/runtime/blast-occlusion.mjs",
  "patches/splatoon3/runtime/blaster-flight-paint.mjs",
  "patches/splatoon3/runtime/bomb-motion.mjs",
  "patches/splatoon3/runtime/brella-aperture.mjs",
  "patches/splatoon3/runtime/brella-canopy-visual.mjs",
  "patches/splatoon3/runtime/brella-physics.mjs",
  "patches/splatoon3/runtime/catalogue-payload.mjs",
  "patches/splatoon3/runtime/catalogue.mjs",
  "patches/splatoon3/runtime/clock.mjs",
  "patches/splatoon3/runtime/clothing-gear.mjs",
  "patches/splatoon3/runtime/conditional-gear-network.mjs",
  "patches/splatoon3/runtime/conditional-gear.mjs",
  "patches/splatoon3/runtime/contact-recovery.mjs",
  "patches/splatoon3/runtime/crab-tank-aim.mjs",
  "patches/splatoon3/runtime/crab-tank-projectile.mjs",
  "patches/splatoon3/runtime/crab-tank-splash-visual.mjs",
  "patches/splatoon3/runtime/dry-ink.mjs",
  "patches/splatoon3/runtime/dualies-accuracy.mjs",
  "patches/splatoon3/runtime/dualies-guide-cache.mjs",
  "patches/splatoon3/runtime/dualies-slide-paint.mjs",
  "patches/splatoon3/runtime/final-damage.mjs",
  "patches/splatoon3/runtime/flow-effects.mjs",
  "patches/splatoon3/runtime/gear.mjs",
  "patches/splatoon3/runtime/haunt.mjs",
  "patches/splatoon3/runtime/intro-presentation.mjs",
  "patches/splatoon3/runtime/issue-465-blaster-startup.mjs",
  "patches/splatoon3/runtime/kit-autobomb.mjs",
  "patches/splatoon3/runtime/kit-big-bubbler.mjs",
  "patches/splatoon3/runtime/kit-composition.mjs",
  "patches/splatoon3/runtime/kit-ink-vac.mjs",
  "patches/splatoon3/runtime/kit-sprinkler.mjs",
  "patches/splatoon3/runtime/kit-subs.mjs",
  "patches/splatoon3/runtime/kit-trizooka.mjs",
  "patches/splatoon3/runtime/main-ink-footprints.mjs",
  "patches/splatoon3/runtime/main-knockback.mjs",
  "patches/splatoon3/runtime/main-weapon-catalog-data.mjs",
  "patches/splatoon3/runtime/movement.mjs",
  "patches/splatoon3/runtime/native-sprinkler-damage.mjs",
  "patches/splatoon3/runtime/object-gear.mjs",
  "patches/splatoon3/runtime/paint-ownership.mjs",
  "patches/splatoon3/runtime/player-hurtbox.mjs",
  "patches/splatoon3/runtime/private-tracking-render.mjs",
  "patches/splatoon3/runtime/private-tracking.mjs",
  "patches/splatoon3/runtime/projectile-collision.mjs",
  "patches/splatoon3/runtime/ranked-gear.mjs",
  "patches/splatoon3/runtime/ranked/strings.mjs",
  "patches/splatoon3/runtime/recovery-gate.mjs",
  "patches/splatoon3/runtime/replica-retirement.mjs",
  "patches/splatoon3/runtime/respawn-lifecycle.mjs",
  "patches/splatoon3/runtime/roller-contact-paint.mjs",
  "patches/splatoon3/runtime/roller-heavy-swing.mjs",
  "patches/splatoon3/runtime/roller-impact-paint.mjs",
  "patches/splatoon3/runtime/roller-max-paint.mjs",
  "patches/splatoon3/runtime/roller-model.mjs",
  "patches/splatoon3/runtime/roller-paint-calibration.mjs",
  "patches/splatoon3/runtime/roller-vertical-paint.mjs",
  "patches/splatoon3/runtime/roller.mjs",
  "patches/splatoon3/runtime/scoring.mjs",
  "patches/splatoon3/runtime/shooter-accuracy.mjs",
  "patches/splatoon3/runtime/shooter-impact-paint.mjs",
  "patches/splatoon3/runtime/shooter-movement.mjs",
  "patches/splatoon3/runtime/shooter-nearest-paint.mjs",
  "patches/splatoon3/runtime/slosher-nearest-paint.mjs",
  "patches/splatoon3/runtime/source-distance.mjs",
  "patches/splatoon3/runtime/source-shot-footprint.mjs",
  "patches/splatoon3/runtime/spawn-pose-motion.mjs",
  "patches/splatoon3/runtime/special-device-flight.mjs",
  "patches/splatoon3/runtime/special-models.mjs",
  "patches/splatoon3/runtime/special-presentation-owner.mjs",
  "patches/splatoon3/runtime/special-vfx-kit.mjs",
  "patches/splatoon3/runtime/splatling-jump-spread.mjs",
  "patches/splatoon3/runtime/splatling-radius-charge.mjs",
  "patches/splatoon3/runtime/splatling-startup-compat.mjs",
  "patches/splatoon3/runtime/splatling.mjs",
  "patches/splatoon3/runtime/storm-effects.mjs",
  "patches/splatoon3/runtime/storm-power.mjs",
  "patches/splatoon3/runtime/sub-mark-resistance.mjs",
  "patches/splatoon3/runtime/sub-models.mjs",
  "patches/splatoon3/runtime/sub-ready.mjs",
  "patches/splatoon3/runtime/sub-resistance.mjs",
  "patches/splatoon3/runtime/sub-special-fidelity.mjs",
  "patches/splatoon3/runtime/sub-surface-attachment.mjs",
  "patches/splatoon3/runtime/support-cooler-collision.mjs",
  "patches/splatoon3/runtime/support-cooler.mjs",
  "patches/splatoon3/runtime/swim-stealth.mjs",
  "patches/splatoon3/runtime/tacticooler-gauge.mjs",
  "patches/splatoon3/runtime/tenacity.mjs",
  "patches/splatoon3/runtime/tidal-slam-gauge.mjs",
  "patches/splatoon3/runtime/torpedo-receiver-trajectory.mjs",
  "patches/splatoon3/runtime/torpedo-splashes.mjs",
  "patches/splatoon3/runtime/toxic-mist.mjs",
  "patches/splatoon3/runtime/triple-slam-fists.mjs",
  "patches/splatoon3/runtime/trizooka-collision.mjs",
  "patches/splatoon3/runtime/turf-combat.mjs",
  "patches/splatoon3/runtime/turf-finish.mjs",
  "patches/splatoon3/runtime/wail-speakers.mjs",
  "patches/splatoon3/runtime/weapon-accuracy.mjs",
  "patches/splatoon3/runtime/weapon-edgecases.mjs",
  "patches/splatoon3/runtime/weapon-gates.mjs",
  "patches/splatoon3/runtime/weapon-weight-data.mjs",
  "patches/splatoon3/runtime/weapon-weight.mjs",
  "patches/splatoon3/runtime/weapons-charger-flight.mjs",
  "patches/splatoon3/runtime/weapons-collision.mjs",
  "patches/splatoon3/runtime/weapons-fidelity.mjs",
  "patches/splatoon3/runtime/weapons.mjs",
  "patches/splatoon3/runtime/zipcaster-armor.mjs",
  "patches/splatoon3/scorch-gorge-adapter.mjs",
  "patches/splatoon3/score-hud-adapter.mjs",
  "patches/splatoon3/source-paint-envelope-adapter.mjs",
  "patches/splatoon3/storm-effects-adapter.mjs",
  "patches/splatoon3/sub-special-adapter.mjs",
  "patches/splatoon3/tidal-slam-gauge-adapter.mjs",
  "patches/splatoon3/ui-localization-adapter.mjs",
  "patches/splatoon3/uuid-random-adapter.mjs",
  "patches/splatoon3/weapon-catalog-adapter.mjs",
  "patches/splatoon3/weapon-edgecases-adapter.mjs",
  "patches/splatoon3/weapon-lod-material-packing-adapter.mjs",
  "patches/splatoon3/weapon-opponent-palette-adapter.mjs",
  "patches/splatoon3/weapon-opponent-preview-adapter.mjs",
  "patches/splatoon3/weapon-paint-inertia-adapter.mjs",
  "patches/splatoon3/weapons-adapter.mjs",
  "patches/touch-layout/adapter.mjs",
  "scripts/build-inkwave.mjs",
  "scripts/inkwave-source-composition.mjs",
  "scripts/lib/inkwave-account-bundle.mjs",
  "scripts/lib/inkwave-audio-manifest.mjs",
  "scripts/lib/inkwave-build-only-modules.mjs",
  "scripts/lib/inkwave-lossless-lightmap.mjs",
  "scripts/lib/inkwave-module-imports.mjs",
  "scripts/lib/inkwave-native-stages.mjs",
  "scripts/lib/inkwave-reviewed-audio-orphan.mjs",
  "scripts/lib/inkwave-source-compaction.mjs",
  "scripts/lib/inkwave-stage-assets.mjs",
  "scripts/lib/inkwave-volume-packaging.mjs",
  "scripts/lib/inkwave-worker-compaction.mjs",
  "vite.config.mjs"
];
const BUILD_CLOSURE_SHA256="579bd34d404f0550b10b5748c99571a28deea620a17f78a8d865e2145acbcc23";
// Independently reviewed profiles, not hashes derived from the current main.
// PR1858 changes exactly the static-menu row in the same357-leaf closure.
// Both sides must authenticate one complete profile; profiles cannot be mixed.
const BUILD_PROFILES=Object.freeze([
  {
    name:'main726-reviewed-build-closure',
    reviewedBase:'726e338ac256ba9609086ce65e25a68ddd99df85',
    reason:'Original reviewed four-special builder/classification closure.',
    closureSha256:BUILD_CLOSURE_SHA256,
    staticMenu:{path:'patches/local-quality/static-menu-adapter.mjs',mode:'100644',sha:'209e1b21d25d790e8b3725a8f2f0bed363547d53',sha256:'c8bec2d3404d9574243388bb036ddbefa176dd1a5ccd5aa52936046a4ba3683e'}
  },
  {
    name:'main7e027-static-menu-pr1858',
    reviewedBase:'7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51',
    reviewedChange:'26f353e8c926d886da77c9babf1f92cc8dde00fa',
    reason:'Reviewed PR1858 static-menu backdrop/canvas/world gate; imports and classifications unchanged. Only this exact row differs in the unchanged357-leaf closure.',
    closureSha256:'e6820c8b823052f77007d8c5e77438e9a245c42364c630beb49a0d3549b9d726',
    staticMenu:{path:'patches/local-quality/static-menu-adapter.mjs',mode:'100644',sha:'e9ec35da5e1f96d9e312ba18f89585c0222e26cc',sha256:'991dd8f97df2508e6ef090d9a80457d741492ab2de9537ebde328afdc62ba62f'}
  }
]);
// Explicit source-control/data reads of the authenticated builder and static
// import closure: loading templates/runtime, stage/volume manifests, profile,
// compatibility lock and its24 upstream inputs, touch injection and native
// definitions. Prefix inventories are exact too: new entries are not wildcards.
const BUILD_CONTROL_DATA={
  "directPaths": [
    "inkwave-public/assets/stages/manifest.json",
    "inkwave-public/index.html",
    "inkwave-public/src/config.js",
    "inkwave-public/src/core/ctx.js",
    "inkwave-public/src/core/input.js",
    "inkwave-public/src/core/mobile.js",
    "inkwave-public/src/core/shadowcache.js",
    "inkwave-public/src/fx/fx.js",
    "inkwave-public/src/game/actor.js",
    "inkwave-public/src/game/cameraRig.js",
    "inkwave-public/src/game/character-geo.js",
    "inkwave-public/src/game/character-weapons.js",
    "inkwave-public/src/game/character.js",
    "inkwave-public/src/game/match.js",
    "inkwave-public/src/game/motion/retarget.js",
    "inkwave-public/src/game/motion/source-controller.js",
    "inkwave-public/src/game/physics.js",
    "inkwave-public/src/game/player.js",
    "inkwave-public/src/game/weapons.js",
    "inkwave-public/src/i18n.js",
    "inkwave-public/src/main.js",
    "inkwave-public/src/net/netmatch.js",
    "inkwave-public/src/ui/hud.js",
    "inkwave-public/src/ui/menus.js",
    "inkwave-public/src/world/paint.js",
    "patches/loading-cache/recovery.js",
    "patches/loading-cache/shell.html",
    "patches/loading-cache/sw.js",
    "patches/local-quality/ink-volume/assets/roller/manifest.json",
    "patches/local-quality/ink-volume/assets/shooter/manifest.json",
    "patches/splatoon3/assets/stages/manifest.json",
    "patches/splatoon3/profile.json",
    "patches/splatoon3/upstream-lock.json",
    "patches/touch-layout/mobile.js",
    "patches/touch-layout/ui.css"
  ],
  "allFilePrefixes": [
    "patches/loading-cache/runtime/"
  ],
  "jsonPrefixes": [
    "patches/native-stages/definitions/"
  ],
  "count": 56,
  "sha256": "049ce589ba22fe3db530016fe193e2fce9c4d9748e3f065145d5ebfa76356cc4"
};
const BUILD_GUARDS=[
  {
    "path": "scripts/build-inkwave.mjs",
    "mode": "100644",
    "sha": "185da45a0acb17a906709b5a124a380111725c33",
    "sha256": "a2814e623a81811aca5a6b5079d566ab88fabaa9b9a8d9351fadd45c25a98242"
  },
  {
    "path": "scripts/inkwave-source-composition.mjs",
    "mode": "100644",
    "sha": "a61100acdd90db510fafb99d6636c8fffff1295c",
    "sha256": "0992c6800164f0682611322aa0b2ad548cc82bf67e3af75077a0e86cddb2fc03"
  },
  {
    "path": "scripts/lib/inkwave-build-only-modules.mjs",
    "mode": "100644",
    "sha": "5408d3598bd60d661f003f5ea0e7c02ef55e4d62",
    "sha256": "28718d1528f16db6e06b9821695da4f84625e13893361cd54349c4530a5c3f20"
  },
  {
    "path": "scripts/lib/inkwave-module-imports.mjs",
    "mode": "100644",
    "sha": "0b1bcb414da6da3b3bcdffc6ea01e7ffca618c30",
    "sha256": "4db8341dd291a0abeac298c95ced8662ae60c0a76eb165d1aa37d71fb5b36184"
  },
  {
    "path": "scripts/lib/inkwave-reviewed-audio-orphan.mjs",
    "mode": "100644",
    "sha": "b8b416822836fc227d7180ff0ac777f423fec681",
    "sha256": "8de34fd417d5c89e9b47eff9c0cf197d1cb24fe4d705774ac0c8a74e5760c639"
  },
  {
    "path": "scripts/lib/inkwave-worker-compaction.mjs",
    "mode": "100644",
    "sha": "c35e79daacffeb37a7532d4f2c0d9254d144b9a0",
    "sha256": "32c6969cfba2a1b50303aefff8263500714e9a99435f7b087503276fec4f8fbf"
  },
  {
    "path": "scripts/lib/inkwave-source-compaction.mjs",
    "mode": "100644",
    "sha": "df4048abcecc32c8bc928671f5e6198029352fe3",
    "sha256": "ae61c7c039fc19f66b946f80b58bdf712ad7ddb0c1cde3725881c951c660575a"
  },
  {
    "path": "scripts/lib/inkwave-stage-assets.mjs",
    "mode": "100644",
    "sha": "21bae085ca71f69a6db3f633616ae14b2b2697e6",
    "sha256": "78d07be8acde4dbc0c60e228ed64ac714a5d0d031ed02728355ed8caf7a1b69d"
  },
  {
    "path": "scripts/lib/inkwave-lossless-lightmap.mjs",
    "mode": "100644",
    "sha": "9bdac0d2c53319965ea4ad63da1cbf729ce6f8da",
    "sha256": "93715bab3537b271c9c54e9541eb439b731d62a34f36c2392b8ef24cb4b3ed60"
  },
  {
    "path": "scripts/lib/inkwave-audio-manifest.mjs",
    "mode": "100644",
    "sha": "6ae61810328248a46498b91db0dd45d9531ab37d",
    "sha256": "fd60b2e1b97864c6edfb682141d3f9fdde03e41281aaf0dbdc4991b4b68995a0"
  },
  {
    "path": "scripts/lib/inkwave-volume-packaging.mjs",
    "mode": "100644",
    "sha": "7cfd7763427df65fb22ca84a29844260420ee604",
    "sha256": "be7b26d65751d56b930e82d923606d1fda8b245a039bcfecdc23a41eb6e62beb"
  },
  {
    "path": "scripts/lib/inkwave-account-bundle.mjs",
    "mode": "100644",
    "sha": "2dd8b540d477b81959e00a30757f755a83b0615d",
    "sha256": "0949769660d2ce1935a959bd71f7f23a98572189c25a4399b7302d6e7580f704"
  },
  {
    "path": "scripts/lib/inkwave-native-stages.mjs",
    "mode": "100644",
    "sha": "88c75effbd074f743d04b732c6edfaadb8426a60",
    "sha256": "71b2503a6f82a8105c59421761c75eca996f3186e0eadcaa984156e32e6784c2"
  },
  {
    "path": "package.json",
    "mode": "100644",
    "sha": "24f5a75294ad99f02f9adb5691ed2f72a8e890d6",
    "sha256": "2384aac55f545dd7ebf5ce8d2c479f93805330ad34c89bb9f336e38249179b1d"
  },
  {
    "path": "vite.config.mjs",
    "mode": "100644",
    "sha": "453130925bff131cfe1752147024c8e0bd9d488a",
    "sha256": "9aa93b810e786b46b0ac681948a69dce685959a3a0386e44152973cbe8bcb7c2"
  },
  {
    "path": "account/package.json",
    "mode": "100644",
    "sha": "f8529dd9d8f696da37bc44ec4d2cf6885e052df3",
    "sha256": "1d8b254810d68c21f1490d65f794b386e4b14dec946356d390fde15e0e2ec862"
  },
  {
    "path": "account/dev/vite-plugins.mjs",
    "mode": "100644",
    "sha": "7a837ab5a6a1eba781628cf5b86f5b541009a5be",
    "sha256": "273e21f28dc8a331e8ac6f4ab79b87d1cd6c289520c3315fdabfc70ca930617c"
  }
];
const SOURCE_ROOTS=Object.freeze(['inkwave-public','patches/splatoon3','patches/touch-layout','patches/reliability','patches/local-quality','patches/network-replication','patches/practice-range','patches/native-stages','patches/loading-cache','account','server']);
const SCRIPT_PATHS=Object.freeze(BUILD_GUARDS.filter(row=>row.path.startsWith('scripts/')).map(row=>row.path));
const TOP_PATHS=Object.freeze(['package.json','vite.config.mjs']);
const DELTAS=Object.freeze([...BEFORE.map(row=>row.path),AREA].sort());
const hash=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
const sorted=rows=>[...rows].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
// Upstream emits arbitrary nested names, and the loading runtime copies all files.
// Only exact top-level QA test trees are non-production; never blanket-skip .md
// or a nested tests/ component. Conservatively guard unshipped docs as well.
const included=relative=>SCRIPT_PATHS.includes(relative)||TOP_PATHS.includes(relative)||SOURCE_ROOTS.some(root=>relative.startsWith(root+'/')&&(root==='inkwave-public'||!relative.slice(root.length+1).startsWith('tests/')));
const gitEnv=()=>({...Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('GIT_'))),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_NO_REPLACE_OBJECTS:'1'});
const git=(root,args,extra={})=>execFileSync('git',['-C',root,...args],{env:gitEnv(),encoding:'utf8',timeout:30000,maxBuffer:12*1024*1024,stdio:['pipe','pipe','pipe'],...extra});
export const reviewedSpecialDeltaPaths=()=>[...DELTAS];
export const reviewedSpecialBeforePins=()=>structuredClone(BEFORE);
export const reviewedSpecialAfterPins=()=>structuredClone(AFTER);
export const reviewedSpecialBuildClosurePaths=()=>[...BUILD_CLOSURE_PATHS];
export const reviewedSpecialBuildProfiles=()=>structuredClone(BUILD_PROFILES);
export const reviewedSpecialBuildControlData=()=>structuredClone(BUILD_CONTROL_DATA);
export const reviewedSpecialBuildGuards=()=>structuredClone(BUILD_GUARDS);
export const reviewedSpecialProductionScope=()=>({roots:[...SOURCE_ROOTS],scripts:[...SCRIPT_PATHS],top:[...TOP_PATHS]});
export function readReviewedSpecialGitTree(root,expectedCommit,expectedTree){
 assert.match(expectedCommit??'',/^[0-9a-f]{40}$/,'immutable declared commit required');assert.match(expectedTree??'',/^[0-9a-f]{40}$/,'immutable declared full tree required');
 const real=fs.realpathSync(root);assert.equal(fs.realpathSync(git(real,['rev-parse','--show-toplevel']).trim()),real,'source root must be its actual Git worktree');
 assert.equal(git(real,['rev-parse','--verify','HEAD^{commit}']).trim(),expectedCommit,'declaration must match actual HEAD');
 assert.equal(git(real,['rev-parse',expectedCommit+'^{tree}']).trim(),expectedTree,'declaration must match actual full Git tree');
 const entries=git(real,['ls-tree','-r','-z','--full-tree',expectedCommit]).split('\0').filter(Boolean).map(line=>{const m=/^(\d+) (blob|commit) ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);assert.ok(m,'valid complete immutable Git leaf');return{path:m[4],mode:m[1],type:m[2],sha:m[3]};});
 return{head:expectedCommit,tree:expectedTree,entries:sorted(entries)};
}
export function scanReviewedSpecialProduction(root){
 const rows=[];function visit(relative){const file=path.join(root,relative),s=fs.lstatSync(file);assert.ok(!s.isSymbolicLink(),relative+': no source symlinks');if(s.isDirectory()){for(const name of fs.readdirSync(file).sort()){const next=relative+'/'+name;if(SOURCE_ROOTS.includes(relative)&&relative!=='inkwave-public'&&name==='tests')continue;visit(next);}}else if(included(relative)){assert.ok(s.isFile(),relative+': regular source file required');const b=fs.readFileSync(file);rows.push({path:relative,mode:s.mode&0o111?'100755':'100644',sha:blob(b),sha256:hash(b)});}}
 for(const relative of [...SOURCE_ROOTS,...SCRIPT_PATHS,...TOP_PATHS])visit(relative);return sorted(rows);
}
// SHA256 is derived from the actual immutable Git blob bytes too, not merely
// from equal worktree files or caller-supplied row hashes. Missing objects fail.
function gitBlobHashes(root,rows){
 const unique=[...new Set(rows.map(row=>row.sha))],raw=git(root,['cat-file','--batch'],{encoding:null,input:unique.join('\n')+'\n',maxBuffer:512*1024*1024}),out=new Map();let at=0;
 for(const sha of unique){const end=raw.indexOf(10,at);assert.ok(end>=at,'complete immutable blob header');const line=raw.subarray(at,end).toString('ascii'),match=/^([0-9a-f]{40}) blob (\d+)$/.exec(line);assert.ok(match,'every production blob must be materialized in Git: '+sha);assert.equal(match[1],sha);const size=Number(match[2]);assert.ok(Number.isSafeInteger(size)&&size>=0&&size<=64*1024*1024,'bounded immutable blob size');at=end+1;assert.ok(at+size<raw.length&&raw[at+size]===10,'complete immutable blob body');const bytes=raw.subarray(at,at+size);assert.equal(blob(bytes),sha,'actual object bytes must hash to declared Git blob');out.set(sha,hash(bytes));at+=size+1;}
 assert.equal(at,raw.length,'no unparsed blob output');return out;
}
export function assertReviewedSpecialMaterialization(root,metadata,physical){
 const selected=metadata.entries.filter(row=>included(row.path));assert.equal(new Set(physical.map(row=>row.path)).size,physical.length,'no duplicate physical source leaf');
 assert.deepEqual(physical.map(row=>row.path),selected.map(row=>row.path),'complete production inventory: missing or extra source');
 const hashes=gitBlobHashes(root,selected);
 for(let i=0;i<selected.length;i++){const expected=selected[i],actual=physical[i];assert.equal(expected.type,'blob','no production Git links');assert.equal(actual.mode,expected.mode,actual.path+': actual declared source mode');assert.equal(actual.sha,expected.sha,actual.path+': source bytes differ from actual declared Git');assert.equal(actual.sha256,hashes.get(expected.sha),actual.path+': source SHA256 differs from immutable Git bytes');}
}
export function assertReviewedSpecialBuildScope(rows){const map=new Map(rows.map(row=>[row.path,row]));for(const pin of BUILD_GUARDS)assert.deepEqual(map.get(pin.path),pin,pin.path+': reviewed classification/build dependency changed');}
export function assertReviewedSpecialBefore(rows){const map=new Map(rows.map(row=>[row.path,row]));assert.ok(!map.has(AREA),'area clock must be absent in the actual before tree');for(const pin of BEFORE)assert.deepEqual(map.get(pin.path),pin,pin.path+': exact reviewed before content/mode required');assertReviewedSpecialBuildScope(rows);}
export function assertReviewedSpecialBuildClosure(rows,expectedProfile=null){
 assert.ok(expectedProfile===null||typeof expectedProfile==='string','explicit reviewed build profile name required');
 const staticMenu=rows.find(row=>row.path==='patches/local-quality/static-menu-adapter.mjs');
 const profile=expectedProfile===null
  ?BUILD_PROFILES.find(p=>['path','mode','sha','sha256'].every(key=>staticMenu?.[key]===p.staticMenu[key]))
  :BUILD_PROFILES.find(p=>p.name===expectedProfile);
 assert.ok(profile,'unknown reviewed build profile');
 assert.deepEqual(staticMenu,profile.staticMenu,'paired source must retain the exact selected build profile: '+profile.name);
 assert.ok(Array.isArray(BUILD_CLOSURE_PATHS)&&BUILD_CLOSURE_PATHS.length>0&&/^[a-f0-9]{64}$/.test(profile.closureSha256),'reviewed transitive build/classification fence is not sealed');
 const map=new Map(rows.map(row=>[row.path,row]));const selected=BUILD_CLOSURE_PATHS.map(relative=>{const row=map.get(relative);assert.ok(row,relative+': complete transitive build dependency required');return{path:row.path,mode:row.mode,sha:row.sha,sha256:row.sha256};});
 assert.equal(hash(JSON.stringify(selected)),profile.closureSha256,'reviewed transitive build/classification dependency changed: '+profile.name);
 return structuredClone(profile);
}
export function assertReviewedSpecialBuildControlData(rows){
 const {directPaths,allFilePrefixes,jsonPrefixes,count,sha256}=BUILD_CONTROL_DATA;
 const selected=sorted(rows.filter(row=>directPaths.includes(row.path)||allFilePrefixes.some(prefix=>row.path.startsWith(prefix))||jsonPrefixes.some(prefix=>row.path.startsWith(prefix)&&row.path.endsWith('.json')))).map(row=>({path:row.path,mode:row.mode,sha:row.sha,sha256:row.sha256}));
 assert.equal(selected.length,count,'exact explicit build-control/data dependency inventory required');
 assert.equal(hash(JSON.stringify(selected)),sha256,'reviewed explicit build-control/data dependency changed');
}
export function assertReviewedSpecialDeltaRows(before,after,expectedProfile=null){
 assertReviewedSpecialBefore(before);assert.ok(AFTER,'reviewed special after pins are not sealed; admission remains closed');assertReviewedSpecialBuildScope(after);const profile=assertReviewedSpecialBuildClosure(before,expectedProfile);assertReviewedSpecialBuildClosure(after,profile.name);assertReviewedSpecialBuildControlData(before);assertReviewedSpecialBuildControlData(after);
 const left=new Map(before.map(row=>[row.path,row])),right=new Map(after.map(row=>[row.path,row]));assert.equal(left.size,before.length,'unique before inventory');assert.equal(right.size,after.length,'unique after inventory');
 assert.equal(after.length,before.length+1,'only the area clock may be added');
 for(const pin of AFTER)assert.deepEqual(right.get(pin.path),pin,pin.path+': exact reviewed after content/mode required');
 const changed=sorted([...new Set([...left.keys(),...right.keys()])].filter(relative=>JSON.stringify(left.get(relative))!==JSON.stringify(right.get(relative))).map(relative=>({path:relative}))).map(row=>row.path);assert.deepEqual(changed,DELTAS,'only the four reviewed production leaves may differ');
 for(const row of before)if(!DELTAS.includes(row.path))assert.deepEqual(right.get(row.path),row,row.path+': all other production paths/modes/bytes must remain unchanged');
 return profile;
}
export function assertReviewedSpecialEvent(event,options,context){
 assert.equal(context.eventName,'pull_request','reviewed delta requires the official PR event, not a dispatch or branch label');assert.equal(context.repository,REPOSITORY,'exact event repository required');
 assert.equal(event?.repository?.full_name,REPOSITORY,'event repository must match the runner');assert.ok(Number.isSafeInteger(event?.number)&&event.number>0,'positive actual PR number required');
 const pr=event.pull_request;assert.equal(pr?.base?.repo?.full_name,REPOSITORY,'actual base repository required');assert.equal(pr?.head?.repo?.full_name,REPOSITORY,'fork events cannot admit source');assert.equal(pr?.base?.ref,BASE_BRANCH,'actual main base branch required');
 for(const [actual,key]of [[pr.base.sha,'baseSha'],[pr.head.sha,'candidateSha']]){assert.match(actual??'',/^[0-9a-f]{40}$/,'immutable official event source required');assert.equal(options[key],actual,'declaration must match actual PR event '+key);}
 assert.equal(options.mode,REVIEWED_SPECIAL_DELTA_MODE,'explicit reviewed four-delta mode required');assert.equal(options.sourceBase,pr.base.sha,'source baseline must be actual event base');assert.equal(options.sourceHead,pr.head.sha,'source candidate must be actual event head');assert.notEqual(options.baseSha,options.candidateSha,'four deltas require distinct actual commits');
 for(const key of ['baseTree','candidateTree'])assert.match(options[key]??'',/^[0-9a-f]{40}$/,'immutable actual '+key+' required');
 assert.ok(!process.env.INKWAVE_ACCOUNT_BUILD,'external account build input is outside this source-only contract');
 return{repository:REPOSITORY,number:event.number,baseBranch:BASE_BRANCH,base:pr.base.sha,head:pr.head.sha};
}
function eventInput(options){const file=process.env.GITHUB_EVENT_PATH;assert.ok(file,'actual runner GITHUB_EVENT_PATH required');const stat=fs.lstatSync(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=2*1024*1024,'bounded regular event file required');const bytes=fs.readFileSync(file),event=JSON.parse(bytes);return{file,sha256:hash(bytes),binding:assertReviewedSpecialEvent(event,options,{eventName:process.env.GITHUB_EVENT_NAME,repository:process.env.GITHUB_REPOSITORY})};}
export function verifyReviewedSpecialDeltaPair(options){
 const event=eventInput(options),baseline=fs.realpathSync(options.baseline),candidate=fs.realpathSync(options.candidate);assert.notEqual(baseline,candidate,'separate actual worktrees required');
 const roots=[baseline,candidate],commits=[options.baseSha,options.candidateSha],trees=[options.baseTree,options.candidateTree],metadata=roots.map((root,i)=>readReviewedSpecialGitTree(root,commits[i],trees[i])),inventories=roots.map(scanReviewedSpecialProduction);
 roots.forEach((root,i)=>assertReviewedSpecialMaterialization(root,metadata[i],inventories[i]));const buildProfile=assertReviewedSpecialDeltaRows(...inventories);
 roots.forEach((root,i)=>{assert.deepEqual(readReviewedSpecialGitTree(root,commits[i],trees[i]),metadata[i],'actual Git source must remain unchanged');assert.deepEqual(scanReviewedSpecialProduction(root),inventories[i],'actual physical source must remain unchanged');});assert.equal(hash(fs.readFileSync(event.file)),event.sha256,'actual event input must remain unchanged');
 return{schema:1,mode:REVIEWED_SPECIAL_DELTA_MODE,sourceBase:options.baseSha,sourceHead:options.candidateSha,declaredBaseTree:options.baseTree,declaredCandidateTree:options.candidateTree,event:{...event.binding,inputSha256:event.sha256,provenanceLimit:'Fields are bound to the runner input. A local/private replay does not independently authenticate an official hosted event.'},checkouts:metadata.map((row,i)=>({commit:row.head,tree:row.tree,allGitLeaves:row.entries.length,productionLeaves:inventories[i].length})),changes:[...DELTAS],baselineProductionLeaves:inventories[0].length,productionLeaves:inventories[1].length,unchangedProductionLeaves:inventories[0].length-BEFORE.length,baselineInventoryHash:hash(JSON.stringify(inventories[0])),candidateInventoryHash:hash(JSON.stringify(inventories[1])),buildScopeFencePaths:BUILD_GUARDS.map(row=>row.path),buildProfile:structuredClone(buildProfile),buildStaticClosureSha256:buildProfile.closureSha256,buildStaticClosureLeaves:BUILD_CLOSURE_PATHS.length,buildControlDataFence:structuredClone(BUILD_CONTROL_DATA),writtenPaths:[],scope:'Read-only exact four-delta source admission against actual event base/head; all other actual production leaves retain the base bytes and modes.',limitation:'Not main26 integration, source replay, build/runtime/RNG/browser/retail acceptance, hosted-event provenance by a local receipt, or merge approval.'};
}
function prospective(file){let at=path.resolve(file),tail=[];for(;;){try{fs.lstatSync(at);return path.join(fs.realpathSync(at),...tail);}catch(error){if(error.code!=='ENOENT')throw error;try{fs.lstatSync(at);throw Error('unresolvable receipt ancestor');}catch(check){if(check.code!=='ENOENT')throw check;}const parent=path.dirname(at);assert.notEqual(parent,at);tail.unshift(path.basename(at));at=parent;}}}
const within=(child,parent)=>child===parent||child.startsWith(parent+path.sep);
export function assertReviewedSpecialReceiptSeparate(receipt,roots,paths=[]){const output=prospective(receipt);for(const root of roots){const directories=git(fs.realpathSync(root),['rev-parse','--path-format=absolute','--git-dir','--git-common-dir']).trim().split('\n');assert.equal(directories.length,2);for(const directory of directories)assert.ok(!within(output,fs.realpathSync(directory)),'receipt cannot overwrite actual Git metadata');for(const relative of SOURCE_ROOTS)assert.ok(!within(output,fs.realpathSync(path.join(root,relative))),'receipt must remain outside production source roots');}assertReceiptSeparate(receipt,roots,[...new Set([...SCRIPT_PATHS,...TOP_PATHS,...DELTAS,...paths])]);}
export async function runReviewedSpecialDeltaCLI(values,role){
 assert.ok(['prepare','controls'].includes(role));const options={baseline:values.get('--baseline'),candidate:values.get('--candidate'),baseSha:values.get('--base-sha'),candidateSha:values.get('--candidate-sha'),baseTree:values.get('--base-tree'),candidateTree:values.get('--candidate-tree'),mode:values.get('--expected-mode'),sourceBase:values.get('--expected-source-base'),sourceHead:values.get('--expected-source-head')};eventInput(options);
 for(const [flag,key]of [['--base-git-root','baseline'],['--candidate-git-root','candidate']])if(values.has(flag))assert.equal(fs.realpathSync(values.get(flag)),fs.realpathSync(options[key]),'source must be the actual declared worktree');
 const receipt=values.get('--receipt'),roots=[options.baseline,options.candidate];if(receipt)assertReviewedSpecialReceiptSeparate(receipt,roots);const evidence=verifyReviewedSpecialDeltaPair(options);
 if(role==='controls'){const before=scanReviewedSpecialProduction(options.baseline),after=scanReviewedSpecialProduction(options.candidate);let rejected=0;for(const [rows,side]of [[before,0],[after,1]])for(let i=0;i<rows.length;i++){const changed=[...rows];changed[i]={...rows[i],sha256:'0'.repeat(64)};assert.throws(()=>assertReviewedSpecialDeltaRows(side===0?changed:before,side===1?changed:after));rejected++;}for(const relative of DELTAS){const old=before.find(row=>row.path===relative),partial=after.flatMap(row=>row.path===relative?(old?[old]:[]):[row]);assert.throws(()=>assertReviewedSpecialDeltaRows(before,partial));rejected++;}for(const changed of [after.slice(1),[...after,after[0]],[...after,{...after[0],path:'inkwave-public/unreviewed-extra.js'}]]){assert.throws(()=>assertReviewedSpecialDeltaRows(before,changed));rejected++;}evidence.controls={kind:'all-actual-production-and-partial-delta-negative-controls',rejected};}
 const stable={...evidence};delete stable.controls;assert.deepEqual(verifyReviewedSpecialDeltaPair(options),stable,'actual source pair unchanged after controls');if(receipt){assertReviewedSpecialReceiptSeparate(receipt,roots);fs.mkdirSync(path.dirname(receipt),{recursive:true});fs.writeFileSync(receipt,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});}console.log(JSON.stringify(evidence));
}
