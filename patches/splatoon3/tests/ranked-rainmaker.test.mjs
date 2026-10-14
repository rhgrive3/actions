import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RainmakerRule,
  RAINMAKER_BARRIER_MAX,
  RAINMAKER_CARRY_SECONDS,
  RAINMAKER_OVERTIME_GRACE_SECONDS,
} from '../runtime/ranked/rainmaker.mjs';

const stage = {
  id: 'rainmaker-fixture',
  rainmaker: {
    center: [0, 0, 0],
    checkpoints: [[[0, 0, 4], [2, 0, 4]], [[0, 0, -4], [-2, 0, -4]]],
    goals: [[0, 0, 10], [0, 0, -10]],
    retreatZ: [-1, 1],
  },
};

function makeEngine({ counts = [100, 100], leader = -1, overtimeTeam = null } = {}) {
  return {
    mode: 'rainmaker', counts: counts.slice(), penalties: [0, 0], time: 300,
    elapsed: 0, overtime: false, overtimeElapsed: 0, overtimeTeam, winner: null, leader,
    events: [], specials: [],
    event(kind, data) { this.events.push({ kind, data: structuredClone(data) }); },
    special(team, points) { this.specials.push({ team, points }); },
    setCount(team, value) {
      if (value >= this.counts[team]) return;
      this.counts[team] = value;
      if (value === 0) this.finish(team, 'knockout');
      else if (this.overtime && value < this.counts[1 - team]) this.finish(team, 'overtime-lead');
    },
    finish(team, reason) { this.winner = team; this.finishReason = reason; },
  };
}

function actor(id, team, pos = [0, 0, 0], extra = {}) {
  return { id, team, pos: pos.slice(), alive: true, grounded: true, ...extra };
}

function event(engine, kind) {
  return engine.events.filter(item => item.kind === kind).at(-1)?.data;
}

function popAndPickup(team = 0, id = `p${team}`, fixtureStage = stage) {
  const engine = makeEngine();
  const rule = new RainmakerRule(engine, fixtureStage);
  const carrier = actor(id, team);
  rule.update(0, { actors: [carrier], barrierHits: [{ id: 'shot', team: 1 - team, damage: RAINMAKER_BARRIER_MAX, kind: 'Shooter' }] });
  assert.equal(rule.state.carrier, id, 'either team can pick up after the shield pops');
  return { engine, rule, carrier };
}

test('shield damage is a signed tug of war and applies pinned 11.3.0 hit-row multipliers', () => {
  const engine = makeEngine();
  const rule = new RainmakerRule(engine, stage);
  rule.update(0, { barrierHits: [{ team: 0, damage: 200, kind: 'Blaster' }] });
  assert.equal(rule.state.barrier.balance, 420, 'Blaster row is 2.1×');
  rule.update(0, { barrierHits: [{ team: 1, damage: 100, kind: 'Charger' }] });
  assert.equal(rule.state.barrier.balance, 220, 'opposing hits erase pressure before building their own');
  rule.update(0, { barrierHits: [
    { team: 0, damage: 900, kind: 'Shooter' },
    { team: 1, damage: 900, kind: 'Shooter' },
  ] });
  assert.equal(rule.state.barrier.balance, 220, 'same-frame opposing damage cancels independent of hit order');
  rule.update(0, { barrierHits: [{ team: 1, damage: 500, kind: 'RollerCore' }] });
  assert.equal(rule.state.barrier.balance, 220, 'roller rolling deals zero barrier damage');
  rule.update(0, { barrierHits: [{ team: 1, damage: 300, kind: 'Bomb' }] });
  assert.equal(rule.state.barrier.balance, -380, 'bomb hit uses the 2× barrier rate');
  rule.update(0, { barrierHits: [{ team: 1, damage: 620, kind: 'Shooter' }] });
  assert.deepEqual(rule.state.barrier, { active: false, max: 1000, health: 0, balance: -1000, team: 1 });
  assert.deepEqual(event(engine, 'rainmaker-pop'), { pos: [0, 0, 0], team: 1, radius: 7, damage: 900 });
});

