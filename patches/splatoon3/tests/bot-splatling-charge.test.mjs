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
  export { validRainmakerShotOrigin } from './patches/splatoon3/runtime/ranked/rainmaker-shot-origin.mjs';
  export { createRankedEffects } from './patches/splatoon3/runtime/ranked/combat.mjs';
  export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
  export { createRankedStage, RankedWorld } from './patches/splatoon3/runtime/ranked/world.mjs';
  export { MAP_LAYOUTS } from './inkwave-public/src/world/maps.js';
  export { map3ArtColliders } from './inkwave-public/src/world/stages/map3-art.js';
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
  productionComposition: true,
  includeCharacter: true,
  adaptNative: adaptBuildSource,
  adaptRuntime: adaptBuildSource,
  extraExports: RANKED_EXPORTS,
  vmMathRandom: seeded(0x51a7ed),
});
f.context.structuredClone = structuredClone;
f.installRanked({ ...f.installedRuntime, G: f.G, Match: f.Match, BotBrain: f.BotBrain,
  NetSession: f.NetSession, structuredClone });

let level = new f.Level(f.MAP_LAYOUTS.tidewater, f.map3ArtColliders(f.MAP_LAYOUTS.tidewater));
let physics = new f.Physics(level);
Object.assign(f.G, { level, physics, nav: new f.NavGraph(level, physics), scene: new f.THREE.Scene(),
  camera: { position: new f.THREE.Vector3(0, 24, 0) }, time: 0 });
f.G.projectiles = new f.Projectiles(f.G.scene);
let stage = f.createRankedStage(f.G);
const DT = 1 / 60;

function start(mode, { inactiveTeams = [], mapId = 'tidewater' } = {}) {
  if (level.layout.id !== mapId) {
    level = new f.Level(f.MAP_LAYOUTS[mapId], f.map3ArtColliders(f.MAP_LAYOUTS[mapId]));
    physics = new f.Physics(level);
    Object.assign(f.G, { level, physics, nav: new f.NavGraph(level, physics) });
    stage = f.createRankedStage(f.G);
  }
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
    // Rainmaker's release origin is sampled from the native final objective pose.
    const actor = mode === 'rainmaker'
      ? new f.Actor({ team, name: 'bot', weapon: 'shooter', CharacterClass: f.Character })
      : f.make('splatling');
    actor.character.actor = actor;
    actor.team = team; actor.slot = slot; actor.isBot = true; actor.nid = `${team}:${slot}`;
    delete actor._integrate; delete actor._finishFrame; delete actor._spawnBarrier;
    if (mode !== 'rainmaker') actor.character.update = () => {}; // Other modes retain display-only stubs.
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


function frameFor(match) { return f.buildFrame(match, f.installedRuntime); }

function releases(mode, seconds) {
  const match = start('zones');
  const ranked = match.ranked, rel = [], prev = new Map();
  if (mode === 'turf') { match.ranked = null; match.mode = 'turf'; }
  for (let i = 0; i < 60 * seconds; i++) {
    f.G.time += DT;
    if (mode !== 'turf') match.rankedWorld.beforeActors(ranked, DT);
    for (const actor of match.actors) {
      const wr = actor.weaponRunner, before = prev.get(actor) || { charging: false, charge: 0 };
      actor.bot.update(DT);
      actor.update(DT);
      if (before.charging && !wr.charging) rel.push({ charge: before.charge, pitch: actor.aimPitch, mode: actor.bot.mode });
      prev.set(actor, { charging: !!wr.charging, charge: wr.charge || 0 });
    }
    f.G.projectiles.update(DT);
    if (mode !== 'turf') {
      ranked.update(DT, frameFor(match));
      for (const event of ranked.events.splice(0)) match.rankedEffects.event(event);
      match.rankedWorld.update(ranked, DT);
      match.rankedEffects.update(DT);
    }
    f.G.paint.flush(DT);
  }
  return rel;
}

test('ranked objective steering releases Splatling charges instead of holding Fire forever', () => {
  const rel = releases('zones', 40);
  console.log(JSON.stringify({ ranked: rel.length }));
  assert.ok(rel.length >= 10, 'ranked Splatling bots release their spin-up: ' + rel.length);
});

test('turf Splatling bots paint lanes with a full spin-up aimed off the floor', () => {
  const rel = releases('turf', 60).filter(r => r.mode === 'paint');
  const mean = rel.reduce((n, r) => n + r.charge, 0) / rel.length, floor = rel.filter(r => r.pitch < -0.25).length;
  console.log(JSON.stringify({ paintReleases: rel.length, mean, floor }));
  assert.ok(rel.length >= 20);
  assert.ok(mean >= 0.85, 'lane releases use a full spin-up, not 60 %: ' + mean);
  assert.ok(floor <= rel.length * 0.25, 'most lane releases are not aimed into the floor: ' + floor + '/' + rel.length);
});
