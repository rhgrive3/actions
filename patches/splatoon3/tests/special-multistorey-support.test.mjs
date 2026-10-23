import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
function world(roof = true) {
  const { G, THREE } = f;
  G.projectiles.clear(); G.actors = []; G.netm = null; G.time = 0;
  G.scene ||= new THREE.Scene(); G.camera = null;
  G.match = { state: 'playing', playing: () => true, canRespawn: () => false };
  G.level = new f.Level({ bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
    spawnPads: [[-40, 0, 0], [40, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-50, -.5, -50], max: [50, 0, 50] },
      ...(roof ? [{ kind: 'box', min: [-20, 12, -20], max: [20, 12.5, 20] }] : []),
    ] });
  G.physics = new f.Physics(G.level);
  G.paint = { sample: () => 1, splat: () => 0 };
}
function activate(id, kit = 'shooter') {
  const a = f.make(kit);
  a.weapon = { ...a.weapon, special: id, specialCost: 100 }; a.special = a.specialCost();
  a.alive = true; a.remote = false; a.grounded = true;
  a.intent.fire = a.intent.sub = a.intent.jump = a.intent.squid = false;
  a._startSpecial(); return a;
}
function step(a, dt) { f.G.time += dt; a._updateSpecial(dt); }

for (const hz of [30, 60, 120]) for (const roof of [false, true]) {
  test(`Inkjet hover reads its own floor instead of an overhead storey: ${hz}Hz/roof=${roof}`, () => {
    world(roof); const a = activate('inkjet'); a.pos.set(0, 5, 0); a.vel.set(0, 0, 0);
    for (let i = 0; i < hz / 2; i++) step(a, 1 / hz);
    assert.ok(Math.abs(a.pos.y - 5) < 1e-7, 'unchanged five-WU hover stays over the lower floor');
    assert.ok(Math.abs(a.vel.y) < 1e-7);
  });
}

for (const hz of [30, 60, 120]) test(`a real thrown Tacticooler stays under the roof and lands on the lower floor, ${hz}Hz`, () => {
  world(); const a = activate('tacticooler', 'support'); a.aimDir.set(0, -1, 0);
  a.intent.sub = true; step(a, 1 / hz); a.intent.sub = false;
  for (let i = 0; i < hz && !(f.G.projectiles._s3SupportCoolerThrows || []).length; i++) step(a, 1 / hz);
  assert.equal(f.G.projectiles._s3SupportCoolerThrows.length, 1);
  f.G.time += 1 / hz; f.G.projectiles.update(1 / hz);
  const installed = f.G.projectiles._s3SupportCoolers || [];
  assert.ok(installed.every(s => s.pos.y < 1), 'roof above the throw cannot be a landing surface');
  for (let i = 0; i < hz && !(f.G.projectiles._s3SupportCoolers || []).length; i++) {
    f.G.time += 1 / hz; f.G.projectiles.update(1 / hz);
  }
  assert.equal(f.G.projectiles._s3SupportCoolers.length, 1);
  assert.ok(Math.abs(f.G.projectiles._s3SupportCoolers[0].pos.y) < 1e-7);
});

for (const hz of [30, 60, 120]) test(`missile target projection stays below an airborne target under a roof, ${hz}Hz`, () => {
  world(); const a = activate('tentaMissiles'), target = f.make();
  target.team = 1; target.pos.set(0, 3, 8); target.grounded = false;
  a.aimPoint.copy(target.pos); a.aimDir.copy(target.pos).sub(a.pos).normalize();
  f.G.actors = [a, target]; a.intent.fire = true;
  step(a, 1 / hz);
  const missile = f.G.projectiles.list.find(p => p.s3AllSpecial === 'tentaMissiles');
  assert.ok(missile, 'real special admission launches its first missile');
  assert.ok(missile.s3TentaTarget.y < target.pos.y, 'floor projection cannot jump to the roof');
  assert.ok(Math.abs(missile.s3TentaTarget.y - .08) < 1e-7);
});
