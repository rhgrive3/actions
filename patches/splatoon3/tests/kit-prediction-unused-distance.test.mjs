import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixture } from './source-fixture.mjs';

const TARGET = 'patches/splatoon3/runtime/kit-subs.mjs';
const BEFORE = 'const distance=previous.distanceTo(b.pos),worldDistance=world.hit?previous.distanceTo(world.point):Infinity;';
const AFTER = 'const distance=defense?previous.distanceTo(b.pos):0,worldDistance=world.hit?previous.distanceTo(world.point):Infinity;';
const BASE_SHA = 'aef676b054e158f35c3b96743aa3543fb703290ed808480788500714aa39686e';
const CANDIDATE_SHA = 'e4ac84b96cab2c63034bcbb8787963ae57bbcb498ec7d3b703c4e9c6cab8542b';
const sha = source => createHash('sha256').update(source).digest('hex');
function previousRuntime(rel, source) {
  if (rel !== TARGET) return source;
  assert.equal(sha(source), CANDIDATE_SHA, 'whole candidate source epoch');
  assert.equal(source.split(AFTER).length, 2, 'only the reviewed length expression is reversed');
  const result = source.replace(AFTER, BEFORE);
  assert.equal(sha(result), BASE_SHA, 'whole original source recovered, not an alternative implementation');
  return result;
}
function randomCounter() {
  let count = 0, state = 0x1234abcd;
  return { next() { count++; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; },
    reset() { count = 0; state = 0x1234abcd; }, get count() { return count; } };
}
async function pair() {
  const aRandom = randomCounter(), bRandom = randomCounter();
  const options = { fullRuntime: true, productionComposition: true, realProjectiles: true, includeCharacter: true };
  const original = await fixture({ ...options, adaptRuntime: previousRuntime, vmMathRandom: () => aRandom.next() });
  const candidate = await fixture({ ...options, vmMathRandom: () => bRandom.next() });
  assert.notEqual(original.Actor, candidate.Actor, 'real modules are evaluated in independent VM graphs');
  assert.notEqual(original.THREE.Vector3.prototype, candidate.THREE.Vector3.prototype);
  return [{ f: original, random: aRandom }, { f: candidate, random: bRandom }];
}
let pairPromise;
const contexts = () => pairPromise ||= pair();
const vec = value => value ? Array.from(value.toArray()) : null;
function resultFields(p) {
  if (!p) return p;
  return { kind: p.kind, origin: vec(p.origin), velocity: vec(p.velocity), endpoint: vec(p.endpoint), normal: vec(p.normal),
    firstImpact: p.firstImpact && { kind: p.firstImpact.kind, time: p.firstImpact.time, point: vec(p.firstImpact.point), normal: vec(p.firstImpact.normal) },
    outcome: p.outcome, complete: p.complete, radius: p.radius, time: p.time, targetDependent: p.targetDependent,
    simulationStep: p.simulationStep, points: Array.from(p.points, vec),
    explosions: Array.from(p.explosions, x => ({ point: vec(x.point), time: x.time, index: x.index, radius: x.radius })) };
}
function primitiveFields(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v)));
}
function ownedState(f, a) {
  const ps = f.G.projectiles;
  return { actor: primitiveFields(a), pos: vec(a.pos), vel: vec(a.vel), aim: vec(a.aimDir), intent: primitiveFields(a.intent),
    runner: primitiveFields(a.weaponRunner), stats: structuredClone(a.stats), time: f.G.time,
    arrays: ['list', 'pool', 'bombs', 'clouds', '_s3SubObjects', '_s3AllSpecialObjects'].map(key => [key, ps[key]?.length]),
    arcVersion: ps.arcGeo.attributes.position.version, sceneChildren: f.G.scene.children.length,
    character: a.character?.P ? { P: Array.from(a.character.P), clocks: Array.from(a.character.tr),
      bones: a.character.boneList.map(b => ({ position: vec(b.position), quaternion: vec(b.quaternion), world: Array.from(b.matrixWorld.elements) })) } : null };
}
function setup(context, spec) {
  const { f, random } = context, { G, THREE } = f;
  G.scene = new THREE.Scene(); G.time = 17; G.actors = []; G.local = null; G.netm = null;
  G.match = { state: 'playing', playing: () => true, canRespawn: () => false };
  const blocks = spec.terrain === 'void' ? [] : [{ kind: 'box', min: [-40, -1, -40], max: [40, 0, 40] }];
  if (spec.terrain === 'wall') blocks.push({ kind: 'box', min: [-40, 0, 3], max: [40, 30, 4] });
  G.level = new f.Level({ bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, spawnPads: [[-35, 0, 0], [35, 0, 0]], spawnBarrier: 0, half: [], single: blocks });
  G.physics = new f.Physics(G.level); G.camera = new THREE.PerspectiveCamera();
  G.paint = { sample: () => 1, splat: () => { throw Error('prediction must not paint'); } };
  G.projectiles = new f.Projectiles(G.scene);
  let a;
  if (spec.nativeRig) {
    class NativeCharacter extends f.Character { constructor(opts) { super({ ...opts, sourceMotion: false }); } }
    a = new f.Actor({ team: 0, name: 'native prediction length regression', weapon: 'shooter', CharacterClass: NativeCharacter,
      style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.isLocal = true; a.character.actor = a; a.character.onEvent = null;
    // No renderer is used. Native rig updates below need no camera projection.
    G.camera = null; G.actors.push(a); G.scene.add(a.character.root);
  } else a = f.make();
  a.weapon = { ...a.weapon, sub: spec.id }; a.weaponRunner.reset(); a.ink = 100; a.alive = true; a.remote = false;
  a.pos.set(-0, 0, 0); a.vel.set(...(spec.velocity || [1.1, 0, 2.2]));
  a.aimYaw = .25; a.aimPitch = spec.pitch ?? .1; a.yaw = a.aimYaw; a.pitch = a.aimPitch;
  a.aimDir.set(Math.sin(a.aimYaw) * Math.cos(a.aimPitch), Math.sin(a.aimPitch), Math.cos(a.aimYaw) * Math.cos(a.aimPitch));
  a.grounded = true; a.ground.hit = true; a.ground.normal.set(0, 1, 0); a.weaponRunner.s3SubHold = spec.hold ?? .25;
  if (spec.nativeRig) for (let i = 0; i < 90; i++) a._finishFrame(1 / 60);
  if (spec.nonfinite) a.vel.set(NaN, Infinity, -0);
  const previousWater = f.PLAYER.waterY; f.PLAYER.waterY = -10000;
  const metrics = { segment: 0, raycast: 0, levelQueries: {}, defenseCalls: 0, falsyDefense: 0, worldHitReads: 0, predictorDistance: 0 };
  const physics = G.physics, segment = physics.segment, raycast = physics.raycast;
  physics.segment = function(...args) {
    metrics.segment++;
    if (spec.physicsThrow) throw spec.marker;
    const result = segment.apply(this, args);
    if (spec.hitGetter) {
      let hit = result.hit;
      Object.defineProperty(result, 'hit', { configurable: true, get() { metrics.worldHitReads++; return hit; }, set(value) { hit = value; } });
    }
    return result;
  };
  physics.raycast = function(...args) { metrics.raycast++; return raycast.apply(this, args); };
  for (const name of ['queryBlocks', 'queryBlocksBand', 'queryBlocksAABB']) if (typeof G.level[name] === 'function') {
    const method = G.level[name]; G.level[name] = function(...args) {
      metrics.levelQueries[name] = (metrics.levelQueries[name] || 0) + 1; return method.apply(this, args);
    };
  }
  const nativeDefense = G.projectiles.kitBombDefenseCandidate;
  if (spec.defense === 'absent') G.projectiles.kitBombDefenseCandidate = undefined;
  else G.projectiles.kitBombDefenseCandidate = function(b, start, end) {
    metrics.defenseCalls++;
    let result;
    if (spec.defense === 'throw') throw spec.marker;
    if (spec.defense === 'native') result = nativeDefense.call(this, b, start, end);
    else if (spec.defense === 'null') result = null;
    else if (spec.defense === 'false') result = false;
    else if (spec.defense === 'zero') result = 0;
    else if (spec.defense === 'undefined') result = undefined;
    else result = { distance: spec.defense === 'loser' ? Infinity : spec.defense === 'nan' ? NaN : .03,
      kind: spec.defense === 'cooler' ? 'tacticooler' : spec.defense === 'intercept' ? 'ink-vac' : 'bubbler',
      normal: new THREE.Vector3(0, 0, -1), point: end.clone(), onHit() { throw Error('prediction cannot consume a defense hit'); } };
    if (!result) metrics.falsyDefense++;
    return result;
  };
  const proto = THREE.Vector3.prototype, distance = proto.distanceTo;
  proto.distanceTo = function(...args) {
    // Count the exact actual predictor call site, not its independent defense
    // selector or Physics internals. The native numeric operation still runs.
    const site = new Error().stack.split('\n')[2] || '';
    if (site.includes('at predictKitSub ')) metrics.predictorDistance++;
    return distance.apply(this, args);
  };
  random.reset();
  return { a, metrics, random, before: ownedState(f, a),
    restore() { proto.distanceTo = distance; f.PLAYER.waterY = previousWater;
      if (spec.nativeRig) a.character.dispose(); G.projectiles.clear(); G.scene.clear(); } };
}
function run(context, spec) {
  const state = setup(context, spec); let prediction, error;
  try {
    try { prediction = context.f.G.projectiles.s3PredictSubTrajectory(state.a, { maxTime: spec.horizon, points: [], anticipateRelease: true }); }
    catch (caught) { error = caught; }
    assert.deepEqual(ownedState(context.f, state.a), state.before, 'prediction leaves its native actor/rig/clocks/scene unchanged');
    return { prediction: resultFields(prediction), error: error && { name: error.name, message: error.message }, exactError: error,
      metrics: structuredClone(state.metrics), rng: state.random.count };
  } finally { state.restore(); }
}
function equivalent(left, right, spec) {
  assert.deepEqual(right.prediction, left.prediction, spec.label + ': every point/contact/endpoint/time/flag is identical');
  assert.deepEqual(right.error, left.error, spec.label + ': same exception result');
  if (spec.marker) { assert.equal(left.exactError, spec.marker); assert.equal(right.exactError, spec.marker); }
  assert.equal(right.rng, left.rng, 'same random draw count');
  for (const key of ['segment', 'raycast', 'levelQueries', 'defenseCalls', 'falsyDefense', 'worldHitReads'])
    assert.deepEqual(right.metrics[key], left.metrics[key], spec.label + ': same ' + key);
  const skipped = left.error ? 0 : spec.defense === 'absent' ? left.metrics.segment : left.metrics.falsyDefense;
  assert.equal(left.metrics.predictorDistance - right.metrics.predictorDistance, skipped,
    spec.label + ': only the unused no-defense length is omitted');
  return skipped;
}

test('actual predictor keeps all native points, contacts, query/RNG counts and horizon while omitting only unused lengths', async t => {
  const [original, candidate] = await contexts(), rows = [];
  const specs = [];
  for (const id of ['bomb', 'suction', 'curling']) for (const terrain of ['void', 'floor', 'wall'])
    specs.push({ label: id + '/' + terrain, id, terrain, horizon: terrain === 'void' ? .25 : 2.5, defense: 'native' });
  for (const defense of ['absent', 'null', 'false', 'zero', 'undefined', 'bubbler', 'intercept', 'cooler', 'loser', 'nan'])
    specs.push({ label: 'defense/' + defense, id: 'bomb', terrain: 'void', horizon: .25, defense });
  specs.push({ label: 'full12-second-void', id: 'bomb', terrain: 'void', horizon: 12, defense: 'native' },
    { label: 'zero-horizon', id: 'bomb', terrain: 'void', horizon: 0, defense: 'native' },
    { label: 'signed-zero', id: 'bomb', terrain: 'floor', horizon: .25, velocity: [-0, -0, -0], defense: 'null' },
    { label: 'nonfinite-velocity', id: 'bomb', terrain: 'void', horizon: .05, nonfinite: true, defense: 'null' });
  let reduced = 0;
  for (const spec of specs) {
    const left = run(original, spec), right = run(candidate, spec), skipped = equivalent(left, right, spec);
    if (left.prediction) assert.ok(left.prediction.time <= Math.ceil(spec.horizon * 60) / 60 + 1e-8, 'same finite requested horizon');
    reduced += skipped;
    rows.push({ label: spec.label, points: left.prediction?.points.length, queries: left.metrics.segment,
      originalDistanceCalls: left.metrics.predictorDistance, candidateDistanceCalls: right.metrics.predictorDistance, skipped });
  }
  assert.ok(reduced > 0); assert.equal(rows.find(r => r.label === 'full12-second-void').skipped, 720);
  t.diagnostic(JSON.stringify(rows));
});

test('actual predictor preserves world-hit getter reads, true-defense math and original callback exceptions', async () => {
  const [original, candidate] = await contexts();
  const marker = new Error('owned defense callback sentinel');
  for (const spec of [
    { label: 'world-hit-getter', id: 'bomb', terrain: 'floor', horizon: .5, defense: 'null', hitGetter: true },
    { label: 'true-defense', id: 'bomb', terrain: 'wall', horizon: .5, defense: 'loser', hitGetter: true },
    { label: 'throw-defense', id: 'bomb', terrain: 'void', horizon: .25, defense: 'throw', marker },
    { label: 'throw-native-physics', id: 'bomb', terrain: 'void', horizon: .25, defense: 'native', physicsThrow: true, marker },
  ]) equivalent(run(original, spec), run(candidate, spec), spec);
});

test('actual native Character release samples, pose matrices and clocks are unchanged by the omitted length', async () => {
  const [original, candidate] = await contexts();
  const spec = { label: 'real-native-procedural-rig', id: 'bomb', terrain: 'floor', horizon: .25, defense: 'native', nativeRig: true };
  equivalent(run(original, spec), run(candidate, spec), spec);
});
