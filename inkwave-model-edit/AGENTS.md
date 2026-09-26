# Model-edit scope

Work only on the visual models and appearance code inside this directory.

Allowed:
- `src/game/character-geo.js`
- `src/game/character-mats.js`
- `src/game/character-weapons.js`
- `src/game/character-style.js`

Goals:
- character body/head/hair/clothes/gear geometry
- character materials/shaders/appearance
- held weapon/sub-weapon geometry and visual materials
- model proportions, detail, silhouettes, grip alignment and visual polish

Do not edit:
- anything under `../inkwave-public/`
- firing/projectile/damage/paint logic
- movement, physics, networking, bots, UI, maps or game balance
- public source until an extracted model change has been reviewed

Keep existing exported APIs compatible unless a model-only change absolutely requires otherwise.
