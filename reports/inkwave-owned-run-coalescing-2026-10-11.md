# Exact owned-rectangle coalescing candidate

Based on adopted main d1ad48d1c10b5ded6a4fe273fe953e49e8bd7b04 (same tree as local295cb3b). No held wall-drop or codec candidate included.

## Redundancy
Network paint growth clips its shader submission to CPU event-ownership runs. The current iterator emits one rectangle for each contiguous row interval, even when the immediately preceding rectangle has identical x bounds and a touching y edge. Their union equals one taller rectangle. This candidate merges only those exact-equality neighbors. Holes, alternate ownership, different x bounds and non-touching y coordinates remain distinct. Cell ownership, HLC, score, growth time, stamp generation and network rows are unchanged. The existing Float64 scratch storage is reused; no cache or retained map is added.

## Verification
Four source regressions pass: solid rows/atlas padding; holes/checkers/partial clipping;220seeded fractional grids with exact union comparisons at every partition boundary and interior; actual installed PaintSystem owner changes and clear. Production-built focused coalescing/temporal-ownership/hidden suite passes19/19. A source-only native30stamp/120tick comparison retains identical grid and counts while submissions reduce12524→10496. Its single Node duration is not a browser performance claim.

An added required real-WebGL oracle compares the full atlas bytes with an immutable unmerged row iterator, including floor/wall, three seeds, line/shot/roller, stretched coordinates and enemy overwrite. It must show zero differing bytes and fewer native quad submissions in both source-composed and actual built modes. It has not run locally because the environment cannot launch Chromium. Existing ownership/mask/network browser gates remain required. Adoption needs exact-head CI and same-runner production workload measurement; neither full-game FPS nor retail-stencil fidelity is claimed.
