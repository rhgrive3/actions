# Revised Hissen source candidate — 2026-10-27

The published prefix `3c67d47ea8936f62d4f1851a28ff1a5ab276726c` received REVISE. Its eager contour load, Hissen-only demand estimate, effective-index bound and duplicate deployment binary are corrected in subsequent commits. Base remains `4ce9768e6177b19f11f17e28f086a4da36f35fcd`; the integration branch is untouched. This remains a candidate for independent re-review, not an accepted retail match.

`69fa61bee366b2b680f48618ff975e8e24d0d41d` is deliberately local-only because it contains rendered-image evidence. It is not the remote source head. Render sheets, screenshots, original media and the held Drive files are excluded from this branch.

## Corrections and exact regressions

| Review finding | Correction | Source and emitted evidence |
| --- | --- | --- |
| Eager startup fetch/registration | Contours are excluded from default boot entries/readiness. An idempotent asynchronous request starts only for equipped Hissen in an active non-attract world, or an actual Hissen local/remote birth. | Ordinary FX boot calls only Roller/Shooter. Pending contour demand does not block admitted gameplay. Attract Hissen does not request. |
| Avoidable mixed-frame omission | The existing reservation planner measures every competing volume part, including its actual frustum/LOD cost, without reserving or starting another pass. | In the 60,000 budget fixture: full demand **83,202**, 17 parts. Five Dualies sources cost **36,940**. Both Hissen contours fit at **47,784 total**, 17 active parts, zero omissions. Forced old selection reproduces **58,184** and one omission. |
| 10,001 effective triangles accepted | The unchanged 10,000-body cap now checks both base indices and the actual opaque+fringe draw-index sum. | 10,001 in one pass or split across passes rejects; the 10,000 positive control accepts. |
| Duplicate fallback deployment binary | The existing verified-byte deduplication includes the geometry-only contour slot. | One 1,335,253-byte immutable binary; the stable manifest points to it. Corruption in the third slot rejects before removing any generated public copy. |
| Bounds could include unused vertices | Generator bounds explicitly use effective drawn indices; unused vertices can be compacted without changing referenced geometry. | An unused `999` outlier does not affect bounds. The current 32-frame pack regenerates **byte-identically**. |

The new planning pass reuses `submitInkVolume` and the actual `submitComposite` geometry/frustum planner in measurement mode. Only Hissen changes tier; other families retain their recipes. There is still one global capacity/triangle budget and one begin/end boundary. If the mixed frame still cannot fit after this reduction, the existing hard caps apply; the correction does not promise unlimited visibility.

A clean fixed-prefix source worktree and its corresponding emitted build both fail all four targeted startup/demand/effective-cap/mixed controls. Revised source and revised emitted code both pass **5/5 targeted tests**. The packaging/drawn-bounds tests pass **4/4**. No workflow, permission, secret, CI trigger or external action was changed; no manual CI was launched.

## Culling, RNG and resource ownership

The existing recipe regression uses a counted nonconstant LCG (seed `0x51e39a17`, `state = (imul(state,1664525)+1013904223) >>> 0`). Both call count and state are part of the authoritative fingerprint. Contour registration consumes zero caller draws/state changes; all controlled draws preserve gameplay/RNG.

- Successful full culling produces zero instances, overflow and fallback. Low-budget culling contributes zero planned demand and produces no fallback/drop counter.
- Seven draw calls each use exactly one shared begin/end.
- Capacity one gives one active contour, four explicit omissions and zero generic mains. Zero triangle budget gives zero active volume triangles with no generic spill.
- `disposeVisuals()` leaves the FX-owned packs alive. `FX.dispose()` releases every tracked shared resource exactly once.
- An actual lazy-only FX fixture owns **zero contour bytes before demand**, then owns 70 contour data resources at capacity 128. All 70 dispose once and accounted bytes return to zero. The combined full/contour ownership control also releases all 396 tracked resources exactly once.

The FX update lifecycle is directly exercised in the regression, including active-equipment and attract conditions. A missing context import found during the unpublished browser check was corrected before this handoff.

## Net cost and limits

