# Namespace fixture repair, fixed integration 67db

Scope: two Node test loaders. No production source or values changed.

The original special-spawn-barrier import executes the raw maps module in Node and cannot resolve the emitted-layout patches namespace. The candidate reads MAP_LAYOUTS through the existing production-composition source fixture. The original turf-projected-area VM loader already bridges public/patches but omits the inverse repository src/ bridge needed by authored stage layouts; the candidate adds that same explicit bridge used in the existing source fixture. Unknown imports still fail.

Exact head: 67db773cf2d2ef49bea7a6187cc412c3c5590ef9. Original target Git blobs d9cd498b849db0786b91a9b11aa9a5b694b6c722 and fac2dc80ddfb8294fa75e87c5a18c7375783bf8e.

Source results: originals both fail before test registration with the same missing paths as CI. Candidate special 13/13 (six layouts, 30/60/120/144 Hz and the existing geometry, timing, owner-packet and composition controls); candidate turf 3/3 (unequal projected area, 100 ramp versus 95 floor cells, overlap/buried transitions). All original test bodies and assertion calls are retained. Official consumed inputs: 445 and 19, respectively, with zero Git-blob mismatches.

Negative controls: reverting either bridge reproduces the original failure. An unknown import and an explicitly unavailable known dependency each fail for both loaders (four additional negatives); no module substitution or fallback occurs.

This is CPU/source acceptance. Emitted and browser acceptance have not been performed for this candidate.
