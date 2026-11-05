// Custom offline matches (roster / Mutators / Boss squad) and detailed result
// statistics, 2026-11-05. Logic tests; the browser flow is recorded in the
// behaviour report (setup panel, results DETAILS dialog, Boss squad of 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomMatch, savePreset, loadPreset, readCustomMatch, writeCustomMatch, customMatchApplies, rosterTargets, applyRoster,
  applyMutatorsToActor, setActiveMutators, activeMutators, NEUTRAL_MUTATORS, MUTATOR_STEPS, CUSTOM_MATCH_KEY, setCustomMatchWeapons } from '../runtime/custom-match-rules.mjs';
import { blankInsights, recordAttack, recordHit, recordSub, summarizeInsights } from '../runtime/match-insights.mjs';
import { attachResultDetails, detailCells } from '../runtime/results-detail.mjs';
import { WEAPONS } from '../../../inkwave-public/src/config.js';
setCustomMatchWeapons(WEAPONS);

const store = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test('settings normalise: unknown weapons become random slots, mutators snap to offered steps, squad 1..8', () => {
  const c = normalizeCustomMatch({ allies: ['shooter', 'nope', 7], enemies: ['roller'], mutators: { ink: .5, damage: 9, speed: 1.25, special: 'x' }, bossSquad: 12 });
  assert.deepEqual(c.allies.slice(0, 3), ['shooter', null, null]);
  assert.equal(c.allies.length, 7); assert.equal(c.enemies.length, 4);
  assert.deepEqual(c.mutators, { ink: .5, damage: 1, speed: 1.25, special: 1 });
  assert.equal(c.bossSquad, 8);
  assert.equal(normalizeCustomMatch({ bossSquad: 0 }).bossSquad, 1);
  for (const list of Object.values(MUTATOR_STEPS)) assert.ok(list.includes(1), 'every rule can be turned off');
});

test('settings persist and presets save / load the roster only', () => {
  const s = store();
  let c = writeCustomMatch({ allies: ['charger'], enemies: ['roller', 'roller'], mutators: { damage: 2 } }, s);
  assert.deepEqual(readCustomMatch(s), c);
  c = savePreset(c, 'Rollers');
  c.allies[0] = null; c.enemies = [null, null, null, null];
  c = loadPreset(c, 'Rollers');
  assert.equal(c.allies[0], 'charger'); assert.deepEqual(c.enemies.slice(0, 2), ['roller', 'roller']);
  assert.equal(c.mutators.damage, 2);
  assert.ok(s.m.has(CUSTOM_MATCH_KEY));
  assert.deepEqual(readCustomMatch({ getItem: () => '{bad json' }).mutators, NEUTRAL_MUTATORS);
});

test('only offline player-run matches take custom settings', () => {
  assert.equal(customMatchApplies({ opts: {} }, {}), true);
  for (const [m, w] of [[{ opts: {}, attract: true }, {}], [{ opts: { roster: [] } }, {}], [{ opts: { range: true } }, {}], [{ opts: {} }, { netm: {} }], [{ opts: {}, follower: true }, {}]])
    assert.equal(customMatchApplies(m, w), false);
});

test('roster re-arms Bots per team in slot order; the player and random slots are untouched', () => {
  const mk = (team, slot, local = false) => ({ team, slot, isLocal: local, isBot: !local, name: `${team}-${slot}`, weaponId: 'shooter', setWeapon(id) { this.weaponId = id; } });
  const actors = [mk(0, 0, true), mk(0, 2), mk(0, 1), mk(0, 3), mk(1, 1), mk(1, 0), mk(1, 2), mk(1, 3)];
  assert.deepEqual(rosterTargets(actors, 0).map(a => a.slot), [1, 2, 3]);
  const changed = applyRoster({ actors }, normalizeCustomMatch({ allies: ['charger', null, 'blaster'], enemies: ['roller'] }));
  assert.equal(actors[0].weaponId, 'shooter', 'player keeps their weapon');
  assert.deepEqual(rosterTargets(actors, 0).map(a => a.weaponId), ['charger', 'shooter', 'blaster']);
  assert.deepEqual(rosterTargets(actors, 1).map(a => a.weaponId), ['roller', 'shooter', 'shooter', 'shooter']);
  assert.equal(changed.length, 3);
});

