import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

const lock = a => a.s3?.chargerInterruptRecover || 0;

test('#1070 cancelling a stored charge holds ink refill through the verified 3F boundary', async () => {
  const f = await fixture(), a = f.make('charger');
  a.ink = 100;
  a.intent.fire = true;
  f.tick(a, 61);
  assert.equal(a.weaponRunner.charge, 1, 'precondition: full charge');
  a.intent.squid = true;
  f.tick(a);
  assert.ok(a.weaponRunner.s3Stored, 'precondition: full charge is stored');
  assert.ok(lock(a) <= 1e-10, 'storage itself does not start the cancel lock');

  f.tick(a, 5);
  a.ink = 50;
  a.intent.fire = false;
  f.tick(a);
  assert.equal(a.weaponRunner.s3Stored, null);
  assert.ok(Math.abs(lock(a) - 3 / 60) < 1e-10,
    'stored-charge release arms a 3F refill-only lock');
  assert.equal(a.ink, 50, 'no refill on cancellation tick');

  f.tick(a);
  assert.equal(a.ink, 50, 'C+1 remains locked');
  f.tick(a);
  assert.equal(a.ink, 50, 'C+2 remains locked');
  f.tick(a);
  assert.ok(a.ink > 50, 'refill becomes eligible at the 3F boundary');
});
