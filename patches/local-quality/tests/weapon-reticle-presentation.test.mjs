// Presentation-only unit coverage. These tests establish no browser or retail pixel parity.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  weaponReticleFamily,
  legacyReticleKind,
  readWeaponReticlePresentation,
} from '../weapon-reticle-presentation.mjs';

const families = ['shooter', 'blaster', 'roller', 'dualies', 'slosher', 'splatling',
  'charger', 'stringer', 'splatana', 'brush', 'brella'];
const legacy = {stringer: 'charger', splatana: 'charger', brush: 'roller', brella: 'shooter'};
const catalog = (family, id = `test-${family}`) => ({
  id, kind: 'catalog', behaviorKind: family, modelKind: legacy[family] || family,
  catalogRecord: {id, family},
});
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

test('all eleven identities remain distinct while legacy shape compatibility stays separate', () => {
  for (const family of families) {
    for (const weapon of [{kind: family}, catalog(family), catalog(family, `test-${family}-01`)]) {
      assert.equal(weaponReticleFamily(weapon), family);
      const view = readWeaponReticlePresentation(weapon, {});
      assert.equal(view.family, family);
      assert.equal(view.legacyKind, legacy[family] || family);
    }
    assert.equal(legacyReticleKind(family), legacy[family] || family);
  }
});

test('family precedence is behavior, catalog record, native kind, then model fallback', () => {
  assert.equal(weaponReticleFamily({behaviorKind: 'brella', catalogRecord: {family: 'stringer'}, kind: 'charger', modelKind: 'roller'}), 'brella');
  assert.equal(weaponReticleFamily({catalogRecord: {family: 'stringer'}, kind: 'charger', modelKind: 'roller'}), 'stringer');
  assert.equal(weaponReticleFamily({kind: 'charger', modelKind: 'roller'}), 'charger');
  assert.equal(weaponReticleFamily({kind: 'catalog', modelKind: 'roller'}), 'roller');
  assert.equal(weaponReticleFamily({modelKind: 'brush'}), 'brush');
  for (const family of ['unknown', '__proto__', 'constructor', '', null, undefined, {}, Symbol('family')]) {
    assert.equal(legacyReticleKind(family), 'shooter');
    assert.equal(weaponReticleFamily({behaviorKind: family}), null);
  }
  assert.equal(weaponReticleFamily({behaviorKind: 'unknown', modelKind: 'shooter'}), null,
    'an explicit unsupported authoritative family must not silently become another family');
});

test('absent input has a bounded primitive-only neutral presentation', () => {
  assert.deepEqual(readWeaponReticlePresentation(), {
    weaponId: null, family: null, legacyKind: 'shooter', charge: 0,
    charging: false, streaming: false, bowTiltDegrees: 0,
    canopyOpen: false, canopyPreparing: false, saberSwingKey: null,
  });
});

test('charge is finite and bounded; charging and streaming require actual booleans', () => {
  for (const [charge, expected] of [[0, 0], [.375, .375], [1, 1], [-1, 0], [2, 1],
    [NaN, 0], [Infinity, 0], [-Infinity, 0], ['1', 0], [undefined, 0]]) {
    const view = readWeaponReticlePresentation({kind: 'charger'}, {charge, charging: true, streaming: true});
    assert.equal(view.charge, expected);
    assert.equal(view.charging, true);
    assert.equal(view.streaming, true);
  }
  for (const value of [false, 0, 1, 'true', {}, null, undefined]) {
    const view = readWeaponReticlePresentation({kind: 'charger'}, {charging: value, streaming: value});
    assert.equal(view.charging, false);
    assert.equal(view.streaming, false);
  }
});

