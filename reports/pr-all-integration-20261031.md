# INKWAVE open-PR integration — 2026-10-31

## Scope and ancestry

The integration combines the open work in `rhgrive3/actions` without discarding the reviewed changes or their history. PR #401 remains excluded. The base inspected for final assembly is `0582bb1ee6ac03dfb54e292ea839d18463e33fcc`.

| PR | Scope | Integration decision |
| --- | --- | --- |
| #1972 | Native benchmark evidence | Preserve the complete evidence and its statement that whole-game improvement is unconfirmed. |
| #1973 | Coverage-prefix scoring | Keep the verified prefix implementation and its exact accumulation order. |
| #1974 | Boss rain roof cover and media admission | Preserve conservative solid-roof tests and strict browser request classification. |
| #1975 | Queue fixes, native contact authorization, rendering and CI | Integrate the latest `aef10fe892e59748e698f9b75e89934a4b24c3f7` head with the other PRs and the repairs below. |
| #1976 | Avoid unused native-contact hypot | Preserve the narrow arithmetic change and contact parity tests. |
| #1977 | Rendering, painting and preparation optimizations | Already on main; retain direct attribute paths, single-tile face runs, coalescing, and presentation bounds. |
| #1978 | Browser policy, CSP and optional Turnstile | Preserve policy while repairing emitted HTML and validating the actual production output. |
| #1980 | Reviewed source recovery | Already on main; retain finite audio controls, first-entry contacts and current shared flight/forecast behavior. |
| #1982 | Rain-hit scratch retirement | Preserve actor-reference retirement and test it with the actual native helper dependencies. |

The final integration is assembled with the current main and the remaining PR heads as parents. This records that the constituent branches are integrated; it does not replace them with an unrelated snapshot or force-update a branch.

## Cross-PR repairs

### Scoring and rendering

The sparse-dirty scoring variant could miss an unannounced public-grid write followed by a normal writer. The retained prefix implementation validates earlier cells and preserves the baseline binary64 addition order. Queue writers no longer call the incompatible sparse API. The production writer, reentrant callback, arbitrary face ordering, bit boundaries and silent earlier edits are covered by the prefix/queue tests.

Native ink construction retains the queue's bounded construction work and main's direct attributes, numeric tile grouping and single-tile face optimization. The source conversion API retains its original non-packed shape. The queue adapter recognizes the exact reviewed ripple derivative form, while direct-owned outfit source is no longer rewritten a second time by the production queue adapter.

### Flight, poses and native authorization

The native foot-pose wrapper now forwards `dt`; the omitted argument could create NaN poses on landing and contaminate Rainmaker hand origins. Sensor and Cooler use the shared live/forecast kernels, with the authenticated replay, owner-life, sequence and resource checks preserved. Sensor collision uses first capsule entry and retains the conservative Y broadphase. Preview tests distinguish first contact from the eventual landing/explosion marker, including its visual offset.

Rainmaker releases use the ranked host event path, outside ordinary main/sub/special births. A private, host-admitted release is now associated with receiver-computed native device contacts. Claims cannot create their own release or contact. Host identity, match/session, actor identity and life, receiver geometry, shot identity, expiry, target identity and one-use consumption remain checked. Positive contact-first/claim-first paths and forged, replayed, expired and blocked paths are exercised.

The small proof-list retention path now copies the array before admission scans. Returning the owned array allowed a synchronous geometry callback to append a proof into an outer scan. The regression retains the counterexample and verifies rejection; the native persistent-proof capacity is unchanged.

Booyah device proofs now follow the native terminal point and clock. A terrain burst has the source's one-tick delay; body/Boss contact keeps the current tick. Endpoint interpolation retains both endpoints, and an airborne burst is not projected onto the ground. The final source frame and all 28 body contacts are preserved while early and expired claims remain rejected.

Storm device-hit admission uses the already accepted replay life instead of a lagging presentation life. The native peer test admits all 99 new-life contacts, including ticks 91–93 during display lag. The three queued old-life claims at ticks 88–90 still expire at the life boundary. Their exact sets are retained in `pr-all-integration-20261031/storm-native-epoch.json`; this is an explicit authentication boundary, not a claim about Nintendo's network behavior.

