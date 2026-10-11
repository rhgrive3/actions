# INKWAVE Stage 25: integration and verification

**Status: authored playable prototype, not a completed or exact Splatoon 3 reconstruction.**

Base: `f2c870859d637fccba88031c3786ecec4d95248d`.
Source: `INKWAVE-main-f2c87085-01-project.zip`.
Target identity catalog: Splatoon 3 11.3.0, 25 normal battle stages. Native mesh, collision, metric dimensions, material parameters and full original object placements were **not** obtained. All terrain/object coordinates in this change are authored world-unit values. Never cite them as Nintendo data.

## Apply

Use a clean checkout of the base commit, or extract the specified project ZIP. Preserve any newer work before applying the patch.

```sh
git apply --check INKWAVE-stage25-f2c87085.patch
git apply INKWAVE-stage25-f2c87085.patch
```

The changed-source ZIP is an alternative, not an additional patch to apply twice. On a newer main, merge changes rather than overwriting other camera, paint, gear or rule work. No GitHub writes, PRs, merges or Issue closures were performed for this delivery.

Locked upstream files such as `src/main.js`, `src/config.js`, `src/game/physics.js`, `src/game/actor.js` and `src/world/paint.js` remain untouched in the input tree. Their integration is emitted by `scripts/lib/inkwave-stage25-adapter.mjs`, called last by `scripts/inkwave-source-composition.mjs`. **Serving the raw input tree bypasses these integration changes. Build the project.** Anchor checks reject drift instead of silently applying partial replacements.

## Build and run

The executed build is the baseline's explicit offline diagnostic build:

```sh
INKWAVE_BUILD_UNMINIFIED=1 node scripts/build-inkwave.mjs inkwave-public /tmp/inkwave-stage-site
python3 -m http.server 8080 --directory /tmp/inkwave-stage-site
```

Open `http://localhost:8080/?stage25lab=1`. The game includes a stage/rule selector in the query-gated diagnostic panel. Normal stage selection uses procedural, collision-derived thumbnails. Offline Turf is the implemented game mode. The four ranked options **select their authored terrain and exportable objective data; they do not implement the ranked scoring or objective entities**.

For a production build, install the existing build dependency, `esbuild`, then run without `INKWAVE_BUILD_UNMINIFIED`. This environment could not download it due to DNS resolution failure. Production minification, the production cache budget and its full CI gate are therefore not certified by this delivery. Do not raise the existing production budgets to hide a diagnostic-build failure.

## Rule implementation contract

```js
import {
  getStageLayout, getStageRuleData, stageDescriptor,
  assertStageCompatibility
} from './world/stages/splatoon3/index.js';

const layout = getStageLayout('mahi', 'zones');
const rules = getStageRuleData('mahi', 'zones');
// rules.originalVerified === false
// requireVerified:true throws rather than presenting invented original coordinates.
const networkDescriptor = stageDescriptor('mahi', 'zones');
```

Canonical rule keys: `turf`, `zones`, `tower`, `rainmaker`, `clams`. The export contains 125 JSON layouts, explicit terrain keys, spawn points, zone polygons, tower paths/checkpoints, Rainmaker start/checkpoints/goals and clam basket/sample-spawn positions. These are **prototype placements**, not native originals.

The separate game-rule owner creates objective entities, win conditions, checkpoint state and authoritative events. Stage effects accept these updates:

```js
G.stage25?.setRuleState({ zoneOwner: 0 }); // null, 0, or 1
G.stage25?.setRuleState({ waterLow: true });
const state = G.stage25?.snapshot();
G.stage25?.restore(state);
```

Match time, not render cadence, drives stage motion. Pause does not advance it. Hash/schema/stage/rule validation rejects incompatible state. The network start/ready handshake includes stage identity. **Live continuous authority reconciliation, delayed fan activation, late-join state transfer and two-client online play are not validated.** Snapshot APIs do not by themselves prove synchronized multiplayer.

## Geometry, collision and paint

Twenty-five separate authored geometry modules share `authoring.js`. `Level` builds rendering, raycast faces and paint masks from the same boxes, oriented boxes, ramps and polygonal approximations. Co-planar faces use convex subtraction so duplicate slabs do not own the same paint cell. Conveyor contact materials take priority over their underlying co-planar floor. Uninkable glass has solid collision and a separate transparent material. Grates retain the game's existing kid/squid/shot semantics.

Moving surfaces share one transform for mesh, collision OBB, normals, face UV axes and supported actors. Only affected spatial-hash cells are rebuilt. Atlas quality changes retarget moving geometry without retaining stale UVs. Scenery is instanced and does not create phantom accessible floors. Original materials/textures/models are not included: these visuals are generated geometry and existing INKWAVE procedural materials.

Navigation samples live moving/water support at a stage epoch, invalidating unavailable nodes. It does not create a complete time-dependent navigation graph or recompute every active bot path. Narrow routes, moving-platform boarding, escape after water changes and full-match behavior need additional tests.

## Verification commands

```sh
node --experimental-loader ./scripts/stage25-node-loader.mjs scripts/test-stage25.mjs /tmp/inkwave-stage-site
node --experimental-loader ./scripts/stage25-node-loader.mjs scripts/test-stage25-regressions.mjs /tmp/inkwave-stage-site
node --experimental-loader ./scripts/stage25-node-loader.mjs scripts/export-stage25.mjs /tmp/inkwave-stage-site
```

Browser harness: `scripts/audit-stage25-browser.py`. It requires Playwright, Chromium and a local CORS asset server on port 8766. This container requires an X display for SwiftShader. Due to document-navigation policy, it uses the actual built HTML via `set_content`, with in-memory storage. It does not disable or modify browser policy. Simulation ticks use the shipped fixed-clock driver. Bot attacks are disabled only in the final isolated traversal test, while AI movement remains active. Browser tests are not a complete online match, mobile hardware test, or original-camera comparison.

CPU render submission timings and software-rendered screenshots are not mobile FPS. The report contains exact scope and raw results, including unverified areas. All measurements use INKWAVE world units, not validated native metric dimensions.

## Portable browser audit setup

The following is a local test workflow, not an external download or a production server. Install Playwright/Chromium in your own test environment when they are not already present. Start the asset server in one terminal, then run the audit in another:

```sh
python3 scripts/serve-stage25-audit.py /tmp/inkwave-stage-site --port 8766
python3 scripts/audit-stage25-browser.py /tmp/inkwave-stage-site
```

Use `STAGE25_CHROMIUM` to choose a browser executable, `STAGE25_ASSET_ORIGIN` for a different local asset-server URL, `STAGE25_AUDIT_OUT` for the output directory, and `STAGE25_IDS=scorch,mahi` for a targeted subset. Without an explicit browser path or a system Chromium, Playwright selects its installed Chromium. On this Linux environment the audit also required `DISPLAY=:99` with an existing Xvfb server. The 25-stage measurements in the delivery use the unchanged revision-4 audit operations; these options only make the local runner portable.

Main integration target: 343e7afa72a67ae53a58a7529c55def84af7cd6f (2026-10-11); GitHub Pages evidence: 3fe64c31d020af583a586fef1818286b18ed3a2a / Actions 38137488594. Prototype layout fidelity remains unverified.
