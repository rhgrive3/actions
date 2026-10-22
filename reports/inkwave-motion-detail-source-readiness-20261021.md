# Source-loaded motion-detail readiness candidate

## Evidence and limits
PR1760 head12a5bb772b46174ff125793519ab4af64b706649, job119378866063 failed on flow-squid at 2026-10-21T18:06:07Z. Frames110/111 had zero pixel difference, with-rig calls2 vs without1, root/character/alive true and projectile/inkBlob counts0. This is not proof that all rig draws disappeared.
The camera follows the display root at every capture. The root remains within the orthographic frustum. Floor occlusion, deformed geometry or owner timing remain possible; none is proven as the root cause.
The original fixture created Actor then advanced90 fixed ticks without awaiting the optional asynchronous source owner. Character94747083692c8d7335c20ce71fc2e6d1a139372d replaces pending owner through _sourceMotionLoader; source-controller44db36d1fdb8eda843ec049927467c8ba9b71edd loads human and squid banks and catches failures into status error. Old failure evidence is preserved, not reclassified as a proven race.

## Narrow change
Before the original90 fixed settle ticks, await the actual readiness promise with a180s wall-clock timeout. Reject failed/disabled/missing owners, missing banks and rig mismatch; do not use native fallback as a successful source-loaded capture. After settle and at each capture require the identical ready active owner and validate selected clip names against the loaded human/squid banks, with finite frames/weights. Record owner/clip receipts.
No runtime/model, floor, submerge interval, visibility counterfactual, camera, simulation step, action input or pixel threshold change. Ready waiting intentionally establishes deterministic source-loaded preconditions; it is a QA condition change, not a gameplay fix or retail parity proof.

On a failed pixel pair, read native getVertexPosition CPU-skinned draw-eligible indexed vertices into world/NDC bounds. Observe native ancestor visibility and material/drawRange rules; scalar materials ignore groups, material arrays use groups. No geometry, transform, skeleton or pose writes. Cap250000 index entries and label truncation. GPU shader deformation and depth visibility are NOT measured; null bounds do not become zero or success.

## Verification
Nine helper test bodies executed successfully in pure V8: actual owner replacement, load status failures, rejected promise, timeout, owner drift/inactive/unloaded/nonfinite clips, detached receipts, bounds read-only, empty/nonfinite/capped bounds, scalar-vs-array group semantics.
The existing11 summary tests still pass in pure V8, including bounded stdout. This is not Node/Three/browser execution.
The existing source-only Validate test step includes the new helper tests. Independent source review precedes publication. Required real Node/native validation remains pending; no forced capture solely for logs.
