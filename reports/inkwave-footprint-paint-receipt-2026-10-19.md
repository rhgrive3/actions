# Footprint tests: retain the paint authority receipt

Base: `b75bc56e2e3fa970357b3bc92f63395c7c397353` (2026-10-19).

The canonical-kind and Charger seed tests used recording-only `recSplat`
stubs. After paint authority was enforced, their undefined return rejected
local paint: the first case recorded ten attempts but painted no cells, and
the first Charger seed claimed zero area. The original failures reproduce on
main00b and mainb75 and match the official patch0 logs.

Use a real local actor owner, bound NetMatch roster and native `recSplat`.
The observation wrapper returns its actual admitted receipt. Stamps identify
the producer, and the tests additionally check the outgoing canonical kind.
All original width/depth/impact/spacing, seed, grid, radius and credit assertions
are retained. Runtime, profile, codec and authority gates are unchanged.

Both tests now dispose in `finally`; cleanup also restores the observer and
actor trigger and removes fixture-only roster references. Successful cleanup
occurs before actor-free replay. That replay is offline CPU reconstruction
from canonical kind, not acceptance of unauthenticated network paint.

Validation before publication:
- Final b75 production-composed source suite: 7/7, with all 626 consumed
  official source blobs checked and no mismatches.
- Cleanup faults immediately after bind and after painting, plus normal
  cleanup: 3/3; a subsequent producer records once with no prior hook/roster.
- Omitted receipt, omitted owner and altered outgoing kind each fail both
  target tests. Expected geometry values and original assertions are unchanged.

The existing patch-test shard discovers this source test. This two-path change
adds no emitted or browser step. The source result is not exact-emitted/native
acceptance; all required CI must pass on the published head before merging.
