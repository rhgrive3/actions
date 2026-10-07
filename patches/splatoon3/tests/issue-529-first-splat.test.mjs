import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const near = (actual, expected, eps = 1e-9) => assert.ok(Math.abs(actual - expected) <= eps, `${actual} != ${expected}`);

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
  assert.equal(active.s3.flow.remaining, 15);
  f.emit('flow:first-splat-confirmed', { match, attacker: active, victim: victim2 });
  assert.equal(active.s3.flow.remaining, 15, 'the first-splat FP does not extend twice');
});
