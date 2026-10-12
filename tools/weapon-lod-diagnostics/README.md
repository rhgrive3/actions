# Fixed-source loading and lighting supplement

Read-only diagnostic builds. No production changes, no merger/adoption claim.

- LOD baseline main5ed08c6 vs candidate80a4e1, main models or explicitly identical205d family overlays on both sides. Real eight-Actor native warmAll loading fade ABBA, CPU long tasks/rAF gaps, completion against the real8-second ready timeout, and first post-warm far updates. Includes character tier/shader setup, not only weapon decimation.
- Model baseline main5ed08c6 vs PR1277 fixed7d8c34e, without material or geometry substitutions. Existing reference-specific front/side/rear/oblique cameras and real source-motion Actors are rendered with supported cube256 studio PMREM. A second environment uses native Environment day IBL/sun/hemisphere and native NeutralToneMapping/exposure1. It remains a direct-render, pre-postprocessing comparison; it does not claim full game poststack/screenshots.
- Original32×16 environment evidence remains preserved. Its cube8 layout was below Three CubeUV's minimum16px; the same-material width sweep in PR1287 demonstrated reflection recovery at64/256/1024 input widths.
- Shape references keep the formal variant ledger: Light Tetra sheet for visible shared geometry only; Dark target render controls palette. Explosher references are base kit.
- This diagnostic PR intentionally keeps the main model/LOD heads fixed and does not replace their general CI gates. Results must be bound to checked-out input SHA/build identities, not this diagnostic commit as a production version.
