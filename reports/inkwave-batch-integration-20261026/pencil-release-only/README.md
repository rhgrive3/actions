# Pencil release-only acceptance

Base: `f8b5eafc38f8d80641d823c950cbe7d560c9bfc0`. Code:
`a9d32888fdc63996c4c28cde4d96215df61691c6`. Only the loaded-shot release
admission hunk is selected from the earlier mixed candidate. Nintendo's
[indexed official announcement](https://x.com/SplatoonJP/status/1593167058514026497)
and the parent's independent payment/hold/depletion review support release-owned
shots. Direct post retrieval returned403 in the earlier review; no original
clip was fetched or compared.

The original candidate branch `fix/pencil-five-shot-cycle-20261026` remains
unchanged at `1d6df6d8af4c41aeecda1589e25f5e7727274122`. Its new squid-round
discard hunk is **excluded**. No-charge-keep wording alone does not establish
post-first-shot remaining-round discard or ink settlement. Those semantics
remain unverified. The squid block is byte-identical to f8, so retaining it is
not presented as retail acceptance.

| Narrow check | Result |
| --- | --- |
| Five-shot event/flight, cooldown/release boundary, existing payment test | Source3/3 and fresh emitted3/3 |
| Both new release tests against f8 emitted runtime | Both fail on premature press emission |
| Optimized build/startup | Passed; one fresh build |
| Exact input/artifact hashes | 1490/2194, zero mismatches |
| Weapon data /390 packaged audio files | Unchanged |

Both Pencil kits complete5 actual release-owned full shots. Each head moves,
matches native draw-buffer positions, produces drawn falling ink and paints
after landing. One initial rise/ready and5 full-shot audio events occur per
pack. Depletion starts a new partial charge/phrase. Holding a loaded round,
releasing during the existing cooldown and repeated released input add no
extra shot; retained rounds do not require another payment. Source clocks,
stats, projectile/damage/paint parameters and media are unchanged.

[Validation and exclusions](validation.json), [raw event/flight traces](traces.json)
and compressed logs preserve the bounded results. Emitted contentHash:
`56105e36758c15f89e0f2c69db020bf6a1f0d6124efb05acda9653c71e91d69e`.

This accepts deterministic event/flight and payment behavior, not actual audio
playback, native-input gameplay, presented pixels, hardware or full retail
timing. The fixed60Hz Actor fixture freezes integration at an elevated position
and simplifies Character. Squid pack behavior/ink settlement, other variant
playback/visual gaps and eventual final-head remote CI remain open. No Nintendo
media, PR retry, merge or manual CI launch.
