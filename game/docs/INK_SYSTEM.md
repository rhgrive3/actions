# INK_SYSTEM

## Storage
- **floorRT** 1024×2048 RGBA8 — world-space top-down projection of stage bounds x∈[−30,30], z∈[−62,62] → 5.9 cm/texel.
- **wallRT** 2048×2048 RGBA8 — 16×16 atlas of 128 px tiles, one per exposed paintable wall face (origin, u-axis, v-axis, width, height registered by the stage builder; buried faces are culled).
- Encoding: R = team 0, G = team 1, B = per-splat variation (drives wet specular/roughness), A = painted.
- **CPU mirror**: `cpuFloor` 128×256 Uint8 (0/1/2) + per-wall 12×12 grid. Updated synchronously when a stamp is queued (ellipse approximation). Used for movement (own/enemy ink under feet, wall climb), AI costs/coverage, and live score. No per-frame GPU readback.
- **scoreMask** 128×256: cell is eligible iff the top-most box at that XZ has `paintFloor` (walls, grates, spawn decks excluded).

## Stamps
`StampParams { mode(floor|wall), tile, x,z | u,v, radius(m), aspect, rot, shape, team, seed }` — 1 event per hit, pooled, ≤ 4096/frame. `flush()` renders all queued stamps as ONE instanced quad draw per target (NoBlending, discard outside shape). Vertex shader rotates isotropically in metres using per-instance aspect `k`.
Fragment shapes (seeded value noise): shape 0 shooter (irregular ring 0.78–1.02 + 3 secondary droplets), 1 roller glob (blobbier 0.7–0.95), 2 charger (crisp 0.9–0.98). Roller roll strip: aspect 2.7 stamp perpendicular to motion every 0.22 m of travel → continuous strip independent of camera. Charger: dotted line along ground below the beam + impact splash.
Splash rules: wall hits paint the wall tile and, if within 1.2 m of the floor, also a stretched floor splash at the base; shooter shots drip small droplets every 3 f (60 %); expired shots paint below.

## Rendering
Stage shader samples floorRT via world XZ or wallRT via `aPaint` (u,v,tile,mode). Ink colour = saturated team colour × (0.9 + 0.2·wet), Blinn-Phong wet highlight (shininess 12–48 by wetness), fresnel sheen, hemisphere ambient + sun lambert, subtle slab grid on floors, distance fog to horizon colour.

## Scoring
Live: `updateLiveScore()` scans 1/8 of the CPU grid per tick (full refresh every 8 ticks ≈ 133 ms). Final: `finalScore()` renders floorRT to 256×512 (linear downsample), reads back, counts A>0.5 texels masked by scoreMask. Both are logged to the console at TIME UP (`[TurfCalc]`) for parity checks (expected drift < 1 %).

## Cost
Stamp pass ≈ 0.1–0.4 ms GPU; CPU stamp ≈ 2–10 µs. Memory: 8 MB + 16 MB textures (+ CPU 32 KB).
