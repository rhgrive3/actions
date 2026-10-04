# INKWAVE final acceptance — PR #61 / #184 / #183

Date: 2026-10-04 JST

## Scope

Final acceptance only for:

- #61 Loading / Cache / PWA Startup — `inkwave/astra-loading-cache`
- #184 Runtime Performance / UI — `inkwave/runtime-performance-ui`
- #183 Practice Range — `inkwave/practice-range`

No merge to `main` is performed by this workstream.

## Final source set

- latest main used for final sync: `17602ab094da6efb663d872934458e818ae3c93e`
- #61 head: `e8ebe3c5a55d4920611965b4867467268fcd7316`
- #184 head: `a9fdd738499fc1525f6c505e524e5bd60d004f1c`
- #183 head: `04e8ee973470ce68126d503f6916229775565cd1`
- combined branch: `inkwave/integration-final-61-184-183`
- combined head: `88639ff73ff58228a198e7ce5eae913039bb377a`
- combined validation PR: #339 (Draft, **do not merge**)

The combined head is ahead of and not behind latest main, and records all three final workstream heads as merge parents.

## Root causes fixed during final acceptance

### #61 Loading / Cache / PWA Startup

The prior branch had deterministic cache/model checks but did not gate acceptance on native browser startup timing and Cache Storage behavior. A Chromium acceptance harness was added for:

- 3 cold starts
- 3 HTTP-warm starts
- 3 service-worker-warm starts
- controlled offline restart
- persistent-profile browser restart
- Cache Storage entry/body size snapshots
- `navigator.storage.estimate()`
- menu-interactive / engine-ready / bootstrap timing marks

The initial offline assertion incorrectly required zero server connection attempts. A service worker using network-first navigation may attempt the network before falling back. The harness now forcibly drops the server connection during the offline case and requires that no HTTP response body is consumed while the cached snapshot still boots.

### #184 Runtime Performance / UI

The high-quality fixed-step runtime comparison passed with exact gameplay snapshots and unchanged renderer bytes. The remaining UI failure was a closed browser/context during the responsive suite rather than a gameplay/performance comparator failure. The latest-main CI architecture now runs independent browser shards in parallel, removing validate-job serialization and reducing shared browser lifetime.

Acceptance keeps:

- three repeated title/settings/battle windows
- hidden battle menu tick/cursor reduction
- exact gameplay snapshot parity
- renderer-byte identity
- owner-count parity
- keyboard/pad/touch synchronous target tests
- menu visibility/disposal lifetime tests

### #183 Practice Range

The Chromium desktop range check had a harness bug: after the range became ready it called `locator('#boot-error').textContent()`, which waits for a locator that normally does not exist. Phone Chromium and WebKit tablet already passed. The check now reads the optional element directly without waiting.

Isolation was also strengthened to prove that the Practice Range patch is a byte-exact pass-through for:

- `src/net/mock.js`
- `src/net/netmatch.js`
- `src/net/session.js`
- `src/net/transport.js`
- `src/game/weapons.js`
- `src/game/actor.js`
- `src/config.js`

Therefore the range layer does not patch network replication or weapon tuning.

## Combined integration resolution

Shared build/validation files were resolved so all three layers coexist:

1. normal INKWAVE patches / reliability / quality
2. Practice Range build-time layer
3. Loading/Cache revisioning and service-worker finalization
4. runtime/UI acceptance and exact-source attestation

Every source-attesting browser verifier recognizes both `loading-cache/` and `practice-range/` namespaces.

Latest main CI changes were preserved:

- browser families build and run as three parallel shards
- stale runs are cancelled by concurrency grouping
- OpenTTD/Hex CXX diagnostics are path-scoped and no longer run on INKWAVE-only PRs

## Automated acceptance

The final workflow requires:

- gameplay patch regressions
- local-quality focused tests
- Practice Range measurement/rules/isolation tests
- Loading/Cache worker/adapter/harness tests
- motion/integration/runtime-evidence unit gates
- exact pinned numerical source verification
- syntax/reference checks
- exact build identity
- Chromium active-game regression
- motion + motion-detail
- Flow/GTAO + wall/GTAO
- motion catalog
- Chromium/WebKit touch layout and lifecycle reliability
- exact-source forged-identity negatives
- Practice Range Chromium desktop/phone + WebKit tablet
- responsive UI
- cold/warm/SW/offline/restart startup measurement
- high-quality runtime baseline/candidate comparison

At the time this report entry was written, the latest synchronized heads had entered the final GitHub Actions queue. Do not convert queued work into a passing claim; update this section only from the final source-bound receipts.

## Device-only acceptance remaining

CI browser results are not a substitute for a physical installed PWA or hardware GPU.

### iOS / Android installed PWA startup

Minimum acceptance:

1. install/open the current build as a home-screen app
2. fully close it
3. record first launch to usable main menu
4. close/reopen twice and record warm launch
5. enable airplane mode after one completed online launch and confirm cached startup reaches the menu
6. restore network, deploy a newer revision, open once, then close all old app windows and confirm the new revision activates without an automatic mid-session reload

Record device/OS/browser engine and observed launch times. Do not label this verified until run on hardware.

### Runtime/UI hardware sanity

On one representative mobile device:

1. idle on title/settings for 30 s and confirm no visible cursor/menu regression
2. play a normal battle for 60 s and confirm movement/weapon behavior is unchanged
3. hide/background and resume once; confirm UI ownership resumes without duplicate animation
4. enter/leave Practice Range and start a normal Turf War; confirm no range HUD/targets/session remain

These are final hardware acceptance checks only; no production tuning should be changed from subjective frame-rate impressions without measurements.
