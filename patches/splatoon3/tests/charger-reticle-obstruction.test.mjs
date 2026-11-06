import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerObstructionPoint, isChargerWeapon } from '../runtime/weapons-fidelity.mjs';

const v = (x = 0, y = 0, z = 0) => ({ x, y, z });
function scene(wallZ) {
  const casts = [];
  const projectiles = { _muzzle: (a, out) => Object.assign(out, v(0.3, 1.2, 0)), _aimFrom: (a, m, out) => Object.assign(out, v(a.aimPoint.x - m.x, a.aimPoint.y - m.y, a.aimPoint.z - m.z)) };
  const physics = { raycast(o, d, max, out, skipGrates) {
    casts.push({ max, skipGrates });
    const t = wallZ == null ? Infinity : (wallZ - o.z) / d.z;
    return t > 0 && t <= max ? { hit: true, point: v(o.x + d.x * t, o.y + d.y * t, wallZ) } : { hit: false };
  } };
  const scratch = { muzzle: v(), dir: v(), hit: null, state: { x: 0, y: 0, z: 0, frames: 0 } };
  return { projectiles, physics, scratch, casts };
}

test('charger family identity covers legacy and catalogue chargers only', () => {
  assert.equal(isChargerWeapon({ kind: 'charger' }), true);
  assert.equal(isChargerWeapon({ kind: 'catalog', catalogRecord: { family: 'charger' } }), true);
  assert.equal(isChargerWeapon({ kind: 'catalog', catalogRecord: { family: 'blaster' } }), false);
});

test('a wall between the muzzle and the aim point moves the reticle to the wall contact', () => {
  const s = scene(6), actor = { aimPoint: v(0.3, 1.2, 20) };
  const p = chargerObstructionPoint(s.projectiles, s.physics, actor, { kind: 'charger', rangeMax: 30 }, s.scratch);
  assert.ok(p); assert.equal(p.z, 6); assert.equal(s.casts[0].skipGrates, true, 'ink passes grates');
});

test('unobstructed, beyond range, or the aimed surface itself: no guide (reticle stays centred)', () => {
  const open = scene(null);
  assert.equal(chargerObstructionPoint(open.projectiles, open.physics, { aimPoint: v(0.3, 1.2, 20) }, { kind: 'charger', rangeMax: 30 }, open.scratch), null);
  const far = scene(25);
  assert.equal(chargerObstructionPoint(far.projectiles, far.physics, { aimPoint: v(0.3, 1.2, 40) }, { kind: 'charger', rangeMax: 20 }, far.scratch), null, 'a wall past the charge range is not cover');
  const target = scene(20);
  assert.equal(chargerObstructionPoint(target.projectiles, target.physics, { aimPoint: v(0.3, 1.2, 20) }, { kind: 'charger', rangeMax: 30 }, target.scratch), null, 'the wall being aimed at is the target');
});
