# Wall-supported Super Jump presentation (#904)

Base: PR #868 c633befcf9c6c17d667f6d050a97f90ad5b13332. Claim: https://github.com/rhgrive3/actions/issues/904#issuecomment-6028265829 . This is a private next-batch candidate; the current public acceptance head is unchanged.

The existing gameplay owner captures and validates `superJumpState.wallSupport`, but native admission clears ordinary climbing. The Character then selects an unsupported squid basis. While a validated charge is presented, borrow the existing climb form/normal only for the synchronous native Character.update call and restore the animation frame in finally. Gameplay climbing stays false. Existing charge compression and flight pose layers retain their code and clocks.

The existing actor snapshot climb bit and normal slots carry the same wall support during charge. The receiver converts those existing fields back to wallSupport and leaves ordinary climbing false; unsupported charge and flight clear the support. No new packet field, timing, speed, destination, vulnerability, collision rule or pose calibration is introduced. The original phase assignment remains available to the #460 gauge adapter.

Validation: full production transformation chain, actual Actor/Character, fixed-clock 30/60/120Hz charge-to-flight, support loss/repaint, ground-start and ordinary wall swim, exception restoration, and actual NetMatch _sendTick -> JSON -> onMessage -> sample -> applyRemote. Three focused cases pass. Old motion fails the world-space pose assertion at the first charge tick (0.00826336068 rad), and the old sender emits [0,0,0] instead of [0,0,-1] in the existing normal fields. The earlier 0.943rad diagnostic in the claim was pivot-local and includes changing actor yaw; it is not a world-space pose-error measurement. The final regression uses world quaternions throughout.

The fixture provides a deterministic own-ink wall raycast and uses native Actor support logic, not a replacement physics implementation. The remote case uses the real existing snapshot pipeline; two independent live browser clients, delayed transport and physical Nintendo pose equivalence are not claimed. No new build or CI was run.
