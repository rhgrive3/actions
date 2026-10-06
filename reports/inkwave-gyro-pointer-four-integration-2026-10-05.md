# Fixed gyro / pointer-lock integration

Refs #618, #621, #662 and duplicate #663. Three roots / four Issues. This Draft is stacked on PR756 at6266bd4946725457226f3c4154afe2322232ced9 so only these completed differences are presented while756's main-base acceptance finishes. After756 merges, the base can move to main; compare tree and workflow event conditions before deciding whether existing acceptance remains applicable.

The original prepared group also contained source PR704's #607/#677/#639/#640. A fresh publication audit found those exact runtime, adapter, test and report hunks already in PR751@51a9f345. They are excluded rather than republished to preserve an arbitrary count. None of PR751's other gameplay or33-field network protocol is imported.

## Fixed changes

- #618/#621: retain the timestamped quaternion boundary of committed input. Missing motion intervals replay the unconsumed observed orientation suffix; returning orientation accounts for raw intervals already consumed. The initial sub-2ms raw pending boundary is handled once, while later discarded bursts are not stretched using the latest rate. Reset/discard retires pending observed poses.
- #662/#663: touch takeover clears locked-mouse transient state and exits logical pointer lock immediately. Queued/late lock notifications cannot steal a live touch or spuriously pause. A later explicit mouse gesture may reacquire only during eligible live play. Native genuine Escape behavior and other input owners remain.

Native sensitivity, projection, Android selection and numerical thresholds remain. The existing75ms sensor-source detection delay is unchanged. Unobserved arbitrary paths/whole turns cannot be reconstructed from absent sensor observations; no physical-device equivalence is claimed.

## Evidence

Source deltas are movement5604ddf0 (dropout) and1f7427db (pointer lock), independently reviewed before composition. Shared report additions preserve both existing base sections and new sections. Production/runtime merges are conflict-free.

Final narrowed composition: source24/24 and actual emitted24/24 (gyro11, pointer13), skip0. Authentic production build and full artifact/startup budget checks pass,131core plus14Range. Broader original-source evidence remains associated with its original heads: gyro101 plus independent noncommutative quaternion/pending/discard review, pointer66 plus asynchronous/multitouch review. It is not relabeled as new exact-CI acceptance.

There is no repeated full local aggregate; the one completed stacked Draft triggers its full existing seven-job acceptance workflow. Browser hardware Pointer Lock and physical sensor behavior remain unverified. The pending CI must be tied to the actual stack head, base and content; old PR705/756 success is not substituted.

Later #633/#634/#721/#722/#746, weapon/UI follow-ups and partial #738 are excluded. No manual main merge or deployment occurs as part of this publication.
