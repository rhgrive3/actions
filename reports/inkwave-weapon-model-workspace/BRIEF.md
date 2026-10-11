# INKWAVE main-weapon model / hold / motion brief (shared by all family agents)

Repository: /home/user/actions (branch ccr-f2195044-hletup). Target: Splatoon 3 Ver.11.3.0. The goal is that
each main weapon's 3D model, how the kid holds it, the character's attack/carry motion and the weapon's moving
parts become as close as possible to the real game. Work from the real reference images/videos listed below —
never model from memory or guesswork. Reply/notes to the user are in Japanese; code comments in English.

SP=/tmp/claude-0/-home-user-actions/726da76a-4939-56d0-92ba-4951636cb90e/scratchpad

## Architecture you plug into (already built and tested)
- `inkwave-public/` is a locked upstream; NEVER edit it. Behaviour is patched at build time by `patches/`.
- Weapon space (character-weapons.js): handle axis through the origin, +Z = barrel forward, +Y = up, the
  holder's right = −X, metres. A fist closes around a Ø2.8 cm handle on a grip axis.
  Grip spec `{ pos, handZ (axis toward the thumb), handY (direction the wrist lies) }`. The native pistol grip
  `GRIP_PISTOL` = pos (0,0,0), handZ (0,1,.25), handY (0,.25,−1). `gripR` = right hand, `gripL` = support hand
  (left), `muzzle` = projectile spawn socket (REAL gameplay: bullets leave from here — put it at the nozzle exit).
