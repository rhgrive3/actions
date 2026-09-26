# Model-edit scope

Work only on the visual models and appearance code inside this directory.

Allowed:
- `src/game/character-geo.js`
- `src/game/character-mats.js`
- `src/game/character-weapons.js`
- `src/game/character-style.js`
- `modeler-profile.json`
- `modeler-profile.schema.json`
- `modeler.html`
- `preview.html`

Goals:
- character body/head/hair/clothes/gear geometry
- character materials/shaders/appearance
- held weapon/sub-weapon geometry and visual materials
- model proportions, detail, silhouettes, grip alignment and visual polish

## AI modelling workflow

For visual redesign work, use `modeler-profile.json` first instead of immediately rewriting procedural geometry.

1. Validate edits against `modeler-profile.schema.json`; do not invent profile keys.
2. Change a small set of semantic values in `modeler-profile.json`.
3. Open `modeler.html` and inspect Perspective, Front, Right, Back and Quad.
4. Align the supplied reference image with Reference Overlay before judging silhouette.
5. Work silhouette-first: overall proportions -> head/face -> hair -> clothes -> materials/details.
6. Use `sculpt.handles` for local soft edits such as jaw, cheeks, eye corners, sleeves and shoe shape.
7. Use `hairSpline.strands` for true procedural hair-curve changes. Prefer spline edits over huge-radius hair sculpt handles. `Copy hair spec` exposes the resolved Catmull-Rom control points.
8. Use mirrored handles for symmetric anatomy and non-mirrored handles for intentional asymmetry or individual hair locks.
9. Keep each iteration small enough that a visual regression can be attributed to a specific parameter.
10. Use part isolation, wireframe and capture/quad views to verify geometry rather than judging only the beauty render.
11. Once the profile is approved, bake the accepted proportions/design into the corresponding procedural source files.
12. Re-open the baked model with the profile reset to 1.0/0 offsets and empty sculpt/spline overrides, then verify that it matches the approved result.

The modeler profile is a non-destructive design layer, not production gameplay state. Do not add runtime gameplay dependencies on it unless explicitly requested.

Do not edit:
- anything under `../inkwave-public/`
- firing/projectile/damage/paint logic
- movement, physics, networking, bots, UI, maps or game balance
- public source until an extracted model change has been reviewed

Keep existing exported APIs compatible unless a model-only change absolutely requires otherwise.

## Quality gates before baking

- Front/side/back silhouettes agree with the reference, not only the perspective view.
- No obvious self-intersections at the face, ears, hair roots, cuffs, shorts, shoes or weapon grip.
- Hair curve edits remain smooth under Catmull-Rom interpolation and do not use extreme point offsets to compensate for a bad base silhouette.
- Local sculpt handles should use the smallest practical radius. Avoid a single handle that unintentionally drags unrelated parts.
- Material tuning must preserve readable forms under neutral studio lighting; do not hide geometry problems with glow or transparency.
- Character + held weapon should remain within the existing mobile-oriented triangle budget unless the user explicitly approves a budget increase.
- Final bake must preserve exported APIs and rig/weapon grip contracts.
