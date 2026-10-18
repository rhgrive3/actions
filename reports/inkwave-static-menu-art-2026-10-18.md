# INKWAVE: generated static backgrounds for non-battle menus

**Date:** 2026-10-18 JST

## User request
The weapon picker and similar non-battle menus do not need to keep running an 8-bot attract-mode battle behind the interface. Use the three newly generated, original game-inspired illustrations instead. Keep gameplay, team rooms, stage selection, settings and gear actions functional, and commit to `main`.

## Art assets
All are original generated illustrations, then downsampled from 1672×941 to 1280×720 and optimized as WebP (`quality=68`, Pillow). No Nintendo screenshots, fonts, audio or executable third-party assets are shipped. The three assets are installed with this patch under `patches/local-quality/assets/menu/`.

| Screen art | Size (bytes) | SHA-256 | Screens |
|---|---:|---|---|
| weapon.webp | 98,060 | e4d2e543a562e73791cf802ea5e6adbd52b196d6f3431d674698cacef1152e65 | loadout |
| lobby.webp | 165,006 | 323bb0b28e8cebf966a44f906c46ee57ba4a65d3ae3fb76bde48cf8def2c0e78 | main, mode, setup, settings, howto, credits, online |
| locker.webp | 139,390 | 6259a7cd0e0d75f369e4807eb89762dd433719657c6306d1feaa802bd2d52745 | locker |

## Design / runtime invariant
- Existing `.iw-ui[data-screen]` owns the background only for fully constructed, active non-battle menu screens. CSS `background-size:cover` respects mobile/desktop aspect ratios and uses a lightweight color/gradient for legibility. Images are requested on screen entry; no global preloading burst. Images live in the versioned, locally hosted build tree.
- On those screens, `Game._frame()` takes a lightweight path only when `G.mode==='menu'`, the active match is an attract demo, and the logical/constructed screen agree. That path polls gamepads, routes menu input, ticks the online network session, advances menus, and ends the input frame exactly once.
- The frozen attract match is not updated, no projectile/paint/FX/world/shadow/post frame is submitted, and no recurring `Showcase.render()` is called. A short offscreen character portrait job may execute **only when requested**, so the existing Gear/Locker thumbnails can still appear.
- Entry into Loadout, Locker and Online hub no longer builds the invisible 3D showroom or LobbySet. The actual Online lobby still uses its original 3D lineup and launch animation; changing wardrobe choices still updates profile data and portrait requests.
- Live matches, title/loading, online lobby room line-ups, paused live games and results use the original simulation and renderer. The real online lobby intentionally retains its multiplayer launch animations and is not frozen. Leaving a static menu restores the normal 3D path automatically.
- No gameplay tuning, weapon damage, network-authoritative physics or stages changed.

## Verification
Focused test: `node --experimental-vm-modules --test patches/local-quality/tests/static-menu-art.test.mjs`. It checks every static screen's input/net/UI update path, on-demand portraits, preservation of live/non-static screens, correct three asset references, WebP signatures and sizes, build identities, and fail-closed transforms. The full `Validate INKWAVE update` and Pages workflows provide production composition/browser validation.

No physical GPU trace or before/after frame timing has been collected here, so no absolute FPS or crash-elimination claim is warranted until device testing. This patch removes the underlying attract simulation and world render work while the backgrounds are active, by code path rather than an assumed FPS percentage.