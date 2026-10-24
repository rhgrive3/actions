# Drive optimization queue integration — 2026-10-24

## Scope and accounting

The requested `INKWAVE-main-b1f571da-20261016-edit` source points to main commit `7f863ea2d65671abd1453fdae1b61de00f1d10e2`. All 1,578 after-blobs in its latest manifest matched that checkout. Work used four concurrent roles: integration/network/motion/ranked; weapons; world/native/CI; and visual/audio/browser verification. Concurrent main-CI repairs from PR #1867 were reconciled into the integration instead of replacing them.

The starting queue contained 329 rows. Of these, 66 had already been implemented by the main integration in PR #1861. The remaining 263 rows were inspected against the complete production source composition, not just unadapted upstream text.

| Disposition | Newly reviewed 263 | Full starting 329 |
| --- | ---: | ---: |
| Implemented in this change | 205 | 205 |
| Already effective in the baseline | 33 | 99 |
| Reviewed and not adopted | 22 | 22 |
| Requires further evidence | 3 | 3 |

These are queue-row counts. Duplicate requests can share one implementation; a row can also describe several related changes. They are not independent test or optimization counts. All 329 slugs, decisions, reasons and source references are retained in [the public disposition index](drive-queue-dispositions-20261024.json). Private document identifiers, source document bodies and Drive links are omitted.

## Changes and their ownership boundaries

### Network, host authority and replay work

Combat and paint admission avoid repeated tuple construction, key construction and scans while retaining exact actor, membership, owner and collection identity checks. Batch paint ordering uses a fast path only for strictly increasing clocks. Mutating or replacing a collection invalidates the applicable memo; unusual/custom collection behavior takes the conservative path.

The authenticated relay receipt remains independent from packet-supplied clock origins. Its private symbol survives the real packet-copy path, including packets received before handshake completion. A forged future origin cannot increase the negotiated current-relay clock allowance. Missing receipts on that protocol fail closed; legacy custom transports retain their existing compatibility rules. Encoding avoids allocating UTF-8/JSON representations when a short scalar check or full queue already decides the result.

Wipeout histories share immutable packed records and reuse a verified common prefix. Confirmation replay work has a fair room-wide budget, and a refusal keeps its pending obligation. Immediate confirmations retain their existing behavior. Relay LEAVE cleanup uses iterative failure processing, retaining the original reentry and close semantics without recursive fanout.

Relevant tests include the new `drive-owner-clock`, `drive-wipeout-budget`, `drive-authority-cache` and combat tests under `patches/network-replication/tests`, the existing owner-clock/issue-1767/admission/capacity suites, and `server/tests/relay-security.test.mjs`. The final focused ownership/source-bank/world-slicing/clock run passed 21 tests with no failures or skips. The actual synchronous paint callback test still removes membership during application and verifies that the second authority check rejects causal-clock advancement. That second validation was deliberately retained.

### Character motion, quality changes and ranked modes

The final build adapter reuses unchanged scalar trigonometry and smoothing coefficients, local motion records, and stable references. Quality switching reuses a bounded set of meshes only after restoring geometry, material, skeleton/bindings, transforms, callbacks, morph state and other observable fields. Same-part mesh identity is retained without recycling stale appearance or behavior.

Source-loaded Character comparisons cover 216 new pose cases at 30/60/120 Hz, with exact transforms and geometry, plus two-direction quality transitions. The earlier complete motion parity suite also retained its 696 exact comparisons. These are CPU/source-loaded numerical checks; they do not establish device FPS or Nintendo animation parity.

Ranked changes reduce temporary coordinate arrays, duplicate inventory sums, repeated box/sphere work, goal-arc construction, unchanged HUD strings, redundant barriers, and unneeded empty hit arrays. Borrowed and owned catch-up data remain distinct. Broadcast helpers retain the actual NetMatch receiver and preserve nested/custom hooks. Four ranked modes were compared over 360-step runs with events and snapshots; targeted tests cover 6,000 goal cases, coordinate-array variants, HUD updates, restoration aliases and catch-up ownership. A callback-receiver regression discovered during integration was corrected before the successful final runs.

### Weapons, world, visual/audio and CI

The separate workstream reports retain item-level implementation and validation details:

