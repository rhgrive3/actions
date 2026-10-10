import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';
const DT = 1 / 60;
const close = (a, b, message = '') => assert.ok(Math.abs(a - b) < 1e-8, `${message}: ${a} != ${b}`);
const compose = (rel, code) => adaptRange(rel, adaptNetworkSource(rel,
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))))));
const installers = [
  ['installIssueFiveHotfixA', './patches/splatoon3/runtime/issue-five-hotfix-a.mjs'],
  ['installIssueFiveHotfixB', './patches/splatoon3/runtime/issue-five-hotfix-b.mjs'],
  ['installIssueFiveHotfixC', './patches/splatoon3/runtime/issue-five-hotfix-c.mjs'],
  ['installDisconnectFidelity', './patches/splatoon3/runtime/disconnect-fidelity.mjs'],
  ['installSlosherIntermediatePaint', './patches/splatoon3/runtime/slosher-intermediate-paint.mjs'],
  ['installQuality', './patches/local-quality/install.mjs'],
  ['installWeaponsFidelity', './patches/splatoon3/runtime/weapons-fidelity.mjs'],
  ['installIssueEightFollowup', './patches/splatoon3/runtime/issue-eight-followup.mjs'],
];
async function boot() {
  const f = await fixture({ fullRuntime: true, adapt: compose, adaptRuntime: compose,
    extraExports: installers.map(([name, path]) => `export { ${name} } from '${path}';`).join('\n') +
      // beginInitialSquidSpawn is already exported by the shared fullRuntime fixture (#512).
      `export { hauntTrackingRecord } from './patches/splatoon3/runtime/haunt.mjs';` });
  const source = fs.readFileSync(new URL('../bootstrap.mjs', import.meta.url), 'utf8');
  let previous = source.indexOf('const context = install(profile);');
  assert.ok(previous >= 0);
  for (const [name] of installers) {
    const index = source.indexOf(`  ${name}(`, previous);
    assert.ok(index > previous, `bootstrap installs ${name} in this order`); previous = index;
    if (name === 'installQuality') f[name](f.profile);
    else f[name](f.installedRuntime, f.profile);
  }
  const level = new f.Level({ bounds: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 },
    spawnPads: [[0, 0, 0], [0, 0, 20]], spawnBarrier: 0, half: [],
    single: [{ kind: 'box', min: [-30, -.5, -30], max: [30, 0, 30] }] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  f.G.match = { mode: 'turf', state: 'playing', time: 150, duration: 180, paused: false,
    playing: () => true, canRespawn: () => true };
  f.profile.flow.threshold = 1e6;
  const make = (head = 'comeback') => {
    const a = f.make(); a.slot = 0; a.s3.loadout = f.emptyLoadout();
    a.s3.loadout[0].main = head; a.setWeapon(a.weaponId); a.invuln = 0;
    a._integrate = f.Actor.prototype._integrate;
    return a;
  };
  return { ...f, make };
}
function splat(f, a, cause = 'weapon', enemy = true) {
  const attacker = f.make('none'); attacker.team = enemy ? 1 - a.team : a.team;
  a.splat(attacker, cause); assert.equal(a.alive, false); return attacker;
}
function launch(f, a) {
  a.intent.fire = false; f.tick(a); a.intent.fire = true; f.tick(a); a.intent.fire = false;
  assert.equal(a.s3.squidSpawn?.phase, 'flight');
}

test('#382 enemy respawn through actual Turf Squid Spawn retains existing Comeback AP owner', async () => {
  const f = await boot(), a = f.make();
  const loadout = JSON.stringify(a.s3.loadout);
  f.context.localStorage = { getItem: () => loadout }; a.isLocal = true; a.setWeapon(a.weaponId);
  splat(f, a); assert.equal(a.s3.conditionalGear.enemyDeath, true);
  a.respawn(); assert.equal(a.s3.squidSpawn?.phase, 'aim');
  close(a.s3.conditionalGear.comeback, f.profile.conditionalGear.comebackDuration);
  for (const id of ['runSpeed', 'swimSpeed', 'inkSaverMain', 'inkSaverSub', 'inkRecovery', 'specialCharge'])
    assert.equal(a.s3.abilityPoints[id], 10, `${id} receives existing +10 AP`);
  close(a.s3.modifiers.runSpeed, f.gearCurve(10, ...f.profile.gear.runSpeed));
  launch(f, a); f.tick(a, 60); assert.equal(a.s3.squidSpawn, undefined);
  assert.ok(a.s3.conditionalGear.comeback > 0); assert.ok(a.s3.modifiers.runSpeed > 1);
});

test('#382 aim and flight consume the same 20-second clock once at 30/60/120 Hz', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await boot(), a = f.make(); splat(f, a); a.respawn();
    const clock = new f.FixedClock(), rows = []; let tick = 0;
    for (let frame = 0; frame < hz * 20; frame++) clock.advance(1 / hz, dt => {
      // Long aim is a real supported state, then launch at a known fixed tick.
      a.intent.fire = tick === 120; f.G.time += dt; a.update(dt); tick++;
      rows.push([a.s3.conditionalGear.comeback, a.s3.modifiers.runSpeed, a.pos.x, a.pos.y, a.pos.z]);
    });
    assert.equal(tick, 1200); assert.equal(a.s3.squidSpawn, undefined);
    close(rows[0][0], 20 - DT, 'first aim tick');
    close(rows[119][0], 18, 'aim cannot freeze the active clock');
    close(rows[180][0], 20 - 181 * DT, 'flight cannot freeze or double-tick the clock');
    assert.ok(rows[1198][0] > 0); close(rows[1199][0], 0); close(rows[1199][1], 1);
    traces.push(rows);
  }
  assert.deepEqual(traces[0], traces[1]); assert.deepEqual(traces[1], traces[2]);
});

