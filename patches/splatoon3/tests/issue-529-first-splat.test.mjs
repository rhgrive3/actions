import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= 1e-9, message || `${actual} != ${expected}`);
const composedFixture = () => fixture({ productionComposition: true, fullRuntime: true, adaptRuntime: adaptQualitySource });

test('first-splat +10 FP is additive through the configured reference normalization', async () => {
  const f = await fixture(), cfg = f.profile.flow;
  const control = f.createFlow(), bonus = f.createFlow();
  control.score = bonus.score = 1.5;
  assert.equal(f.awardFlow(control, 'splat', 1, cfg), false);
  assert.equal(f.awardFlow(bonus, 'splat', 1, cfg, true, cfg.progress.firstSplatBonus), false);
  near(control.score, 2.5); near(bonus.score - control.score, 10 * cfg.threshold / cfg.progress.referenceThreshold);

  const doubleThreshold = { ...cfg, threshold: cfg.threshold * 2 };
  const scaled = f.createFlow();
  f.awardFlow(scaled, 'firstSplat', 0, doubleThreshold, true, cfg.progress.firstSplatBonus);
  near(scaled.score, 10 * doubleThreshold.threshold / doubleThreshold.progress.referenceThreshold);
});

test('#529 first-splat adds to #481 ordinary and consecutive awards, and the victim event dedupes', async () => {
  const f = await composedFixture(), cfg = f.profile.flow, scale = cfg.threshold / 100;
  const match = f.G.match = { playing: () => true, mode: 'turf' };
  const attacker = f.make(), firstVictim = f.make(), nextVictim = f.make();
  attacker.team = 0; firstVictim.team = nextVictim.team = 1;
  f.G.time = 10;
  f.emit('splatted', { victim: firstVictim, attacker, cause: 'weapon' });
  near(attacker.s3.flow.score, 33 * scale, 'first 23 fp + 10 fp award');
  f.emit('splatted', { victim: firstVictim, attacker, cause: 'weapon' });
  near(attacker.s3.flow.score, 33 * scale, 'same victim life does not award either component twice');
  f.G.time = 12;
  f.emit('splatted', { victim: nextVictim, attacker, cause: 'weapon' });
  near(attacker.s3.flow.score, 78 * scale, 'later consecutive splat adds 45 fp without reusing first bonus');
  assert.equal(f.G.match, match);

  const high = f.createFlow(), highControl = f.createFlow();
  high.score = highControl.score = 75 * scale;
  assert.equal(f.awardFlow(highControl, 'splat', 1, cfg), false);
  assert.equal(f.awardFlow(high, 'splat', 1, cfg, true, cfg.progress.firstSplatBonus), true);
  near(highControl.score, 90 * scale, '75 fp plus the 15 fp high-tier ordinary award');
  assert.equal(high.active, true, '75 + 15 + 10 fp reaches the 100 fp activation threshold');
});

test('#529 Range splats do not consume the first bonus before the composed #481 award', async () => {
  const f = await composedFixture(), scale = f.profile.flow.threshold / 100;
  const match = f.G.match = { playing: () => true, mode: 'turf', range: {} };
  const attacker = f.make(), rangeVictim = f.make(), turfVictim = f.make();
  attacker.team = 0; rangeVictim.team = turfVictim.team = 1;
  f.G.time = 0;
  f.emit('splatted', { victim: rangeVictim, attacker, cause: 'weapon' });
  near(attacker.s3.flow.score, 23 * scale, 'Range keeps the ordinary #481 award but grants no #529 bonus');
  match.range = null;
  f.G.time = 6;
  f.emit('splatted', { victim: turfVictim, attacker, cause: 'weapon' });
  near(attacker.s3.flow.score, 56 * scale, 'first eligible Turf event gets 23 + 10 fp after the Range event');
});

test('offline first qualifying enemy splat is match-global, bot-safe, and survives respawn', async () => {
  const f = await fixture(), attacker = f.make(), victim1 = f.make(), victim2 = f.make();
  attacker.isBot = true; attacker.remote = true; victim1.team = victim2.team = 1;
  f.G.level.spawnPads = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
  f.G.physics.groundProbe = (_x, _y, _z, _w, _h, _r, hit) => { hit.hit = false; return hit; };
  const match = f.G.match = { playing: () => true, mode: 'turf' };
  f.emit('splatted', { victim: victim1, attacker });
  near(attacker.s3.flow.score, 1 + 10 * f.profile.flow.threshold / f.profile.flow.progress.referenceThreshold);

  attacker.respawn();
  near(attacker.s3.flow.score, 1 + 10 * f.profile.flow.threshold / f.profile.flow.progress.referenceThreshold);
  f.emit('splatted', { victim: victim2, attacker });
  near(attacker.s3.flow.score, 2 + 10 * f.profile.flow.threshold / f.profile.flow.progress.referenceThreshold);

  f.G.match = { playing: () => true, mode: 'turf' };
  attacker.s3.flow.score = 0;
  f.emit('splatted', { victim: victim1, attacker });
  near(attacker.s3.flow.score, 1 + 10 * f.profile.flow.threshold / f.profile.flow.progress.referenceThreshold);
  assert.notEqual(f.G.match, match);
});

