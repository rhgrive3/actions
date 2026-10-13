# Rematch cursor compositor diagnosis (diagnostic only; do not merge)

## Unresolved observation

Main `ee9fbbab5883f20d1968e36a4b6b2faeb1f748fe`, Validate 38360605668,
UI job 115173771233 failed its third native return-to-menu visibility gate.
Artifact 11797939554 SHA-256:
`3d0611da6694116a9f42102f7e9462327167fbae571fef62b649458db5a9da38`.
The focused PLAY button and cursor were connected and aligned, but the native
180 ms opacity transition was pending, currentTime 0, startTime null, opacity 0.
The last `is-on` class change preceded the final snapshot by 16.8823 seconds;
the strict poll lasted 30.567 seconds. No browser errors were reported.

The unchanged production build on diagnostic PR #1367, head `ea57c1d957f10c1a88b1ebaafd814c444b776c83`,
passed three cycles in Validate 38373086749, UI job 115214634177.
Artifact 11802777011 SHA-256:
`7b7bd080b1966836fabc69197ce41896f90db97e6b4e328f268e0c78d8b79bb6`.
No failure screenshot/readback occurred. The third cycle still observed the
same pending opacity transition after an actual RAF, then observed it complete
without another game frame. This does not reproduce or resolve the 30-second
stall. Browser 151.0.7922.34 and build `656f2be5ffdb259bc89825a8370fe46d66ba1a76d2f76d51146ef542ed6539c8`
were identical between the two runs.

The recorded focus geometry, cursor classes, display/visibility, transition
configuration, input owner and complete on/off class sequence match. The
failed run's round-2-to-3 wall time per driver frame was 2.0759 s versus 1.0084 s
in the passing diagnostic. A single instantaneous render call/triangle count
was higher in the passing third cycle, so that counter alone cannot explain
failure. `timerWakes` is the native capped-RAF scheduling timer, not a timer
render fallback. A runner or product root cause has not been established.

## Next bounded observation

The existing `render-diagnostic` job accepts an opt-in `diagnostic_target=rematch`
only when `diagnostic_only=true`. It runs the same three native lifecycle cycles,
range lifecycle and strict 30-second visibility/alignment gates. Default full
validation and existing render diagnosis remain unchanged. This branch stays
excluded from every production integration route.

`--trace-focus` starts Chromium CDP tracing immediately before each real HOME
touch, then reads the trace only after the original touch and keyboard focus
checks have been recorded. Existing failure persistence precedes screenshot
readback; traces may include that explicitly recorded readback if a gate fails.
Subsequent keyboard behavior in such a cycle is not an unperturbed recovery
control. Tracing and the opt-in ancestor/style reads can change timing even on
otherwise successful cycles; this is not a performance benchmark.

The trace records main-thread/paint/compositor/GPU scheduler categories. It uses
`recordUntilFull`, a 16 MiB trace buffer, a 64 MiB JSON stream limit and a 10-second
budget for each trace start/stop collection operation. Browser close retains its
existing behavior. Missing streams, loss, size overflow, timeout and protocol
errors remain explicit in the receipt; a failed trace prevents subsequent
tracing rather than starting an overlapping recording. Late stream resolution
cannot write a success artifact. No CPU throttling, synthetic delay, extra game
frame, animation seeking, forced opacity or screenshot-before-acceptance is
introduced by this trace addition.

Each opt-in snapshot also records document focus, platform lifecycle state and
bounded cursor/focus ancestor visibility and animation states. These distinguish
an unobserved lifecycle blocker from a pending compositor commit. No inferred
mechanism will be treated as a fix without a controlled reproduction.

## Validation and limits

The protocol seam tests exercise chunk decoding, complete receipt generation,
data-loss reporting, missing/oversize/malformed streams, late completion, hung
start/end/IO close and strict-gate/readback ordering. These are fake-CDP unit
controls, not real browser trace evidence. Together with the existing actual
Match fixture, atomic focus-poll and timeline diagnostics, 24 tests pass.
The production source is unchanged; no new Splatoon 3 behavior claim is made.
The original failed and subsequent passed artifacts remain independent records.
A hosted opt-in diagnostic is still required to obtain and inspect actual trace
tracks before deciding on a product or verifier correction.

Primary protocol/API references:
- https://chromedevtools.github.io/devtools-protocol/tot/Tracing/
- https://chromedevtools.github.io/devtools-protocol/tot/IO/
- https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session
The pinned Playwright 1.62.1 protocol definitions were also checked locally.
