# Rematch render-boundary observation (diagnostic only)

This branch/PR1367 is excluded from production adoption. No runtime files or native render/selection assertions change. The runtime stays identical to the previous47c1032 diagnostic build656f2be5, so this is a causal observation on that same baseline, not a claim that later main rendering changes are tested here.

The previous single run38383199698 passed three cycles, but all three CDP traces reported dataLossOccurred. They show native frame callbacks lasting13.6–15.5 seconds, with synchronous GetProgramiv waiting on the GPU command buffer. GPU-side context switches and WebGL command flushes also take seconds; those waits cannot all be labeled shader compilation. The standard newer-runtime failure11814447327 still rejects the original strict ring gate. A passing diagnostic is not resolution.

A source-only counterfactual using actual composed Game._frame/native Menus methods passes30 controlled cases. Moving Menus.update before rendering advances logical ring activation but does not yield the synchronous main-thread task; it cannot by itself promise earlier CSS paint. This branch does not adopt that reordering.

## Targeted observation

The existing opt-in render-diagnostic job runs the same native three-cycle rematch flow and strict30-second focus poll. Instead of the high-volume whole-browser CDP trace it uses bounded synchronous call records from the actual game's existing renderer and GL context:

- Game._frame and _warmCharacters; world, showcase, shadow and renderer calls; Menus.update.
- getProgramParameter includes exact pname, program identity, return value and duration; linkProgram/getProgramInfoLog establish nearby compile/first-use work. Long GL calls include their JS caller stack.
- Native receiver, arguments, result/promise identity and thrown error are preserved. No extra render, GL query, style read, animation seek, timer, frame or artificial CPU delay is introduced.
- Each HOME→touch gate→keyboard gate window holds at most25,000 detailed records. All-call aggregates survive overflow; dropped records and observer errors are explicit. The diagnostic completeness check fails if any detail is dropped, wrappers are absent, or no native frame is observed.
- Readback occurs after the original strict results are recorded. If touch fails, its existing screenshot may affect later keyboard compositing; later success remains intervention-contaminated evidence.
- compileAsync timing covers its synchronous invocation only. It does not measure promise completion or hardware execution. Pre-call clock/state reads also have nonzero observation cost and could throw if those normally plain reads fail; this is not a fully non-interfering observer. Wrappers/timestamps/long-call stacks still add overhead, so timing is observational rather than a benchmark or physical-device equivalence claim.

Seven focused tests cover nested attribution, no additional native calls, inactive transparency, promise/throw/receiver preservation, overflow disclosure, restoration ownership, standalone browser serialization and a SHA256 fence on the unchanged original strict poll. Existing diagnostic tests remain mandatory in the same one-job route.

Actual hosted evidence is pending. The next result must report its exact source/build identity, complete observation counts, pname/caller attribution and original strict gate outcome before a minimal product or fixture correction is selected. No Nintendo frame/timing value is inferred from SwiftShader evidence.
