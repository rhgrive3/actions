# INKWAVE PR integration, 2026-10-22

Integration PR: #1843. Base main: `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`.

Includes #1802, #1815, #1817, #1820, #1821, #1824, #1826, #1827,
#1828, #1829, #1830, #1831, #1832, #1833, #1834, #1835, #1836,
#1837, #1838, #1839, #1840, #1841 and #1842. Each original head is a
commit ancestor; #1842 follow-on `a91137d452169baba8c2e9b0e4c7ea4f59f16a65`
is included as well. Preserve histories and frozen historical evidence.

## Integration repairs

- Keep the additive QA guards, eight regression shards and required Validate
  fan-in while sharing one source-bound production artifact. Diagnostic jobs
  retain separate admission, unchanged immutable identity checks and native
  assertions. Their full sparse checkout retains every declared input.
- Update workflow tests for the composed configuration: conditional diagnostic
  concurrency, startup-clock receipt, and always-uploaded shard manifests.
  Reconcile reviewed full-job hashes after inspecting the combined job changes;
  no assertion, shard, threshold or required job is removed.
- Connect the current Session's fixed nonce origin to the authenticated legacy
  relay-clock fallback. Encoder allocation happens on the first online queued
  packet, so importing offline weapon code does not require TextEncoder.
  Real Web Crypto is supplied in isolated source/control VMs, never replaced by
  a predictable nonce. Canonical kit transport tests bind the receiver before
  sending ticks, retaining foreign-owner and replay rejection.
- Retain audio prewarm ownership and the first recorded Charger phrase. The
  idle optimization must still retire a remote recorded voice and its onset
  edge on release/weapon change. Old repeating charge handles are stopped;
  fully idle actors retain zero proximity probes and voice calls.
- Keep the compact installed audio manifest. Emitted tests verify its source
  digest and every ordered runtime declaration independently of source-only
  audit metadata. Repair native navigation rollback mocks and cold-versus-warm
  actor-owned rain scratch comparisons without changing recovery arithmetic.
- Complete the previously orphaned Blob-worker binding test implementation.
  Native Blob bytes, actual Worker observation and both direct call stacks
  bind to the loaded manifest-pinned music source. Acorn derives the exact
  URL.createObjectURL/new Worker nodes and their dataflow inside _startTimer;
  offline receipts recheck those source bytes and locations. The browser QA
  observer preserves native Blob/Worker construction and rejects unknown
  executable workers. The guard is now in validate_core. Legacy historical
  Blob evidence remains independently validated through its original mode.

## Completed local checks (separate scopes)

- Standard npm test: 91 Node cases and 4 Python cases, no skips; A+ benchmark.
- Production build and startup budget; final runtime emitted-audio suite: 5/5.
- Combat provenance: 44/44. Recovery/native publication rollback: 5/5.
- Owner clock/startup/session/relay cases passed in the initial focused run.
- Recorded Charger/native audio tests: 18/18 after fixture reconciliation.
- Host STARTING handoff: 7/7. Updated canonical 65-kit JSON/replay case: 1/1.
- Combined audio/combat fixes: 67/67; clock follow-on/source admission: 63/63.
- Updated workflow and both Blob modes: 49 passed, 1 native-browser skip.
- Portable changed script/route guards: 334 passed, 5 opt-in/environment skips.
- Trizooka/owner-clock regression after the hosted TextEncoder failure: 52/52.
- Heap-constrained action and hidden-host retries passed 18/18 and 12/12;
  respawn/outbound retries passed 91/91 with a 1536 MiB heap.

These counts are not a sum of unique tests or a completed final-head CI run.
An exploratory 768 MiB full patch run was stopped after 1,869 passing cases,
with old fixture failures subsequently repaired and eight heap-exhausted files.
The 1536 MiB all-specials retry still exhausted its heap; that is not a pass.
The complete eight hosted shards remain required.

The local PID namespace and procfs disagree (`getpid=5`, `/proc/self=22385`).
Process-supervision guards that depend on a matching procfs were interrupted,
not accepted. Local Chromium download yielded invalid archives. Hosted Linux
supervision and actual final-head native/browser results remain necessary.

## Acceptance boundary

Reference remains Splatoon 3 Ver.11.3.0. This integration does not establish
Nintendo retail parity, physical iPad/Safari performance, or acceptance of the
frozen native diagnostic/video work. Preserve those PRs' original limitations.
Merge main only after all applicable checks on the actual latest integration
head succeed; a previous head, queued job or skipped scoped capture is not proof.
