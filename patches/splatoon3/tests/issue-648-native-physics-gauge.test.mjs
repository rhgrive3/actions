import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');
const STEP = 1 / 60;
const SPECIAL_GAUGE_SEGMENTS = 23;

// Same complete build composition as scripts/build-inkwave.mjs (gameplay,
// touch, reliability, quality, network, Practice Range) applied to the actual
// native modules; the runtime install is the production S3 install. Level and
// Physics are the real engine — no groundProbe/collideBody stubs — so the
// #648 gauge forecast meets actual stage geometry, ceilings, walls and rails.
const adaptProduction = (rel, code) => adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(rel,
  adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));

let nativeApiPromise;
const boot = () => nativeApiPromise ??= bootNativeRuntime();

async function bootNativeRuntime() {
  const context = vm.createContext({ console, performance, URL, innerHeight: 720 }), modules = new Map();
  const load = requested => {
    let file = requested;
    if (file.startsWith(path.join(SRC, 'patches') + path.sep)) file = path.join(ROOT, path.relative(SRC, file));
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const rel = file.startsWith(path.join(ROOT, 'patches') + path.sep) ? path.relative(ROOT, file) : path.relative(SRC, file);
    const mod = new vm.SourceTextModule(adaptProduction(rel, fs.readFileSync(file, 'utf8')),
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, mod); return mod;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { Level } from './src/world/level.js';
    export { NetMatch } from './src/net/netmatch.js';
  `, { context, identifier: path.join(SRC, 'issue-648-native-entry.mjs') });
  await entry.link((spec, from) => load(spec === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : spec.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', spec.slice(13)) : path.resolve(path.dirname(from.identifier), spec)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json'), 'utf8'));
  const api = { ...entry.namespace.install(profile), ...entry.namespace };
  return api;
}

// Real level/physics plus measured operation counters: the gauge forecast is
// only allowed a bounded number of native probe calls per fixed step.
function makeWorld(api, single) {
  const { G, THREE, Physics, Level } = api;
  const level = new Level({
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    spawnPads: [[-80, 0, 0], [80, 0, 0]], spawnBarrier: 0, single, half: [],
  });
  Object.assign(G, {
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), settings: { quality: 'high' },
    actors: [], time: 0, level, physics: new Physics(level), mode: 'match',
    teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')],
    match: { playing: () => true, canRespawn: () => true },
    paint: { sample: () => 1, splat: () => 0 },
  });
  G.projectiles = new api.Projectiles(G.scene);
  const counters = { maxProbePerTick: 0, maxBodyPerTick: 0, curProbe: 0, curBody: 0 };
  const probe = G.physics.groundProbe.bind(G.physics);
  G.physics.groundProbe = (...args) => { counters.curProbe++; return probe(...args); };
  const body = G.physics.collideBody.bind(G.physics);
  G.physics.collideBody = (...args) => { counters.curBody++; return body(...args); };
  return counters;
}
const FLOOR = { kind: 'box', min: [-100, -0.5, -100], max: [100, 0, 100] };
const scenarios = [
  { id: 'flat', pos: [0, 0, 0], boxes: [FLOOR] },
  { id: 'flat with the motion input turned mid-rise', pos: [0, 0, 0], boxes: [FLOOR], move: [1, 0], flipAt: 15, flipTo: [0, 1] },
  { id: 'lower floor reached during the action', pos: [-1.5, 0, 0], boxes: [{ kind: 'box', min: [-100, -0.5, -100], max: [0, 0, 100] }, { kind: 'box', min: [0, -2.5, -100], max: [100, -2, 100] }], move: [1, 0] },
  { id: 'upper floor start', pos: [0, 2, 0], boxes: [FLOOR, { kind: 'box', min: [-5, 0, -5], max: [5, 2, 5] }] },
  { id: 'native slope landing', pos: [0, 0.75, 0], boxes: [FLOOR, { kind: 'ramp', low: [-2, 0, 0], high: [2, 1.5, 0], width: 5, thickness: 0.6 }], move: [1, 0] },
  { id: 'air drop to native floor', pos: [0.3, 2.5, 0], boxes: [FLOOR, { kind: 'box', min: [-0.5, 2, -2], max: [0.5, 2.5, 2] }], move: [1, 0] },
  { id: 'low ceiling early contact', pos: [0, 0, 0], boxes: [FLOOR, { kind: 'box', min: [-10, 2.2, -10], max: [10, 3.2, 10] }] },
  { id: 'wall beside the leap', pos: [0.5, 0, 0], boxes: [FLOOR, { kind: 'box', min: [2, 0, -10], max: [3, 20, 10] }], move: [1, 0] },
  { id: 'rail landing', pos: [0, 0.5, 0], boxes: [FLOOR, { kind: 'box', min: [-5, 0, -0.3], max: [5, 0.5, 0.3], rail: true }] },
  { id: 'void with the current native water hazard', pos: [0, 5, 0], boxes: [] },
];

async function runScenario(sc) {
  const api = await boot();
  const { G, THREE } = api;
  const counters = makeWorld(api, sc.boxes);
  const a = new api.Actor({ team: 0, name: '648 native regression', weapon: 'slosher', CharacterClass: api.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
  a.spawnAt(new THREE.Vector3(...sc.pos), 0); a.invuln = 0;
  if (sc.move) a.intent.move.set(sc.move[0], 0, sc.move[1]);
  // The child model must see exactly one native slam event per action.
  let slamEvents = 0;
  const trigger = a.character.trigger.bind(a.character);
  a.character.trigger = (...args) => { if (args[0] === 'special_slam') slamEvents++; return trigger(...args); };
  let splatAdmission = null;
  const nativeSplat = a.splat.bind(a);
  a.splat = (...args) => {
    splatAdmission = { gauge: a.special, phase: a.specialActive?.phase, cause: args[1] };
    return nativeSplat(...args);
  };
  const cost = a.specialCost(), segment = cost / SPECIAL_GAUGE_SEGMENTS;
  a.special = cost;
  const impacts = [];
  const phaseTrace = [];
  let tick = 0;
  a._slamImpact = () => impacts.push({ tick, gauge: a.special, phase: a.specialActive ? a.specialActive.phase : null, grounded: a.grounded, y: a.pos.y });
  a._startSpecial();
  assert.equal(a.special, cost, 'activation keeps a nonzero meter');
  assert.equal(a.specialReady(), false, 'a live action cannot be activated again');
  const drops = [];
  const tickOnce = () => {
    const row = {
      tick: tick + 1, gaugeBefore: a.special, aliveBefore: a.alive,
      phaseBefore: a.specialActive?.phase ?? null, phaseTimeBefore: a.specialActive?.t ?? null,
      groundedBefore: a.grounded, impactsBefore: impacts.length,
      slamEventsBefore: slamEvents,
    };
    counters.curProbe = 0; counters.curBody = 0;
    G.time += STEP; a.update(STEP);
    counters.maxProbePerTick = Math.max(counters.maxProbePerTick, counters.curProbe);
    counters.maxBodyPerTick = Math.max(counters.maxBodyPerTick, counters.curBody);
    tick++;
    Object.assign(row, {
      gaugeAfter: a.special, aliveAfter: a.alive,
      phaseAfter: a.specialActive?.phase ?? null, phaseTimeAfter: a.specialActive?.t ?? null,
      groundedAfter: a.grounded, impact: impacts.length > row.impactsBefore,
      slamEventsAfter: slamEvents,
    });
    phaseTrace.push(row);
    return row;
  };
  let previous = cost, prematureSegment = false, earlyGroundContactDuringRise = false;
  while (a.specialActive && tick < 400) {
    if (sc.flipAt === tick && sc.flipTo) a.intent.move.set(sc.flipTo[0], 0, sc.flipTo[1]);
    const row = tickOnce();
    row.actionActive = true;
    row.actionAlive = row.aliveBefore && row.aliveAfter;
    row.drop = previous - a.special;
    if (a.grounded && a.specialActive?.phase === 'rise') earlyGroundContactDuringRise = true;
    drops.push(row.drop);
    assert.ok(a.special <= previous + 1e-10, `the action-owned gauge never rises (tick ${tick})`);
    if (a.specialActive && a.special <= segment + 1e-9) prematureSegment = true;
    previous = a.special;
  }
  const impactTick = impacts.length ? impacts[impacts.length - 1].tick : null;
  let finishTick = null, death = null;
  while ((a.s3TidalSlamGaugeFinish || a.special > 0) && tick < 700) {
    const before = a.special;
    tickOnce();
    if (before > 0 && a.special === 0 && finishTick === null) finishTick = tick;
    if (!a.alive && !death) death = { tick, special: a.special, pending: !!a.s3TidalSlamGaugeFinish };
    if (death && !a.alive && a.respawnTimer <= 0) a.respawn();
  }
  if (a.special === 0 && finishTick === null) finishTick = tick;
  const result = {
    id: sc.id, cost, segment, splatAdmission, impacts, impactTick, finishTick, death, slamEvents, prematureSegment, earlyGroundContactDuringRise,
    finishAfterImpact: finishTick !== null && impactTick !== null ? finishTick - impactTick : null,
    pendingLeft: !!a.s3TidalSlamGaugeFinish, finalGauge: a.special,
    maxDrop: Math.max(...drops, 0), drops,
    maxPreImpactDrop: Math.max(...phaseTrace.filter(row => Number.isFinite(row.drop) && row.actionAlive && !row.impact).map(row => row.drop), 0),
    phaseTrace: {
      maxDrop: phaseTrace.filter(row => Number.isFinite(row.drop)).reduce((best, row) => !best || row.drop > best.drop ? row : best, null),
      impact: phaseTrace.find(row => row.impact) || null,
      death: phaseTrace.find(row => row.aliveBefore && !row.aliveAfter) || null,
    },
    probes: { groundPerTick: counters.maxProbePerTick, bodyPerTick: counters.maxBodyPerTick },
    specialAtEnd: a.special,
  };
  for (const c of G.actors) c.character.dispose();
  G.projectiles.clear();
  return result;
}
for (const sc of scenarios) {
  test(`#648 native physics: ${sc.id} keeps a phase-correct gauge lifecycle`, async () => {
    const r = await runScenario(sc);
    assert.equal(r.slamEvents, 1, 'the child model sees exactly one native slam event, no duplicates');
    if (sc.id.startsWith('void')) {
      // Current main checks the native water hazard during special movement.
      // Death retires the live action before its timeout; no phantom impact is legal.
      assert.equal(r.impacts.length, 0, 'water death cannot create a phantom Slam impact');
      assert.equal(r.splatAdmission?.cause, 'water', 'the shared native water boundary owns death');
      assert.equal(r.splatAdmission?.phase, 'fall', 'the gauge remains action-owned up to falling water death');
      assert.ok(r.splatAdmission.gauge > r.segment && r.splatAdmission.gauge < r.cost,
        'death reads the actual partly depleted gauge, rather than an activation zero or forced last segment');
      assert.ok(r.death, 'the existing death/respawn lifecycle completes');
      assert.equal(r.phaseTrace.death?.phaseBefore, 'fall', 'water interrupts the active fall');
      assert.equal(r.phaseTrace.death?.aliveBefore, true);
      assert.equal(r.phaseTrace.death?.aliveAfter, false);
      assert.ok(Math.abs(r.death.special - r.splatAdmission.gauge * 0.5) < 1e-9,
        'native Special Saver preserves half of the real remainder at death');
      assert.equal(r.death.pending, false, 'no stale finish survives death');
      assert.equal(r.pendingLeft, false);
      assert.equal(r.finalGauge, 0, 'native respawn/reset owns the final zero');
      return;
    }
    assert.equal(r.impacts.length, 1, 'exactly one native impact callback');
    assert.equal(r.impacts[0].phase, 'fall', 'impact happens in the native fall phase');
    assert.ok(Math.abs(r.impacts[0].gauge - r.segment) < 1e-9, 'the impact frame observes exactly one of 23 segments');
    if (sc.id === 'low ceiling early contact') {
      // Actor._updateSpecial transitions hang -> fall, resolves the body and
      // impacts in the same update when the ceiling kept the actor on the floor.
      assert.equal(r.phaseTrace.impact?.phaseBefore, 'hang', 'the low ceiling lands in the native hang-to-fall update');
      assert.equal(r.phaseTrace.impact?.slamEventsBefore, 0, 'there is no premature slam while hanging');
      assert.equal(r.phaseTrace.impact?.slamEventsAfter, 1, 'the native fall transition triggers exactly once before impact');
    } else {
      assert.equal(r.phaseTrace.impact?.phaseBefore, 'fall', 'the actual native trace reaches impact from fall');
    }
    assert.equal(r.phaseTrace.impact?.actionAlive, true, 'the action owner is alive through the impact update');
    assert.ok(Math.abs(r.phaseTrace.impact?.gaugeAfter - r.segment) < 1e-9, 'only the native impact update takes the gauge to one segment');
    if (!sc.id.startsWith('void')) assert.equal(r.impacts[0].grounded, true, 'non-void impact is an actual native landing');
    if (sc.id === 'low ceiling early contact') {
      assert.equal(r.earlyGroundContactDuringRise, true, 'native collision reproduces ground contact while the action is still rising');
      assert.equal(r.impacts[0].grounded, true, 'the gauge reaches the last segment on the real floor impact');
    }
    assert.equal(r.prematureSegment, false, 'no early contact drops the meter to one segment before the fall impact');
    assert.ok(r.maxPreImpactDrop < r.cost / 8,
      `no premature live-action collapse before native impact (max ${r.maxPreImpactDrop} of ${r.cost}; impact transition ${JSON.stringify(r.phaseTrace)})`);
    assert.ok(r.probes.groundPerTick <= 8, `bounded native groundProbe use (${r.probes.groundPerTick} per fixed step)`);
    assert.ok(r.probes.bodyPerTick <= 6, `bounded native collideBody use (${r.probes.bodyPerTick} per fixed step)`);
      assert.ok(r.finishAfterImpact !== null && r.finishAfterImpact > 1,
        `the final zero waits for the body landing completion, not a one-frame boundary (${r.finishAfterImpact} ticks)`);
      assert.ok(r.finishAfterImpact <= 60,
        `landing completion is bounded by the existing hard-landing recovery (${r.finishAfterImpact} ticks)`);
      assert.equal(r.finalGauge, 0, 'a normally completed action ends at zero');
      assert.equal(r.pendingLeft, false, 'the pending finish is consumed, not leaked');
  });
}

