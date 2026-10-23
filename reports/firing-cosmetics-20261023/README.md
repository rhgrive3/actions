# Shooter / Splatling firing cosmetics — candidate, 2026-10-23

Baseline: official main `726e338ac256ba9609086ce65e25a68ddd99df85`, production `inkwave-public/` composed by `scripts/inkwave-source-composition.mjs`. The prototype `game/` is not used. Open PRs at initial inspection: #1852, #1853, #1854. This branch changes none of them. #1855's Tri-Slosher `appendSourcedSplashVisuals` and shared Bucket calibration are untouched. No Work, native subagents, credentials, Nintendo media or character/hair geometry changes.

This is a **reviewable cosmetic candidate**, not certified Splatoon 3 parity or a merge approval. Retail visual acceptance and mobile hardware performance remain open.

## Reproduced production mechanisms and ownership

- Splatling: `ink-volume/recipes.mjs::captureInkVolume/submitInkVolume` selects the Shooter volume. A native Heavy Splatling round at age .05 s had `vis=.086`, speed about 129 units/s, `MaxLengthFrame=3`, and three volume parts / 7,388 triangles. Its old rod can span about 6.4 world units. The three-frame source tail record is not a recovered retail mesh dimension. Jumping changes perspective and trajectory, but does not justify scaling paint or collision.
- Shooter: the claim of zero implementation is not established. Native `FX.muzzle` already spawns droplets, and `s3-projectile-shapes::fireInk -> sheets.specks` adds five more. Before images show a conspicuous flash/sheet with small surrounding specks. The requested additional readable, short muzzle beads are therefore implemented separately from those existing effects. The ordinary Shooter rod and all existing effects remain intact.

Four production paths: new `firing-cosmetics-adapter.mjs`, new `runtime/splatling-cosmetics.mjs`, new `runtime/shooter-muzzle-droplets.mjs`, and one terminal composition connection. No edits to `projectile-presentation.mjs`, `projectile-visuals.mjs`, `s3-projectile-shapes.mjs`, `s3-ink-sheets.mjs`, native weapon code, shared FX behavior, or volume recipes.

The Splatling adapter bypasses the old volume and history body for this family and submits one rounded, tapered bead to the existing glossy instanced mesh. Radius .052, maximum tail .72 world units, and the preserved 65-unit far cull are **provisional INKWAVE presentation choices**, not Nintendo values. Position/direction come from the unchanged native round. Standing, jumping, camera distance and aim do not multiply its world dimensions. Other weapons retain their owners.

Shooter uses 32 preallocated burst records, three beads each, life .14 s and radius .043 (also provisional). Origin is the drawn muzzle captured once, falling back to native start when invalid or over two units away; launch direction comes from the native velocity. Beads then travel independently of later movement/aim. Deterministic seed arithmetic uses no gameplay RNG. Stop expires naturally; weapon switch, death, match clear and visual disposal retire records. Max 96 additional instances, using free capacity in the existing 700-instance mesh; no new geometry, material, texture, shader or draw call. The additional beads perform no collision, hit, paint or landing callbacks.

## Validation and boundaries

- Final source component regressions: **50/50 pass**, no skips. Families have independent tests. The three former production Splatling-history tests explicitly select the history backend as unit tests; they no longer purport to describe the production Splatling owner. Slosher cases are untouched.
- Actual minified release modules: **28/28 pass**, no skips. Includes native wire serializer before/after drawing for native Shooter, Heavy Splatling, added .52 Gal and Mini Splatling; all serialized bytes and RNG counts are unchanged. This is serializer-component evidence, not a two-peer relay run.
- Direct source ownership: **20/20 pass**. Production build and startup file/dependency budget pass. `build-identities.json` and compressed original build manifests preserve the inputs and emitted output identities.
- Real Chromium + SwiftShader emitted-component browser: 24 cases = four weapons × standing/moving-jump × 30/60/120 Hz display schedules, fixed 60 Hz simulation, 240 steps each. Actual Actor, Character, Physics, FX and CPU PaintSystem; no full Game, terrain GPU paint atlas, network transport or hardware FPS claim. The harness samples WebGL renders at 15 Hz and selected captures, while calling presentation synchronization at every display edge. It is not a full-rate GPU benchmark.
- Seeded before/after comparisons assert all 5,760 gameplay records, all fire events, native projectile position/velocity/size/damage/gravity/drag/lifetime/seed, ink/charge/stream state, falling paint-drop records, paint writes, CPU grid and counts are exactly equal **within each matched cadence**. Separate rate rows are not silently conflated: small 120-Hz birth-origin differences already occur in the baseline and are identically preserved; cause has not been isolated. See `invariance-release.json` when present. `compare-final.log` pertains to the prior intermediate; release evidence is labelled separately.
- All scenarios fire, paint, and the movement/jump cases actually move and leave the ground. They stop, switch at step 170, fire the reused Shooter again at 180–185, and drain by 240. All recorded end states have zero native rounds, FX drops and additional bursts.
- Measured peak shared blobs: 7 before / 13 candidate in the earlier final matrix. Source stress verifies the independent 32-burst / 96-bead hard ceiling. Uploaded Shooter geometry/texture counts match; after Splatling usage the measured GPU-resident counts are eight geometries and two textures lower because the old volume parts are never uploaded. The CPU assets remain registered. Timings and mobile GPU/thermal performance have not been measured.

