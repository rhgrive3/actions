# INKWAVE alternate weapon appearance integration

## Scope

Dependent appearance-only change over PR1437 head `8fa1b134a04246f45b39c828c085ceafb228bd3b`. The95 playable kit registrations, original65 base IDs, sub/special slots, costs, weight/fidelity mappings and network kit IDs are preserved verbatim. Existing-model-based alternatives cover93 rows:31 shooter/blaster,26 melee/slosher,36 ranged/defense. Patternz Undercover Brella (`Shelter_Compact_02`) and Sorella Brella (`Shelter_Normal_01`) retain their base models and are not listed as implemented appearances.

No hair/body, held PR1294/1235/1245 geometry, stages, or gameplay balance changes belong to this patch. Reference version11.3.0 uses the source rows and visual evidence recorded in the three variant modules' companion reference files. Geometry is an original procedural interpretation, with documented partial finishes/accessory gaps; this is not a claim of complete retail parity.

## Identity and selection contracts

- `weaponModelKey(kitId)` remains the exact base ID, preserving PR1437's API and tests. Independent `weaponDefaultAppearance(kitId)` maps the kit's pinned source row to an implemented appearance, or its base fallback.
- Character.weaponModel and def.modelId remain base IDs for Stringer/Brush/Splatana/Charger direct-table poses and Brella aperture animation. The separate visual cache uses weaponAppearanceModel/modelVariantId.
- Variant builders receive fresh definitions. Base geometry and stable base holds are not mutated. Static model families/variants are bundled into the existing registry module.
- Remote and bot kits use only the official default. Local actors and explicitly marked personal pedestal previews can use device-local overrides. Overrides never enter gameplay loadout or network packets.
- Preferences are per base weapon, shared by its related kits. Missing preference means each kit's official default. Explicit Base persists as a distinct choice; Kit default clears the override. Corrupt, removed, wrong-base or unknown rows safely fall back. Blocked/quota-exhausted storage retains session preference.
- The LOADOUT appearance button uses existing pointer/touch, keyboard and gamepad menu bindings. It offers Kit default, Base and only implemented appearances, updates the personal preview, and does not change the selected kit/sub/special/cost.

## Validation

The isolated main55 evidence remains separately frozen at content hash `49e4929cd15d00a7b5825769de34f7e0005e11bbb75ccfff8e4bb726cdb293bf`. It is not reused as evidence that the PR1437 composition passed.

The PR1437-composed minified build is `9a206f9fbd46` (full hash in the delivery manifest). Source selection/geometry/carry/attack, original1437 kit tests, and adapter tests:20passed,0failed,1optional pinned-raw-source check skipped because those external fixtures were not supplied locally. CI's existing pinned-reference step supplies them. All93 alternatives and95 kit default/fallback mappings are covered, including explicitBase persistence, unknownkit fallback, and local/remote isolation.

The existing `validate-inkwave-update.yml` browser job already invokes `scripts/check-inkwave-browser.mjs`. That gate now calls `scripts/lib/inkwave-weapon-appearance-probe.mjs` to exercise trusted pointer and keyboard activation, the native pad-accept API, explicitBase/default transitions, retained kit values, reopening persistence and a screenshot on the real verified build. Syntax is checked locally; real-browser execution on the eventual PR head remains pending. The pad API probe does not claim physical-controller validation.

Independent full-cycle probes and final emitted test totals are recorded in the delivery manifest. Simulation/finite transforms, browser UI acceptance, and native retail comparison are separate evidence levels. Retail capture/mesh-fidelity acceptance remains open.
