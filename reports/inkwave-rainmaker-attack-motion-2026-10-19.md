# Rainmaker attack presentation, 2026-10-19

## Baseline and boundaries

Baseline: rhgrive3/actions main `3839b61a6c6c4d5ac998b82168f37b802bc55099`.
The 48 d9-to-3839 changed blobs and complete source/data closure were checked
against the official Git tree. No unpublished PR1604 squid changes are included.
The PR1622 remote shield-hit fix remains untouched. No human geometry, hair,
projectile/collision parameters, damage, rule time or network message is edited.

Changed runtime paths only:
- `runtime/ranked/rainmaker-motion.mjs`: read-only rule-state pose calibration.
- `runtime/weapon-handoff-motion.mjs`: use its existing last pose owner before
  native pose application, then replace the native support-arm IK exactly once.
- `runtime/ranked/rainmaker-model.mjs`: live grip orientation and form scale.

## Primary reference and measurement

Nintendo's official online-play beginner guide (December 2024):
https://www.nintendo.com/en-gb/News/2024/December/Beginner-basics-for-Splatoon-3-the-ins-and-outs-of-playing-online-2645154.html

The page's fifth video is `NSwitch_Splatoon3_OnlinePlayNewsVideo_05_EN`, media ID
`jhvxzfdflwt6qngjsrn7`:
https://assets.nintendo.eu/video/private/f_auto,q_auto/jhvxzfdflwt6qngjsrn7.mp4

Observed delivery: 1920×1080, container stream 60/1 fps, 15.85 s video. The local
research copy SHA-256 was
`f5372393cbc55114b73982854a6a8ced277ffdcd95017234f8a3f9c690e592fe`.
No Nintendo video, image, model, animation or extracted joint data is bundled.
The Japan guide independently links Rainmaker video `z9pp-ygwuF8`:
https://www.nintendo.com/jp/ichikara/av5ja/03.html
Its stated information date is 2024-04-01; neither guide identifies a retail
11.3.0 animation revision.

| Visible event | Video time, seconds | Approximate delivered frame | Confidence / limitation |
|---|---:|---:|---|
| Carry established | 6.017 | 361 | Pickup camera and effects obscure earlier arm transition |
| Charge / raised hold visible | 6.183–7.117 | 371–427 | Not an input-down timestamp; no exact start frame inferred |
| Full-charge flare | 7.150–7.183 | 429–431 | Bright flare obscures grip and barrel |
| Shot transition | 7.583–7.617 | 455–457 | Projectile / flash transition interval, not exact internal shot frame |
| Recoil and return interval | 7.617–7.950 | 457–477 | Peak joint angle is partly occluded; approximate return interval |

Inspection used 2-fps whole-clip contact sheet, 10-delivered-frame sampling of
6–10 s, and 2-delivered-frame sampling of 7.0–8.1 s. The container's 60 fps does
not prove 60 unique retail frames or identify game simulation frames. Timing
intervals and visual order are evidence; the joint offsets below are INKWAVE
rig calibration, not Nintendo's authored joint curves or exact frame counts.

## Ownership and timing

The existing rule supplies `charge.value`, `pending`, and `recovery`.
Full charge stays 1 s, minimum charge stays 20/60 s, shot recovery stays 20/60 s.
One-frame pending release, precharge delays, repeated-release latching, gameplay
recoil and shot events remain in their original authority owners.

- Lower carry to raised hold blends over the opening fifth of the existing
  charge, with a damped scalar to avoid cancellation snapping.
- Pending release holds raised without inventing a shot recoil on mouse-up.
- Only positive authoritative recovery drives kick and smooth return.
- Pitch calibration is 0.22 rad lowered carry, at most −0.08 rad recoil.
- At steep upward aim, smoothstep from 0.4 to 1.15 rad continuously moves the
  anchor forward by at most 0.154 and toward center by at most 0.128 world units.
  This clears the tail from the head within both arms' reachable range. There is
  no change to input aim, hit geometry or camera limits. The same upper-aim
  weight protracts the right clavicle by at most 0.10 rad, keeping the primary
  wrist reachable after a legacy-dualies idle history.
- The held model and support arm share one upright yaw-then-pitch quaternion
  function, using existing caller scratch. The previous shortest-arc +Z-to-aim
  frame could invert local up at reverse headings. The ordinary, inactive display
  retains its existing quaternion path.
- The final pose owner runs after residual native throw/flick/fidget layers.
- Source legs/accessories continue; only source upper ownership is released
  while holding the objective. The source controller restores its own choice
  on the next ordinary frame.
