import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import {
  BIG_BUBBLER_CALIBRATION, BIG_BUBBLER_RAW, BIG_BUBBLER_SOURCE_RATES,
  bigBubblerDomes, bigBubblerSourceRate, bigBubblerSourceRow, clearBigBubblers,
  installKitBigBubbler, kitBarrierCandidate,
  tickBigBubblers,
} from '../runtime/kit-big-bubbler.mjs';
import { catalogueAttackRow } from '../runtime/sub-resistance.mjs';
import { fixture } from './kit-composed-fixture.mjs';

const sourceRates = JSON.parse(fs.readFileSync(new URL('./fixtures/bubbler-object-rates-1130.json', import.meta.url)));
const selectors = JSON.parse(fs.readFileSync(new URL('./fixtures/catalogue-attack-selectors-1130.json', import.meta.url)));

function ownerFor(record, objectShredder = false) {
  const weapon = { kind: record.family, catalogRecord: record };
  return { pos: {}, weapon, s3: { loadout:[{},{},{main:objectShredder?'objectShredder':'none'}],modifiers:{} } };
}

function projectileFor(owner, record, { type = 'shot', key = 'normal', charge = 0, full = false } = {}) {
  return { owner, s3Weapon: owner.weapon, type, full, damage: 20, pos: {},
    catalog: { r: record, descriptor: { key, charge } } };
}

test('Bubbler resolves every 11.3.0 source row for both targets and applies Object Shredder once', () => {
  assert.equal(Object.keys(sourceRates.rows).length, 115);
  const owner = { pos: {}, weapon: {}, s3: { modifiers: { objectShredder: false } } };
  for (const [row, rates] of Object.entries(sourceRates.rows)) {
    const p = { owner, pos: {}, s3BubblerRow: row };
    assert.equal(bigBubblerSourceRow(p), row, row);
    assert.equal(bigBubblerSourceRate(p, 'canopy'), rates[0], `${row} canopy`);
    assert.equal(bigBubblerSourceRate(p, 'field'), rates[1], `${row} field`);
    owner.s3.loadout=[{},{},{main:'objectShredder'}];
    assert.equal(bigBubblerSourceRate(p, 'canopy'), rates[0] * sourceRates.rows.ObjectEffect_Up[0], `${row} canopy + Object Shredder`);
    assert.equal(bigBubblerSourceRate(p, 'field'), rates[1] * sourceRates.rows.ObjectEffect_Up[1], `${row} field + Object Shredder`);
    owner.s3.loadout[2].main='none';
  }
});

test('all authored main-weapon attack variants select their exact Bubbler source row', () => {
  const phases = [
    { phase: 'Normal', type: 'shot', key: 'normal', charge: 0 },
    { phase: 'ExtraBombCore', type: 'area', key: 'normal', charge: 0 },
    { phase: 'FullCharge', type: 'beam', key: 'normal', charge: 1, full: true },
    { phase: 'RollerCore', type: 'roller', key: 'normal', charge: 0 },
    { phase: 'ShelterCanopy', type: 'canopy', key: 'normal', charge: 0 },
    { phase: 'ShooterVariableRepeat', type: 'shot', key: 'variable', charge: 0 },
    { phase: 'SaberShot', type: 'shot', key: 'normal', charge: 0 },
    { phase: 'SaberChargeShot', type: 'shot', key: 'saber-vertical', charge: 1 },
    { phase: 'SaberSlash', type: 'saber-melee', key: 'normal', charge: 0 },
    { phase: 'SaberChargeSlash', type: 'saber-melee', key: 'saber-vertical', charge: 1 },
  ];
  for (const record of MAIN_WEAPON_CATALOG.records) {
    const [fallback, extras] = selectors.selectors[record.sourceRow];
    assert.ok(fallback, `missing source selector for ${record.sourceRow}`);
    for (const phase of phases) {
      const authored = extras[phase.phase];
      if (!authored && phase.phase !== 'Normal') continue;
      const type = phase.phase === 'Normal' && record.family === 'roller' ? 'drop' :
        phase.phase === 'SaberShot' ? 'shot' : phase.type;
      const owner = ownerFor(record);
      const p = projectileFor(owner, record, { ...phase, type });
      const expected = phase.phase === 'Normal'
        ? extras.Normal || extras.SaberShot || fallback
        : authored;
      assert.equal(catalogueAttackRow(p, owner.weapon), expected, `${record.sourceRow} ${phase.phase} selector`);
      assert.equal(bigBubblerSourceRow(p), expected, `${record.sourceRow} ${phase.phase} Bubbler row`);
      assert.ok(sourceRates.rows[expected], `${expected} Bubbler source row exists`);
      assert.deepEqual([
        bigBubblerSourceRate(p, 'canopy'), bigBubblerSourceRate(p, 'field'),
      ], sourceRates.rows[expected], `${record.sourceRow} ${phase.phase} Bubbler rates`);
    }
  }
});

