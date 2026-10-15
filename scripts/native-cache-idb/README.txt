PREPARATION ONLY. No hosted or local browser execution has occurred.
Use existing permitted hosted Chromium installation and a new diagnostic runner.
Inputs: frozen exact main01aa source-cache.mjs and independently reviewed candidate.
Set IDB_BASELINE_SHA256 and IDB_CANDIDATE_SHA256 to independently verified values.
Run node --test receipt-gate.test.mjs before acceptance.
Then timeout --signal=TERM --kill-after=10s 120s node acceptance.mjs BASELINE CANDIDATE result.json
Use the established PID-starttime supervisor where required by the hosted wrapper.
The harness serves only two modules on ephemeral loopback; unknown external origins blocked.
Every scenario uses an independent nonpersistent context, no user profile or source assets.
Synthetic records: ten 256KiB arrays per record (2.5MiB), bounded two-record initial store.
Data bytes count JS-visible IDB request result payload, not browser process memory.
Migration reads are measured separately from steady-state writes; browser internal copies remain unknown.
12 scenarios: fresh, empty-v1, third eviction, same-key, equal-time, migration-read,
abort, abort-retry, concurrent, blocked-upgrade plus old-client fallback, invalid legacy time, metadata key mismatch.
Only compact JSON is an intended artifact; no site, database, trace, video, models or screenshots.
Exact candidate/head/blob must be bound by the hosted wrapper; neither CLI hashes nor this preparation prove deployment.

WebKit extension: same frozen source pair, all scenarios and gates unchanged. Hosted Playwright WebKit is not an iPad/Safari device qualification. Chromium run38719384104 is preserved separately. Dedicated upgrade-transaction abort injection remains outside this case inventory.