- The normal handoff fade is suspended while holding, and its history invalidated.
- The right grip is the existing weapon pivot. The left grip is 0.07 world units along
  the same support bar, solved with the native solver once after the right
  grip is known. The normal left solve is skipped, not repeated.
- The display and support spacing use the existing kid form scale during
  emergence. They return to scale 1 when released. This avoids an unreachable
  full-size objective while the human form is still small.

No added mesh/material/draw call or vertex. The same 444-triangle geometry is
used. Existing handoff scratch vectors/quaternions are reused, with no per-frame
array/quaternion creation. Model setup adds one reusable quaternion and axis.
Noncarriers do not acquire Rainmaker fields or trigger the extra solver. Normal
string IDs compare directly; numeric-ID canonical strings are cached on identity
change. Legacy/mixed-type ID fallbacks can still create strings: the source
allocation check is limited to frame arrays/math objects, not a claim of zero
possible allocation. The existing owner also invokes the Clams worker's exported
helper only when its active boolean is true and Rainmaker is inactive. That
shared dependency does not add another `_applyPose` wrapper.

## Verification

`ranked-rainmaker-motion.test.mjs`: pure state authority, pending-release,
30/60/120-Hz return, cancellation, opt-out/lifecycle guards, owner/frame-object
contracts and separation of Character visual RNG from gameplay RNG (eight tests).

`ranked-rainmaker-motion-actor.test.mjs`: actual composed Actor for Shooter,
Roller and dualies; two acquisitions, charge/recovery, residual throw/flick,
release/death, upward/downward aim, jump and squid-to-kid return. Checks actual
right/left grip coordinates and exactly one left-arm solve. Its fourth test awaits
the actual gzip source bank for all three families and both teams, then checks
source off/on, form return, release and source ownership restoration. Aim reaches
the actual player input limits −1.05 and +1.15 rad; the presentation wrist uses
that same range. No camera or aim gameplay limit is edited.

`tools/rainmaker-production-qa/browser.mjs`: common native GitHub QA runner,
source and native motion, both teams, three main-weapon families, authority-driven
shot, 120 keyframe PNGs: the nine sequence phases plus six isolated aim-limit poses,
with two view angles, two motion paths and before/after.
Uses production Environment, post-processing and output pipeline. Before is a
bounded main3839 overlay of the two changed existing runtime modules on the same
emitted candidate, not a full independent historical main build. No external
Nintendo assets are loaded by QA. New nonholder Actors must have identical ordinary pose, visual RNG count,
opacity, source ownership and solve counts. After a holding history, opacity,
source ownership and solve counts must restore; stochastic pose differences are
recorded with both RNG indices, rather than hidden with a constant RNG. Grip reach and one-solve limits fail the run rather than accepting a gap.

### Observed CPU results before native browser acceptance

- State, model and existing Rainmaker rule suite: 34 passed.
- Actual Actor motion suite: native three families, the real-source
  six-family/team matrix and one catalogue representative of each of 11 families. Maximum right attachment error: 0 world units. Maximum
  native support error: 9.158142264140266e-5 world units (dualies during form
  return). Maximum loaded-source support error: 7.065416064076988e-16 world units;
  maximum loaded-source reach deficit: 0. Exactly one left solve while active.
- Face/chest clearance: all six native and all six loaded-source cases passed.
  Each case samples 90 frames through carry, raised hold, full recovery and return,
  and tests the selected 12,462 skin/cloth faces against all 444 objective faces
  at four event frames plus the worst vertex-clearance frame when distinct.
  All selected face intersections and enclosed head/chest vertex counts were 0.
  The minimum head vertex-to-surface clearance was 0.02317415884430036 world units
  in the native Roller case; minimum chest clearance was 0.10545886011757426.
  Loaded-source minima were 0.04482834936706195 and 0.10775730173077476 respectively.
  These 90-frame samples use the recorded near-level aim sweep.
- Added camera-limit surface gate: Shooter/Roller, both teams facing opposite
  headings, native/loaded-source, carry/charged/recoil peak, at −1.05 and +1.15
  rad. All 48 isolated snapshots pass the same all-objective-face intersection
  gate. Native minimum head/chest vertex distances: 0.010024715640236097 /
  0.011672512894111716 world units. Loaded-source: 0.004604982240056855 /
  0.011650343305756402. These cover the specified poses, not every continuous
  gameplay combination or every catalogue model.
