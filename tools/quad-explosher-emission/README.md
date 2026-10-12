# Fixed-source emission diagnosis

Diagnostic only. Main 80555 runtime, fixed fe242/f3fd geometry, native day IBL and Neutral tone mapping, native FX (including bundled ink-volume packs), actual Projectiles added to the scene. Source motion and the actual Actor/Runner/Character are used. No production file is changed by this PR.

Arms: fe242 native socket, fe242 with only Explosher's definition muzzle moved to its authored lip centre in the browser before Actor construction, and the unaccepted f3fd lower-neck shape with native socket. The mouth-origin arm is an explicit gameplay-origin proposal, not a visual-only offset. It is not an approved runtime change.

30/60/120 Hz, aim up/down and a near-wall OBB record projectile births, physical pos/prev/start/velocity, FX/event origins, native socket and actual lip centres transformed through the held weapon. Native projectile positions are never shifted for rendering. Sixteen consecutive frames from the first birth form the GIF/contact sheet. The red socket/cyan mouth picture is separately labelled debug evidence, never an unmarked frame. Still and GIF simulation time is recorded; this is not a performance benchmark or physical-device FPS claim.

This supplements previous gallery captures, whose real projectiles were intentionally not attached to the render scene. Those images proved held pose/shape, not muzzle-to-projectile visual alignment. Source lip centres come from exact builder ring transforms, not retail calibration. The f3fd burner location is already considered visually unaccepted; it remains a useful control of the origin mismatch. The socket proposal still needs aiming/near-obstacle/network and unchanged weapon-parameter regressions before adoption.
