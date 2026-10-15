import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture as sourceFixture } from './source-fixture.mjs';
import { productionComposition } from './weapon-edgecases-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { FixedClock } from '../runtime/clock.mjs';
import {
  HISTORY_CAPACITY,
  HISTORY_HZ,
  ProjectileHistory,
  ProjectileVisualRuntime,
  projectileDrawRadius,
  projectileTailFrames,
  projectileVisualKind,
  projectileVisualWidth,
} from '../runtime/projectile-visuals.mjs';
import {
  PROJECTILE_VISUAL_SOURCE,
  PROJECTILE_VISUAL_SOURCE_COMMIT,
  PROJECTILE_VISUAL_SOURCE_VERSION,
} from '../runtime/projectile-visual-source-data.mjs';

const VFX_EVIDENCE = JSON.parse(fs.readFileSync(
  new URL('../reference/projectile-vfx-evidence.json', import.meta.url), 'utf8'));
const DT = 1 / 60;

test('current S3 shape renderer and history renderer never submit the same native Shooter body twice', async () => {
  const f=await sourceFixture({productionComposition:true,fullRuntime:true,realProjectiles:true,
    extraExports:"export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
  f.G.scene=new f.THREE.Scene();f.G.physics=new f.Physics(f.G.level);
  f.G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};
  f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
  const ps=f.G.projectiles=new f.Projectiles(f.G.scene),a=f.make('shooter');
  a.pos.set(0,2,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,2,50);f.G.actors=[a];
  ps.fireShooter(a,a.weapon);
  for(let i=0;i<4;i++){f.G.time+=DT;ps.update(DT);}
  const before=ps.list.map(gameplayRow);
  ps._draw();ps.syncVisuals(1);
  assert.ok(ps.list.some(p=>p.s3Shape==='shot'&&ps.projectileVisuals.handles(p)));
  assert.equal(ps.s3ShapeCounts.body,0,'the adopted renderer retains classification but yields handled bodies');
  assert.ok(ps.projectileVisuals.mesh.visible&&ps.projectileVisuals.stats.triangles>0);
  assert.equal(ps.projectileVisuals.geometry.drawRange.count,ps.projectileVisuals.stats.triangles*3);
  assert.deepEqual(ps.list.map(gameplayRow),before,'render ownership cannot change native flight');
  ps.clear();assert.equal(ps.projectileVisuals.mesh.visible,false);assert.equal(ps._s3Shapes.body.count,0);
  ps.disposeVisuals();
});

async function nativeFixture(withVisuals = true, vmMathRandom = null) {
  const f = await sourceFixture({ adaptNative: withVisuals ? adaptBuildSource : productionComposition,
    fullRuntime: true, realProjectiles: true, vmMathRandom });
  f.G.scene = new f.THREE.Scene();
  f.G.actors = []; f.G.boss = null; f.G.netm = null;
  f.G.level.queryBlocks = (_a, _b, _c, _d, out) => { out.length = 0; return out; };
  f.G.physics = new f.Physics(f.G.level);
  const ps = f.G.projectiles = new f.Projectiles(f.G.scene);
  return { f, ps };
}

function gameplayRow(p) {
  return { type: p.type, wid: p.wid, age: p.age, delay: p.delay, life: p.life, pos: p.pos.toArray(),
    prev: p.prev.toArray(), vel: p.vel.toArray(), start: p.start.toArray(), size: p.size, radius: p.radius,
    damage: p.damage, dmgFar: p.dmgFar, vis: p.vis, seed: p.seed, grav: p.grav, drag: p.drag,
    straight: p.straight, trailEvery: p.trailEvery, sats: p.sats, ghost: p.ghost,
    sloshIndex: p.fidelitySloshIndex, sloshPacketIndex: p.fidelitySloshPacketIndex,
    sloshDraw: p.fidelitySloshDraw, collision: p.fidelityPlayerCollision,
    fieldCollision: p.fidelityFieldCollision, inkProfile: p.inkProfile?.id ?? p.inkProfile ?? null,
    netSteps: p._netSteps };
}

function nativeFingerprint(f, ps, actor, net, randomDraws) {
  return JSON.parse(JSON.stringify({ randomDraws, ink: actor.ink, turf: actor.turf, points: actor.points,
    projectiles: ps.list.map(gameplayRow), packets: net.out.map(event => event.slice(1)) }));
}

function firstDifference(a, b, path = '$') {
  if (Object.is(a, b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object')
    return { path, actual: a, expected: b };
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key))
      return { path: `${path}.${key}`, actual: a[key], expected: b[key] };
    const diff = firstDifference(a[key], b[key], `${path}.${key}`);
    if (diff) return diff;
  }
  return null;
}

test('pinned source data keeps unknown shooter defaults distinct from explicit Splatling tails', () => {
  assert.equal(PROJECTILE_VISUAL_SOURCE_VERSION, '11.3.0');
  assert.equal(PROJECTILE_VISUAL_SOURCE_COMMIT, '7280ff9cde8bb1c5dcef46c700c326471584d2e6');
  assert.equal(PROJECTILE_VISUAL_SOURCE.WeaponShooterNormal.tailLength, null,
    'missing ordinary-shooter tail must remain unknown');
  assert.equal(PROJECTILE_VISUAL_SOURCE.WeaponSpinnerStandard.tailLength.MaxLengthFrame, 3,
    'three frames are explicit for this Splatling source only');
  assert.ok(VFX_EVIDENCE.unresolved.includes('S3 ordinary-shooter MaxLengthFrame runtime constructor/default.'));
  const ordinaryTail = VFX_EVIDENCE.verified_findings.find(f => f.id === 'shooter_tail_default');
  assert.equal(ordinaryTail.status, 'key_absent_runtime_default_unknown');
  assert.equal(ordinaryTail.resolved_runtime_value, null);
  assert.equal(ordinaryTail.limits.some(s => /Cannot infer zero, three/.test(s)), true);
});

test('pinned Roller DrawSizeParam stays split between horizontal and vertical sheet modes', () => {
  const roller = PROJECTILE_VISUAL_SOURCE.WeaponRollerNormal;
  assert.equal(roller.rendererMode, 'roller-splash-sheet');
  assert.deepEqual(roller.wide.map(u => [u.drawSize.InitRadius, u.drawSize.EndRadius]),
    [[0.3, 0.3], [0.3, 0.3]]);
  assert.deepEqual(roller.vertical.map(u => [u.drawSize.InitRadius, u.drawSize.EndRadius]),
    [[0.36, 0.36], [0.36, 0.36], [0.36, 0.36]]);
});

test('pinned Slosher front-four and rear-five records preserve exact DrawSize, offsets, and tail bounds', () => {
  const source = PROJECTILE_VISUAL_SOURCE.WeaponSlosherStrong;
  assert.equal(source.rendererMode, 'slosher-bucket-sheet');
  const active = source.slosh.filter(unit => unit.bulletNum > 0);
  assert.deepEqual(active.map(unit => unit.bulletNum), [4, 5]);
  assert.equal(active.reduce((sum, unit) => sum + unit.bulletNum, 0), 9);
  assert.deepEqual(active.map(unit => [
    unit.drawSize.InitRadius, unit.drawSize.EndRadius,
    unit.drawSize.AfterOffsetInitRadius, unit.drawSize.AfterOffsetEndRadius,
  ]), [[0.5625, 1, -0.05, -0.03], [0.6, 0.6, -0.1, -0.1]]);
  for (const unit of active) {
    assert.equal(unit.drawSize.ChangeFrame, 0, 'the source zero keeps the existing radiusAt contract');
    assert.equal(unit.drawSize.TailLengthMin, 0.5);
    assert.equal(unit.drawSize.TailLengthMax, 4);
    assert.equal(unit.drawSize.TailSolidFrame, 5);
  }
});

