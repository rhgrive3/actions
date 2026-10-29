# Frozen historical negative control

These two unmodified files are copied from commit `9d8efc505352e161beed3cd56632f39a5b40d31e`, at `patches/splatoon3/runtime/native-charger-input.mjs` and `native-charger-replay.mjs`. They are test-only: neither file is installed into the application or its damage path.

SHA-256: `native-charger-input.mjs` `da1610b41a3231528a0787fc29a6317aa42429010bee37e3533fa2d1b24e2111`; `native-charger-replay.mjs` `7f2439e75e98af87a2aec312c6d0e875fcf8fd6d02c553efa19a33e64a73b463`.

The negative test feeds the first actual initial-Turf frame captured from production `Match` / `Actor` into the original private driver. It rejects the resource-absent, effective-input-null frame before attempting native simulation. The new trusted driver comparison uses a distinct VM and a request stream captured directly from the local Actor, not one reconstructed from the public packet. Current public tick snapshots carry no exact per-frame input, aim point or replay-enrollment proof, so these tests do not establish a production receiver or complete combat authority.
