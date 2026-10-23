import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Real source and production composition; no browser or retail parity claim.
const boots = new Map();
async function world(composed, { start = true, effects = false } = {}) {
  if (!boots.has(composed)) boots.set(composed, await fixture({ fullRuntime: true, productionComposition: composed, realProjectiles: true,
    extraExports: `export * from './patches/splatoon3/runtime/wail-pair-presentation.mjs';
      export { replaySpecial } from './patches/splatoon3/runtime/all-specials.mjs';
      export { observeSpecialReplay } from './patches/splatoon3/runtime/special-vfx.mjs';` }));
  const f = boots.get(composed), { G, THREE } = f, api = f.installedRuntime;
  G.projectiles.clear(); G.fx?.clear(); G.fx = null; G.actors = []; G.netm = G.net = null; G.time = 0; G.mode = 'match';
  G.match = { state: 'playing', mode: 'turf', playing: () => true, canRespawn: () => false };
  G.paint = { sample: () => 0, splat: () => 0 }; G.scene = new THREE.Scene();
  G.projectiles = new api.Projectiles(G.scene);
  G.level = new f.Level({ bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0,
    single: [{ kind: 'box', min: [-100, -.5, -100], max: [100, 0, 100] }], half: [] });
  G.physics = new f.Physics(G.level);
  G.camera = new THREE.PerspectiveCamera(60, 16 / 9, .1, 300); G.camera.position.set(0, 4, -8); G.camera.updateMatrixWorld(true);
  const bursts = [];
  if (effects) {
    G.fx = new api.FX(G.scene, { quality: 'high' }); G.fx.setCollider(() => null);
    const d = G.fx.s3SpecialVfx, retire = d.retireWailPair;
    d.retireWailPair = function (record) { bursts.push(record); return retire.call(this, record); };
  }
  const a = f.make(), victim = f.make(); victim.team = 1; victim.hp = 1e6; victim.invuln = 0; victim.pos.set(0, 0, 20);
  Object.assign(a, { nid: 77, owner: 'source-owner', netLife: 4, invuln: 0 });
  a.weapon = { ...a.weapon, special: 'killerWail', specialCost: 100 }; a.special = 100;
  a.aimYaw = a.aimPitch = 0; a.aimPoint.set(0, .75, 100);
  const retired = [], wire = [], off = [f.on(f.WAIL_PAIR_RETIRED, r => retired.push({ record: r, at: G.time })), f.on('all:special', e => wire.push(e))];
  if (start) a._startSpecial();
  const step = (dt = 1 / 60) => {
    G.time += dt; if (a.specialActive && !a.remote) a._updateSpecial(dt);
    G.projectiles.update(dt); G.fx?.update(dt, G.camera);
  };
  return { f, G, api, a, victim, retired, wire, bursts, step,
    close() { off.forEach(fn => fn()); G.projectiles.clear(); G.fx?.clear(); } };
}
const positions = G => G.scene.children.filter(o => o.name === 'killer-wail-surviving-speaker').map(o => o.position.toArray());

