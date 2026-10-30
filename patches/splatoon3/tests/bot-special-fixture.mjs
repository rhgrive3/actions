import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { CANONICAL_KITS } from '../runtime/canonical-kits-data.mjs';

export const STEP = 1 / 60;
export const SPECIALS = [...new Set(Object.values(CANONICAL_KITS).map(k => k.special))];
const KIT = Object.fromEntries(Object.entries(CANONICAL_KITS).map(([id, k]) => [k.special, id]));
export const SPECIAL_SCENARIOS = Object.freeze({
  ultraStamp: 12, krakenRoyale: 8, reefslider: 12, tripleSplashdown: 5,
  trizooka: 20, zipcaster: 20, tentaMissiles: 20, inkjet: 20,
  booyahBomb: 20, killerWail: 20, inkVac: 20, crabTank: 20,
  bubbler: 20, storm: 20, tripleInkstrike: 20, tacticooler: 20,
  waveBreaker: 20, superChump: 20, splattercolorScreen: 20,
});

// Real source BotBrain, Actor, Physics, navigation and projectile admission.
// Only GPU upload and Character presentation are omitted from this CPU fixture.
export async function makeBotSpecialFixture() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    vmMathRandom: () => .5,
    extraExports: `export { BotBrain } from './inkwave-public/src/game/bots.js';
      export { NavGraph } from './inkwave-public/src/game/nav.js';
      export { installRankedBots } from './patches/splatoon3/runtime/ranked/bots.mjs';
      export { driveCanonicalBotSpecial } from './patches/splatoon3/runtime/canonical-kits.mjs';
      export { applyCatalogueChoice } from './patches/splatoon3/runtime/catalogue.mjs';
      export { bigBubblerDomes } from './patches/splatoon3/runtime/kit-big-bubbler.mjs';` });
  const { G, THREE } = f;
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera();
  G.level = new f.Level({ bounds: { minX: -25, maxX: 25, minZ: -15, maxZ: 45 },
    spawnPads: [[-20, 0, -10], [20, 0, 40]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-25, -1, -15], max: [25, 0, 45] },
      { kind: 'box', min: [-3, 0, 29], max: [3, 5, 30] }] });
  G.physics = new f.Physics(G.level);
  G.nav = new f.NavGraph(G.level, G.physics);
  class CpuPaint extends f.PaintSystem {
    _initGPU() { this.quads = 0; this.dryMesh = { visible: false }; this._dryU = { uDry: { value: 0 } }; }
    _pushQuad() {}
    _drawQuads() { this.quads = 0; }
  }
  G.paint = new CpuPaint(null, G.level, { atlasSize: 1024, maxDensity: 12, cell: .5 });
  Object.assign(G.match, { mode: 'turf', opts: {}, state: 'playing' });
  f.installRankedBots({ G, BotBrain: f.BotBrain, PLAYER: f.PLAYER });
  const events = [], rounds = [];
  f.on('all:special', e => events.push(e));
  for (const name of ['kit:bubbler:deploy', 'kit:inkvac:release', 'special:storm'])
    f.on(name, e => events.push({ ...e, event: name }));
  const push = G.projectiles._push;
  G.projectiles._push = function (p) {
    rounds.push({ owner: p.owner, special: p.s3AllSpecial, mode: p.s3AllSpecialMode, type: p.type });
    return push.call(this, p);
  };
  function make(special, team = 0, point = [0, 0, 0], weaponId = KIT[special]) {
    const a = f.make(weaponId || 'shooter');
    a.team = team; a.slot = G.actors.length - 1;
    a.form = 'kid'; a.invuln = 0; a.pos.set(...point); a.character.root.position.copy(a.pos);
    a.special = a.specialCost();
    a.isBot = true;
    return a;
  }
  function brain(a, enemy = null) {
    const b = a.bot = new f.BotBrain(a);
    b.target = enemy; b.seeTimer = enemy ? 1.2 : 0;
    b.think = 100; b.react = 0; b.acqT = 100;
    b.goalTimer = b.repath = b.bombCd = b.dodgeCd = 100;
    // Keep navigation native, with a valid short route through the floor.
    assert.ok(b._pathTo(new THREE.Vector3(0, 0, 4), .6));
    b.repath = 100;
    return b;
  }
  function aim(a, b, point, height = .85) {
    const dx = point.x - a.pos.x, dz = point.z - a.pos.z;
    b.aimYaw = a.aimYaw = Math.atan2(dx, dz);
    b.aimPitch = a.aimPitch = Math.atan2(point.y + height - (a.pos.y + 1.1), Math.hypot(dx, dz));
    a.aimDir.set(Math.sin(a.aimYaw) * Math.cos(a.aimPitch), Math.sin(a.aimPitch), Math.cos(a.aimYaw) * Math.cos(a.aimPitch));
    a.aimPoint.set(point.x, point.y + height, point.z);
  }
  function tick(a, b, frames = 1) {
    for (let i = 0; i < frames; i++) {
      b.update(STEP); f.tick(a); G.projectiles.update(STEP); G.paint.advanceSimulation(STEP);
    }
  }
  function scenario(special, { weaponId = KIT[special] } = {}) {
    G.projectiles.clear(); G.actors.length = 0; events.length = rounds.length = 0;
    G.paint = new CpuPaint(null, G.level, { atlasSize: 1024, maxDensity: 12, cell: .5 });
    const a = make(special, 0, [0, 0, 0], weaponId);
    const enemy = make('trizooka', 1, [0, 0, SPECIAL_SCENARIOS[special]]);
    enemy.hp = 100000; enemy.special = 0;
    if (special === 'tacticooler') {
      const ally = make('trizooka', 0, [3, 0, 0]); ally.special = 0;
    }
    const b = brain(a, enemy); aim(a, b, enemy.pos);
    return { a, b, enemy };
  }
  return { ...f, make, brain, aim, tick, scenario, events, rounds };
}

