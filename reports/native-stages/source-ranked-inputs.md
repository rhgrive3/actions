# Native source traversal input ownership

The ranked bot wrapper previously called its own steering after a native source Climb or Drop controller had already chosen ordinary movement, swim, jump, and fire inputs. This could paint a real wall yet prevent the subsequent swim climb. The adapter now marks only a frame actually handled by those existing source controllers. The installed ranked wrapper clears that marker before each update, preserves handled input for that frame, and resumes ordinary rule steering on other frames.

This change adds no stage availability, source-navigation flag, graph edge, source placement, Actor physics, ink ownership, or Tower boarding behavior. Existing SourceClimb and accepted highDrops remain responsible for physical qualification and normal controls. SourceSurge and supported running-jump approach controllers are outside this branch.

Reference conditions are INKWAVE's existing Shooter_Normal_00 and zero AP, with 30/60/120 Hz controller steps. The authentic KiTrix sources are pinned at 0611f51b35c9736ee986fb2218461e2585b7875e. Splatoon 3 SceneInfo 11.3.0 supplies identity only; retail controller, collision, navigation, and hardware frame-rate parity remain unverified. Chromium uses SwiftShader, so its timings do not establish Switch or mobile hardware performance.

## Verification scope

The isolated browser wall check starts the actual production match, keeps eight living actors and seven bots, clears initial paint, and exercises the actual Actor/Character, BotBrain, WeaponRunner, Projectiles, paint clock, and installed ranked wrapper. Other bots are held at original source-supported own-team pads. The source wall must be painted through the existing weapon before ordinary swim/climb reaches the grounded upper support. Turf, Zones, Tower, Rainmaker, and Clam Blitz each test both teams at all three rates. This proves physical input composition, without claiming whole ranked objective selection, score progress, or Tower boarding.

The separate drop browser check uses two authentic Humpback departures in Zones, Rainmaker, and Clam Blitz at all three rates. It requires the existing source-qualified Drop handler, ordinary humanoid motion and gravity without an admitted jump, true final supported nav-node height and position, and handler completion. It keeps the same real roster and verifies unchanged source collision bytes and exact immutable packaged Drop/ranked owners.

The CPU Humpback drop proof uses the real production Character and Actor, installed ranked wrapper, and actual source graph. Its constructed ranked frame omits the live RankedWorld blocked callback. The additional 18 CPU routes to rule-authored Zones/Rainmaker/Clam goals have the same callback limitation; they establish controller composition and physical travel, not complete production objective selection.

## Preserved findings

The old production Zones wall reproduction painted all 12 wall samples but did not request swim/climb, then left the wall. The scoped marker correction makes the same real source wall controllable through the ranked wrapper.

A separate real Clam Blitz objective experiment failed for team 1 at 60 Hz: all 30 grounded field clams remained blocked by the production direct-LOS callback, and no ranked goal was selected. Its failed trace remains in ignored evidence. This branch preserves that callback and does not substitute an unblocked CPU frame for a whole-objective claim. Normal initial Squid Spawn and settled-source landing are being checked separately before any goal-selection policy change.

Current immutable build receipts and completed checks are recorded in source-ranked-inputs-verification.json. Browser results must be complete before this PR becomes Ready.