test('fixed-size projectile history retains curved samples and has identical 30/60/120 Hz timelines', () => {
  assert.equal(HISTORY_HZ, 60);
  assert.equal(HISTORY_CAPACITY, 32);
  const history = new ProjectileHistory(), out = new Float64Array(10), backing = history.data;
  history.record(0, 0, 0, 0, 1, 0, 0);
  history.record(1 / 60, 1, 1, 0, 1, 0, 0);
  history.record(2 / 60, 2, 0, 0, 1, 0, 0);
  assert.equal(history.sample(1.5 / 60, out, 2), true);
  assert.ok(Math.abs(out[2] - 1.5) < 1e-9);
  assert.ok(Math.abs(out[3] - 0.5) < 1e-9, 'mid-arc sample stays on the recorded curved trajectory');
  assert.equal(history.data, backing, 'sampling reuses the preallocated ring and caller output');

  const traces = [];
  const recordedState = [];
  for (const hz of [30, 60, 120]) {
    const clock = new FixedClock(), h = new ProjectileHistory(), trace = [];
    let age = 0;
    h.record(0, 0, 0, 0, 1, 0, 0);
    for (let frame = 0; frame < hz; frame++) clock.advance(1 / hz, dt => {
      age += dt;
      h.record(age, age, Math.sin(age * 3), age * age, 1, 3 * Math.cos(age * 3), 2 * age);
      trace.push([age, h.latestAge, h.count]);
      recordedState.push([hz, Array.from(h.data)]);
    });
    assert.equal(clock.ticks, 60);
    assert.equal(h.count, HISTORY_CAPACITY, 'history wraps at its fixed bound after one second');
    traces.push(trace);
  }
  assert.deepEqual(traces[1], traces[0]);
  assert.deepEqual(traces[2], traces[0]);
  const byHz = [30, 60, 120].map(hz => recordedState.filter(([rate]) => rate === hz).map(([, state]) => state));
  assert.deepEqual(byHz[1], byHz[0], 'the full fixed-grid position and tangent ring agrees at 30 and 60 Hz render cadence');
  assert.deepEqual(byHz[2], byHz[0], 'the full fixed-grid position and tangent ring agrees at 120 Hz render cadence');
});

test('source-aware renderer assigns distinct geometry to shooter, Roller, and Slosher modes in one bounded batch', async () => {
  const f = await sourceFixture({ fullRuntime: true });
  const { THREE } = f, system = { scene: new THREE.Scene(), list: [], inkFlight: { time: 0 } };
  const runtime = new ProjectileVisualRuntime(system, THREE);
  const color = new THREE.Color('#e65124');
  const sourceSlosh = (initRadius, endRadius, afterInit, afterEnd) => ({ initRadius, endRadius,
    AfterOffsetInitRadius: afterInit, AfterOffsetEndRadius: afterEnd, changeTime: 0,
    tailMin: 0.5, tailMax: 4, tailSolidTime: 5 / 60 });
  const cases = [
    { name: 'shooter', p: { type: 'shot', wid: 'shooter', vis: 0.11, size: 0.15 } },
    { name: 'roller-horizontal', p: { type: 'drop', wid: 'roller', fidelityMode: 'horizontal',
      fidelityDrawRadius: sourceSlosh(0.3, 0.3, 0, 0), vis: 0.3 } },
    { name: 'roller-vertical', p: { type: 'drop', wid: 'roller', fidelityMode: 'vertical',
      fidelityDrawRadius: sourceSlosh(0.36, 0.36, 0, 0), vis: 0.36 } },
    { name: 'bucket-front', p: { type: 'slosh', wid: 'slosher', fidelitySloshPacketIndex: 1,
      fidelitySloshIndex: 1, fidelitySloshDraw: sourceSlosh(0.5625, 1, -0.05, -0.03), vis: 0.97 } },
    { name: 'bucket-rear', p: { type: 'slosh', wid: 'slosher', fidelitySloshPacketIndex: 5,
      fidelitySloshIndex: 1, fidelitySloshDraw: sourceSlosh(0.6, 0.6, -0.1, -0.1), vis: 0.5 } },
    { name: 'bubble', p: { type: 'slosh', wid: 'slosher', catalog: {
      r: { sourceActor: 'WeaponSlosherBathtub', family: 'slosher' }, descriptor: { key: 'slosh', unit: 0, index: 0 } }, vis: 0.8 } },
    { name: 'explosive', p: { type: 'slosh', wid: 'slosher', catalog: {
      r: { sourceActor: 'WeaponSlosherWashtub', family: 'slosher' }, descriptor: { key: 'slosh', unit: 0, index: 0 } }, vis: 0.8 } },
    { name: 'tri-sheet', p: { type: 'slosh', wid: 'slosher', catalog: {
      r: { sourceActor: 'WeaponSlosherDiffusion', family: 'slosher' }, descriptor: { key: 'slosh', unit: 0, index: 0 } }, vis: 0.8 } },
    { name: 'paired-sheet', p: { type: 'slosh', wid: 'slosher', catalog: {
      r: { sourceActor: 'WeaponSlosherDouble', family: 'slosher' }, descriptor: { key: 'slosh', unit: 0, index: 0 } }, vis: 0.8 } },
  ];
  for (const { name, p } of cases) {
    assert.equal(projectileVisualKind(p), name);
    Object.assign(p, { pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(12, 0, 4),
      age: 0, life: 2, delay: 0, seed: 0.25, owner: { color } });
    system.list.push(p);
  }
  assert.equal(projectileDrawRadius(cases[3].p), 0.97, 'front index one uses source end radius plus its source offset');
  assert.equal(projectileDrawRadius(cases[4].p), 0.5, 'rear index one uses source end radius plus its source offset');
  assert.equal(projectileTailFrames({ type: 'shot', wid: 'shooter' }, 0), 0,
    'ordinary Shooter source omission stays unknown and does not borrow the Splatling value');
  assert.equal(projectileTailFrames({ type: 'shot', wid: 'splatling' }, 0), 3,
    'an explicit Splatling tail source keeps its three-frame value');

  for (let frame = 1; frame <= 40; frame++) for (const { p } of cases) {
    runtime.beginStep(p);
    p.prev.copy(p.pos);
    p.age = frame / 60;
    p.pos.set(frame * 0.12, Math.sin(frame * 0.2) * 0.2, frame * 0.04);
    p.vel.set(7.2, Math.cos(frame * 0.2) * 2.4, 2.4);
    runtime.recordStep(p, 1 / 60);
  }
  runtime.draw(1);
  const bodyVertices = 13 * 12, bodyTriangles = 12 * 12 * 2;
  assert.equal(runtime.stats.vertexCount, cases.length * bodyVertices);
  assert.equal(runtime.stats.triangles, cases.length * bodyTriangles);
  assert.equal(runtime.stats.drawCalls, 1, 'all source-aware forms share one opaque batch');
  assert.equal(runtime.geometry.drawRange.count, cases.length * bodyTriangles * 3);
  assert.equal(runtime.mesh.visible, true);
  assert.equal(runtime.material.vertexColors, true);
  assert.equal(runtime.material.transparent, false);
  assert.equal(runtime.material.depthWrite, true);
  assert.equal(runtime.material.isMeshPhysicalMaterial, true);
  assert.ok(!runtime.material.isShaderMaterial, 'the CPU-authored buffers do not depend on a custom vertex shader');
  assert.equal(runtime.material.type, 'MeshPhysicalMaterial');
  assert.equal(runtime.geometry.getAttribute('position'), runtime.position);
  assert.equal(runtime.geometry.getAttribute('normal'), runtime.normal);
  assert.equal(runtime.mesh.castShadow, true);
  for (const attr of [runtime.position, runtime.normal, runtime.color]) {
    for (const value of attr.array.subarray(0, runtime.stats.vertexCount * 3)) assert.ok(Number.isFinite(value));
  }
  for (let i = 0; i < runtime.stats.vertexCount; i++) {
    const o = i * 3, n = runtime.normal.array;
    assert.ok(Math.abs(Math.hypot(n[o], n[o + 1], n[o + 2]) - 1) < 1e-4, `normal ${i} stays unit length`);
  }
  const positions = runtime.position.array;
  const geometry = runtime.geometry, material = runtime.material;
  const index = runtime.geometry.index.array, attributes = runtime.attributes;
  const shapes = new Map(cases.map(({ name }, i) => [name,
    Array.from(positions.subarray(i * bodyVertices * 3, (i + 1) * bodyVertices * 3))]));
  assert.notDeepEqual(shapes.get('roller-horizontal'), shapes.get('roller-vertical'));
  assert.notDeepEqual(shapes.get('bucket-front'), shapes.get('bucket-rear'));
  assert.notDeepEqual(shapes.get('bubble'), shapes.get('explosive'));
  assert.notDeepEqual(shapes.get('tri-sheet'), shapes.get('paired-sheet'));

  for (let i = 0; i < 120; i++) runtime.draw(i % 2 ? 0.5 : 1);
  assert.equal(runtime.position.array, positions);
  assert.equal(runtime.geometry.index.array, index);
  assert.equal(runtime.geometry, geometry);
  assert.equal(runtime.material, material);
  assert.equal(runtime.attributes, attributes);
  assert.equal(runtime.stats.historiesCreated, runtime.capacity * 2);
  assert.ok(runtime.stats.vertexCount <= runtime.capacity * bodyVertices);
  assert.ok(runtime.geometry.drawRange.count <= runtime.capacity * bodyTriangles * 3);
  assert.ok(cases.every(({ p }) => p._iwVisualHistory.count <= HISTORY_CAPACITY));
  runtime.dispose();
  assert.equal(system.scene.children.includes(runtime.mesh), false);
});

