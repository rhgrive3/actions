# Service Worker registration retry

Base: `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`. Runtime owner:
`patches/loading-cache/runtime/startup.mjs`. Node: 24.19.0.

After the engine reaches the menu, the first `serviceWorker.register()` attempt
can reject during a temporary network failure. Previously `registered` was
already true, so later menu returns could not try again; an `online` event only
updated the badge. The document had to be reloaded before registration could
recover.

The registration now remains pending while the browser resolves the request and
is marked registered only after success. A later online event or menu return can
schedule another attempt. There is no retry timer or rejection-driven loop,
registration still waits for the menu, and a successful registration remains a
single registration for that document. Cache policies, update activation and
gameplay code are unchanged. Splatoon 3 has no browser Service Worker counterpart;
this fixes browser lifecycle handling rather than claiming retail game parity.

Open and closed GitHub issues were searched for `service worker`,
`serviceWorker.register`, `registration`, and `offline cache`; no issue describes
this registration latch. Existing warm-start timing #1711 and public-URL boot
timeout #1608 are distinct and are not claimed fixed. Current open PR changed
paths were excluded from this change.

## Verification

- The initial five-case runtime VM regression failed three cases before the fix
  (online retry, menu retry, and gameplay-to-menu retry), then passed all five.
- The final six-case regression also covers synchronous rejection and the timer
  fallback used without `requestIdleCallback`. It verifies pending/successful
  deduplication, no automatic retry, and leaving the menu before scheduled work.
- Selected loading-cache tests: 63 passed, 5 skipped, 0 failed:

  ```sh
  node --test patches/loading-cache/tests/startup-registration.test.mjs patches/loading-cache/tests/worker.test.mjs patches/loading-cache/tests/recovery.test.mjs patches/loading-cache/tests/adapter.test.mjs patches/loading-cache/tests/offline-diagnostic.test.mjs patches/loading-cache/tests/worker-descriptor-compatibility.test.mjs patches/loading-cache/tests/cargo-offline-precache.test.mjs
  node --check patches/loading-cache/runtime/startup.mjs
  git diff --check
  ```

- `node --test patches/loading-cache/tests/*.test.mjs` also ran on the unchanged
  base: 57 passed, 5 skipped, 4 failed. The same four failures occur with the
  candidate (initial five-case revision: 62 passed, 5 skipped, 4 failed). They all
  fail in the unchanged `worker-template-compaction.test.mjs` setup, which demands
  a real `/mnt/workspace/` ancestor while this environment uses `/workspace/`:
  `worker compaction occurs before configuration insertion and retains the complete JSON contract`,
  `lost or duplicated compaction markers fail closed`,
  `template compaction never bypasses the raised worker size ceiling`, and
  `production precache indices preserve the ordered integrity map and reject missing paths`.
  No path guard was bypassed or changed. The five skips require a separate
  historical baseline site.

The VM runs the actual startup runtime with a stubbed bootstrap and browser APIs.
It establishes registration scheduling logic, not a native browser install,
offline readiness, GPU behavior, or physical iPad performance. Production build
and emitted-module checks are handled by the parent integration work.
