# Rematch material/program handoff: bounded lifecycle candidate

Investigation baseline: `18ce7b6c8b4c612f289787332b6be65862f34bea`. Final composition parent: `d6285dca498b147575a8b4d3ad0b7231440eb4e9`, retaining the reviewed input, bomb and native CPU corrections. This candidate preserves material program references through replacement menu-character warmup and prevents disposed characters resuming resource creation after their optional motion-loader await. It does not establish a measured reduction in hosted GPU stalls.

## Evidence

The completed #1367 diagnostic (`9ff169c9`, run38411820312) recorded three strict rematch cycles with zero dropped observer events. Three's first ACTIVE_UNIFORMS reflection blocked for3.5–8.6seconds. Source inspection identifies an ownership seam: disposing old owned materials can release the last native program reference before distinct replacement materials acquire the same key.

A CPU probe using composed native Character materials and Three's real getParameters/getProgramCacheKey/prepareMaterial found53 material uses and18 keys equal across old/new shooter characters; the warm-to-live and alternate non-XR HDR-target controls did not change keys, while screen-target switching changed29 uses. The renderer/light/environment/capability inputs are fixtures, and optional source-motion import falls back in that VM. This does not prove exact hosted variant equivalence. These materials invoked no ShaderMaterial release hooks, so custom source-stage cache churn is not established for this fixture.

## Correction

The bridge collects only explicitly owned Character materials. Native Match disposal still immediately removes gameplay actors/roots, skeletons, geometry and subscriptions. Only requested material disposal is delayed. Temporary own-property disposal interception ends synchronously in finally; a native dispose observer prevents a later outside disposal from being delivered again at retirement.

Setup and start each retain the native call order and have a conservative renderer-instance guard. Unexpected rendering or compilation releases old materials before forwarding the call. Replacement material identity is checked after each phase. Reusing the same material object forfeits cache retention and disposes its old program references before replacement initialization. Distinct material objects can share the retained native program.

Release covers warm completion/rejection, synchronous errors, supersession, match/world/theme/palette changes, context loss and an8000ms fallback timer. The native _warmCharacters Promise itself also races its jobs against8000ms; its completion is not proof that every GPU operation finished. Timers may run late during a blocked main thread.

Character.warmAll now checks its existing disposed flag on entry and after awaiting the optional motion loader. A disposed character does not build new tier/dither resources or compile; a live replacement sharing the same loader still warms. No loader-cache sharing is changed.

## Bounds and limitations

There is at most one holder generation and512 distinct retained materials. Overflow disposes immediately. These are structural limits, not a GPU-byte or hard elapsed-time bound. Materials retain referenced texture/uniform values and may indirectly retain objects through listeners; those bytes and indirect references are not measured here. The holder does not explicitly capture old Match/Actor objects.

Repeated native disposal requests for the same owned material coalesce into one deferred event. Arbitrary external listener call multiplicity is therefore not preserved. Deferred cleanup exceptions are warned while remaining records are released. The correction is not a global Material.prototype override.

## Verification

- Focused source25/25 and emitted25/25; no skips.
- Exact18ce emitted Game/Character methods through the same loader yield two expected failing controls: distinct replacement relinks rather than reuses its native program, and disposed pending warm still compiles. The candidate helper remains loaded only as test scaffolding for that explicit old-runtime control.
- Existing adjacent source191/191, including startup ownership, attract budget, Match retainers, quality composition, retarget transforms and all65-weapon draw controls.
- Build packaging/workflow24/24 and startup budget pass.
- Independent review of runtime freeze08d2620 reran24/24 and a native Character ownership ledger:18 owned retained materials among22 observed, exactly18 deferred native disposal events matching baseline, four shared materials not disposed, immediate descriptor restoration and zero remaining timers/listeners.

The emitted lane loads the built helper and extracts actual minified Game._startAttract and Character.warmAll/dispose methods. Their surrounding contexts are fixtures. Three WebGLPrograms/WebGLProgram and Material events are real vendored source; the renderer material-properties/dispose bridge is reproduced test code, and GL calls are stubbed. The native ownership ledger also uses stubbed compilation and optional-motion fallback. No rendered browser/hardware/GPU performance claim is made.

Final composed build content: `1d506530425de3d413f362169ef9af1f5b93df751c094a353ecd9eb8fb949779`; input: `6a4578985041b3672fd5ec52b1b8eef2924451e6c375d808028d62373825971d`.

Independent final review of the18ce-based b52fb964 tree reran25 source/25 emitted cases and the two substantive negative controls, and verified all930 built artifact hashes without a blocker. On the final d628 composition, source25/emitted25, adjacent startup/input/workflow202 and packaging9 pass; budget passes. Runtime feature blobs are identical to the independently reviewed08d freeze.

The existing source wildcard gate includes the new test. One additional post-build workflow step runs its emitted lane. Final combined-tree review, publication and exact-head CI are centrally coordinated; these local results do not substitute for that acceptance.