test('source-sized Slosher caps stay at recorded endpoints across short and long retained histories', async () => {
  const { THREE } = await sourceFixture({ fullRuntime: true });
  const system = { scene: new THREE.Scene(), list: [], inkFlight: { time: 0 } };
  const runtime = new ProjectileVisualRuntime(system, THREE);
  const strong = PROJECTILE_VISUAL_SOURCE.WeaponSlosherStrong;
  const frontDraw = strong.slosh.find(unit => unit.bulletNum === 4).drawSize;
  const rearDraw = strong.slosh.find(unit => unit.bulletNum === 5).drawSize;
  const makeRound = (index, packetIndex, sourceDraw, speed, firstFrame) => {
    const p = { type: 'slosh', wid: 'slosher', fidelitySloshIndex: index,
      fidelitySloshPacketIndex: packetIndex, fidelitySloshDraw: sourceDraw,
      age: 0.5, life: 2, delay: 0, seed: 0.25, vis: 99,
      pos: new THREE.Vector3(0, 0, 5 + speed * 0.5),
      prev: new THREE.Vector3(0, 0, 5 + speed * 0.5),
      vel: new THREE.Vector3(0, 0, speed), owner: { color: new THREE.Color('#e65124') } };
    p._iwVisualKind = projectileVisualKind(p);
    const history = new ProjectileHistory();
    for (let frame = firstFrame; frame <= 30; frame++) {
      const age = frame * DT;
      history.record(age, 0, 0, 5 + speed * age, 0, 0, speed);
    }
    p._iwVisualHistory = history;
    system.list.push(p);
    return { p, history, speed };
  };
  // The front glob retains thirty-one points; the rear glob retains only eight.
  // Their visible tails span four and three metres, respectively, while each
  // mesh cap must remain bounded by its own exact source DrawSize radius.
  const cases = [
    makeRound(1, 1, frontDraw, 72, 0),
    makeRound(1, 5, rearDraw, 36, 23),
  ];
  assert.deepEqual(cases.map(({ p, history }) => [p._iwVisualKind, history.count]),
    [['bucket-front', 31], ['bucket-rear', 8]]);
  assert.deepEqual(cases.map(({ p }) => projectileDrawRadius(p)), [0.97, 0.5],
    'the two source-offset radii are not replaced by gameplay collision size or a history-based scale');

  const bodyVertices = 13 * 12;
  const ringCenter = (array, body, ring) => {
    let x = 0, y = 0, z = 0;
    for (let side = 0; side < 12; side++) {
      const offset = (body * bodyVertices + ring * 12 + side) * 3;
      x += array[offset]; y += array[offset + 1]; z += array[offset + 2];
    }
    return [x / 12, y / 12, z / 12];
  };
  const ringRadius = (array, body, ring, center) => {
    let result = 0;
    for (let side = 0; side < 12; side++) {
      const offset = (body * bodyVertices + ring * 12 + side) * 3;
      result = Math.max(result, Math.hypot(array[offset] - center[0], array[offset + 1] - center[1]));
    }
    return result;
  };
  const close = (actual, expected, label, tolerance = 3e-5) =>
    assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}, got ${actual}`);
  const observedTailLengths = [[], []];
  const authoredEndpointPositions = cases.map(({ p }) => p.pos.toArray());
  for (const alpha of [0, 0.5, 1]) {
    runtime.draw(alpha);
    assert.equal(runtime.stats.vertexCount, cases.length * bodyVertices);
    for (let body = 0; body < cases.length; body++) {
      const { p, history, speed } = cases[body];
      const radius = projectileVisualWidth(p, p.age);
      const visibleAge = p.age - DT * (1 - alpha);
      const solidTime = 5 * DT, fullSpan = speed * solidTime;
      const retainedSpan = Math.min(fullSpan, sourceDrawFor(p).TailLengthMax);
      const tailStart = visibleAge - solidTime * retainedSpan / fullSpan;
      const start = new Float64Array(6), end = new Float64Array(6);
      assert.equal(history.sample(tailStart, start), true);
      assert.equal(history.sample(visibleAge, end), true);
      const startCenter = ringCenter(runtime.position.array, body, 2);
      const endCenter = ringCenter(runtime.position.array, body, 10);
      close(startCenter[2], start[2], `body ${body} cap reaches its actual trail start at alpha ${alpha}`);
      close(endCenter[2], end[2], `body ${body} head reaches its sampled endpoint at alpha ${alpha}`);
      if (alpha === 1) close(endCenter[2], p.pos.z, `body ${body} cap ends at the native projectile head`);
      close(ringCenter(runtime.position.array, body, 0)[2], start[2] - radius,
        `body ${body} rear hemisphere remains radius-sized at alpha ${alpha}`);
      close(ringCenter(runtime.position.array, body, 1)[2], start[2] - radius * Math.SQRT1_2,
        `body ${body} rear bevel remains radius-sized at alpha ${alpha}`);
      close(ringCenter(runtime.position.array, body, 11)[2], end[2] + radius * Math.SQRT1_2,
        `body ${body} head bevel remains radius-sized at alpha ${alpha}`);
      close(ringCenter(runtime.position.array, body, 12)[2], end[2] + radius,
        `body ${body} head hemisphere remains radius-sized at alpha ${alpha}`);
      for (const ring of [0, 1, 2]) {
        assert.ok(Math.abs(ringCenter(runtime.position.array, body, ring)[2] - start[2]) <= radius + 3e-5,
          `body ${body} rear cap ring ${ring} stays within its own source width at alpha ${alpha}`);
      }
      for (const ring of [10, 11, 12]) {
        assert.ok(Math.abs(ringCenter(runtime.position.array, body, ring)[2] - end[2]) <= radius + 3e-5,
          `body ${body} head cap ring ${ring} stays within its own source width at alpha ${alpha}`);
      }
      const expectedProfileWidth = p._iwVisualKind === 'bucket-front' ? 0.86 :
        0.16 + 0.84 * Math.pow(1 / 6, 1.55);
      close(ringRadius(runtime.position.array, body, 2, startCenter), radius * expectedProfileWidth,
        `body ${body} preserves its distinct source-sized cross-section at alpha ${alpha}`);
      observedTailLengths[body].push(endCenter[2] - startCenter[2]);
      assert.deepEqual(p.pos.toArray(), authoredEndpointPositions[body],
        `render alpha ${alpha} cannot move the native projectile head`);
    }
  }
  for (let body = 0; body < cases.length; body++) {
    for (const span of observedTailLengths[body]) close(span, observedTailLengths[body][0],
      `body ${body} keeps its retained length across display interpolation`);
  }
  close(observedTailLengths[0][0], 4, 'the longer cap follows the four-metre source maximum');
  close(observedTailLengths[1][0], 3, 'the shorter cap follows its actual eight-sample history');
  assert.ok(observedTailLengths[0][0] > observedTailLengths[1][0],
    'the independently sourced max tail produces a longer front sheet than the short rear history');
  assert.ok(projectileVisualWidth(cases[0].p) > projectileVisualWidth(cases[1].p) * 1.5,
    'front and rear DrawSize records keep distinctly different visual radii');
  assert.equal(runtime.stats.drawCalls, 1, 'both capped forms remain in one reusable opaque batch');
  runtime.dispose();

  function sourceDrawFor(p) { return p.fidelitySloshDraw; }
});

test('hot render methods reuse storage and contain no per-frame allocation or gameplay RNG path', () => {
  const hot = ['draw', '_drawRound', '_rollerLinks', '_rollerMembrane', '_writeMembrane', '_body', '_writeBody', '_frame']
    .map(name => ProjectileVisualRuntime.prototype[name].toString()).join('\n');
  assert.doesNotMatch(hot, /\bnew\s|\bArray\.(?:from|of)\s*\(|\.map\s*\(|\.slice\s*\(|Math\.random\s*\(/,
    'the draw hot path cannot allocate collections/typed buffers or consume gameplay randomness');
});

test('color uploads reuse stable body colors and merge pending ranges across changed and reordered slots', async () => {
  const { THREE } = await sourceFixture({ fullRuntime: true });
  const system = { scene: new THREE.Scene(), list: [], inkFlight: { time: 0 } };
  const runtime = new ProjectileVisualRuntime(system, THREE);
  const colors = {
    red: new THREE.Color('#ff0000'), blue: new THREE.Color('#0000ff'),
    green: new THREE.Color('#00ff00'), yellow: new THREE.Color('#ffff00'),
  };
  const particle = (x, color, seed) => ({ type: 'shot', wid: 'splatling', age: 0, life: 1, delay: 0,
    size: 0.12, vis: 0.12, seed, owner: { color }, pos: new THREE.Vector3(x, 1, 0),
    prev: new THREE.Vector3(x, 1, 0), start: new THREE.Vector3(x, 1, 0), vel: new THREE.Vector3(0, 0, 28) });
  const first = particle(0, colors.red, 0.1), second = particle(1, colors.blue, 0.2);
  system.list.push(first, second);
  const componentsPerBody = 13 * 12 * 3;
  const assertSlotColor = (slot, color) => {
    const start = slot * componentsPerBody, end = start + componentsPerBody, values = runtime.color.array;
    for (let i = start; i < end; i += 3) {
      assert.ok(Math.abs(values[i] - color.r) < 1e-6);
      assert.ok(Math.abs(values[i + 1] - color.g) < 1e-6);
      assert.ok(Math.abs(values[i + 2] - color.b) < 1e-6);
    }
  };
  const ranges = () => Array.from(runtime.color.updateRanges, ({ start, count }) => ({ start, count }));

  runtime.draw(1);
  assert.equal(runtime.stats.vertexCount, 2 * 13 * 12);
  assertSlotColor(0, colors.red); assertSlotColor(1, colors.blue);
  runtime.color.updateRanges.length = 0; // simulate the renderer consuming the initial upload
  let version = runtime.color.version;
  runtime.draw(1);
  assert.equal(runtime.color.version, version, 'unchanged body colors do not upload another color buffer');
  assert.deepEqual(ranges(), []);

  first.owner.color.set(colors.green);
  runtime.draw(1);
  version++;
  assert.equal(runtime.color.version, version);
  assert.deepEqual(ranges(), [{ start: 0, count: componentsPerBody }],
    'one changed projectile updates exactly its 156-vertex color slot');
  assertSlotColor(0, colors.green); assertSlotColor(1, colors.blue);

  // The renderer has not consumed slot zero's range yet. A second draw changes
  // only slot one, so the pending upload must retain both writes.
  second.owner.color.set(colors.yellow);
  runtime.draw(1);
  version++;
  assert.equal(runtime.color.version, version);
  assert.deepEqual(ranges(), [{ start: 0, count: 2 * componentsPerBody }],
    'a pending first-slot update is merged with the next draw’s second-slot update');
  assertSlotColor(0, colors.green); assertSlotColor(1, colors.yellow);

  runtime.color.updateRanges.length = 0; // simulate upload before the reorder
  system.list.reverse();
  runtime.draw(1);
  version++;
  assert.equal(runtime.color.version, version);
  assert.deepEqual(ranges(), [{ start: 0, count: 2 * componentsPerBody }]);
  assertSlotColor(0, colors.yellow); assertSlotColor(1, colors.green);
  runtime.color.updateRanges.length = 0;
  runtime.draw(1);
  assert.equal(runtime.color.version, version, 'stable colors stay correct after list reordering');
  assert.deepEqual(ranges(), []);
  runtime.dispose();
});

test('native fixed-step Shooter-family histories and interpolated geometry agree at 30/60/120 Hz display cadence', async () => {
  const { f, ps } = await nativeFixture(true), actor = f.make('splatling'), runtime = ps.projectileVisuals;
  actor.pos.set(0, 1, 0); actor.aimPoint.set(0, 10, 24); actor.aimDir.set(0, 0.36, 0.93).normalize();
  f.setRandom(() => 0.25);
  const results = [];
  for (const hz of [30, 60, 120]) {
    ps.clear(); f.G.time = 0; actor.weaponRunner.inkShotSequences = Object.create(null);
    ps.fireSplatling(actor, actor.weapon);
    const p = ps.list[0], clock = new FixedClock(), verticesAtCommonFrames = [];
    const frames = hz / 2, every = hz / 30;
    for (let frame = 0; frame < frames; frame++) {
      clock.advance(1 / hz, step => { f.G.time += step; ps.update(step); });
      ps.syncVisuals(Math.min(1, clock.accumulator * 60));
      if ((frame + 1) % every === 0) {
        verticesAtCommonFrames.push(Array.from(runtime.position.array.subarray(0, runtime.stats.vertexCount * 3),
          value => Math.round(value * 1e5) / 1e5));
      }
    }
    const h = p._iwVisualHistory;
    assert.ok(h?.count > 1, `${hz} Hz display drives a real Shooter-family history; kind=${p._iwVisualKind}, wid=${p.wid}, age=${p.age}`);
    results.push({ age: p.age, position: p.pos.toArray(), velocity: p.vel.toArray(), count: h.count, next: h.next,
      history: Array.from(h.data), verticesAtCommonFrames });
  }
  assert.deepEqual(results[1], results[0], '30 Hz and 60 Hz display schedules share the same native 60 Hz history and poses');
  assert.deepEqual(results[2], results[0], '120 Hz display schedules share the same native 60 Hz history and poses');
  ps.disposeVisuals();
});

test('native coarse 30 Hz projectile update records both actual 60 Hz physics points', async () => {
  async function run(steps) {
    const { f, ps } = await nativeFixture(true), actor = f.make('splatling');
    actor.pos.set(0, 1, 0); actor.aimPoint.set(0, 10, 24); actor.aimDir.set(0, 0.36, 0.93).normalize();
    f.setRandom(() => 0.25);
    ps.fireSplatling(actor, actor.weapon);
    const p = ps.list[0], birth = p.pos.toArray().map(value => value === 0 ? 0 : value);
    for (const dt of steps) { f.G.time += dt; ps.update(dt); }
    const h = p._iwVisualHistory;
    assert.ok(h, 'native projectile history attaches at actual shot birth');
    const out = new Float64Array(6), samples = [];
    for (let frame = 0; frame <= 2; frame++) {
      assert.equal(h.sample(frame * DT, out), true);
      samples.push(Array.from(out.subarray(0, 3), value => value === 0 ? 0 : value));
    }
    const result = { count: h.count, next: h.next,
      data: Array.from(h.data, value => value === 0 ? 0 : value), age: p.age,
      position: p.pos.toArray().map(value => value === 0 ? 0 : value), samples };
    assert.equal(h.count, 3, 'the birth point and both catch-up physics ticks are retained');
    for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(samples[0][axis] - birth[axis]) < 1e-12,
      `age zero keeps the true muzzle birth point on axis ${axis}`);
    for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(samples[2][axis] - p.pos.toArray()[axis]) < 1e-12,
      `the second fixed sample reaches the real current endpoint on axis ${axis}`);
    ps.disposeVisuals();
    return result;
  }
  const coarse = await run([1 / 30]);
  const fixed = await run([DT, DT]);
  const diff = firstDifference(coarse, fixed);
  assert.equal(diff, null, `one coarse update and its two native fixed ticks retain identical projectile history: ${JSON.stringify(diff)}`);
});

test('final build composition renders the native nine-glob Slosher volley without changing gameplay state', async () => {
  const { f, ps } = await nativeFixture(true), actor = f.make('slosher');
  actor.nid = 7; actor.owner = 'local'; actor.pos.set(0, 1, 0); actor.aimPoint.set(0, 1, 10);
  actor.aimDir.set(0, 0.1, 1).normalize();
  f.setRandom(() => 0.25);
  const runtime = ps.projectileVisuals;
  assert.ok(runtime, 'the tested production composition installs the final visual adapter');
  const historyPoolSize = runtime.historyPool.length, geometry = runtime.geometry, material = runtime.material;
  ps.fireSlosh(actor, actor.weapon);
  assert.equal(ps.list.length, 9, 'the native Strong Slosher still emits its nine source globs');
  const expected = [1, 0.97, 0.94, 0.91, 0.6, 0.5, 0.4, 0.3, 0.2];
  for (let frame = 0; frame < 16; frame++) { f.G.time += DT; ps.update(DT); }
  const before = JSON.stringify(ps.list.map(gameplayRow));
  ps.syncVisuals(0.35);
  assert.equal(runtime.stats.vertexCount, 9 * 13 * 12);
  assert.equal(runtime.stats.triangles, 9 * 12 * 12 * 2);
  assert.equal(runtime.stats.drawCalls, 1, 'all nine native globs use one reusable draw batch');
  assert.equal(runtime.geometry, geometry); assert.equal(runtime.material, material);
  assert.equal(runtime.historyPool.length, historyPoolSize - 9);
  assert.deepEqual(ps.list.map(p => p._iwVisualKind).filter(k => k === 'bucket-front').length, 4);
  assert.deepEqual(ps.list.map(p => p._iwVisualKind).filter(k => k === 'bucket-rear').length, 5);
  for (let i = 0; i < ps.list.length; i++) {
    const p = ps.list[i];
    assert.ok(p._iwVisualHistory?.count > 1, `glob ${i} retains sampled native flight history`);
    assert.ok(Math.abs(projectileDrawRadius(p) - expected[i]) < 1e-12,
      `glob ${i} keeps its exact authored DrawSize radius`);
  }
  ps.syncVisuals(1);
  assert.equal(JSON.stringify(ps.list.map(gameplayRow)), before, 'presentation sampling cannot move, resize, age, damage, or repaint projectiles');

  const oldHistories = ps.list.map(p => p._iwVisualHistory);
  ps.clear();
  assert.equal(runtime.stats.vertexCount, 0);
  assert.equal(runtime.mesh.visible, false);
  assert.equal(runtime.historyPool.length, historyPoolSize, 'clear returns all reusable histories');
  assert.ok(oldHistories.every(h => h.count <= HISTORY_CAPACITY));
  const recycled = ps._new();
  assert.equal(oldHistories.includes(recycled._iwVisualHistory), false, 'reset clears pooled projectile history ownership');
  assert.equal(recycled._iwVisualHistory, null);
  ps._recycle(recycled);
  assert.equal(runtime.geometry, geometry); assert.equal(runtime.material, material);
});

test('final adapter preserves native Shooter, horizontal/vertical Roller, and Slosher fingerprints', async () => {
  async function run(withVisuals, scenario) {
    let randomDraws = 0;
    const seededRandom = () => { randomDraws++; return ((randomDraws * 37) % 100) / 100; };
    const weapon = scenario === 'slosher' ? 'slosher' : scenario.startsWith('roller') ? 'roller' : 'shooter';
    const { f, ps } = await nativeFixture(withVisuals, seededRandom), actor = f.make(weapon);
    actor.nid = 7; actor.owner = 'local'; actor.pos.set(0, 1, 0);
    if (scenario === 'slosher') {
      actor.aimPoint.set(0, 1, 10); actor.aimDir.set(0, 0.1, 1).normalize();
    } else if (scenario.startsWith('roller')) {
      actor.aimPoint.set(0, 1, 50); actor.aimDir.set(0, 0, 1);
      actor.weaponRunner.s3FlickVertical = scenario === 'roller-vertical';
    } else {
      actor.aimPoint.set(0, 10, 24); actor.aimDir.set(0, 0.36, 0.93).normalize();
    }
    const initialRandomDraws = randomDraws;
    const net = f.G.netm = new f.NetMatch({ myId: 'local' }, {});
    if (scenario === 'slosher') ps.fireSlosh(actor, actor.weapon);
    else if (scenario.startsWith('roller')) ps.fireFlick(actor, actor.weapon);
    else ps.fireShooter(actor, actor.weapon);
    const firstShots = ps.list.map(p => ({ seed: p.seed, velocity: p.vel.toArray(), size: p.size,
      radius: p.radius, damage: p.damage, vis: p.vis }));
    const terminal = [], trace = [], paint = { calls: 0 }, originalSplat = f.G.paint.splat;
    f.G.paint.splat = (...args) => { paint.calls++; return originalSplat(...args); };
    const recycle = ps._recycle;
    ps._recycle = function (p) { terminal.push(gameplayRow(p)); return recycle.call(this, p); };
    for (let frame = 0; frame < 240 && ps.list.length; frame++) {
      f.G.time += DT; ps.update(DT);
      trace.push(ps.list.map(p => [p.age, p.pos.toArray(), p.vel.toArray(), p.life, p.damage, p.vis, p.delay]));
    }
    assert.equal(ps.list.length, 0, 'the source projectile lifetimes reach terminal recycle');
    const gameplay = { ...nativeFingerprint(f, ps, actor, net, randomDraws), initialRandomDraws,
      firstShots, terminal, trace, paintCalls: paint.calls, inkTime: ps.inkFlight.time, simulationTime: f.G.time };
    if (withVisuals) {
      ps.syncVisuals(0.25); ps.syncVisuals(0.75); ps.syncVisuals(1);
      assert.deepEqual({ ...nativeFingerprint(f, ps, actor, net, randomDraws), initialRandomDraws,
        firstShots, terminal, trace, paintCalls: paint.calls, inkTime: ps.inkFlight.time, simulationTime: f.G.time }, gameplay,
        'multiple render interpolation points leave gameplay and packet state unchanged');
      ps.disposeVisuals();
    }
    net.dispose();
    return gameplay;
  }
  for (const scenario of ['shooter', 'roller-horizontal', 'roller-vertical', 'slosher']) {
    const visual = await run(true, scenario), control = await run(false, scenario);
    const diff = firstDifference(visual, control);
    assert.equal(diff, null,
      `${scenario}: final visual adapter must preserve bootstrap RNG, complete native flight, collision/paint, ink, and network payloads: ${JSON.stringify(diff)}`);
  }
});

test('native local and remote Slosher globs resolve to the same source unit, geometry mode, and draw radii', async t => {
  const { f, ps } = await nativeFixture(true), local = f.make('slosher');
  local.nid = 7; local.owner = 'local'; local.pos.set(0, 1, 0); local.aimPoint.set(0, 1, 10);
  local.aimDir.set(0, 0.1, 1).normalize();
  f.setRandom(() => 0.25);
  const net = f.G.netm = new f.NetMatch({ myId: 'local' }, {}); t.after(() => net.dispose());
  ps.fireSlosh(local, local.weapon);
  for (let frame = 0; frame < 16; frame++) { f.G.time += DT; ps.update(DT); }
  const events = net.out.filter(event => event[1] === 'p');
  assert.equal(events.length, 9, `the existing owner packets represent all nine authored globs; ${JSON.stringify(net.out)}`);
  f.G.netm = null;
  const remote = f.make('slosher'); remote.remote = true; remote.nid = local.nid; remote.owner = 'peer';
  remote.color.copy(local.color);
  for (const event of events) ps.ghostProjectile(remote, event);
  assert.equal(ps.list.length, 18);
  const owners = ps.list.slice(0, 9), ghosts = ps.list.slice(9);
  for (let i = 0; i < 9; i++) {
    assert.equal(ghosts[i].ghost, true);
    assert.equal(ghosts[i].fidelitySloshPacketIndex, owners[i].fidelitySloshPacketIndex);
    assert.equal(ghosts[i].fidelitySloshIndex, owners[i].fidelitySloshIndex);
    assert.equal(projectileVisualKind(ghosts[i]), projectileVisualKind(owners[i]));
    assert.ok(Math.abs(projectileDrawRadius(ghosts[i]) - projectileDrawRadius(owners[i])) < 1e-12,
      `network glob ${i} keeps the owner's source draw radius`);
  }
  f.G.time += DT; ps.update(DT);
  ps.syncVisuals(1);
  assert.equal(owners.filter(p => p._iwVisualKind === 'bucket-front').length, 4);
  assert.equal(ghosts.filter(p => p._iwVisualKind === 'bucket-front').length, 4);
  assert.equal(owners.filter(p => p._iwVisualKind === 'bucket-rear').length, 5);
  assert.equal(ghosts.filter(p => p._iwVisualKind === 'bucket-rear').length, 5);
  assert.equal(ps.projectileVisuals.stats.vertexCount, 18 * 13 * 12);
  for (let i = 0; i < 9; i++) {
    assert.ok(owners[i]._iwVisualHistory.count > 1 && ghosts[i]._iwVisualHistory.count > 1,
      `local and remote glob ${i} both retain their own sampled flight path`);
  }
  ps.disposeVisuals();
});

