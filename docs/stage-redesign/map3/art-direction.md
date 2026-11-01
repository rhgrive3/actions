# MAP3 public-stage art direction

This pass implements original **Tidewater Plaza** and **Kelpline Terminal** art in the public Three.js runtime. It uses the frozen MAP3 coordinate records through `level.layout.map3`; it does not add a continuous base floor, replace either stage's heights, or change the intended upper/lower routes.

The inspected source images, their dates and uncertainty limits are recorded in [art-reference-observations.md](art-reference-observations.md). The relevant lessons are construction rhythm, material hierarchy, quiet paintable surfaces, and inhabited edge clusters. No original game asset, logo, character, sign or stage layout is copied. This art pass is not an assertion that INKWAVE movement, camera, paint or combat matches Splatoon 3.

## Two civic places, two construction languages

| Layer | Tidewater Plaza | Kelpline Terminal |
|---|---|---|
| Setting | Sunlit terraced civic market beside an open waterfront | Maritime passenger terminal above a service quay |
| Main readable surfaces | Warm limestone/render and quiet pale paving | Pale galvanized/painted panels and cool utility paving |
| Construction accent | Muted teal, with limited terracotta timber | Deep teal/charcoal, with limited ochre safety hardware |
| Cover identity | Coped ceramic seats with a narrow planted rear strip; curved striped vendor canopies; stacked braced parcels; paired fan units | Glazed terminal kiosk roofs; asymmetrically stacked cargo; paired round fan crowns; end clamps, bolt heads and service hatches |
| Actual raised decks | Paired slender teal arches on the real short bridge, open end mouths, sparse hangers, dark soffit bays; marine piers in the water-only outer strip | Paired skew portal frames anchored in the existing central edge shelters, high crossmembers, dark soffit bays and diagonal girder fascias |
| Waterfront skyline | Connected civic quay with curved-roof pavilions, planted bowls, curved-neck lamps, tied arch bridges with shore abutments, and a varied building row | Connected working quay, ribbed ferryhouse, framed glass bays, translucent shelters, inclined/haunched portal, bollards, fenders and terminal buildings |
| Small wayfinding | Sparse warm tactile studs at selected arrivals | Sparse warm tactile studs at concourses and ferry arrivals |

Accents repeat by the construction role. They do not assign a different saturated color to every floor height. The broad collision/paint faces stay visible and belong to `Level`; mounted metalwork and joinery occupy small bands. The decorative palette remains quieter than either team's ink.

## Geometry contract and honest collision

`inkwave-public/src/world/stages/map3-art.js` exports:

```js
map3ArtAssemblies(layout); // shared render/collision part descriptors
map3ArtColliders(layout); // piers + cover, lip and playable bridge assemblies
createMap3Art(scene, level, { castShadow: true });
// => { group, stats, dispose() } or null for another stage
```

Call the collider function before creating `Level`. Build the art after `Level`, the paint atlas and the regular level meshes exist. Add `group` to the static shadow roots and call `dispose()` on map replacement. The module does not mutate a `Level`, generate navigation links, animate objects, or register additional paint faces.

### Mounted surfaces

Each obstacle is dressed from its exact `rect`, `y0` and `y1`. The art remains inside that solid volume except for at most **0.035 WU** of mounting relief. The relief is sufficient to separate decorative panels from the level face, avoiding coplanar z-fighting. Mounted face detail does not add a step or large protrusion. The separate solid assemblies described below have explicit additional colliders. Low cover keeps the front of its original paintable top available for standing; a narrow planting strip occupies its rear. High screens keep broad paintable sides. Paint continues to use the original collider/face atlas; the small material accents are intentionally non-inkable.

Deck fascias stay between the real floor's `bottom` and `y`. The shallow arch or diagonal web is visible on the vertical side of that solid slab. It is a depiction of a solid girder, not a claim that the slab contains a traversable truss opening. An opaque dark soffit and cross-bay strips sit within 0.005 WU of the original nonpaintable ceiling. No deep girder lowers the authored clearance, and no visual railing blocks a designed drop. Selected tactile dots protrude only 0.018 WU above the supported floor.

### Recognizable cover assemblies

Runtime screenshots showed that small mounted frames alone still read as repeated boxes. The revised pass therefore gives selected existing cover footprints four distinct families: curved striped vendor awnings / glazed terminal canopies, low planters with a narrow planted rear strip, asymmetrical braced cargo stacks, and cylindrical fan machinery with service cabinets. The underlying neutral level surfaces retain their original ink atlas. Canopy posts, eight individual roof strips, planter beds, foliage volumes, crates and utility crowns all have explicit collider bounds from the same `map3ArtAssemblies` part records used for rendering. Decorative geometry fits those bounds with only the same mounting tolerance.