| Area | Implemented | Already effective | Not adopted | Needs evidence | Report |
| --- | ---: | ---: | ---: | ---: | --- |
| Integration/network/motion/ranked/build | 53 | 11 | 6 | 1 | This report and the browser/publishing audit |
| Weapons | 72 | 0 | 3 | 1 | [Weapons](drive-queue-weapons-2026-10-24.md) |
| World/native | 28 | 4 | 5 | 0 | [World/native](inkwave-world-queue-2026-10-24.md) |
| CI/mirror | 14 | 0 | 0 | 0 | [CI/mirror](inkwave-ci-queue-2026-10-24.md) |
| Visual/audio | 38 | 18 | 8 | 1 | [Visual/audio](drive-visual-audio-queue-20261024.md) |

Weapon caches use complete current-state keys and preserve event order, numerical operation order, paint, ownership and pool reset behavior. The final Crab idle-phase change retains both original sine expressions exactly. Kraken comparisons cover 6,218 points over 1,500 poses with bit-identical results. Charger protected rows and source constants are retained.

Native/world preparation writes final typed arrays directly, reconstructs exact bounds/normals and uses bounded decompression and prepared-data ownership. Five legacy layouts retain exact navigation graphs, geometry attributes, bounds, collision data, instances and shadow flags. All 24 raw upstream-lock hashes remain unchanged; the paint optimization lives in a terminal build adapter rather than changing its locked raw file.

Visual/audio work includes bounded caches, deterministic DSP and allocation reduction. The report separates source/VM numerical comparisons from real rendering and from platform/device evidence. The audio-permission inventory does not grant rights, remove assets or silently change distribution. Original source URLs remain in their existing manifest rather than being recopied into the public inventory.

CI changes preserve failure status and diagnostics when evidence exceeds the 128 MiB cap, add missing source-path triggers, trim unnecessary test-only installations/checkouts, and constrain mirror redirects, output paths, response sizes, counts and deadlines. The configured mirror currently responds with HTTP 402; controlled localhost fault tests pass, but a complete live mirror was not qualified.

## Build and browser verification

The integrated production build passed the deterministic startup budget. A clean, uniquely named output directory was used after an earlier shared output directory contained stale revision files. Every one of the clean build's 2,152 manifest artifacts was hashed and matched; its 2,153 total files comprise those artifacts and the manifest. No old revision files remained. The [static inventory](drive-static-twins-inventory-20261024.json) records 1,071 identical root/revisioned pairs totaling 48,990,113 root logical bytes. No additional root assets were deleted and no transfer or storage saving is claimed for that proposal.

A final static-dependency audit found ten adapters missing from the existing source-input identity lists, including three newly added terminal adapters. The quality/reliability identity lists now include them, retain the prior key order, and are guarded by a five-case coverage suite registered in CI. Rebuilding with 1,458 declared inputs (previously 1,448) produced exactly the same 2,152 artifact paths, hashes and sizes, content hash and immutable revision. Only `inkwave-build.json` changed by 2,248 bytes. [The final build equivalence record](drive-final-build-equivalence-20261024.json) connects that new input hash to the original browser-tested payload without relabeling the old source proof.

Browser validation uses the existing 22 selections in their original order: one Splashdown selection, 18 Inkjet combinations (30/60/120 Hz, 1/2/4 actors, near/mixed views), and three native-terminal selections. Artifact/source scans and browser launch are shared, but every selection gets a fresh BrowserContext that closes before the next selection. Per-case stat checks and served-body hashes detect changes after the initial proof. Failure and cleanup paths remain fail-closed. All 22 selections passed, comprising 33 native scenarios; captured assertion failures and console/page/server errors were zero. Chromium 151.0.7922.34 used ANGLE SwiftShader with fixed simulation dt. The [verification summary](drive-browser-verification-20261024.json) binds every result digest to source `b6ed09b0e5b183eac435062429af8368c9f9a0ad` and content hash `30c3f5023a51395c79f25e15f0f3850c8a7b923d9c399379f1ba1cca26d34c41`. The [browser/publishing audit](drive-browser-publish-audit-20261024.md) records the details and limits.

The component checks are deliberately not summed into one inflated test count. For example, the CI workflow suite overlaps its 92-test focused suite, and Node's file-level runner counts files rather than all nested test cases. World/native reports 170 passes plus five optional external-fixture skips; legacy construction reports 195 passes; the CI/mirror work reports 92 Node/VM tests and ten controlled Python network cases. The 83-case all-specials component suite requires a larger heap in this environment: both the unchanged base and candidate reached the default roughly 2 GiB limit, while the candidate passed at 4 GiB. The production CI heap policy was not relaxed. After the latest PR #1867 route correction, ten focused CI files contributed 64 successful cases and the mirror contributed ten successful cases. The isolated fixture initially omitted `index.html`; after materializing the original HTML/CSS, the affected 14-case ownership file passed. That rerun is included in the 64, not added to it. Fifteen edited workflow YAML files parsed, the historical pose gate remains on its strict owning-PR route, and atomic-intro runs once. The later PR #1867 follow-up through `5178b480` changes four test/QA files. Its missing comma was repaired, and its obsolete client-lock fixture expectation was replaced with explicit relay-owned lock, matching ACK and cleared pending-start assertions. The final host-ready suite passes 9/9, alongside 44/44 hidden-host cases; these repairs do not change production emission.

