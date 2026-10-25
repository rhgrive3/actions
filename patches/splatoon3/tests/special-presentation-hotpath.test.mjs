import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { before, current, createFitRunner, createSpeakerRunner, valuesWithoutCounts } from './special-presentation-hotpath-fixture.mjs';
assert.ok(!process.env.INKWAVE_BUILT_SITE, 'Frozen-function source oracle; emitted/browser integration must be checked separately');

test('held two-hand constraints preserve exact callbacks/transforms through socket and arm changes', () => {
  const old = createFitRunner(before.fit), next = createFitRunner(current.fit);
  let beforeRefreshes = 0, afterRefreshes = 0;
  for (const hz of [30, 60, 120]) for (let i = 0; i < hz; i++) {
    const t = i / hz;
    if (i === 10 || i === 20) { old.setSockets(t); next.setSockets(t); }
    if (i === 25) for (const r of [old, next]) { r.ch.limbs.armR.a = .1; r.ch.limbs.armL.b = .31; }
    const position = [.1 * Math.sin(t * 3), .8 + .3 * Math.sin(t * 5), .2 + .2 * Math.cos(t * 3)];
    const quaternion = [Math.sin(t) * .2, Math.cos(t) * .25, Math.sin(t * 2) * .1, Math.sqrt(1 - (Math.sin(t) * .2) ** 2 - (Math.cos(t) * .25) ** 2 - (Math.sin(t * 2) * .1) ** 2)];
    const a = old.step(position, quaternion), b = next.step(position, quaternion);
    assert.deepEqual(valuesWithoutCounts(b), valuesWithoutCounts(a), hz + 'Hz/' + i);
    assert.equal(b.rotations, a.rotations, 'constraint solver math is unchanged');
    beforeRefreshes += a.refreshes; afterRefreshes += b.refreshes;
  }
  assert.ok(afterRefreshes < beforeRefreshes * .5, 'error measurement removes repeated ancestor matrix refreshes');
});

test('six Wail speakers preserve exact pose and mutable inputs while sharing equal-input work', () => {
  const cases = [null, (i, model, a, s, q) => { a.aimYaw = i % 2 ? -.2 : .7; s.startedAt = i % 2 ? .01 : 0; q.set(.1, .2, .3, .4); },
    (i, model, a, s, q, motion) => { motion.speakers.deploy = i % 2 ? .19 : .38; }];
  for (const mutate of cases) {
    const old = createSpeakerRunner(before.pose, { mutate }), next = createSpeakerRunner(current.pose, { mutate });
    for (const hz of [30, 60, 120]) for (let i = 0; i < hz; i++) {
      const t = i / hz, yaw = [0, -0, .3, -.7, 3.5][i % 5];
      if (i === 20) for (const r of [old, next]) {
        r.actor._s3AllSpecialState = { id: 'killerWail', serial: 1, t, beamPairs: [{ index: 1, until: 10,
          origins: [{ x: 1, y: 2, z: 3 }, { x: -1, y: 2, z: 3 }], direction: { x: 0, y: 0, z: 1 } }] };
      }
      const a = old.step(t, 1 / hz, yaw), b = next.step(t, 1 / hz, yaw);
      assert.deepEqual(valuesWithoutCounts(b), valuesWithoutCounts(a), hz + 'Hz/' + i + '/' + !!mutate);
      if (!mutate && i < 20) { assert.equal(a.counts.pow, 12); assert.equal(b.counts.pow, 2); assert.equal(a.counts.axisAngle, old.actor._s3AllSpecialState ? 4 : 6); assert.equal(b.counts.axisAngle, 0); }
    }
  }
});