| Increment versus the original production paths | Revised cost |
| --- | ---: |
| Contour transport/registration if Hissen is never active | **0**; small extra code/conditionals still exist in the existing modules |
| First active Hissen, cold contour cache | **1,335,253 binary bytes**, plus manifest; asynchronous, not a boot/admission barrier |
| Decoded binary during load | **3,374,440 bytes** |
| Accounted contour renderer storage after use, capacity 51 / 128 | **3,498,472 / 3,685,736 bytes** |
| Static deployment contour binary | **one copy**, 1,335,253 bytes; previously two copies/2,670,506 bytes |
| Contour triangles/body | maximum **5,852**, unchanged effective cap **10,000** |
| Frame planning work | only once the contour pack is loaded and a Hissen body is present; reuses cached recipe state |

Decoded views become eligible for GC after registration: required attributes/indices are copied to owned renderer buffers, generated white pixels go to a tiny atlas, and readiness retains status rather than decoded data. GC timing and actual process/VRAM peak were **not measured**. Renderer accounting is not total CPU-plus-GPU memory; CPU arrays and uploaded GPU buffers can coexist.

After first use the pack persists for the shared FX lifetime, normally the page/application session. It is not automatically unloaded on a weapon change. Disposal aborts pending requests, clears lazy readiness and disposes owned resources. The request is cached, including failure, so repeated updates do not create fetch loops.

**5,852 is a measured maximum for the chosen 48x48 coverage bake, not a proven minimum defensible tier.** The existing 5F full-vs-contour comparison measured 94.2% mask IoU and retained broad holes, but no smaller-resolution/contour-simplification tradeoff was measured. The per-Hissen transport and resident cost still require scrutiny under the lightweight requirement; bounded cost alone is not automatic acceptance.

Cold first use has a loading window: while the independent contour request is pending/unavailable, the existing last-resort route can still be used if the full mesh is absent or over budget. Active-equipment prewarming reduces this window without delaying simulation, but it is not a first-shot readiness guarantee. Both-pack failure retains the bounded history approximation. Hard exhaustion can still omit main bodies.

## Actual emitted/browser receipt

Focused source and emitted commands use the existing fixtures and the same test files already selected by normal emitted CI:

```sh
node --experimental-vm-modules --test --test-name-pattern='Hissen|ordinary FX' patches/local-quality/tests/ink-volume-recipes.test.mjs patches/local-quality/tests/ink-volume-defaults.test.mjs
INKWAVE_BUILT_SITE="$SITE" node --experimental-vm-modules --test --test-name-pattern='Hissen|ordinary FX' patches/local-quality/tests/ink-volume-recipes.test.mjs patches/local-quality/tests/ink-volume-defaults.test.mjs
node --test scripts/tests/inkwave-volume-packaging.test.mjs
```

Fresh corrected emitted identity:

```
contentHash 552d24c021f4224826febf69124bc2f640378eaa7af3cff102474579f5bb74e5
inputHash   59223d17b7fa1750c77f37153ba7ba580376b66ad84fbee88fcd76d563b9e809
revision    4cb2e2ac3dd5328f122bafd9ac4ab85eff44e77b626850134e2dba0ea90688d6
```

Production modules resolve from this emitted root, without source-module substitution. Fixture data comes from that root's actual asset bytes.

An actual software-Chromium run entered Range as Shooter through trusted menu input: **zero contour requests**, only Shooter/Roller registered. A diagnostic native weapon switch followed by a production tick automatically requested the contour manifest/binary once. The game clock was then explicitly frozen/stepped for same-state captures at 5/7/9 flight ticks using the shipping camera/daylight. These are **controlled diagnostics, not natural-input acceptance**.

The 36,000-budget contour cases drew all 5/6/6 main bodies at **24,600 / 32,168 / 32,272 triangles**, with zero contour omissions or generic main spill. The one existing floor child at 9F remained in its separate blob owner. All three authoritative snapshots were unchanged; restored PNG bytes equaled production bytes. Browser/page errors were empty and eight module/asset-manifest responses matched the build manifest. Images and full receipts remain local.

Retail main-size calibration and independent spherical floor-child morphology remain unresolved. No global size multiplier, floor-drop redesign or positive-radius child removal is applied. No Drive retry, screenshot publication, new PR or integration-branch change occurred.
