# Network placement observation, not a gameplay correction

This second observation has direct parent 3ab1039f9d631de19f50e040fd5f8e953cb45cb6 and changes five QA-only paths. That parent directly descends from PR1765 head 8db288ece48c882f42eb0d3540218af58d6af6e4. No runtime, model, timeout, placement validator, damage, packet acceptance, step budget, or proof threshold changes. PR1765 and Kraken remain fixed.

## Verified first observation

Run 39683276479 checked literal 3ab, passed 15 Node tests, verified all original build inputs/artifacts, and reproduced the placement failure before firing. Artifact 12384314207 has ZIP SHA256 2b1e57a39e06a07bd0e54071dcd82a9326bcaa7ac8996667dffa48eefabecb8e.

Each peer supplied 39 rows without truncation. Both proxies were assigned life2/neutral positions but retained ready=true and cur.life1 at their spawn positions after the QA cleared their buffers. Native net.update retained that sample, then applyRemote restored the old life and spawn position at step0. The host proxy accepted a new life2 sample at step1. The guest proxy retained its old sample and empty buffer through all 12 steps, failing the unchanged spawn-barrier validation.

Relay input records contain host life2 broadcasts, but this is not proof of guest delivery. Guest peer.lastTs remained 127.645 while host broadcasts reached 182.351. _tick updates lastTs before actor-specific validation, so later actor gates alone do not explain the missing update. Receiver dispatch and lastReceiveAt were not captured. The timestamp jump alone does not prove a clock-guard rejection.

The original failed 8db artifact 12383578893 (SHA256 1aacc65dcab15375269d62ea725b45b0679589bf13ed45c0e985b14f647da501) and old successful ffdb artifact 12375648983 (SHA256 989b068ea95111f89607f20c5ec7536bc71a9c8f1b5952fe7bf0d9f949030125) have identical input/content/harness hashes and selected neutral points. Their packet timing is not known to be equal.

## Narrow second observation

Optional --observe-placement retains the original maximum 48 state rows and two actors per peer, adding lastReceiveAt. During the placement phase it also observes relay forwarding and Playwright WebSocket frame receipt, bounded to 128 combined sanitized rows. Relay connection order and browser page index are distinct labels; matching packet metadata, not index alone, must establish a path. Raw payloads and owner identifiers are not copied into the new metadata.

Native onMessage and _tick wrappers record at most 96 before/after metadata rows per peer. Each wrapper calls its original once with the original this and arguments, preserving return values and thrown objects. Observation failures are counted without suppressing native behavior. No cur, ready, position, sample, life, peer clock, admission decision, or transport result is written. Original methods are restored during cleanup. Existing sanitized stdout and failure exit remain unchanged.

Observation overhead can change scheduling. Neither diagnostic success nor a locally proposed owner-only preparation barrier is a gameplay fix or final-head acceptance. Future setup should place actual owners and wait for their real snapshots to converge; it must not manufacture proxy acceptance. The missing receive/admission boundary remains unresolved until the second native receipt is inspected.

## Preserved build reuse

Both observations reuse original ffdb build artifact 12379998715 from run 39658991486, ZIP SHA256 f7bc158f7ab8480dc1a5bf767a777258626c202228cf975fcbdebc99064f0f9e. Its original ffdb marker is retained. verifyRuntimeBuild checks every compiled artifact and original input byte against the diagnostic Git tree before browser execution. The pinned inputHash is 68591cc3b710e3c83e5f8e92d9be6a673c95da4394f19ac4b53457eb826a31f3 and contentHash is 2ceba653d36b11a399938667bc5901847284737a687b6b9c1b81de9e725ebf92. No rebuild or manifest relabeling is performed.

## Local validation

Seven observer Node tests pass: read-only state, bounded/nonfinite rows, invalid labels, original receiver/arguments/return/exception preservation, continued native calls after truncation, atomic missing-method rejection, observer-error isolation, and sanitized socket metadata. Driver syntax passes. The inherited real production-composed stale-sample counterexample retains its explicit Visual/physics stubs; it is not a socket test. Second native observation is not yet executed.
