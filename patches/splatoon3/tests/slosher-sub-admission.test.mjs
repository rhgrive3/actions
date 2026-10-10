import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
for (const hz of [30, 60, 120]) test(`#926 installed Slosher allows sub readiness at shot+15F (${hz}Hz)`, async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true });
  const a = f.make('slosher'), r = a.weaponRunner;
  f.G.actors = [a]; f.tick(a, 600);
  let tick = 0, shot = null, ready = null;
  f.G.projectiles.fireSlosh = () => { shot ??= tick; };
  const clock = new FixedClock();
  for (let render = 0; render < hz; render++) clock.advance(1 / hz, () => {
    tick++; a.intent.fire = tick === 1; a.intent.sub = shot !== null;
    f.tick(a);
    if (r.aimingSub && ready === null) {
      ready = tick;
      assert.equal(r.s3SubReady.age, 0, 'sub preparation starts, not an immediate throw');
      assert.ok(r.s3SloshPostShot > 0, 'squid lock still owns the remaining frame');
    }
  });
  assert.equal(ready - shot, 15);
});