- Catalogue grip/reach gate: one representative of each of the 11 families,
  native/loaded-source, carry/charge/recoil, lower/level/upper aim. All 22 cases
  passed, support error at most 1.13427040475333e-15 world units, left and right
  reach deficits 0. The elbow-bend projection on the existing pole direction
  remained positive (minimum 0.013190418875053027), with exactly one left solve.
  Team/heading alternate across representatives; this does not claim every weapon
  variant or full-face clearance for all 11 families.
- Quaternion math gate: 73 headings across a full turn at five pitches, ±π seam,
  near-vertical aim, unit rotation, aim-forward alignment at zero presentation
  pitch, nonnegative local-up projection, and continuous anchor thresholds.
  Both display and support call the identical function.
  Geometry remains 444 triangles, 15,948 bytes.
- Clams shared-owner integration: the Clams worker reports 16 Clam/contract,
  19 ordinary-bomb tests passed, plus unchanged nonactive outputs, one native
  pose call and no extra wrapper over 10,000 calls in each of three modes.

No physical meter conversion is assumed for project world coordinates.
The small recoil reduction and chest-follow anchor calibration were needed to
clear the native Roller head and loaded-source ToHuman shoulder reach. These are
visual calibrations; no authority timing was adjusted to make the tests pass.

### Visual RNG and restoration qualification

`inkwave-public/src/game/character.js:58` defines a per-instance `mulberry`
closure. The constructor derives its seed from the character name at lines
410–414. Actor construction passes appearance/name, not a shared generator
(`actor.js:51`). Weapon spread independently calls `Math.random` in
`weapon-edgecases.mjs:96–112`. No runtime/src consumer obtains `character.rng`
or `ch.rng`; consuming visual draws cannot advance gameplay random state.
The pure regression advances one private generator 1,000 times and confirms
another generator remains identical to its reference and global random is never
called.

The objective replacement sets native left IK to zero before the final support
solve. Native `_applyFingers` therefore can skip the conditional left-regrip draw
at character.js:3357. The post-hold blink/idle sequence may differ, although the
normal pose owners have returned. A deterministic CPU before/after history
observed source draw counts 70 versus 69 after release, while both new nonholders
used 3 draws with identical pose. Native cases used equal counts and equal pose.
Those numbers are one recorded fixture, not a universal bound.

Browser QA preserves the actual name-seeded Character generator and records every
post-construction draw index, frame and value. It does not replace the generator
with a constant or claim post-hold stochastic poses are universally identical.
Post-hold pose deltas are retained alongside owner/opacity/solve restoration.
The ordinary cross-mode probe is a normal throw event while Clams mode is active;
the Clams suite separately covers successful clam throws and its active helper.
Global fixture randomness is separately fixed for reproducible environment setup.

Initial reverse-heading surface measurements were discarded: that fixture set
body yaw without setting aimYaw, and Actor.update recomputed aimDir from aimYaw.
The final gate assigns both yaw owners and verifies the consistent aim direction.
Intermediate forward-only trials that cleared the head but overreached an arm
were rejected; their failed results are not final acceptance evidence.

### Projectile presentation boundary

The unchanged combat owner starts the authoritative Rainmaker sphere at event
actor position + [0, 1, 0] (`ranked/combat.mjs:159–162`); it does not consume the
model's muzzle socket. The display already has a distinct muzzle point. QA now
records muzzle-to-authority-origin distance and model-forward-to-aim angle in
both revisions, so that existing separation cannot be hidden. The charged,
pre-shot pose has zero presentation pitch; recoil begins only from positive
rule recovery. Camera-limit pictures freeze the rule phase solely for isolated
pose inspection and are labelled `isolated-aim-*`, not continuous gameplay time.
No visual correction is fed back into projectile origin, direction, range or hits.

### Remaining evidence and diagnostic boundaries

The final CPU suite passed in both source and the bounded emitted-overlay lane
(5 tests each, including the 22 family/source cases). The exact emitted build
and actual native-browser comparison must pass the shared
GitHub QA before acceptance. This report does not claim those have already run.
The local emitted diagnostic uses main3839's verified public artifact with the
three Rainmaker source modules plus the Clams bomb-helper dependency overlaid;
it is a bounded source-module diagnostic, not a minified final candidate build.
The final source-loaded clearance test logs `sourceReceipt.requested`, `status`
and `activeAfterFrame` so the common emitted run cannot silently use a source-off
fixture. The fixture's optional `extraExports` parameter connects its RankedWorld
and objective modules to the same source/emitted module realm.
