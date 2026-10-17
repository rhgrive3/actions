import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const RANKED_EXPORTS = `
  export { Match } from './inkwave-public/src/game/match.js';
  export { BotBrain } from './inkwave-public/src/game/bots.js';
  export { NetSession } from './inkwave-public/src/net/session.js';
  export { NavGraph } from './inkwave-public/src/game/nav.js';
  export { installRanked, buildFrame } from './patches/splatoon3/runtime/ranked/install.mjs';
  export { createRankedEffects } from './patches/splatoon3/runtime/ranked/combat.mjs';
  export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
  export { createRankedStage, RankedWorld } from './patches/splatoon3/runtime/ranked/world.mjs';
  export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
`;

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function paintRenderer(THREE) {
  const state = { target: null, viewport: [0, 0, 1024, 1024], scissor: [0, 0, 1024, 1024], scissorTest: false };
  return {
    capabilities: { getMaxAnisotropy: () => 1 },
    getRenderTarget: () => state.target,
    setRenderTarget(target) { state.target = target; },
    getViewport: out => out.set(...state.viewport),
    setViewport(...args) { state.viewport = args; },
    getScissor: out => out.set(...state.scissor),
    setScissor(...args) { state.scissor = args; },
    getScissorTest: () => state.scissorTest,
    setScissorTest(enabled) { state.scissorTest = enabled; },
    getClearColor: color => color.setHex(0),
    getClearAlpha: () => 1,
    setClearColor() {}, clear() {}, render() {}, THREE,
  };
}

const f = await fixture({
  fullRuntime: true,
  adaptNative: adaptBuildSource,
  adaptRuntime: adaptBuildSource,
  extraExports: RANKED_EXPORTS,
  vmMathRandom: seeded(0x51a7ed),
});
f.context.structuredClone = structuredClone;
f.installRanked({ ...f.installedRuntime, G: f.G, Match: f.Match, BotBrain: f.BotBrain,
  NetSession: f.NetSession, structuredClone });

const level = new f.Level(f.MAP_LAYOUTS.tidewater);
const physics = new f.Physics(level);
Object.assign(f.G, { level, physics, nav: new f.NavGraph(level, physics), scene: new f.THREE.Scene(),
  camera: { position: new f.THREE.Vector3(0, 24, 0) }, time: 0 });
f.G.projectiles = new f.Projectiles(f.G.scene);
const stage = f.createRankedStage(f.G);
const DT = 1 / 60;

function start(mode, { inactiveTeams = [] } = {}) {
  // Each mode owns the same fixed random stream, so outcomes do not depend on
  // which earlier mode test consumed random values in this shared VM.
  f.VM_MATH.random = seeded(0x51a7ed);
  f.G.projectiles.clear();
  f.G.time = 0;
  f.G.actors = [];
  f.G.paint = new f.PaintSystem(paintRenderer(f.THREE), level, { atlasSize: 1024, cell: 0.5 });
  const ranked = new f.RankedEngine(mode, stage);
  const match = {
    mode, state: 'playing', actors: [], ranked, rankedBarrierHits: [], time: 300,
    playing() { return this.state === 'playing'; },
    canRespawn() { return this.state === 'playing' && inactiveTeams.length === 0; },
  };
  match.rankedWorld = new f.RankedWorld({ G: f.G, THREE: f.THREE, Physics: f.Physics, Hit: f.Hit }, match, stage);
  match.rankedEffects = f.createRankedEffects({ ...f.installedRuntime, G: f.G, THREE: f.THREE,
    Hit: f.Hit, emit: f.emit }, match);
  for (const team of [0, 1]) for (const slot of [0, 1]) {
    const actor = f.make('shooter');
    actor.team = team; actor.slot = slot; actor.isBot = true; actor.nid = `${team}:${slot}`;
    delete actor._integrate; delete actor._finishFrame; delete actor._spawnBarrier;
    actor.character.update = () => {}; // display-only fixture stub; Actor movement and weapons stay native
    const pad = level.spawnPads[team];
    const angle = (slot / 4) * Math.PI * 2 + 0.6;
    actor.spawnAt(new f.THREE.Vector3(pad.x + Math.cos(angle) * 1.2, pad.y, pad.z + Math.sin(angle) * 1.2), team === 0 ? 0 : Math.PI);
    actor.invuln = 0; actor.kidT = 5;
    actor.bot = new f.BotBrain(actor, 'normal');
    if (inactiveTeams.includes(team)) { actor.alive = false; actor.hp = 0; }
    match.actors.push(actor);
  }
  f.G.actors = match.actors;
  f.G.match = match;
  return match;
}

