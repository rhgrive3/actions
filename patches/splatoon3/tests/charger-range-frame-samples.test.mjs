// #514: pins the sampled partial-charge range (8F..59F) through the real composed
// native runner, the release path and the installed flight job. The intermediate
// law is INKWAVE's current linear band between the sourced DistanceMinCharge and
// DistanceFullCharge endpoints. It is an INKWAVE assumption, not an S3
// frame-verified curve (the 11.3.0 source supplies only the endpoints); this test
// guards the implementation against regressing to the generic eased scalar and
// does not claim native-console equivalence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

const MIN = 9.033, FULL = 24.037;
const FRAMES = [8, 9, 12, 16, 23, 34, 48, 59];
// Linear band over frames 8..60 at 60 Hz: q = (frame - 8) / (60 - 8).
const linearReach = frame => MIN + (FULL - MIN) * (frame - 8) / 52;
// Pre-#961 eased law (chargeT < .2 ? t * 1.25 : .25 + (t - .2) * .9375). The sampled
// frames must discriminate it from the linear band, or the test would not detect
// a regression to that curve.
const easedReach = frame => {
  const t = frame / 60;
  const c = t < 0.2 ? t * 1.25 : 0.25 + (t - 0.2) * 0.9375;
  return MIN + (FULL - MIN) * c;
};

test('#514 the sampled frames are discriminated from the eased scalar', () => {
  for (const frame of FRAMES) {
    assert.ok(Math.abs(linearReach(frame) - easedReach(frame)) > 0.05, `frame ${frame} must differ from eased`);
  }
});

test('#514 the installed reach follows the linear band at every sampled frame', async () => {
  const f = await fixture();
  const P = f.Projectiles.prototype;
  for (const frame of FRAMES) {
    assert.ok(Math.abs(P.chargerReach(frame / 60) - linearReach(frame)) < 1e-9, `frame ${frame} reach`);
  }
  assert.equal(P.chargerReach(1), FULL, 'full charge keeps the sourced full endpoint');
});

test('#514 a real native release at each sampled frame creates the linear-band flight job', async () => {
  for (const frame of FRAMES) {
    const f = await fixture();
    const a = f.make('charger');
    a.ink = 100;
    const system = new f.Projectiles(new f.THREE.Scene());
    f.G.actors = [a];
    a.intent.fire = true;
    // Hold until the native fractional clock records exactly `frame` charge updates.
    while (Math.abs(a.weaponRunner.chargeT - frame / 60) > 1e-9) {
      f.tick(a);
      assert.ok(a.weaponRunner.chargeT <= frame / 60 + 1e-9, `charge clock must land exactly on ${frame}F`);
    }
    const born = a.weaponRunner.charge;
    assert.ok(Math.abs(born - frame / 60) < 1e-9, `native linear charge at ${frame}F is ${frame}/60`);
    system.fireCharger(a, a.weapon, born);
    const job = system._fidelityChargerFlights.at(-1);
    assert.equal(system._fidelityChargerFlights.length, 1, `${frame}F births exactly one flight`);
    assert.ok(Math.abs(job.range - linearReach(frame)) < 1e-9, `${frame}F flight range`);
    assert.equal(job.range, f.Projectiles.prototype.chargerReach(born), `${frame}F HUD and flight share the helper`);
  }
});
