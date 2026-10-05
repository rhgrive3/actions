# Fresh Charger startup, Issue #566

Baseline main fc057af9baac421ec707504f4637e2ed8824a444, read back immediately before claim5992505000. Independent local candidate; PR600/63 and UI572/594 remain separate owners.

## Boundary and change

Native Actor resets kidT=0 on actual squid→kid transition. Generic emergeDelay=.07 first forwards fire at kidT=5/60, and native Charger immediately increments chargeT in that update. The scoped target is6/60 from actual form exit. Add profile calibration swimChargeStartDelay=.1 and a three-line guard in the existing Charger wrapper for `!charging && !s3Stored` before restoration. No additional timer or input-edge inference is introduced. Manual emergence before ZR consumes the same existing clock; it does not restart6F on the later press. No new pending input survives cancellation.

The existing human path (kidT well beyond startup) begins charging on its first admitted update. Current fixed-update counting gives one1/60 increment on that update and full charge after60 progression updates. This preserves the project contract; it does not equate physical button input and an observed animation frame.

## References and limits

Community measurement, not pinned raw parameter extraction:
- https://wikiwiki.jp/splatoon3mix/ブキ/スプラチャージャー lists humanoid1F, squid6F and full60F.
- https://wikiwiki.jp/splatoon3mix/検証/メインウェポン/前隙・後隙 defines the squid origin by the beginning of the fading swim ink gauge and the endpoint immediately before charging/shooting becomes possible; its visible table is labeledv10.0.1. The6F target in Issue566 is retained, without claiming a newv11.3.0 capture.

Here actual native form exit is the simulation proxy for that visual origin. The test logs elapsed intervals: exit update index0, first positive chargeT at index6. It does not claim physical input/display latency or exact cross-game frame origin identity. Existing stored-charge readiness, partial minimum release and charge-cancel recovery must not be inferred from this fresh gate.

## Validation

- Source dedicated6/6 and emitted dedicated6/6 (buildd7cc1151fcd7): no early charge/ink; human first update/full60; manual exit1/3/5/8 updates before fire; held store bypass; release/sub/death/weapon cancellation; display30/60/120/144Hz through FixedClock.
- Existing Charger keep/cancel and movement-start regressions18/18.
- Actual PR600 head91981db323df8171c6636e8511f16331af0388d8 profile and full weapons runtime applied in a separate source fixture with this guard:7/7. Min7 held progression frames reject while8 allow a shot; air/empty rates remain1/3 after admission. Early/ready stored-charge restoration is unchanged when toggling this gate. Ready keep restores at exit index0, with no extra6F. Expired keep falls back to fresh startup, changing old index5 to6 as intended.
- That is focused source composition, not a full PR600/reliability/build merge. Dedicated primary tests run actual native Actor/Runner but stub display/collision; GPU/browser, Switch footage and future UI572/594 combined acceptance are not claimed.

Raw upstream, hair, packet transport, projectile damage/geometry, gear, movement coefficients and all other weapon startup values are unchanged. The numeric-status mirror labels the new field as calibration/unverified; no direct raw binding is invented.