function frameFor(match) { return f.buildFrame(match, { G: f.G }); }

function step(match, frames, metrics, until = null) {
  const ranked = match.ranked;
  for (let i = 0; i < frames && ranked.winner === null; i++) {
    f.G.time += DT;
    match.rankedWorld.beforeActors(ranked, DT);
    for (const actor of match.actors) {
      actor.bot.update(DT);
      const target = actor.bot.target;
      if (match.mode === 'rainmaker' && actor.slot % 2 === 1 && actor.bot.mode === 'fight'
        && target?.alive && target.team !== actor.team && actor.bot.seeTimer > 0
        && Math.hypot(target.pos.x - actor.pos.x, target.pos.z - actor.pos.z) <= 16) metrics.escortCombatFrames++;
      actor.update(DT);
    }
    f.G.projectiles.update(DT);
    if (match.mode === 'rainmaker') {
      metrics.barrierHitCount += match.rankedBarrierHits.length;
      metrics.barrierDamage += match.rankedBarrierHits.reduce((sum, hit) => sum + hit.damage, 0);
    }
    const frame = frameFor(match);
    ranked.update(DT, frame);
    const events = ranked.events.splice(0);
    for (const event of events) {
      metrics.events.set(event.kind, (metrics.events.get(event.kind) || 0) + 1);
      if (match.mode === 'rainmaker' && ['rainmaker-pop', 'rainmaker-pickup', 'rainmaker-shot', 'rainmaker-drop', 'checkpoint'].includes(event.kind)) {
        metrics.rainmakerEvents.push({ frame: i, kind: event.kind, actorId: event.actorId ?? event.id,
          team: event.team, reason: event.reason, pos: event.pos, charge: event.charge });
      }
      if (match.mode === 'clams' && ['small', 'power'].includes(event.kind)) {
        if (event.actor && event.id && !event.velocity && event.points === undefined) metrics.clamPickups++;
        if (event.actor && Array.isArray(event.velocity)) metrics.clamThrows++;
        if (Number.isFinite(event.points)) metrics.clamScoringEvents++;
      }
      if (event.kind === 'zone-capture') match.rankedWorld.captureZone(event.zone, event.team);
      match.rankedEffects.event(event);
    }
    match.rankedWorld.update(ranked, DT);
    match.rankedEffects.update(DT);
    // Match.update advances ranked rules before Game._frame flushes the paint
    // atlas; keep that ordering while running the real CPU paint growth and
    // drying simulation. Only the renderer's GPU submission is stubbed.
    f.G.paint.flush(DT);
    metrics.maxProgress = Math.max(metrics.maxProgress, ranked.rule.state.progress ?? 0);
    if (metrics.towerMotion) {
      const motion = metrics.towerMotion, state = ranked.rule.state;
      const body = match.rankedWorld.towerBlock.center;
      motion.minimum = Math.min(motion.minimum, state.pathDistance);
      motion.maximum = Math.max(motion.maximum, state.pathDistance);
      motion.maxBodyDisplacement = Math.max(motion.maxBodyDisplacement,
        Math.hypot(body.x - motion.origin[0], body.y - motion.origin[1], body.z - motion.origin[2]));
    }
    metrics.boarded ||= match.actors.some(actor => actor.grounded && actor.ground?.block === match.rankedWorld.towerBlockId);
    metrics.maxCountDelta = Math.max(metrics.maxCountDelta, 100 - Math.min(...ranked.counts));
    if (until?.(metrics, match)) break;
  }
}

