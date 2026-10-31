# Native kit prediction: unused length only

Base: `a7878e810bdea36882b3b6084df63b38e5ea917c`. One conditional skips `previous.distanceTo(b.pos)` only when no defense candidate exists. The `world.hit` read/world-distance calculation, true-defense math, collision queries, 12s horizon and gameplay are unchanged. No cache is introduced.

Node 24: new 3 tests / 28 scenarios pass; existing throw-prediction parity 145/145 passes (separate suites, not combined). Two fresh real VM/module graphs reverse only the reviewed expression and verify the complete predecessor SHA. Actual Level/Physics query counts, RNG count, every forecast point/contact/endpoint/time and native procedural Character pose/clocks match. Native Character is not a loaded source-motion-bank or browser qualification.

In the actual base's 12s no-contact fixture, 720 native segment queries remain 720; only the predictor's unused length calls fall from 720 to zero. Required defense-selector work remains. This is not a query-count/FPS improvement, does not resolve the modern guide's broader CPU budget, and is not a full CI/browser/emitted-build claim. Three private semantic negatives reject always-zero length, removing the optimization, and skipping the `world.hit` getter.

The existing full logical source-test collector includes the new file once (1857 to 1858 source files, exactly one of 9 lanes). That metadata check is not 1858 passing tests or a physical full checkout. No existing assertion or registry is changed.
