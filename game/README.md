# INKGORGE — Splatoon 3 Turf War study build (Scorch Gorge, 4 v 4)

**What it is** — A from-scratch, browser-playable 3D reconstruction of Splatoon 3's Turf War (reference Ver. 11.3.0): 1 human + 7 AI on a measured blockout of Scorch Gorge, with Splattershot, Splat Roller and Splat Charger. Fan-made technical study; not affiliated with Nintendo. No game assets are used — every mesh, material, shader, sound and line of code here is original.

**How to run**
```
npm install
npm run dev          # phone: open the LAN URL in landscape; desktop works too
npm run build        # → dist/index.html (single file)
```

**Controls**
- Touch (landscape): left half = floating stick · right half drag = aim · GYRO button = fine aim (iOS asks permission) · INK = fire (roller: tap flick / hold roll; charger: hold charge) · SQUID = swim (hold) · JUMP · V-FLICK (roller) · RECENTER.
- Desktop: WASD, mouse (click to lock), LMB fire, Shift/E swim, Space jump, Q / RMB vertical flick, `` ` `` debug panel.

**Architecture** — TypeScript + Vite + React (UI only) + Three.js (WebGL2). Fixed 60 Hz simulation separated from rendering; ink lives in GPU render targets (floor projection + wall tile atlas) painted by batched instanced procedural splat stamps, mirrored on a coarse CPU grid for gameplay/AI, with an exact GPU readback for the final turf calculation. Details: `docs/ARCHITECTURE.md`, `docs/INK_SYSTEM.md`, `docs/WEAPON_SPEC.md`, `docs/GAMEPLAY_SPEC.md`, `docs/STAGE_SPEC.md`, `docs/AI_SPEC.md`.

**WebGPU / WebGL2** — WebGL2 path implemented (required). WebGPU compute path is a documented follow-up; the `InkSystem` API is the backend seam.

**Supported mobile** — Modern iOS Safari 16+ and Android Chrome with WebGL2; auto quality tiers (LOW/MEDIUM/HIGH) + dynamic resolution; see `docs/AI_SPEC.md` → MOBILE_MATRIX.

**Known differences** — `docs/KNOWN_DIFFERENCES.md` (blockout stage art, procedural characters, no subs/specials, no Squid Surge, WebGL2 only…).

**Performance** — Budgets and tiers in `docs/AI_SPEC.md` → PERFORMANCE; live numbers in the in-game debug panel and `__game.benchmarkSummary()`; measured results are recorded in `DEVELOPMENT.md`.

**Testing** — `docs/TEST_PLAN.md`; status and fidelity scoring with evidence in `SCORECARD.md`; hand-off state in `DEVELOPMENT.md`; backlog in `TODO.md` (510 atomic items).
