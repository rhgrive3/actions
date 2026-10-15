# INKWAVE: Splatoon 3 Ver.11.3.0 alternate weapon-kit registration

## Scope

Adds all 95 non-replica alternate main-weapon kits: 65 rows ending `_01`
and 30 rows ending `_02`. Together with the existing 65 base main weapons,
this exposes 160 regular battle weapon choices. The 14 replica appearances
are intentionally excluded; no replica IDs or meshes are added.

The implementation is **data-only**. Each alternate keeps the base weapon's
procedural geometry, cached model, native hand/hold sockets, main-weapon
parameters, source actor and attack logic. **It does not recreate an alternate
skin, palette, icon, texture or mesh.** INKWAVE remains a reconstruction,
not a retail-asset loader.

## Ground truth and boundaries

- Splatoon 3 target: **11.3.0**.
- Source: [Leanny/splat3, pinned commit `7280ff9`](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6).
- Kit rows: `data/mush/1130/WeaponInfoMain.json`, `__RowId`, `SubWeapon`,
  `SpecialWeapon`, `SpecialPoint`. Base `_00` matches the 65 records
  already present in `main-weapon-catalog-data.mjs`.
- Official Japanese/English display names come from
  `data/language/JPja.json` and `USen.json` under
  `CommonMsg/Weapon/WeaponName_Main`, from the same pinned commit.
- All 95 alternate IDs follow `<existing-base-id>-01/-02`; the original
  65 IDs remain unchanged.
- Existing 14 sub and 19 special implementations are reused, including
  `SpFirework` (Super Chump), `SpCastle` (Kraken Royale), `SpPogo`
  (Triple Splashdown) and `SpChimney` (Splattercolor Screen), which do
  not all occur in the original set of 65 base-kit rows.

## Implementation and comparisons

- `alternate-weapon-kits-data.mjs` contains the 95 pinned identities,
  names, sub/special keys and special point thresholds.
- `alternate-weapon-kits.mjs` validates *all* parent entries and kit
  mechanics first, then adds playable entries; no partial registration.
  Variants are placed adjacent to their corresponding base weapons in
  `WEAPON_ORDER`. They keep independent kit IDs and save slots.
- `install.mjs` registers variants after `completeBaseKits` and after
  the sub/special mechanics are installed, so source kit slots cannot be
  overwritten by early partial-kit composition.
- `weapon-models/registry.mjs` resolves a variant's mesh/cache key to its
  exact existing base weapon. No new geometry is built or registered.
- Gameplay stays on the **existing INKWAVE implementation**. Shot speed,
  damage, ink consumption, paint and pose are inherited rather than
  reimplemented. This ensures no intended difference **within INKWAVE**
  between a base and its variant main weapon, not exact Nintendo parity.
- **Known deliberate visual difference**: alternate skins, logos and paint
  are not represented. The base model is shown instead. Detailed retail
  motion and sound parity for these variants remain unverified.

## Validation

`patches/splatoon3/tests/alternate-weapon-kits.test.mjs` checks all 95
IDs, Japanese/English names, grouped order, official kit/SP data,
atomic validation, base-model alias identity and representative
projectile emission. The optional
`INKWAVE_MAIN_WEAPON_REFERENCE=/path/to/splat3` test cross-checks the
pinned raw row identities and names. The existing 65-base model
geometry tests remain unchanged and require no additional meshes.

Full browser, gameplay, online-multiplayer, Switch-capture and 30/60/120Hz
retail-equivalence testing are separate work; registration does not imply
those comparisons are complete.