test('the online host adds the bonus to its first splat and does not choose again', async () => {
  const f = await fixture(), attacker = f.make(), victim = f.make(), nextAttacker = f.make(), nextVictim = f.make();
  attacker.remote = true; attacker.isBot = true; victim.team = nextVictim.team = 1;
  const match = f.G.match = { playing: () => true, mode: 'turf' }, chosen = [];
  f.G.netm = {
    match, isHost: true,
    claimFirstSplat(killer, target) { if (chosen.length) return false; chosen.push([killer, target]); return true; },
  };
  f.emit('splatted', { victim, attacker });
  f.emit('splatted', { victim: nextVictim, attacker: nextAttacker });
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0][0], attacker); assert.equal(chosen[0][1], victim);
  near(attacker.s3.flow.score, 1 + 10 * f.profile.flow.threshold / f.profile.flow.progress.referenceThreshold);
  near(nextAttacker.s3.flow.score, 1);
});

test('Range and attract matches do not receive or consume the first-splat bonus', async () => {
  const f = await fixture(), attacker = f.make(), victim = f.make(); victim.team = 1;
  const match = f.G.match = { playing: () => true, mode: 'turf', range: {} };
  f.emit('splatted', { victim, attacker });
  near(attacker.s3.flow.score, 1);
  match.range = null;
  f.emit('splatted', { victim, attacker });
  near(attacker.s3.flow.score, 2 + 10 * f.profile.flow.threshold / f.profile.flow.progress.referenceThreshold);

  const attractActor = f.make(), attractVictim = f.make(); attractVictim.team = 1;
  f.G.match = { playing: () => true, mode: 'turf', attract: true };
  f.emit('splatted', { victim: attractVictim, attacker: attractActor });
  near(attractActor.s3.flow.score, 0);
});

test('host confirmation pairs the additive award with the observed event and never elects locally', async () => {
  const f = await fixture(), attacker = f.make(), victim = f.make(); victim.team = 1;
  const match = f.G.match = { playing: () => true, mode: 'turf' };
  f.G.netm = { match, isHost: false };

  f.emit('flow:first-splat-confirmed', { match, attacker, victim, matchId: 'same-match' });
  near(attacker.s3.flow.score, 0);
  f.emit('flow:splat-observed', { match, attacker, victim });
  near(attacker.s3.flow.score, 10 * f.profile.flow.threshold / f.profile.flow.progress.referenceThreshold);
  f.emit('flow:splat-observed', { match, attacker, victim });
  f.emit('flow:first-splat-confirmed', { match, attacker, victim, matchId: 'same-match' });
  near(attacker.s3.flow.score, 10 * f.profile.flow.threshold / f.profile.flow.progress.referenceThreshold);
});

test('late confirmation is additive after the ordinary splat and does not double an active extension', async () => {
  const f = await fixture(), attacker = f.make(), victim = f.make(); victim.team = 1;
  const match = f.G.match = { playing: () => true, mode: 'turf' };
  f.G.netm = { match, isHost: false };
  f.emit('splatted', { victim, attacker });
  near(attacker.s3.flow.score, 1);
  f.emit('flow:first-splat-confirmed', { match, attacker, victim });
  near(attacker.s3.flow.score, 1 + 10 * f.profile.flow.threshold / f.profile.flow.progress.referenceThreshold);

  const active = f.make(), victim2 = f.make(); victim2.team = 1;
  active.s3.flow.active = true; active.s3.flow.remaining = 10;
  f.emit('splatted', { victim: victim2, attacker: active });
  assert.equal(active.s3.flow.remaining, 10 + f.profile.flow.extension);
  f.emit('flow:first-splat-confirmed', { match, attacker: active, victim: victim2 });
  assert.equal(active.s3.flow.remaining, 10 + f.profile.flow.extension, 'the first-splat FP does not extend twice');
});


test('#529 same network life survives owner adoption without a second terminal award', async () => {
  const f = await composedFixture(), attacker = f.make(), victim = f.make();
  attacker.team = 0; victim.team = 1; attacker.netLife = 2; victim.netLife = 3; victim.remote = true;
  f.G.match.mode = 'turf';
  const confirm = () => f.emit('combat:confirmed', { attacker, victim, damage: 0, killed: true, victimLife: 3, helperLife: 2 });
  confirm();
  const score = attacker.s3.flow.score;
  assert.ok(score > 0);
  victim.alive = false; victim.stats.deaths++; victim.remote = false;
  confirm();
  near(attacker.s3.flow.score, score, 'same authoritative life cannot acquire a new terminal from owner-local death bookkeeping');
  victim.netLife = 4; f.emit('combat:respawn', { actor: victim });
  f.emit('combat:confirmed', { attacker, victim, damage: 0, killed: true, victimLife: 4, helperLife: 2 });
  assert.ok(attacker.s3.flow.score > score, 'a genuinely new life still admits progression');
});
