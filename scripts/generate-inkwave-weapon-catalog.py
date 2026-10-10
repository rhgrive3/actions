#!/usr/bin/env python3
"""Curate numerical main-weapon records from the pinned, external reference.

Input is kept outside the repository. No models, strings other than names, gear
tables, executable game code or complete source archive is redistributed.
"""
import argparse
import hashlib
import json
from pathlib import Path

COMMIT = '7280ff9cde8bb1c5dcef46c700c326471584d2e6'
ROOT = Path(__file__).resolve().parents[1]
LEGACY = {'WeaponShooterNormal': 'shooter', 'WeaponRollerNormal': 'roller',
          'WeaponChargerNormal': 'charger', 'WeaponBlasterMiddle': 'blaster',
          'WeaponManeuverNormal': 'dualies', 'WeaponSlosherStrong': 'slosher',
          'WeaponSpinnerStandard': 'splatling'}
FAMILIES = {'Shooter': ('shooter', 'shooter'), 'Blaster': ('blaster', 'blaster'),
            'Roller': ('roller', 'roller'), 'Brush': ('brush', 'roller'),
            'Charger': ('charger', 'charger'), 'Maneuver': ('dualies', 'dualies'),
            'Slosher': ('slosher', 'slosher'), 'Spinner': ('splatling', 'splatling'),
            'Shelter': ('brella', 'shooter'), 'Stringer': ('stringer', 'charger'),
            'Saber': ('splatana', 'shooter')}
# Only numerical groups read by the catalog interpreter. Cosmetic/gear fields
# are deliberately absent; pointers still refer to the original source layout.
GROUPS = {'WeaponParam', 'WeaponFullChargeParam', 'VariableWeaponParam', 'VariableShotParam',
          'MoveParam', 'DamageParam', 'CollisionParam', 'CollisionLapOverParam', 'VariableCollisionParam',
          'VariableMoveParam', 'VariableDamageParam', 'MoveJumpParam', 'DamageJumpParam', 'BlastJumpParam',
          'BlasterBurstJumpParam', 'PaintParam',
          'VariablePaintParam', 'SplashPaintParam', 'VariableSplashPaintParam',
          'SplashSpawnParam', 'VariableSplashSpawnParam', 'SplashSpawnLapOverParam', 'BlastParam',
          'BlasterParam', 'BlasterBurstParam', 'SideStepParam', 'WeaponDivideChargerParam', 'WeaponScopeParam', 'WeaponKeepChargeParam', 'MoveLapOverParam', 'DamageLapOverParam',
          'BodyParam', 'WeaponRollParam', 'WeaponSwingParam',
          'WeaponWideSwingParam', 'WeaponVerticalSwingParam',
          'SwingUnitGroupParam', 'WideSwingUnitGroupParam',
          'VerticalSwingUnitGroupParam', 'UnitGroupParam', 'BounceGroupParam',
          'NearestParam', 'spl__WeaponShelterCanopyParam',
          'spl__WeaponShelterShotgunParam', 'spl__BulletShelterShotgunParam',
          'spl__BulletShelterCanopyParam', 'spl__WeaponStringerParam',
          'spl__BulletStringerParam', 'spl__WeaponSaberParam',
          'BulletSaberHorizontalParam', 'BulletSaberVerticalParam',
          'BulletSaberSlashHorizontalParam', 'BulletSaberSlashVerticalParam',
          'MainEffectiveRangeUpParam', 'spl__SpawnBulletAdditionMovePlayerParam'}
EXCLUDED = {'DrawParam', 'DrawSizeParam', 'Effect1stParam', 'Effect2ndParam',
            'ShotGuideParam', 'PlayerParam', 'GuideParam', 'KnockBackParam',
            'KnockBackOpponent', 'KnockBackRollerPlayerDamageOff',
            'KnockBackRollerPlayerDamageOn', 'WallDropMoveParam',
            'WallDropCollisionPaintParam', 'ShotgunWallDropMoveParam',
            'SplashWallDropMoveParam', 'SplashWallDropCollisionParam'}


