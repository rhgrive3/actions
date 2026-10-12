# Fixed-source emission diagnosis

Diagnostic only. Main 80555 runtime, fixed fe242/f3fd geometry, native day IBL and Neutral tone mapping, native FX (including bundled ink-volume packs), actual Projectiles added to the scene. Source motion and the actual Actor/Runner/Character are used. No production file is changed by this PR.

Arms: fe242 native socket, fe242 with only Explosher's definition muzzle moved to its authored lip centre in the browser before Actor construction, and the unaccepted f3fd lower-neck shape with native socket. The mouth-origin arm is an explicit gameplay-origin proposal, not a visual-only offset. It is not an approved runtime change.

30/60/120 Hz, aim up/down and a near-wall OBB record projectile births, physical pos/prev/start/velocity, FX/event origins, native socket and actual lip centres transformed through the held weapon. Native projectile positions are never shifted for rendering. Sixteen consecutive frames from the first birth form the GIF/contact sheet. The red socket/cyan mouth picture is separately labelled debug evidence, never an unmarked frame. Still and GIF simulation time is recorded; this is not a performance benchmark or physical-device FPS claim.

This supplements previous gallery captures, whose real projectiles were intentionally not attached to the render scene. Those images proved held pose/shape, not muzzle-to-projectile visual alignment. Source lip centres come from exact builder ring transforms, not retail calibration. The f3fd burner location is already considered visually unaccepted; it remains a useful control of the origin mismatch. The socket proposal still needs aiming/near-obstacle/network and unchanged weapon-parameter regressions before adoption.


## Follow-up: separate initial prediction from steady fire

The initial exact96346 run completed all three arms and retained its PNG/GIF/JSON artifacts. Actual source-motion images show a first-birth gap to the held native socket: about455mm for Quad and568mm for Explosher at60Hz. Both use the unchanged native getAimMuzzle/aimReady prediction; this is distinct from Explosher's121mm definition-to-authored-mouth offset. No socket-only fix is accepted on this evidence.

The follow-up retains fixed runtime80555 and compares exact fe242 native/mouth with pure main80555 geometry. It adds steady cases after1.2s of actual firing without resetting Runner or pose, then clears previous projectiles/FX/traces before recording the next birth. Every relevant arm additionally records first births at60Hz. RNG is reset to19851123 after model construction and again after warmup/clear, so different geometry UUID allocations do not become a false weapon-spread change. The rejected f3fd arm is not rerun. Main's visible mouth is not measured and is explicitly null, rather than labelling the old socket as the mouth. aimReady is now recorded at each birth and frame.

A separate Node native-pose eight-case probe preserved descriptors/damage/ink/cadence, but socket relocation changed launch velocity length by up to0.039m/s in open space, and0.350m/s at a near-wall LOS fallback. Native slosh adds10% vertical velocity after aiming, so unchanged weapon parameters do not imply identical velocity length after origin-dependent aim changes. That probe does not load source motion and is not browser/online proof. The socket proposal remains unaccepted pending the actual steady comparison and aim/collision/network evaluation.
