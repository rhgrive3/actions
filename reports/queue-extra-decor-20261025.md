# Legacy Decor queue follow-up — 2026-10-25

Two current proposals were checked against the final composition:

- **Palm ring Bezier reuse is already effective**, through `runtime-frame-scratch-adapter.mjs`. The added real-geometry oracle confirms identical complete geometry bytes on Tidewater, Kelpline and Halyard with 540 fewer point samples per palm. No duplicate implementation was added.
- **Spawn face/barrier shape sharing is added** in `queue-extra-decor-adapter.mjs`. Each Decor owns one face CircleGeometry and one barrier CylinderGeometry, reducing four shapes to two. Both teams retain separate materials and uniforms. Unattached resources from partial construction join the normal disposal Sets, and owner fields are cleared on disposal.

The vendored BufferGeometry constructor consumes four random values for its UUID. The reused second-team shape path explicitly consumes the same UUID draw at the original point, retaining the subsequent random stream and object UUIDs without constructing another geometry.

`node --experimental-vm-modules --experimental-global-webcrypto --test patches/local-quality/tests/queue-extra-decor.test.mjs`: **7 passed, zero failures/skips**.

The tests use actual vendored Three.js and the real complete Decor constructor/update/dispose. All five legacy layouts retain every position, normal, color, UV, index, mesh transform and bounding sphere. Materials/uniforms stay independent. Pad pulses and enemy proximity values agree at 30/60/120Hz. Normal/repeated disposal calls each shared geometry once; failures during face rotation, barrier construction, second-face mesh creation and fourth shader creation release all tracked resources and remove the partial scene. The seeded post-construction random state and object UUID stream also match.

`node --check` and `git diff --check` pass. No Actions was requested. This is a geometry/lifetime/logic oracle, not a rendered-pixel, GPU-memory, iPad/Safari, frame-rate or retail Splatoon 3 measurement. Existing gameplay comparison limitations remain unchanged.

Final review correction: the existing far-actor axis prune skipped a mixed NaN/far-coordinate sample even though the original hypot would propagate NaN. Two Number.isNaN guards now preserve that original fallback. The actual Decor regression compares 64 coordinate combinations (NaN, infinities, undefined and finite boundaries) against the original update; no mismatch remains. Valid finite far actors retain the existing optimization.
