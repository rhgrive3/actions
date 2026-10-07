import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installFlowMotion as installFromAnotherRealm } from '../runtime/flow-motion.mjs';

// Exactly one VM owns the actual production installer, THREE, Actor, Runner,
// full Character and all motion hooks. Do not compose cross-realm fixtures.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let cached;
const OLD_DRAW_PREFIX = "function draw(ch, s, THREE) {\n  const shown = ch.visible !== false && ch.root.visible && s.level > EPS;\n  if (!s.resources && shown) makeResources(ch, s, THREE);\n  const r = s.resources; if (!r) return;\n  r.group.visible = shown; syncShell(ch, s, r, THREE, shown);\n  const color = ch.color;\n  for (const m of r.ownedMaterials) m.uniforms.uColor.value.copy(color).multiplyScalar(1.45);\n  r.shellMat.uniforms.uLevel.value = s.level;\n  if (!shown) return;\n";

async function production({ oldHiddenSync = false } = {}) {
  if (cached && !oldHiddenSync) return cached;
  const flowProbe = { sync: 0, hiddenSync: 0, materialBatches: 0 };
  const context = vm.createContext({ console, performance, URL, __flow880: flowProbe }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    let source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('/runtime/flow-motion.mjs')) {
      if (oldHiddenSync) {
        const start = source.indexOf('function draw(ch, s, THREE) {'), end = source.indexOf('  anchors(ch, s);', start);
        assert.ok(start >= 0 && end > start); source = source.slice(0, start) + OLD_DRAW_PREFIX + source.slice(end);
      }
      const sync = 'function syncShell(ch, s, r, THREE, shown) {';
      assert.equal(source.split(sync).length, 2);
      source = source.replace(sync, sync + '\n  __flow880.sync++; if (!shown) __flow880.hiddenSync++;');
      const color = '  const color = ch.color;'; assert.equal(source.split(color).length, 2);
      source = source.replace(color, '  __flow880.materialBatches++;\n' + color);
    }
    const m = new vm.SourceTextModule(file.startsWith(SRC + path.sep)
      ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, m); return m;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { installFlowMotion, flowMotionSnapshot, FLOW_MOTION_CALIBRATION } from './patches/splatoon3/runtime/flow-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
  `, { context, identifier: path.join(ROOT, 'flow-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/')
      ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile };
  api.installFlowMotion(api);
  assert.throws(() => entry.namespace.install(profile), /already installed/);
  // Symbol.for guards the actual prototype even when a duplicate module comes
  // from another realm; independent WeakSets would install this hook twice.
  const update = api.Character.prototype.update;
  api.installFlowMotion(api); installFromAnotherRealm(api);
  assert.equal(api.Character.prototype.update, update);
  const { G, THREE } = api;
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' };
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.level = { blocks: [], groundHeight: () => 0 };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true, canRespawn: () => false };
  G.physics = { los: () => true, raycast: (_a, _b, _c, hit) => { hit.hit = false; return hit; } };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling',
    'fireBlaster', 'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => {}]));
  G.actors = []; G.time = 0;
  api.flowProbe = flowProbe;
  if (!oldHiddenSync) cached = api; return api;
}
function rig(api, kind = 'shooter', team = 0) {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team, name: 'flow production regression', weapon: kind,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null;
  G.scene.add(ch.root); G.actors.push(a); a.grounded = a.ground.hit = true;
  // Only world collision/movement integration is stubbed. The actual Actor
  // update, Flow, Runner, _finishFrame, pose and native IK still execute.
  a._integrate = () => {}; a._spawnBarrier = () => {}; a._updateClimb = () => {};
  const step = (dt = 1 / 60, input = {}) => {
    a.ink = 100; a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    a.intent.squid = a.form === 'squid'; G.time += dt; a.update(dt);
    ch.root.updateMatrixWorld(true);
    assert.ok(Array.from(ch.P).every(Number.isFinite));
  };
  const visual = (dt = 1 / 60) => { a._finishFrame(dt); ch.root.updateMatrixWorld(true); };
  for (let i = 0; i < 60; i++) step();
  assert.equal(ch._owner(), a); assert.equal(ch._runner(), a.weaponRunner);
  return { api, a, ch, step, visual, snapshot: () => api.flowMotionSnapshot(ch),
    close() { G.actors = G.actors.filter(actor => actor !== a); ch.dispose(); } };
}

// Presentation-only workload: state transitions below drive the actual Actor's
// authoritative Flow record; no gameplay Flow clock is implemented here.
const DT = 1 / 60;
function exterior(ch) { return ch.root.getObjectByName('s3-flow-exterior'); }
function shells(ch) { return ch.root.getObjectsByProperty('isMesh', true).filter(x => x.name.startsWith('s3-flow-edge:') || x.name === 's3-flow-squid-edge'); }
function metrics(api) { Object.assign(api.flowProbe, { sync: 0, hiddenSync: 0, materialBatches: 0 }); }
function warm(r) {
  Object.assign(r.a.s3.flow, { active: true, remaining: 10 });
  for (const tier of ['hero', 'game']) { r.ch.setLod(tier); for (let i = 0; i < 24; i++) r.visual(); }
  assert.equal(r.snapshot().visible, true); assert.ok(shells(r.ch).length > 1);
}
function expire(r) {
  Object.assign(r.a.s3.flow, { active: false, remaining: 0 });
  for (let i = 0; i < 20; i++) r.visual();
  assert.equal(r.snapshot().level, 0); assert.equal(r.snapshot().visible, false);
}
function watchVisibility(objects) {
  const writes = new Map();
  for (const obj of objects) {
    let value = obj.visible; writes.set(obj, 0);
    Object.defineProperty(obj, 'visible', { configurable: true, enumerable: true,
      get: () => value, set(v) { writes.set(obj, writes.get(obj) + 1); value = v; } });
  }
  return writes;
}

test('#880 old draw performs 60 hidden shell and material passes after expiry', async () => {
  const api = await production({ oldHiddenSync: true }), r = rig(api);
  try {
    warm(r); expire(r); metrics(api);
    for (let i = 0; i < 60; i++) r.visual();
    assert.equal(api.flowProbe.sync, 60); assert.equal(api.flowProbe.hiddenSync, 60);
    assert.equal(api.flowProbe.materialBatches, 60);
  } finally { r.close(); }
});

test('#880 eight cached Characters retire once then have zero hidden work for 60 ticks', async () => {
  const api = await production(), rigs = Array.from({ length: 8 }, () => rig(api));
  try {
    const watches = [];
    for (const r of rigs) {
      warm(r); Object.assign(r.a.s3.flow, { active: false, remaining: 0 });
      const fadeFrames = Math.ceil(api.FLOW_MOTION_CALIBRATION.expiryTime / DT);
      for (let i = 0; i < fadeFrames - 1; i++) r.visual();
      assert.ok(r.snapshot().level > 0);
      const targets = [exterior(r.ch), ...shells(r.ch)], writes = watchVisibility(targets);
      metrics(api); r.visual(); assert.equal(r.snapshot().level, 0);
      assert.equal(api.flowProbe.sync, 0); assert.equal(api.flowProbe.materialBatches, 0);
      for (const obj of targets) { assert.equal(obj.visible, false); assert.equal(writes.get(obj), 1); }
      watches.push(writes);
    }
    metrics(api);
    for (let i = 0; i < 60; i++) for (const r of rigs) r.visual();
    assert.deepEqual(api.flowProbe, { sync: 0, hiddenSync: 0, materialBatches: 0 });
    for (const writes of watches) for (const count of writes.values()) assert.equal(count, 1);
  } finally { for (const r of rigs) r.close(); }
});

test('#880 reactivation catches current LOD, geometry, form, transform and color on its first shown tick', async () => {
  const api = await production(), r = rig(api);
  try {
    warm(r); const group = exterior(r.ch), before = r.snapshot().activationCount;
    expire(r); api.G.settings.quality = 'low'; r.ch.setLod('far');
    r.a.form = 'squid'; r.a.submerged = true; r.a.anim.form = 'swim'; r.a.pos.set(4, 0, -2);
    r.ch.color.set('#2f5bff');
    for (let i = 0; i < 30; i++) r.visual();
    metrics(api); Object.assign(r.a.s3.flow, { active: true, remaining: 10 }); r.visual();
    assert.equal(exterior(r.ch), group); assert.equal(r.snapshot().visible, true);
    assert.equal(r.snapshot().activationCount, before + 1); assert.equal(api.flowProbe.sync, 1);
    const sq = r.ch.root.getObjectByName('s3-flow-squid-edge'), source = r.ch.squid.body;
    assert.equal(sq.geometry.attributes.position, source.geometry.attributes.position);
    assert.deepEqual(sq.position.toArray(), source.position.toArray());
    assert.deepEqual(sq.quaternion.toArray(), source.quaternion.toArray());
    assert.deepEqual(sq.scale.toArray(), source.scale.toArray());
    assert.deepEqual(sq.material.uniforms.uColor.value.toArray(), r.ch.color.clone().multiplyScalar(1.45).toArray());
    expire(r); r.a.form = 'kid'; r.a.submerged = false; r.a.anim.form = 'kid'; r.ch.setLod('game');
    api.G.settings.quality = 'high'; for (let i = 0; i < 30; i++) r.visual();
    metrics(api); Object.assign(r.a.s3.flow, { active: true, remaining: 10 }); r.visual();
    assert.equal(api.flowProbe.sync, 1);
    const tier = r.ch.lod.to >= 0 && r.ch.lod.f >= .5 ? r.ch.lod.to : r.ch.lod.tier;
    for (const mesh of r.ch.lodSets[tier].list.filter(m => ['skin','cloth','hair'].includes(m.userData.iwMat))) {
      const shell = mesh.parent.children.find(x => x.name.startsWith('s3-flow-edge:') && x.geometry?.index === mesh.geometry.index);
      assert.ok(shell); assert.equal(shell.skeleton, mesh.skeleton); assert.deepEqual(shell.matrix.toArray(), mesh.matrix.toArray());
      assert.equal(shell.visible, r.ch.kid.visible && mesh.visible);
    }
  } finally { api.G.settings.quality = 'high'; r.close(); }
});

test('#880 explicit hide/clear stays quiescent and inactive cached views dispose once', async () => {
  const api = await production(), r = rig(api);
  try {
    warm(r); const group = exterior(r.ch), targets = [group, ...shells(r.ch)], writes = watchVisibility(targets);
    r.ch.setVisible(false); for (const obj of targets) assert.equal(writes.get(obj), 1);
    metrics(api); for (let i = 0; i < 30; i++) { r.ch.setVisible(false); r.visual(); }
    assert.deepEqual(api.flowProbe, { sync: 0, hiddenSync: 0, materialBatches: 0 });
    for (const obj of targets) assert.equal(writes.get(obj), 1);
    r.a.alive = false; metrics(api); for (let i = 0; i < 10; i++) r.visual();
    for (const obj of targets) assert.equal(writes.get(obj), 1);
    assert.deepEqual(api.flowProbe, { sync: 0, hiddenSync: 0, materialBatches: 0 });
    const meshes = r.ch.root.getObjectsByProperty('isMesh', true).filter(m => m.name.startsWith('s3-flow-'));
    const owned = new Set(meshes.flatMap(m => [m.geometry,m.material])); owned.add(group.getObjectByName('s3-flow-glints'));
    const counts = new Map([...owned].map(x => [x,0])); for (const x of owned) x.addEventListener('dispose',()=>counts.set(x,counts.get(x)+1));
    let nativeDisposed=0;r.ch.squid.body.geometry.addEventListener('dispose',()=>nativeDisposed++);
    r.ch.dispose();r.ch.dispose();r.ch.update(DT,r.a.anim);
    for (const count of counts.values()) assert.equal(count,1);
    assert.equal(nativeDisposed,0);assert.equal(group.parent,null);assert.equal(r.snapshot().disposed,true);
  } finally { r.close(); }
});
