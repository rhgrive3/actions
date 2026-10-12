import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogPaintRadiusLimit } from '../catalog-paint-admission.mjs';
import {MAIN_WEAPON_CATALOG} from '../../splatoon3/runtime/main-weapon-catalog-data.mjs';
import {kitPaintRadiusAllowed} from '../kit-paint-admission.mjs';

function makeActor(owner, catalogRecord) {
  return { owner, weapon: catalogRecord ? { catalogRecord } : { id: 'legacy-weapon' } };
}

function makeNetwork(...actors) {
  return { byNid: new Map(actors.map((actor, index) => [index + 1, actor])) };
}

test('catalog paint radius limit is zero for existing actors and a different owner', () => {
  const from = { id: 'owner-a' };
  const other = { id: 'owner-b' };
  const existing = makeActor(from, null);
  const catalogOwnedByOther = makeActor(other, {
    legacy: false,
    parameters: { PaintRadius: 7 },
  });

  assert.equal(catalogPaintRadiusLimit(makeNetwork(existing), from), 0);
  assert.equal(catalogPaintRadiusLimit(makeNetwork(catalogOwnedByOther), from), 0);
});

test('a new catalog weapon admits its source paint radius and ignores unrelated damage', () => {
  const from = { id: 'owner-a' };
  const actor = makeActor(from, {
    legacy: false,
    parameters: {
      shot: {
        PaintRadius: 4.5,
        Damage: 1000,
      },
    },
  });

  assert.equal(catalogPaintRadiusLimit(makeNetwork(actor), from), 4.5);
});

test('the largest allowed radius across owned non-legacy catalog weapons wins', () => {
  const from = { id: 'owner-a' };
  const actors = [
    makeActor(from, { legacy: false, parameters: { shot: { PaintRadius: 2.25 } } }),
    makeActor(from, { legacy: false, parameters: { shelter: { CanopyPaintRadius: 4.5 } } }),
    makeActor(from, { legacy: false, parameters: { charge: { RadiusMaxCharge: 3.75 } } }),
    makeActor(from, { legacy: true, parameters: { PaintRadius: 99 } }),
  ];

  assert.equal(catalogPaintRadiusLimit(makeNetwork(...actors), from), 4.5);
});

test('zero, negative, and non-finite catalog radius values do not raise the limit', () => {
  const from = { id: 'owner-a' };
  const actor = makeActor(from, {
    legacy: false,
    parameters: {
      PaintRadius: 0,
      PaintRadiusGround: -1,
      PaintRadiusShock: Number.POSITIVE_INFINITY,
      CanopyPaintRadius: Number.NaN,
      RadiusFullCharge: 1.25,
    },
  });

  assert.equal(catalogPaintRadiusLimit(makeNetwork(actor), from), 1.25);
});

test('Luna Blaster source splash drops retain their 3.84 radius on terrain replay',()=>{
 const record=MAIN_WEAPON_CATALOG.records.find(r=>r.id==='s3-blaster-short');
 const radius=record.parameters.BlasterBurstParam.SplashDropPaintRadius;
 assert.equal(radius,3.84);
 const nm=makeNetwork(makeActor('host',record));
 assert.equal(catalogPaintRadiusLimit(nm,'host'),radius);
 const row=[0,'s',-11,8,-55,radius,0,.3125,'shot',0,0,0,0,49428];
 assert.equal(kitPaintRadiusAllowed(nm,'host',row,5.2*.72),true);
 assert.equal(kitPaintRadiusAllowed(nm,'other',row,5.2*.72),false);
 const forged=[...row];forged[5]=radius+.001;
 assert.equal(kitPaintRadiusAllowed(nm,'host',forged,5.2*.72),false);
});
