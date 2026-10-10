# PR1175 ancillary paint hash integration repair

## Defect and scope

The authoritative ancillary mask used a float32 polynomial hash while the composed native GLSL still used `fract(sin(n) * 43758.5453123)`. Equal kind counts did not imply equal rays, satellite positions, spatter landing times, or wall drips. Canonical owner-cell clipping could therefore remove GPU droplets while crediting cells with no matching GPU shape.

The build overlay now uses a shared 16-bit seed word for those 12 ancillary hash streams. The CPU packs the word from the native float32 seed into the previously unused fourth growth attribute; all four quad vertices carry it. The fragment shader rounds the transported integer rather than hashing an interpolated floating-point seed. Integer multiply/add intermediates stay below 2^24, moduli and divisions are powers of two, and a byte swap mixes the two seed bytes. The same function contract drives the CPU mask and shader. Native body wobble, immediate body ownership, per-kind shape counts, growth laws, and cosmetic tone retain their existing formulas. Locked `inkwave-public/` is unchanged.

## Validation

- The native regression exhausts all 65,536 seed words across all 12 streams, comparing the production CPU function, an explicit float32 arithmetic oracle, and the emitted GLSL scalar body. Native quad submission checks exact packed words on every vertex, including float32/quantization boundaries, while preserving the unquantized body seed.
- A dedicated WebGL2 probe loads both source-composed and emitted modules. It evaluates 1,512 exact hash tuples and the actual shader SDF at the CPU mask's five interior samples, across six paint kinds, three seeds, three growth phases, floor/wall and directed stretch. Every claimed cell must be supported by the shader and included in the canonical owner runs. Unsupported-cell tolerance is zero. Reinstating the original sine-based ancillary calls must produce unsupported cells on both floor and wall. Separate mutations of rays, satellites, spatter and drips must each expose unsupported cells (wall-only for drips), so one failing family cannot hide missing coverage of another. Source and emitted receipts must match exactly.
- The browser network shard runs that probe and binds its receipt to the immutable checkout, build content hash, loaded artifacts and current verifier/fixture. Existing network and other browser gates remain required.
- Native focused regressions, emitted packed-seed tests, production build and startup/worker byte gates were run locally. Local Chromium could not start because the executor denies the process-singleton socket. No local WebGL pass is claimed; the exact-head CI browser receipt remains required.

## Splatoon 3 comparison status

The comparison profile remains Splatoon 3 Ver. 11.3.0 with unchanged sourced weapon/paint calibration. This fixes agreement between INKWAVE's own authoritative and rendered ancillary paint. It is not a claim that this decorative random shape generator, its growth curves, or the five-sample cell rule were measured on Nintendo hardware. New retail paint-shape capture and physical timing comparison remain unverified.