test('coarse weapon-family kinds and explicit source multipliers are accepted for barrier hits', () => {
  const rule = new RainmakerRule(makeEngine(), stage);
  rule.update(0, { barrierHits: [{ team: 0, damage: 100, kind: 'roller' }] });
  assert.equal(rule.state.barrier.balance, 180);
  rule.update(0, { barrierHits: [{ team: 1, damage: 100, kind: 'custom', multiplier: 0.5 }] });
  assert.equal(rule.state.barrier.balance, 130);
});

test('a barrier pop leaves the Rainmaker available to either team and emits one pop event', () => {
  for (const carrierTeam of [0, 1]) {
    const engine = makeEngine();
    const rule = new RainmakerRule(engine, stage);
    const carrier = actor(`team${carrierTeam}`, carrierTeam);
    rule.update(0, {
      actors: [carrier],
      barrierHits: [{ id: 99, team: 1 - carrierTeam, damage: 1000, kind: 'Shooter' }],
    });
    assert.equal(rule.state.carrier, carrier.id);
    assert.equal(rule.state.carrierTeam, carrierTeam);
    assert.equal(engine.events.filter(item => item.kind === 'rainmaker-pop').length, 1);
    assert.equal(event(engine, 'rainmaker-pop').id, '99', 'pop blast carries last-hit actor identity for combat credit');
  }
});

test('charge is carried through held fire and emits a normalized dedicated Rainmaker shot on release', () => {
  const { engine, rule, carrier } = popAndPickup(0);
  rule.update(0.4 + 1 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: true, aim: [0, 0, 4] } } });
  assert.equal(rule.state.charge.value, 0.4);
  rule.update(0.6, { actors: [carrier], inputs: { [carrier.id]: { fire: true, aim: [0, 0, 4] } } });
  assert.equal(rule.state.charge.value, 1);
  rule.update(1 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: false, aim: [0, 0, 4] } } });
  assert.deepEqual(event(engine, 'rainmaker-shot'), {
    id: 0, actorId: carrier.id, team: 0, pos: [0, 0, 0], aim: [0, 0, 1], charge: 1,
    damage: 60, blastDamage: 180, outerDamage: 40,
    radius: 1.4, nearRadius: 0.92, directRange: 4.4, nearRange: 5.3, effectiveRange: 5.8,
    paintRadius: 1, speed: 18, launchY: .28 * 10 * 60 * .02, recoil: 1.44, trailRadius: .48,
  });
  assert.equal(rule.state.charge.recovery, 20 / 60);
  assert.equal(rule.state.charge.pending, null);
});

test('partial shot keeps actor identity, sequence ID, and distinct direct, blast and paint values', () => {
  const { engine, rule, carrier } = popAndPickup(1, 'rainmaker-carrier');
  rule.update(0.5 + 1 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: true, aim: [1, 0, 1] } } });
  rule.update(1 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: false, aim: [1, 0, 1] } } });
  const shot = event(engine, 'rainmaker-shot');
  assert.equal(shot.id, 0, 'projectile sequence remains separate from actor identity');
  assert.equal(shot.actorId, carrier.id);
  assert.equal(shot.damage, 33.75, 'partial direct damage scales from the 20F minimum to the full-charge threshold');
  assert.equal(shot.blastDamage, 0, 'partial shots do not have a blast');
  assert.equal(shot.outerDamage, 0);
  assert.equal(shot.radius, 0);
  assert.equal(shot.effectiveRange, 2.35);
  assert.ok(Math.abs(shot.paintRadius - .39) < 1e-12);
  assert.equal(shot.speed, 14.4, 'native DU/F projectile speed is converted to the host world scale');
  assert.ok(Math.abs(Math.hypot(...shot.aim) - 1) < 1e-12);
});