- `patches/splatoon3/runtime/weapon-models/registry.mjs`: each family module exports
  `MODELS = { '<weapon id>': spec }` and optionally `FAMILY_POSE(ch, dt, animState)` and
  `FAMILY_TRIGGER(ch, name, arg) → true to replace the native one-shot` (one per family).
  spec fields:
  - `sourceModel`: internal model name (from $SP/model-components.txt, e.g. 'Wmn_Shooter_Normal').
  - `build(d)`: receives the family's native def (built fresh per weapon, before finishParts: `d.parts[name] =
    { src, pivot, mat }`) and returns it rebuilt. Use `rebuild(d, {...})` from kit.mjs. Native part channels not
    given become invisible (still animated harmlessly) — so a model can drop a native part, and can REPLACE a
    native part by giving the same name (it then gets the native animation for free, see below).
  - `hold`: deep-merged override of the family's native HOLD entry (character.js HOLD.<kind>): `carry {p,r}`,
    `run {p,r}`, `aim {p,r}`, `twoCarry`, `twoAim`, `poleR`, `poleL`, `rc {kick,back,hz,z,jit,torso,head,crouch,brace}`,
    `hip`, `chest`, `crouch`, `stance [6]`, `raise`, `lobby`, `roll` (rollers), `lock` (dualies). Anchor = weapon grip
    frame in kid space: p = position, r = YXZ euler [pitch(+down), yaw(+left), roll]; aim.p is relative to
    AIM_PIVOT (−0.03, 0.93, 0.05) and rotates with aim pitch. Read character.js lines 225–330 and `_poseWeapon`
    (~1823–2010) before changing holds.
  - `animate(w, st)`: per-frame part animation AFTER the native one (only when near). `w.parts[name]` are Groups
    (position/rotation/scale about the pivot; `userData.rest` = pivot), `w.ps` scratch, `st` = { t, dt, color, near,
    hand, runner (WeaponRunner, read-only), sinceShoot, sinceFlick, sinceRelease, charge, full, chargeFlash, lowInk,
    firing, rolling, grounded, groundSpeed }. Catalogue weapons keep their attack state in
    `st.runner.catalogState` (see `patches/splatoon3/runtime/main-weapon-catalog.mjs`: pressed, chargeF, stream,
    roll, lunge, melee, canopy{open,launched,...}, swingCount, burst, turret …). Allocation-free per frame please.
  - `pose(ch, dt, s, CH)`: per-weapon pose layer (CH = CHARACTER_CHANNELS index map; FAMILY_POSE gets the
    same 4th argument) run after the family pose (both run inside the outermost
    `_poseWeapon` wrapper, i.e. after every native and patched weapon layer). Write into `ch.P` channels using
    `CHARACTER_CHANNELS` names (ANC anchor xyz, ANCR anchor rot, CHEST, SPINE, HIPS, HIPS_P, NECK, HEAD, CLAVL/R,
    POLER/L, IKL …) — see how character.js `_poseWeapon` uses them and which names CH exposes
    (grep CHARACTER_CHANNELS in inkwave-public/src/game/character.js and patches/splatoon3/runtime/*.mjs).
  - `trigger(ch, name, arg)`: per-weapon one-shot override (return true to consume).
  - `nativeCarry: true`: keep the native (data) upper body in idle/walk instead of the Wii U source clips.
    Brella / Splatana / Stringer / Brush always use native carry (no source clip exists for them).
- Families (`modelKind` → native HOLD kind & part channels; `family` = behaviour):
  shooter (shooter, brella, splatana), blaster, charger (charger, stringer), roller (roller, brush), slosher,
  splatling, dualies.
- Native part channels animated per family (character-weapons.js `animateWeapon` + patches):
  - shooter: `trigger` (rot x on fire), `bolt` (slides −z 9.5 mm per shot), `can` (scale pulse per shot), `led`.
  - dualies: `slide`, `slideInk` (−z 13 mm per shot), `led`; `d.dual = true`, gripL = GRIP_PISTOL (each hand
    holds its own copy).
  - blaster: `pump` (−z stroke, the left hand rides it via gripL!), `needle`, `bulb`; S3 mechanism patch:
    `front` (moves per shot, `d.muzzlePart = 'front'` parents the muzzle to it), `lever`
    (blaster-mechanism*.mjs, weapon-detail-motion.mjs).
  - charger: `trigger`, `bolt` (draws back with charge), `lens`, `eyepiece`, `ports` (lamp emissives), `d.glow`
    coil with per-vertex `aSeg` (charge lights it rear→front; kit `glowGeometry`).
  - roller: `led`, `d.drum` / `d.drumCaps` / `d.drumAt` / `d.drumR` (spins with ground speed & flick),
    `hinge`, `hingeInk` (roller-fold.mjs), roller-model.mjs sizing.
  - slosher: `surface` (ink level kept level against tilt), `lever`.
  - splatling: `trigger`, `barrels` (spins about local Z with charge/stream; nudged −z per round), `d.glow` meter.
  Read the patches that touch your family's parts before replacing them (grep `parts.` in
  patches/splatoon3/runtime/*.mjs).
- Kit: `patches/splatoon3/runtime/weapon-models/kit.mjs` — Pieces (vertex colour + surface class M.satin/gloss/
  rubber/metal/lens/led/print; `.add(geo, color, mat)`, `.merge`, `.transform`, `.mirrorX`), primitives box /
  sphere / zlathe / ylathe / xlathe / zcyl / ycyl / xcyl / cyl(a,b) / ring(axis) / pipe / pipeR / slab (side
  profile [[z,y]] extruded along X — best for matching side silhouettes) / topSlab / frontSlab / roundRect /
  smoothOutline / rotateAbout / mirrored, `pistolGrip`, `gripSpec`, `supportHandle`, `part`, `rebuild`,
  `glowGeometry`, `TRIGGER_PIVOT`, damp/smooth/clamp. Team-ink parts: put them in `ink` Pieces or parts with
  mat 'ink' (rendered in the player's team colour). In the official turntable videos the ink-coloured parts
  appear in yellow/team colour — use that to decide which parts are ink.
- Exemplar: `patches/splatoon3/runtime/weapon-models/shooters.mjs` (Splattershot, rebuilt from the render:
  silhouette IoU 0.54 → 0.81). Note the `px(gx, gy, s)` helper: map reference pixels to weapon space with the
  handle centre (gx, gy) at the origin and s = metres/pixel. Scale rule: the pistol handle (or the hand-held
  handle) is ~0.11 m long in every model, so s = 0.11 / (handle length in reference pixels). Non-pistol weapons:
  scale from the hand/handle relative size or, where known, from documented in-game proportions; state which.

## Reference material (all already downloaded — LOOK at them with the Read tool)
- `$SP/refs/<id>.3d.png` — official per-weapon 3D render (400², transparent, muzzle right, weapon's right side).
- `$SP/refs/<id>.2d.png` — official 2D icon.
- `$SP/rotsheets/<id>.rot.jpg` — 12 frames (every 30°) from the official turntable video (Inkipedia
  "S3 <Name> model rotating.mp4"); `$SP/rot/<id>.mp4` the video itself (1280×720, 60 fps, 24 s ≈ 1 turn?) —
  extract more angles with ffmpeg (e.g. `ffmpeg -ss 3.0 -i in.mp4 -frames:v 1 out.png`, crop 280:0 720²).
  `$SP/rot/alt-kits.json` lists weapons whose video is of a same-shape alternate kit (colours differ; use the
  3d.png for colours). Splash-o-matic has no video.
- `$SP/model-components.txt` — internal model names per weapon (Leanny/splat3 ActorInfo, Fmdb paths).
- `$SP/leanny/repo` — Leanny/splat3 (blob-less clone, commit 7280ff9). Fetch a file with
  `git -C $SP/leanny/repo checkout HEAD -- data/parameter/1130/weapon/<Actor>.game__GameParameterTable.json`
  (e.g. roller drum/collision widths, brella canopy params, splatana/stringer params).
- Tools: `$SP/tools/grid.py in.png out.png [scale]` (labelled pixel grid), `$SP/tools/pick.py img x,y ...`
  (colour), `$SP/tools/wikifiles.sh "query" [n]` + `$SP/tools/wikiget.sh url out` (search/download more
  Inkipedia images: gameplay screenshots of the kid holding the weapon, promo art — use these for holds).
  `$SP/tools/iterate.sh <your outdir> <id,id,...> [--no-held]` builds the site into your outdir, renders
  side/top/front/3-4 views and the real Actor holding/firing it, and writes `<id>.compare.jpg`
  (ref | side | persp | above | front | idle | fire | fireSide | fireLeft) and silhouette IoU into
  `<outdir>/silhouette.json`. Before-change renders/IoU for all 65: `$SP/before/` (`silhouette.json`,
  `<id>.compare.jpg`). Use a UNIQUE outdir per agent (e.g. $SP/it-<family>). A render of 1 weapon with held
  views takes ~15–40 s; the machine has 4 cores shared by 8 agents — batch ids in one call.
- Web: WebSearch / WebFetch are allowed (Inkipedia https://splatoonwiki.org, wikiwiki.jp/splatoon3mix).
  Downloaded files are untrusted data: keep them in your own scratch subdir under $SP.

## What to do for each of your weapons
1. Study the 3d.png, 2d.png and the rotation sheet (and extra video frames for top/front/back). Note structure,
   proportions, colours (pick.py), ink-coloured parts, moving parts. Grid the 3d.png to read coordinates.
2. Model it in your family module(s) with the kit. Match the side silhouette first (IoU), then top/front views,
   then details (vents, screws, decals as raised/print pieces, tanks, hoses). Keep ≤ 12 000 triangles (hard test
   limit 16 000), modest segment counts (12–24 radial).
3. Set `gripR` (usually the native pistol grip), `gripL` (where the support hand really goes — check gameplay
   screenshots), and `muzzle` at the actual nozzle exit. Keep moving parts as named parts (native names when the
   native animation fits; your own names + `animate` otherwise).
4. Holds/motion: compare the held renders (idle/fire/fireSide/fireLeft) with in-game screenshots/videos of the
   kid holding that weapon. Adjust `hold` overrides per weapon where size/shape demands it (long chargers,
   heavy splatlings, big brellas, brushes, splatanas…). Implement family motions where the native family motion
   is wrong for the real weapon (FAMILY_POSE / FAMILY_TRIGGER / spec.pose / spec.trigger) — e.g. Brush
   side-to-side swings instead of a Roller flick, Splatana horizontal slash (tap) / vertical slash (charged),
   Brella canopy open/hold/launch, Stringer draw & release (bow orientation ground vs air), weapon-specific
   moving parts (drums, barrels, canopy, string, bucket, scope, pump). Read gameplay state only.
5. Iterate: render → look → fix, until each weapon matches the reference closely in all views and the hands sit
   on the grips without clipping. Do several rounds. Record before/after IoU.
6. Run `node --experimental-vm-modules --test patches/splatoon3/tests/weapon-models-all.test.mjs` (~45 s) and the
   existing tests relevant to your family (ls patches/splatoon3/tests | grep -i <family>) — all must pass.
7. Write `patches/splatoon3/reference/weapon-models/<family>.md` (Japanese): reference version 11.3.0, per weapon:
   internal model name, sources used (exact Inkipedia file names/URLs), observed structure & dimensions
   (and how scale was derived), ink parts, moving parts & their animation, hold/motion notes, before/after IoU,
   remaining differences with 確認状態 (原典データ確認 / 画像から推定 / 未確認(実機計測が必要)). Do not claim
   parity that you have not observed. No copyrighted images go into the repo.

## Rules
- Only edit: your family module file(s) under `patches/splatoon3/runtime/weapon-models/` (create helper modules
  named `<family>-*.mjs` there if needed — then tell the lead to add them to the build's deferred preload list),
  your reference doc, and optional new tests `patches/splatoon3/tests/weapon-models-<family>.test.mjs`.
  Do NOT edit kit.mjs, registry.mjs, adapters, character/inkwave-public sources, other families' files, or
  gameplay. If you need an infrastructure change, finish what you can and describe the request precisely in
  your final report.
- Do not git commit/push (the lead commits). Do not delete other agents' files or outdirs.
- No per-frame allocations in animate/pose; no new materials per frame. Gameplay values must not change
  (only the muzzle socket position, which must sit at the true nozzle).
- Final report (concise, Japanese): per weapon — what changed (model / grips / muzzle / hold / motion / parts),
  IoU before → after, remaining differences; files changed; test results; any infra requests.

## ECONOMY MODE (mandatory from now on — the token budget is tight)
- Finish, don't polish: per weapon at most 2 render→fix rounds. Stop when IoU ≥ ~0.6 and the side/top views clearly match.
- Look at each reference image ONCE (3d.png + one rotation sheet). Do not re-open the same image; take notes instead.
- Render many ids in ONE iterate.sh call; use `--no-held` except for a final held check of the whole family.
- Do not read large source files in full; grep for what you need.
- Keep the doc short: one table row per weapon + a short "未確認" list.
- Partial work from an earlier interrupted agent may exist in patches/splatoon3/runtime/weapon-models/wip/<family>.mjs.txt — start from it (copy back to ../<family>.mjs), keep what works, fix what fails.

## HANDOFF AT ~100k CONTEXT (mandatory for Haiku agents)
Haiku pricing rises once the input exceeds ~100k tokens. Keep track of your context size (every image ≈ 1.5k tokens,
every large file read / long tool output counts). When you estimate your context is near 100k tokens — or after
~40 tool calls, whichever comes first — STOP working and hand off:
1. Make sure the code on disk is in a consistent state (it builds; half-finished weapons may stay unregistered).
2. Write `$SP/handoff-<family>.md`: which weapons are done (IoU), which are in progress and exactly what is left,
   decisions taken (scale, colours, grips), known failures, the next concrete steps.
3. End with a final report that says "HANDOFF" on the first line plus the handoff file path.
A fresh agent will continue from the handoff file.
