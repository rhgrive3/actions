# CI and public mirror queue — 2026-10-24

## Scope and result

All 14 assigned CI/mirror items are implemented. These changes preserve gameplay/physics/rendering algorithms. Source-path coverage can increase relevant CI runs; no runtime or hosted CI speedup is asserted.

## Validation

- The focused Node/VM suite passed 92 tests, with no failures or skips, including the unchanged touch/roller/frame/paint/swim tests.
- Workflow/source-ownership controls passed 31 tests, with no failures or skips; this set overlaps the focused suite and should not be added to it as a unique-test total.
- Python mirror tests passed 10 cases against controlled localhost servers. Tests cover same-origin/query behavior, cross-origin 302/307/308, downgrade, loops, redirect-body draining, declared/chunked oversize, total/count/deadline, interrupted bodies, unsafe paths, collisions and failure exit/manifest.
- Fourteen edited workflow YAML files parsed successfully. Actual Git sparse-checkout fixtures demonstrate exact retained/excluded paths.
- The test-only suites ran without a dependency installation. Source-motion input assets were hydrated before the final swim run; the initial sparse-fixture failures are not presented as a successful run.

## Diagnostic evidence behavior

The recovery artifact cap remains 128 MiB. Successful under-budget runs submit their original directory unchanged. Overflow retains a failed status and produces a separate bounded package with a source SHA, full-file SHA-256/size inventory, omission reasons and prioritized evidence. A large log may be represented by an explicitly marked tail copy; source evidence remains intact. If the inventory itself exceeds its metadata allowance, omitted inventory entries are counted and the complete inventory is bound by a digest. Upload eligibility describes the prepared package, independently of the budget failure.

## Mirror boundaries and live qualification

The mirror accepts only its configured scheme, hostname and effective port. Cross-origin and HTTPS downgrade redirects are rejected before contact, and redirect response bodies are closed without reading them. Accepted payloads are streamed through one bounded temporary file and published only after size/completeness checks. Files, body bytes, URLs, redirect count and elapsed time have configurable bounds; unsafe paths, collisions and reserved output names fail closed. The workflow remains a read-only candidate/review/archive flow.

Default limits: 16 MiB per resource, 128 MiB cumulative response bytes, 2,048 queued URLs, 600 seconds overall, a 30-second socket ceiling and 8 redirects. The job timeout is 15 minutes. The historical checked-in mirror records 67 successful resources, 4,817,370 bytes in total, and a largest file of 1,458,113 bytes, but it names a different upstream host. These values explain conservative headroom and do not qualify the current live site.

The current configured upstream, `https://inkwave-six.vercel.app/`, returned HTTP 402 Payment Required to a bounded live probe (32 MiB total / 256 URLs / 30 seconds). The probe made one request and read zero response-body bytes. Full current-site compatibility and size therefore remain unverified; no source content was changed or published.

## Per-item implementation

### squid-heading-swim-entry-qa-seven-authored-input-trigger-gaps

Both focused PR gates now cover the current eight hashed authored sources plus shared lighting/parser and directly executed build/composition/budget inputs. A contract extracts the authored list from the current harness and checks its coverage. Existing exact-head A/B builds, source/emitted tests and evidence retention stay intact.

Changed: `.github/workflows/inkwave-squid-heading-qa.yml`, `.github/workflows/inkwave-swim-entry-qa.yml`, `scripts/tests/inkwave-workflow-inputs.test.mjs`.

### touch-frame-pacing-test-only-ci-skip-esbuild-install

Removed the unused esbuild/npm install from the test-only job. All four existing Node VM suites, Node version, exact-head guard and concurrency remain. Those unchanged suites passed locally without installing dependencies.

Changed: `.github/workflows/inkwave-touch-frame-pacing.yml`, `scripts/tests/inkwave-ci-sparse-checkout.test.mjs`.

### runtime-frame-parity-qa-direct-input-pr-path-gaps

The PR gate covers literal production reads and imported adapters from all three executed suites, source composition, HUD and motion inputs. The source-driven contract rejects missing direct input coverage and unrelated documentation still does not match.

Changed: `.github/workflows/inkwave-runtime-frame-parity.yml`, `scripts/tests/inkwave-workflow-inputs.test.mjs`.

### audio-reference-collector-sparse-checkout-omit-unread-game-tree

Non-cone sparse checkout materializes only the standard-library collector and its workflow. Actual local Git sparse-checkout controls verify these two files and no game/modeler inputs. Collector URL/provenance/output/retention behavior is unchanged.

Changed: `.github/workflows/inkwave-audio-reference-fetch.yml`, `scripts/tests/inkwave-ci-sparse-checkout.test.mjs`.

Limits: Hosted checkout transfer bytes and wall time were not measured.

### roller-source-pin-test-only-drop-unused-npm-install

Removed unused esbuild installation while retaining the exact same roller support source-pin VM suite and Node 22. The unchanged suite passed in the dependency-free local run.

Changed: `.github/workflows/inkwave-roller-support-source-pin.yml`, `scripts/tests/inkwave-ci-sparse-checkout.test.mjs`.

### paint-hotpath-parity-direct-input-pr-path-gaps