test('Rainmaker shot release below twenty frames is rejected; twenty frames fires a minimum partial shot', () => {
  const { engine, rule, carrier } = popAndPickup(0);
  rule.update(20 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: true } } });
  rule.update(1 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: false } } });
  assert.equal(engine.events.filter(item => item.kind === 'rainmaker-shot').length, 0);

  rule.update(21 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: true } } });
  rule.update(1 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: false } } });
  const shot = event(engine, 'rainmaker-shot');
  assert.equal(shot.charge, 20 / 60);
  assert.equal(shot.damage, 30);
  assert.equal(shot.effectiveRange, 2);
});

test('carrier clock counts seconds and runs four times faster beyond the configured retreat line', () => {
  const { engine, rule, carrier } = popAndPickup(0);
  carrier.pos[2] = -2;
  rule.update(3, { actors: [carrier] });
  assert.equal(rule.state.retreatRate, 4);
  assert.equal(rule.state.holderTime, 12);
  assert.equal(rule.state.holderRemaining, 48);
  rule.update(12, { actors: [carrier] });
  assert.equal(rule.state.carrier, null);
  assert.equal(rule.state.pos[2], 0, 'an expired Rainmaker returns to center');
  assert.deepEqual(event(engine, 'rainmaker-timeout'), { id: carrier.id, pos: [0, 0, -2], team: 0 });
  assert.equal(engine.events.filter(item => item.kind === 'rainmaker-timeout').length, 1);
  assert.equal(RAINMAKER_CARRY_SECONDS, 60);
});

test('ordinary carrier timeout remains sixty seconds across uneven update intervals', () => {
  const { engine, rule, carrier } = popAndPickup(1);
  for (const dt of [12.5, 17.5]) rule.update(dt, { actors: [carrier] });
  assert.equal(rule.state.holderRemaining, 30);
  rule.update(29.99, { actors: [carrier] });
  assert.equal(rule.state.carrier, carrier.id);
  rule.update(0.02, { actors: [carrier] });
  assert.equal(rule.state.carrier, null);
  assert.equal(engine.events.filter(item => item.kind === 'rainmaker-timeout').length, 1);
});

test('death reforms a shield after three seconds; only a popped non-central shield returns after fifteen seconds', () => {
  const {rule,carrier}=popAndPickup(0);carrier.pos=[0,0,5];carrier.alive=false;
  rule.update(0,{actors:[carrier]});assert.deepEqual(rule.state.pos,[0,0,5]);assert.equal(rule.state.barrier.active,false);
  rule.update(3,{actors:[]});assert.equal(rule.state.barrier.active,true);
  rule.update(20,{actors:[]});assert.deepEqual(rule.state.pos,[0,0,5],'an intact shield is not on the popped return timer');
  rule.update(0,{barrierHits:[{team:0,damage:1000,kind:'Shooter'}]});rule.update(14.9,{actors:[]});assert.deepEqual(rule.state.pos,[0,0,5]);
  rule.update(.2,{actors:[]});assert.deepEqual(rule.state.pos,[0,0,0]);assert.equal(rule.state.barrier.active,false);
  rule.update(3,{actors:[]});assert.equal(rule.state.barrier.active,true);
});
test('own-side fall resets to center; enemy-side fall retains the last grounded safe position',()=>{
  const own=popAndPickup(0);own.carrier.pos=[0,-5,-5];own.carrier.grounded=false;own.rule.update(0,{actors:[own.carrier],floorAt:()=>null});assert.deepEqual(own.rule.state.pos,[0,0,0]);
  const attack=popAndPickup(0);attack.carrier.pos=[0,0,2];attack.rule.update(0,{actors:[attack.carrier],floorAt:()=>0});
  attack.carrier.pos=[0,-5,5];attack.carrier.grounded=false;attack.rule.update(0,{actors:[attack.carrier],floorAt:()=>null});assert.deepEqual(attack.rule.state.pos,[0,0,2]);
  assert.equal(attack.rule.state.barrier.active,false);attack.rule.update(3,{actors:[]});assert.equal(attack.rule.state.barrier.active,true);
});

