Prepared real ImageBitmap ownership acceptance. NOT browser-executed or published.
Candidate PR1457:3ab55b1134d93b53c806be00c6d255b232fe2278 (depends on PR1456).
Baseline parent:efb8cfa1d38f962a509f0a32fa8add04352344d3.
All runtime bytes unmodified; dependency boundaries for source acquisition/registry/config are explicit fixture modules.
Use exact checkout vendor/three/build files at candidate head; both module/core SHA256 are asserted.
Hosted Node22.23.3, Playwright1.62.1 Chromium path is intended; do not install or launch locally.
Command: node --test receipt-gate.test.mjs
Command: node acceptance.mjs candidate.mjs baseline.mjs SOURCE_CHECKOUT/inkwave-public/vendor/three/build result.json
Use the reviewed process-tree resource supervisor and an external120s hard deadline. Compact JSON/log artifacts only.
Ephemeral loopback server, isolated context per case, external browser requests blocked, no user profile/cache.
Synthetic32x16 PNG, optional8x4 resize. Real createImageBitmap, ImageBitmap.close, OffscreenCanvas and Three.Texture/DataTexture.
Failure injection: resize promise rejection before actual second decode; renderer anisotropy query throw after real Texture allocation.
Cases each baseline/candidate: decode, resize, resize reject, setup reject, normal conversion, abort.
Negative control expects baseline resize/setup leaks while candidate closes all untransferred bitmaps.
Normal success proves image still drawable with expected dimensions/pixel and transferred to Texture, then caller closes/disposes.
Instrumentation is restored in finally; remaining bitmap cleanup uses intrinsicclose after measurements.
No WebGL context or real-stage assets; this cannot qualify GPU upload, renderer crashes, iPad/WebKit, process-memory reductions or actual user crash causality.

Revised receipt gate requires exact intentional exception and scenario-specific bitmap count, creation-call count, live dimensions/pixels, close events, texture disposal and caller cleanup. Baseline ownershipPass=false alone cannot qualify. No runtime or browser scenario changes. Twenty-two CPU receipt controls include unrelated failure and absent-bitmap rejection.