Every new cover assembly stays within its existing obstacle's XZ footprint and begins at or above that obstacle's original top. Consequently it does not consume an additional route-width strip. Low planters leave the front of the original top open. Equipment below Kelpline's upper deck remains below its ceiling. These additions change the occupied height above some cover, so the full runtime route/camera verification is rerun; they are not described as collision-neutral.

Tidewater's existing water-edge lips also carry a small tied arch / guard-post rhythm. These additions use real rail colliders, with the established actor-versus-shot/grate behavior. They occur only on the existing lips, not across open drop edges or route openings.

The final solid-art sets are **212 added colliders in Tidewater** (four piers, 144 cover/lip parts, 64 actual bridge members) and **93 in Kelpline** (85 cover parts and eight portal members). The large count comes mainly from narrow individual roof strips and posts, rather than a broad invisible box across the whole open canopy. A complete multiset comparison verifies that all min/max bounds, roof/rail flags and oriented-box dimensions/angles have exact 180-degree counterparts, including the center cover. That catches a flipped sign, offset utility case or unequal crate height.

### Actual playable bridge landmarks

The short Tidewater market bridges now carry their own paired slender teal arch ribs. Each rib runs along a long side, inset 0.3 WU from the edge, with its crown 3.0 WU above the existing deck. Four small corner posts and four thin hangers per bridge support the rhythm. There is no cross-roof or continuous rail across the end mouths, and the authored end drop stays open. All members have explicit colliders; the actual underpass ceiling remains unchanged.

Kelpline uses a different construction language: two skew steel portal frames, with their four posts anchored inside the existing `A_bridge_edge` / `B_bridge_edge` cover masses. The horizontal primary beams use real oriented box colliders matching their rendered angle. Their lower face is y=12.76, 9.16 WU above the y=3.6 deck; the smaller ochre side ties are higher still. No broad roof fills the opening. The central tower and rider envelope is checked separately in the actual runtime tests.

The small Tidewater bridge-entry cover also carries an original two-arrow route board, mounted within the existing face relief and requiring no additional collider. This gives the bridge an entrance marker without scattering signs across the routes.

### Real support piers

Tidewater's outer market hall strip lies over water while the lower street occupies a different X interval. The pass puts two 1.1 × 1.1 WU concrete piers below each team's market hall. Their cap ends exactly at the hall's underside. Their actual collision boxes and rendered bodies share the same data. These are unpaintable roof colliders, with the roof cap buried against the existing slab.

The piers do not intersect any lower floor footprint or any recorded route body. Kelpline's raised deck footprints largely coincide with lower playable routes, so this art pass adds no piers there. Its 3.0 WU and 4.2 WU authored structural clearances remain, with at most 0.005 WU of underside material relief.

### Outside architecture

The exterior foliage, curved roofs, lamps, arched waterfront bridges, terminal buildings, bollards and fenders live entirely outside the arena's X bounds. The separate playable cover and bridge assemblies are described above. Every such group is separated by at least 0.5 WU from those bounds, with water between the playable edges and its exterior foundation. They are scenery, not new routes or uncollided walls inside the game.

The higher tied arches supply a civic pedestrian-bridge silhouette behind Tidewater's actual short playable deck. Kelpline's inclined portals and curved polycarbonate shelter supply a different silhouette. Ordinary player-camera inspection remains necessary to judge whether that separation is visually clear; geometry bounds alone do not prove perceived reachability.

## Rendering and resource ownership

All static geometry is merged by material. Tidewater currently builds **6 meshes / 113,656 triangles** and Kelpline **6 meshes / 113,452 triangles**, plus their shadow passes, instead of retaining thousands of independent meshes. The tests cap each at eight meshes and 150,000 triangles. The material classes are stone, metal, timber, rubber, foliage, opaque canopy, translucent canopy and small light/sign accents. Unused classes do not produce meshes.

Stone, metal and timber share three cached 64 × 64 procedural grain textures. They add small material variation rather than dense competing floor patterns. Colors use geometry vertex colors. The sign marks are original geometric tidal/route symbols, so there are no external image or font requests. Canopy and arch curves are actual mesh geometry. There is no per-frame art update and no new punctual light.

Each art instance owns its merged geometries and materials. The cached textures have reference-counted scene ownership and are disposed when the last art instance is released. Repeated disposal is safe. This is verified explicitly by the tests.

## Verification

Run:

```bash
node --experimental-vm-modules patches/local-quality/tests/map3-art-geometry.test.mjs
```

The independent checks exercise actual Three.js geometry rather than matching source text:

- Every mounted object bound fits its source solid with only the permitted relief.
- Every exterior group's complete geometry stays beyond the arena boundary.
- The art builder leaves the immutable terrain source unchanged.
- The actual meshes have finite positions, normals, UVs and colors, and nonempty bounds.
- The material mesh and triangle budgets hold for both full stages.
- Support piers avoid lower floors and route bodies. New cover crowns remain in existing cover footprints; sampled route bodies remain clear. All extra colliders retain exact team rotation symmetry.
- Live stages share grain textures; those textures dispose exactly once after the final owner.
- Other stages acquire no MAP3 art root or colliders.
- The checked-in AO pairs match the composed runtime face layout, every hidden art collider, the recorded PNG digest and image dimensions.

These checks establish the geometry and resource contract. They do not replace runtime screenshots, visibility/ink checks, real player movement, lower-route camera checks, or performance measurements. See the implementation's broader runtime verification record for those results.

## Baked contact shading

The prior public lightmaps describe the previous terrain and must not be applied to MAP3. `scripts/bake-map3-ao.mjs` regenerates only these two stages from the composed public `Level` and `Physics`, with exactly the same structural and cover-assembly colliders used during play. It uses a deterministic 64-direction cosine hemisphere, 3.5 WU distance, 5 texels/WU and a 2048-square 8-bit grayscale atlas. Broad geometry and nearby contact occlusion therefore use the actual new collision geometry.

```bash
node --experimental-vm-modules scripts/bake-map3-ao.mjs
node --experimental-vm-modules scripts/bake-map3-ao.mjs --verify
```

The generated pairs live in `inkwave-public/assets/lightmaps/`. The JSON keeps the runtime face-layout hash and an additional complete collider digest; the PNG digest lets verification detect a changed or damaged image without repeating the expensive bake. The actual game still enforces its existing face hash before loading the texture. Artistic noncolliding detail receives ordinary lighting and static shadows; it does not silently become an AO collision obstacle.

The final bakes contain 667,648 Tidewater texels (42,729,472 rays; 87.9 KiB PNG) and 854,176 Kelpline texels (54,667,264 rays; 106.1 KiB PNG). Face-layout hashes are `3aec4eb7` and `ad7c4974`; the complete collider and PNG SHA-256 hashes are stored in their adjacent JSON metadata.


## Final runtime coordinate documents

These added documents describe the implemented art and collision. The original `design.json`, overview and height-layer diagrams remain the frozen floor-design reference.

| Document | Contents |
|---|---|
| [runtime-art-coordinates.json](runtime-art-coordinates.json) | Exact 212 / 93 added collider definitions; explicit solid, paint, hidden, roof, rail, grate and OBB flags; actual oriented footprints; assembly source records and bounds; individual rendered bounds, material/color usage, palettes and source hashes. |
| [runtime-art-plan.svg](runtime-art-plan.svg) | Both arenas at exactly 4 px/WU with the same X/Z frame. Added collision projections overlay every original deck outline. The rotated portal footprints retain their real orientation. |
| [runtime-art-sections.svg](runtime-art-sections.svg) | Two analytic sections at 18 px/WU: Tidewater's actual arch centerline crown y=7.8, conservative collision envelope y=7.875, deck y=4.8 and underpass y=0; Kelpline's portal lower/top faces y=12.76/13.24 above deck y=3.6 and lower route y=0. |

Generate or check their correspondence to the current source:

```bash
node --experimental-vm-modules scripts/document-map3-art.mjs
node --experimental-vm-modules scripts/document-map3-art.mjs --verify
```

The generator runs the actual Three.js art builder in an isolated documentation realm. Build-only instrumentation records the material/color calls and measured geometry bounds without changing the runtime source. Both SVGs use analytic coordinates, not generated imagery. The plan shows projected overhead members as well as low structures; a colored projection alone does not mean the route at deck height is blocked. Exterior quays and face-mounted details introduce no extra collision and are omitted from the collision plan, but their measured visual regions remain in the JSON.

Final [bridge](runtime-evidence/tidewater-bridge.jpg) and [ordinary gameplay](runtime-evidence/tidewater-play.jpg) captures were inspected after the bridge pass. The actual paired ribs now identify the played bridge, their mouths remain visually open, and the foreground keeps broad neutral paint faces and a readable ink path. The final captures also show the connected quay and distinct canopy, planted seat and utility families. These observations describe the rendered result; they do not certify match balance or commercial production readiness.
