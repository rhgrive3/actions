# Protect live touch gestures from held-axis ownership polling (#497)

Base: integration536 `db23355031e18a8efad89c72bf1a039902ad0833`. Raw public source, thresholds, camera sensitivity, gyro, button-edge generation and first-touch routing are unchanged. This joins a combined local batch without separate push/CI.

## Root and scope

Native Input.pollPad reasserted pad ownership every poll for any axis beyond0.30. Touch correctly acquired a pointer, but the next unchanged held-axis sample switched ownership back, causing the existing losing-device reset to delete a physically-down touch. The same finger could not reacquire on pointermove.

The patched acquisition checks whether the currently owning, active, non-destroyed MobileInput has any pointer-map entry or an active stick id. During that live contact, axis polling alone cannot change the owner. The final release/cancel removes the condition, and the existing0.30 acquisition threshold can reclaim pad ownership on the next poll. No extra timers/thresholds/state history are introduced. Fresh discrete pad-button ownership behavior is deliberately unchanged; this root concerns repeated held-axis polling.

Losing-device neutralization remains intact when a switch is actually committed. PR485's unowned-pad axis/button exclusion remains independent. Multiple touch contacts protect the remaining gesture until the last one ends; destroyed controls cannot retain the lock through stale fields.

## Verification

Actual Input and MobileInput modules through the complete production chain and minified output. Only DOM geometry/capture surfaces are fixtures. Real Input pointerdown ownership, the existing first-canvas-touch bridge, native MobileInput down/move/up, pending edges and source-owned pointer maps are exercised.

- FIRE, native stick and look each survive300 consecutive polls with held0.50 axes. Look moves still produce deltas, movement retains nonzero stick output, and FIRE remains held.
- The original canvas event is delivered once; repeat adoption rejects duplicate delivery.
- pointerup, pointercancel and lostpointercapture allow pad ownership after the final contact and clear held/pending buttons. Another remaining contact still protects touch.
-0.20 drift remains below acquisition threshold; all unowned pad axes report0. After touch release,0.50 claims pad normally.
-20 repeated pad→touch→pad cycles retain cleanup and create no duplicate pad edge.

Native6/6 and production-minified6/6 pass. Earlier emitted baseline fails all6 root checks. Full/source and quality receipts are appended at handoff. Android/iPad Bluetooth-controller hardware takeover and OS-level capture behavior have not been newly measured; no physical-device acceptance is claimed.

Final local receipts: full958pass/0fail/1skip(total959); quality/gates132pass/0fail/3skip(total135); emitted6/6; negative emitted0pass/6fail. The existing source-mode skips are not represented as passed. Production build, quick/numeric compatibility and diff checks pass. No independent source push/CI.
