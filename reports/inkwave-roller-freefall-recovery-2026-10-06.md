# Recover natural free-fall Roller mode selection (#479)

Source PR751e5640caa09d84560d1fdf792a74511b806384081; current base868327651d26bfbd63d2f867e1205b14aa88e339948.

The source roller-freefall module is retained byte-for-byte: the first25/60s of natural fall admit a horizontal flick, accepted jump/movement launches select vertical immediately, and an admitted attack keeps its latched mode. The source build adapter now accepts the known current installRollerLogic header and preserves Actor/G/on, existing contact admission, roll-stop and post-flick ownership. Missing/duplicate/unknown install shapes still fail closed. No windup/ink/damage/timing constants are changed.

The new gameplay helper is added to the existing deferred preload-hint set. Static imports, module emission, full precache, closure checks and startup budgets are unchanged. No full build is performed here.

Original16 source cases pass on current owners. Fixture expectations use the current profile vertical windup31F instead of the source's old26F, and the partial-Surge case uses the current independent armor owner. The separately delivered #473 one-condition patch535f53c5ba0dc12757be0bcadea6a3f8cb340e8f4d746dbefce494010e4da35d is applied only as a local prerequisite for that joint case; it is not duplicated in this patch.

Existing #206 actual NetMatch/Character transport tests initially reproduced their stale setup: a merely airborne actor now correctly selects horizontal. Two fixture entry points now deliver the existing actor:jump accepted-launch event before the owner selects vertical; no internal mode flag is assigned. All packet shape, collision-free bit, landing/recovery pose, duplicate event, stale opposite-mode and death cleanup assertions remain intact. Both network cases pass. These tests establish selected-state transport, not native jump admission; original #479 native Actor tests independently exercise accepted and rejected jumps.

No physical Switch or new browser/CI result is claimed. Current broader #750/#558 weapon ownership is preserved. The helper's25F reference is the original PR's existing source claim, not a new measurement.