## Native Game and reference gates

Native Game views are generated by `check-inkwave-firing-cosmetics-browser.mjs`: production Practice Range, real debug keyboard/fire input, fixed 60-Hz Game stepping, matched native ages, seed, aim, camera view, saved style and colorblind palette on the final low-quality pair. They are distinct from the component views above. Initial normal-quality unseeded before and an intermediate candidate were rendered successfully, but are not a controlled pair. Some seeded bootstrap attempts timed out; failure screenshots/JSON and raw logs are retained, including two timeout snapshots where the app had reached playing before screenshot capture. No timeout counts as pass.

**Final low-quality native pair status is recorded in the companion acceptance JSON; absence or failure leaves this gate open.** Screenshots alone do not certify retail equivalence. Initial/default-quality and intermediate images must not be substituted for the final release images.

Reference target: Splatoon 3 Ver.11.3.0, ordinary Splattershot and Heavy Splatling, no gear assumptions about cosmetic dimensions. Existing repository reference records identify Nintendo's `S3 About videos 05 - Splattershot.mp4` and community Heavy Splatling imagery, but this task did not recover inspectable video frames. Public web search retrieved Nintendo's weapon article and the Game8 Heavy Splatling page; source-media access via the environment was denied with CONNECT HTTP 403. Nintendo's Japanese About page and Game8's previously recorded poster URL were attempted once each; no credential expansion, proxy or denied-source bypass was used. Inkipedia file pages were unavailable to the web reader. Thus **origin/direction/count/lifetime are documented INKWAVE choices and internal observations; no precise retail values or visual match are claimed**. Retail capture comparison and physical-device performance remain blockers to full visual acceptance.

## Preservation and reproduction

Original source preimages are in `source-backup/`. Original and intermediate runs stay in this workspace under `before/`, `component-before/`, `component-before-captures/`, `component-after/`, `component-final/`, `native-before/`, `native-after/`, `native-final/`, and `startup-diagnostic/`; raw logs retain failed runs. Selected final evidence and lossless gzip records are committed. Gzip records decompress to the raw SHA256 in the comparison summary; no Nintendo images are included.

```sh
node scripts/build-inkwave.mjs inkwave-public /tmp/inkwave-firing-release
node --experimental-vm-modules --test patches/splatoon3/tests/{shooter-muzzle-droplets,splatling-cosmetics,firing-cosmetics-wire}.test.mjs
INKWAVE_BUILT_SITE=/tmp/inkwave-firing-release node --experimental-vm-modules --test patches/splatoon3/tests/{shooter-muzzle-droplets,splatling-cosmetics,firing-cosmetics-wire}.test.mjs
node scripts/probe-inkwave-firing-cosmetics.mjs /tmp/inkwave-firing-release <out>
node scripts/compare-inkwave-firing-cosmetics.mjs <before-records.json> <after-records.json> <summary.json>
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium VIEWS=wide,muzzle-side TICKS=0,2 node scripts/check-inkwave-firing-cosmetics-browser.mjs /tmp/inkwave-firing-release <out> shooter,splatling,shooter-jump,splatling-jump
```

No main merge, force push, other PR update, or release is authorized by this candidate. Hosted CI and final visual/reference acceptance must be assessed separately.