test('#648 NetMatch pack/apply keeps the owner gauge authoritative over the proxy', async () => {
  const api = await boot();
  const { G, THREE, NetMatch } = api;
  makeWorld(api, [FLOOR]);
  const make = pos => {
    const a = new api.Actor({ team: 0, name: '648 net authority', weapon: 'slosher', CharacterClass: api.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
    a.spawnAt(new THREE.Vector3(...pos), 0); a.invuln = 0;
    return a;
  };
  const owner = make([0, 0, 0]);
  owner.nid = 1; owner.owner = 'self';
  const proxy = make([2, 0, 0]);
  proxy.nid = 1; proxy.owner = 'self';
  const sent = [];
  const session = (myId, hostId, broadcast = () => {}) => ({
    myId, isHost: myId === hostId, hostId,
    _members: new Map([[myId, myId], [hostId, hostId], ['self', 'owner'], ['viewer', 'proxy']]),
    tr: { broadcast, sendTo: () => {} },
  });
  const sender = new NetMatch(session('self', 'host', m => sent.push(m)), { map: 'map', difficulty: 'normal' });
  sender.byNid.set(owner.nid, owner);
  sender._setupActor(owner);
  const receiver = new NetMatch(session('viewer', 'self'), { map: 'map', difficulty: 'normal' });
  receiver.byNid.set(owner.nid, proxy);
  receiver._setupActor(proxy);
  assert.equal(owner.remote, false, 'the sender session owns the live actor');
  assert.equal(proxy.remote, true, 'the receiver session marks the packed actor as a proxy');

  owner.special = owner.specialCost();
  owner._startSpecial();
  for (let i = 0; i < 24; i++) { G.time += STEP; owner.update(STEP); }
  const ownerGauge = owner.special;
  assert.ok(ownerGauge > 0 && ownerGauge < owner.specialCost(), 'the owner drained through its live action');
  sender._sendTick();                                   // the real pack path (packActor)
  assert.equal(sent.length, 1, 'the pack path emitted a tick');
  assert.ok(Number.isFinite(sent[0].ts), 'the native tick carries a finite sender timestamp');
  assert.equal(sent[0].a.length, 1, 'the real packet includes the owned actor');
  assert.equal(sent[0].a[0][0], owner.nid, 'the packet actor id matches the native owner');
  assert.equal(sent[0].a[0][13], Math.round(ownerGauge), 'the real packet carries the rounded owner gauge');
  assert.equal(receiver.byNid.get(sent[0].a[0][0]), proxy, 'the receiver resolves the native proxy by packet id');
  assert.equal(proxy.net.buf.length, 0, 'the native proxy starts without buffered samples');
  receiver._tick('self', sent[0]);                      // the real apply path (buffered snapshot)
  assert.equal(receiver.stats.in, 1, `the receiver accepted one native tick (packet ${JSON.stringify({ ts: sent[0].ts, id: sent[0].a[0][0], remote: proxy.remote, owner: proxy.owner })})`);
  assert.equal(proxy.net.buf.length, 1, 'the real tick path buffered one owner snapshot');
  assert.equal(proxy.net.buf[0].sp, Math.round(ownerGauge), 'the buffered snapshot retains the owner gauge');
  const peer = receiver._peer('self');
  receiver._advance(peer, STEP);
  assert.ok(Number.isFinite(peer.tr), 'the owner playback timeline is initialized');
  receiver._sample(proxy, STEP);
  assert.equal(proxy.net.ready, true, 'the native remote sampler produced a proxy frame');
  receiver.applyRemote(proxy, STEP);
  assert.equal(proxy.special, Math.round(ownerGauge), 'the proxy mirrors the packed owner gauge');
  assert.equal(proxy.specialActive && proxy.specialActive.net, true, 'the replicated special flag is the proxy state');
  const mirrored = proxy.special;
  for (let i = 0; i < 12; i++) { G.time += STEP; proxy.update(STEP); }
  assert.equal(proxy.special, mirrored, 'the proxy gauge is packet-authoritative, never locally forecast');
  assert.ok(Number.isFinite(proxy.special), 'no NaN leaks into a replicated gauge');
  for (let i = 0; i < 12; i++) { G.time += STEP; owner.update(STEP); }
  assert.ok(owner.special < ownerGauge - 1e-9, 'the owner keeps draining independently of the proxy');
  assert.ok(Math.abs(owner.special - mirrored) > 1e-6, 'owner and proxy gauges stay independent state');
});
