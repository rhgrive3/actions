import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installIssueFiveHotfixC } from '../runtime/issue-five-hotfix-c.mjs';

const DT = 1 / 60;
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-8, `${m}: ${a} != ${b}`);

test('#1038: grounded Charger uses 1/3 rate whenever the full 18% shot is unaffordable', async () => {
  for (const [ink, rate] of [[2.25, 1/3], [17.99, 1/3], [18, 1]]) {
    const f = await fixture();
    installIssueFiveHotfixC(f);
    const a = f.make('charger');
    a.ink = ink; a.lastFire = 0; a.intent.fire = true;
    f.tick(a); // 1F fresh-start gate
    assert.equal(a.weaponRunner.charging, false);
    f.tick(a); // first active charge step
    assert.equal(a.weaponRunner.charging, true);
    near(a.weaponRunner.chargeT, DT * rate, `${ink}% funded rate`);
  }
});
