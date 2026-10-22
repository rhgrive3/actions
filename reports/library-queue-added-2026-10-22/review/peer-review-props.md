# Read-only peer review: selected prop packs and atlas font redraw

Reviewed the stable implementation-owner diff in `/workspace/scratch/1dcd5205fbb6/wt-added-ci`, beyond delivered CI commit `4ea2cd4c`. Both original queue records were read completely. This review made no production/test edits and did not repeat the owner's browser suite or root's combined build. Implementation owner was contacted directly before review; one concrete API defect was reported immediately to both owner and root and corrected during review.

## Resolved finding: public PALETTE export

The actual frozen old public `src/world/props.js` exports `PALETTE`, `PropKit` and `PROP_TYPES`. The first compatibility facade reexported only `PropKit` and `PROP_TYPES`, breaking named `PALETTE` imports at module linking. Owner restored `PALETTE` from the same core module. Final source inspection confirms the complete three-name facade, and the owner added an exact `Object.keys` public-export comparison plus same-core `PALETTE` identity/value checks to the browser verification. No unresolved blocker remains from this finding.

## Remaining review

- The old synchronous `props.js` entry still eagerly registers the complete ordered public catalogue before returning exports. It shares the core PropKit class/PALETTE/PROP_TYPES object, retains exported Marina/Cargo placement names through reexports, and does not turn the public API asynchronous. The game uses a separate runtime entry.
- `props-core.js` retains native builders, template/material/geometry ownership, writable per-kit atlas Canvas/Texture, placement replay, headless behavior and disposal. Cross-kit writable Canvas/Texture sharing was appropriately not introduced.
- Lightweight Marina/Cargo placement descriptors are separated from their builder implementations. The cold game graph no longer reaches optional Marina/Cargo builders through dressing/murals/stage data. The smaller Cargo mural implementation intentionally remains eager to preserve the synchronous public `setStage` API. Range registration remains small/eager.
- Selected pack inventory uses actual placement types, fixed pack order and native ESM module memoization. All requested imports complete before synchronous registration. A failed import writes no registry; a canceled `current()` returns before registration. Existing loaded packs are idempotent.
- Registration transactions restore added definitions, spinner templates, registered-pack metadata and the public catalogue on failure. Existing definitions cannot be overwritten by ordinary assignment through the per-pack Proxy; same-pack newly added definitions can still be wrapped/reassigned, which existing packs require. No asynchronous source-pack registration callback was found. This is a trusted source-pack mechanism, not an assertion of sandboxing arbitrary external JavaScript callbacks.
- Actual final composed `_buildWorld` source was generated and inspected. The preparation await is after world/flow identity capture and before same-layout/native branching, detached props construction or old-world teardown. Ownership is checked again immediately after the await. A stale stage does not register when its import completes; superseding builds still own publication and existing detached resource cleanup. Native IDs select no legacy placement pack, then retain the existing native-world branch/fallback. The final boot import obtains both class and preparation function from one awaited runtime entry, preserving prior boot await topology.
- Source/site relocation is explicit for `prop-packs.js`'s practice import. Existing descriptor imports retain their published relative paths. Optional builders stay in revisioned output/offline discovery while eager HTML hints for those packs are suppressed. Root still owns actual combined immutable module graph/offline/browser verification.
- The font generation increments only when the font-ready continuation can alter atlas drawing. Each kit records generation after an actual draw. Successful first font completion redraws the fallback once; resolved warm promises skip duplicate drawing; unavailable/failed fonts retain fallback pixels without redundant redraw. Resize still calls the owned redraw and disposal prevents late continuation drawing. No RNG or geometric changes were identified.
- Direct-source ownership audit/tests were updated for the core and extracted descriptor owners; no permissive adapter-anchor or immutable-source bypass was found.

## Evidence and limits

Review-specific work was source/diff/call-graph inspection and generating the actual composed main source to verify the new await's final position. The supplied browser script was read: it covers cold module requests, selected import failure/cancellation, geometry/colliders/animation across five stages, public catalogue/order/export identity, 100 registration transitions, transaction failures, actual Canvas pixel equality, delayed successful/failed/unavailable fonts, resize disposal and escaped writable handles. These are owner's executions; this review does not independently claim their pass receipt. New preparation cancellation/reentry was checked in the source ownership path rather than by repeating broad browser runs. Existing flow tests exercise prior asynchronous lifecycle boundaries.

Final reviewed SHA-256s (uncommitted implementation snapshot):

| File | SHA-256 |
| --- | --- |
| `inkwave-public/src/world/props-core.js` | `72e347b4c0560eef8a3c8007329fc1e89882ac629c68df37bef4d7877a7b5eb3` |
| `inkwave-public/src/world/props.js` | `3892caf1a82c952649dc7e31ff47ff86af7abe3753917d861338c7e9d795c48c` |
| `inkwave-public/src/world/prop-packs.js` | `0d980c6e9f5377c0b7f3235a4ba7e8e7668ebc9cfe8d103e2517268f41f9596c` |
| `patches/reliability/start-adapter.mjs` | `8cd4c7df67395bf6edcb3f2a7748f874eba25c541b163c54f5ad4205e2083e28` |
| `scripts/check-inkwave-selected-prop-packs.mjs` | `0d301dcbef8a0dae26542980466d44802ef23de55c889ba36ad808d4aecb3ca3` |

No additional concrete blocking defect found. Approval is scoped to this source review and the resolved export regression; combined production build/browser validation, iPad/Android/offline installed-PWA/device timing measurements and publication remain owned by root. No retail/FPS/network-transfer or GPU-upload measurements are inferred.