function finish(match) {
  match.rankedEffects.dispose();
  match.rankedWorld.dispose();
  f.G.paint.dispose();
  f.G.paint = null;
  f.G.match = { playing: () => false };
}

const metrics = () => ({ events: new Map(), maxProgress: 0, boarded: false, maxCountDelta: 0,
  clamPickups: 0, clamThrows: 0, clamScoringEvents: 0, escortCombatFrames: 0, rainmakerEvents: [],
  barrierHitCount: 0, barrierDamage: 0 });

test('native ranked bots paint and capture a zone, then count it down', () => {
  const match = start('zones'), seen = metrics();
  step(match, 60 * 60, seen);
  finish(match);
  assert.ok(seen.events.get('zone-capture') > 0, `native projectiles must paint enough live zone cells to capture: ${JSON.stringify([...seen.events])}`);
  assert.ok(seen.maxCountDelta > 0, `captured zones must change the ranked count: ${JSON.stringify([...seen.events])}`);
});

test('native projectiles cover and capture an expanded 13 by 11 zone', () => {
  const original = stage.zones;
  stage.zones = [{ center: original[0].center.slice(), size: [13, 11], heightTolerance: 0.75 }];
  const match = start('zones', { inactiveTeams: [0] }), seen = metrics();
  try {
    step(match, 90 * 60, seen, state => state.maxCountDelta > 0);
    assert.ok(seen.events.get('zone-capture') > 0, 'distributed paint goals must capture the expanded real paint index: ' + JSON.stringify({ coverage: match.rankedWorld.zoneCoverage(), actors: match.actors.filter(a => a.alive).map(a => ({ pos: a.pos.toArray(), ink: a.ink, mode: a.bot.mode, goal: a.bot.goal, pi: a.bot.pi, path: a.bot.path, want: match.ranked.rule.botGoal({team:a.team,slot:a.slot,pos:a.pos.toArray()}, frameFor(match)) })) }));
    assert.ok(seen.maxCountDelta > 0);
  } finally { finish(match); stage.zones = original; }
});

test('native ranked bots jump onto the moving Tower deck and carry its live objective', t => {
  const match = start('tower'), seen = metrics();
  let hits = 0;
  const stop = f.on('hit', event => {
    if (event.damage > 0 && match.actors.includes(event.attacker) && match.actors.includes(event.victim)
      && event.attacker.team !== event.victim.team) hits++;
  });
  const initial = match.ranked.rule.state.pathDistance;
  seen.towerMotion = { minimum: initial, maximum: initial,
    origin: match.rankedWorld.towerBlock.center.toArray(), maxBodyDisplacement: 0 };
  try { step(match, 60 * 60, seen); }
  finally { stop(); }
  // Either team can attack, and an unattended tower can return to centre.
  // A positive-only progress maximum or the final position loses legitimate
  // negative-direction excursions. Observe the entire native route and the
  // actual collision body independently; events/counts alone cannot pass it.
  const maxPathDisplacement = Math.max(Math.abs(seen.towerMotion.minimum - initial),
    Math.abs(seen.towerMotion.maximum - initial));
  const evidence = { initial, final: match.ranked.rule.state.pathDistance,
    maxProgress: seen.maxProgress, centerProgress: initial / match.ranked.rule.metrics.total,
    ...seen.towerMotion, maxPathDisplacement, hits, maxCountDelta: seen.maxCountDelta, events: [...seen.events] };
  t.diagnostic('Tower motion receipt: ' + JSON.stringify(evidence));
  finish(match);
  assert.ok(seen.boarded, `at least one native Actor must land on the live tower collider: ${JSON.stringify([...seen.events])}`);
  assert.ok(maxPathDisplacement > 0.5, `native riders must move the Tower along its route: ${JSON.stringify(evidence)}`);
  assert.ok(seen.towerMotion.maxBodyDisplacement > 0.5,
    `the actual Tower collision body must travel with its live objective: ${JSON.stringify(evidence)}`);
  assert.ok(seen.maxCountDelta > 0, `native riders must change an actual ranked count: ${JSON.stringify([...seen.events])}`);
  assert.ok(hits > 0, 'native Tower projectiles must inflict accepted opponent damage while bots play the objective');
});

