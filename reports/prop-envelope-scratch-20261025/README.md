# Reuse the prop envelope transform box (2026-10-25)

Public baseline: `dd90aa241aabd5f0b972cc3471386ba3d4da86dc`.

The non-axis branch of `setPropInstanceEnvelope` previously cloned its local Box3 for every placement before transforming and unioning the extrema. Three's `Box3.union` copies the minimum/maximum components and does not retain its argument. A function-local scratch Box3 can therefore be reset from the same local bounds before each transform. No transform arithmetic, record order, final margin, sphere calculation, culling policy, mesh geometry, animation, or material changes.

The scratch is local to the call; there is no persistent cache, invalidation, or additional retained state. The axis branch is untouched. The relevant public call sites build blink/flag/banner instanced bounds during stage construction, not every gameplay frame.

## Equivalence and allocation checks

- `fixtures/prop-envelope-before-scratch.js.txt` retains the exact public baseline helper. A separate test compares actual PropKit fan/turbine/blink/flags/banners against that baseline, including their nonfinite-data uncullable fallback.
- Empty, single and 256-placement cases compare exact bounds/spheres under rotation, reflection, nonuniform scale and shear. Source geometry bounds remain untouched. Box3 clone count remains one irrespective of the placement count.
- Existing real scenery/PropKit tests retain source buffers, instance matrices and bounds enclosing shader-deformed vertices across large positive and negative animation times.
- The benchmark builds the real halyard dressing and verifies every instanced mesh's exact old/new sphere. In its two non-axis meshes, clone calls drop from 51 to 2; adding the two scratch boxes means 47 fewer Box3 and 94 fewer default Vector3 allocations per complete envelope pass. Persistent memory stays unchanged.

## CPU measurement

`compare.mjs` reads the fixed parent helper with `git show`, builds the actual halyard props once, warms both implementations and alternates their order for nine rounds. `comparison.json` preserves the initial short 5,000-pass run (77.81 → 67.10 ms). `comparison-isolated.json` records the longer 100,000-pass run without other test/benchmark processes: 1069.638 → 1067.010 ms (0.25% shorter, effectively equal). The short-run speedup is not stable evidence of elapsed-time improvement; the confirmed benefit is fewer temporary objects. These are local Node timings for envelope calculation; they are not stage-load totals or gameplay frame times.

```sh
node reports/prop-envelope-scratch-20261025/compare.mjs 100000
node --test patches/local-quality/tests/prop-envelope-scratch.test.mjs patches/local-quality/tests/world-render-bounds.test.mjs
INKWAVE_CHROMIUM_PATH=/usr/bin/chromium node --test scripts/tests/inkwave-prop-envelope-scratch-browser.test.mjs
```

## Browser verification and existing limitation

The Node geometry/baseline group passes six tests, and the source-ownership group passes fourteen tests; source migration audit reports no failures. The dedicated Chromium test passes.

The dedicated Chromium/SwiftShader comparison imports the exact old fixture and current helper, creates actual PropKit instances, updates matrices/colors identically, and compares render-target RGBA bytes, draw calls and triangle counts across four animation times and ten visible/offscreen views (40 frames). Every byte, draw count and triangle count agrees; offscreen views reduce both sides from five draws to one, preserving the uncullable malformed-cloth fallback. `browser-comparison.json` retains the receipt.

The broader existing `inkwave-world-bounds-browser.test.mjs` fails its unrelated static-scenery counterfactual comparison *before* reaching its prop-bound section. The unchanged parent checkout and candidate both fail at view 0, byte 23552, values 0/7 under the same Chromium. That test is left unchanged; its failure is not claimed resolved by the scratch change. The dedicated old/new prop test provides the relevant browser comparison.

No Splatoon 3 behavior or visual equivalence claim is added. INKWAVE's existing gameplay and retail-comparison limitations remain unchanged.
