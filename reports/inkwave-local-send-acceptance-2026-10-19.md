# Local outbound send acceptance (#1692)

Status: local candidate; actual emitted/browser and final-head CI remain pending. This does not provide relay acknowledgement or guaranteed delivery.

## Baseline and defect

The original NetMatch cleared its event array before calling Transport. A local refusal (closed socket, bufferedAmount above the existing threshold, or an oversized final frame) therefore discarded events. Reproductions used real Actor events, actual NetMatch/Transport and receiver code. Eight special producers plus actual bomb-expiry consumers produced 176 mixed rows; artificial backlog made the original sender emit zero frames and retain zero rows. Synthetic duplicate-birth capacity probes are distinguished from normal gameplay input.

## Bounded behavior

Only an explicit local `true` consumes the exact prefix. False, undefined and exceptions retain rows; subsequent existing ticks retry a smaller prefix. There is at most one broadcast per tick and no timestamp invention. Receiver sequence/life checks and duplicate suppression remain authoritative. The maximum packet prefix is 256 rows.

Transport checks both UTF-16 length and UTF-8 bytes against the existing 64 KiB frame limit after codec and ranked sidecars. An attempt-local Symbol records the rejection category without entering wire JSON. `b|` is two ASCII envelope bytes; direct send counts its actual recipient envelope.

The candidate introduces a 512-row / 512-KiB outbound backlog policy. Those numbers are reused from existing unrelated bounds, not claimed as an existing outbound contract. Row count is immediate; bytes are remeasured at send boundaries, including post-record owner metadata. Retained backlog additions are also accounted. This is not an absolute instantaneous heap cap while an event producer constructs its payload. Permanent single-event/snapshot oversize or exceeded backlog terminates the old session with the existing visible communication error. Temporary pressure alone does not terminate a single-event queue.

Synchronous codec announcements and socket callbacks can replace ownership. Session, transport, NetMatch match and session match are checked before/after packing and accepted sending. Abort cleanup additionally verifies the active global match/network/game and game-match owner after close. Old work cannot send into a new transport, remove a new queue, or abort a newly active game.

An additional existing session-close defect was reproduced independently on the unchanged 387 baseline: an error listener could replace `G.game` before the final abort notification, causing the new game to receive the old failure. Since the new queue-limit path uses this close routine, the candidate captures game/session ownership and checks it again after state/error notifications. Presentation-only state/error edits do not suppress notification. Normal close disposal and notification behavior are retained; this is a separate pre-existing lifecycle hole, not attributed to outbound prefix retention.

## Source evidence

Fixed completed baseline: `34f54381d74c844838e01c34fd13f58bc0064127`. Final combined-source check: `387ae354e0b2d90eecc3f4d1a458976e425d473d` after direct-source migration completed. The intervening `09d4e7524c62712aebe8347d3f03ba1b9ee41960` was a partial migration and failed unchanged adapter composition; that failure is retained separately.

- Portable source consumer: 42/42. The original 30 cases include eight send-owner and six abort-owner boundaries. Nine additional session-notification cases cover normal bye/error, state/error listener ownership changes and the new overflow termination path. The identity case verifies the source helper hash; its emitted-only branches still require the actual built artifact. Two same-owner state/error presentation-change controls retain the old game notification.
- Separate independent review: 44/44, including ranked sidecar interaction; removing owner guards fails all 14 owner negatives.
- Final actual network/relay regressions: 48/48.
- Independent completed-387 core regressions with the final sender, ranked sidecar and real-Transport fixture contracts: 238/238; quota controls 4/4. The final session guard also passes the 39 pre-identity consumer cases and 14 ranked cases independently. Removing the session notification guard fails seven reentrant-owner negatives. These are source CPU results.
- Ranked throw-edge correction is included as a separately reviewed hunk. Its original 11 cases are preserved; three independent sender/sidecar cases are appended for final combined acceptance.
- Actual negotiated codec retry applies 20 recorded paint splats and two jump effects once. This uses a paint-effect facade; it is not a GPU paint-area or final ranked SP-credit measurement.

The test fixture supplies the browser TextEncoder global and links the actual helper. Undefined-returning transport doubles are not globally treated as successful sends. The hidden-host relay bridge and simulation-clock test now use the real Transport with a fake socket endpoint, preserving size, pressure and boolean acceptance behavior; three bridge contract tests reject unconditional/truthy acceptance mutants. Source discovery and the existing emitted-codec job both run the portable test. Independent checks exercised actual helper staging and the manifest writer, rejected missing/modified identity inputs, and loaded a production-composed module subset exclusively through the emitted namespace with a source-fallback poison. This is separate from the still-pending official minified build and browser execution.

## Cost

Eight actual producers, 176 mixed rows, 100 warmups and five rounds of 200 sends. On the fixed baseline, median localized send cost was about 0.817 ms before and 1.009 ms after (+0.192 ms per 20-Hz send). JSON calls increase from one to two; UTF-8 encoding uses two temporary arrays totaling 77,863 bytes per measured burst. Actor/physics setup is outside timing; identical row cloning remains included. This is not an FPS measurement. Birth events come from adopted #1691 all-specials Git blob `d4e5d14fdb343aaf925d46da6f11d8f5d9203407`.

The composed NetMatch and Transport bodies are byte-identical between the completed 34f and 387 baselines for this candidate. Their surrounding source migration does not justify silently substituting different performance evidence.

## Remaining acceptance

Final emitted tests, ordinary relay browser sessions, mixed paint/credit rendering, and final-head required CI are still required. A local boolean receipt is never represented as a server or peer acknowledgement.
