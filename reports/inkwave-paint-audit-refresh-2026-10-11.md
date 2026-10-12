# Paint audit refresh against adopted mainb078c379

Documentation/generator-only candidate. The old table still asserted fixed seed0, immediate floor projection and depth-below-one clamping after their source-backed corrections were adopted. It also failed to expose numeric SpecUp entries whose source omitted the type discriminator, including Tenta's3.15/3.465/3.78 curve. The new table distinguishes22 explicit falling-splash paths from other family paths, adopted corrections from held candidates, and raw untyped entries from engine-default interpretation.

The pinned98tables (65main/14sub/19special) were reread, all65catalog hashes and retained leaves matched, and3,433explicit paint/splash leaves were retained. Untyped SpecUp entries are supplemental and do not inflate that paint-leaf count. Source numeric presence is not proof of runtime consumption or retail masks. All98rows remain retailParity=unverified. The source URL, raw SHA and exact JSON pointer remain available for every row.

PR1235wall feature remains unadopted due to measured CPU/wire cost. PR1238cache, PR1245codec tradeoff, PR1254rectangle coalescing is unadopted after a strict WebKit atlas byte mismatch. Its later source cases and WebKit built mode remain unverified. PR1258local dedupe memory is adopted after current-main exact CI and Chromium/WebKit source/built gates. PR1262ordered run scan is adopted with exact ordered GPU inputs and measured controlled-workload CPU reduction. The documented nominal special disk/AP correction does not certify original stencil topology or remove all one-cell quantization residuals. No runtime, package or shader changes are included.

Validation: generator complete98tables/3,433leaves; audit contract2/2. This snapshot is tied to adopted mainb078c379 and must be refreshed if adoption status changes before publication.

## Ordered-run scan validation and adoption

PR1262 exact17dd528116a3f95884a35cd13929b2fa6a717696 is based on adopted90b4fea7. Production manifest0b31cf5cfd478b9bcdf89f4d6abe0e746f8012e5a01486a612fad57a6bb207c0; Chromium and WebKit source/built24cases retain every RGBA byte, ordered quad input/count, ownership grid and turf value (artifact11721004483). Fixed same-runner AB/BA three pairs per profile, run38192242269, disables per-method/per-quad instrumentation equally. One-Actor total paint workload743.4–765.6→623.0–691.1ms/4s; eight-local-Actor6266.4–6439.2→5165.3–5335.7ms/4s. All measured pairs improve; grid/canvas/quad/draw/event counts match. These are SwiftShader workload measurements, not hardware-GPU whole-game FPS. Earlier detailed instrumentation produced a one-Actor regression and is preserved in the PR evidence; its cause is not established.

At2026-10-12T02:31Z, final required CI has only the same-head Responsive retry pending. The first attempt ended with a browser/context-closed error after eight cases; assertions were not weakened. This evidence does not mark the candidate adopted or alter any of the98retailParity entries.

Final status2026-10-12T02:48Z: the same-head Responsive retry succeeded and all three exact-head workflows passed. Parent merged PR1262 into mainb078c379; Pages38196775801 succeeded with build0b31cf5cfd47 matching the tested production hash. Main Validate38196775863 is still queued. The earlier failure and adverse instrumented trial above remain evidence, not waived results.
