# Guest zero-time input admission (#838)

Base327651d26bfbd63d2f867e1205b14aa88e339948; claim https://github.com/rhgrive3/actions/issues/838#issuecomment-6024312292. Fresh5222bcc preserves these owners; its shared S3 adapter additions affect HUD/Menus/music, not this Match connection.

A native follower stays playing at local time zero while the host retains finish/result authority. Before, actual Player input into installed weapon fidelity still emitted fresh shots. The new gate neutralizes both intent edges and delegates offensive pending cancellation to dedicated existing owners. It never calls WeaponRunner.reset: cooldown, Dodge/lock, roll resources and hit maps are untouched. Splatling unspent reservation refunds once through its original owner. Existing projectiles, remote replay and host result handling continue.

Storm has a separate held-input owner: neutralizing an armed R hold initially reproduced one unwanted throw. The added Storm helper disarms only subWasDown/subArmed, preserving the held device and other lifetimes. Positive host-time correction waits for physical command channels to become neutral, so old held input cannot become a fresh press. Subsequent fresh press/release works normally.

Eleven focused source cases pass using actual Match/Actor/Player and installed fidelity: fresh commands; held Charger/Shooter; ready/tap Sub; Blaster/Slosher/Roller pending windups; original Splatling refund; resources/recovery/maps; positive correction; projectile update and accepted host finish/result; host adoption; keyboard/pad/touch channels; armed Storm. Geometry and projectile sinks are bounded. A private composition with #837's three production hunks passes two additional cancellation/resource cases; that peer delta is excluded.

This is client input admission, not authoritative match completion. No deadline protocol, lease, physics catch-up or permanently hidden host fix (#878) is included. No full build, browser, hardware, live transport or full CI acceptance is claimed.