def curate(value):
    if isinstance(value, dict):
        return {k: curate(v) for k, v in value.items()
                if k != '$type' and k not in EXCLUDED and not isinstance(v, str)}
    if isinstance(value, list):
        return [curate(v) for v in value]
    return value


def generate(source):
    info = json.loads((source / 'data/mush/1130/WeaponInfoMain.json').read_text())
    names = {lang: json.loads((source / f'data/language/{file}.json').read_text())
             ['CommonMsg/Weapon/WeaponName_Main']
             for lang, file in [('en', 'USen'), ('ja', 'JPja')]}
    rows = {}
    for index, row in enumerate(info):
        # Every standard main's canonical kit row ends in _00. Some starters
        # (notably Shooter_First_00 / わかばシューター) intentionally have a
        # negative shop rank, so shop unlock state cannot select source identity.
        if row['Type'] != 'Versus' or not row['__RowId'].endswith('_00'):
            continue
        actor = row['SpecActor'].split('/')[-1].split('.')[0]
        if '_' in actor:  # Alternate kits/collaboration actors share the main.
            continue
        assert actor not in rows, f'Duplicate canonical _00 row for {actor}'
        rows[actor] = (index, row)
    assert len(rows) == 65, f'Unexpected base-main coverage: {len(rows)}'
    records = []
    for actor, (index, row) in sorted(rows.items(), key=lambda x: x[1][1]['Id']):
        rel = f'data/parameter/1130/weapon/{actor}.game__GameParameterTable.json'
        raw = (source / rel).read_bytes()
        params = json.loads(raw)['GameParameters']
        family = next(key for key in FAMILIES if actor.startswith('Weapon' + key))
        behavior, model = FAMILIES[family]
        records.append({'id': LEGACY.get(actor, 's3-' + row['__RowId'].removesuffix('_00').lower().replace('_', '-')),
                        'legacy': actor in LEGACY, 'family': behavior, 'modelKind': model,
                        'names': {lang: table[row['__RowId']] for lang, table in names.items()},
                        'sourceActor': actor, 'sourceRow': row['__RowId'],
                        'sourcePath': rel, 'sourceSha256': hashlib.sha256(raw).hexdigest(),
                        'rowPointer': f'/{index}', 'matchmakingRange': row['Range'],
                        'ui': row['UIParam'],
                        'parameters': {k: curate(v) for k, v in params.items() if k in GROUPS}})
    out = ROOT / 'patches/splatoon3/runtime/main-weapon-catalog-data.mjs'
    text = '// Generated numerical records. Rebuild with scripts/generate-inkwave-weapon-catalog.py.\n'
    text += '// Frames: 60 Hz; distance: existing INKWAVE source-unit bridge; damage: source / 10.\n'
    # Lossless key interning keeps the existing 5MiB boot-cache budget. Arrays
    # carry their own tag, so numeric source arrays cannot be confused with objects.
    keys = []
    indexes = {}
    def pack(value):
        if isinstance(value, dict):
            out = [0]
            for key, item in value.items():
                if key not in indexes:
                    indexes[key] = len(keys)
                    keys.append(key)
                out.extend([indexes[key], pack(item)])
            return out
        if isinstance(value, list):
            return [1] + [pack(item) for item in value]
        return value
    packed = pack({'schema': 1, 'referenceVersion': '11.3.0', 'sourceCommit': COMMIT, 'records': records})
    encode = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))
    text += 'const keys = ' + encode(keys) + ';\n'
    text += 'function unpack(v) { if (!Array.isArray(v)) return v; if (v[0]===1) return v.slice(1).map(unpack); const o={}; for(let i=1;i<v.length;i+=2)o[keys[v[i]]]=unpack(v[i+1]); return o; }\n'
    text += 'export const MAIN_WEAPON_CATALOG = unpack(' + encode(packed) + ');\n'
    out.write_text(text)
    print(f'{len(records)} base mains, {sum(not r["legacy"] for r in records)} additions; {out.stat().st_size} bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    generate(parser.parse_args().source)
