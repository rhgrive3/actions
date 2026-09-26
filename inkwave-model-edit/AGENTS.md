# Model-edit scope

Work only on the visual models and appearance code inside this directory.

Allowed:
- `src/game/character-geo.js`
- `src/game/character-mats.js`
- `src/game/character-weapons.js`
- `src/game/character-style.js`
- `modeler-profile.json`
- `modeler.html`
- `preview.html`

Goals:
- character body/head/hair/clothes/gear geometry
- character materials/shaders/appearance
- held weapon/sub-weapon geometry and visual materials
- model proportions, detail, silhouettes, grip alignment and visual polish

## AI modelling workflow

For visual redesign work, use `modeler-profile.json` first instead of immediately rewriting procedural geometry.

1. Change a small set of semantic values in `modeler-profile.json`.
2. Open `modeler.html` and inspect Perspective, Front, Right and Back.
3. Compare against the supplied reference image using Reference Overlay when available.
4. Work silhouette-first: overall proportions -> head/face -> hair -> clothes -> materials/details.
5. Keep each iteration small enough that a visual regression can be attributed to a specific parameter.
6. Once the profile is approved, bake the accepted proportions/design into the corresponding procedural source files.
7. Re-open the baked model with the profile reset to 1.0/0 offsets and verify that it matches the approved result.

The modeler profile is a non-destructive design layer, not production gameplay state. Do not add runtime gameplay dependencies on it unless explicitly requested.

Do not edit:
- anything under `../inkwave-public/`
- firing/projectile/damage/paint logic
- movement, physics, networking, bots, UI, maps or game balance
- public source until an extracted model change has been reviewed

Keep existing exported APIs compatible unless a model-only change absolutely requires otherwise.