test('#382 initial spawn, allied and environmental deaths do not award Comeback', async () => {
  for (const [cause, hostile] of [['water', true], ['fall', true], ['weapon', false]]) {
    const f = await boot(), a = f.make(); splat(f, a, cause, hostile); a.respawn();
    assert.equal(a.s3.squidSpawn?.phase, 'aim'); close(a.s3.conditionalGear.comeback, 0);
    close(a.s3.modifiers.runSpeed, 1); close(a.s3.modifiers.swimSpeed, 1);
  }
  const f = await boot(), a = f.make();
  assert.equal(f.beginInitialSquidSpawn(a), true);
  assert.equal(a.s3.squidSpawn?.initial, true); close(a.s3.conditionalGear.comeback, 0);
  launch(f, a); f.tick(a, 60); close(a.s3.conditionalGear.comeback, 0);
});

test('#382 repeated enemy respawn re-awards once; explicit reset and new matches discard it', async () => {
  const f = await boot(), a = f.make();
  for (let cycle = 0; cycle < 2; cycle++) {
    a.invuln = 0; splat(f, a); a.respawn(); close(a.s3.conditionalGear.comeback, 20);
    launch(f, a); f.tick(a, 60); f.tick(a, 30);
    assert.ok(a.s3.conditionalGear.comeback < 20); assert.ok(a.s3.conditionalGear.comeback > 0);
  }
  a.reset(); close(a.s3.conditionalGear.comeback, 0); close(a.s3.modifiers.runSpeed, 1);
  a.invuln = 0; splat(f, a); a.respawn(); assert.ok(a.s3.conditionalGear.comeback > 0);
  f.G.match = { ...f.G.match }; f.tick(a);
  close(a.s3.conditionalGear.comeback, 0); close(a.s3.modifiers.runSpeed, 1);
});

test('#382 wrapper restoration retains Flow, Opening Gambit deadline and Quick Respawn history', async () => {
  const f = await boot(), a = f.make('openingGambit');
  a.s3.conditionalGear.openingEnd = 45; f.G.match.time = 140;
  a.s3.flow.active = true; a.s3.flow.remaining = 10;
  splat(f, a);
  const flow = a.s3.flow, history = a.s3.quickRespawnHistory;
  a.respawn();
  assert.equal(a.s3.flow, flow); assert.equal(a.s3.quickRespawnHistory, history);
  assert.equal(a.s3.conditionalGear.openingEnd, 45, 'respawn cannot reset a prior extension to 30');
  f.tick(a); close(flow.remaining, 10 - DT, 'Flow is advanced once in aim');
  launch(f, a); const remaining = flow.remaining; f.tick(a, 30);
  close(flow.remaining, remaining - .5, 'Flow is advanced once in flight');
  a.reset(); assert.notEqual(a.s3.flow, flow); assert.notEqual(a.s3.quickRespawnHistory, history);
  assert.equal(a.s3.conditionalGear.openingEnd, 30, 'explicit reset keeps fresh-match semantics');
});

test('#382 Turf respawn keeps finalized gauge fraction, one event and launch-owned armor', async () => {
  const f = await boot(), a = f.make(); let respawns = 0;
  f.on('respawn', e => { if (e.actor === a) respawns++; });
  a.special = 100; splat(f, a); const spentFraction = a.specialFrac(), netTp = a.netTp || 0;
  a.respawn(); close(a.specialFrac(), spentFraction); assert.equal(respawns, 1); assert.equal(a.netTp, netTp + 1);
  assert.equal(a.s3.spawnArmor, null); assert.equal(a.invuln, Infinity);
  launch(f, a); close(a.s3.spawnArmor.remaining, f.profile.spawnArmor.duration);
  f.tick(a, 60); assert.equal(a.s3.squidSpawn, undefined);
  close(a.s3.spawnArmor.remaining, f.profile.spawnArmor.duration - 1);
  close(a.specialFrac(), spentFraction); assert.equal(respawns, 1);
});

test('#382 non-Turf and Practice Range keep the existing immediate respawn path', async () => {
  for (const mode of ['boss', 'range']) {
    const f = await boot(), a = f.make();
    if (mode === 'boss') { f.G.match.mode = 'boss'; f.G.match.bossCfg = { squad: 4 }; }
    else f.G.match.opts = { range: true };
    splat(f, a); a.respawn();
    assert.equal(a.s3.squidSpawn, undefined); assert.equal(a.alive, true);
    close(a.s3.conditionalGear.comeback, 20);
  }
});

test('#382 automated bot launch and owner-private Haunt survive the restored respawn chain', async () => {
  const f = await boot(), bot = f.make(); bot.isBot = true;
  splat(f, bot); bot.respawn(); assert.equal(bot.s3.squidSpawn?.phase, 'flight');
  close(bot.s3.conditionalGear.comeback, 20); f.tick(bot, 60);
  assert.equal(bot.s3.squidSpawn, undefined); close(bot.s3.conditionalGear.comeback, 19);
  const a = f.make(); a.s3.loadout[1].main = 'haunt'; a.setWeapon(a.weaponId);
  f.G.match.actors = f.G.actors;
  const attacker = splat(f, a); a.respawn();
  assert.ok(f.hauntTrackingRecord(attacker, a), 'dead owner ledger arms after the actual new life');
  close(a.s3.conditionalGear.comeback, 20);
  const stranger = f.make('none');
  assert.equal(f.hauntTrackingRecord(attacker, stranger), null, 'tracking remains owner-private');
  a.reset(); assert.equal(f.hauntTrackingRecord(attacker, a), null, 'explicit reset drops the prior life ledger');
});