Local source, component, build and browser evidence must not be presented as an exact final remote-commit Actions result. Hosted workflow results are attached to the PR/commit that actually ran them. Documentation-only follow-ups do not retroactively change the source SHA recorded by the local browser proof.

## Why 22 proposals were not adopted

The full index preserves each reason. Several proposals assumed immutable ownership where the current API permits mutation: SourcePose/SourceBank data, published navigation graphs, retained ranked rule objects, or weapon state. Caching only a reference or omitting the next copy would miss those writes. Tests exercise escaped references, in-place edits and synchronous callbacks.

Other proposals would remove first-shot readiness barriers or alter culling/resource ownership without the requested representative GPU/memory evidence. Blanket root-asset removal would conflict with existing startup/packaging consumers, service-worker cache behavior, direct URLs and development/Workers routes. The read-only audit is complete; a broad deletion is not justified.

The clam-bot record-sort diagnostic did not establish a useful general improvement. In the actual Node/V8 botGoal diagnostic, 8 and 16 candidates were slower by about 9% and 6%; 32 and 40 candidates improved by only about 2.6% and 0.4%, before unusual-input guards. The simpler algorithm and stable reachability order remain. [Raw diagnostic](drive-clam-sort-diagnostic-20261024.json) records the trials and exact scope; these times are not a device or gameplay FPS result.

## Three unresolved evidence requirements

1. **Fizzy flight splash paint.** Source evidence for the physical release, initial velocity, gravity and landing footprint is insufficient. No physics constants or retail behavior are invented to close the row.
2. **Recorded-audio distribution rights.** The inventory contains 390 actual audio files, 420 manifest rows and 388 manifest paths, with no verified grants in the available evidence. Rights qualification and a distribution decision remain outstanding. Asset deletion is not used as a substitute for that decision.
3. **Historical Pages 503.** The exact old immutable module URL now returns 404. The current published module returns 200 and matches its manifest SHA-256. These observations do not explain the historical 503. Existing release-health failures are not masked by retries. [HTTP evidence](drive-pages-http-evidence-20261024.json) records the observed times, URLs and hashes.

## Gameplay comparison limits

The retail reference remains Splatoon 3 Ver.11.3.0 under the repository's existing weapon/gear and state definitions. Numerical/ownership equivalence is against INKWAVE's verified composed baseline. No new retail frame values, flight constants, controller measurements, Switch comparison, Safari/iPad performance, full remote session, power or device FPS result is inferred from the checks above. Relevant gameplay boundaries and remaining gaps are also recorded in [the behavior comparison](inkwave-splatoon3-behavior-2026-10-02.md).

## Hosted-CI follow-up: fixture and measurement contracts

The first PR run exposed three QA contract issues before its main checks could complete. The sparse-checkout test's synthetic workbench paths were mistaken for real production dependencies; the guard now accepts only that verified data declaration and still rejects actual imports, filesystem access, executable declarations and indirect binding misuse. Both affected source-contract suites pass all 11 local cases.

The swim-entry runner required a positive gameplay RNG call count although the existing main's probe test explicitly expects zero after Three UUID generation was isolated to crypto. Real Chromium recorded zero calls on the unchanged production payload. The harness now verifies the RNG observer's identity and completion at 277 setup/tick/capture boundaries, retains count/digest equality between both sides, and rejects missing/replaced/incomplete observers. Twelve focused cases pass; all 12 before/after PNG hashes and canonical traces match. No dummy RNG calls or production changes were added.

The emitted special fixture extracted only three Projectiles methods, dropping a valid minified top-level helper used by InkVac replay. It now evaluates the complete emitted weapons module in the same VM and uses the real exported Projectiles prototype, retaining the HOLD, native-birth, deduplication, pool and negative-control assertions. All eight emitted cases pass against the previously verified production output after a complete artifact-hash readback. These changes affect tests and QA only; the published runtime payload remains unchanged.
