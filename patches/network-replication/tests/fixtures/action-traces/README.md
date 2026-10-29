# Native action traces

`source-recorded.json` is an observation from source base
`035233299348e5c3527f6106b98e721ed2dfd011`; it is not a retail S3 oracle.
`collect.mjs` uses the actual production-composed Actor, WeaponRunner,
Projectiles and NetMatch classes. It advances native `Actor.update` and
`Projectiles.update` at 1/60 s with `Math.random` fixed at 0.5. The existing
source fixture suppresses actor locomotion integration and rendering, and
character presentation; a real Physics/Level floor is used, with a constant
paint sample and a no-op paint sink. Actor initial weapons, positions, HP,
ink, special gauge, empty gear, life and owners are recorded explicitly.
Commands are state changes: each full input/aim remains in force until the
next recorded command. They are not a proposal that network snapshots can
supply missing inputs.

The Curling producer uses the real NetMatch actor and bomb packet recorder.
For the contact/blast scenarios it switches to the native offline/local
combat route after birth so victim HP can be observed; it does not exercise
network hit delivery or validate an authority implementation. The other
combat scenarios also use local damage. Two Curling resource-control cases
continue native projectile and resource ticks after the first explosion and
attempt the same second sub input. Both use identical pre-release row and
first birth packet, but the unrounded trusted initial tank differs; the later
native result differs. The Blaster splash invokes two hits in one burst. The
Roller scenario first performs its normal flick before the held input reaches
rolling contact. Wave Breaker remains damaging after the body special ends.

`native-action-traces.test.mjs` checks the recorded raw observations and
explicit positive/negative behavioral contracts against source composition.
To test a separate already built site set `INKWAVE_BUILT_SITE` to its root;
the fixture reports the build content hash. Neither the source nor emitted
VM test is a browser, network replication, controller, or retail comparison.
`capture.mjs <output>` is an explicit offline recording tool; tests never
rewrite their expected data. Do not silently regenerate the snapshot when a
canonicalizer changes: investigate the native behavior and provenance first.
