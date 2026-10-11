# INKWAVE canonical weapon kits — 2026-10-11

## Scope and source

Baseline main: `f2c870859d637fccba88031c3786ecec4d95248d`. Open PR #1220 owns projectile visuals and remains separate; #401 is excluded.

- [Pinned WeaponInfoMain 11.3.0](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/mush/1130/WeaponInfoMain.json), SHA-256 `53641c4b4c96d56d3ed4ca8d4c7426d83a0bf28af6f85e9eafc391b2ae9f663e`.
- [Nintendo 11.3.0 update information](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/kw/Splatoon%203), checked 2026-10-11. The full kit mapping uses the pinned extracted table, not inference from patch notes.
- Existing main-weapon catalogue source rows are matched by exact `__RowId`; alternate kits and replicas are not substituted.

All 65 main IDs match one unique original base row. The 7 legacy main kits were already mapped; all 58 additional mains still used `bomb / slam / 190`. Those 58 now use their source kits. The 65 requested base weapons use all 14 registered subs and 15 of 19 registered retail specials; unused alternate-kit specials remain available in custom mode.

## Changes

- Reproducible hash-checked extraction script, audited reference records and compact frozen runtime map.
- Added-main definitions install canonical sub, special and point cost before Actors, menus or networking use them. Shipped installer validates all 65 registries and resolves stale metadata labels.
- Canonical is the default; existing deliberate custom choices remain optional. UI labels standard/custom and base points explicitly. Invalid saved pairs do not blank selectors. Saving the standard pair clears the override.
- Actor-local custom overrides are bound to the main ID and no longer leak into another main on bot/remote weapon changes. Matching canonical network pairs retain canonical metadata.
- Bot inputs now activate the newly equipped special families through normal Actor admission and drive required launch/charge/deploy inputs. This is INKWAVE AI policy, not retail AI parity.
- Frozen `inkwave-public/` remains unchanged. Production composes all six adapters before browser testing.

## Validation status

- Source row identity/sub/special/points: 65/65 exact extracted records.
- Actual composed Actor lifecycle/gear/reset/death/switch, native sub release/payment, and special admission: 65/65 each.
- JSON tick owner/life/freshness loadout synchronization: 65/65; foreign/stale substitutions rejected.
- Selected canonical bomb credits actual floor ownership and points, fills the 180p gauge, then applies death reduction.
- Selected canonical Ink Storm scores delayed turf without refilling its own special.
- Existing main catalogue suite: 22 pass, including all 58 actual main emissions.
- Canonical plus existing catalogue integration suite: 22 pass at intermediate revision; final run recorded in PR.
- Production minified build passed.
- Full patch suite: running, not yet certified.
- Browser: local Chromium socket creation is unavailable in this environment. CI browser probes have been extended to all 65 canonical kits and real menu-card selection; not yet executed successfully.

## Limits and remaining work

Kit identity is exact; this does not certify every existing sub/special mechanic, world scale, collision, animation or retail frame behavior. Existing runtime calibration notes remain authoritative. Controlled retail footage comparison, native Android/Switch comparison, GPU performance and a visual screenshot acceptance result remain unverified. The browser probes must pass on the final head before merge. No main merge or published-game acceptance is claimed by this report.

## Full source correspondence

Before: legacy 7 used the same canonical values listed below; all other IDs used bomb/slam/190.