test('Mutators scale every actor the same way, once, and survive owner recomputes', () => {
  const actor = () => ({ s3: { modifiers: { inkSaverMain: .8, inkSaverSub: 1, runSpeed: 1, swimSpeed: 1, runSpeedFiring: 1, specialCharge: 1 } },
    weapon: { inkPerShot: 1.2, specialCost: 180 }, special: 90 });
  const k = { ink: .5, damage: 2, speed: 1.25, special: 2 };
  const player = actor(), bot = actor();
  for (const a of [player, bot]) { applyMutatorsToActor(a, {}, k); applyMutatorsToActor(a, {}, k); }
  for (const a of [player, bot]) {
    assert.equal(a.s3.modifiers.inkSaverMain, .4); assert.equal(a.weapon.inkPerShot, .6);
    assert.equal(a.s3.modifiers.runSpeed, 1.25); assert.equal(a.weapon.specialCost, 90);
  }
  assert.deepEqual(player, bot, 'player and Bot end identical');
  // A flow refresh recomputes runSpeed: the rule is applied on the new value once.
  player.s3.modifiers.runSpeed = 1.1; applyMutatorsToActor(player, { transient: true }, k);
  assert.ok(Math.abs(player.s3.modifiers.runSpeed - 1.375) < 1e-12);
  // A respawn equip rescales the gauge for the new cost (native kept the old fraction).
  const r = actor(); applyMutatorsToActor(r, {}, k); r.weapon.specialCost = 180; r.special = 90;
  applyMutatorsToActor(r, { transient: true, rescaled: true }, k);
  assert.equal(r.weapon.specialCost, 90); assert.equal(r.special, 45, 'half of the gauge stays half');
  assert.equal(setActiveMutators({ ink: 1, damage: 1, speed: 1, special: 1 }), NEUTRAL_MUTATORS);
  assert.equal(setActiveMutators(k).damage, 2); setActiveMutators(null);
  assert.equal(activeMutators(), NEUTRAL_MUTATORS);
});

test('insights: exact shot attribution, landed attacks never exceed attacks, remote players unmeasured', () => {
  const me = { team: 0, weaponId: 'shooter', stats: { splats: 2, assists: 1, deaths: 3, specials: 1, turf: 412.6 } };
  const enemy = { team: 1 }, ally = { team: 0 };
  me.s3Insights = blankInsights();
  const s1 = recordAttack(me), s2 = recordAttack(me);
  recordHit(me, enemy, 30, 'shooter', s1);
  recordHit(me, enemy, 30, 'shooter', s1);         // same shell, second victim / tick: one landed attack
  recordHit(me, ally, 30, 'shooter', s2);          // friendly: ignored
  recordHit(me, enemy, 50, 'bomb', 0);             // sub damage counts as damage, not a main hit
  recordSub(me); recordAttack(me);
  const row = summarizeInsights(me);
  assert.deepEqual({ attacks: row.attacks, landed: row.landed, hits: row.hits, damage: row.damage, subs: row.subs }, { attacks: 3, landed: 1, hits: 2, damage: 110, subs: 1 });
  assert.equal(row.accuracy, 1 / 3);
  assert.equal(row.turf, 413); assert.equal(row.splats, 2);
  const remote = summarizeInsights({ remote: true, stats: { splats: 1 } });
  assert.equal(remote.measured, false); assert.equal(remote.attacks, null); assert.equal(remote.splats, 1);
  const data = { players: [{ name: 'me', team: 0, weapon: 'shooter' }, { name: 'r', team: 1, weapon: 'roller' }] };
  attachResultDetails(data, { actors: [{ ...me, name: 'me' }, { name: 'r', team: 1, remote: true, stats: {} }] });
  const cells = detailCells(data.players[0], WEAPONS);
  assert.equal(cells[1], WEAPONS.shooter.name);
  assert.deepEqual(cells.slice(2), ['2', '1', '3', '413', '3', '33%', '2', '110', '1', '1']);
  assert.deepEqual(detailCells(data.players[1]).slice(6, 11), ['—', '—', '—', '—', '—']);
});
