# Scalar shot cones and authoritative hurtbox positions

Baseline main b4d5c31e33258a0b6f874e42234448e404eec2d4. Two roots: #607/#677 share the scalar-cone geometry defect; #639/#640 are duplicate reports of the render-offset collision defect. This batch does not include #702.

## Scalar cone geometry

The actual native Shooter/Blaster emitters applied a fixed0.55 scale to the vertical tangent component. Equal radial samples changed angular magnitude with azimuth. At the outer vertical sample, existing grounded Shooter4.86 degrees became2.6774785, airborne Shooter11.66 became6.4753116 and airborne Blaster10 became5.5392132.

The existing weapon-edgecases helper now handles those two families with an orthonormal perpendicular basis and equal tangent scales. Both native launch sites connect through exact-once source anchors. Profile spreads, two random draws, square-root radial law, firing admission/cost/flight/damage are retained. Zero spread still consumes no radial draws. Generic `_spread` and Splatling's separately sourced1.6-degree ground pitch remain independent.

Provenance: profile.weaponsFidelityCompletion, pinned S3 11.3.0 source commit7280ff9cde8bb1c5dcef46c700c326471584d2e6. Shooter/Blaster WeaponParam have Stand_DegSwerve/Jump_DegSwerve and no PitchDegSwerve; Splatling has PitchDegSwerve. This correction is only cone geometry. The retained uniform-area radial model does not establish Nintendo's exact probability/bias evolution; #198 and #684 remain separate.

## Hurtbox position

Authoritative target capsules previously used actor.pos.y + actor.smoothY, although native Actor defines smoothY as visual easing for step/ledge discontinuities. With pos fixed, changing smoothY to+.45 changed an ordinary projectile query from miss to hit. A finite Charger at the same fixed body also changed from no hit to60HP solely from+.7 render easing.

Ordinary projectile and finite-Charger consumers now copy actor.pos directly for their capsule base. They still use the same existing body dimensions, per-weapon radii, continuous sweep, earliest world/player arbitration, forms, team/death checks and victim authority. Render easing, camera, name tags and character placement remain untouched. Ghost visual chronology uses the same base but does not gain damage authority. This does not add prediction/lag compensation or claim undocumented Nintendo interpolation behavior.

## Evidence

- Before: actual emitter cone, actual projectile target solver and finite Charger tests failed in the described directions.
- Final new tests: source9/9 and emitted/minified9/9.
- Existing source weapon-edgecases16 plus fidelity source4:20/20. Existing emitted weapon-edgecases16 also pass.
- Coverage:54 scalar radius/azimuth/state combinations, zero-spread RNG, unchanged speed/identity, generic/Splatling isolation, raw source fields, same fixed60Hz launches driven at30/60/120Hz, fail-closed anchors, native ghost launch vectors without resampling, both forms and smoothing signs, actual Shooter HP and actual-position positive controls, world cover, and finite-Charger positive/negative contacts.
- Production build succeeds:0a059d12c7a5. No new module, profile value, protocol field, upstream source or model/hair change.
- No redundant full source suite or full local CI was run. Browser and physical Switch/device acceptance remain pending. Main's known canonical27-field mock-recorder verifier mismatch remains owned by PR701; no older protocol expectation is restored.

## Ownership audit

Fresh main, Issue comments/assignees and relevant live PR diffs (#665/#668/#670/#691/#692/#701/#609/#331/#536) were read before claims. No changed production line owned these roots. Bomb candidates #637/#638 and #643/#644 were discarded because the actual main adapter/Gear already owns their gravity/recovery corrections. #610 was excluded because #692's sub-special composition owns its forward-component gear multiplier. #627/#628 remain excluded due to #670 group accounting. Existing #702 stays in the prior integration batch.
