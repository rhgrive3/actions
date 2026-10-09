# Haunt accepted-owner-life replay repair — #351

## Scope and evidence

- Integration baseline: PR #1182 `2eaec912f4eeaa54982a698e1ac41576b7d574e4`, with the independent #258 sweep repair already present locally.
- The next five-item audit covered #351, #835, #388, #935 and #838. Current Issue comments and open-PR changes were checked before selecting a change. Respawn Punisher, full Charger piercing and finish/guest input cancellation already have active implementations; no duplicate implementation is added here.
- [Issue #351](https://github.com/rhgrive3/actions/issues/351) separates the verified post-respawn case from unknown delayed-trade activation timing and special-equipment exceptions.
- The [public S3 Haunt verification notes](https://wikiwiki.jp/splatoon3mix/ギア/ギアパワー/分割3#haunt), read on 2026-10-09, describe persistent killer tracking and the existing +45F / 15-percentage-point penalty. This patch changes no reference coefficient, gear formula, visibility distance or trade cutoff.
- The defect is established by the repository's actual `NetMatch.update` / `_playEvents` / `applyRemote` ordering and `combat-life-adapter.mjs` owner-snapshot admission. It is an INKWAVE lifecycle composition defect, not a new Nintendo numerical model.

## Reproduced failure

Two independent JavaScript module contexts run the complete production adapter composition and every actual bootstrap installer. The owner dies, emits `haunt:mark`, uses the native Turf Squid Spawn `respawn → spawnAt/reset` lifecycle, and emits `haunt:arm`. Native NetMatch broadcasts and receives JSON packets; the test does not directly manufacture the positive Haunt events.

The receiver accepts owner life 2 in a snapshot, but replays the life-2 arm while the rendered Actor still has life 1. Haunt compared against that rendered value and consumed both legitimate arm events without arming the mark. The sender recognized +45F, while the victim owner applied only the ordinary death: SP100 became 50 rather than 35, with no extra 0.75 seconds. Render rates 30/60/120Hz all reproduce this. Merely using sampled `net.cur.life` is insufficient because an event timestamp can precede its enclosing snapshot's timestamp.

A longer receive/replay backlog can span two owner respawns and two different living killers. Its marks belong to lives 1 and 2 while the accepted owner life is 3. Rejecting every mark except the latest life loses the second killer's ledger.

## Repair

- Haunt uses the existing accepted `net.lastLife` for remote gameplay identities, while local authority and actors without an accepted snapshot retain their existing life source. It does not advance `Actor.netLife`, alter interpolation or add wire columns.
- A remote mark must fall within the current rendered-to-accepted owner-life interval. An arm must equal the latest accepted owner life. Existing sender, actor-map, owner identity, target-life and team guards remain.
- A historical event cannot roll an existing record back to an earlier owner life.
- A query between an accepted newer life and its queued arm returns no stale penalty, but preserves that proven mark so the subsequent current-life arm can refresh it. Target death/new life, owner identity changes, roster removal and match changes still invalidate records.

## Verification

- Before the runtime change, both new native positive cases failed on the missing victim-authority penalty.
- Source: 71/71 selected tests pass across new native life-order regressions, existing Haunt, clothing gear, private tracking, remote respawn, respawn lifecycle and combat-life admission.
- Actual emitted build `0c952222eb99`: all three applicable native cases pass; the source-only counterfactual is deliberately skipped. Quick upstream/reference and deterministic startup/cache gates pass (141 initial JS requests, 140 module preloads, 3,354,823 initial JS bytes).
- Independent read-only review reran 17 Haunt tests and separate ordinary/backlog probes at all three render rates, with no blocking findings.
- New coverage: 18 ordinary render/send-phase combinations; a two-respawn/two-killer backlog at all three render rates; pending-ledger queries; stale/future/forged events; next victim life; and a rendered-life-only counterfactual that restores the missing penalty.
- Display/audio/collision fixture boundaries remain stubs. This is native gameplay/network logic execution, not a real WebSocket/browser/GPU or Switch measurement.

## Remaining acceptance

The Issue's exact pre-respawn delayed-trade timing, special-equipment interactions and physical visibility calibration are not resolved by this transport repair. #351 is referenced, not closed. #838's broader synchronized-host-deadline acceptance is also not claimed by observing its existing guest input cancellation.
