# Rainmaker birth contract experiment

Based on main f31238a48b9d1a4af2d4f5f5f9182af777a79c83. NOT connected to runtime, build, network or deployment. No PR or merge.

20 assertions ran in the tool V8 isolate. Node test runner, real Three/Actor/model comparison, emitted build, browser and multiplayer are NOT run. Shell failed before execution because its synthetic .git mount reported No space left on device. Existing files and candidates were not removed.

The socket constant matches rainmaker-model.mjs revision 3. Column-major affine matrix math is independently testable without Three, but a supplied matrix is not authoritative. Actor position/aim alone cannot reconstruct the actual grip: source pose, body hierarchy, IK, form scale and damped ready history contribute. Never trust a guest-supplied matrix. There is no completed host canonical pose sampler here.

Next acceptance: sample the real pre-shot model matrix after pose completion on the same event tick, compare socketFromMatrix against model.localToWorld across both teams, source/native, all aim limits, carry/charge, jumping/landing and interrupted return. Existing advanceRanked processes events before world.update; a naive mesh getter is stale. Host admitted position and interpolated visual Actor position are distinct. A safe authority snapshot/provider and event schema validation remain required.

resolveBirth requires explicit same-tick evidence and a callback covering the entire body-to-socket bridge. The callback contract must return the nearest world or defense hit fraction, with the same grate mask as ink; null explicitly means clear. This experiment does not implement collision queries, finite-radius clearance or start-inside recovery. Surface birth can recontact immediately and requires real Physics tests, not an invented epsilon. Aim and vertical launch are not modified. Preserve the old event-anchor range budget independently of the moved birth; a negative control detects the extra range from resetting that anchor.

Run when shell works: node --test tools/rainmaker-birth-contract/pure.test.mjs

Before production integration: wall/ceiling/thin wall/grate/defense and start-inside negatives; full/partial range and paint/damage parity; host/follower delayed/duplicate/invalid events; normal weapon/bomb source-history regression; original native images and actual gameplay review. No claim of retail-exact physical origin or completed visual alignment.
