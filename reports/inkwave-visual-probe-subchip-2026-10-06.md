# Restore the private visual probe's native sub-chip DOM

Target8685222bcc78081651f8da6b293695d3e4b76d99fde. Active job112473434075 passed WIPEOUT and then failed in inspectSplatlingStages → HUD._updCrosshair with `Cannot set properties of null (setting innerHTML)`.

The private probe constructed subChip as an empty div. Current Kit presentation updates the native i/b children on the first crosshair frame. The real HUD constructor creates those children; the private probe did not. The fix deep-clones the actual native subChip, preserving private DOM ownership and the fresh private cache. Runtime markup, Kit costs, ring/visibility/negative assertions, live HUD and restoration remain unchanged.

Two focused source cases execute the existing probe assignment and actual composed HUD method. The old empty div reproduces null.innerHTML; native constructor markup plus deep clone permits all four existing charge/stream stages and leaves live icon/text/identity untouched. The tested S3 adapter is byte-equal to fresh5222. Browser geometry, screenshot and exact-CI acceptance remain with the unchanged existing probe. Node syntax also passes; no full build or browser was run here.
