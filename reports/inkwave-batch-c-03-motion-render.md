# INKWAVE batch C 03 — lifecycle and render resources

Baseline main: `8158a2b83c8e6948d0f96f1bbe0e80e987c4bafd` (external merge of PR452; Orchestrator C did not merge).

- #435: Slosher-only swim admission accounts for the existing 12-frame lift, giving the issue's sourced 18-frame first release. Ordinary humanoid 12-frame startup, 29-frame repeat and other weapons remain native.
- #196: Successful special activation cancels suspended Charger charge/store/audio bookkeeping. Unsuccessful attempts, cooldown and unrelated weapons retain their behavior.
- #284: Native owner and remote death paths start a presentation-only ghost trajectory to the team's spawn. One record per actual death, including late terminal delivery; expiry/replay/reset never grants gameplay events. Uses existing squid sprite; timing/height are presentation calibration, not Nintendo measured constants. Native INKWAVE has no octopus rig; explicit species metadata is recognized but this does not claim a new species asset.
- #418: Runtime quality changes rebuild visual atlas/shadow/FX/props resources in place. CPU paint grids, counts, level/physics identity and weapon values are retained. Atlas RGBA is resampled to changed UVs with renderer state restored. Same-layout match startup uses existing cancellation flow. Roller linked-drop bookkeeping resizes with its native visual pool.
- #190: Paint atlas mipmaps are generated on bounded paint/drying cadence, with public Three renderer APIs. Atlas quality resampling generates one new mip chain even without subsequent paint. No direct GL state manipulation or private renderer textures API.
- #472: Touch Online LobbySet uses its native LOW budget (no planar reflection/steam/extra lights, 1024 shadow); LOW shadow dirtiness is throttled. Desktop HIGH behavior remains native. Arena quality and studio overlays are outside this lobby policy.

Adapters compose through the production quality dispatcher and runtime install. Upstream `inkwave-public/` is untouched. No Practice Range exists in this main baseline; no range-specific code, weapon tuning, damage or protocol changes are introduced. The ghost hooks use existing authoritative death methods and do not duplicate damage/scoring.

Focused evidence: 37 original scoped tests passed before interaction corrections; corrected native owner/remote ghost paths 2/2, world quality/linked roller regression 10/10, production Slosher dispatcher acceptance 6/6. Actual Chromium WebGL fixture verified GPU ink survives atlas resize, exactly one mip regeneration, unchanged CPU grid/counts, restored renderer background/alpha and zero GL errors. Existing active CI gains production quality switching, compiled Charger charge cancellation, and the native GPU mip/resample fixture; existing normal gameplay/render/startup/input gates are retained.

A local whole-game browser attempt timed out at native boot shader warm-up (81%, no console/network errors). This is recorded as unresolved local evidence, not claimed as a known main failure or passing verification. Exact pushed SHA and candidate-merge CI are required before completion.

#406 and #460 are excluded until their actual visual acceptance is complete; data/state labels alone are insufficient. #412 was released because its partial player-only implementation does not meet charge/UI selection acceptance; partial work is archived separately. All issue claims/comments and current PR diff overlap are audited before publishing. No deployment or merge by Orchestrator C.
