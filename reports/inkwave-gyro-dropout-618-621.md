# Timestamped sensor ownership for #618 and #621

Base: main b4d5c31e33258a0b6f874e42234448e404eec2d4. Both issue comment lists and timelines were empty of implementation owners when claimed; related #678 only cross-references them. Claims: #618 comment6003614520 and #621 comment6003615814. This is a later independent candidate, outside the completed #681/#676 batch.

## Observed defects

Actual composed native Gyro, rrA and rrB, constant120°/s pitch,200ms one-stream gap at30/60/120Hz: the complete input gives1.142397rad camera pitch. Missing motion gives0.571199–0.666398rad; missing orientation gives1.523196–1.570796rad. The first permanently drops a valid attitude prefix before the75ms stale decision; the second replays a prefix already committed from raw motion. These are source/VM observations, not phone measurements.

## Change and mathematical boundary

The existing gyro quality owner keeps the timestamp and full attitude quaternion in the existing reference frame at the last committed sample (not a new deviceorientationabsolute subscription). Each accepted raw sample advances that quaternion with the same constant-body-rate interval already assumed by native rotationRate integration. Attitude observations newer than that boundary are retained while raw remains selected. If fallback occurs, observations are consumed in timestamp order: each increment is conjugate(committedQuaternion) × observedQuaternion. No attitude delta is scaled by an elapsed-time ratio.

The original _sample still owns screen/player-space projection, smoothing, sensitivity and inversion. The ordinary attitude path delegates directly when its boundary agrees with native _tQ. Accepted raw sampling retains the native2ms burst gate and existing #524 first-adoption origin semantics. A gap of rejected raw samples is never filled by stretching one current rate: fallback consumes retained attitude observations instead. The existing75ms freshness bound now also checks actual committed-sample freshness, so frequent raw events rejected by the native burst gate cannot freeze the queue indefinitely.

Resync, reverse timestamps, screen changes, stop and >500ms gaps discard prior boundary/observations. Explicit discard also retires queued observations and advances to the latest actually observed pose when newer than the committed boundary; ordinary consume continues to retain pending sensor observations. Duplicate attitude events do not enqueue duplicate snapshots. Permission, Android source selection and the native75/500ms policies are retained.

## Scope limits

The75ms fallback decision still defers output during a missing raw stream; this change recovers the recorded motion instead of permanently losing it. It does not promise zero fallback latency or a smooth presentation during a sensor outage.

An attitude endpoint determines net rotation, not an arbitrary unseen angular path or whole turns between observations. For #621, the evidence establishes that the accepted raw prefix is not replayed and the subsequent trusted attitude endpoint is reached. It does not establish camera yaw/pitch equality to a hypothetical high-frequency physical trajectory inside the missing-attitude interval. Raw integration uses the native per-sample body-rate model, without claiming exact intersample acceleration. The existing shortest-arc quaternion convention remains. No Switch/iOS/Android hardware parity, World Orientation mapping (#678), new drift calibration, or new sensor-trust tolerance is claimed.

The Web platform defines orientation and motion as separate sensor event interfaces; delivery is not a synchronized pair: https://www.w3.org/TR/orientation-event/ . INKWAVE's existing sensitivity mapping and projection remain the S3 comparison baseline; no Nintendo parameter was guessed or changed.

## Existing owners

PR697@377da127 gyro.mjs is byte-identical to this main baseline; its screen-frame adapter remains independent. PR536@ff402cf9 includes #524 rawStart, focus and stationary guards. A private exact-file composition places the common sample boundary around both #524 raw branches and keeps those guards; the same focused regressions pass. A companion gyro-on-536.patch records that explicit composition and must not be blindly applied as a second main fix. No pending handoff owner is removed.

## Evidence

- Source focused11 tests:24 noncommuting variable-rate traces;54 asynchronous variable-rate/phase traces;64 cadence/phase/order/raw-mapping handoffs;80–490ms gaps and readoption; reversed/long/resync/screen boundaries; Android;1000 duplicate events; rejected sub2ms raw samples; camera yaw/pitch comparison against the fully observed attitude path for #618; first-adoption1ms burst plus later rejected intervals; discard-before-fallback. The last two boundaries were independently raised and reproduced as failing negative controls before correction.
- Final local-quality plus reliability-gyro suite:101/101 passed, no skips.
- Authentic full build7de1b58b4389 succeeded; actual emitted focused11/11 and private PR536 composition11/11 passed.
- Private composition against the existing PR536 runtime uses its actual gyro-permission/platform-lifecycle modules. Full combined PR536 acceptance is not claimed.
- Full aggregate and browser/hardware acceptance remain outside this local proof. No public branch, PR, main or deployment is changed by this candidate's local tests.
