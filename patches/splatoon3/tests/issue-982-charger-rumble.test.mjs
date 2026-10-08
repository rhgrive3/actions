// #982: only Charger releases at >=50% charge should request gamepad rumble.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { installChargerFlight } from '../runtime/weapons-charger-flight.mjs';

test('local Charger rumble starts at 50%, not on lower legal partial shots', async () => {
  const f = await fixture(), { THREE, G, WEAPONS, Hit, PLAYER, profile } = f;
  const requests = [];
  G.input = { rumble: (...args) => requests.push(args) };
  class ShotSystem {
    constructor() { this.beams = []; }
    _muzzle(_actor, out) { return out.set(0, 1.05, 0.3); }
    _aimFrom(_actor, _origin, out) { return out.set(0, 0, 1); }
    _ghostBeam() { this.beams.push({mesh: {scale: {z: 0}, material: {uniforms: {uLen: {value: 0}}}}}); }
    ghostFire() {}
    update() {}
    clear() {}
  }
  installChargerFlight({ Projectiles: ShotSystem, WEAPONS, THREE, G, Hit, PLAYER, emit() {} },
    profile.weaponsFidelityCompletion);
  const actor = {
    pos: new THREE.Vector3(), team: 0, form: 'kid', alive: true,
    aimDir: new THREE.Vector3(0, 0, 1),
    weaponRunner: {chargeT: 1}, character: {},
    isLocal: true, _nearCamera: () => false, addTurf() {}
  };
  const system = new ShotSystem(), weapon = WEAPONS.charger;
  for (const charge of [0.25, 0.4999]) system.fireCharger(actor, weapon, charge);
  assert.equal(requests.length, 0, 'no rumble below 50%');
  for (const charge of [0.5, 1]) system.fireCharger(actor, weapon, charge);
  assert.equal(requests.length, 2, 'boundary and full-charge shots rumble');
  for (const args of requests) assert.ok(args[0] > 0 && args[1] > 0 && args[2] > 0);
  const sent = requests.length;
  system.ghostFire(actor, { weapon: weapon.id, charge: 1,
    muzzle: new THREE.Vector3(0, 1.05, 0.3), dir: new THREE.Vector3(0, 0, 1) });
  assert.equal(requests.length, sent, 'ghost never duplicates local rumble');
});
