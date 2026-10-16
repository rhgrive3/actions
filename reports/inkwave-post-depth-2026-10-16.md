# Remove the unused mobile post depth attachment

Base: calculation-optimization PR #1514, `747a85ec45c275189bd15a3cc8f05a0af2dcf17f`, including main `f11d7e2d`. This adds a further #642 resource reduction after the existing lazy allocation and guarded packed-color changes.

The mobile packed path already fixes RenderPass to `renderTarget2` before each frame, retaining its RGBA16F color and depth. `renderTarget1` receives only fullscreen Grade/ScreenFX/Output/FXAA color work. The target still allocated its own depth renderbuffer. Set that target's `depthBuffer` to false before its first GPU allocation; preserve target2 depth, color formats, dimensions, samples, pass order and render density. Desktop, unsupported packed FBOs and unsafe/negative-grade HDR fallback retain both original depth roles. No quality or gameplay settings change.

## Verification

- 28 source controls pass: existing real-Three composer/FBO/resize/disposal regressions and integration workflow checks, with explicit post/scene depth and fallback assertions.
- The new browser check imports the **actual emitted Renderer and ScreenFX**. Its baseline restores only the old post-depth flag immediately before first target binding. The production format probe, lazy composer, native pass stack, shaders and scene remain the same on both sides.
- Chromium 156 and Linux WebKit 27.2 each pass **78 exact completed-RGBA comparisons**: LOW/MEDIUM/HIGH touch profiles; portrait/landscape and dynamic scale .73/1; idle, damage, heart, swim, aura, flood, reveal and real lens splat; FXAA enabled/disabled. All tested framebuffers are complete and GL error-free. Pixel hashes are retained in the receipts.
- Instrumented WebGL create/delete calls and framebuffer attachment queries show **two → one live depth renderbuffer**, with no post depth attachment and the scene attachment intact. Both native targets still have the same color formats, dimensions and zero MSAA. This is an actual WebGL-object count, not a physical allocator-byte/RSS measurement.
- Negative grade recreates the full HDR/depth pair; returning to safe grade restores the optimized pair. Hiding the document releases the pair, showing it recreates the correct roles, and final disposal leaves **zero live renderbuffers**. Resize/orientation cases retain the expected one/two counts throughout.
- A deliberate negative control removes the **scene** depth attachment: the forced draw-order occlusion scene changes pixels, proving the check detects loss of necessary depth. Desktop LOW retains both attachments. Existing source controls cover desktop HIGH/MSAA/AO/bloom and unsupported-format fallbacks.
- Emitted content hash: `8333dba32e4f46bb2e37ca6070dc75c80c81faaabe244502af337433774573a9`. Full receipts are in `inkwave-post-depth-2026-10-16/`.

Run `scripts/check-inkwave-post-depth-browser.mjs --site SITE --browser chromium|webkit --out RECEIPT.json`. The unchanged full CI gates run as well; active CI now requires both exact-pixel receipts.

This removes one unnecessary attachment whenever the existing packed mobile path is supported. Physical iPad memory/context-loss traces, overall frame rate and #642's broader hardware acceptance remain unverified. No fixed MiB saving is asserted because driver allocation/padding depends on the device.

The S3 reference remains Ver.11.3.0 and the existing weapon/gear/movement/ink/damage/camera rules. This only changes internal rendering storage; it does not establish console or physical-device behavior parity.
