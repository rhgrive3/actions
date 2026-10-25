# Additional network queue optimizations — 2026-10-25

Base: PR #1870, `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da`. The current 513-row queue inventory yielded 39 network/relay/codec rows owned by this workstream. The [per-row ledger](queue-extra-network-20261025.json) records seven additional implementations, 25 mechanisms already covered by the target PR, six declined proposals, and one workflow item integrated by the parent workstream. No raw upstream module, protocol version, wire schema, event clock, authority condition or hosted workflow was changed by this workstream.

## Accepted changes

- `kit-paint-admission.mjs`: ordinary untagged paint already within the finite Float32 base cap avoids scanning the catalog roster. Larger/nonfinite caps retain the original catalog calculation; tagged paint retains its complete receipt verification. No authority cache is introduced.
- `snapshot-guard.mjs`: the bounded velocity check uses squared norm away from the limit and the original `Math.hypot` within a conservative `.002` squared-unit neighborhood. Stage-bound validation snapshots all four properties before checking them, eliminating the temporary array while preserving eager getter order and subsequent original bound reads. Both independent birth gates remain.
- The existing final source adapter reverses only the interval search inside `_pathAt` for strictly increasing accepted actor history. Oldest/latest endpoints, teleport mode, Hermite arithmetic and ballistic extrapolation remain unchanged. Raw upstream stays pinned.
- `torpedo-contact-commit.mjs`: the private registry sweep iterates its Set directly and skips filtering empty contact arrays. Current-record retirement and enrollment after the sweep are preserved; nonempty deadlines are unchanged.
- `torpedo-launch-set.mjs`: inverse bisection stops once its midpoint equals an endpoint. The original 64-step cap and classification boundaries remain.
- `server/src/index.js`: attachment comparison first checks the three budget scalars. Complete key/value equality remains for potentially unchanged snapshots, including quota refills that happen to restore the same values. Serialization, exception handling and hibernation fields remain intact.

## Local verification

The final three new test files pass **7/7, failure/skip 0**:

```sh
node --experimental-vm-modules --experimental-global-webcrypto --test --test-concurrency=2 \
  patches/network-replication/tests/queue-extra-network.test.mjs \
  patches/network-replication/tests/queue-extra-codec-caution.test.mjs \
  server/tests/queue-extra-attachment.test.mjs
```

These checks execute current modules and the full source composition: 500,000 bomb comparisons, finite/property-read boundaries, Float32 radius and live owner changes, complete sampled output at 30/60/120 Hz over 1–40 history entries, 30,000 actual Torpedo classifications, registry sizes 0/1/2/159/160/161 and contact deadlines, and 20,000 relay attachment transitions including failed writes, host changes and unchanged synchronization. Received history objects and interpolation arithmetic are shared with the original comparison, not replaced by a model.

A separate refreshed run passes **18/18** including the complete `issue-1321-bomb-authority-budget.test.mjs`, source-loaded numeric/interpolation tests, codec counterexample and attachment tests. The broader 18-file network/relay/paint/Torpedo run had 144/148 successes while four native-producer cases loaded an earlier concurrent motion-adapter anchor; all four are included in the refreshed clean full-file run. Existing kit paint, canonical ordering, Tower Mine proof recovery, paint authority, real limited Torpedo contact/gear/deadlines, relay START, quota and hibernation checks passed in that broader run. Overlapping counts are not added together.

`git diff --check` passes. These are local Node/VM and actual source-composition checks. They do not establish iPad/Safari/Cloudflare deployed performance, device FPS, GPU power, live eight-player traffic or retail Splatoon 3 parity. Existing gameplay tuning and unverified retail differences remain unchanged.

## Declined rows retain explicit evidence

- Bounded combat-proof tail reuse already has an executable synchronous geometry-reentry counterexample in `added-combat-scans.test.mjs`: a previously rejected hit becomes accepted. The copying ownership boundary remains.
- A new executable nested-row `toJSON` case proves that a single paint does not universally make a dictionary attempt redundant: the current encoder can select compressed output. Returning raw unconditionally changes existing wire behavior. A proven restricted producer boundary would be required.
- The ASCII UTF-8 proposal reports Unicode regressions and requires real Workers traffic evidence, which is unavailable here; the current exact byte counter remains.
- A semantics-preserving metadata tail candidate passed 100,000 dense/sparse/accessor comparisons but was slower in eight alternating source-loaded VM rounds of 300,000 calls: baseline median **404.65 ms**, candidate **529.02 ms**. A similarly conservative zero-stretch candidate measured **35.41 ms** versus **172.21 ms**. Both candidates were removed. These contention-sensitive measurements explain rejection and are not shipped speedup claims.
- The existing same-call paint-order reuse proposal remains declined because synchronous callbacks can revoke membership before its required second authority check.

No Actions jobs were dispatched or rerun by this workstream.