test('deferred Slosher history begins at its refreshed aerial muzzle and launch tangent', async () => {
  const { f, ps } = await nativeFixture(true), actor = f.make('slosher');
  actor.pos.set(0, 1, 0); actor.grounded = true;
  actor.aimPoint.set(0, 4, 10); actor.aimDir.set(0, 0.3, 1).normalize();
  f.setRandom(() => 0.25);
  ps.fireSlosh(actor, actor.weapon);
  assert.equal(ps.list.length, 9);
  const p = ps.list[8], queuedVelocity = p.vel.toArray();
  assert.equal(p.fidelitySloshIndex, 4, 'the ninth glob is rear-unit index four');
  assert.ok(p.delay > 0 && p._s3SloshBirthPending, 'rear glob waits for its authored four-frame unit delay');

  // The head rises before its delayed birth. Its true launch speed therefore
  // comes from the existing aerial source field when the muzzle is refreshed.
  actor.grounded = false;
  for (let frame = 0; frame < 16 && !p._iwVisualHistory; frame++) {
    f.G.time += DT; ps.update(DT);
  }
  const h = p._iwVisualHistory;
  assert.ok(h && h.count >= 2, 'the deferred native flight records its birth and first integrated endpoint');
  assert.equal(p._s3SloshBirthPending, false);
  const out = new Float64Array(6);
  assert.equal(h.sample(0, out), true);
  const unit = p.fidelitySloshUnit, index = p.fidelitySloshIndex;
  const speed = (unit.SpawnSpeedAir + index * (unit.AfterOffsetSpawnSpeed || 0)) * 60;
  const horizontal = Math.cos(p._s3SloshPitch) * speed;
  const expected = [Math.sin(p._s3SloshYaw) * horizontal,
    Math.sin(p._s3SloshPitch) * speed + horizontal * (unit.AddSpawnSpeedYRateByXZ || 0),
    Math.cos(p._s3SloshYaw) * horizontal];
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(Math.abs(out[axis] - p.start.toArray()[axis]) < 1e-12,
      `birth sample starts at the refreshed muzzle on axis ${axis}`);
    assert.ok(Math.abs(out[axis + 3] - expected[axis]) < 1e-10,
      `birth tangent uses the actual aerial source speed on axis ${axis}`);
  }
  assert.ok(Math.hypot(out[3] - queuedVelocity[0], out[4] - queuedVelocity[1], out[5] - queuedVelocity[2]) > 1,
    'the recorded tangent differs from the stale grounded enqueue velocity');
  ps.disposeVisuals();
});

