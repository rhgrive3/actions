# PR1188: lossless production precache reduction

GitHub Actions for the merged head `2cc2d526` repeatedly failed BEFORE browser execution with
`loading-cache: production payload budget exceeded (5257421 precache, 9958187 assets)`.
The fixed production precache limit is **5 MiB = 5242880 bytes**; 14541 bytes exceeded.
The old main and the weapon-fidelity changes both keep all static runtime dependencies precached;
merely removing HTML preload hints does not change service-worker precache bytes.

**Fix:** build-only, pure-Node, checked grayscale PNG8 optimizer under `scripts/lib/inkwave-lossless-lightmap.mjs`.
The four existing lightmaps are copied to the staged production tree using PNG predictor
refiltering and zlib DEFLATE level 9. Original source lightmaps, gameplay JS, offline precache
membership, textures, palette, alpha and runtime URL paths are unchanged. Diagnostic unminified
builds still copy the original bytes.

The optimizer decodes both original and staged PNGs to compare every pixel before accepting a
smaller result. Additional tests pin SHA-256 values of source pixel arrays, independently
obtained with Pillow 12.3.0, and assert deterministic output plus CRC-fail behavior.

Measured against the committed source assets using Node 22:

| Existing asset | Old bytes | Re-encoded bytes | Savings |
|---|---:|---:|---:|
| cargo.png | 220594 | 168115 | 52479 |
| kelpline.png | 153108 | 121155 | 31953 |
| tidewater.png | 149335 | 119063 | 30272 |
| halyard.png | 63401 | 54085 | 9316 |
| **Total** | 586438 | 462418 | **124020 bytes** |

The estimated post-optimization core total is **5133401 bytes**, leaving **109479 bytes**
below the unchanged 5 MiB ceiling. These estimates depend on all other emitted files remaining
unchanged; GitHub Actions must verify exact production output before considering the issue closed.

Avoid solving the problem by raising the service worker cache limit, dropping game code,
excluding static imports, changing critical HTML hints, or sacrificing offline readiness.
