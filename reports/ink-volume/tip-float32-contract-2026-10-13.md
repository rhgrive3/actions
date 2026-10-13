# Ink-volume tip Float32 regression contract

Issue: [#1332](https://github.com/rhgrive3/actions/issues/1332)

Baseline: `f63c0af9c2ee991810ea792fe6976a44ed17610e` (current main on 2026-10-13 UTC).

## Reproduction and root cause

The actual production-composed native Shooter birth, `submitInkVolume`,
`InkVolumes.submitComposite`, and vendored Three.js `InstancedMesh` were used.
Setting the test projectile position to `[0, 1.064605, 3.449965]` reproduces
exactly the reported CI difference:

- Actual decimal buckets: `[0, 106460, 344997]`
- Expected decimal buckets: `[0, 106461, 344997]`
- Actual stored Y: `1.0646049976348877`
- Source Y: `1.064605`

`Matrix4.compose` copies the source translation directly. `InstancedMesh`
allocates `instanceMatrix` as a `Float32Array`; `setMatrixAt` writes the matrix
into it, and `getMatrixAt` reads that storage. The difference is the correct
single Float32 conversion, about 2.37e-9 at this Y. Multiplying each value by
1e5 and rounding creates a discontinuous decimal boundary and can reject the
correct stored position. The original test depends on randomly generated native
trajectories, so unchanged runs may pass.

This establishes a test failure, not a gameplay or rendering implementation bug.
The earlier failure was reported in [Pages run 38325105246](https://github.com/rhgrive3/actions/actions/runs/38325105246);
the reproduction above was independently executed on this baseline.

## Fix and regression strength

Only the test assertion changes. It compares the matrix translation exactly
with `position.toArray().map(Math.fround)`, after requiring finite values. There
is no new absolute/relative epsilon and no allowance for a different Float32
endpoint. This rejects even representable differences that the old decimal
buckets could hide.

The new production-composed test covers three coordinate vectors, including
positive and negative decimal boundaries, for all three existing native test
families: Shooter, Dualies, and Splatling. It confirms that the actual storage
is Float32 and that rendering leaves the full checked projectile state unchanged.
For each family/vector/axis it deliberately changes the stored coordinate by
one representable Float32 step, requires rejection, also requires rejection of
NaN, then restores the value and requires success. That is 27 one-step and 27
nonfinite negative controls.

Existing atomic fallback, connected-rod count, resource reuse, classification,
36-main-weapon, Roller, Slosher, pooled reuse and JSON-wire checks are preserved.

## Validation

- Original focused file: 6/6 passes on one unchanged baseline run.
- Added deterministic boundary case with the original assertion: 1/1 fails,
  reproducing the exact reported arrays.
- Corrected full ink-volume family: 19/19 passes, no skips.
- Production esbuild 0.28.2 build: passes. Content hash
  `75ea7db99b7c0407b374124d3c4b6d50ec5400cc39c2908a356465e1fa3aee9e`.
- The same 19/19 tests against that emitted/minified site: passes, no skips.
- Exact-head remote CI and existing real Chromium/WebKit workflow: pending at
  initial publication; their final results are recorded in the PR discussion.

No runtime, gameplay timing, positions, trajectories, damage, paint, source
numbers, browser gates or workflows are changed. This does not claim additional
Splatoon 3 retail parity. No S3 physical value is needed for a JavaScript storage
contract.

## Primary references

- [ECMAScript Math.fround specification](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.fround)
- [Three.js InstancedMesh documentation](https://threejs.org/docs/pages/InstancedMesh.html)
- Baseline vendored implementation:
  `inkwave-public/vendor/three/build/three.core.js`, `InstancedMesh` constructor,
  `getMatrixAt`, `setMatrixAt`, and `Matrix4.compose`.