test('catalog presentation reads existing bow/canopy/saber state only for the matching weapon ID', () => {
  const state = {id: 'active', bowTilt: 42, canopy: {open: true, preparing: true}, saberSwing: {key: 'saber-vertical'}};
  for (const family of ['stringer', 'brella', 'splatana']) {
    const weapon = catalog(family, 'active');
    const live = readWeaponReticlePresentation(weapon, {catalogState: state});
    assert.equal(live.bowTiltDegrees, family === 'stringer' ? 42 : 0);
    assert.equal(live.canopyOpen, family === 'brella');
    assert.equal(live.canopyPreparing, family === 'brella');
    assert.equal(live.saberSwingKey, family === 'splatana' ? 'saber-vertical' : null);
    for (const staleId of ['previous', null, undefined, 123]) {
      const stale = readWeaponReticlePresentation(weapon, {catalogState: {...state, id: staleId}});
      assert.equal(stale.bowTiltDegrees, 0);
      assert.equal(stale.canopyOpen, false);
      assert.equal(stale.canopyPreparing, false);
      assert.equal(stale.saberSwingKey, null);
    }
  }
  assert.equal(readWeaponReticlePresentation({id: 'native', kind: 'stringer'}, {catalogState: {...state, id: 'native'}}).bowTiltDegrees, 42);
});

test('invalid catalog detail never invents tilt, canopy state or attack classification', () => {
  for (const bowTilt of [NaN, Infinity, -Infinity, '45', undefined]) {
    assert.equal(readWeaponReticlePresentation(catalog('stringer'), {catalogState: {id: 'test-stringer', bowTilt}}).bowTiltDegrees, 0);
  }
  for (const key of ['saber-horizontal', 'saber-vertical', 'unknown', {}, undefined]) {
    assert.equal(readWeaponReticlePresentation(catalog('splatana'), {catalogState: {id: 'test-splatana', saberSwing: {key}}}).saberSwingKey,
      typeof key === 'string' && key.startsWith('saber-') ? key : null);
  }
  const canopy = readWeaponReticlePresentation(catalog('brella'), {catalogState: {id: 'test-brella', canopy: {open: 1, preparing: 'true'}}});
  assert.equal(canopy.canopyOpen, false);
  assert.equal(canopy.canopyPreparing, false);
});

test('reusing one output across families and missing state clears every stale presentation field', () => {
  const out = {};
  const sequence = [
    [catalog('brella', 'x'), {charge: 1, charging: true, streaming: true, catalogState: {id: 'x', canopy: {open: true, preparing: true}}}],
    [catalog('stringer', 'x'), {charge: .5, catalogState: {id: 'x', bowTilt: 90}}],
    [catalog('splatana', 'x'), {catalogState: {id: 'x', saberSwing: {key: 'saber-horizontal'}}}],
    [{kind: 'shooter'}, {}], [undefined, undefined],
  ];
  for (const [weapon, runner] of sequence) {
    assert.strictEqual(readWeaponReticlePresentation(weapon, runner, out), out);
    assert.deepEqual(out, readWeaponReticlePresentation(weapon, runner));
    assert(Object.values(out).every(value => value === null || ['string', 'number', 'boolean'].includes(typeof value)));
  }
  for (let i = 0; i < 10_000; i++) assert.strictEqual(readWeaponReticlePresentation({kind: 'shooter'}, {}, out), out);
});

test('input objects remain unchanged even when deeply frozen; authoritative output aliases fail before writes', () => {
  const weapon = freeze(catalog('brella', 'active'));
  const runner = freeze({charge: .75, charging: true, catalogState: {
    id: 'active', canopy: {open: true, preparing: false}, saberSwing: {key: 'saber-vertical'},
  }});
  const before = JSON.stringify({weapon, runner});
  assert.equal(readWeaponReticlePresentation(weapon, runner).charge, .75);
  for (const alias of [weapon, weapon.catalogRecord, runner, runner.catalogState,
    runner.catalogState.canopy, runner.catalogState.saberSwing]) {
    assert.throws(() => readWeaponReticlePresentation(weapon, runner, alias), /must not alias/);
  }
  assert.equal(JSON.stringify({weapon, runner}), before);
});

test('weapon ID copies only strings, prefers the catalog ID and never leaks an object reference', () => {
  assert.equal(readWeaponReticlePresentation({id: 'native', catalogRecord: {id: 'catalog'}}).weaponId, 'catalog');
  assert.equal(readWeaponReticlePresentation({id: 'native'}).weaponId, 'native');
  for (const id of [{}, [], 123, NaN, Symbol('id'), false]) {
    const view = readWeaponReticlePresentation({id}, {catalogState: {id, bowTilt: 90}});
    assert.equal(view.weaponId, null);
    assert.equal(view.bowTiltDegrees, 0);
  }
});
