# Native submerged presentation QA contract

Status: candidate; Node helper tests executed, native browser validation pending. Not merged.

## Evidence and cause

- Fixed original diagnostic head: `3d50278ad009444dfdd3c4a156df6db2242b40b3`, [run 39666359751](https://github.com/rhgrive3/actions/actions/runs/39666359751), failed detail and catalog; 27 diagnostic Node tests passed. Original receipts are preserved unchanged.
- Artifact `12379171556`: 98,551,891 bytes, SHA256 `350957fdbf946214d92985dbaa841d31f0b7104d77da0ffc5a4572f8a0993926`.
- Native visibility contract introduced by [dc9dfea9](https://github.com/rhgrive3/actions/commit/dc9dfea9b74b3750c43f7a44550faf38195fea68). `patches/local-quality/s3-squid-look-adapter.mjs` blob `8c9bc993be854981752fccc7fa0e40e6eb4a3962` applies `form === 'climb' || (form === 'swim' && grounded)` AFTER `_updateSquid`, outside the source-owner early return. It hides body/eyes/dark while submerged and always hides the old ghost. Its native swim-presentation tests explicitly require resurfacing/dry/air visibility.
- All 23 catalog empty render samples match that predicate: 11 swim-turn-brake, 8 wall-surge-ready-crest, 4 form-both-directions-interrupt. The actual body owner was loaded; NaN posed vertices were not observed. Empty indexed traversal was incorrectly treated as always invalid.
- Whole-scene exemption would be wrong: transitioning human remains visible at form-case frames 0/6; wall frame44 independently renders a 24-indexed-vertex glint; emerged frame64 renders 39177 indexed vertices and 16746 changed pixels. Existing artifact includes 34 dry-squid and 20 airborne-squid positive render samples.
- Detail flow-squid 110/111 is intentionally grounded/submerged, source Sqd_Walk ready; body geometry zero, one independent instanced Flow draw, zero RGB delta. Unsupported CPU draw category is instanced, not missing index or vertex API. Flow's existing positive exterior and retirement checks remain unchanged.

## QA-only change

Capture actual native form/grounded/actor owner, ready source owner and banks, root/ancestor visibility, kid weight, squid root and required body/eyes/dark/ghost states. Wrong-visible submerged body and wrong-hidden emerged body fail. Only fully hidden native body with zero human weight, visible root ancestors, and matching actor state can admit empty indexed geometry. Empty bounds become explicit null ONLY under that proven condition; real nonfinite posed vertices remain an immediate failure.

Remaining human transitions, glint, shaders, materials, images, gameplay clocks, effects and geometry bounds retain their gates. Hidden body counts are separate from visible pixel passes. Empty terminal pause probes are counted as unmeasured sensitivity, not successful geometry sensitivity; human and dry-squid pause positives remain mandatory. Human, dry and airborne render/geometry positives are also mandatory. Existing failure diagnostics/readiness/CPU-bounds remain intact.

## Validation boundaries

Actual local Node: 11 helper tests passed, including wrong-hidden/wrong-visible, missing owner, mismatched actor, hidden whole root/truncated ancestor, missing/detached parts, NaN/Infinity, transitioning human, independent glint, and missing positive coverage negatives. Both driver syntax checks passed. The first local syntax check caught an import accidentally placed before the shebang; it was corrected before publication.

Native browser acceptance is pending. This does not claim game visual parity, new model fidelity, or all CI success. No runtime/model/hair code changed. PR1760/1762/1765 and the original diagnostic head remain fixed. A separate push-only job verifies the direct parent and six-path allowlist, runs existing 27 plus 11 new Node contracts, then the existing detail/catalog suites. No unrelated capture chain or threshold reduction is introduced.
