# Detached HUD receiver regression follow-up

Source predecessor: `3c0f0e4ece4a5722e30fed8d57ad20240d3ce696`. This batch changes test fixtures, not the application runtime.

The [native HUD constructor](../../../inkwave-public/src/ui/hud.js) owns `spIcon`; `_updCrosshair` writes it during the initial special-icon transition. The failed detached Charger and Dualies receivers did not provide that field. The separate visual-probe regression built a native receiver with sub-chip and scope fields, but omitted the icon required by the current collector's private shallow clone.

Hosted run [40938891054](https://github.com/rhgrive3/actions/actions/runs/40938891054) has three actual failed shards: 0 / job 123681981687 (six Charger cases), 4 / 123681981697 (two sub-chip cases), and 5 / 123681981851 (four Dualies cases). These are twelve distinct failed TAP cases with one receiver-construction cause; repeated final-log excerpts are not additional failures. The original hosted failures are retained and are not relabeled as accepted.

Each detached receiver now owns an icon node. The existing Charger timing, 5F/60F charge, cadence, authoritative charge/damage, Dualies state and old sub-chip failure controls are unchanged. The visual-probe positive case also verifies that the live icon remains untouched while the private icon receives native SVG. Independent Terra review confirmed these boundaries.

Node 22.23.4 source results:

- Charger before: 1/7 passed, six failed with the same hosted TypeError.
- Dualies/sub-chip before: 0/6 passed, all six failed before their intended assertions.
- Related repaired selection: 23/23 passed, no skips.
- Broader HUD/reticle selection: 153 total, 151 passed, zero failed, two existing conditional #724 reference-image/manifest skips. No skip was added or changed.
- Separate Dynamo crossfire selection: 2/2 passed, no skips. These selections overlap and must not be added together.

The added source-only #1813 control strengthens the original crossfire case: two distinct actually admitted Dynamo owners reach one controlled target, with the secondary projectile processed first. Secondary present and removed both preserve the central owner's 180 damage; changing only the copied secondary rate to one produces 360 and ordered secondary/central hit calls. Native owner cleanup and `applyHit` restoration use `finally`. This is controlled source geometry, not emitted execution, retail collision certification or an interpretation of Nintendo's internal zero sentinel.

`receipt.json` binds all four changed fixture hashes, commands' complete TAP outputs and complete hosted logs through deterministic gzip/readback hashes. The source fixture is the checkout's actual `source-fixture.mjs`, not a copied replacement. All 1,550 application inputs and 2,267 emitted artifacts remain at the earlier verified `5d8b116b9dbb` / `6c8108b2fb71` build. Exact repair-head source/build verification and required hosted CI are separate final gates; neither is claimed here before execution.
