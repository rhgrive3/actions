# INKWAVE #526: release consumed PropKit build parts

Baseline main: `83d6b088246f760a34d0921c118482bca7cde777`.

The native merge consumed every static part but kept `_buckets`, its matrices and fresh tube geometry reachable. Cline7 reproduced12,793 retained static part records on the real Halyard layout and supplied the placement-replay fix. Parent converted the proposal to an exact-anchor quality adapter, keeping raw upstream unchanged. The accepted correction also resets regenerated animated records: the initial proposal doubled spin8→16, blink49→98 and flags44→88 on same-instance rebuild despite static hash parity. That proposal is archived and is not the passing final implementation.

After each successful non-headless build, static part count is zero. Rebuilding replays lightweight placement options with the original deterministic seeds; live animation records are recreated once. Last-reference merged output disposal and shared template ownership remain native. Headless accounting stays available. `clear()` releases placement records. Native source colliders and final indexed position/normal/color/UV buffers stay equal to the baseline, including instance counts and triangles after rebuild and add-after-build.

Focused automated tests use real vendored Three and native props/dressing with a no-op canvas context. They cover actual Halyard, shared source-template disposal signals, repeated rebuild/rematch, late placement, live spin/blink/flags and explicit banner instances. A test-only snapshot of pending PR183 at `04e8ee973470ce68126d503f6916229775565cd1` exercises its actual Practice dressing registration/placements through the same native PropKit. This is geometry/collider composition evidence, not a claim that the pending full Practice session has been merged or physically tested.

Counts and buffer hashes establish structural lifetime/geometry parity; they do not measure mobile heap/GPU bytes or Nintendo/physical-device fidelity. Full canonical validation and browser suites run on GitHub Actions at the batch head and native merge candidate.
