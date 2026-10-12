// Ballpoint Splatling model: the barrel ink follows the spun cluster and fills with the charge, the pen tip clicks
// out of the nozzle ring in the stream's second phase and retracts afterwards, the clear shell turns see-through.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const ID = 's3-spinner-downpour';
const production = () => fixture({ fullRuntime: true, includeCharacter: true, productionComposition: true, realProjectiles: true,
  extraExports: "export { getWeaponDef } from './inkwave-public/src/game/character-weapons.js';\nexport { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';" })
  .then(f => { f.installMainWeaponCatalogRuntime(f.installedRuntime, f.profile); return f; });

test('Ballpoint Splatling keeps its native channels and adds its own ink / tip / shell parts', async () => {
  const f = await production(), d = f.getWeaponDef(ID);
  for (const name of ['trigger', 'barrels', 'barrelInk', 'tipInk', 'penTip', 'shell']) assert.ok(d.parts[name], name);
  assert.equal(d.parts.barrelInk.mat, 'ink'); assert.equal(d.parts.tipInk.mat, 'ink'); assert.equal(d.parts.shell.mat, 'lamp');
  assert.ok(d.glow?.attributes.aSeg, 'charge meter keeps per-vertex aSeg');
  assert.ok(Math.abs(d.muzzle.y - d.parts.barrels.pivot.y) < 1e-9 && d.muzzle.z > 0.36 && d.muzzle.z < 0.38, 'muzzle at the nozzle ring');
});

test('Ballpoint Splatling barrel ink, pen tip and shell follow the real runner state', async () => {
  const f = await production(), { G, THREE } = f;
  G.scene = new THREE.Scene(); G.physics = new f.Physics(G.level); G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
  const a = new f.Actor({ team: 0, weapon: ID, CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; a.grounded = a.ground.hit = true; G.actors = [a]; G.scene.add(ch.root);
  const rows = [];
  for (let n = 0; n < 420; n++) {
    const fire = n >= 10 && n < 110; a.intent.fire = fire; a.ink = 100;
    G.time += 1 / 60; a.weaponRunner.update(1 / 60, { fire, firePressed: n === 10 }); a._finishFrame(1 / 60); ch.root.updateMatrixWorld(true);
    const P = ch.weapon.parts, r = a.weaponRunner;
    rows.push({ n, charging: !!r.charging, streaming: !!r.streaming, fill: P.barrelInk.visible ? P.barrelInk.scale.z : 0,
      tip: P.penTip.position.z - P.penTip.userData.rest.z, dRot: Math.abs(P.barrelInk.rotation.z - P.barrels.rotation.z),
      shell: P.shell.userData.mesh.material.transparent });
  }
  assert.ok(rows.every(r => Number.isFinite(r.fill) && Number.isFinite(r.tip)), 'finite');
  assert.ok(rows.slice(5).every(r => r.shell), 'shell see-through once animated');
  assert.ok(rows[5].fill === 0 && rows[5].tip < 1e-4, 'empty barrels and tip in at rest');
  const charge = rows.filter(r => r.charging);
  assert.ok(charge.length > 20, 'charges');
  assert.ok(charge.at(-1).fill > charge[5].fill + 0.2, `barrel ink fills with the charge (${charge[5].fill.toFixed(2)} → ${charge.at(-1).fill.toFixed(2)})`);
  const stream = rows.filter(r => r.streaming);
  assert.ok(stream.length > 40, 'streams');
  assert.ok(stream.slice(0, 20).every(r => r.tip < 0.012), 'tip stays in during the first stream phase');
  assert.ok(stream.slice(45).some(r => r.tip > 0.025), 'tip clicks out in the second stream phase');
  assert.ok(stream.at(-1).fill < stream[0].fill, 'barrel ink drains while streaming');
  assert.ok(rows.at(-1).tip < 0.002 && rows.at(-1).fill === 0, 'tip retracts and barrels empty after the stream');
  // the ink columns ride the spun cluster (same angle within one frame of motor drift)
  assert.ok(rows.every(r => Math.min(r.dRot, Math.PI * 2 - r.dRot) < 0.35), 'barrel ink follows the cluster spin');
});
