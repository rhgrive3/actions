# Native Core integration after navigation optimization

This candidate composes PR #1490's frozen head `479b43f85ef4e8373449a037427777aaa38f6b03`, PR #1506's `49f40d821d82c6cd72289979ceae69776ab57bd9`, and PR #1493's existing paint-capability validation. The report merge keeps both original comparison sections. No required assertion or geometry/cache budget was relaxed.

- Normal PNG decoding reuses the already-read pixels when reconstructing a two-channel normal. Real Chromium 156 ImageBitmap/OffscreenCanvas/WebGL tests passed all seven scenarios with exact decoded and rendered output, nonblank frames and perturbed-normal negative controls. A 1024px normal uses one 4,194,304-byte pixel readback instead of two (8,388,608 bytes total). This is allocation/call evidence, not browser RSS or physical GPU memory.
- Cached texture loading checks cancellation before work, after verified bytes, after decode and after resize. Shader warmup and frame waits also check the retired world's identity before constructing navigation or publishing resources. Existing cleanup ownership tests pass.
- The existing NOC-T tessellation reduction and bounded Sorella sampling are retained. All 13 source model contracts pass without changing the geometry ceilings.
- Malformed paint capabilities cannot fall back to plain-paint or victim-blast admission. The general unauthenticated-paint issue #522 remains open; this narrower repair does not establish a full resolution.
- The original focused 68-case Core/paint/input/fixture run had five input-hook failures caused solely by an unset local Playwright browser path. Re-running those five native Chromium cases with the installed browser passed. The other 63 cases passed in the original run, and the separate model suite passed 13/13. This is not a relabeling of the failed first run.
- A real minified production build passed. Exact current candidate browser receipt: `inkwave-native-core-final-browser-2026-10-16.json` (content hash `9397ba5ab2df` prefix). The separately emitted loader entry is bound to all production native inputs; it is not an independently shipped loader/full-stage proof.

The navigation browser receipt is updated to the small-PR integrated build. Deterministic heuristic calls remain 84,329→60,509; timing variance between runs is retained and no reliable whole-game timing claim is made.

PR #1490's final-head CI and native browser acceptance remain necessary before merge. Existing physical-device and Nintendo behavior calibration limitations remain open.
