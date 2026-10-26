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
