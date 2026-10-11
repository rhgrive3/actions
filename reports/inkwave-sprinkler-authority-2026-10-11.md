# Sprinkler paint authority and real-physics safety

## Reproduced defects

The normal owner has used the native Sprinkler bomb lifecycle since #1188. The catalogue still accepted legacy `ac/sub` spawn/deploy/drop events for that same device, and `replaySprinklerDrop` directly called PaintSystem outside ordered paint-row admission. With actual NetMatch serialization and replay, a legacy drop of radius .6 acquired 18 cells. After an enemy overwrite removed them, replaying the old drop payload inside a new event envelope restored all 18 cells. This is a retired-protocol authority hole, not evidence that normal current clients emit both paths.

The new native-path regression also exposed a production collision error: the first droplet passed `{}` as Physics.segment's hit output. Real Physics.raycast requires preallocated point and normal vectors, and threw on the first floor intersection. Existing kit tests used a segment stub that populated those fields and did not reveal the error.

## Fixes

- Reject retired catalogue Sprinkler births; native bomb/ghost birth remains authoritative.
- Ignore legacy sprinklerDrop events; they cannot alter gameplay ownership or score. Native ordered paint rows retain both rendering and gameplay effects.
- Allocate one reusable point/normal hit record when the native Sprinkler starts, preserving the native raycast contract without per-droplet output allocations.

Compatibility: old peers that only implement the catalogue Sprinkler protocol no longer create that ghost representation. Accepting its old paint authority would reintroduce the overwrite defect. The current native peer path is covered by the regression.

## Verification

Actual Actor and WeaponRunner hold/release consume the normal 60 ink, create a native Sprinkler, and physically collide with an OBB floor. Native droplets generate ordinary sequenced paint rows. Actual JSON sender/receiver replay matches ownership; repeated rows do not undo an authenticated enemy overwrite; later valid native spray updates both peers consistently. Owner death retires the device while already painted ownership persists.

Two new source tests and their actual composed-build counterparts pass. The wider all-subs/kit-subs invocation passes 50 cases (kit-subs uses its older source-only loader; it is not claimed as independent built evidence). The composed invocation including the two new tests passes 52 cases. The separate catalogue-sub authority suite is also run against the composed tree. Build contentHash: `e78e5975e5d137087d0a6217696ae418cc7f42b1915d9582b3cf46deb527777e`.

This change does not include the held powered-disk/gear integration or the rejected high-rate Triple Inkstrike candidate. Browser/GPU CI and independent review remain required before main adoption. No browser FPS improvement or exact retail stencil equivalence is claimed.
