# Independent PR1312 full-post review

This diagnostic branch does not adopt or edit PR1312. It starts from main
545c6b3fcfc0d25c43678e9b44b1af4e26400fec. Its ordinary product remains identical
to pure ac1159: contentHash 43ddefa5e29081aba0eed716ac9e8240e9f5fee46178ea6685dba6faf265fdcd,
inputHash 3a604dc1ed5027f53aec5c553b50c23a6ceb5edc5dc85dbf06526336ced49cab,
revision 6f6f90a3ba61500609c4d79f9350ee5f3fe897aaa87e2bea055560b4292f2f00.
The workflow first verifies these three identities. Only inside that one job,
three pinned runtime files from PR1312 head996a30 are copied into a private
candidate build. The source fixtures are not served as production assets.

The browser uses the native Renderer and Environment in their own GL context,
high quality, actual GTAO, bloom and enabled sun shadows. It checks that ink
reaches the GTAO override pass and that real source/actor shadow draws occur.
Eight actors remain in the scene. Simulation and input are prepared once;
unrelated mesh draw hooks are warmed and frozen equally for comparison.

The same original ink Mesh is rendered in four cells: old early-discard/full
non-indexed, new late-discard/full non-indexed, old/culled and new/culled. This
preserves object ID and transparent sort position. The old material comes from
the exact ac1159 source and imports the same built createLevelMaterial module.
Current paint palette, clock, wakes and texture values are matched.

Views cover gameplay, available wall/slope faces painted with two teams, left
and right frustum crossings, a deliberate away view, and return. This first
bounded diagnostic runs Scorch only; it does not certify all five stages.
Absent wall/slope geometry is reported as incomplete coverage, never silently
called complete. Retail map/model/physics parity and iPad FPS remain unverified.

Every frame completes with synchronous RGBA readPixels from the final default
framebuffer and copies its PNG before yielding. Actual black, transparent and
uniform-color GL clears must be rejected by the same validity classifier.
The deliberate empty away view may validly contain uniform sky; geometry views
may not pass with black/transparent/uniform output. GL errors/context loss,
raw frame diagnostics and images are persisted before comparison assertions.
No gl.finish completion assumption is used.

Each cell has an A/A self control. Nonzero self variation makes the comparison
inconclusive. Culling must be pixel-identical with each shader. Old/new shader
differences are measured and require image review; they are not auto-approved.
Indices, drawRange, mesh/shadow hooks, material and camera are restored in
finally. CPU paint, source positions and level/physics/navigation identities
must remain unchanged. Timings are diagnostic wall times, not device FPS.

Workflow: one job, 45-minute ceiling, no cancellation of any other run.
