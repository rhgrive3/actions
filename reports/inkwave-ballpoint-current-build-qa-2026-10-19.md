# Existing Ballpoint: current-build QA connection

## Scope and provenance

QA-only candidate based on integration `67db773cf2d2ef49bea7a6187cc412c3c5590ef9`. The existing `s3-spinner-downpour` model comes from PR #1278; its `splatlings.mjs` Git blob remains `46250111d00c52d0fd188bae2dab6d6639e8eeb2`. No model, material, renderer, physics, animation or gameplay code changes.

The historical shared-glass workflow only selects its historical branch. Its old gallery is component evidence, not current integration acceptance. The general seven-weapon browser check does not select the catalogue Ballpoint. This candidate closes that bounded coverage gap inside the ordinary current PR/head workflow, without a second build, historical baseline, or ABBA benchmark.

## Same-build checks

- Run the existing `Ballpoint` shared-rendering test against `INKWAVE_BUILT_SITE=_site` after the ordinary build. This exercises the actual emitted registry/kit, independent cached glass, both LODs and draw-range restoration.
- Reuse the unchanged shared gallery with exactly `--ids s3-spinner-downpour --size 500` in the active browser job, using the already downloaded build. Its 32 original PNGs comprise five model views, eleven held/attack views, eight studio glass conditions and eight native high-post-stack conditions.
- Keep the existing native Renderer and same-context Environment, GTAO, bloom, grading, two LODs, two backgrounds and two team colours. Existing actual-GTAO positive checks require zero normal/depth/AO pollution with a visible beauty contribution; disabling the draw-range guards must produce nonzero normal/depth differences.
- Bind the resulting report to checkout `SOURCE_SHA`, the existing build artifact's source marker, build revision/content hash, exact image names and 500-square PNG headers. Record original image SHA-256/bytes. The existing build/packaging checks retain responsibility for whole-site identity; this receipt does not replace them.
- Require eight unique post-stack conditions and the existing shell budget: two raw GL calls, one nonempty beauty draw and one zero-count override call, with range restoration. No new FPS claim or runtime budget increase.
- Include the Ballpoint receipt in the active suite's required aggregate and existing artifact. There is no historical branch-name gate. A fresh output path prevents stale image reuse.

## Local evidence and pending native gate

The preserved 1bd source adoption review passed the existing glass test (1) and selected model/real Actor tests (3), using 629 official source inputs. Current 67db source revalidation passed the same 1 + 3 existing tests with 629 official inputs each and zero source mismatches. The new verifier/CLI/workflow contracts passed 21/21; existing integration/workflow policy contracts passed 35/35. No tests were skipped. These are CPU/source and synthetic receipt checks, recorded separately from pending emitted/native acceptance in the manifest. The negatives reject wrong checkout/build, missing/duplicate images, missing glass, unsafe GTAO, ineffective counterexamples, incomplete/duplicated post-stack conditions and malformed counts/booleans.

No local browser was launched. Actual minified emitted execution and new GitHub native PNG review remain pending. Synthetic receipt tests prove fail-closed validation, not GPU rendering. The PNG helper validates header dimensions and hashes bytes; it is not a complete PNG decoder. Pixel identity with old galleries is not required, and old screenshots do not certify this head. Grip values are diagnostics, not a newly asserted retail-pose tolerance.

## Retail comparison limits

This change evaluates an already adopted model and does not introduce a new Nintendo reference, measurement or inferred calibration. Historical visual references and component evidence remain in the existing Ballpoint report. Retail shape equivalence, source-motion completeness, gameplay timing parity and real-device frame rate remain outside this QA-only acceptance.
