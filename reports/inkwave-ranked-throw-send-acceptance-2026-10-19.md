# Ranked follower throw: commit the edge only after transport accepts

## Target and comparison

- Fixed integration source: `34f54381d74c844838e01c34fd13f58bc0064127`, branch `integrate/inkwave-prs-20261019`.
- Issue: [#1692](https://github.com/rhgrive3/actions/issues/1692). This candidate owns only the ranked sidecar in `patches/splatoon3/runtime/ranked/network.mjs`; the NetMatch event-prefix/backpressure repair is separate.
- The existing comparison target remains Splatoon 3 11.3.0 and the previously pinned gameplay references. This repairs an INKWAVE delivery-lifecycle bug; Nintendo's private transport or input-retry implementation has not been measured. No retail frame value, projectile trajectory, damage, inventory size, model, or protocol format is changed.

## Reproduction and effect

Use the actual composed Input / PlayerController / Actor, follower NetMatch, Transport and host ClamsRule with socket callbacks and render/collision seams stubbed. Give the follower a Power Clam, tap and release C before the next 20Hz tick. Its pending edge is true. Set the socket's simulated `bufferedAmount` to 524289, one byte above the existing 512KiB threshold. The real Transport returns false, sends nothing, but the original ranked wrapper sets pending false. Restore the socket backlog to zero: the next two actual JSON ticks both carry `throw: false`, host inventory still holds the Power Clam, and no thrown ball exists.

This isolates one actual input plus injected backpressure. It does not claim a measured frequency in live matches. Permanent oversized-event handling belongs to the separate sender repair and is not used as a recovery precondition by these sidecar tests.

## Minimal runtime change

Save the current follower actor while forming `rki`, call the existing broadcast once, then clear that actor's pending edge only when the returned value is exactly boolean true. Return the original value. A false, absent, nonboolean, or thrown result cannot consume the edge; the existing finally block restores the temporary broadcast wrapper. The next ordinary tick uses its existing timestamp and a new monotonically increasing ranked sequence. No artificial timestamp, second packet, new queue, protocol field, timeout, or remote acknowledgement is introduced. Multiple gestures still share the existing boolean latch; this change does not queue each gesture separately.

`true` denotes local transport acceptance, not proof of eventual remote receipt. The existing controller still cancels throws for disabled, menu, dead and Turf Map states. Disposed networking still bypasses its old ranked sidecar. Host snapshot cadence remains every fourth tick.

## Regression and fixture contract

The new portable `ranked-send-acceptance.test.mjs` exercises the actual production composition, not a rewritten send routine. Its controls fixture uses `INKWAVE_CONTROLS_SITE` for exact emitted modules. The existing emitted ranked input/network job gains this test on the same production build.

- 11 source tests pass: keyboard/pad/touch × small/Power Clam; repeated refused ticks followed by one accepted host throw; 30/60/120Hz input; unavailable socket; strict boolean acceptance; exception restoration; cancellation; disposal and 4-tick host cadence.
- After recovery, host `RankedEngine.update` produces exactly one `clam-throw`, spends inventory once and creates one ball. Duplicate command delivery and the next ordinary tick do not throw again.
- Related source files pass 68/68: ranked autonomy 6, Clam event 2, Clam rules 17, input/network lifecycle 10, integration 29, network 4.
- One existing integration spy previously returned `Array.push`'s numeric result. It now explicitly returns true after recording the packet, matching real Transport's documented boolean contract. All original packet/one-shot assertions are retained.
- The original runtime fails the new acceptance tests at the lost-edge assertions. Mutants cover truthy acceptance, omitted successful consumption and omitted wrapper restoration.

The 11 new and 68 related checks are re-executed on fixed 34f; the earlier 4395 results remain separate preserved evidence. Strict read receipts bind each consumed source to the fixed official tree plus the explicit candidate runtime/test exceptions. Earlier failing logs and the original source remain preserved. The earlier 4395 input had a separate native-stage adapter anchor conflict. Pure 34f main-entry source composition now succeeds (100176 characters), independently of this sidecar. This is not a complete bundle or browser boot check.

## Pending acceptance

New exact-head emitted tests, live two-client delivery, and combination with the independently owned sender-prefix repair remain pending. Existing limits are not raised. This candidate does not repair unbounded or dropped generic event queues, guarantee 256-row payloads fit a frame, or complete the deferred Clam visual/throw animation work.
