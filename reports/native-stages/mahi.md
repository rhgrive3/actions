# マヒマヒリゾート＆スパ — revised source verified, placement blocked

The pinned `Vss_Hiagari04` display export is verified, but it cannot supply an honest playable Mahi-Mahi match. The two opposing banks have no directed route between them. Seven floating-object models overlap around the origin without their stage placements. The definition therefore records `placement-unavailable`, supplies no playable bounds or spawn pads, and explains the blocker in the selection menu. No bridge, float transform, water animation, or replacement geometry was invented.

## Source identity and version limits

| Evidence | Result |
| --- | --- |
| KiTrix commit | `0611f51b35c9736ee986fb2218461e2585b7875e` |
| Revised stage | `Vss_Hiagari04`, not the older `Vss_Hiagari03` |
| Stage tree | `0aa56643280cbb4271142de95ecc1d95839f5839` |
| OBJ LFS SHA-256 | `fc8f7233063cdbe7b2bd821b30cbe60e94e7a20e6a5d60ce00ce9b272232d561` |
| OBJ bytes | 29,497,521 |
| Original streams | 247,052 vertices; 188,912 triangles; 98 objects |
| Exact source comparison | Float32 positions, normals, UVs and Uint32 indices identical; maximum position difference 0 |
| Raw file verification | MTL plus all 224 PNG files match the pinned Git blobs |

The supplied 11.3.0 `SceneInfo.json` identifies `Vss_Hiagari04` as `マヒマヒリゾート&スパ(改修後)` and preloads `FldObj_Hiagari04.bfres` / `Fld_Hiagari04.bfres`. Its SHA-256 is `37b9cce349998238b86c353c151f618827220a718a0613a44ef2c64295c87d3e`. This confirms the revised identifier in that metadata. It does not prove KiTrix's extraction version, retail collision, units, paint masks, spawn coordinates, or rule placements. `version1130Verified` remains false.

Acquisition reads the shared source checkout only through `git show` and `git ls-tree`; it never changes its index or sparse checkout. The public GitHub media endpoint supplies the LFS OBJ, with its pointer size and SHA-256 checked. Every acquired MTL/PNG is checked against the pinned Git blob. Original files, derived buffers, plots and browser screenshots remain in ignored local directories.

## Placement and water investigation

The private diagnostic uses the production `NativePhysics` and `NavGraph` with source-triangle support. Its trial extent `[-76.5, -36, 76.5, 36]` bounds the two visible banks. Trial support samples `[-68, 19.58, -26]` and `[68, 19.58, 26]` hit actual upward triangles at Y=19.5. These samples are diagnostic inputs, not Nintendo spawn coordinates, and are absent from the released definition.

After excluding the distant airplane and unplaced Float prototypes from inferred collision, the diagnostic contains 63,408 collision triangles, 4,906 navigation nodes and 95 undirected components. The opposing main banks contain 2,253 and 2,250 nodes. Neither bank reaches the other through directed navigation. The ordinary largest-component pruning discards one bank; choosing both teams on the retained bank would hide the defect.

The OBJ has no explicit `PackPnt` / rule-layer objects and no placement-transform or water-state file in its pinned stage tree. Its seven `FldObj_Hiagari04Float*` objects retain local coordinates near the origin. The stage part manifest lists only four OBJ parts. The one actual `SeaWater` surface is background geometry at Y=13.1, X=197.72749…822.31030, outside the diagnostic playable extent. `WaterTank` names refer to frame geometry, not a playable water state. Static source preservation cannot demonstrate retail water lowering or its timing, newly exposed support, or float movement.

The anchored `sourceSemantics.nonCollidableObjectPatterns` exclude the distant airplane and unplaced Float prototypes from inferred physics. Their original render attributes and indices remain intact and active for auditing. These classifications are local inference, not recovered Nintendo collision flags.

## Behavior comparison and verification

