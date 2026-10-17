import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { CURLING, curlingRollTargetSpeed, kitBombContact, kitGhostBombAttach, resolveSubForThrow } from '../runtime/kit-subs.mjs';

// Wikiwiki3mix Curling Bomb, checked 2026-10-17: rolling speed 2.2 to 1.0
// DU/F with charge, +30% at GP57; wall incidence/reflection angles match.
// Leanny 1130 exports BaseSpeedMinCharge=.22; the max-charge field is omitted.
// These verify the runtime mapping, not a Nintendo hardware measurement.
const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} != ${b}`);

test('Curling rolling speed uses charge and owner gear while retaining max-charge provenance', () => {
  assert.equal(CURLING.baseSpeedMaxCharge, null);
  assert.equal(CURLING.baseSpeedMaxChargeStatus, 'unknown-omitted');
  assert.equal(CURLING.baseSpeedMaxChargeFallbackStatus, 'community-verified');
  near(curlingRollTargetSpeed(CURLING, 2, 0), 13.2, 'tap 2.2 DU/F');
  near(curlingRollTargetSpeed(CURLING, 2, 1), 6, 'full 1.0 DU/F');
  near(curlingRollTargetSpeed(CURLING, .75, 1), 6 * .5 ** .41, 'full-charge warning slowdown');

  const owner = { weapon: { sub: 'curling' }, s3: { modifiers: { subPower: 1.3 } } };
  const resolved = resolveSubForThrow(owner, 1, { curling: CURLING });
  near(curlingRollTargetSpeed(resolved.spec, 2, resolved.charge), 7.8, 'GP57 full 1.30 DU/F');
  const b = { owner, ghost: true, kind: 'bomb' };
  kitGhostBombAttach({ curling: CURLING }, {}, b, 'curling', 1);
  near(curlingRollTargetSpeed(b.s3GhostResolved.spec, 2, b.s3GhostResolved.charge), 7.8, 'ghost uses the same owner gear');
  assert.equal(b.s3Resolved, undefined, 'replica has presentation authority only');
});

test('Curling specular wall reflection preserves angle/speed after the third wall', async () => {
  const f = await fixture();
  const V = f.THREE.Vector3;
  const b = { pos: new V(), vel: new V(-3, 0, 4), s3Mode: 'rolling',
    s3Resolved: { spec: CURLING, charge: 0 }, s3Bounces: 0 };
  for (let i = 0; i < 8; i++) {
    const incomingX = b.vel.x;
    const n = new V(incomingX < 0 ? 1 : -1, 0, 0);
    const point = new V(i, .21, 0);
    assert.equal(kitBombContact({}, b, { hit: true, point, normal: n }, 1 / 60), true);
    near(b.vel.x, -incomingX, `normal reflection ${i}`);
    near(b.vel.z, 4, `tangent retention ${i}`);
    near(b.vel.length(), 5, `speed ${i}`);
    near(b.pos.x, point.x + n.x * .21, `wall clearance ${i}`);
  }
  assert.equal(b.s3Bounces, 8);
  assert.equal(b.s3Mode, 'rolling');
  assert.equal(b.s3BounceExhausted, undefined);
});

test('native Curling in a narrow corridor keeps travelling beyond three wall reflections', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const { G, THREE } = f, V = THREE.Vector3;
  G.camera = { position: new V(0, 100, 0) };
  G.paint = { sample: () => 1, splat: () => 0 };
  G.physics.raycast = (o, d, len, out) => {
    out.hit = d.y < 0 && o.y >= 0 && o.y + d.y * len <= 0;
    if (out.hit) { out.point.set(o.x, 0, o.z); out.normal.set(0, 1, 0); out.dist = o.y; }
    return out;
  };
  G.physics.segment = (a, b, out) => {
    out.hit = false;
    const wall = b.z > 1 && a.z <= 1 ? 1 : b.z < -1 && a.z >= -1 ? -1 : null;
    if (wall !== null) {
      const t = (wall - a.z) / (b.z - a.z);
      out.hit = true; out.point.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, wall);
      out.normal.set(0, 0, -wall);
    } else if (a.y >= 0 && b.y < 0) {
      const t = a.y / (a.y - b.y);
      out.hit = true; out.point.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t); out.normal.set(0, 1, 0);
    }
    return out;
  };
  const a = f.make('roller');
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 0); a.aimPitch = 0; a.aimYaw = 0;
  a.weaponRunner.reset();
  const p = G.projectiles;
  p.throwBomb(a);
  const b = p.bombs[0];
  assert.equal(b.s3Sub.id, 'curling');
  b.pos.set(0, .21, 0); b.vel.set(0, 0, 13.2); b.s3Mode = 'rolling';
  for (let i = 0; i < 90; i++) p._updateBombs(1 / 60);
  assert.ok(p.bombs.includes(b), 'tap bomb remains alive before its 210F fuse ends');
  assert.ok(b.s3Bounces > 3, `reflected ${b.s3Bounces} times`);
  assert.ok(Math.hypot(b.vel.x, b.vel.z) > 5, 'still moving after repeated reflections');
  assert.ok(b.pos.z >= -1 && b.pos.z <= 1, 'contact clearance keeps it inside the corridor');
});
