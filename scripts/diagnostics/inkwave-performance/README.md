# #1434 renderer fixture diagnostics — DO NOT MERGE

These controls investigate why unchanged production output can differ by one
8-bit channel. They do not enable a performance or quality feature, replace a
runtime module, or establish current-main/device performance. Keep them on the
separate `diagnostic/actions-performance-20261022` branch; do not open a
production optimization PR from these observations.

The completed controls use exact source
`f9d744eba5cbd86ef9a4a77e9a4dbd61c48d4d90` and SwiftShader. Initial controls use Chromium 143; the CI-browser and final GPU-input controls use pinned Chromium 151. A
production build is verified against Git blobs and every served artifact. Build
that immutable source with its unchanged production builder into a separate
output directory. Never overwrite a site used by another acceptance run.
Set `--root-C/--root-B` to checkouts that contain the source Git object and
`--site-C/--site-B` to that same verified build. Both variants must have the
same SHA/content hash; C/B are independent routes, not an actual optimization.

With Playwright and its browser dependencies installed, run from the repository
root (substitute the four paths):

```sh
node scripts/diagnostics/inkwave-performance/check-compiled-texture-observer.mjs \
  --site /path/to/verified-production-site \
  --playwright /path/to/playwright/index.mjs \
  --chromium /path/to/chromium \
  --out /path/to/evidence/compiled-texture-preflight.json

node scripts/diagnostics/inkwave-performance/measure-native-compiled-texture.mjs \
  --mode calibrate --stage tidewater --scenario normal \
  --width 480 --height 300 --warmup 30 --samples 60 \
  --root-C /path/to/repository --root-B /path/to/repository \
  --site-C /path/to/verified-production-site \
  --site-B /path/to/verified-production-site \
  --sha-C f9d744eba5cbd86ef9a4a77e9a4dbd61c48d4d90 \
  --sha-B f9d744eba5cbd86ef9a4a77e9a4dbd61c48d4d90 \
  --playwright /path/to/playwright/index.mjs \
  --chromium /path/to/chromium --out /path/to/evidence/two-contexts
```

The latter runs one browser, two sequential contexts, 30 rendered warmups and
six completed frames per context. The last frame additionally reflects actual
GL uniforms/state/sampler bindings and collects five compiled-uniform texture
references through the original `renderBufferDirect`. It reads their level-zero
GPU color contents afterward, restoring/deleting the temporary read framebuffer
and restoring pack alignment. Natural PWA installation/offline readiness and
real audio/music workers remain enabled. Shadow/depth contents and actual GPU
vertex-buffer bytes remain unobserved. Observation overhead prevents timing
claims.

`measure-native-actual-draw.mjs` records the GL draw transcript without the five
extra texture reads. `check-actual-draw-observer.mjs` runs its small native →
observed → restored exact-pixel control. `measure-native-fresh-process.mjs`
instead runs four C/B/B/C same-native controls with a new browser process for
each trial and checks owned PID/start-tick termination before the next trial.
The same gameplay arguments apply to all three scripts.
The ownership check requires Linux `/proc`. Use an external process timeout
(the recorded two-context probes use 450 seconds) and run only one browser
probe at a time; concurrent software WebGL work confounds timings.

`measure-native-ci-browser-control.mjs` is a separate four-trial condition
pinned to Playwright 1.62.1 / Chromium 151.0.7922.34. Supply those module/browser
paths with the same gameplay arguments. It enforces a 180-second boot gate;
the preserved earlier Chromium 143 harness had a 900-second internal boot wait.
The CI-browser run uses a 1200-second external supervisor deadline. It adds no
actual-draw or compiled-material hooks; its byte/color observations occur at
the endpoint after unchanged native frames. Earlier Chromium 143 failures are
retained. Cross-browser timings cannot establish an optimization or device
performance change.

Two-context diagnostics deliberately exit 2 with a `diagnostic-*` status; they
cannot become a passing calibration. The fresh-process control exits 0 only
for strict same-native repeatability, otherwise 2. Exit 1 or `failed` is an
execution error. No changed-channel tolerance is allowed. Do not proceed to
historical f11/3acf eight-trial A/B while native strict repeatability fails.
Both historical sources already contain #1427; their later calculation changes
cannot isolate that PR's total effect or establish current-main improvement.

`check-gpu-frame-inputs.mjs` uses the same `--site`, browser and output-file
arguments as the compiled-texture preflight. It covers actual VBO/IBO bytes,
mip/color/fallback/raw-depth textures, nondefault PACK/UNPACK PBO state and four
compile/link/query/resource-creation fault cleanups. The raw depth control does
not verify nonzero texture compare mode or sampler2DShadow restoration: the
initial native shadow fixture itself raised INVALID_OPERATION and was rejected.

`measure-native-gpu-frame-inputs.mjs` uses the same gameplay arguments as the
two-context compiled-texture command, pinned Chromium151, a 180-second boot gate
and a 450-second external timeout. Its upload/allocation tracker is installed
before the first production module and Renderer; unchanged real draws on the
last frame expose active VAO attributes, actual VBO/IBO bytes and allocated
tracked sampler mip/face/layer contents. Supported depth values are sampled
into R32F, not native depth storage bits. RBO contents, unsampled blit source
contents, stencil and unsupported/nonrenderable texture allocations remain
explicitly unobserved. The observer is always stopped, its prototype wrappers
removed and owned browser PID/start-ticks checked after cleanup. No timing claim
is permitted from this diagnostic.

Relevant helper regressions:

```sh
node --test \
  scripts/tests/inkwave-render-input-receipts.test.mjs \
  scripts/tests/inkwave-actual-draw-receipts.test.mjs \
  scripts/tests/inkwave-compiled-texture-receipts.test.mjs \
  scripts/tests/inkwave-gpu-frame-inputs.test.mjs
```

The continuation reports pin source/helper/harness hashes and describe each
unobserved input. Raw JSON/log/transcripts and executed harness originals are
archived with member hashes; PNG/RGBA remain local with hashes in the artifact
manifest. Earlier executed harnesses used absolute imports; their portable
copies differ only in relative import spelling, recorded in the mapping receipt.

The published raw archive is `performance-render-observer-raw.tar.xz`. Extract
from the repository root with:

```sh
tar -xJf reports/issue-resolution-20261022/continuation/performance-render-observer-raw.tar.xz
```

XZ preset6 preserves the original tar byte stream and all104 member contents.
The artifact index and publication audit record the tar-stream SHA256, published
XZ size/hash and original gzip provenance. The 12,721,009-byte original gzip
(SHA256 `d69bc0aa75210253a3700a4cab7bb72c2898fb3a05f222bf7f0c2b4ff4522364`)
is retained locally and excluded from the published tree because its base64
request exceeded the upload limit. Recompression changes no source/helper,
harness/test or raw evidence member content; archived documentation remains the
original frozen snapshot.