async function boot(baseline) {
  const adaptRuntime = (rel, source) => {
    if (!baseline) return source;
    if (rel.endsWith('/special-motion.mjs')) { assert.equal(source.split(current.fit).length, 2, 'unique current fit owner'); return source.replace(current.fit, before.fit); }
    if (rel.endsWith('/special-presentation.mjs')) { assert.equal(source.split(current.pose).length, 2, 'unique current pose owner'); return source.replace(current.pose, before.pose); }
    return source;
  };
  const f = await fixture({ fullRuntime: true, productionComposition: true, includeCharacter: true, adaptRuntime,
    extraExports: "export {specialPresentationSnapshot} from './patches/splatoon3/runtime/special-motion.mjs';" });
  f.G.scene = new f.THREE.Scene(); f.G.settings = { quality: 'high' }; f.G.mode = 'match'; f.G.match.state = 'playing';
  f.G.physics.segment = (_a, _b, h) => { h.hit = false; return h; };
  return f;
}
function trace(f, id, hz) {
  let seed = 17; f.setRandom(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296));
  const a = new f.Actor({ team: 0, weapon: 'shooter', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; a.grounded = a.ground.hit = true;
  f.G.actors = [a]; f.G.scene.add(ch.root); f.G.time = 0;
  const step = dt => { f.G.time += dt; a._finishFrame(dt); ch.root.updateMatrixWorld(true); };
  const rows = [];
  let worldConversions = 0, prop = null, duringStep = false;
  const originalLocalToWorld = f.THREE.Object3D.prototype.localToWorld;
  f.THREE.Object3D.prototype.localToWorld = function (v) { if (duringStep && (this === prop || this === ch.bones.handR || this === ch.bones.handL)) worldConversions++; return originalLocalToWorld.call(this, v); };
  try {
    for (let i = 0; i < 15; i++) step(1 / 60);
    a.weapon = { ...a.weapon, special: id }; a.specialActive = { id, phase: id === 'inkVac' ? 'inhale' : id === 'killerWail' ? 'laser' : 'charge', t: 0 };
    for (let i = 0; i < hz; i++) {
      const t = i / hz;
      a.aimDir.set(Math.sin(t * 3) * .5, Math.cos(t * 5) * .6, 1).normalize();
      a.aimYaw = Math.atan2(a.aimDir.x, a.aimDir.z); a.aimPitch = Math.asin(a.aimDir.y); a.yaw = .2 * Math.sin(t * 4); a.pos.set(t * .2, 0, t * .1);
      if (i === 10 && id !== 'killerWail') {
        const g = ch.kid.getObjectByName('special:' + id); if (g) { g.userData.handR.x += .01; g.userData.handL = g.userData.handL.clone().add(new f.THREE.Vector3(0, .01, 0)); }
      }
      if (i === Math.floor(hz / 2)) a.specialActive = null;
      if (i === Math.floor(hz / 2) + 2) { a.reset(); a.grounded = a.ground.hit = true; a.specialActive = { id, phase: id === 'inkVac' ? 'inhale' : 'charge', t: 0 }; }
      prop = ch.kid.getObjectByName('special:' + id);
      duringStep = true; try { step(1 / hz); } finally { duringStep = false; }
      const models = [];
      ch.root.traverse(o => { if (o.name?.startsWith('special:')) models.push([o.name, o.visible, ...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()]); });
      for (const d of ch.s3SpecialDevices?.() || []) models.push([d.model.id, d.holder.visible, ...d.holder.position.toArray(), ...d.holder.quaternion.toArray(), ...d.holder.scale.toArray()]);
      rows.push({ models, pose: Array.from(ch.P), hands: [Array.from(ch.bones.handR.matrixWorld.elements), Array.from(ch.bones.handL.matrixWorld.elements)],
        snapshot: f.specialPresentationSnapshot(ch), muzzle: ch.getMuzzle(new f.THREE.Vector3()).toArray(),
        hp: a.hp, ink: a.ink, special: a.special, token: a.specialActive && { ...a.specialActive }, weapon: ch.weapon.pivot.visible });
    }
    return { rows: JSON.parse(JSON.stringify(rows)), worldConversions };
  } finally { f.THREE.Object3D.prototype.localToWorld = originalLocalToWorld; ch.dispose(); f.G.actors = []; f.restoreRandom(); }
}
test('composed real Characters retain exact held/Wail pose through aim, socket edits, cancellation and reset at 30/60/120 Hz', async t => {
  const old = await boot(true), next = await boot(false);
  for (const id of ['trizooka', 'inkVac', 'killerWail']) for (const hz of [30, 60, 120]) {
    const a = trace(old, id, hz), b = trace(next, id, hz);
    assert.deepEqual(b.rows, a.rows, id + '/' + hz);
    if (id !== 'killerWail') { assert.ok(b.worldConversions < a.worldConversions, 'real held fit removes repeated matrix refresh conversions'); t.diagnostic(JSON.stringify({ id, hz, beforeLocalToWorld: a.worldConversions, afterLocalToWorld: b.worldConversions })); }
  }
});
