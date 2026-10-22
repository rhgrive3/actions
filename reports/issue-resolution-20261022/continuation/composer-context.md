# #642 browser context lifecycle acceptance

Chromium 143.0.7499.4 and WebKit 26.0 each passed the existing 78 exact RGBA comparison cases and six new real WebGL context-loss cases (LOW/MEDIUM/HIGH × original-depth/candidate). Each engine completed 207 readbacks. The scene-depth-removal negative control failed as expected, and disposal retained zero renderbuffers.

The emitted Renderer intentionally stops after both context loss and restoration, pauses its match, leaves its active network once, and displays an actionable reload overlay. The test now verifies that policy, including zero scene draws or target reconstruction while halted, and verifies a clean Renderer reproduces the exact pre-loss pixels. It also retires owned test contexts explicitly instead of relying on GC after exceeding typical browser context limits. No production behavior changed. Existing resize, hidden/visible, composer reset, HDR fallback, FXAA, effects and desktop checks remain intact.

The tested build has content hash `46e01879c9e4facd3ef99bdeb095b5962098036021ff6dd1a4685f44b8a0a3c4`. Raw results and served-artifact receipts are recorded with SHA-256 in [composer-context.json](composer-context.json). The source-context lifecycle regression suite also passed 14/14. Earlier failed QA attempts are retained in `.ci-scratch/continuation-performance/` and explained in the JSON; they were test-expectation/event-task errors.

Splatoon 3 reference: 11.3.0. Attachment allocation is a browser implementation detail and has no claimed Nintendo equivalent. These software-rendered checks establish browser output/lifecycle behavior; physical iPad/Android GPU memory, device compatibility and issue-owner tolerance agreement remain pending. #642 is not marked fully resolved.
