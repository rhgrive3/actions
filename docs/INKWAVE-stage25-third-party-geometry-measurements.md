# INKWAVE stage 25: verified third-party source-model receipts

## Meaning and limitations
User-requested source acquisition means downloading *other researchers' publicly distributed Splatoon 3 extracted stage files* to reconstruct INKWAVE with less geometric guesswork; it does not mean taking the INKWAVE GitHub Pages distribution as a Nintendo reference.

Pinned source: [kirakira-dev/KiTrix stage models](https://github.com/kirakira-dev/KiTrix/tree/0611f51b35c9736ee986fb2218461e2585b7875e/stages) at commit `0611f51b35c9736ee986fb2218461e2585b7875e`. Model `.obj` stored in Git LFS, not as GitHub 130-byte pointer stubs. Map identifiers checked against [Leanny's Splatoon 3 11.3.0 VersusSceneInfo](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/mush/1130/VersusSceneInfo.json). See `INKWAVE-stage25-original-model-source-index.json`.

**The original-looking OBJ content was actually downloaded by Actions** and parsed by `scripts/audit-kitrix-stage-source.py`. It is **not** yet integrated into rendering, physics or ink ownership: these game modes in PR #1241 still use hand-authored models.

## Actual mesh receipts (GitHub Actions run #38156873949)
The root whole-stage OBJ and its multiple `_parts/*.obj` files contain overlapping faces; **DO NOT ADD** the root and part face counts as independent geometry.

| stage | whole-stage OBJ | source SHA-256 | vertices | OBJ faces | textures | model-space X/Y/Z extent |
| --- | --- | --- | ---: | ---: | ---: | --- |
| ユノハナ / `Vss_Yunohana` | 40,126,181 bytes | `c8d0e21345ff9f4eb528e699de2ad9c478af78d7284f347399cc59ab94eb4cd8` | 319,113 | 279,299 | 276 | 974.507 / 80.498 / 974.330 |
| マヒマヒ / `Vss_Hiagari04` | 29,497,521 bytes | `fc8f7233063cdbe7b2bd821b30cbe60e94e7a20e6a5d60ce00ce9b272232d561` | 247,052 | 188,912 | 224 | 4885.188 / 225.667 / 2723.843 |
| キンメダイ / `Vss_Pivot03` | 41,209,929 bytes | `ffe207e9b3d3eb4fc482ca45887fea1f1a131fdb2e2a0403535e1f281453bad1` | 361,197 | 241,259 | 232 | 1413.946 / 219.245 / 1735.523 |

Relevant *part* AABBs used as narrower reference candidates (not confirmed game-collision bounds):
- `Vss_Yunohana_parts/part_0060.obj`: X=-57.8102..48.2102, Y=-14.2..20.4367, Z=-82.5..82.5, 110,151 vertices, 88,162 faces.
- `Vss_Hiagari04_parts/part_0060.obj`: X=-76.5117..76.5117, Y=0..45.0455, Z=-69.6557..68.4398, 51,221 vertices, 43,204 faces.
- `Vss_Pivot03_parts/part_0060.obj`: X/Z extent 110.0 × 100.0, height 22.8209, 30,816 vertices, 18,200 faces. Its center and source scaling are unverified.

The broader AABBs include scenic environment, so interpreting them as playable stage dimensions is **incorrect**. `_parts/part_0060` has not yet been confirmed as the exact collision-only geometry. Material names ending in `_np` may help identify non-paintable surfaces, but must be cross-checked with placement/collision data before treating them as authoritative. OBJ units/orientation have not been calibrated to INKWAVE coordinates.

## Source coverage
23/25 original stage IDs have matching directories at this pinned KiTrix revision. `Vss_Carousel03` is only a possible alias for the original `Vss_Carousel`; `Vss_AutoWalk00` (リュウグウターミナル) is absent. This is directory-name coverage, **not 23/25 models validated for 11.3.0**.

## Next engineering gate
1. Separate battle-space meshes from background, identify source scale, axis convention, and map rule-variant placement.
2. Locate source collision and object-placement formats; never infer them solely from visual render meshes.
3. Replace existing authored terrain only after measured control points and tests agree.
4. Validate face ownership (paintable vs not), solid physics, moving parts, bots/nav, and low-end mobile performance.
5. Keep extracted proprietary OBJ/PNG outside INKWAVE public GitHub binaries pending a rights assessment. The reports store hashes, measurements and source links only.

The above metrics are measurements of publicly available third-party geometry, **not proof of a fully faithful Splatoon 3 11.3.0 stage implementation**.
