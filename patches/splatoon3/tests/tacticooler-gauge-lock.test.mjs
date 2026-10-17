import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { TACTICOOLER_SOURCE } from '../runtime/support-cooler.mjs';

const STEP = 1 / 60;
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`);
async function world({ tower = false, matchOwner = false } = {}) {
  const f = await fixture({ fullRuntime: true, realProjectiles: true, productionComposition: true,
    adaptRuntime: adaptBuildSource,
    extraExports: `export { Match } from './inkwave-public/src/game/match.js';
      export { BotBrain } from './inkwave-public/src/game/bots.js';
      export { NetSession } from './inkwave-public/src/net/session.js';
      export { installRanked } from './patches/splatoon3/runtime/ranked/install.mjs';
      export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
      export { acceptState } from './patches/splatoon3/runtime/ranked/network.mjs';
      export { tacticoolerGaugeRemaining, tacticoolerGaugeLocked, endTacticoolerGauge } from './patches/splatoon3/runtime/tacticooler-gauge.mjs';` });
  const { G } = f;
  G.scene = new f.THREE.Scene(); G.camera = new f.THREE.PerspectiveCamera();
  const m = matchOwner ? new f.Match({}) : { playing() { return this.state === 'playing'; }, canRespawn: () => false };
  Object.assign(m, { state: 'playing', mode: 'turf', time: 180, actors: G.actors });
  G.match = m;
  if (tower) {
    m.mode = 'tower';
    m.rankedWorld = { _inTowerVolume: () => true };
  }
  G.physics = { los: () => true,
    raycast(_a, _b, _c, h) { h.hit = false; return h; },
    segment(_a, b, h) { h.hit = b.y <= 0; if (h.hit) { h.point.copy(b).setY(0); h.normal.set(0, 1, 0); } return h; } };
  const a = f.make('support'); a.nid = 7; a.owner = 'local'; a.isLocal = true;
  a.aimDir.set(0, -1, 0); a.pos.set(0, 0, 0); a._resolve = () => {};
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      G.time += STEP;
      if (matchOwner) m.update(STEP);
      else a.update(STEP);
      G.projectiles.update(STEP);
    }
  };
  const activate = () => {
    a.special = a.specialCost(); a._startSpecial();
    assert.equal(a.specialActive?.id, 'tacticooler');
  };
  const throwDevice = () => {
    a.intent.sub = true; a._updateSpecial(STEP);
    a.intent.sub = false; a._updateSpecial(STEP);
    for (let i = 0; i < 14 && a.specialActive; i++) a._updateSpecial(STEP);
    assert.equal(a.specialActive, null);
    assert.equal(G.projectiles._s3SupportCoolerThrows.length, 1);
  };
  const land = () => {
    for (let i = 0; i < 20 && !G.projectiles._s3SupportCoolers?.length; i++) tick();
    const stand = G.projectiles._s3SupportCoolers?.[0];
    assert.ok(stand, 'real flight lands and deploys a stand'); return stand;
  };
  return { f, G, a, m, tick, activate, throwDevice, land };
}

test('Tacticooler locks at placement for exactly 600F, independently of drink Special Power at 30/60/120 Hz', async () => {
  assert.equal(TACTICOOLER_SOURCE.specialReduceFrame, 600);
  for (const [hz, ap] of [[30, 0], [60, 57], [120, 30]]) {
    const w = await world(), { f, G, a } = w;
    a.s3.loadout = f.emptyLoadout();
    if (ap === 57) a.s3.loadout = Array.from({ length: 3 }, () => ({ main: 'specialPower', subs: Array(3).fill('specialPower') }));
    else if (ap === 30) for (const item of a.s3.loadout) item.main = 'specialPower';
    a.s3RefreshGear();
    w.activate(); assert.equal(f.tacticoolerGaugeLocked(a), false, 'activation is not placement');
    w.throwDevice(); assert.equal(f.tacticoolerGaugeLocked(a), false, 'airborne throw is not placement');
    const stand = w.land(), placement = G.time;
    assert.equal(a.specialActive, null, 'the post-animation lock is exercised');
    near(f.tacticoolerGaugeRemaining(a), 10, '600F starts at landing');
    near(stand.drinkSeconds, ap === 57 ? 25 : ap === 30 ? 1397 / 60 : 17, 'drink duration remains separate');
    const clock = new f.FixedClock(); let ticks = 0;
    for (let frame = 0; frame < hz * 10; frame++) clock.advance(1 / hz, dt => {
      G.time += dt; a.update(dt); G.projectiles.update(dt); ticks++;
      a.addTurf(1);
      if (ticks < 600) { assert.equal(f.tacticoolerGaugeLocked(a), true); near(a.special, 0, `no turf refill at tick ${ticks}`); }
    });
    assert.equal(ticks, 600); near(G.time - placement, 10, 'elapsed placement interval');
    assert.equal(f.tacticoolerGaugeLocked(a), false); near(a.special, 1, 'turf charging resumes on the 600th tick');
    assert.ok(G.projectiles._s3SupportCoolers.includes(stand), 'ordinary stand still has five seconds to live');
  }
});

test('Tacticooler gate preserves paint scoring, blocks readiness and both Tenacity owners, then resumes once', async () => {
  for (const matchOwner of [false, true]) {
    const w = await world({ matchOwner }), { f, G, a } = w;
    const enemies = [f.make(), f.make()]; for (const e of enemies) { e.team = 1; e.remote = true; }
    w.m.actors = G.actors;
    a.s3.loadout = f.emptyLoadout(); a.s3.loadout[0].main = 'tenacity'; a.s3RefreshGear();
    w.activate(); w.throwDevice(); w.land(); a.special = 0;
    const turf = a.stats.turf;
    a.addTurf(20); near(a.stats.turf, turf + 20, 'native paint score survives'); near(a.special, 0, 'paint cannot refill');
    a.special = a.specialCost(); assert.equal(a.specialReady(), false, 'full injected gauge cannot reactivate while locked');
    a._startSpecial(); assert.equal(a.specialActive, null, 'real activation admission respects lock'); a.special = 0;
    w.tick(599); near(a.special, 0, 'Tenacity cannot refill during the post-placement lock');
    w.tick(); near(a.special, (matchOwner ? 3.26 : 3.24) * STEP, 'one passive award when the lock ends');
    a.addTurf(20); near(a.special, 20 + (matchOwner ? 3.26 : 3.24) * STEP, 'normal paint refill resumes');
  }
});

test('Tower stand disappearance releases its gauge at 450F, including before projectile retirement runs', async () => {
  const w = await world({ tower: true }), { f, G, a } = w;
  w.activate(); w.throwDevice(); const stand = w.land();
  w.tick(449); assert.equal(f.tacticoolerGaugeLocked(a), true);
  G.time += STEP; a.update(STEP);
  assert.equal(f.tacticoolerGaugeLocked(a), false, 'expiry already unlocks before Projectiles.update');
  a.addTurf(5); near(a.special, 5, '450F expiry allows charge');
  G.projectiles.update(STEP);
  assert.equal(G.projectiles._s3SupportCoolers.includes(stand), false);
  assert.equal(a.s3TacticoolerGauge, null);
});

test('a thrown cooler landing after death creates its lock; respawn reset keeps the surviving stand clock', async () => {
  const w = await world(), { f, a, G } = w;
  w.activate(); w.throwDevice(); a.splat(null, 'water');
  assert.equal(a.alive, false);
  const stand = w.land(); near(f.tacticoolerGaugeRemaining(a), 10, 'dead owner still owns the landed stand');
  w.tick(60); a.reset();
  assert.equal(a.alive, true); assert.ok(G.projectiles._s3SupportCoolers.includes(stand));
  near(f.tacticoolerGaugeRemaining(a), 9, 'reset does not restart or clear the stand clock');
  a.addTurf(10); near(a.special, 0, 'respawn cannot bypass lock');
  w.tick(540); a.addTurf(10); near(a.special, 10, 'remaining lock elapses across death/respawn');
});

test('replacement and match clear retire only the matching cooler lock without changing Storm state', async () => {
  const w = await world(), { f, G, a } = w;
  w.activate(); w.throwDevice(); const old = w.land();
  a.stormGaugeLock = 3; a.stormGaugeDuration = 8; a.s3.stormPowerSnapshot = { duration: 8 };
  const storm = a.s3.stormPowerSnapshot;
  // An accepted newer stand replaces the old stand. Create a real second
  // throw from its device phase, without granting a second legal activation.
  a.specialActive = { id: 'tacticooler', phase: 'throw', t: 13 / 60, subHeld: false };
  a._updateSpecial(STEP);
  const device = G.projectiles._s3SupportCoolerThrows[0]; device.pos.y = 0; device.vel.set(0,-1,0);
  G.time += STEP;
  G.projectiles.update(STEP);
  const replacement = G.projectiles._s3SupportCoolers[0];
  assert.notEqual(replacement, old); assert.equal(old.s3Retired, true);
  assert.equal(a.s3TacticoolerGauge.stand, replacement);
  f.endTacticoolerGauge(old);
  assert.equal(a.s3TacticoolerGauge.stand, replacement, 'stale old-stand retirement cannot unlock the replacement');
  near(f.tacticoolerGaugeRemaining(a), 10, 'replacement owns a new placement clock');
  assert.equal(a.stormGaugeLock, 3); assert.equal(a.stormGaugeDuration, 8); assert.equal(a.s3.stormPowerSnapshot, storm);
  G.projectiles.clear(); assert.equal(a.s3TacticoolerGauge, null);
  assert.equal(a.stormGaugeLock, 3, 'match clear cannot remove an independent Storm lock');
  a.stormGaugeLock = 0; a.addTurf(10); near(a.special, 10, 'clear removes the cooler gate');
});

test('authenticated remote stand replay never owns a local gauge lock; a new match cannot retain one', async () => {
  const w = await world(), { f, G, a } = w;
  const local = f.make('support'); local.special = 23;
  a.remote = true; a.owner = 'peer';
  const nm = Object.create(f.NetMatch.prototype);
  nm.byNid = new Map([[7, a]]); nm.match = G.match; G.netm = nm;
  nm._play('peer', [0, 'ks', 'c', 7, 1, 0, 0, 0, a.netLife || 0, 1020]);
  assert.equal(G.projectiles._s3SupportCoolers.length, 1);
  assert.equal(a.s3TacticoolerGauge, undefined); assert.equal(f.tacticoolerGaugeLocked(local), false);
  near(local.special, 23, 'peer replay leaves local charge alone');
  a.remote = false; G.netm = null; G.projectiles.clear(); w.activate(); w.throwDevice(); w.land();
  assert.equal(f.tacticoolerGaugeLocked(a), true);
  G.match = { ...w.m }; a.reset();
  assert.equal(f.tacticoolerGaugeLocked(a), false, 'new match identity rejects the old stand clock');
});

test('all four ranked modes gate host and follower objective gain without banking locked points', async () => {
  const w = await world(), { f, G, a, m } = w;
  w.activate(); w.throwDevice(); w.land();
  f.context.structuredClone = structuredClone;
  f.installRanked({ ...f.installedRuntime, Match:f.Match, BotBrain:f.BotBrain, NetSession:f.NetSession, structuredClone });
  const ally = f.make('support'); ally.team = 0;
  m.actors = [a, ally]; m.rankedWorld = { update() {} }; m.rankedEffects = { event() {} };
  const stage = { id:'cooler-gauge-stage', zones:[{center:[0,0,0],size:[8,8]}],
    tower:{path:[[0,0,-10],[0,0,0],[0,0,10]],centerIndex:1,checkpoints:[[],[]],speed:1.2,halfSize:1.4},
    rainmaker:{center:[0,0,0],goals:[[0,0,10],[0,0,-10]],checkpoints:[[],[]]},
    clams:{spawns:[[0,0,0]],goals:[[0,0,10],[0,0,-10]]} };
  for (const mode of ['zones','tower','rainmaker','clams']) {
    m.mode = mode; m.ranked = new f.RankedEngine(mode,stage); m.rankedGains = [0,0]; a.special = ally.special = 0;
    f.Match.prototype.playRankedEvents.call(m,[{kind:'special-gain',team:0,points:10}]);
    near(a.special,0,`${mode} host locked`); near(ally.special,10,`${mode} host teammate still gains`);
    const host = new f.RankedEngine(mode,stage); host.revision = 2;
    const nm = { match:m, cfg:{id:'cooler-match'}, s:{hostId:'host'} };
    assert.equal(f.acceptState(nm,{match:'cooler-match',host:'host',state:host.snapshot(),gains:[20,0]}),true);
    near(a.special,0,`${mode} follower locked`); near(ally.special,20,`${mode} follower teammate gains`);
    assert.equal(m.rankedGains[0],20,'locked cumulative points are consumed rather than banked');
  }
  G.time = a.s3TacticoolerGauge.until;
  for (const mode of ['zones','tower','rainmaker','clams']) {
    m.mode = mode; m.ranked = new f.RankedEngine(mode,stage); m.rankedGains = [20,0]; a.special = 0;
    const host = new f.RankedEngine(mode,stage); host.revision = 2;
    assert.equal(f.acceptState({match:m,cfg:{id:'cooler-match'},s:{hostId:'host'}},
      {match:'cooler-match',host:'host',state:host.snapshot(),gains:[23,0]}),true);
    near(a.special,3,`${mode} only new follower points after unlock`);
    f.Match.prototype.playRankedEvents.call(m,[{kind:'special-gain',team:0,points:2}]);
    near(a.special,5,`${mode} host gain resumes`);
  }
});

test('Booyah sender credit is gated, locked calls stay consumed, and new calls earn credit after unlock', async () => {
  const w = await world(), { f, G, a } = w;
  const caster = f.make(); Object.assign(caster,{remote:true,nid:11,netLife:3,s3CatalogueBooyah:{activation:7}});
  const cheer = (seed,call) => ({actor:a,id:'booyahBomb',action:'cheer',activation:7,ownerNid:11,ownerLife:3,seed,call});
  a.special = 0; f.emit('all:special',cheer(1,1)); near(a.special,6,'ordinary first cheer earns its six points');
  w.activate(); w.throwDevice(); w.land(); near(a.special,0,'activation spent the previous charge');
  const locked = cheer(2,2); f.emit('all:special',locked); near(a.special,0,'locked second cheer earns no sender charge');
  G.time = a.s3TacticoolerGauge.until;
  f.emit('all:special',locked); near(a.special,0,'replaying a locked cheer after unlock cannot reclaim it');
  f.emit('all:special',cheer(3,3)); near(a.special,2,'a new third call receives its own source credit');
});
