# Diagnostic-only postprocess owner evidence

This extension is based on QA head 5625829733c77afa6ff26c89a4b067a1cf4643d4 and immutable COMMON cc0c90afe8031643e6a890974f8f44a40a30509e. It does not modify canonical frame/paired scripts or runtime files.

The generated settled-only frame observes nine existing native postprocess owners in geometry snapshots. The generated A/A paired program adds only their explicit semantic identity mappings. Raw UUID evidence and equality results remain separate. Unknown references, strict source/loaded/RNG state, all full-frame and sequential pixel gates, 28 native frames, deadlines and performanceAccepted:false remain unchanged. This adds no render, GPU readback, material edit or cache creation. CPU observation is not timing neutral and is not part of normal performance samples.

The compressed historical fixture is exactly the selected old A1 snapshot, with original provenance and hash in historical-fixture-provenance.json. It deliberately has no new identityOwners evidence and still fails inventory completeness. CPU tests combine separately created actual-source native constructors with the preserved unrelated scene schema. Those hybrid tests do not repair the historical capture or prove GPU-content equality. common-tree-blobs.json is the verified 17-path excerpt of the official COMMON tree, not an entire checkout.

Tests need a separate immutable COMMON source tree supplied through INKWAVE_MATERIAL_COMMON_SOURCE. Run the existing repository test command with --experimental-vm-modules; the native constructor fixture uses Node VM source modules. A thin local source cache made of symlinks additionally needs --preserve-symlinks locally; normal CI Git checkouts do not.

The wrapper saves pre-extension and final executable hashes, helper bodies and exact launch arguments before spawning. It rechecks helper/executable/import bodies after child completion. Only A1/A2 are eligible; no B or normal performance run is enabled by this extension. Historical 562582 A1 sequential-repeat failure remains failed. A future capture would be new evidence, not relabelling that result.
