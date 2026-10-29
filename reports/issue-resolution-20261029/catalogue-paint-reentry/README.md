# Catalogue impact paint: nested consumer ownership

The public INKWAVE catalogue producer computes paint position and stretch in
shared scratch vectors. A second impact entered synchronously while the first
`PaintSystem.splat` was still using those vectors could change the first impact's
position and direction. Both `recSplat` and the level's `queryBlocks` are actual
synchronous boundaries in that consumer. The test positions two real spawned
catalogue Shooter projectiles at controlled impact locations; it exercises the
production-composed projectile and native paint paths, not a full match.

The fix gives each active paint call its own vector lease. Eight nesting slots
are retained and reused; deeper calls use transient vectors and are not dropped.
A `finally` releases the lease even when the consumer throws. The affected
PR1907 version retains its existing `catalogPaintEllipse` computation; the
later PR1912 scalar version retains its own arithmetic order. No damage, ink
rates, source parameters, packet fields or random draws are intentionally changed.
The reference policy remains Splatoon 3 Ver. 11.3.0; no retail values are
inferred from this local ownership fix.

The source-only counterfactual removes precisely the new lease from the real
producer. At each callback boundary it changes the still-live outer position
from `[-1.1171574501027153,0,-2.2343149002054306]` to
`[17.23431490020543,0,-1.1171574501027153]` and changes the outer stretch
from `[0.44721359549995804,0,0.8944271909999161]` to
`[-0.8944271909999161,0,0.44721359549995804]`. The fixed actual native path
keeps both packets unchanged. These are controlled source regressions, not a
retail measurement or an assertion that arbitrary client callbacks are trusted.

## Raw receipts

Each gzip contains the unmodified console output, with deterministic gzip
metadata. Counts are separate, overlapping runs; do not add them together.

| Receipt | Source and scope | Result | Raw SHA-256 | Gzip SHA-256 |
| --- | --- | --- | --- | --- |
| [origin-12.tap.gz](origin-12.tap.gz) | `fc1070312f881a6d78c9dfc5f5500b85b893004f` + the subsequently committed `ef166c1bdd181fd4c665f5d8cf79787acfd30682` candidate; source, vector-body PR1907 | 12/12, no skips | `b1817c8f1d5a906e0cc9f5a7ac1802cf7422215493669b2ed3cace3e32ba1dbb` | `4ec04e3374b47be06173439c1459e44dca403276d9631df09010a706abd97d70` |
| [origin-owner-5.tap.gz](origin-owner-5.tap.gz) | `dc635702bd3fb87ee5ef6f937562b634d1e78a95`; owner source rerun of the three new paint test files | 5/5, no skips | `051ffb015ca6c126a6398ca08ab7105579fae7745294caea10c9a4babc3f6c49` | `16dae5f9e4e85578a0178e2dbb6ddd4ebc0b326d1c3a3409009620bdb6af8aab` |
| [scalar-focused-32.tap.gz](scalar-focused-32.tap.gz) | `cb2640a7a8c80f1dbe4566ab6555ede94e0a144c` with candidate runtime/test bytes subsequently committed at `52838de5b5a8a5229d2e3bf384ec15562a1ff3df`; source, later scalar-body integration | 32/32, no skips | `e11bbca42904deb022f9fdd1311f987970af5ec96891308f4480ec29f16fe4c9` | `ff0f4467946cbd1e0ad42448c2becc9d4222b81d1d15b3700f91d49803a52a56` |
| [integrated-owner-22.tap.gz](integrated-owner-22.tap.gz) | `538b578ccce0a083867a7a07196c5d5993fab54a`; owner source rerun | 22/22, no skips | `24c5e7cc3f5f90bc2904631b2d20f103c2cc1ddbd3325535ec449613fca56a95` | `432166dcb67cf46ade17218fd1367278472788ab1d6bfb6b39316d43bf04773c` |
| [pre-fix-reentry-negative.tap.gz](pre-fix-reentry-negative.tap.gz) | `cb2640a7a8c80f1dbe4566ab6555ede94e0a144c` with a temporary strict-owner test; expected failing control | 1 pass, 1 expected failure | `830415e5b5ec8b155a261ae4e4955fefd0224302efc1522f15ddb3483c39003c` | `0f16116cbd94188512fe4b4962288e4026a31fb57b27188f625ff3a085109abd` |