test('a naturally recycled Splatling round detaches its curved history for exactly its sourced tail window', async () => {
  const { f, ps } = await nativeFixture(true), actor = f.make('splatling');
  actor.nid = 7; actor.owner = 'local'; actor.pos.set(0, 1, 0); actor.aimPoint.set(0, 1, 30);
  actor.aimDir.set(0, 0.1, 1).normalize(); f.setRandom(() => 0.25);
  const runtime = ps.projectileVisuals;
  ps.fireSplatling(actor, actor.weapon);
  assert.equal(ps.list.length, 1);
  const p = ps.list[0];
  for (let frame = 0; frame < 8; frame++) { f.G.time += DT; ps.update(DT); }
  const history = p._iwVisualHistory;
  assert.ok(history?.count > 3, 'the native shot has a multi-frame curved history before recycling');
  p.life = p.age + DT * 0.25;
  f.G.time += DT; ps.update(DT);
  assert.equal(ps.list.includes(p), false, 'native lifetime expiry recycles the gameplay projectile');
  assert.equal(p.owner, null, 'ordinary projectile recycle still severs the owner reference');
  assert.equal(p._iwVisualHistory, null, 'the gameplay pool no longer owns the detached rod history');
  assert.equal(runtime.trails.length, 1);
  assert.equal(runtime.trails[0].history, history, 'the render-only rod retains its recorded trajectory');
  assert.equal(runtime.trails[0].endAge, history.latestAge);
  assert.equal(runtime.trails[0].frames, 3, 'the Splatling source declares exactly three tail frames');
  const born = ps.inkFlight.time;
  runtime.draw(1);
  assert.equal(runtime.stats.drawCalls, 1, 'the detached rod remains visible after the gameplay head is recycled');
  ps.inkFlight.time = born + 2 * DT; runtime.draw(1);
  assert.equal(runtime.trails.length, 1, 'the rod persists through the second sourced tail frame');
  ps.inkFlight.time = born + 3 * DT; runtime.draw(1);
  assert.equal(runtime.trails.length, 0, 'the rod is returned to its pool at the three-frame boundary');
  assert.equal(runtime.stats.drawCalls, 0);
  ps.disposeVisuals();
});

