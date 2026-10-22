# #1767 independent owner-clock release

This candidate starts at `855b0e187f4e6a367c21ac12745520f3c356c29a` and adds only the fresh owner-clock protocol, its guard/adapter/Session wiring, supporting fixtures/tests and clock evidence. It uses the independent COMPAT epoch `iw-gameplay-20261022-owner-clock-v1`.

The Charger contact module/identity, full-fire anchor, combat provenance changes and weapon owner/runtime changes are excluded. Those existing baseline files retain their baseline bytes. `owner-clock.mjs`, the origin guard and the two new clock test files match the previously accepted `76873fc` clock source exactly. The [native receipt](clock-native-browser.md) is explicitly evidence for that earlier fixed foundation, not this independent tree.

This independent source passes **25/25** clock/startup/snapshot/queue cases (384 MiB heap, serial, 11.205 seconds) and the complete **42/42** outbound-prefix cases (normal Node heap, serial, 46.432 seconds). The fixtures use actual current-session crypto and proof traffic. Runtime data is not rebased to satisfy tests. Build/source identities and any later acceptance are recorded separately in `clock-only-release.json`.

The reference remains Splatoon 3 11.3.0; no retail network internals or unpublished timing values are inferred. No weapon, movement or projectile constant is modified by this candidate.
