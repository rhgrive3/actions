# Bounded Turf finish verification

Requires Node22 and a complete repository checkout. The runner uses POSIX process groups; Windows is explicitly unsupported. Run from the repository root:

```sh
node --test --test-concurrency=1 scripts/tests/run-inkwave-turf-finish-isolated.test.mjs scripts/tests/run-inkwave-turf-finish-supervision.test.mjs
node scripts/run-inkwave-turf-finish-isolated.mjs . source /tmp/turf-source-results
node scripts/run-inkwave-turf-finish-isolated.mjs . both /tmp/turf-both-results /absolute/path/to/production-site
```

The nine primary guards use Linux `/proc` for live-descendant checks and fail explicitly on other systems. The two independent supervision guards check group ownership, output overflow and spawn failure. Fixtures are created at runtime in the OS temporary directory; no external fixture or private workspace path is needed.

Modes are `source`, `emitted`, and `both`. Emitted modes require a complete production site containing `inkwave-build.json` and every declared artifact. Place receipts outside the checkout's `scripts`, `patches`, and `inkwave-public` directories, and outside the production site. Append `--list` to inspect admitted cases without launching them.

The runner executes all14 reviewed top-level cases, one child per case, without editing the original test bodies. Both mode executes28 cases. Each child retains a384MiB heap ceiling, a120-second work budget and a4MiB output cap. A further2-second drain bounds termination waiting. Any child error, signal, timeout, missing/extra test result, failure or skip prevents success. Aggregate identities and per-case results are written to `isolated-receipt.json`, with one TAP log per case.

Inherited `INKWAVE_*`, Node test-context, `NODE_OPTIONS`, and `NODE_PATH` selectors are removed. Only explicitly declared emitted-site selectors are added. All declared emitted artifact bytes, exact inventory and manifest identity, together with the source closure under `scripts`, `patches`, and `inkwave-public`, are verified before/between/after children. Source closure is bound to the supplied checkout, not independently authenticated as a Git revision; verify the intended checkout separately. The exact reviewed Turf test SHA256 and14-case pin fail closed on any test-file change. Review all registrations and update that pin before accepting a changed suite; do not bypass it.

Each child owns a separate process group. Deadline, leader exit and handled parent termination clean that group with SIGKILL, including ordinary Node test descendants. This is not a security sandbox for children deliberately escaping their group, and cannot intercept SIGKILL of the supervisor. It makes no native/browser/GPU claim. Process-isolated full coverage does not mean the original monolithic suite's heap failure has been fixed.