test('native horizontal Roller links stay inside each of two real 13-glob volleys', async () => {
  const { f, ps } = await nativeFixture(true), actor = f.make('roller');
  actor.pos.set(0, 1, 0); actor.aimDir.set(0, 0, 1); actor.aimPoint.set(0, 1, 50);
  actor.weaponRunner.s3FlickVertical = false;
  f.setRandom(() => 0.25);
  ps.fireFlick(actor, actor.weapon);
  const first = ps.list.slice();
  ps.fireFlick(actor, actor.weapon);
  assert.equal(ps.list.length, 26);
  assert.equal(first.length, 13);
  assert.equal(ps.list.filter(p => first.includes(p)).length, 13);
  for (let frame = 0; frame < 2; frame++) { f.G.time += DT; ps.update(DT); }
  ps.syncVisuals(1);
  const links = ps.projectileVisuals.stats.linkedRollerPairs;
  assert.ok(links > 0, 'real adjacent horizontal Roller globs form liquid links');
  assert.equal(links, 24, 'each volley contributes twelve adjacent links, with no bridge between overlapping volleys');
  assert.equal(ps.list.filter(p => p._iwVisualOrdinal === 0).length, 2, 'each volley keeps its own first-glob ordinal');
  const groups = new Set(ps.list.map(p => p._iwVisualGroup));
  assert.equal(groups.size, 2, 'the two gameplay volleys retain separate presentation group identities');
  assert.ok(ps.list.every(p => p._iwVisualKind === 'roller-horizontal'));
  assert.equal(ps.projectileVisuals.stats.drawCalls, 1, 'heads and liquid links remain in one draw batch');
  ps.disposeVisuals();
});

