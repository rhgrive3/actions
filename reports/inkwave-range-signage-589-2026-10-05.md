# Range signage backing budget — Issue 589

The existing Practice Range always allocated a 2048² CanvasTexture source. This is an internal resource policy difference, not a Nintendo measurement. The same constrained condition already used by Environment (LOW quality or touch profile) now chooses a 1024² signage backing canvas at construction. Desktop non-LOW retains2048².

The logical atlas remains2048²: packing, font layout and margin coordinates are unchanged, drawing scales to the selected backing size. World position/normal buffers and UVs remain byte-identical across budgets. This avoids a second packing model and preserves the world-coordinate measurement labels. One texture remains shared by map/emissiveMap, one merged mesh remains, and the same geometry/material/texture disposal runs on world exit. Fonts already ready no longer cause a redundant full redraw; pending fonts repaint the live selected-size atlas once, and never repaint a disposed atlas.

Evidence:
- Native budget/lifecycle tests2/2 and actual minified2/2. LOW desktop and HIGH/LOW touch choose1024, HIGH desktop2048; every logical cell fits; position/normal/UV and cell layout agree exactly; late-font and disposed-callback cases pass.
- Old emitted build fails both new tests at2048!=1024.
- Practice Range suite28/28 passes.
- Combined560/564/593/589 build07e2919a4462; preload policy unchanged.
- Existing Range browser gate now records active LOW atlas backing dimensions/packing plus PNG for each phone/tablet/desktop case. A separate desktop-HIGH native instance supplies2048 PNG and exact geometry/material/texture disposal count, without changing the live world's settings. Existing range→Turf isolation remains.

Acceptance still pending: new browser gate, visual reading of the wall gauge/distance boards in phone/tablet world screenshots and atlas PNGs, physical heap/GPU/long-soak.1024 is an explicit project budget, not a sourced Nintendo constant. Quarter source pixels follows dimensions; no browser process-memory/FPS improvement is claimed. Quality changes apply on signage construction, using the same world-lifetime owner as before.

Pre-CI review: an atlas image alone is insufficient to accept in-world label readability. The browser verifier additionally visits the native gallery and wall travel points at each actual phone/tablet/desktop viewport, saves world PNGs and records the camera/actor pose and logical gauge/distance label sizes. Receipts explicitly mark visual review required. These captures do not replace human inspection of the labels or physical device measurements.
