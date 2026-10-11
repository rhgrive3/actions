#!/usr/bin/env python3
"""Curate numerical main-weapon records from the pinned, external reference.

Input is kept outside the repository. No models, strings other than names, gear
tables, executable game code or complete source archive is redistributed.
"""
import argparse
import base64
from collections import Counter
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
GROUPS = {'MainWeaponSetting', 'spl__PlayerGearSkillParam_ActionSpecUp_ReduceJumpSwerveRate',
          'WeaponParam', 'WeaponFullChargeParam', 'VariableWeaponParam', 'VariableShotParam',
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
    # Canonical actor/path are deterministically reconstructed from the source
    # row. Assert the relation for every input before removing duplicate text.
    for record in records:
        actor = 'Weapon' + record['sourceRow'].removesuffix('_00').replace('_', '')
        assert actor == record['sourceActor']
        assert record['sourcePath'] == f'data/parameter/1130/weapon/{actor}.game__GameParameterTable.json'
        del record['sourceActor']
        del record['sourcePath']
        if not record['legacy']:
            assert record['id'] == 's3-' + record['sourceRow'].removesuffix('_00').lower().replace('_', '-')
            del record['id']
        assert record['modelKind'] == {'brush':'roller','brella':'shooter','stringer':'charger','splatana':'shooter'}.get(record['family'],record['family'])
        del record['modelKind']
        record['sourceSha256'] = base64.b64encode(bytes.fromhex(record['sourceSha256'])).decode('ascii')
        record['rowPointer'] = int(record['rowPointer'][1:])
    packed = pack({'schema': 1, 'referenceVersion': '11.3.0', 'sourceCommit': COMMIT, 'records': records})
    encode = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))
    counts = Counter()
    def count(v):
        if isinstance(v, list):
            encoded = encode(v)
            if len(encoded) >= 8: counts[encoded] += 1
            for item in v: count(item)
    count(packed)
    repeated = sorted((v for v, n in counts.items() if n > 1 and (len(v)-8)*n>len(v)+1), key=len)
    references = {v: i for i, v in enumerate(repeated)}
    def compact(v, root=True):
        if not isinstance(v, list): return v
        if root and encode(v) in references: return [2, references[encode(v)]]
        return [compact(item) for item in v]
    table = [compact(json.loads(v), False) for v in repeated]
    packed = compact(packed)
    # Byte-for-byte LZ backreferences on ASCII JSON, decoded synchronously.
    # This reduces the complete cold-offline payload without rounding values,
    # adding an external codec or removing any runtime/reference field.
    serial = json.dumps([keys,table,packed],ensure_ascii=True,separators=(',', ':'))
    positions = {}
    rows = []
    literal = ''
    cursor = 0
    while cursor < len(serial):
        tag = serial[cursor:cursor+4]
        best_length = 0
        best_position = 0
        for previous in reversed(positions.get(tag, [])):
            length = 4
            while cursor+length < len(serial) and length < 512 and serial[previous+length] == serial[cursor+length]: length += 1
            if length > best_length: best_length, best_position = length, previous
        take = best_length if best_length >= 16 else 1
        if take > 1:
            if literal: rows.append(literal); literal = ''
            rows.append([cursor-best_position,take])
        else: literal += serial[cursor]
        for index in range(cursor,cursor+take):
            key = serial[index:index+4]
            slots = positions.setdefault(key,[]); slots.append(index)
            if len(slots) > 64: del slots[0]
        cursor += take
    if literal: rows.append(literal)
    text += "function expand(rows){let s='';for(const r of rows){if(typeof r==='string')s+=r;else for(let i=0;i<r[1];i++)s+=s[s.length-r[0]];}return JSON.parse(s);}\n"
    text += 'const [keys,table,packed] = expand(' + encode(rows) + ');\n'
    text += 'function unpack(v) { if (!Array.isArray(v)) return v; if(v[0]===2)return unpack(table[v[1]]); if (v[0]===1) return v.slice(1).map(unpack); const o={}; for(let i=1;i<v.length;i+=2)o[keys[v[i]]]=unpack(v[i+1]); return o; }\n'
    text += 'export const MAIN_WEAPON_CATALOG = unpack(packed);\n'
    text += "const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';function hex(s){let out='';for(let i=0;i<s.length;i+=4){let n=0;for(let j=0;j<4;j++)n=n*64+(alphabet.indexOf(s[i+j])&63);out+=n.toString(16).padStart(6,'0');}return out.slice(0,64);}\n"
    text += "for(const r of MAIN_WEAPON_CATALOG.records){const row=r.sourceRow.slice(0,-3);r.sourceActor='Weapon'+row.replaceAll('_','');r.sourcePath='data/parameter/1130/weapon/'+r.sourceActor+'.game__GameParameterTable.json';if(!r.legacy)r.id='s3-'+row.toLowerCase().replaceAll('_','-');r.modelKind=({brush:'roller',brella:'shooter',stringer:'charger',splatana:'shooter'})[r.family]||r.family;r.sourceSha256=hex(r.sourceSha256);r.rowPointer='/'+r.rowPointer;}\n"
    temporary = out.with_suffix(out.suffix + '.tmp')
    temporary.write_text(text, encoding='utf-8')
    temporary.replace(out)
    print(f'{len(records)} base mains, {sum(not r["legacy"] for r in records)} additions; {out.stat().st_size} bytes')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    generate(parser.parse_args().source)
