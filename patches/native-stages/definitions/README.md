# Independent stage definitions

Each stage PR adds one `<id>.json`. The build discovers these files, validates
their pinned KiTrix identities and inferred support coordinates, and places the
same catalog in the game and source worker. Metadata is included in exact build
identity and multiplayer fingerprints; source OBJ/MTL/PNG are never included.

Available definitions contain `id`, `internal`, `name`, `sourceSha256`, `tree`,
`bounds` (`minX`, `minZ`, `maxX`, `maxZ`), two XYZ `spawnPads`, `spawnBarrier`,
`version1130Verified: false`, and a truthful `placementStatus`. The source commit
is fixed by `runtime/source-catalog.mjs`.

Optional `sourceSemantics` contains anchored regex arrays named
`inactiveObjectPatterns`, `nonCollidableObjectPatterns`, and
`nonPaintableObjectPatterns`. These are inferred object selections, never native
flags. Excluding collision keeps source render buffers intact. Inactive rule
alternatives keep every original vertex/index in the preserved source buffers.
Document each exclusion's source-name/bounds evidence in the stage report.

Unavailable definitions have `availability: "source-unavailable"` or
`"placement-unavailable"`, `reason`, `source` (`repository`, `commit`,
`searchStatus`), `placementStatus`, and `version1130Verified: false`.
They are returned separately and never get fabricated playable layouts.

Private conversion can contain any nonempty reviewed subset:

```sh
python3 patches/native-stages/tools/build-native.py --source PRIVATE_SOURCE/stages --out .codex-stage-sources/generated --stages STAGE_ID
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" node scripts/build-inkwave.mjs inkwave-public _site-native
```

Set `NATIVE_STAGE_IDS=STAGE_ID` for gameplay, online, render, lifecycle and
browser-direct checks. Asset-enabled native Node tests enumerate the private
catalog instead of requiring the original five stages. Browser jobs sharing a
software GPU must hold `/workspace/actions/.ci-scratch/native-stage-browser.lock`
with `flock`; timing reports must identify SwiftShader and concurrent CPU load.
