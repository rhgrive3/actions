# PR #1910 integrated pause lifecycle: Chromium software evidence

On 2026-10-29, the two existing PR #1910 lifecycle harnesses passed sequentially against the already-built production site, with the GPU reserved for these checks. `verifyRuntimeBuild` checked the site's input and artifact bytes against Git commit `321ec20f553077bd539eea0f2b88e6142f899adf`. The site was originally built from `79fb0047a15ca4a36f1999964b73f0ae95d9b7cd`; its checked input hash is `70f311926677e6607bcf08245e6da8650da2c64b8030cc966ff104b6820c0b68` and content hash is `0c3788aae8fd362953bbb959c6038eb9cbf452b618638144c84e50ddb1cbe03d`. The site's production inputs and artifacts were verified against `321ec20`; the revision in the JSON is an asset revision, not a Git SHA.

- The production Menus/Renderer test used Chromium 154, iPad emulation, an offline menu API and a small software-WebGL scene. It passed 72 pause or nested-settings departures, a real quit-confirmation button and full/light/fade wipe completion. Twelve pause/resize cycles retained identical RGBA pixels, released hidden snapshots, and ended with zero live tracked textures, renderbuffers and framebuffers. Page errors were zero; context recovery UI was checked.
- The actual practice-range Game test used Chromium software WebGL and a frozen debug simulation. Six pause cycles alternated LOW/HIGH quality, preserved paused match time and actor position, released the snapshot on resume, and finished with quit to the main menu. Its live texture counts were 29–30; it detected no GL error or page error. These are fixture observations, not physical GPU memory measurements.

Both harnesses closed their browser scopes. Two earlier attempts were interrupted because they overlapped another agent's GPU reservation; they are not counted as evidence. The completed tests do not claim real iPad Safari results, online multiplayer coverage, all-stage behavior or a hardware performance improvement.

The two result JSON files and logs are retained here. `identity.json.gz` contains the verified build input and artifact inventory; `receipts.json` records raw and stored SHA-256 hashes. No private image or audio assets are included. The commands below were run sequentially against the existing `_site`, without rebuilding:

```sh
node --input-type=module -e "import {verifyRuntimeBuild} from './scripts/lib/inkwave-runtime-evidence.mjs'; console.log(JSON.stringify(verifyRuntimeBuild('_site',process.cwd(),'321ec20f553077bd539eea0f2b88e6142f899adf')));"
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-inkwave-ipad-gpu-lifecycle.mjs --site _site --out /path/to/gpu-lifecycle.json
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-inkwave-ipad-game-lifecycle.mjs --site _site --out /path/to/game-lifecycle.json
```