| INKWAVE ID | Exact source row | Source pointer | Sub | Special | Points |
|---|---|---|---|---|---:|
| s3-shooter-short | Shooter_Short_00 | /245 | curling | ultraStamp | 190 |
| s3-shooter-first | Shooter_First_00 | /194 | bomb | bubbler | 180 |
| s3-shooter-precision | Shooter_Precision_00 | /231 | burst | crabTank | 210 |
| s3-shooter-blaze | Shooter_Blaze_00 | /182 | fizzy | reefslider | 180 |
| shooter | Shooter_Normal_00 | /219 | suction | trizooka | 200 |
| s3-shooter-gravity | Shooter_Gravity_00 | /202 | splashWall | killerWail | 210 |
| s3-shooter-quickmiddle | Shooter_QuickMiddle_00 | /239 | suction | tacticooler | 200 |
| s3-shooter-expert | Shooter_Expert_00 | /187 | angleShooter | crabTank | 190 |
| s3-shooter-heavy | Shooter_Heavy_00 | /206 | sprinkler | inkVac | 190 |
| s3-shooter-long | Shooter_Long_00 | /211 | angleShooter | inkVac | 180 |
| s3-shooter-quicklong | Shooter_QuickLong_00 | /236 | pointSensor | killerWail | 190 |
| s3-blaster-short | Blaster_Short_00 | /29 | bomb | zipcaster | 170 |
| blaster | Blaster_Middle_00 | /19 | autobomb | bubbler | 190 |
| s3-blaster-long | Blaster_Long_00 | /15 | suction | waveBreaker | 210 |
| s3-blaster-lightshort | Blaster_LightShort_00 | /7 | bomb | trizooka | 180 |
| s3-blaster-light | Blaster_Light_00 | /11 | inkMine | tripleInkstrike | 190 |
| s3-blaster-lightlong | Blaster_LightLong_00 | /2 | toxicMist | inkVac | 180 |
| s3-blaster-precision | Blaster_Precision_00 | /24 | sprinkler | reefslider | 180 |
| s3-shooter-triplequick | Shooter_TripleQuick_00 | /254 | curling | crabTank | 190 |
| s3-shooter-triplemiddle | Shooter_TripleMiddle_00 | /249 | pointSensor | tacticooler | 190 |
| s3-shooter-flash | Shooter_Flash_00 | /198 | splashWall | trizooka | 220 |
| s3-roller-compact | Roller_Compact_00 | /119 | autobomb | zipcaster | 160 |
| roller | Roller_Normal_00 | /133 | curling | bubbler | 180 |
| s3-roller-heavy | Roller_Heavy_00 | /124 | sprinkler | tacticooler | 210 |
| s3-roller-hunter | Roller_Hunter_00 | /129 | inkMine | tentaMissiles | 210 |
| s3-roller-wide | Roller_Wide_00 | /141 | splashWall | inkVac | 180 |
| s3-brush-mini | Brush_Mini_00 | /38 | bomb | killerWail | 180 |
| s3-brush-normal | Brush_Normal_00 | /42 | suction | zipcaster | 190 |
| s3-brush-heavy | Brush_Heavy_00 | /34 | curling | waveBreaker | 190 |
| s3-charger-quick | Charger_Quick_00 | /82 | pointSensor | bubbler | 190 |
| charger | Charger_Normal_00 | /73 | bomb | inkVac | 190 |
| s3-charger-normalscope | Charger_NormalScope_00 | /69 | bomb | inkVac | 190 |
| s3-charger-long | Charger_Long_00 | /64 | inkMine | waveBreaker | 210 |
| s3-charger-longscope | Charger_LongScope_00 | /61 | inkMine | waveBreaker | 210 |
| s3-charger-light | Charger_Light_00 | /57 | autobomb | killerWail | 190 |
| s3-charger-keeper | Charger_Keeper_00 | /53 | torpedo | tentaMissiles | 200 |
| s3-charger-pencil | Charger_Pencil_00 | /79 | sprinkler | tacticooler | 220 |
| slosher | Slosher_Strong_00 | /280 | bomb | tripleInkstrike | 220 |
| s3-slosher-diffusion | Slosher_Diffusion_00 | /264 | toxicMist | inkjet | 180 |
| s3-slosher-launcher | Slosher_Launcher_00 | /273 | fizzy | booyahBomb | 210 |
| s3-slosher-bathtub | Slosher_Bathtub_00 | /259 | sprinkler | storm | 190 |
| s3-slosher-washtub | Slosher_Washtub_00 | /285 | pointSensor | storm | 200 |
| s3-slosher-double | Slosher_Double_00 | /269 | suction | reefslider | 200 |
| s3-spinner-quick | Spinner_Quick_00 | /301 | burst | ultraStamp | 200 |
| splatling | Spinner_Standard_00 | /311 | sprinkler | waveBreaker | 210 |
| s3-spinner-hyper | Spinner_Hyper_00 | /296 | autobomb | booyahBomb | 190 |
| s3-spinner-downpour | Spinner_Downpour_00 | /289 | fizzy | inkjet | 210 |
| s3-spinner-serein | Spinner_Serein_00 | /307 | pointSensor | storm | 190 |
| s3-spinner-hypershort | Spinner_HyperShort_00 | /293 | curling | tacticooler | 200 |
| s3-maneuver-short | Maneuver_Short_00 | /109 | beakon | tacticooler | 180 |
| dualies | Maneuver_Normal_00 | /100 | suction | crabTank | 200 |
| s3-maneuver-gallon | Maneuver_Gallon_00 | /93 | splashWall | booyahBomb | 180 |
| s3-maneuver-dual | Maneuver_Dual_00 | /88 | bomb | waveBreaker | 200 |
| s3-maneuver-stepper | Maneuver_Stepper_00 | /114 | autobomb | reefslider | 200 |
| s3-maneuver-long | Maneuver_Long_00 | /97 | inkMine | killerWail | 190 |
| s3-shelter-normal | Shelter_Normal_00 | /169 | sprinkler | tripleInkstrike | 210 |
| s3-shelter-wide | Shelter_Wide_00 | /177 | beakon | inkVac | 190 |
| s3-shelter-compact | Shelter_Compact_00 | /161 | inkMine | reefslider | 180 |
| s3-shelter-focus | Shelter_Focus_00 | /166 | angleShooter | bubbler | 190 |
| s3-stringer-normal | Stringer_Normal_00 | /320 | toxicMist | killerWail | 190 |
| s3-stringer-short | Stringer_Short_00 | /327 | curling | tentaMissiles | 210 |
| s3-stringer-explosion | Stringer_Explosion_00 | /317 | autobomb | ultraStamp | 200 |
| s3-saber-normal | Saber_Normal_00 | /153 | burst | zipcaster | 210 |
| s3-saber-lite | Saber_Lite_00 | /149 | torpedo | ultraStamp | 190 |
| s3-saber-heavy | Saber_Heavy_00 | /146 | suction | bubbler | 210 |
