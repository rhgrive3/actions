# Hissen source candidate: independent-review safeguards and cost

Candidate base: `4ce9768e6177b19f11f17e28f086a4da36f35fcd`. Initial source commits `12ac3692fd4d51f1acf8fc06971d105bfcf18d1e` and `3c67d47ea8936f62d4f1851a28ff1a5ab276726c` are published only on `codex/hissen-canonical-fallback-20261027`. Controlled render sheets, screenshots, original media and Drive handoff files remain local and are not part of this branch. No new PR or integration-branch change.

## Cost is bounded, but minimum/lightweight acceptance is not established

The independent contour pack is **eagerly fetched/loaded in every FX boot**, not only for Hissen or only after a full-pack failure. Its promise is in the existing warmup readiness barrier. Non-Hissen sessions therefore also incur the cold-cache load and resident-resource cost. HTTP/service-worker caching may avoid repeat transfer; there is no Hissen-selection gate.

| Increment versus the previous production paths | Cost |
| --- | ---: |
| Compressed geometry binary | 1,335,253 bytes, plus its manifest |
| Decoded binary during load | 3,374,440 bytes |
| Accounted contour renderer storage, capacity 51 | 3,498,472 bytes |
| Accounted contour renderer storage, capacity 128 | 3,685,736 bytes |
| Static deployment binary copies | two copies, 2,670,506 bytes total; existing deduplication covers Roller/Shooter, not this slot |
| Maximum contour triangles/body | 5,852 |
| Extra normal-frame work | allocation-free O(projectile-count) Hissen tier prepass |

Decoded pack views become eligible for GC after registration: required attributes/indices are copied to owned renderer buffers, generated white pixels are copied into a tiny atlas, and readiness retains status rather than the decoded pack. GC timing and actual process/VRAM peak were **not measured**. The renderer accounting is not a total CPU-plus-GPU memory measurement; CPU arrays and uploaded GPU buffers may coexist.

Owned contour resources persist for the shared FX lifetime, normally the application session. They are not unloaded when Hissen stops firing or the user selects another weapon. `disposeVisuals()` deliberately disposes the projectile-history backend only; the FX owner disposes the shared volume assets. Tests now verify that ownership explicitly.

**5,852 is a measured maximum for the chosen 48x48 coverage bake, not a proven minimum defensible tier.** All canonical frame XYZ bounds are preserved, and the existing 5F controlled comparison measured 94.2% mask IoU with the full mesh while retaining broad holes. That single view does not prove optimality or retail parity. No smaller-resolution/contour-simplification tradeoff was measured. The candidate must not be automatically accepted as satisfying the user's lightweight requirement merely because its cost is finite. The eager global load and persistent storage are real remaining cost concerns.

In pressure captures the contour path used roughly 25k-32k triangles for five/six bodies rather than roughly 193k for the captured five full bodies; it remains inside the shared reservation budget. This reduces rendering work when selected, but does not offset the eager transport/memory cost for users who never use Hissen. Hard exhaustion can omit main bodies; both packs unavailable still leaves the old bounded last-resort history path. Retail main-size calibration and independent floor-child morphology remain unresolved.

## Reviewer safeguards: source and actual emitted code

The existing `ink-volume-recipes.test.mjs` regression now uses a counted nonconstant LCG:

```
seed = 0x51e39a17
state = (imul(state, 1664525) + 1013904223) >>> 0
sample = state / 4294967296
```

Both call count and generator state are included in the authoritative fingerprint. New contour registration consumes zero caller draws/state changes; every controlled draw preserves them. The test also checks real catalogue projectile/paint-drop state, not only random return values.

| Check | Candidate source and emitted result |
| --- | --- |
| Full path with sufficient budget | full recipe retained, no contour fallback |
| Successful full culling | zero instances, zero overflow, zero fallback, no generic mains |
| Preselected contour culling under low budget | zero instances, zero fallback/drop counters, zero overflow |
| Shared render boundary | exactly one begin/end per draw; seven draws, seven begins/seven ends |
| Capacity one | one active contour, four explicit omissions, zero generic mains |
| Zero triangle budget | zero active volume triangles, no unaccounted generic main spill |
| `disposeVisuals()` | shared FX assets remain alive; no shared resource disposed |
| `FX.dispose()` | all 396 tracked full/contour resources disposed exactly once; 42,957,832 accounted bytes released; owned root empty |

A small metric correction ensures an accepted cull is not counted as a rendered fallback instance. It does not change geometry, reservations, gameplay, or previously captured visible shapes. No reviewer branch was edited.

Focused commands (one regression, not a repeated full suite):

```sh
node --experimental-vm-modules --test --test-name-pattern='Hissen canonical' patches/local-quality/tests/ink-volume-recipes.test.mjs
INKWAVE_BUILT_SITE="$SITE" node --experimental-vm-modules --test --test-name-pattern='Hissen canonical' patches/local-quality/tests/ink-volume-recipes.test.mjs
```

Both pass 1/1. Emitted mode printed its actual build root and this identity; production modules resolve from that root, with no source-module fallback. The test parses that root's asset bytes as fixture data.

```
contentHash 5acf4617c032e4d330302a8f48b6c6c02dd0fc6f341021eb9629e408223df419
inputHash   6bd042b71e8815adce8662d00da3f238694ee4279a6691a41861f0eb611e87fd
revision    893f8fa81b331ef8ac566cebc55ac1f0749499be0d26d4f82fa2f836adb128ff
```

The existing normal emitted CI step already selects this test file. No workflow, permission, secret, external action, or CI trigger was changed and no manual CI was launched. No floor-drop redesign or additional screenshot/render cycle was performed for this metrics/test follow-up.