`debug.freeze()` synchronously retires simulation debt and the S3 fixed clock. Explicit manual steps therefore do not inherit hundreds of stale catch-up ticks. This change concerns audit stepping, not a new gameplay timing value.

### Production security output

The shortcut script is inserted before the browser guard, and embedded HTML strings escape `<`. This prevents an internal `</body>` string from becoming an insertion point inside JavaScript. CSP hashes are derived from the final scripts. The build places the immutable base URL after the leading UTF-8 declaration, keeping the declaration inside the encoding prescan and the base ahead of the import map.

The actual emitted site was served with manifest-checked bytes and tested in Chromium 151. Startup reached the main menu with no page errors, console errors, CSP violations or failed requests. Explicit negative probes rejected eval, Function construction, unregistered inline script and an untrusted-origin script; WebAssembly and a blob Worker remained functional. The production browser guard rejected the tested Firefox user agent. Standard Playwright 1.62.1 `waitForFunction` worked without weakening CSP.

## Regression maintenance

Tests that evaluate extracted source now supply the real native-work, minimap, UI transform and simulation-debt helpers. Native replay positives use real producers, serialization and receiver ticks instead of calling `_play` directly with a JSON row. Metadata-only tests retain explicit capability boundaries and the real private receipt/retention logic; new native capabilities cannot silently enter those test realms.

Historical fixtures and source pins remain unchanged. A sealed descriptor reverses the exact later render-owner changes before comparing historical epochs. Missing, duplicated and edited owner hunks are rejected. Intermediate paint optimization comparisons use the same frozen owner epoch, and final production coverage/coalescing is checked separately.

The Clam historical overlay retains the complete original module bytes and baseline pin. Two later forecast exports are appended from a separately pinned owner, with exact donor/bridge identity and negative tests for changed or duplicated exports. Node and browser comparison runners use the same helper and record original versus served hashes separately. The shallow CI fetch set includes that immutable donor.

The single-round contact suite retains all 85 cases and assertions. Six independent family files bound the lifetime of full VM module graphs instead of increasing the heap limit or skipping cases. Explicit CI source inventories include every family file.

## Evidence and limits

The production build, deterministic startup budget, source migration audit and 11.3.0 upstream compatibility check pass. The initial broad sweeps exposed failures; they were not all-green runs. Each failure group was repaired and checked with focused reruns. Counts from overlapping focused tests are not summed into a new full-suite total.

| Verification | Result |
| --- | --- |
| Initial quality sweep | 2,560 tests: 2,521 passed, 29 failed, 10 skipped; all failure groups subsequently repaired. |
| Initial network sweep | 1,252 tests: 1,243 passed, 9 failed; all failure groups subsequently repaired. |
| Quality repair batch | 110/110 passed; later GPU 11/11, scenery 1/1 and sender-life fixture 7/7 passed. |
| Network repair batch | 56/56 passed; final Booyah follow-up 16/16, Storm 11/11 and six native-round family files 85/85 passed. |
| Shared throw/trajectory kernels | 163/163 passed, no skipped tests. |
| Direct source / prefix scoring / latest-main fixtures | 21/21, 16/16 and 24/24 passed respectively. |
| Clam historical overlay | 8/8 passed; strengthened donor identity test passed separately. |
| Actual production browser output | Main menu reached; 641 artifact requests verified; no startup page, console, CSP or request failures. Negative CSP probes blocked as expected. |

The build content hash is `8d17ed64b1b4fcb635467a33a12599751c872f267f079bdc615d7699e490b45b`. Machine-readable receipts are in `pr-all-integration-20261031/local-verification.json`, `production-csp.json`, `storm-native-epoch.json` and `clam-overlay-verification.json` in that directory. GitHub checks on the eventual integration head remain the final remote evidence. The native-RAF gameplay and browser screenshot comparisons are not claimed to have passed from these source or startup results.

The comparison reference remains Splatoon 3 version 11.3.0 with the existing weapon, gear, state and input conditions in `inkwave-splatoon3-behavior-2026-10-02.md`. This integration does not infer undocumented Nintendo frame values or claim a new match to original hardware. Local Chromium uses software WebGL; its startup/security results are not iPad, Nintendo hardware, or whole-native-match performance measurements. The local build lacked prebuilt native-stage LFS payloads and selected the existing browser-conversion fallback. Whole-game benchmark claims retain their original uncertainty.
