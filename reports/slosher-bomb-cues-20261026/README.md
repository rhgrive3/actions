# Slosher origin / bomb presentation candidate, 2026-10-26

Base and remote main at start: `48511150bbaeab182dd04c712d39bd5b26df18f3`.
Local branch: `codex/slosher-bomb-cues-20261026`. No push, PR, merge or CI launch.

The claimed production paths are `patches/splatoon3/projectile-visual-adapter.mjs`, `runtime/bomb-cues.mjs`, and the Slosher origin branch in `runtime/main-weapon-catalog.mjs`. `projectile-presentation.mjs`, `projectile-visuals.mjs`, `ink-volume/recipes.mjs`, `kit-subs.mjs`, `kit-autobomb.mjs` and original `inkwave-public/src/fx/fxHooks.js` were read, but are unchanged. The other workers own squid FX, Charger/Stringer and shooter/Dualies aim. Open PRs inspected: [#1882](https://github.com/rhgrive3/actions/pull/1882), [#1889](https://github.com/rhgrive3/actions/pull/1889), [#1890](https://github.com/rhgrive3/actions/pull/1890). #1882 overlaps the catalog and presentation modules; current main's existing optimization is retained. The old unpublished reticle/Wiper candidates were not applied.

## Changed behavior

- The native FX hooks used one Splat Bomb danger-ring rule for every armed bomb. Curling's release-started fuse therefore produced a ring as soon as thrown. The final composition adapter excludes Curling and Sprinkler from this warning path. Native bomb physics, trails, fuses, audio, damage and paint keep their owners.
- A Splat Bomb's warning previously cached its first arming surface forever. It now updates support when the bomb moves, reuses support while stationary, removes a stale ring over a ledge and reacquires support on return. Moving the cue does not repeat arming splash FX. Per-bomb radius/fuse comes from the existing presentation selector. Cue objects are reused; there is no extra bomb-list pass.
- Autobomb's actual `s3Auto` landing state exposes the existing acquisition radius with a thin immediate mark during initial rotation. It never starts from a wall/ceiling rebound or flight, stays at its landing origin, ends before walking, does not restart on a later ledge landing, and vanishes when the bomb is retired or cleared. The existing shader puts a thin rim at normalized radius .93; the display scale compensates so the rim represents the acquisition threshold. The existing 12.5-unit search radius is community calibrated; this patch does not change acquisition. The thin style and linear 30-frame fade are INKWAVE presentation, not newly measured retail timing/pixels.
- Dread Wringer now uses the same already-established body-relative launch origin as Tri-Slosher, including true delayed births. Camera heading and every sourced unit speed/lift/scatter/delay/range/damage/paint parameter remain unchanged. The world trajectory/contact positions intentionally change with the corrected birth height. This is an INKWAVE origin calibration, not an extracted Nintendo muzzle joint.

`origin-comparison.json` executes the immutable INKWAVE base and candidate with the actual native Character at 60 Hz, level camera, neutral fixture gear. All 16 base birth heights drift between 0.4491 and 0.7082 units above the actor as the rim swings; the candidate uses 1.05 for both streams. Velocity, seed, damage, collision radius, lifetime and catalog range are identical. This is an INKWAVE rig comparison, not original-game footage.

## Main blobs and floor-paint drops remain distinct; appearance work is incomplete

The main source envelopes already differ per family in current main. The shared Bucket artwork is an older owner-directed calibration, not evidence that Nintendo uses the same meshes. No new blanket Bucket copying or arbitrary Hissen size change is applied.

| Family | Main source draw | Separate floor-drop source draw / existing presentation | Status |
| --- | --- | --- | --- |
| Bucket | per-unit 1.2, .5625→1, .6 and per-index offsets | Native intermediate-paint owner; no catalog `sourceActor` bead override | Existing behavior retained |
| Hissen / Tri-Slosher | 1.4, .8, 1, 1 plus per-index offsets, zero companions remain invisible | .2/.3 draw radii, existing .5 cosmetic width and stored horizontal heading | Matched retail main-blob pixels and floor-drop silhouette **unverified** |
| Mop / Dread Wringer | 1.4 / 1.2 final radii with -.16/-.14 per-index taper | .3 draw radius; existing generic falling bead | Origin repaired; floor-drop silhouette **unresolved** |
| Sloshing Machine | .1 core, source-zero companions; separate spiral art | .2 source draw, existing thin-strand renderer | Retail floor silhouette **unverified** |
| Bloblobber | .16→.8 and .104→.52; independent bounce shrink | .2 source draw, existing generic falling bead | Retail floor silhouette **unverified** |
| Explosher | .7 main source draw; independent explosive art | .1 source draw, existing generic falling bead | Retail floor silhouette **unverified** |

Draw values come from the pinned Leanny/splat3 11.3.0 data already in the repository (`7280ff9cde8bb1c5dcef46c700c326471584d2e6`). They are not retail world-to-pixel measurements. Preserving the old floor drawing does not resolve the user's complaint about generic falling beads. That work and a comparable-phase Hissen main-blob measurement remain blockers for calling the whole assigned Slosher scope complete.

## Reference access and limits

The owner's Autobomb landing-scan observation is corroborated by the public [Autobomb description](https://splatoonwiki.org/wiki/Autobomb). The [Dread Wringer demonstration file page](https://splatoonwiki.org/wiki/File:S3_Dread_Wringer_demonstration.mp4) identifies the original SplatoonJP promotional video (2023-08-18, [post 1692461582390038657](https://twitter.com/SplatoonJP/status/1692461582390038657)). Its frames were not retrieved or inspected. The [Autobomb chase clip](https://splatoonwiki.org/wiki/File:Autobomb_chase.mp4) is explicitly Splatoon 2, so it is not represented as S3 visual proof. [Nintendo's S3 weapons page](https://www.nintendo.com/jp/switch/av5ja/customize/index.html) supplies descriptions, not the needed matching Hissen shot.

Execution-environment Python `urllib.request.urlopen` to `https://splatoonwiki.org/wiki/File:S3_Dread_Wringer_demonstration.mp4` and `https://www.nintendo.com/jp/switch/av5ja/customize/index.html` failed with `URLError: <urlopen error Tunnel connection failed: 403 Forbidden>`. This is a CONNECT proxy fetch failure before a site response, not an auto-review/access-policy denial. Public web text reads succeeded; they yielded no comparable encoded Hissen/Mop frames. Image search did not yield usable comparable Hissen airborne pixels. No Nintendo media is added here, and no access restrictions were bypassed.

## Verification and reproduction

- `source-initial.log`: 20/20 source tests (initial nine new tests plus existing delayed-birth / retained Autobomb tests).
- `source-new.log`: 10/10 new tests after the native Character 30/60/120 Hz case and allocation reuse check were added.
- `source-protected.log`: 27/27 source tests covering bomb paint/knockback/physics/models, contact fuse, Hissen floor-paint and main-sheet source envelopes. No full-suite run.
- `source-final-bombs.log`: 6/6 final bomb tests after compensating the existing thin shader's rim position.
- `emitted-initial.log`: 21/21 of the same targeted tests using the first newly generated production-minified site (`fb389d1f35fae188c95274bbdfee0230fd581271d8350ed6b25ac394a879dd3c`). This build predates only the thin-rim display-scale compensation; final generated verification is recorded separately.

Normal browser checker: `node scripts/check-inkwave-slosher-bomb-cues.mjs <fresh-site> <new-evidence-directory>`. It enters the Range through trusted menu/touch controls, switches weapons through the pause picker, uses real touch events, and waits for the live clock. Read-only observers record submitted cues and actual projectile draws. No debug stepping, RNG replacement, forced aim, input state, physics state or time is used. Only actual screenshots count as inspected pixels; observer/source assertions remain separate. Software Chromium is not Switch/iPad hardware proof.

### Final emitted identity and live observations

The final minified site is `/workspace/slosher-bomb-final-site`, built from implementation commit `6370967b31ac51d0f8955800cde701bdcd4c835c`. `build-verification.json` binds all 1,481 build inputs to that Git tree and verifies all 2,180 generated artifact hashes. Content hash: `a064cdee3cfe86ac6d0d370e1f7034c86c395366f77cb549224b3d47bc7ad0bc`; input hash: `57ac7fd299c02d5e8f15b787828867f4dcf6221f56f6ac84b054242d3f463ed8`. The final bomb suite is 6/6 in `emitted-final-bombs.log`; the startup gate passes in `startup-budget.log`. The final emitted `fxHooks.js`, `weapons.js`, main catalog, projectile presentation and projectile visuals have the same bytes as the earlier 21/21 emitted run; only the new bomb helper's .93 rim compensation changed.

`bomb-cue-comparison.json` executes the immutable upstream `_bombs` method inside the same current graph as a counterfactual. Upstream draws Curling's radius-7 danger ring, leaves a moved Splat Bomb's ring at x=0, and has no Autobomb landing mark. The candidate emits no Curling warning, follows the moved Splat Bomb to x=3, and emits a search mark at the initial Autobomb contact. This is executed INKWAVE evidence, not original-game evidence.

`browser-live.json.gz` retains the complete normal browser receipt; `browser-summary.json` makes the key observations readable. Chromium 154.0.8037.57 / SwiftShader, 960×640 touch emulation, original live rAF and fixed clock, trusted menu and touch events, no debug helpers or forced state:

- Curling: 177 native bomb `_draw` samples through its natural life, zero danger/scan/beep floor-cue calls. `roller-active.png` is the inspected in-game puck/ink-path image without an explosion forecast.
- Splat Bomb: 83 bomb `_draw` samples, four warning submissions. Every submitted X/Z equals the current bomb X/Z. The warning center moves 1.769685 units before stopping; it does not stay at the initial landing. `charger-active.png` was inspected; an orange rim is visible in the center lane. The receipt establishes the movement; one still is not a moving-image comparison.
- Autobomb: 90 bomb `_draw` samples. Three search marks use style 7, a visible-rim radius of 12.5, one fixed landing center, and decreasing alpha. They start during actual `scanning` and end during initial `waiting`, before later countdown presentation. The ordinary asynchronous screenshot catches the countdown danger cue rather than isolating the brief thin search rim; it is not counted as scan pixel proof.
- Dread Wringer / Tri-Slosher: 24 / 32 actual projectile `_draw` samples; all sampled physical birth heights are 1.05 above the actor. Asynchronous screenshots came too late to measure the flying heads, so they are not accepted as main-blob dimension proof.
- The engine audio state is `running`, with 45 play admissions, two dropped voices and no real-audio loader errors. This is a live engine receipt, not listening/loopback or Nintendo sound parity. No audio source was changed.
- No page errors or pointer-lock errors; every recorded menu/control gesture is trusted. All four changed/related runtime responses are checked against the served versioned artifact hashes.

The initial wall-clock-only browser attempt is not counted as bomb-cue verification: its 2.2-second wait yielded only about one second of simulation and ended before landing. The corrected checker waits for at least four seconds on the naturally advancing game clock.

A further permitted public Hissen visual source was identified at [Altema's Hissen page](https://altema.jp/splatoon3/hissen), updated 2024-01-11, with [hisen_2.gif](https://img.altema.jp/splatoon3/hisen_2.gif). Its article text is accessible, but the public web reader rejects the GIF as `400 Unsupported content-type: image/gif`; execution-environment retrieval again fails at the CONNECT proxy with `403 Forbidden`. No GIF frames were inspected or used for measurement. It does not resolve the matched phase/camera/version/gear requirement.

### Native rendered canvas readback and remaining visual limits

A final read-only observer calls the unmodified `R.render`, then saves its canvas synchronously when the **actual uploaded** ring attributes include the scan style/radius, or a live first main glob is in an early flight window. It does not alter input, aim, RNG, clock, projectile state, visibility, shaders or animation. `browser-render-readback.json.gz` preserves this separate three-condition run; `render-readback-summary.json` records the two acquired frames and hashes. No page errors.

- `blaster-native-render.png`: actual canvas readback after an uploaded style-7, radius-13.44086 scan instance. It shows the landing area at the scan stage. The low-quality orange rim is faint at the native 720×480 resolution; the image is not accepted as a retail appearance/contrast match. The uploaded instance and its pixel readback are distinguished from the much more obvious later danger ring.
- `s3-slosher-diffusion-native-render.png`: actual 450×300 canvas at first-main-glob age 0.05 s (position 3.64 units forward of its birth). This is a candidate-only early-flight image; no original matched frame is available, and it is not a width calibration.
- Dread Wringer: the narrow early-flight **presented-frame** readback condition was missed despite 24 native `_draw` callbacks. The observer did not freeze or rewind to manufacture a frame. Its live origin trace and source/fixture tests remain separate from unverified short-flight pixels.

The `mainDrawFrames` / `bombDrawFrames` fields in the compact live summary count `_draw` callbacks, which can occur on multiple fixed ticks inside one presented rAF. They are **not** a count of independently presented GPU images. Only the saved rendered canvases and inspected screenshots are pixel evidence.

The parent independently downloaded Altema's `hisen_2.gif` and verified SHA-256 `e1b283ba154b7d40b172fca9c075d661238b4f0635bc2ad499e9d917cbdfcc8d`. After real frame inspection the parent corrected its ownership: its 28 frames show squid movement and a **sub** throw, so it is not a Hissen main-blob dimension reference. With that materially new evidence, this worker made one ordinary `curl --fail --location --max-time 30` read of the exact public URL. It returned `curl: (22) The requested URL returned error: 403` and saved no file; this retry's response layer is not established from that output alone. No further retry or access workaround was attempted. Hissen main size and the non-Bucket floor-droplet presentation remain unresolved.

Remote main was re-read after verification and is still `48511150bbaeab182dd04c712d39bd5b26df18f3`. No PR, push, merge, external message or CI action was performed.

### Subsequent main-shot reference found by parent; executor fetch still blocked

After the evidence commit, the parent found and inspected actual Hissen **main** shots at [hissen1.gif](https://img.altema.jp/splatoon3/hissen1.gif), linked from the same public article: 105 frames, 320×180, parent-verified SHA-256 `87e39df0cca249e695e734a8d27585d0e9bc43b66e9744f1042c091d1c4afdc1`; the parent personally viewed frames 5 and 15. The article also links [hisen_1.gif](https://img.altema.jp/splatoon3/hisen_1.gif) under its ambush discussion. These URLs came from actual article hrefs, not guessed filenames.

This worker attempted each exact new URL once with ordinary `curl --fail --location --max-time 30`. Both returned `curl: (22) The requested URL returned error: 403`; neither file was saved. The parent's `/tmp/inkwave-reference-check` directory is absent in this executor. No escalation, proxy bypass or further retry was attempted. Thus an actual original main-shot source now exists on the **parent** side, but this worker has not inspected those pixels and makes no new calibration. The parent can continue the reference comparison using the candidate early-flight PNG and original per-phase/camera limits; this worker's Hissen size and non-Bucket floor-droplet changes remain unimplemented.