test('horizontal liquid membranes cover actual close history after sibling heads separate, without false volley or birth joins', async () => {
  const f = await sourceFixture({ fullRuntime: true }), { THREE } = f;
  const system = { scene: new THREE.Scene(), list: [], inkFlight: { time: 0 } };
  const runtime = new ProjectileVisualRuntime(system, THREE), color = new THREE.Color('#ffd21a');
  const radius = 0.3, bodyVertices = 13 * 12;
  function pair({ differentVolley = false, laterBirth = false, neverClose = false } = {}) {
    runtime.clear(); system.list.length = 0; system.inkFlight.time = 0;
    const volley = new Map();
    const ps = [0, 1].map(index => ({ type: 'drop', wid: 'roller', fidelityMode: 'horizontal',
      fidelityDrawRadius: { initRadius: radius, endRadius: radius, changeTime: 0, tailSolidTime: 5 * DT },
      pos: new THREE.Vector3(index * (neverClose ? 2 : 0.25), 1, 0), prev: new THREE.Vector3(), start: new THREE.Vector3(),
      vel: new THREE.Vector3(index * 13.8, 0, 12), age: 0, life: 1, delay: 0,
      seed: index / 10, vis: radius, owner: { color }, vol: index && differentVolley ? new Map() : volley,
      _iwVisualOrdinal: index }));
    for (let i = 0; i < 2; i++) {
      if (i && laterBirth) system.inkFlight.time = 2 * DT;
      system.list.push(ps[i]); runtime.ensureBirth(ps[i]);
    }
    for (let tick = 1; tick <= 5; tick++) for (let i = 0; i < 2; i++) {
      const p = ps[i], age = tick * DT, x = i * ((neverClose ? 2 : 0.25) + 0.23 * tick), y = 1 + tick * tick * 0.01;
      p._iwVisualHistory.record(age, x, y, 12 * age, i * 13.8, tick * 1.2, 12);
      p.age = age; p.pos.set(x, y, 12 * age); p.vel.set(i * 13.8, tick * 1.2, 12);
    }
    system.inkFlight.time = 5 * DT; return ps;
  }
  const ps = pair(), before = ps.map(gameplayRow);
  assert.ok(ps[0].pos.distanceTo(ps[1].pos) > radius * 3, 'present heads are beyond the existing link bound');
  const frames = runtime.membraneFrames, positions = runtime.position.array, normals = runtime.normal.array;
  runtime.draw(1);
  assert.equal(runtime.stats.historicalRollerPairs, 1, 'actual earlier close history still forms one membrane');
  assert.equal(runtime.stats.linkedRollerPairs, 1);
  assert.equal(runtime.stats.vertexCount, 3 * bodyVertices, 'two untouched head slots plus one closed 13×12 membrane');
  assert.equal(runtime.stats.drawCalls, 1);
  assert.deepEqual(ps.map(gameplayRow), before, 'history presentation cannot move, resize or repaint the heads');
  const base = 2 * bodyVertices * 3, sampleA = new Float64Array(6), sampleB = new Float64Array(6);
  // Middle strip rings reach both actual sibling trajectories. The endpoint
  // caps close at the strip midpoint instead of extending past recorded data.
  for (let ring = 0; ring < 13; ring++) {
    const o = base + ring * 12 * 3;
    for (let side = 0; side < 12; side++) {
      const v = o + side * 3;
      assert.ok(Number.isFinite(positions[v] + positions[v + 1] + positions[v + 2]));
      assert.ok(Math.abs(Math.hypot(normals[v], normals[v + 1], normals[v + 2]) - 1) < 1e-5);
      if (ring === 0 || ring === 12) for (let axis = 0; axis < 3; axis++)
        assert.ok(Math.abs(positions[v + axis] - positions[o + axis]) < 1e-7, 'terminal ring is closed');
    }
    if (ring < 2 || ring > 10) continue;
    const middle = runtime.centers[ring * 6 + 2], age = middle / 12;
    ps[0]._iwVisualHistory.sample(age, sampleA); ps[1]._iwVisualHistory.sample(age, sampleB);
    const gap = Math.hypot(sampleA[0] - sampleB[0], sampleA[1] - sampleB[1], sampleA[2] - sampleB[2]);
    assert.ok(gap >= radius * 0.6 - 1e-8 && gap <= radius * 3 + 1e-8);
    assert.ok(age >= 0 && age < ps[0].age, 'the membrane ends in actual older close history');
    const firstEdgeIsA = Math.hypot(positions[o] - sampleA[0], positions[o + 1] - sampleA[1], positions[o + 2] - sampleA[2]) < 1e-6;
    const firstEdge = firstEdgeIsA ? sampleA : sampleB, oppositeEdge = firstEdgeIsA ? sampleB : sampleA;
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(positions[o + axis] - firstEdge[axis]) < 1e-6, 'one membrane edge reaches an actual sibling trajectory');
      assert.ok(Math.abs(positions[o + 6 * 3 + axis] - oppositeEdge[axis]) < 1e-6, 'the opposite edge reaches the other actual trajectory');
    }
  }
  for (let i = 0; i < 40; i++) runtime.draw(i % 2 ? 0.5 : 1);
  assert.equal(runtime.membraneFrames, frames); assert.equal(runtime.position.array, positions);
  assert.ok(runtime.stats.vertexCount <= runtime.capacity * bodyVertices);
  pair({ differentVolley: true }); runtime.draw(1);
  assert.equal(runtime.stats.linkedRollerPairs, 0, 'unrelated volleys never share a film');
  pair({ laterBirth: true }); runtime.draw(1);
  assert.equal(runtime.stats.linkedRollerPairs, 0, 'same ledger with a different actual birth clock cannot join equal local ages');
  pair({ neverClose: true }); runtime.draw(1);
  assert.equal(runtime.stats.linkedRollerPairs, 0, 'histories that are never inside the existing distance bound stay separate');
  runtime.dispose();
});

