# Native touch charge check on fixed integration 90bb

Target product: `90bb98c2ffbbe0fdaf959001808d6dd43e085f90`, content hash
`6a41bfa4a334910e156f484fee14e5e09f4bba5b210a18bdffbe1d53057168a5`.
This is a bounded ordinary-input check of the shipping game, distinct from the
earlier controlled audio/HUD component checks. It does not establish final-head
CI, real iPad hardware, original pixels/timing, or overall performance approval.

The initial command-namespace Chromium sandbox abort is preserved separately in
`../native-touch-attempt/`. One supported permission request then ran the installed
Chromium outside the command sandbox, with `chromiumSandbox:true`. No `--no-sandbox`,
chmod/chown, browser/OS security changes, software installation or credentials
were used. Unsafe SwiftShader/DevTools warning default arguments were excluded.
The software renderer still worked, with its warning retained in the receipt.

The visible shipping main → mode → range menus, pause/loadout chips and held Fire
buttons were operated through trusted browser touch input. All 22 captured
gestures were trusted, including two touch Fire pointerdowns. Normal release
cleared the live Fire/intent and charge state. The probe only forwards native
render/draw/audio methods to observe them. It never assigns actor, pose, time,
charge or Fire state, manually advances frames, or directly invokes playback.

- E-liter reached charge 1, scheduled its real recorded phrase at playback rate
  1 with a 1.863016 s worker buffer, and produced charge-gain PCM peak 0.199578 /
  RMS 0.060955. Native draw recorded a real head at age 1/60 s, with ink reduced
  from 100 to 75 at that shot. The later value includes natural ink recovery.
- Tri-Stringer passed stages 0 → 1 → 2. The live DOM moved through first/second/full
  and successive offsets 157.08 → 78.54, 157.08 → 100.98 → 44.88 → 0. First/full
  cue calls used pitches 0.8/1, 0.7 simulation seconds apart. Release produced
  three real arrows, then reset the native stage/HUD state. Bow master PCM was
  nonzero; the two dings were not isolated from its other sounds.
- Page errors and pointer-lock errors: 0. One unrelated Suction Bomb explosion
  preload aborted during a kit change. Software/parallel-shader/readback warnings
  remain recorded. These results are not an FPS measurement.

The native render observer executes before the ordinary HUD update, consistent
with the shipping frame order. Runner state and sampled DOM can therefore refer
to adjacent natural passes; no same-frame latency agreement is claimed.
The first/second-stage PNGs are **canvas-only** and exclude the DOM HUD. The
before/held-full/after page screenshots include the controls/HUD. Mid-stage HUD
pixel comparison remains unproven, despite observed real DOM progression.
E-liter's short head was recorded in the native draw path but not caught in a
render snapshot; no falling-drop render was captured. No forced state or clock
was used to claim that missing visual evidence.

`review.json` indexes the exact facts and limitations. `result.json.gz` preserves
all observed frames, audio samples, input gestures and captures; `probe.mjs` is
the exact one-invocation probe. Images are only INKWAVE output, no private or
Nintendo reference media. The newly reported repeated Shooter-guide cost remains
open for its owner; this historical 90bb check does not close it.
