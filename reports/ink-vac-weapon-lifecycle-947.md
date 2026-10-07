# #947: retire held Ink Vac after a weapon change

Base main: b34a8aaf606594be61cfbd4c21e9f09afd685ad7. This is an internal lifecycle repair, not a Nintendo timing or balance calibration.

Real installed Actor/Character and RangeSession.setWeapon reproduced Charger Ink Vac -> Splattershot retaining specialActive=inkVac at zero special gauge and later emitting an Ink Vac countershot. The dedicated Ink Vac state and visual were only retired through death/reset or normal release, whereas native setWeapon only resets WeaponRunner.

Wrap the existing setWeapon entry and, only after it returns with a different weaponId, invoke the same Ink Vac disposer. That removes the held visual/state and publishes its existing owner-only disposal event. Same-weapon refresh leaves the special active. Already-released countershots remain in Projectiles, spent special gauge is not refunded, and health/ink are not reset by this hook.

Focused native Actor tests: 5/5 pass covering changed/same weapon, a switch inside the enclosing native update (the finally block cannot restore a cancelled token), released-projectile survival and existing reset/death cleanup. Restoring the old runtime fails the two changed-weapon/reentrant regressions. Separate full-source real Character plus actual RangeSession action reproduced the failure before and successful held-state retirement after. No full build or browser conformance is claimed by these source checks; new-PR CI is independent evidence.

Issue: https://github.com/rhgrive3/actions/issues/947
Claim: https://github.com/rhgrive3/actions/issues/947#issuecomment-6030903289