test('native horizontal Roller shared-history membranes preserve birth geometry and fixed display-cadence parity', async () => {
  const { f, ps } = await nativeFixture(true), actor = f.make('roller'), runtime = ps.projectileVisuals;
  actor.pos.set(0, 2.2, 0); actor.aimDir.set(0, 0, 1); actor.aimPoint.set(0, 2.2, 50);
  actor.weaponRunner.s3FlickVertical = false;
  const results = [];
  for (const hz of [30, 60, 120]) {
    ps.clear(); f.G.time = 0;
    let randomState = 0x576597;
    f.setRandom(() => { randomState ^= randomState << 13; randomState ^= randomState >>> 17;
      randomState ^= randomState << 5; return (randomState >>> 0) / 4294967296; });
    ps.fireFlick(actor, actor.weapon); ps._draw(); ps.syncVisuals(1);
    assert.equal(ps.list.length, 13);
    assert.ok(runtime.stats.linkedRollerPairs > 0, 'zero-history birth keeps the bounded native transverse links');
    assert.equal(runtime.stats.historicalRollerPairs, 0, 'a birth point does not invent a swept path');
    const clock = new FixedClock(), views = [];
    for (let frame = 0; frame < hz / 10; frame++) {
      clock.advance(1 / hz, step => { f.G.time += step; ps.update(step); });
      ps.syncVisuals(Math.min(1, clock.accumulator * 60));
      if ((frame + 1) % (hz / 30) === 0) views.push({ count: runtime.stats.vertexCount,
        historicalPairs: runtime.stats.historicalRollerPairs,
        positions: Array.from(runtime.position.array.subarray(0, runtime.stats.vertexCount * 3)) });
    }
    assert.ok(views.some(view => view.historicalPairs > 0), 'native source volley produces actual shared-history film');
    results.push(views);
  }
  assert.deepEqual(results[1], results[0], '30 and 60 Hz render cadence preserve the same native surfaces');
  assert.deepEqual(results[2], results[0], '120 Hz interpolation reaches the same common native surfaces');
  ps.disposeVisuals();
});

test('stalled remote Roller heads and liquid links share the same endpoint at every render alpha', async t => {
  const { f, ps } = await nativeFixture(true), actor = f.make('roller');
  actor.nid = 7; actor.owner = 'local'; actor.pos.set(0, 1, 0);
  actor.aimDir.set(0, 0, 1); actor.aimPoint.set(0, 1, 50); actor.weaponRunner.s3FlickVertical = false;
  f.setRandom(() => 0.25);
  const net = f.G.netm = new f.NetMatch({ myId: 'local' }, {});
  t.after(() => net.dispose());
  ps.fireFlick(actor, actor.weapon);
  const packets = net.out.filter(event => event[1] === 'p');
  assert.equal(packets.length, 13, 'the owner emits the existing thirteen projectile packets');
  ps.clear(); f.G.netm = null;

  const remote = f.make('roller');
  remote.remote = true; remote.nid = actor.nid; remote.owner = 'peer'; remote.color.copy(actor.color);
  const peer = { id: 'peer', sim: 5, tr: 5 * DT, lastTs: 5 * DT };
  for (const packet of packets) {
    ps.ghostProjectile(remote, packet);
    const ghost = ps.list.at(-1);
    ghost._netPeer = peer;
    ghost._netBornTick = 0;
    ghost._netBorn = 0;
    // Native NetMatch's projectile receive path sets this lifetime limit.
    ghost._netMaxSteps = Math.ceil((ghost.life + Math.max(0, ghost.delay)) * 60) + 2;
  }
  assert.equal(ps.list.length, 13);
  for (let frame = 0; frame < 3; frame++) { f.G.time += DT; ps.update(DT); }
  const runtime = ps.projectileVisuals;
  runtime.draw(0);
  assert.ok(ps.list.every(p => p.ghost && p._netPeer === peer && p._iwVisualKind === 'roller-horizontal'),
    JSON.stringify(ps.list.map(p => ({ ghost: p.ghost, wid: p.wid, mode: p.fidelityMode,
      kind: p._iwVisualKind, delay: p.delay, age: p.age, history: p._iwVisualHistory?.count,
      peer: p._netPeer === peer, born: p._netBornTick }))));
  const count = runtime.stats.vertexCount * 3;
  assert.ok(ps.list.every(p => p._netSteps === 6 && p.age > 0 && p._iwVisualHistory.count === 7),
    'the finite owner clock catches up six actual native steps and retains birth plus six samples');
  assert.ok(runtime.stats.historicalRollerPairs > 0, 'remote siblings form positive-history liquid membranes');
  const atZero = Array.from(runtime.position.array.subarray(0, count));
  const normalsAtZero = Array.from(runtime.normal.array.subarray(0, count));
  const linksAtZero = runtime.stats.linkedRollerPairs;
  const before = ps.list.map(gameplayRow);
  for (let frame = 0; frame < 4; frame++) { f.G.time += DT; ps.update(DT); }
  runtime.draw(1);
  const atOne = Array.from(runtime.position.array.subarray(0, count));
  assert.equal(runtime.stats.linkedRollerPairs, linksAtZero);
  assert.deepEqual(atOne, atZero,
    'stalled remote heads and both endpoints of each liquid link use the same frozen network time');
  assert.deepEqual(Array.from(runtime.normal.array.subarray(0, count)), normalsAtZero,
    'stalled shared-history membrane normals stay at the same owner endpoint');
  assert.deepEqual(ps.list.map(gameplayRow), before, 'unrelated local ticks and changing render alpha do not advance remote gameplay state');
  ps.disposeVisuals();
});

test('source VTF Roller owns its GPU draw when installed, with geometry fallback when absent', async () => {
  const f = await sourceFixture({ fullRuntime: true }), { THREE } = f;
  const system = { scene: new THREE.Scene(), list: [], inkFlight: { time: 0 } };
  let packReady = true;
  const runtime = new ProjectileVisualRuntime(system, THREE, {
    nativeVolumeOwns: p => !!p._inkVolumeHorizontal && packReady,
  });
  const p = { type: 'drop', wid: 'roller', fidelityMode: 'horizontal',
    _inkVolumeHorizontal: true, vis: 0.3, size: 0.3, age: 0, life: 2,
    delay: 0, seed: 0.25, owner: { color: new THREE.Color('#fda321') },
    pos: new THREE.Vector3(0, 1, 0), prev: new THREE.Vector3(0, 1, 0),
    vel: new THREE.Vector3(0, 0, 12) };
  system.list.push(p);
  runtime.reset(p);
  runtime.beginStep(p);
  p.age = DT; p.pos.z = 0.2;
  runtime.recordStep(p, DT);
  runtime.draw(1);
  assert.equal(runtime.ensureBirth(p), false, 'ready native VTF takes ownership');
  assert.equal(runtime.handles(p), false, 'new mesh must not duplicate VTF');
  assert.equal(runtime.stats.vertexCount, 0);
  assert.equal(runtime.mesh.visible, false);

  packReady = false;
  runtime.beginStep(p); p.age += DT; p.pos.z += 0.2;
  runtime.recordStep(p, DT);
  runtime.draw(1);
  assert.equal(runtime.handles(p), true, 'missing VTF restores bounded procedural geometry');
  assert.ok(runtime.stats.vertexCount > 0 && runtime.mesh.visible);

  packReady = true;
  runtime.draw(1);
  assert.equal(runtime.handles(p), false, 'late native pack load regains single-render ownership');
  assert.equal(runtime.stats.vertexCount, 0);
  assert.equal(runtime.mesh.visible, false);
  runtime.dispose();
});
