# Crowd diagnostic initialization repair

This changes diagnostic fixture boundaries only. No product gameplay/audio/AI code is changed.

## Evidence
- Unseeded-boundary A/A run 38293158901, head 45bc42e963f7e18e9b8cf27b1d2309c675fae4bb: boot seed, RNG calls 47689, gameplay time .05, clock ticks 3, and initial paint grid match. After resetting before startMatch, one side consumes 3 random values before Match.setup, the other 2. Actor names, equipment and appearance then differ. No clock step occurs in that interval.
- Trace run 38294242726: observed regular Audio.init → MusicEngine._init → play → SongPlayer Math.random, then _pickPalette Math.random. Extra call did not reproduce in this run.
- Repaired-boundary run 38294929560, head 599e0582a57f8c45e1f3be1941152e8438eb5e99: extra call reproduced with exact stack Music Worker → platform-audio._tick → play → SongPlayer constructor. It occurs during the awaited fade. Music remains running.

The earlier fixture wrote musicVolume:0, but the actual setting is music. It was therefore not muted. The corrected diagnostic explicitly keeps the actual prior default, music:0.6. This is not a product optimization or a speed claim.

## Fixture repair and gate
Reset diagnostic RNG at _pickPalette entry and Match.setup entry, and before fixed frame steps. Both original methods still run and consume their original random values. Wait for all real source-motion loaders and warm promises before taking the final comparison. Do not skip audio or gameplay owners.

The repaired A/A gate passes despite the reproduced asynchronous extra RNG call. Final 8 actors, equipment, paint grid/counts/growth, game/actor/weapon/bot scalar state, fixed clock ticks 4, palette, seed and post-reset RNG count are equal. One real intro frame has identical 118 draw calls and 497352 triangles. This is initialization state evidence, not a sustained crowd workload or hardware FPS result.

The gate excludes only startup bootMs, offline actors' networking wall-clock _netLifeStartedAt, and total RNG lifetime call count before explicit reseeds. Excluded fields remain in the artifact.

Artifact 11768131253 SHA256 411c695acd8ae4899f8ba7152f3fcfc593d8ccd8aa39345fb4efc4e2936a24e7 downloaded and verified.

Next is a separate 12-rendered-frame actual-main A/B state/caller-profile audit on ac1159 and exact PR1316 head9e97f5f734586f667f960d8b29b862add708e96d, with identical initialized fixture and audio. Do not repeat the long software-renderer ABBA or use its hundreds-of-seconds stalls as product performance evidence.