test('legacy specials, bomb contacts and the exported 17-row compatibility table use pinned values', () => {
  for (const [row, rates] of Object.entries(BIG_BUBBLER_SOURCE_RATES)) {
    assert.deepEqual([...rates], sourceRates.rows[row], `${row} exported compatibility values`);
  }
  const owner = { pos: {}, weapon: {}, s3: { modifiers: { objectShredder: false } } };
  const cases = [
    [{ wid: 'trizooka' }, 'UltraShot'],
    [{ wid: 'inkVac' }, 'BlowerExhale'],
    [{ s3SpecialWeapon: { id: 'inkVac' } }, 'BlowerExhale'],
    [{ type: 'bomb', s3InkVacBomb: { s3Sub: { id: 'bomb' } } }, 'Bomb_DirectHit'],
    [{ type: 'bomb', s3InkVacBomb: { s3Sub: { id: 'suction' } } }, 'Bomb_Suction'],
    [{ type: 'bomb', s3InkVacBomb: { s3Sub: { id: 'curling' } } }, 'Bomb_CurlingBullet'],
    [{ type: 'blast', s3BubblerRow: 'BlowerExhale_BombCore' }, 'BlowerExhale_BombCore'],
    [{ type: 'blast', s3BubblerRow: 'Blaster_BlasterMiddle' }, 'Blaster_BlasterMiddle'],
  ];
  for (const [fields, row] of cases) {
    const p = { ...fields, owner, pos: {} };
    assert.equal(bigBubblerSourceRow(p), row, `${row} special selector`);
    assert.equal(bigBubblerSourceRate(p, 'canopy'), sourceRates.rows[row][0], `${row} canopy`);
    assert.equal(bigBubblerSourceRate(p, 'field'), sourceRates.rows[row][1], `${row} field`);
  }
});

