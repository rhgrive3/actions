# Explosher ordinary UI and canvas admission diagnostic

Fixed prior head 9683b8b2b61ba1184a0d05719d48073144f56b24, run 39680900917, passed 57 Node tests and short numerical preflight. Both frame-zero captures had 441 RNG draws, 162 draw calls, 697771 triangles, 283 geometries and 47 textures. All recorded startup/shot/draw boundaries matched. This does not resolve the prior 441-versus-58 nondeterminism or establish full-frame acceptance.

Artifact 12385195742 SHA256 00e87887f067a812698ddcc851894581256d0d617e5cb0bc588a98eee944a5cd was downloaded and verified. Actual PNG inspection found an opaque yellow dotted UI-like cover, not a visible attack. The inherited driver makes every canvas visible and captures canvas.first(); native InkWipe also owns a canvas. A concrete DOM inventory is still required to attribute the cover conclusively.

This QA-only update removes the inherited visibility override, waits for normal menu/wipe completion without calling cancellation or changing UI state, requires exactly one #game-canvas identical to the native renderer DOM element, and preserves ordinary page PNGs before/after the wait plus bounded DOM inventory. Native scene clocks must remain unchanged across this wait. Capture rechecks ownership and readiness. Early game freeze and all physics/RNG/resource gates remain unchanged. The UI has its own normal animation and timeout lifecycle, independent of game.frozen.

Four local Node predicate tests and an independent read-only review passed. These are not browser or image acceptance. Only the short preflight will run; full captures, continuous video and merge remain blocked until actual normal UI and attack pixels are inspected. Runtime glitter blob 351427cd20c9726dd21c3cbe949078cbce23c81b is unchanged.
