# INKWAVE model-edit extraction

This branch is a model-only working area copied from `inkwave-public/`.
The original game files under `inkwave-public/` are intentionally untouched.

## Included

- `src/game/character-geo.js` — procedural character geometry, rig, hair/head/body mesh generation.
- `src/game/character-mats.js` — character/weapon materials and shaders.
- `src/game/character-weapons.js` — procedural held-weapon and sub-weapon models.
- `src/game/character-style.js` — appearance/style catalog used by the character model.

## Excluded on purpose

- `inkwave-public/src/game/character.js` — runtime character animation / gameplay integration.
- `inkwave-public/src/game/weapons.js` — firing, projectile, hit, paint and gameplay logic.
- map, UI, networking, physics and other game systems.

## Editing rule

Do model/appearance work only inside `inkwave-model-edit/`.
When a model change is approved, port the relevant diff back to the matching file under `inkwave-public/src/game/`.

The relative imports among the copied model files are preserved, so the four files stay together under `src/game/`.
