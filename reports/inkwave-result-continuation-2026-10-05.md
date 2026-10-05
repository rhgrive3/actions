# Offline Turf result-to-loadout continuation

Refs #478, first bounded subset. Baseline main
83d6b088246f760a34d0921c118482bca7cde777. The published inkwave-public source is
unchanged; production adapters implement all behavior. Online per-player
continuation negotiation and the existing host timer remain unresolved. Boss
results are deliberately excluded. This source Draft is for the combined
integration Draft, not an individual main merge.

## Reference and implementation

[Nintendo's Splatoon 3 update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/~/splatoon-3-update-history)
explicitly documents Keep Going / Change Gear, Then Go, preserving groups during
equipment changes, canceling continuation, and a fixed bug where new gear could
appear on the previous battle's results. The reference target remains 11.3.0.
No matchmaking implementation or exact Switch transition timing is claimed.

INKWAVE's offline result has only Rematch/Main Menu. The existing native loadout
screen, setter and saved gear panel already exist, so the new result action uses
that same screen through the native results→loadout history stack. It appends
one explicit Keep Going button to the loadout's existing action column. Weapon
or gear selection uses its original save callback; selection alone cannot start
a match. Cancel/Back preserves those native saved selections but returns to the
previous results without starting. Locker→Back returns to the same continuation.

An instance-local intent is bound to the original results object and currently
mounted screen. New results, unrelated navigation, disposal, or a transition
away clears it. Repeated/stale callbacks cannot start duplicate matches. Native
prepareMatch/rematch are invoked once; errors can retry only while that same
screen/result still owns the intent. A late error cannot resurrect an abandoned
screen. Normal standalone loadout navigation has no continuation action.

Returning from the loadout/locker must also restore the old podium: native
_onScreen otherwise leaves showLoadout's character visible over the results.
The new guarded restore uses the completed match's actors and winner, not the
new profile weapon/style. It never reruns judging, XP awards, profile progression,
or result construction. The next native startMatch reads the updated profile;
existing stage/difficulty/duration options are retained, including 90-second
matches.

## Verification

Native show/_back/showResults paths, native menu API setter, weapon save semantics,
result identity, screen ownership, modal/stale/double events, sync/async failure,
disposal and old-podium restore are covered by focused tests. The emitted helper
runs the same native navigation cases. Native upstream negative checks establish
that the old result has no equipment-change action.

The existing required responsive browser gate now adds the actual Menus DOM
path for each existing viewport/engine: results→change gear→different weapon→
Back (zero starts, unchanged old results)→change gear→locker→Back→Keep Going
(one prepare/rematch with the saved weapon). It records two new screenshots and
a resultContinuation receipt. Existing screen assertions and viewport cases are
retained; the new helper is included in verifier hashes. The match API is a
fixture recorder, not a live network/physical-device match.

Local Chromium launch is blocked by the execution sandbox's singleton Unix
socket restriction. No local browser success is claimed; exact-head GitHub
Chromium/WebKit acceptance is pending publication. Node/native/emitted and build
checks are recorded in the PR. Fresh Nintendo hardware timings and the online
portion of #478 remain unverified/non-closing.