test('Bubbler contact applies exact attack phase, raw HP conversion and target ratio once', async () => {
  const f = await fixture();
  const scene = new f.THREE.Scene();
  f.G.scene = scene;
  f.G.projectiles = new f.Projectiles(scene);
  f.SPECIALS.bubbler = { id: 'bubbler', name: 'Big Bubbler', blurb: 'dome', cost: 180 };
  const api = { ...f, Actor: f.Actor, Projectiles: f.Projectiles, THREE: f.THREE, G: f.G,
    PLAYER: f.PLAYER, emit: f.emit, SPECIALS: f.SPECIALS };
  installKitBigBubbler(api, { ...f.profile, kits: { bigBubbler: { timeDamageIntervalSeconds: 1e9 } } });
  clearBigBubblers('source-rate-test');

  const deployer = f.make('roller');
  deployer.team = 0; deployer.pos.set(0, 0, 0); deployer.yaw = deployer.aimYaw = 0;
  deployer.weapon = { ...deployer.weapon, special: 'bubbler' };
  deployer.special = deployer.specialCost();
  deployer._startSpecial();
  const dome = bigBubblerDomes()[0];
  assert.ok(dome);
  for (let i = 0; i < 90; i++) tickBigBubblers(1 / 60);

  const record = MAIN_WEAPON_CATALOG.records.find(r => r.sourceRow === 'Charger_Long_00');
  const attacker = f.make('charger'); attacker.team = 1; attacker.alive = true;
  const weapon = { ...attacker.weapon, kind: 'charger', catalogRecord: record };
  const makeProjectile = (y, type = 'beam') => {
    const start = new f.THREE.Vector3(dome.pos.x, y, dome.pos.z - 10);
    const end = new f.THREE.Vector3(dome.pos.x, y, dome.pos.z + 10);
    return { start, end, p: { owner: attacker, s3Weapon: weapon, catalog: { r: record, descriptor: { key: 'normal', charge: 1 } },
      type, full: true, team: attacker.team, damage: 10, size: 0, pos: end } };
  };

  let ray = makeProjectile(1.2);
  let hit = kitBarrierCandidate(ray.p, ray.start, ray.end);
  assert.ok(hit && hit.target === 'canopy');
  assert.equal(hit.damage, 10 * 2.3 * BIG_BUBBLER_CALIBRATION.rawPerDamageUnit * BIG_BUBBLER_RAW.damageRatio,
    'Charger_Long FullCharge uses 2.3x, /10-normalized raw HP, then canopy-only .64');
  hit.onHit();
  assert.equal(dome.hp, dome.hpMax - hit.damage);

  ray = makeProjectile(dome.pos.y + dome.emitterY);
  hit = kitBarrierCandidate(ray.p, ray.start, ray.end);
  assert.ok(hit && hit.target === 'field');
  assert.equal(hit.damage, 10 * 1.725 * BIG_BUBBLER_CALIBRATION.rawPerDamageUnit,
    'the same attack phase selects its distinct weak-point rate and skips canopy ratio');
  hit.onHit();
  assert.equal(dome.fieldHp, dome.fieldHpMax - hit.damage);

  const secondDeployer = f.make('roller');
  secondDeployer.team = 0; secondDeployer.pos.set(0, 0, 30); secondDeployer.yaw = secondDeployer.aimYaw = 0;
  secondDeployer.weapon = { ...secondDeployer.weapon, special: 'bubbler' };
  secondDeployer.special = secondDeployer.specialCost();
  secondDeployer._startSpecial();
  const secondDome = bigBubblerDomes().find(value => value !== dome);
  assert.ok(secondDome, 'a second hostile Bubbler is present on the piercing beam path');

  const beamStart = new f.THREE.Vector3(dome.pos.x, 1.2, dome.pos.z - 10);
  const beamEnd = new f.THREE.Vector3(dome.pos.x, 1.2, secondDome.pos.z + 10);
  attacker.s3.loadout[2].main='objectShredder';
  const before = [dome.hp, secondDome.hp];
  const hits = [];
  const stop = f.on('kit:bubbler:hit', event => hits.push(event));
  const applied = api.G.projectiles.damageBigBubblerFromBeam(attacker, beamStart, beamEnd, 3.5, 'MicroLaser');
  stop();
  const expectedBeam = 3.5 * sourceRates.rows.MicroLaser[0] * sourceRates.rows.ObjectEffect_Up[0] *
    BIG_BUBBLER_CALIBRATION.rawPerDamageUnit * BIG_BUBBLER_RAW.damageRatio;
  assert.ok(Math.abs(applied - 2 * expectedBeam) < 1e-9,
    'piercing Wail reaches both domes and applies the source row and gear once per target');
  assert.deepEqual([dome.hp, secondDome.hp], [before[0] - expectedBeam, before[1] - expectedBeam]);
  assert.deepEqual(hits.map(event => event.domeId).sort(), [dome.id, secondDome.id].sort(),
    'each dome receives exactly one authoritative callback');
  assert.ok(hits.every(event => event.cause === 'MicroLaser' && Math.abs(event.amount - expectedBeam) < 1e-9));
  assert.equal(beamStart.z, dome.pos.z - 10);
  assert.equal(beamEnd.z, secondDome.pos.z + 10, 'the beam segment remains available to continue through both domes');
});