Added exact production paint, Three, source composition and companion quality-suite direct inputs; source-driven import/read coverage checks protect future additions. Both original suites remain.

Changed: `.github/workflows/inkwave-paint-hotpath.yml`, `scripts/tests/inkwave-workflow-inputs.test.mjs`.

### swim-film-qa-shared-fixture-pr-trigger-gaps

Added source-loaded Actor fixture, source fixture, fixture cache and composition inputs to the PR gate. The same three film tests retain their source/fallback, 30/60/120 Hz, offscreen and shape controls.

Changed: `.github/workflows/inkwave-swim-film.yml`, `scripts/tests/inkwave-workflow-inputs.test.mjs`.

### composed-cpu-regression-direct-dependency-pr-trigger-gaps

Added the evidenced motion-profile/bank/path, fixture, build/composition/runtime-evidence and executed source-test inputs. Existing source and emitted comparisons, component benchmark and browser trace commands are unchanged.

Changed: `.github/workflows/inkwave-composed-cpu.yml`, `scripts/tests/inkwave-workflow-inputs.test.mjs`.

Limits: Browser CPU/GC traces were not rerun for path-only changes; existing CI commands remain.

### ci-quality-gate-account-only-game-suite-waste

Exclusively valid account/** changes omit the separate game suite because the dedicated account workflow owns API/bundle/Worker validation. Empty, malformed, unavailable and mixed changes require game QA, including mixed account/documentation edits.

Changed: `scripts/inkwave-quality-scope.mjs`, `scripts/tests/inkwave-quality-account-scope.test.mjs`.

### terminal-recovery-qa-over-budget-suppresses-all-evidence

The 128 MiB gate returns the original full path under budget. On overflow it prepares a deterministic bounded package with original hashes/size/omission manifest, prioritized logs/identity/JSON/PNG and marked log tails where necessary. Upload eligibility is emitted before the helper preserves its nonzero failure status; original evidence is never deleted. Empty/nonregular evidence still yields a failed diagnostic manifest.

Changed: `.github/workflows/inkwave-terminal-recovery-qa.yml`, `scripts/package-inkwave-recovery-evidence.mjs`, `scripts/tests/inkwave-recovery-evidence.test.mjs`, `tools/native-recovery-qa/workflow.test.mjs`.

Limits: Hosted upload-artifact success and timing are CI qualifications; local tests cover exact-boundary, overflow, failure exit, copy hashes, giant log tails, empty evidence and unsupported entries.

### ink-micro-surface-qa-runtime-source-path-trigger-gaps

The gate now covers inkShading, levelMaterial, texlib, build/composition/runtime-evidence and all direct inputs of the three existing source suites. Existing browser/video source-frame verification and encoding commands remain.

Changed: `.github/workflows/inkwave-ink-micro-surface.yml`, `scripts/tests/inkwave-workflow-inputs.test.mjs`.

Limits: No new rendered video or device GPU speed measurement was performed for the trigger-only change.

### ranked-and-frame-parity-qa-checkout-omit-203mb-modeler

Both jobs use conservative non-cone sparse rules that retain every tracked tree except tools/inkwave-modeler. Actual Git fixture checks demonstrate that game/assets/patches/scripts and other tools/reports remain materialized. Build, browser and source/emitted commands are unchanged.

Changed: `.github/workflows/validate-inkwave-ranked.yml`, `.github/workflows/inkwave-runtime-frame-parity.yml`, `scripts/tests/inkwave-ci-sparse-checkout.test.mjs`.

Limits: The queued modeler-size estimate is not presented as measured network or runner savings.

### audio-source-audit-workflow-only-trigger-and-no-manual-entry

Focused audio runtime/adapter/source/tools/script/report changes now trigger the audit; workflow_dispatch uses the immutable event SHA. PR supersession is isolated from independent manual runs. Existing tracked-input ZIP content policy and five-day retention remain.

Changed: `.github/workflows/inkwave-audio-source-audit.yml`, `scripts/tests/inkwave-workflow-inputs.test.mjs`.

### upstream-mirror-enforce-same-origin-and-crawl-budgets

Extracted the mirror into a standard-library Python module. Exact-origin validation applies before redirected requests and again to final URLs. Redirect bodies are closed without the standard unbounded drain. Streaming fetches enforce configurable per-resource/total/count/deadline/redirect limits, reject path escapes/collisions and never publish partial resources. Failure manifests survive and review/package/upload steps run after failed fetches, retaining the failed job status.

Changed: `.github/workflows/fetch-inkwave.yml`, `scripts/fetch-inkwave-source.py`, `scripts/lib/inkwave_source_mirror.py`, `scripts/tests/test_inkwave_source_mirror.py`.

Limits: 10 localhost fault controls passed. Default bounds are 16 MiB/resource, 128 MiB total, 2048 URLs, 600 seconds, 30-second socket bound, 8 redirects; job timeout 15 minutes. The checked-in historical manifest is 67 files / 4,817,370 B / largest 1,458,113 B from a different origin. This is only headroom context, not the current upstream size. A current 32 MiB / 256 URL / 30-second live probe received HTTP 402 Payment Required at the seed (1 request, 0 body bytes). Full live-site size/compatibility remains unverified.

