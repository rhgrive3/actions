# INKWAVE additional batch C28

Baseline main: `f31f5da439134fe49bb89018dad5557671a49c67`. Reviewed runtime source: `24e2fd7d7dedf2bdf7c4239610a1be80793d4680`.

This branch includes two new Issue roots, #204 and #570. The 26 existing fixes in #822 are already carried by remote integration #829 and are not repeated here.

| Issue | Root cause and implementation | Evidence limits |
| --- | --- | --- |
| #204 | Ordinary touch/LOW menus keep the eight-bot attract match and world backdrop running at full cadence. Accumulate elapsed time and budget only that backdrop at 20 Hz. Keep the fixed 60 Hz clock, input/menu/network pumping, live battle and desktop HIGH unchanged. | 20 Hz is an INKWAVE resource setting. Native counters prove scheduling, not hardware CPU/GPU savings. |
| #570 | CPU ownership reaches the final footprint before the visible native ink body. Submit the full native body on landing in shader mode 2; retain later ancillary spread and drips. Keep native CPU ownership, Turf and special-credit counts unchanged. Use the installed render module and explicit native quad arguments. | The native body shape is preserved; coverage of every CPU cell centroid is not proven. Submitted attributes are not WebGL pixels or physical Switch parity. |

Both Issues had no foreign atomic claim or public担当 before their C claims and read-back comments. The latest 33 Open/Draft PRs were mapped using actual diffs: unchanged head evidence was reused and 14 changed/new diffs were fetched. Paint allocation (#803), Turf projection, Charger/guide, result work and existing mobile resource fixes are distinct roots. Gameplay tuning and the network protocol remain unchanged.

Combined focused verification: 25 tests passed, comprising two paint ownership cases and 23 fixed-clock, idle, pause and menu-budget cases. The actual native #570 + #803 candidate passed eight additional cases: pooled-record reuse across 6,500 calls, opposing paint order, wall-drip lifetime, reentrant leases, all 257 faces of an oversized splat, and clear/dispose cleanup. Those candidate fixtures import the final source and the real pool adapter.

The production build passed; its complete identity is stored in `additional-100/c28-built-site/inkwave-build.json`. The startup request gate fails at 132 core plus 14 Practice Range modules. The exact f31 baseline build also has 132 core plus 14 Range modules, with an identical preload set (`C28-startup-baseline-comparison.json`). This is an inherited failure; the gate is not relaxed.

Independent final review and exact pushed source/native-candidate CI are pending. No merge.
