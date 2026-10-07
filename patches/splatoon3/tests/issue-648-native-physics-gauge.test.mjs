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

async function boot() {
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
  { id: 'low ceiling early contact', pos: [0, 0, 0], boxes: [FLOOR, { kind: 'box', min: [-10, 2.2, -10], max: [10, 3.2, 10] }] },
  { id: 'wall beside the leap', pos: [0.5, 0, 0], boxes: [FLOOR, { kind: 'box', min: [2, 0, -10], max: [3, 20, 10] }], move: [1, 0] },
  { id: 'rail landing', pos: [0, 0.5, 0], boxes: [FLOOR, { kind: 'box', min: [-5, 0, -0.3], max: [5, 0.5, 0.3], rail: true }] },
  { id: 'void with the native timeout', pos: [0, 5, 0], boxes: [] },
];

async function runScenario(sc) {
  const api = await boot();
  const { G, THREE } = api;
  const counters = makeWorld(api, sc.boxes);
  const a = new api.Actor({ team: 0, name: '648 native regression', weapon: 'shooter', CharacterClass: api.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
  a.spawnAt(new THREE.Vector3(...sc.pos), 0); a.invuln = 0;
  if (sc.move) a.intent.move.set(sc.move[0], 0, sc.move[1]);
  // The child model must see exactly one native slam event per action.
  let slamEvents = 0;
  const trigger = a.character.trigger.bind(a.character);
  a.character.trigger = (...args) => { if (args[0] === 'special_slam') slamEvents++; return trigger(...args); };
  const cost = a.specialCost(), segment = cost / SPECIAL_GAUGE_SEGMENTS;
  a.special = cost;
  const impacts = [];
  let tick = 0;
  a._slamImpact = () => impacts.push({ tick, gauge: a.special, phase: a.specialActive ? a.specialActive.phase : null });
  a._startSpecial();
  assert.equal(a.special, cost, 'activation keeps a nonzero meter');
  assert.equal(a.specialReady(), false, 'a live action cannot be activated again');
  const drops = [];
  const tickOnce = () => {
    counters.curProbe = 0; counters.curBody = 0;
    G.time += STEP; a.update(STEP);
    counters.maxProbePerTick = Math.max(counters.maxProbePerTick, counters.curProbe);
    counters.maxBodyPerTick = Math.max(counters.maxBodyPerTick, counters.curBody);
    tick++;
  };
  let previous = cost, prematureSegment = false;
  while (a.specialActive && tick < 400) {
    if (sc.flipAt === tick && sc.flipTo) a.intent.move.set(sc.flipTo[0], 0, sc.flipTo[1]);
    tickOnce();
    drops.push(previous - a.special);
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
    id: sc.id, cost, segment, impacts, impactTick, finishTick, death, slamEvents, prematureSegment,
    finishAfterImpact: finishTick !== null && impactTick !== null ? finishTick - impactTick : null,
    pendingLeft: !!a.s3TidalSlamGaugeFinish, finalGauge: a.special,
    maxDrop: Math.max(...drops, 0), drops,
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
    assert.equal(r.impacts.length, 1, 'exactly one native impact callback');
    assert.equal(r.impacts[0].phase, 'fall', 'impact happens in the native fall phase');
    assert.ok(Math.abs(r.impacts[0].gauge - r.segment) < 1e-9, 'the impact frame observes exactly one of 23 segments');
    assert.equal(r.prematureSegment, false, 'no early contact drops the meter to one segment before the fall impact');
    assert.ok(r.maxDrop < r.cost / 8, `no single-tick collapse (max drop ${r.maxDrop} of ${r.cost})`);
    assert.ok(r.probes.groundPerTick <= 8, `bounded native groundProbe use (${r.probes.groundPerTick} per fixed step)`);
    assert.ok(r.probes.bodyPerTick <= 6, `bounded native collideBody use (${r.probes.bodyPerTick} per fixed step)`);
    if (sc.id.startsWith('void')) {
      assert.ok(r.death, 'the void fall ends in the existing water fall-death');
      assert.ok(Math.abs(r.death.special - r.segment * 0.5) < 1e-9, 'Special Saver sees the held segment at that death');
      assert.equal(r.death.pending, false, 'the existing death path cleared the pending finish');
      assert.equal(r.pendingLeft, false, 'no stale finish survives the death');
      assert.equal(r.finalGauge, 0, 'the existing respawn/reset boundary owns the final zero');
    } else {
      assert.ok(r.finishAfterImpact !== null && r.finishAfterImpact > 1,
        `the final zero waits for the body landing completion, not a one-frame boundary (${r.finishAfterImpact} ticks)`);
      assert.ok(r.finishAfterImpact <= 60,
        `landing completion is bounded by the existing hard-landing recovery (${r.finishAfterImpact} ticks)`);
      assert.equal(r.finalGauge, 0, 'a normally completed action ends at zero');
      assert.equal(r.pendingLeft, false, 'the pending finish is consumed, not leaked');
    }
  });
}

test('#648 NetMatch pack/apply keeps the owner gauge authoritative over the proxy', async () => {
  const api = await boot();
  const { G, THREE, NetMatch } = api;
  makeWorld(api, [FLOOR]);
  const make = pos => {
    const a = new api.Actor({ team: 0, name: '648 net authority', weapon: 'shooter', CharacterClass: api.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
    a.character.actor = a; G.actors.push(a); G.scene.add(a.character.root);
    a.spawnAt(new THREE.Vector3(...pos), 0); a.invuln = 0;
    return a;
  };
  const owner = make([0, 0, 0]);
  owner.nid = 1; owner.owner = 'self';
  const proxy = make([2, 0, 0]);
  proxy.remote = true; proxy.owner = 'self'; proxy.net = { buf: [] };
  const sent = [];
  const sender = Object.create(NetMatch.prototype);
  Object.assign(sender, { out: [], isHost: false, match: null, stats: { out: 0, in: 0 }, s: { tr: { broadcast: m => sent.push(m) } } });
  const receiver = Object.create(NetMatch.prototype);
  Object.assign(receiver, { byNid: new Map([[1, proxy]]), peers: new Map(), match: null, debug: 0, stats: { out: 0, in: 0 }, s: { hostId: 'self' } });

  owner.special = owner.specialCost();
  owner._startSpecial();
  for (let i = 0; i < 24; i++) { G.time += STEP; owner.update(STEP); }
  const ownerGauge = owner.special;
  assert.ok(ownerGauge > 0 && ownerGauge < owner.specialCost(), 'the owner drained through its live action');
  sender._sendTick();                                   // the real pack path (packActor)
  assert.equal(sent.length, 1, 'the pack path emitted a tick');
  receiver._tick('self', sent[0]);                      // the real apply path (buffered snapshot)
  const peer = receiver._peer('self');
  receiver._advance(peer, STEP);
  receiver._sample(proxy, STEP);
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


