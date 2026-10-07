import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';

async function rig() {
  const f = await fixture(), { G, THREE } = f;
  G.scene = new THREE.Scene();
  G.actors = []; G.boss = null; G.netm = null;
  G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics = new f.Physics(G.level);
  G.projectiles = new f.Projectiles(G.scene);
  const a = f.make('blaster');
  a.pos.set(0, 0, 0); a.yaw = 0; a.aimYaw = 0; a.aimPitch = 0;
  a.aimDir.set(0, 0, 1); a.aimPoint.set(0, 1.35, 30);
  return { f, G, a, projectiles: G.projectiles };
}
const point = p => ({ x: p.x, y: p.y, z: p.z });

async function sample(r, vx, vz) {
  const { f, a, projectiles } = r;
  a.vel.set(vx, 0, vz);
  const guide = point(projectiles.s3WeaponGuide(a, a.weapon));
  const before = projectiles.list.length;
  f.setRandom(() => 0.5);
  try { projectiles.fireBlaster(a, a.weapon, 0); } finally { f.restoreRandom(); }
  const round = projectiles.list[before];
  assert.ok(round, 'real zero-spread Blaster shot was emitted');
  for (let i = 0; i < a.weapon.shotGuideFrame; i++)
    f.advanceFidelityProjectile(round, 1 / 60);
  for (const axis of ['x', 'y', 'z'])
    assert.ok(Math.abs(guide[axis] - round.pos[axis]) < 1e-9,
      `${axis}: guide ${guide[axis]} real ${round.pos[axis]}`);
  return guide;
}

test('#1074 Blaster ShotGuide reuses the real player-forward launch velocity and invalidates on movement', async () => {
  const r = await rig();
  const still = await sample(r, 0, 0);
  const forward = await sample(r, 0, 1);
  const backward = await sample(r, 0, -1);
  const lateral = await sample(r, 1, 0);
  assert.ok(forward.z > still.z, 'forward movement pushes both guide and real shot farther');
  assert.ok(backward.z < still.z, 'backward movement pulls both guide and real shot back');
  assert.ok(Math.abs(lateral.z - still.z) < 1e-9,
    'pure lateral movement does not invent a longitudinal launch term');
});