The origin 12 used Node 24 and:

```sh
node --experimental-vm-modules --test --test-concurrency=2 patches/splatoon3/tests/catalog-paint-reentry.test.mjs patches/splatoon3/tests/catalog-paint-reentry-source.test.mjs patches/splatoon3/tests/catalog-paint-lease-source.test.mjs patches/splatoon3/tests/catalog-paint-ellipse.test.mjs
```

The origin owner 5 used Node 22 and the first three files above, without an
explicit concurrency flag. The scalar 32 used Node 24:

```sh
node --experimental-vm-modules --test --test-concurrency=2 patches/splatoon3/tests/catalog-paint-reentry.test.mjs patches/splatoon3/tests/catalog-paint-reentry-source.test.mjs patches/splatoon3/tests/catalog-paint-ellipse.test.mjs patches/splatoon3/tests/catalog-horizontal-sector-aim.test.mjs patches/splatoon3/tests/catalog-stringer-angle-scalar-queue.test.mjs patches/local-quality/tests/queue-presentation-20261029.test.mjs
```

The owner 22 used Node 22 and the three paint test files plus
`patches/splatoon3/tests/queue-visual-batch231.test.mjs` and
`patches/splatoon3/tests/visual-audio-terminal.test.mjs`. Its command also
listed `patches/splatoon3/tests/queue-presentation-20261029.test.mjs`, which
does not exist in that tree: the file is under `patches/local-quality/tests/`.
Node did not run that argument, so this 22-result is not evidence for the
repaired `queue-presentation` fixture. The separately retained scalar 32 did
run the correct local-quality file. The current emitted-site run was pending
at this ledger snapshot; no emitted, whole-match, hardware or retail-equivalence
claim is made here.

## Subsequent integrated verification

At clean source `0d46bb41bf9f734cd40bdac7bb5dcdab99c87380`, the actual
`patches/local-quality/tests/queue-presentation-20261029.test.mjs` source
fixture passed **15/15** with Node 22, no failures or skips. This correct-path
run replaces no earlier receipt and confirms the previously omitted fixture.

A separately rebuilt scalar-body site at that same source passed the full
mandatory emitted selector: **29 files, 318/318 tests, zero failures or skips**.
The total includes nested tests and overlapping suites; it is not an added set
of 318 production claims. The emitted positive includes the real two-impact
paint reentry at both callback boundaries. The build used 1,546 inputs and
2,259 artifacts, content hash
`1dd26bc5d74a893c91ef3af433de9b04c53e2731ad74557281682d2b6efaafc1` and
input hash `5317e79c0b8bd736f0fb6192afc3a36ee27608562a6dfea10507482eb0ecbac9`.
The recorded source/test and build identities before and after were unchanged.
This is evidence for the integrated scalar build at `0d46`, not a locally
built emitted run of the earlier PR1907 vector-body branch or a claim about
subsequent commits. The gzip summary retains the exact selection and identity
receipts.

| Receipt | Raw SHA-256 | Gzip SHA-256 |
| --- | --- | --- |
| [presentation-15.tap.gz](presentation-15.tap.gz) | `3f6ba15fe5dba9c74db72c0eaf22e68854989205a5f5ec1ff8f2c3f3362c6252` | `7a6f1a6ed2ce1b949c7113e288d58163605e7dca060d653ad5144effeb1f2fea` |
| [emitted-29.tap.gz](emitted-29.tap.gz) | `ed0b1178d6ba9b4056ec5cd2edba4c00f48d6e538699e1698e0d6a38efa7cda5` | `0e75b87af5e93051501076eb1b96c751b08da5093f25cbef29bed8d9ef335dc9` |
| [emitted-summary.json.gz](emitted-summary.json.gz) | `e97f3ccde72ab9b23e9428631a46f981cef198627b1a8878d7c239984b4cc0b6` | `3dc558a0d73913cb835c42e9e2cb053878e355224986a300aaaea0b1d14b34fa` |
