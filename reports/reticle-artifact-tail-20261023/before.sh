INKWAVE_BUILT_SITE=_site node --max-old-space-size=2048 --experimental-vm-modules --test --test-concurrency=1 \
  patches/splatoon3/tests/active-special-gauge.test.mjs \
  patches/splatoon3/tests/preoperation-special-gauge.test.mjs \
  patches/splatoon3/tests/deployed-special-gauge-display.test.mjs \
  patches/splatoon3/tests/retained-special-deep-fidelity.test.mjs \
  patches/splatoon3/tests/special-device-flight.test.mjs \
  patches/splatoon3/tests/special-device-sparse-replay.test.mjs \
  patches/splatoon3/tests/combat-special-terrain.test.mjs \
  patches/splatoon3/tests/combat-special-native-bands.test.mjs \
  patches/splatoon3/tests/killer-wail-trace-lifecycle.test.mjs \
  patches/splatoon3/tests/triple-splashdown-network.test.mjs \
  patches/splatoon3/tests/special-health-recovery.test.mjs \
  patches/splatoon3/tests/special-presentation-native-controls.test.mjs \
  patches/splatoon3/tests/retained-autobomb-fidelity.test.mjs \
  patches/splatoon3/tests/retained-suction-attachment.test.mjs \
  patches/splatoon3/tests/beakon-concurrent-jumps.test.mjs \
  patches/splatoon3/tests/beakon-ground-admission.test.mjs \
  patches/splatoon3/tests/fizzy-ghost-hops.test.mjs \
  patches/splatoon3/tests/fizzy-detached-splashes.test.mjs \
  patches/splatoon3/tests/fizzy-input-queue.test.mjs \
  patches/splatoon3/tests/ink-mine-source-offsets.test.mjs \
  patches/splatoon3/tests/splash-wall-deployment.test.mjs \
  patches/splatoon3/tests/sprinkler-stage-duration.test.mjs \
  patches/splatoon3/tests/sub-ground-reflection.test.mjs \
  patches/splatoon3/tests/sub-moving-surface.test.mjs \
  patches/splatoon3/tests/torpedo-detached-splashes.test.mjs \
  patches/splatoon3/tests/torpedo-flight-stages.test.mjs \
  patches/network-replication/tests/tower-mine-paint-admission.test.mjs
  _site-launch-packets.json
retention-days: 14
