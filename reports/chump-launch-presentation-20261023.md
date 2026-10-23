# Super Chump launch direction: narrow private candidate

## Result and ownership

Only the Super Chump actor-event block in `patches/splatoon3/runtime/special-vfx.mjs` changes: the already accepted index-zero `balloon` row calls the existing `muzzle` recipe with world up `(0,1,0)` instead of actor landing-aim direction. Origin, size, particle pools/counts, lifetimes, colours and randomness are unchanged. No new effect, model, controller, retained lifetime or gameplay state is introduced. This is a direction correction only, not a completion of the launch animation.

The preserved base is the materialized integration source at commit `e9ba42dacd788db93ac177151bf2e98153fbe7c1`. `install.mjs:242–243` installs `installSpecialModels` and `installSpecialVfx`; no alternative Super Chump launch director was found. The relevant production chain is `all-specials.throwChumps` → accepted local `all:special` event / accepted remote replay → `Director.event` → `DIRECTORS.superChump.event` → `Director.muzzle`. The muzzle copies the direction into a cosmetic disc normal and directly computes cosmetic drop velocities from it. `disc` copies values into its pool, rather than retaining the shared vector. `SpritePool` integrates those velocities in world coordinates; shaders transform the resulting coordinates to view space. The nominal vector has unit magnitude before and after the change. Random individual particle speed after reorientation is not asserted identical.

## Retail footage inspected

GameWith special compilation: https://gamewith.jp/splatoon3/362075 . Acquired MP4: https://img.gamewith.jp/common_movies/15d5d16ad70981562fdb74c0db0b671f.mp4 . SHA256 `6e0759f3d32b8b5186656c7f87f0afd3ef8281e94e35e36336c273d8f38ffdfd`.

Independently decoded locally: 1280×720, 30/1 encoded FPS, 300 decoded frames, 10 seconds; zero adjacent identical decoded images. Indices below are zero-based decoded presentation frames, not inferred 60Hz game frames. The version, exact equipped weapon/gear, controller inputs, native recording cadence and precise activation/fire-button origin are unverified. The scene is a rear-view stationary practice-range demonstration.

- f68–75 (2.2667–2.5000s): launcher held upright, no active muzzle column.
- f76 (2.5333s): first visible bright launch-mouth streak. f77 first visible larger rising ink/decoy silhouette.
- f76–100 (2.5333–3.3333s): repeated upward launch-mouth spray and a tall rising liquid column. This is not a forward cone aimed at the landing area.
- f101–106 (3.3667–3.5333s): the bright connected mouth spray has ended; detached liquid tail travels upward. Smaller glints remain after this interval.
- From approximately f100 through f118 the held launcher changes tilt/roll. It remains visibly carried through f151 (5.0333s), and is absent at f152 (5.0667s).

Every frame f68–162 was decoded and reviewed in dense, labelled crops; sparse overview was used only for surrounding context. These images establish an upward visual emission, but not exact Nintendo particle curves, launch count or player-control lock. The candidate itself has not been rendered alongside the retail footage.

## Unresolved sustained-launch dependency

The installed composed Actor/WeaponRunner/Projectiles fixture confirms the existing implementation waits 13/60 seconds after its accepted fire edge, then authors all 12 deploy/balloon pairs and `end(deployed)` at exactly the same timestamp. It immediately clears `specialActive` and `_s3AllSpecialState`. Each world decoy retains its existing 108/60-second flight and 318/60-second total lifetime, 60 HP and 70 maximum damage. The next `Character.update` sees no special-presentation token and retires the held launcher, releasing its hidden main weapon. The `animateDevice` recoil reads a balloon mark only while that device is alive. There is no surviving Chump launch-device presentation owner in the current source.

Consequently the reference sustained column, device hold, later tilt/stow and separated visible decoy emergence are NOT fixed. Extending `specialActive` or moving launch rows would change gameplay/control/flight/network timing. Keeping its held-device hand solver or hidden weapon alive after that token could overwrite already admitted main/squid poses. A free delayed emitter with no surviving socket would not establish that the effect still exits a carried launcher. Those changes require a separately grounded lifecycle design and matched input/rendered captures. No guessed delay, player lock, projectile-count change or colour substitute is included here. This is an evidence/scope limitation, not a denied tool operation.

## Verification

Node 22.23.3 and esbuild 0.28.2. New test: 21/21 pass across raw source and adaptBuildSource → minify → compactModuleStrings fixture modes. It executes actual `Director.event`, `aim/forward`, the Chump recipe and muzzle consumer. Coverage includes actor rotation/aim and camera independence, unit nominal direction, original origin and quality-scaled counts, complete non-direction argument/RNG-draw parity, no birth on aim/end/cancel/invalid position/nonzero indices, clear/reuse, and a negative control restoring the old aim-directed cone. Actual SpecialVfxKit/SpritePool/ShapePool CPU checks run in both modes: unchanged pool capacities and mesh count, 22 puffs/27 sparks/1 shell/1 disc at q=1, world-up copied normals and velocities, camera-rotation independence, clear/reuse and ordinary expiry. No GPU shader rendering is claimed.

An independent reviewer confirmed the frozen previously emitted baseline consumer and source agree, with 15 consumer probes covering q=.5/1/2, aim normalization and yaw fallback. Their original-runtime negative control failed 13 of the 21 new test assertions as expected while eight invariants still passed. A separate preserved-source composed gameplay timeline diagnostic passes 3/3, including queued cancellation and next valid activation after the existing 635F gauge window. This diagnostic documents the unresolved ownership/timeline, not visual acceptance.

Both candidate files pass `node --check`. Source composition is byte-identical for this runtime file. Individual transformed runtime shrinks 65,514→65,500 bytes, gzip 21,483→21,480. These are per-module transformation figures, not a full-site startup/precache/admission result. Public/production pins and frozen source are untouched. Full-site, browser/GPU, paired rendered-frame acceptance, publication and hosted CI remain unrun in this lane.
