import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, STEP } from './full-install-fixture.mjs';

// #910 (characterization: this passes on the pre-existing code): Heavy Splatling stage collision is a swept volume
// with the pinned constant 0.2 field radius (weapons-fidelity setCollision -> fidelityWorldHit), separate from the 0.225 player radius.
// Logic-only: real composed Projectiles on the VM; not a browser run and not a Splatoon 3 real-device comparison.
const close = (a, b, label) => assert.ok(Math.abs(a - b) <= 1e-9, `${label}: ${a} != ${b}`);

test('#910 Splatling rounds carry the pinned 0.2 field radius, constant in flight, apart from the 0.225 player radius', async t => {
  const f = await boot(); t.after(f.close);
  const raw = f.profile.weaponsFidelityCompletion.weapons.splatling.CollisionParam;
  assert.equal(raw.InitRadiusForField, .2); assert.equal(raw.EndRadiusForField, .2); assert.equal(raw.InitRadiusForPlayer, .225);
  const a = f.make({ weapon: 'splatling' }); f.tick(a); a.aimYaw = 0; a.aimPitch = 0;
  f.G.projectiles.fireSplatling(a, a.weapon, 0);
  const p = f.G.projectiles.list.at(-1);
  close(p.fidelityFieldCollision.initRadius, .2, 'init field'); close(p.fidelityFieldCollision.endRadius, .2, 'end field');
  close(p.fidelityPlayerCollision.initRadius, .225, 'player');
});

test('#910 a wall edge inside 0.2 of the centerline stops the round, outside 0.2 it passes; direct hits still resolve', async t => {
  const f = await boot(); t.after(f.close);
  const a = f.make({ weapon: 'splatling' }); f.tick(a); a.aimYaw = 0; a.aimPitch = 0;
  const ps = f.G.projectiles, fire = () => { ps.clear(); ps.fireSplatling(a, a.weapon, 0); return ps.list.at(-1); };
  const x0 = fire().pos.x, wallZ = 4;
  const run = d => {
    f.setBlocks([{ min: [x0 + d, 0, wallZ], max: [x0 + d + 3, 6, wallZ + 1] }]);
    const p = fire(); let maxZ = -Infinity;
    for (let i = 0; i < 40 && ps.list.includes(p); i++) { ps.update(STEP); maxZ = Math.max(maxZ, p.pos.z); }
    return maxZ;
  };
  for (const d of [-.1, .05, .1, .19]) assert.ok(run(d) < wallZ, `edge clearance ${d} stops at the wall`);
  for (const d of [.21, .25, .4]) assert.ok(run(d) > wallZ + 1, `edge clearance ${d} passes`);
});
