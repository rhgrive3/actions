# Network queue follow-up

Base: `7c94a8b`. This review uses the public source and complete production composition. It does not establish performance on an iPad, retail Splatoon 3 parity, or a deployed relay result.

| Ticket | Disposition | Evidence and behavior |
| --- | --- | --- |
| `network-projectile-cosmetics-fixed-bound-tuples` | Implemented | Five fixed scalar checks replace transient range tuples, preserving field order, getter visits, exact bounds, and all three admission layers. The frozen-table candidate was slower in Node 22 trials and was discarded; scalar timings remained close to the original. No device improvement is claimed. |
| `placed-sub-attachment-per-tick-validation-arrays` | Implemented | Capture vector coordinates before finite checks, preserving read order. Reuse fixed frame keys, an attachment-owned heading vector, and the suction frame record. Recursive heading callbacks use a private temporary. Normal transforms and moving Tower placement remain live each tick. |
| `host-migration-lobby-race-missing-new-host-player` | Implemented | Reconcile authenticated relay membership before the promoted host's first lobby snapshot. Restore missing self from a validated local profile and missing peers from safe unready defaults. Preserve existing valid equipment, reject stale/duplicate rows, and retain team confirmation/Ready reset. Transport, room-attempt, and lobby guards prevent callbacks from touching replacement rooms. Starting/playing matches never reconstruct lobby members. |
| `network-ghost-quota-under-128-constant-time-admission` | Already effective | Native tracked projectiles already use the terminal live ghost index before the legacy scan. Custom stores retain the exact scan: custom iterators and getters that expand the list invalidate a raw length shortcut. Actor/peer/global limits remain 128/256/640. |
| `network-combat-pose-double-slice` | Not adopted | Actual `record` owner-lookup callback mutates the row to `[10,0,0]`; the original retains those fresh coordinates, while the single-slice candidate stores stale `[0,0,0]`. Keep the existing slice/species and callback contract. |
| `gyro-world-projection-unit-gravity-normalization` | Not adopted | Removing normalization changes exact accumulated camera state in 11,044 of 20,000 composed-method samples; maximum pitch delta was about `2.14e-15`. Keep the current projection and singular-pose fallback without device evidence supporting a change. |
| `gyro-calibration-share-rotationrate-magnitude` | Not adopted | Permuting `Math.hypot` arguments changes accumulated calibration scalars in 1,233 of 20,000 samples. Preserve the current thresholds, history, and source adoption arithmetic. |

Focused verification: 77 network/attachment/lifecycle tests and 23 existing gyro tests passed. A normal minified build passed; 40 emitted-module tests covered host migration, compatibility, ghost quotas/lifecycle and moving attached subs. Quick patch and source migration checks passed. The scalar validator has additional boundary/getter tests; all 14 original snapshot/ownership admission checks passed.

The attachment tests verify 120 dynamic transforms with one heading clone after initialization, no shared position/output identity, finite-value read order, and recursive calls. Existing source/ghost Sprinkler, Mine, Beakon and suction tests retain Tower support, detached drop positions, paint authority, contact orientation and old-support rejection. These are host implementation regressions; the Nintendo 4.0.0 Tower-side/bottom Sprinkler reference remains the existing documented comparison, without new retail timing constants.

Private intake identifiers and attachment bodies are omitted. Local experiment artifacts are retained separately from this public report.