test('either of two checkpoints opens the goal gate, drops the Rainmaker and requires a fresh shield pop', () => {
  const { engine, rule, carrier } = popAndPickup(0);
  carrier.pos = [0, 0, 10];
  rule.update(0, { actors: [carrier] });
  assert.equal(rule.state.checkpoint.goalOpen[0], false);
  assert.equal(engine.winner, null, 'touching the goal before a checkpoint cannot score');

  carrier.pos = [2, 0, 4];
  rule.update(0, { actors: [carrier] });
  assert.equal(rule.state.checkpoint.passed[0], true);
  assert.equal(rule.state.checkpoint.choice[0], 1);
  assert.equal(rule.state.checkpoint.goalOpen[0], true);
  assert.equal(rule.state.carrier, null);
  assert.equal(rule.state.barrier.active, true, 'checkpoint arrival regenerates the shield');
  assert.equal(event(engine, 'checkpoint').checkpoint, 1);

  carrier.pos = [2, 0, 4];
  rule.update(0, { actors: [carrier], barrierHits: [{ team: 0, damage: 1000, kind: 'Shooter' }] });
  assert.equal(rule.state.carrier, carrier.id);
  carrier.pos = [0, 0, 10];
  rule.update(0, { actors: [carrier] });
  assert.equal(engine.winner, 0);
  assert.equal(rule.state.terminal, true);
});

test('overtime begins for a losing carrier and ends if that carrier loses the Rainmaker', () => {
  const countsEngine = makeEngine({ counts: [40, 60], leader: 0, overtimeTeam: 1 });
  const rule = new RainmakerRule(countsEngine, stage);
  const carrier = actor('losing', 1);
  rule.update(0, { actors: [carrier], barrierHits: [{ team: 0, damage: 1000, kind: 'Shooter' }] });
  assert.equal(rule.state.carrierTeam, 1);
  assert.equal(rule.beginOvertime(), true);
  assert.deepEqual(event(countsEngine, 'overtime'), { team: 1, mode: 'rainmaker' });
  rule.updateOvertime(0, { actors: [carrier] });
  assert.equal(countsEngine.winner, null);
  carrier.alive = false;
  rule.update(0, { actors: [carrier] });
  rule.updateOvertime(0, { actors: [carrier] });
  assert.equal(countsEngine.winner, 0);
  assert.equal(countsEngine.finishReason, 'rainmaker-overtime-carrier-lost');
});

test('overtime uses the remaining fifteen-second recapture window after a recent winning-team drop', () => {
  const engine = makeEngine({ counts: [40, 60], leader: 0, overtimeTeam: 1 });
  const rule = new RainmakerRule(engine, stage);
  const carrier = actor('winner', 0);
  rule.update(0, { actors: [carrier], barrierHits: [{ team: 1, damage: 1000, kind: 'Shooter' }] });
  carrier.alive = false;
  rule.update(0, { actors: [carrier] });
  rule.update(8, { actors: [] });
  assert.equal(rule.beginOvertime(), true);
  assert.equal(rule.state.overtime.graceRemaining, 7);

  rule.update(0, { actors: [] });
  rule.updateOvertime(6.9, { actors: [] });
  assert.equal(engine.winner, null);
  rule.update(0, { actors: [] });
  rule.updateOvertime(0.11, { actors: [] });
  assert.equal(engine.winner, 0);
  assert.equal(engine.finishReason, 'rainmaker-overtime-no-recapture');
});

