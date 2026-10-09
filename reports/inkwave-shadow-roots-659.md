# Shadow caster ownership on stage replacement

Refs #659. Start: https://github.com/rhgrive3/actions/issues/659#issuecomment-6025106764
Base496cc8f91dbc6af7510182394b6dec3546ea970d.

The existing depth-cache installer now wraps the native setStaticRoots and clears its collected static entries after the native root assignment. Native root filtering, dynamic WeakSet reset and dirty marking remain in charge. Private framebuffer allocation, resizing, restore and rendering policy are unchanged.

Actual native ShadowCache collection over Three Mesh/BufferGeometry/material/CanvasTexture objects reproduces the stale route after resources are disposed and roots replaced without another shadow render. Restoring the old root setter retains the old mesh/material/atlas route; the corrected setter has no old static entries immediately. The next real _collect returns only the new stage caster. Thirty root switches preserve target identity and do not dispose targets; final disposal remains owned by the existing lifecycle.

New three root-lifecycle cases plus five existing framebuffer/context/disposal cases pass. These prove direct JavaScript owner paths, not forced-GC timing or physical mobile memory usage. Actual shadow rendering/heap profiling is not claimed.

The existing source resourceFixture lacked resolution of a patch module's ../../src import back to inkwave-public/src and stopped all eight cases with ENOENT before runtime. A separate one-line fixture mapping now matches the native-source mapping already used in the main source fixtures. No production module resolution changed. No remote push/build/CI change was made while the acceptance head remained fixed.