for (const composed of [false, true]) {
  const mode = composed ? 'composed' : 'raw';
  for (const hz of [30, 60, 120]) test(`${mode}: three normal fired pairs retire once at their source lifetimes (${hz} Hz)`, async () => {
    const w = await world(composed), { f, a, G, retired, wire, step } = w;
    try {
      const records = [];
      for (let i = 0; i < hz * 6; i++) {
        step(1 / hz);
        for (const record of f.localWailPairs(G.projectiles)) if (!records.includes(record)) records.push(record);
        if (G.time > 2) { a.pos.set(30, 0, 30); a.aimYaw = 2; }
      }
      assert.equal(records.length, 3); assert.equal(retired.length, 3);
      for (const [i, { record, at }] of retired.entries()) {
        assert.equal(record, records[i]); assert.equal(record.actor, a); assert.equal(record.life, 4);
        assert.equal(record.activation, 1); assert.equal(record.index, i); assert.equal(record.status, 'retired');
        assert.ok(Math.abs(at - (3.6 + i * .6)) <= 1 / hz + 1e-8);
        assert.deepEqual(record.origins.map(p => [...p]), record.pair.origins.map(p => [...p.toArray()]));
        assert.ok(Object.isFrozen(record.origins) && record.origins.every(Object.isFrozen));
      }
      assert.equal(wire.filter(e => e.action === 'laser').length, 216, 'six beams retain 36 damage ticks each');
      assert.ok(wire.every(e => ['activate', 'target', 'laser', 'end'].includes(e.action)), 'retirement adds no wire action');
      assert.equal([...f.localWailPairs(G.projectiles)].length, 0);
      for (let i = 0; i < hz; i++) step(1 / hz);
      assert.equal(retired.length, 3);
    } finally { w.close(); }
  });

  for (const ending of ['splat', 'superjump']) test(`${mode}: ${ending} keeps the fired pair and mouths beyond early damage-tail removal`, async () => {
    const w = await world(composed, { effects: true }), { f, a, G, retired, bursts, step } = w;
    try {
      for (let i = 0; i < 60; i++) step();
      const record = [...f.localWailPairs(G.projectiles)][0], d = G.fx.s3SpecialVfx, mouths = d.tracks.get(a).d.mouths;
      assert.equal(mouths.length, 6);
      if (ending === 'splat') a.splat(w.victim, 'shooter');
      else assert.equal(a.superJump(new f.THREE.Vector3(0, 0, 0)), true);
      step(); assert.equal(record.detached, true); assert.equal(retired.length, 0); assert.equal(bursts.length, 0);
      assert.equal(mouths.filter(r => !r.dead).length, 2, 'only the committed pair survives body end');
      a.pos.set(35, 0, 35);
      while (G.projectiles._s3WailTails.length) step();
      assert.ok(G.time < record.until - .04, 'exercise the final-damage-tick / speaker-retirement gap');
      assert.equal(retired.length, 0); assert.equal(record.status, 'fired');
      assert.deepEqual(positions(G).map(p => [...p]), record.origins.map(p => [...p]));
      while (G.time + 1e-8 < record.until) step();
      assert.equal(retired.length, 1); assert.equal(bursts.length, 1); assert.equal(positions(G).length, 0);
      assert.equal(d.lasers.size, 0); assert.equal(mouths.filter(r => !r.dead && d.kit.discs.recs.includes(r)).length, 0);
      const spheres = d.kit.shells.recs.filter(r => r.v[12] === 3);
      assert.equal(spheres.length, 2, 'one existing pooled SHOCK sphere per speaker');
      for (let i = 0; i < 2; i++) for (let axis = 0; axis < 3; axis++)
        assert.ok(Math.abs(spheres[i].v[axis] - record.origins[i][axis]) < 1e-6, 'GPU pool stores Float32 origin coordinates');
      assert.equal(d.errors, 0);
      for (let i = 0; i < 120; i++) step();
      assert.equal(retired.length, 1); assert.equal(bursts.length, 1);
    } finally { w.close(); }
  });

  for (const fired of [false, true]) for (const cancellation of ['reset', 'clear'])
    test(`${mode}: ${fired ? 'fired' : 'unfired'} ${cancellation} never bursts`, async () => {
      const w = await world(composed, { effects: true });
      try {
        for (let i = 0; i < (fired ? 60 : 12); i++) w.step();
        if (cancellation === 'reset') w.a.reset(); else w.G.projectiles.clear();
        for (let i = 0; i < 360; i++) w.step();
        assert.equal(w.retired.length, 0); assert.equal(w.bursts.length, 0);
        assert.equal([...w.f.localWailPairs(w.G.projectiles)].length, 0);
      } finally { w.close(); }
    });

  test(`${mode}: an unfired death and loss of active source authority cannot become normal retirement`, async () => {
    for (const boundary of ['unfired-death', 'owner', 'remote', 'life', 'snapshot-life', 'match', 'replacement-state']) {
      const w = await world(composed), { a, G, step } = w;
      try {
        for (let i = 0; i < (boundary === 'unfired-death' ? 12 : 60); i++) step();
        if (boundary === 'unfired-death') a.splat(w.victim, 'shooter');
        if (boundary === 'owner') a.owner = 'replacement-owner';
        if (boundary === 'remote') a.remote = true;
        if (boundary === 'life') a.netLife++;
        if (boundary === 'snapshot-life') a.net = { lastLife: 9 };
        if (boundary === 'match') G.match = { ...G.match };
        if (boundary === 'replacement-state') a._s3AllSpecialState = null;
        for (let i = 0; i < 360; i++) step();
        assert.equal(w.retired.length, 0, boundary);
      } finally { w.close(); }
    }
  });

  test(`${mode}: packet gaps, whole-special end and accepted late/repeated remote rows never author a retirement`, async () => {
    const w = await world(composed, { start: false, effects: true }), { f, api, a, G, step } = w;
    try {
      a.remote = true; a.specialActive = { id: 'killerWail', activation: 7, phase: 'laser' };
      const replay = f.observeSpecialReplay(api, (_actor, event) => f.replaySpecial(api, event));
      const row = { actor: a, id: 'killerWail', activation: 7, action: 'laser', pos: [1, 2, 3], target: [1, 2, 30], index: 0, tick: 0, seed: 10 };
      assert.equal(replay(a, row), true); assert.equal(replay(a, row), false);
      for (let i = 0; i < 240; i++) step();
      assert.equal(G.fx.s3SpecialVfx.lasers.size, 0, 'the existing remote freshness timeout still runs');
      assert.equal(replay(a, { ...row, action: 'end', reason: 'duration', seed: 11 }), true); a.specialActive = null;
      assert.equal(replay(a, { ...row, tick: 1, seed: 12 }), true, 'late accepted laser still follows the existing remote path');
      api.specialModelsReplay({ ...row, action: 'activate' }); // late snapshot observation is not a local source commit
      for (let i = 0; i < 360; i++) step();
      assert.equal(w.retired.length, 0); assert.equal(w.bursts.length, 0);
      assert.equal([...f.localWailPairs(G.projectiles)].length, 0);
    } finally { w.close(); }
  });

  test(`${mode}: beam freshness and holder disposal cannot retire a local pair`, async () => {
    const w = await world(composed, { effects: true });
    try {
      for (let i = 0; i < 60; i++) w.step();
      const record = [...w.f.localWailPairs(w.G.projectiles)][0];
      w.a.splat(w.victim, 'shooter'); w.step();
      const holder = w.G.scene.children.find(o => o.name === 'killer-wail-surviving-speaker');
      assert.ok(holder); holder.removeFromParent();
      // Advance optional FX only, as with a paused source or lost visual ticks.
      for (let i = 0; i < 20; i++) w.G.fx.update(.1, w.G.camera);
      assert.equal(w.G.fx.s3SpecialVfx.lasers.size, 0); assert.equal(record.status, 'fired');
      assert.equal(w.retired.length, 0); assert.equal(w.bursts.length, 0);
      while (w.G.time + 1e-8 < record.until) w.step();
      assert.equal(w.retired.length, 1); assert.equal(w.bursts.length, 1);
    } finally { w.close(); }
  });

  for (const cancel of ['reset', 'clear']) test(`${mode}: ${cancel} in the gap after the final damage tail suppresses retirement`, async () => {
    const w = await world(composed);
    try {
      for (let i = 0; i < 60; i++) w.step();
      const record = [...w.f.localWailPairs(w.G.projectiles)][0]; w.a.splat(w.victim, 'shooter');
      while (w.G.projectiles._s3WailTails.length) w.step();
      assert.ok(w.G.time < record.until); assert.equal(record.status, 'fired');
      if (cancel === 'reset') w.a.reset(); else w.G.projectiles.clear();
      for (let i = 0; i < 120; i++) w.step();
      assert.equal(record.status, 'cancelled'); assert.equal(w.retired.length, 0);
    } finally { w.close(); }
  });

  test(`${mode}: the same Actor's later life/activation cannot revive a consumed pair`, async () => {
    const w = await world(composed), { f, api, a, step } = w;
    try {
      for (let i = 0; i < 360; i++) step();
      const old = w.retired[0].record;
      a.reset(); a.netLife = 5; a.weapon = { ...a.weapon, special: 'killerWail', specialCost: 100 };
      a.special = 100; a.pos.set(15, 0, 15); a._startSpecial();
      for (let i = 0; i < 360; i++) step();
      assert.deepEqual(w.retired.map(r => [r.record.life, r.record.activation, r.record.index]),
        [[4, 1, 0], [4, 1, 1], [4, 1, 2], [5, 2, 0], [5, 2, 1], [5, 2, 2]]);
      f.fireLocalWailPair(api, a, old.state, old.pair);
      for (let i = 0; i < 120; i++) step();
      assert.equal(w.retired.length, 6); assert.equal(old.status, 'retired'); assert.equal(old.life, 4);
    } finally { w.close(); }
  });

  test(`${mode}: retirement follows the actual gear-adjusted source lifetime`, async () => {
    const w = await world(composed, { start: false });
    try {
      w.a.s3.loadout = w.f.emptyLoadout();
      for (const piece of w.a.s3.loadout) { piece.main = 'specialPower'; piece.subs.fill('specialPower'); }
      w.a.s3RefreshGear(); w.a.weapon = { ...w.a.weapon, special: 'killerWail', specialCost: 100 };
      w.a.special = 100; w.a._startSpecial();
      for (let i = 0; i < 420; i++) w.step();
      assert.equal(w.retired.length, 3);
      for (const { record, at } of w.retired) {
        assert.ok(Math.abs(at - record.pair.until) < 1e-7);
        assert.ok(Math.abs(record.pair.until - record.pair.start - 4) < 1e-7);
      }
    } finally { w.close(); }
  });
}
