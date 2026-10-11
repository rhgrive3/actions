# PR1202 49f37c Super Jump / #1203 interaction review

Reviewed integrated commit `744b552a` after merging PR1202 head `49f37c2016804e7e388ddf463c0c06015acb2b41`. No production edit was required by this review.

## Ownership inspection

- #1203 clears only the dead actor's `s3.squidSpawn`; it does not clear or reset `_s3SuperJumpEpoch`, `_s3SuperJumpEndedEpoch`, or `_s3RemoteSuperJumpState` during an ordinary living update.
- #49f37c reads the committed destination from the accepted adoption sample only when its life matches `actor.net.lastLife` and its phase matches. The epoch layer takes a new action's own destination, keeps a continuing action's accepted destination, and rejects older/ended epochs.
- Native remote splat/respawn still ends the previous Super Jump epoch. Normal live jump admission increments the owner's epoch without needing a reset or respawn. A later live jump remains an eligible chained-jump target.
- #1203 host result/clock corrections are separate from actor snapshot/event admission. They do not change Super Jump sidecar layout, owner admission, life admission, event sequencing, or destination sampling.

## Verification

On the integrated source:

1. Existing chain-jump, Super Jump epoch/death/respawn, #1203 terminal integrity, remote-respawn and Squid Spawn suites: **51/51 pass**.
2. Six additional 30/60/120 Hz interactions: **6/6 pass**.
   - The first Super Jump fully lands through the native path. A second jump begins while the same actor is still alive, without reset or life increment, reaches epoch 2, and exposes its own destination to a local chain jump.
   - After an actual native splat/respawn, the serialized respawn is played and confirmed to retire epoch 1. Real Squid Spawn completes before epoch 2 starts. Replaying the old owner packet cannot retire the new jump.
   - Putting that already-played respawn event in a fresh accepted owner tick also cannot retire epoch 2: its event sequence is still old. The remote's current life/alive state and chained destination remain unchanged.

The added fixture installs the actual respawn lifecycle alongside production-composed native Actor/NetMatch, and uses controlled scene/physics services. It does not claim real relay/browser or retail-console verification. These are integration acceptance tests for an existing fix, not additional claimed fidelity defects.
