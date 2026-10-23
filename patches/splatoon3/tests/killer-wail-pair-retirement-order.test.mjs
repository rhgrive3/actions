import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Retain the production Actor, _finishFrame, Character and geometry. make()
// replaces frame finishing and Character, so it cannot detect this ordering bug.
let cached;
async function world() {
  const f = cached ||= await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true, includeCharacter: true,
    extraExports: "export * from './patches/splatoon3/runtime/wail-pair-presentation.mjs';" });
  const { G, THREE } = f, api = f.installedRuntime;
  G.projectiles.clear(); G.fx?.dispose(); G.actors = []; G.netm = G.net = null; G.time = 0; G.mode = 'match';
  G.settings = { quality: 'high' }; G.scene = new THREE.Scene();
  G.match = { state: 'playing', mode: 'turf', playing: () => true, canRespawn: () => false };
  G.paint = { sample: () => 0, splat: () => 0 };
  G.level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }], half: [] });
  G.physics = new f.Physics(G.level); G.projectiles = new api.Projectiles(G.scene);
  G.camera = new THREE.PerspectiveCamera(60, 16 / 9, .1, 300); G.camera.position.set(0, 4, -8); G.camera.updateMatrixWorld(true);
  G.fx = new api.FX(G.scene, { quality: 'high' }); G.fx.setCollider(() => null);
  const a = new f.Actor({ team: 0, name: 'Wail update order', weapon: 'shooter', CharacterClass: f.Character,
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  Object.assign(a, { owner: 'source-owner', nid: 77, netLife: 4, grounded: true, invuln: 0 });
  a.ground.hit = true; a.pos.set(0, 0, 0); a.aimYaw = a.aimPitch = 0; a.aimPoint.set(0, .75, 100);
  a.weapon = { ...a.weapon, special: 'killerWail', specialCost: 100 }; a.special = 100;
  G.actors.push(a); G.scene.add(a.character.root);
  assert.equal(Object.hasOwn(a, '_finishFrame'), false); assert.equal(Object.hasOwn(a, '_integrate'), false);
  assert.ok(a.character instanceof f.Character);
  const holders = () => Array.from(a.character.s3SpecialDevices() || []).filter(d => d.spec.speakers).map(d => d.holder);
  const flags = () => holders().map(h => h.visible);
  const order = [], retired = [], bursts = [], beforeProjectiles = new Map(), off = [];
  const nativeCharacterUpdate = a.character.update;
  a.character.update = function (...args) { order.push('Character'); return nativeCharacterUpdate.apply(this, args); };
  const director = G.fx.s3SpecialVfx, retire = director.retireWailPair;
  director.retireWailPair = function (record) {
    bursts.push({ record, flags: flags(), at: G.time }); return retire.call(this, record);
  };
  off.push(f.on(f.WAIL_PAIR_RETIRED, record => retired.push({ record, flags: flags(), at: G.time })));
  a._startSpecial(); assert.equal(a.specialActive?.id, 'killerWail');
  const tick = dt => {
    G.time += dt; order.length = 0; a.update(dt);
    for (const record of f.localWailPairs(G.projectiles)) if (G.time + 1e-8 >= record.until && !record.detached)
      beforeProjectiles.set(record, { flags: flags(), characterUpdated: order.includes('Character') });
    G.projectiles.update(dt); G.fx.update(dt, G.camera);
  };
  return { f, G, api, a, holders, flags, retired, bursts, beforeProjectiles, tick,
    close() { off.forEach(fn => fn()); G.projectiles.clear(); a.character.dispose(); G.fx.dispose(); G.fx = null; G.actors = []; } };
}

for (const hz of [30, 60, 120]) test(`production Actor/Character -> Projectiles hides exactly the retired attached pair before burst (${hz} Hz render cadence)`, async () => {
  const w = await world(), clock = new w.f.FixedClock();
  try {
    for (let frame = 0; frame < hz * 5; frame++) {
      clock.advance(1 / hz, w.tick);
      // This is the render opportunity after source ticks, with no extra Character update.
      for (const { record } of w.retired) {
        const pair = w.holders().slice(record.index * 2, record.index * 2 + 2);
        assert.equal(pair.filter(h => h.visible).length, 0, 'no burst/body overlap at the render opportunity');
      }
    }
    assert.equal(w.retired.length, 3); assert.equal(w.bursts.length, 3);
    for (const [i, e] of w.retired.entries()) {
      const before = w.beforeProjectiles.get(e.record);
      assert.equal(before.characterUpdated, true, 'real Character.update ran inside Actor._finishFrame first');
      assert.deepEqual(before.flags.slice(i * 2, i * 2 + 2), [true, true], 'the pair was attached before Projectiles retired it');
      const expected = Array.from({ length: 6 }, (_, speaker) => speaker >= (i + 1) * 2);
      assert.deepEqual(e.flags, expected, 'notification observers see only this pair newly hidden');
      assert.deepEqual(w.bursts[i].flags, expected, 'the FX subscriber sees the holders hidden before it creates the burst');
      assert.equal(e.record.status, 'retired'); assert.ok(Math.abs(e.at - (3.6 + i * .6)) < 1e-7);
    }
    for (let i = 0; i < 60; i++) w.tick(1 / 60);
    assert.equal(w.retired.length, 3);
  } finally { w.close(); }
});

for (const ending of ['death', 'superjump']) test(`production order preserves the independent fired tail after ${ending}`, async () => {
  const w = await world();
  try {
    for (let i = 0; i < 60; i++) w.tick(1 / 60);
    const record = [...w.f.localWailPairs(w.G.projectiles)][0];
    if (ending === 'death') w.a.splat(null, 'shooter');
    else assert.equal(w.a.superJump(new w.f.THREE.Vector3(0, 0, 0)), true);
    w.tick(1 / 60);
    assert.equal(record.detached, true); assert.equal(w.retired.length, 0);
    const tails = () => w.G.scene.children.filter(o => o.name === 'killer-wail-surviving-speaker');
    assert.equal(tails().length, 2);
    while (w.G.time + 1e-8 < record.until - 1 / 60) w.tick(1 / 60);
    assert.equal(tails().length, 2); assert.ok(tails().every(h => h.visible));
    w.tick(1 / 60);
    assert.equal(w.retired.length, 1); assert.equal(w.bursts.length, 1); assert.equal(tails().length, 0);
  } finally { w.close(); }
});

test('production order keeps reset/clear silent', async () => {
  for (const action of ['reset', 'clear']) {
    const w = await world();
    try {
      for (let i = 0; i < 60; i++) w.tick(1 / 60);
      if (action === 'reset') w.a.reset(); else w.G.projectiles.clear();
      for (let i = 0; i < 300; i++) w.tick(1 / 60);
      assert.equal(w.retired.length, 0); assert.equal(w.bursts.length, 0);
    } finally { w.close(); }
  }
});

test('a late old-pair notification cannot hide holders of a later activation or a remote presentation', async () => {
  const w = await world();
  try {
    for (let i = 0; i < 300; i++) w.tick(1 / 60);
    const old = w.retired[0].record;
    w.a.reset(); w.a.weapon = { ...w.a.weapon, special: 'killerWail', specialCost: 100 }; w.a.special = 100; w.a._startSpecial();
    w.tick(1 / 60); assert.deepEqual(w.flags(), [true, true, true, true, true, true]);
    w.f.emit(w.f.WAIL_PAIR_RETIRED, old);
    assert.deepEqual(w.flags(), [true, true, true, true, true, true]);
    const current = w.a._s3AllSpecialState; w.a.remote = true;
    w.f.emit(w.f.WAIL_PAIR_RETIRED, { ...old, actor: w.a, state: current });
    assert.deepEqual(w.flags(), [true, true, true, true, true, true], 'no remote retirement contract is introduced');
  } finally { w.close(); }
});
