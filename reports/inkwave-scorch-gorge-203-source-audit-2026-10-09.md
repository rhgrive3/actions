# INKWAVE #203 — Scorch Gorge source audit (2026-10-09)

**Status: unresolved.** This is a source-gap record, not a Scorch Gorge implementation. No layout, stage ID, spawn, collision, paint mask, navigation, or gameplay tests were added. The issue must remain open.

## Target and reference basis

- GitHub issue [#203](https://github.com/rhgrive3/actions/issues/203) targets the published `inkwave-public/` build and asks for the current post-Ver. 8.0 Turf War topology. Its reference-version statement is Splatoon 3 Ver. 11.3.0 as of 2026-10-04. I could not refresh the official Nintendo support page during this audit (HTTP 406), so I do not assert that 11.3.0 is still the latest version on 2026-10-09.
- The [Scorch Gorge article](https://splatoonwiki.org/wiki/Scorch_Gorge) identifies the center climbable platform and grate connections, describes the spawn-side raised areas and routes, records `totalbp=2,145`, and says terrain changed in all modes in Ver. 8.0.0.
- The [post-Ver. 8.0 Turf War map file](https://splatoonwiki.org/wiki/File:S3_Map_Scorch_Gorge_Turf_War_8.0.jpg) is the current 2D reference used here. Its downloaded 1280×720 raster has no world-coordinate grid or metric scale. The article provides no heights, collision mesh, or paintability mask.
- The public [Leanny/splat3 repository](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6) was inspected at commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6` (2026-08-20; commit message `1130`). Its `data/mush/1130/VersusSceneInfo.json` includes stage-list metadata, but no terrain coordinates. A recursive tree audit found no `.bfres`, `.bfsha`, `.bfmat`, `.sarc`, `.szs`, `.obj`, `.fbx`, `.glb`, `.gltf`, or `.dae` geometry assets and no repository text hit for “Scorch Gorge”. Its `Vss_*` stage images are presentation images, not collision or terrain data.
- The official [Nintendo Splatoon 3 update page](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/) was attempted with a browser and a direct HTTP request; the browser request was unauthorized and Nintendo returned HTTP 406. No current-version claim is derived from those failed requests.

## Published target at main `590410494a3e041a403398e191b7d95183912ea2`

`inkwave-public/src/world/maps.js` registers only `tidewater`, `kelpline`, `halyard`, and `cargo`. `inkwave-public/src/config.js` likewise has no Scorch Gorge stage selection identity. `inkwave-public/src/world/level.js` derives spawn vectors, collision blocks, and paintable faces from numeric layout definitions; those values are required to make a stage playable and scoreable. The active public target contains no Scorch Gorge layout to compare.

The post-8.0 Wiki raster supports a top-down topology reading, but it cannot ground the world scale or the 3D information consumed by this engine. The permitted sources checked in this audit do not establish:

- world-space stage bounds, scale, or the 2D-to-world transform;
- platform and ramp elevations, slopes, widths, undersides, and edge/collision volumes;
- exact spawn-pad transforms and respawn-safe regions;
- grate collision/projectile/ink behavior and abyss boundaries in world coordinates;
- paintable faces and the turf-score mask needed to represent the Wiki's 2,145 total battle points;
- weapon-range sightlines or route travel distances.

The visible spawn markers and route descriptions are useful for topology, but deriving engine coordinates and heights from the unscaled raster would invent dimensions. Reusing any other INKWAVE stage would produce a surrogate map. Neither would satisfy #203's comparison requirement.

## Completion decision

No gameplay source or adapter was changed. No focused Scorch Gorge geometry, playability, battle-range, stage-isolation, owner/remote, or frame-cadence test was added or run: without grounded layout data, such tests would certify invented fixtures rather than the requested stage. The sole open Draft PR diff inspected during this handoff is unrelated to #203, and no open PR or linked branch contains a Scorch Gorge implementation.

The audit evidence, including the live issue and duty comments, current open-PR list, inspected Draft diff, Leanny tree summary, Wiki page payload, and downloaded post-8.0 map image with hashes, is retained in the task's persistent evidence directory. To implement the acceptance conditions without guessing, a source must supply a scaled terrain/map export or measured world-space bounds, elevations, spawn transforms, grate/abyss collision semantics, and paint/scoring mask. Until then, #203 remains open and incomplete.
