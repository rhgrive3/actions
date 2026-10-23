# Optimization queue integration, 2026-10-23

Actions repository intake:358 unique tickets. Six agents used `gpt-6.1-sol` with high reasoning effort; the primary agent integrated and independently checked their changes. The initial reviewed baseline was `726e338`; subsequent main changes through `7e027ac` are preserved.

| Disposition | Count |
| --- | ---: |
| Implemented |295|
| Already effective in composed source |29|
| Not adopted, with evidence or an unmet precondition |30|
| Partial |2|
| Unresolved |2|

Every intake ticket has exactly one accountable owner. Delegations do not add tickets. [tickets.json](tickets.json) contains technical dispositions; [intake-summary.json](intake-summary.json) records reconciliation. Private source IDs, links and attachment bodies are excluded. These counts describe implementation and review; they do not mean every requested optimization was accepted or every issue closed.

The changes cover transport admission and recovery, audio import/lifetime management, exact motion and geometry work reuse, bounded resource retention, UI invalidation, render batching, startup preparation and CI coverage. Existing Splatoon3 Ver.11.3.0 reference values and source ownership checks remain authoritative. Reviewed repair from PR#1853 is included; other concurrent candidate PRs were inspected without merging their unaccepted gameplay changes.

Four tickets retain incomplete coverage:

- Super Chump preview allocations are reduced, but collision-query throttling remains unsafe without a collision revision.
- Stage registry/mural/placement graph deferral is partial; the synchronous complete `MAP_LAYOUTS` API remains. The later thumbnail ticket is separately already effective.
- Fizzy flight-splash painting still lacks authoritative release, landing and footprint semantics. Existing ordered paint transport can replicate valid stamps; transport is not the missing fact.
- The historical post-deploy Pages503 cause is unproven. HTTP/artifact diagnostics improve future evidence, without claiming to explain that historical incident.

Rejected proposals include a slower minimap guard, changed drying from smaller paint batches, gyro floating-point differences, direct image resize pixel differences, callback-state changes, and accessor ownership/gain counterexamples. See [Rainmaker review](rainmaker-rejected.md) and the role reports in `reports/optimization-queue-20261023/`.

Validation receipts distinguish Node logic, actual composed/emitted code, desktop Chromium software rendering, and unavailable device/retail comparisons. Software-rendered draw counts and deterministic pixel parity do not establish iPad/WebKit FPS or Nintendo executable equivalence. The sea Worker has a byte-identical synchronous fallback, including first offline boot when its optional worker graph is absent from cold precache. Final validation is recorded in [validation.json](validation.json).