| Behavior | INKWAVE evidence and implication | Status |
| --- | --- | --- |
| Source geometry streams and texture files | Original streams and all raw MTL/PNG bytes verified independently | Verified source preservation |
| Opposing-team travel | Actual triangle support exists on each bank; no directed cross-bank route | Blocked |
| Match spawning, 8 actors / 7 bots | No safe, mutually reachable opposing spawn placement is available | Not certified |
| Walking, swimming, wall climbing, enemy ink, jumps, paint and respawn | A complete Mahi match would depend on missing float placements and water support | Not certified for Mahi |
| Turf and four ranked rules | All five entry points reject the unavailable stage before world or match replacement | Admission guard verified; gameplay blocked |
| Online | Two real WebSocket clients and the production relay reject malformed Mahi start packets in all five rules while retaining world authorities | Admission verified; gameplay blocked |
| Minimap, quality switching, cancellation | Unavailable admission retains the current level/physics/navigation/paint/match authorities | No Mahi-world certification |
| Water lowering | Exported background water cannot establish retail dynamic behavior | Unverified; no animation added |
| Performance | Source parsing and diagnostic navigation are CPU measurements; Chromium uses SwiftShader | No Mahi match or hardware FPS claim |

Dedicated definition tests ensure that public/prepared builds cannot admit Mahi by supplying invented bounds or pads, and that the inferred object exclusions preserve original render streams. The private placement probe asserts the actual blocker. The Chromium probe checks visible unavailability, rejects all five rule requests and direct world construction, checks source gating, and reads the original OBJ/MTL/PNG through local private evidence transport. Browser-generated original buffers receive the same independent Python text-stream comparison as the Python importer.

Final verification passed: 28 native source/guard tests, with 16 other-stage private-asset checks skipped; production build revision `fbe916046c3f`; Chromium admission and all five real WebSocket guard cases, with zero browser errors or unintended source downloads. The independent auditor also rejects a same-size altered index buffer, and the prepared builder rejects `--stages mahi`. Original browser buffer and raw-file checks all pass. CPU source parsing took 792.9 ms in Chromium; diagnostic navigation took 14,488.1 ms. These measurements are not gameplay frame times.

Self-review checked that unavailable definitions supply no guessed playable bounds or spawn pads, direct URL/autostart and public APIs cannot silently start another map as Mahi, the disabled row visibly explains the blocker, and incoming network starts retain all current authorities. The stage diff adds only its own files and leaves `inkwave-public/` untouched. Source-semantic exclusions preserve full render streams; the audit checks every index, rather than only triangle counts.

Numeric outcomes and exact measurement scope are recorded in [mahi-verification.json](mahi-verification.json). Shared unavailable-menu/core/online guards are supplied by the Lemuria guard branch; this stage change only adds its own definition, audit tooling, tests and evidence.

## Reproduce

```sh
python3 patches/native-stages/tools/fetch-mahi-source.py --repo /workspace/actions/.codex-stage-sources/KiTrix --out .codex-stage-sources/originals/Vss_Hiagari04
python3 patches/native-stages/tools/build-mahi-diagnostic.py --source .codex-stage-sources/originals --out .codex-stage-sources/nav-diagnostic/mahi
node --experimental-vm-modules scripts/check-inkwave-native-mahi-placement.mjs .codex-stage-sources/nav-diagnostic .browser-evidence/mahi/placement.json
node --test patches/native-stages/tests/mahi.test.mjs
node scripts/build-inkwave.mjs inkwave-public _site-native-mahi
flock /workspace/actions/.ci-scratch/native-stage-browser.lock node scripts/check-inkwave-native-mahi-browser.mjs _site-native-mahi .codex-stage-sources/originals/Vss_Hiagari04 .browser-evidence/mahi/browser
python3 patches/native-stages/tools/verify-mahi-source.py --source .codex-stage-sources/originals/Vss_Hiagari04 --buffers .codex-stage-sources/chromium-parser/mahi --report .browser-evidence/mahi/chromium-source-audit.json
```

Completion requires evidence for the placed floating objects and gameplay water states, supported opposing spawns with directed mutual reachability, then actual eight-actor / seven-bot verification in all five rules, real WebSocket paint/state agreement, ink/render comparisons, lifecycle and measured device performance. Retail hardware comparison remains required for any retail-equivalence claim.
