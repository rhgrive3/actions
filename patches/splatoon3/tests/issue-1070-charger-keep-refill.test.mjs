import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installIssueFiveHotfixB } from '../runtime/issue-five-hotfix-b.mjs';

const DT = 1 / 60;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-8, `${m}: ${a} != ${b}`);

test('#1070: cancelling charge keep opens ink refill at the 3F boundary', async () => {
  const f = await fixture();
  installIssueFiveHotfixB(f);
  const a = f.make('charger'), r = a.weaponRunner;
  a.ink = 100; a.intent.fire = true;
  f.tick(a, 61);
  a.intent.squid = true;
  f.tick(a);
  assert.ok(r.s3Stored, 'full charge is kept');
  a.lastFire = 10; a.ink = 50; a.intent.fire = false;
  f.tick(a);
  const before = a.ink;
  assert.equal(r.s3Stored, null, 'release cancels the keep');
  near(a.s3.chargerKeepCancelRecover, 3 * DT, 'dedicated keep-cancel lock');
  f.tick(a); assert.equal(a.ink, before, 'N+1 blocked');
  f.tick(a); assert.equal(a.ink, before, 'N+2 blocked');
  f.tick(a); assert.ok(a.ink > before, 'N+3 refill boundary opens');
  assert.ok((a.s3.chargerInterruptRecover || 0) <= 1e-10,
    'ordinary 19F interruption timer is not reused');
});
