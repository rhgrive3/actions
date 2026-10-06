# Batch B — Runtime Resources / Gameplay Timing

Baseline: main `fc057af9baac421ec707504f4637e2ed8824a444`.

Included source PRs: #493, #549, #553.

Integration policy:
- Preserve current #587 Weapons/Ballistics, Network Replication and platform lifecycle.
- Compose #493 resource/mipmap/world-quality/ghost/special-cancel hooks onto current adapters.
- Compose #549 Dualies startup, Flow scoring, Blaster startup and hair lifetime without replacing current network metadata.
- Compose #553 Roller post-release admission and active-stage texture allocation.
- Keep #401 model-generation/Blender assets separate; they are an independent binary asset pipeline.
- Do not restore stale shared test-fixture snapshots when current-main fixtures already cover the same lifecycle owners.

Acceptance:
- Source heads were individually green before composition.
- Exact Batch CI is the authoritative combined gate.
- Physical Nintendo/iOS/Android parity remains outside CI.
