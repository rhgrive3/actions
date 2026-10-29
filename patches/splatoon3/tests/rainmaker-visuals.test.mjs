import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { createRainmakerModel } from '../runtime/ranked/rainmaker-model.mjs';
import { createRainmakerBarrier, createRainmakerChargeAura, createRainmakerAttackVisuals } from '../runtime/ranked/rainmaker-visuals.mjs';

test('both teams and counter-pressure keep the visible shield on the collision sphere', () => {
  const barrier = createRainmakerBarrier(THREE);
  for (const balance of [0, 750, 200, -300, -999, 0]) {
    const color = balance < 0 ? 0x9933ee : 0xeedd11;
    const state = { active: true, balance, max: 1000, health: 1000 - Math.abs(balance) };
    const before = structuredClone(state);
    barrier.update(state, color, 1 / 60);
    assert.ok(Math.abs(barrier.mesh.scale.x * 1.45 - (1.5 + 1.2 * Math.abs(balance) / 1000)) < 1e-10);
    assert.equal(barrier.mesh.material.color.getHex(), color);
    assert.deepEqual(state, before, 'visual pressure cannot mutate rule state');
  }
  barrier.update({ active: false }); assert.equal(barrier.mesh.visible, false);
  barrier.mesh.geometry.dispose(); barrier.mesh.material.dispose();
});

test('carrier glow follows a live muzzle and stops on swim/death/drop without borrowing actor materials', () => {
  const scene = new THREE.Scene(), aura = createRainmakerChargeAura(THREE), core = createRainmakerModel(THREE);
  scene.add(core, aura.group); core.position.set(3, 1.2, -2);
  const actorMaterial = new THREE.MeshStandardMaterial({ color: 0x123456 });
  const actor = { alive: true, form: 'kid', pos: new THREE.Vector3(3, .2, -2), character: { material: actorMaterial } };
  const initial = actorMaterial.toJSON();
  aura.update(actor, .5, core, 1 / 60, 0); scene.updateMatrixWorld(true);
  const mouth = core.localToWorld(new THREE.Vector3().fromArray(core.userData.rainmakerModel.muzzle));
  assert.ok(aura.group.getObjectByName('rainmaker-muzzle-glow').getWorldPosition(new THREE.Vector3()).distanceTo(mouth) < 1e-10);
  const power = aura.group.getObjectByName('rainmaker-body-glow').material.uniforms.uPower.value;
  aura.update(actor, 1, core, 1 / 60, 0);
  assert.ok(aura.group.getObjectByName('rainmaker-body-glow').material.uniforms.uPower.value > power);
  for (const state of [{ ...actor, form: 'squid' }, { ...actor, alive: false }, null]) {
    aura.update(state, 1, core, 1 / 60, 1); assert.equal(aura.group.visible, false);
  }
  assert.deepEqual(actorMaterial.toJSON(), initial);
  aura.group.traverse(o => { o.dispose?.(); o.geometry?.dispose(); o.material?.dispose(); });
  core.geometry.dispose(); core.material.dispose(); actorMaterial.dispose();
});

test('shot/impact resources are bounded, expire while idle, and dispose shared GPU data once', () => {
  const scene = new THREE.Scene(), effects = createRainmakerAttackVisuals(THREE, scene), color = new THREE.Color(0xffdd00);
  const a = effects.shot(color, 1), b = effects.shot(color, .4);
  const head = a.getObjectByName('rainmaker-shot-head'), other = b.getObjectByName('rainmaker-shot-head');
  assert.equal(head.geometry, other.geometry); assert.equal(head.material, other.material);
  const position = new THREE.Vector3(2, 0, 1);
  for (let i = 0; i < 100; i++) effects.splash(position, color, 1.4);
  const root = scene.getObjectByName('rainmaker-ink-splashes');
  assert.ok(root.children.length <= 8, 'repeated events cannot grow the burst pool');
  const pool = root.children.slice();
  effects.update(.7); assert.ok(pool.every(o => !o.visible), 'effects expire without another projectile');
  for (let i = 0; i < 20; i++) effects.splash(position, color, 1.4, 'impact');
  assert.deepEqual(root.children, pool, 'a later volley reuses the retired pool');
  let geometryDisposals = 0, materialDisposals = 0;
  head.geometry.addEventListener('dispose', () => geometryDisposals++);
  head.material.addEventListener('dispose', () => materialDisposals++);
  effects.dispose(); effects.dispose();
  assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
  assert.equal(scene.getObjectByName('rainmaker-ink-splashes'), undefined);
});
