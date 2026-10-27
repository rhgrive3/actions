# Current-head Wiper native visual evidence

Additive QA route based on `5a760775d4925de250bb5f8445104f92c2d68f73`.
It uses the existing automatic `catalog` browser shard in
`.github/workflows/validate-inkwave-update.yml` and its immutable built-site
artifact. It does not add an event, dispatch, PR, historical overlay, source
checkout, or condition exception. Hissen's matched 5/7/9 capture and the
separate phase52 contract remain unchanged.

## Run on a supported sandboxed browser host

```sh
node --experimental-vm-modules --test scripts/tests/inkwave-wiper-native-acceptance.test.mjs
timeout 30m node scripts/check-inkwave-wiper-native-acceptance.mjs \
  .built-site/_site evidence/wiper-native --source-sha "$(git rev-parse HEAD)"
node scripts/check-inkwave-wiper-native-receipt.mjs \
  .built-site/_site evidence/wiper-native "$(git rev-parse HEAD)"
```

The output directory must be fresh. `SOURCE_SHA` must be the checkout HEAD,
and every emitted artifact and builder input is checked against that commit.
The browser's consumed shape/sheet module bodies are checked against the same
manifest. The receipt is bound to the current harness/helper bytes and all 36
original PNG hashes. The existing catalog CI result additionally requires this
receipt's passed status, exact source SHA and shared build content hash. The
normal catalog evidence artifact contains the output, including partial failure
receipts; no new artifact-upload route is needed.

Chromium uses **`chromiumSandbox: true`**, one launch attempt, and the supported
Playwright browser installation (or explicit `CHROMIUM_EXECUTABLE_PATH`).
There is no sandbox-disabling fallback or escalation. SwiftShader flags choose
software WebGL; they do not disable the Chromium process sandbox. A denied
launch is failed/blocked evidence, never a pixel pass.

## Coverage and interpretation

* Normal/Stamper (`WeaponSaberNormal`), Lite/Wiper (`WeaponSaberLite`) and the
  unchanged Heavy control (`WeaponSaberHeavy`), each charged and tapped.
* Charged inclusive frames **1, 3 and 8**; tap frames **1, 2 and 3**: frame 1
  is the first observed native active shot birth itself, not birth plus one
  tick. Native projectile age and lobe fields are recorded independently.
  Delayed/pending shots are excluded. The real-Actor source regression executes
  the exact browser admission scheduler for all six cases. It rejects the old
  global frame-8 tap policy: Lite's native lifetime is only four 60Hz intervals,
  and it has already retired at that requested phase. No lifetime is extended.
* Actual one paid native projectile, actual source actor/descriptor, and actual
  native `wetSlashV` / `slashH` / legacy `slashV` two-instance meshes.
* Each phase has one unchanged native-composer PNG with high-quality AO/shadows
  and one independent fixed side-camera raw-scene PNG. Raw frames are explicitly
  not postprocessed/AO acceptance. Neither view hides objects, changes lights,
  rewrites instances, crops, or follows/fits the projectile.
* Scene draw totals, actual mesh draw callbacks, geometry/index/attribute byte
  budgets, projection coverage, source settings/palette/cameras, per-shot state,
  consumed source modules, non-flat framebuffer evidence, retirement and native
  renderer resource disposal are retained. All browser contexts, browser and
  loopback server are closed even on failure.

This is **controlled native replay**, not ordinary-input acceptance: saved
settings/profile/gear, seeded RNG, first-publication freeze, neutral actor pose
and ink, existing range travel, frozen bots, 60 settling ticks, fixed aim and
60Hz native `_frame` stepping are all disclosed in the receipt. Fire uses the
real native `debug.fire` input state and charge/release admission; no shot or
charge state is constructed or retagged. Menu admission uses two trusted pointer
gestures, but that does not turn the later replay into ordinary input.

Draw, projected geometry and non-flat pixels do **not** prove the slash is
unoccluded, nor establish resemblance to the reference. Inspect the original
full PNGs, especially Normal/Lite charged frame 1 and the Heavy/tap controls.
Do not claim Nintendo retail timing, exact dimensions, hardware performance,
or visual equivalence from this route alone. The private comparison JPG is not
copied into the repository or artifacts.

## Local verification at authoring time

Only source/receipt/launcher/cleanup/workflow tests were run locally, including
the actual production Actor/controller admission schedule for all six cases. The parent
environment's native sandboxed Chromium launch is blocked, so there is **no
local native-browser pixel pass**. The fresh automatic exact-head run after
approved integration/publication must supply the actual 36 PNGs and original
receipt; stale 5a or historical Heavy-only evidence is insufficient.
