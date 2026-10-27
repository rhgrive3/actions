# Ranked Rainmaker input lease reproduction — 2026-10-26

Read-only triage for PR #1894, commit `70cc3b1`, ranked workflow run `40362215329`. No runtime edits or suites executed for this triage. Code below imports the actual pure `RainmakerRule`; the command-expiry predicate is exactly the `buildFrame` contract from `patches/splatoon3/runtime/ranked/install.mjs`.

## Reproduction

Run from `/workspace/inkwave`:

```sh
node --input-type=module - <<'JS'
import {RainmakerRule} from './patches/splatoon3/runtime/ranked/rainmaker.mjs';
const events=[],rule=new RainmakerRule({event:(kind,payload)=>events.push({kind,...payload})},{}),actor={id:'guest',team:0,pos:[0,0,0],swimming:false};
let now=0;
const input={fire:true,aim:[0,0,1],at:0};
for(let tick=0;tick<=45;tick++){
 now=tick/60;
 const command=Number.isFinite(now-input.at)&&now-input.at>=0&&now-input.at<.75?input:null;
 rule._updateShot(1/60,actor,command);
}
const early=events.filter(e=>e.kind==='rainmaker-shot').map(e=>({charge:e.charge,damage:e.damage,blastDamage:e.blastDamage}));
let ticks=0;
while(rule.state.charge.value!==1&&ticks++<180)rule._updateShot(1/60,actor,{fire:true,aim:[0,0,1]});
const hostWait={value:rule.state.charge.value,eventsBeforeUserRelease:events.filter(e=>e.kind==='rainmaker-shot').length};
rule._updateShot(1/60,actor,{fire:false,aim:[0,0,1]});
console.log(JSON.stringify({early,hostWait,afterUserRelease:events.filter(e=>e.kind==='rainmaker-shot').map(e=>e.charge)}));
JS
```

Actual output:

```json
{"early":[{"charge":0.733333333333334,"damage":39.000000000000014,"blastDamage":0}],"hostWait":{"value":1,"eventsBeforeUserRelease":1},"afterUserRelease":[0.733333333333334,1]}
```

At 0.75 seconds of host simulation since the last admitted held command, `buildFrame` drops the command. Rainmaker consumes the missing command as fire-up. Its one-frame initial charge delay means the elapsed charge is 44/60 seconds, producing exactly the CI failure's `0.733333333333334`. Later held commands can build a new charge to 1 while the first partial event remains at `rankedWeaponEvents[0]`. The browser check can consequently observe full host charge and then assert against the older partial event.

## Ownership/source contract

- Only `!match.follower` executes `ranked.update(dt, frame)` (`ranked/install.mjs`, `advanceRanked`). The host is the objective/charge owner. A guest's charge display comes from host snapshot restore (`ranked/network.mjs`, `acceptState`). Swapping the full-charge wait to the guest is not the appropriate fix.
- Guest Actor snapshots native intent before main-weapon suppression into `_rankedInput` (`ranked/install.mjs`, Actor update wrapper). Normal 20Hz actor packets include `rki` with an incrementing sequence, match/id, fire, throw and aim (`ranked/network.mjs`, `rankedTickBroadcast`).
- Host `onMessage` stages input only from the actual actor owner, matching match and valid life/seq/aim; after native packet processing, `bindRankedInput` binds actor/match/session/owner/life. `buildFrame` uses `rankedInputFor` and the host receive time `at: G.time`, then requires `0 <= age < .75`.
- `RainmakerRule._updateShot` charges for 60F after its 1F ordinary or 6F swim startup, latches the current value on release, and classifies `charge >= 1` as 60 direct / 180 blast damage. The delayed pending shot retains validated owner/life/body/muzzle origin.
- PR `70cc3b1` does not modify `ranked/rainmaker.mjs`, `ranked/network.mjs`, `ranked/install.mjs`, `ranked/pose-admission.mjs`, or `ranked/engine.mjs`. Native optional-output sweep work does not alter their clocks, command admission, charge math or event rule. Browser load/scheduling can expose the pre-existing lease behavior.

## Evidence limits

The CI log records the exact partial charge and shows slow independent browser progress, but it lacks admitted input age/sequence and event-epoch history. The reproduction proves that the check permits the exact observed false synchronization. It does not by itself prove the actual CI packet gap; receipt logging in the corrected native scenario should make that observable.

## Deterministic helper review requirements

1. Freeze both native game clocks before held input and restore each page's previous `frozen` and `_skipRender` values in `finally`, including timeout/exception paths. Keep websocket transport and real relay callbacks active while frozen.
2. Drive guest native Player → Actor → `_rankedInput` plus normal 20Hz packet production in small bounded batches (e.g. 3F/50ms). Do not forge input maps/packets, set charge, bypass `bindRankedInput`, or extend the .75s lease.
3. Before each host batch, require a newly admitted, owner/life/session-matching host command with exact expected fire and a strictly newer sequence. Use the existing admission accessor rather than accepting an unbranded lookalike map entry. Capture host `G.time`, input `at`, age, sequence and life/owner; require freshness before advancing.
4. Advance the host only by the same bounded simulation batch after its real relay receipt. Since host simulation is frozen during transport wait, wall-clock load cannot silently age the command out.
5. Preserve carrier/actor/session identities and verify they still match on each round. Require no earlier Rainmaker shot before releasing at authoritative full charge; preserve the original exactly-one event, 60/180 damage, 420 wall damage and peer replay assertions.
6. Release through the native guest mouse/input path, obtain a newly admitted fire=false command, and then advance host to emit the pending event. Do not filter/clear partial events or retry away a failure.
7. Keep failure receipts before restoring hooks/clock state: host/guest native input, accepted sequence/fire/age, carrier/life/owner and charge/pending/recovery plus all shot IDs/charges. Restore original methods, inputs, frozen state and rendering flag on every exit.