test('losing checkpoint passage opens overtime with a recapture grace, and a lead change wins', () => {
  const engine = makeEngine({ counts: [40, 60], leader: 0, overtimeTeam: 1 });
  const rule = new RainmakerRule(engine, stage);
  const carrier = actor('losing', 1);
  rule.update(0, { actors: [carrier], barrierHits: [{ team: 1, damage: 1000, kind: 'Shooter' }] });
  carrier.pos = [0, 0, -4];
  rule.update(0, { actors: [carrier] });
  assert.equal(rule.state.checkpoint.lastPassTeam, 1);
  assert.equal(rule.beginOvertime(), true);
  assert.equal(rule.state.overtime.graceRemaining, RAINMAKER_OVERTIME_GRACE_SECONDS);
  engine.overtime = true;
  engine.setCount(1, 39);
  rule.updateOvertime(0, { actors: [] });
  assert.equal(engine.winner, 1, 'strictly taking the lead wins during overtime');
});

test('special charge, snapshots, restore and removeActor remain deterministic and JSON-compatible', () => {
  const { engine, rule, carrier } = popAndPickup(0);
  rule.update(2, { actors: [carrier] });
  assert.deepEqual(engine.specials.at(-1), { team: 1, points: 6 });
  const snapshot = rule.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  snapshot.pos[0] = 99;
  assert.equal(rule.state.pos[0], 0, 'snapshot is a structured clone');
  rule.removeActor(carrier.id);
  assert.equal(rule.state.carrier, null);
  assert.equal(rule.state.barrier.active, false);
  rule.restore(rule.snapshot());
  assert.equal(rule.state.respawnRemaining, 3);
  rule.update(3, {actors:[]});
  assert.equal(rule.state.barrier.active, true);
});

for (const dt of [1 / 60, .05, .2]) test(`shot windups and recovery consume elapsed time (${dt}s)`, () => {
  const { engine, rule, carrier } = popAndPickup(0);
  const step = (seconds, fire) => {
    while (seconds > 1e-10) { const elapsed = Math.min(dt, seconds); rule.update(elapsed, { actors: [carrier], inputs: { [carrier.id]: { fire } } }); seconds -= elapsed; }
  };
  step(61 / 60, true); assert.equal(rule.state.charge.value, 1);
  rule.update(0, { actors: [carrier], inputs: { [carrier.id]: { fire: false } } });
  assert.equal(engine.events.filter(e => e.kind === 'rainmaker-shot').length, 0, 'release requires the one-frame pre-shot delay');
  const resumed = new RainmakerRule(engine, stage).restore(JSON.parse(JSON.stringify(rule.snapshot())));
  resumed.update(1 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: true } } });
  rule.restore(resumed.snapshot());
  assert.equal(engine.events.filter(e => e.kind === 'rainmaker-shot').length, 1);
  step(20 / 60, true); assert.equal(rule.state.charge.seconds, 0, 'held fire cannot charge during recovery');
  step(61 / 60, true); step(1 / 60, false);
  assert.equal(engine.events.filter(e => e.kind === 'rainmaker-shot').length, 2);
  assert.equal(engine.events.filter(e => e.kind === 'rainmaker-charged').length, 2, 'one charge cue per complete charge');
});

test('swimming loses a held charge and the next squid emergence has six frames of pre-charge delay', () => {
  const { engine, rule, carrier } = popAndPickup(0);
  rule.update(61 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: true } } });
  carrier.swimming = true;
  rule.update(1 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: false } } });
  assert.equal(rule.state.charge.value, 0);
  assert.equal(engine.events.filter(e => e.kind === 'rainmaker-shot').length, 0);
  carrier.swimming = false;
  rule.update(6 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: true } } });
  assert.equal(rule.state.charge.seconds, 0);
  rule.update(20 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: true } } });
  rule.update(1 / 60, { actors: [carrier], inputs: { [carrier.id]: { fire: false } } });
  assert.equal(event(engine, 'rainmaker-shot').damage, 30);
});