test('native Rainmaker combat pops the shield, picks up, and lets nearby escorts fight', () => {
  const match = start('rainmaker'), seen = metrics();
  step(match, 60 * 60, seen, state => state.events.get('rainmaker-pop') > 0
    && state.events.get('rainmaker-pickup') > 0 && state.escortCombatFrames > 0);
  finish(match);
  for (const kind of ['rainmaker-pop', 'rainmaker-pickup']) {
    assert.ok(seen.events.get(kind) > 0, `expected native Rainmaker transition ${kind}; observed ${JSON.stringify(seen.rainmakerEvents)}`);
  }
  assert.ok(seen.escortCombatFrames > 0, 'odd-slot Rainmaker escorts must hand close visible duels to native combat');
});

test('native Rainmaker bots charge, shoot, and reach a checkpoint on a clear lane', () => {
  const match = start('rainmaker', { inactiveTeams: [0] }), seen = metrics();
  step(match, 60 * 60, seen, state => state.events.get('rainmaker-shot') > 0 && state.events.get('checkpoint') > 0);
  const shot = seen.rainmakerEvents.find(event => event.kind === 'rainmaker-shot');
  const checkpointPassed = match.ranked.rule.state.checkpoint.passed[1];
  finish(match);
  assert.ok(seen.barrierHitCount > 0 && seen.barrierDamage >= 1000,
    `native profile projectiles must damage and pop the shield: ${JSON.stringify({ hits: seen.barrierHitCount, damage: seen.barrierDamage, events: seen.rainmakerEvents })}`);
  for (const kind of ['rainmaker-pop', 'rainmaker-pickup', 'rainmaker-shot', 'checkpoint']) {
    assert.ok(seen.events.get(kind) > 0, `expected clear-lane Rainmaker transition ${kind}; observed ${JSON.stringify(seen.rainmakerEvents)}`);
  }
  assert.ok(shot?.charge >= 0.99, `the carrier must release a full native shot: ${JSON.stringify(seen.rainmakerEvents)}`);
  assert.equal(checkpointPassed, true, `the carrier must physically reach the checkpoint: ${JSON.stringify(seen.rainmakerEvents)}`);
});

test('native Clam Blitz bots collect clams, form and throw a Power Clam, then score', () => {
  const match = start('clams'), seen = metrics();
  step(match, 60 * 60, seen);
  const scoredPoints = match.ranked.rule.state.scoredPoints.reduce((sum, value) => sum + value, 0);
  const scoreCountsDropped = match.ranked.counts.some(value => value < 100);
  finish(match);
  assert.ok(seen.clamPickups > 0, `native actors must collect clams from the live rule field: ${JSON.stringify([...seen.events])}`);
  assert.ok(seen.events.get('clam-power-create') > 0, `native pickup flow must form a Power Clam: ${JSON.stringify([...seen.events])}`);
  assert.ok(seen.clamThrows > 0, `native bot throw inputs must launch a clam projectile: ${JSON.stringify([...seen.events])}`);
  assert.ok(seen.clamScoringEvents > 0 && scoredPoints > 0 && scoreCountsDropped,
    `a thrown clam must score and change the ranked count: ${JSON.stringify([...seen.events])}`);
});
