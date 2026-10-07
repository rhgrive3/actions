// #614: the installed src/main.js 'splatted' router must not broadcast remote
// attacker/victim identities into the global HUD text feed. Splatoon 3's normal
// battle HUD has no global text kill feed naming both participants: only the
// local splat confirmation, the local death presentation, the top roster and
// WIPEOUT! remain. The test runs the real composed handler (build adapter chain),
// never a rewritten copy of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';
import { adaptRange } from '../../practice-range/adapter.mjs';

const ROOT = new URL('../../../', import.meta.url);
const composed = rel => adaptRange(rel, adaptNetworkSource(rel, adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, fs.readFileSync(new URL('inkwave-public/' + rel, ROOT), 'utf8')))))));
function section(s, start, end) { const a = s.indexOf(start), b = s.indexOf(end, a); assert.ok(a >= 0 && b > a, start); return s.slice(a, b); }
const t = (s, o) => s.replace(/\{(\w+)\}/g, (_m, k) => (o && o[k] != null ? String(o[k]) : `{${k}}`));

const actor = ({ name, team, isLocal = false }) => ({
  name, team, isLocal, alive: true, enemyTeam: 1 - team,
  pos: { clone: () => ({ x: 0, y: 0, z: 0 }) },
});

// Bind the installed on('splatted') registration from composed src/main.js to a stub Game.
function router({ match }) {
  const code = section(composed('src/main.js'), "    on('splatted',", '\n    on(');
  const handlers = {};
  const feeds = [], audios = [], deaths = [];
  const G = { teamHex: ['#ff8a14', '#2f5bff'], audio: { play: id => audios.push(id), duck: () => {} } };
  const game = {
    match,
    hud: { feed: v => feeds.push(v), showSplatted: v => deaths.push(v) },
    rig: { lookAt: { copy() {} } },
  };
  vm.runInNewContext(`(function(){${code}}).call(game)`, { on: (n, fn) => { handlers[n] = fn; }, game, t, G, PLAYER: { respawnTime: 5 }, console });
  assert.equal(typeof handlers.splatted, 'function', 'installed splatted router is registered');
  return { emit: ev => handlers.splatted(ev), feeds, audios, deaths, game };
}

const baseMatch = local => ({ local, attract: false });

test('#614 remote ally splatted by an enemy: ally-down audio only, no global text entry', () => {
  const local = actor({ name: 'Me', team: 0, isLocal: true });
  const ally = actor({ name: 'Ally', team: 0 });
  const enemy = actor({ name: 'Enemy', team: 1 });
  const r = router({ match: baseMatch(local) });
  r.emit({ victim: ally, attacker: enemy, cause: 'ink' });
  assert.equal(r.feeds.length, 0, 'no attacker/victim text pill for a remote splat');
  assert.ok(r.audios.includes('ally_splatted'), 'non-identifying ally-down audio cue is preserved');
  assert.equal(r.deaths.length, 0, 'own-death presentation is not triggered by a remote death');
});

test('#614 remote ally splats an enemy: no global text entry naming the pair', () => {
  const local = actor({ name: 'Me', team: 0, isLocal: true });
  const ally = actor({ name: 'Ally', team: 0 });
  const enemy = actor({ name: 'Enemy', team: 1 });
  const r = router({ match: baseMatch(local) });
  r.emit({ victim: enemy, attacker: ally, cause: 'ink' });
  assert.equal(r.feeds.length, 0, 'no global feed pill for a remote ally kill');
});


test('#614 local splat confirmation still feeds the kill card path', () => {
  const local = actor({ name: 'Me', team: 0, isLocal: true });
  const victim = actor({ name: 'Bob', team: 1 });
  const r = router({ match: baseMatch(local) });
  r.emit({ victim, attacker: local, cause: 'ink' });
  assert.equal(r.feeds.length, 1);
  assert.equal(r.feeds[0].kind, 'kill');
  assert.equal(r.feeds[0].text, 'You splatted Bob!');
  assert.ok(r.audios.includes('splat_enemy'));
});

test('#614 own death still identifies who splatted the local player', () => {
  const local = actor({ name: 'Me', team: 0, isLocal: true });
  const attacker = actor({ name: 'Enemy', team: 1 });
  const r = router({ match: baseMatch(local) });
  r.emit({ victim: local, attacker, cause: 'ink' });
  assert.equal(r.feeds.length, 0, 'own death uses showSplatted, not the text feed');
  assert.equal(r.deaths.length, 1);
  assert.equal(r.deaths[0].by, 'Enemy');
  assert.equal(r.game.rig.mode, 'spectate');
  assert.ok(r.audios.includes('splatted_self'));
});

test('#614 water/environment death of the local player still shows the death presentation', () => {
  const local = actor({ name: 'Me', team: 0, isLocal: true });
  const r = router({ match: baseMatch(local) });
  r.emit({ victim: local, attacker: null, cause: 'water' });
  assert.equal(r.deaths.length, 1);
  assert.equal(r.deaths[0].by, 'the sea');
  assert.equal(r.feeds.length, 0);
});

test('#614 absent/attract matches never reach the feed', () => {
  const local = actor({ name: 'Me', team: 0, isLocal: true });
  const ally = actor({ name: 'Ally', team: 0 });
  const enemy = actor({ name: 'Enemy', team: 1 });
  const r1 = router({ match: null });
  r1.emit({ victim: ally, attacker: enemy, cause: 'ink' });
  assert.equal(r1.feeds.length, 0);
  const r2 = router({ match: { local, attract: true } });
  r2.emit({ victim: ally, attacker: enemy, cause: 'ink' });
  assert.equal(r2.feeds.length, 0);
});

test('#614 composed source no longer carries the global remote-feed translations', () => {
  const main = composed('src/main.js');
  assert.ok(!main.includes("'{victim} was splatted by {attacker}'"), 'remote attacker/victim pill is gone from the runtime');
  assert.ok(!main.includes("'{victim} was splatted'"), 'unnamed remote death pill is gone from the runtime');
  assert.ok(!main.includes("'{attacker} splatted {victim}'"), 'remote ally-kill pill is gone from the runtime');
});

test('#614 roster life routing and WIPEOUT! survive alongside the feed gate', () => {
  const match = composed('src/game/match.js');
  assert.ok(match.includes("on('splatted', (e) => this._onSplatted(e))"), 'roster alive/splatted subscription untouched');
  const hud = composed('src/ui/hud.js');
  assert.ok(hud.includes("on('team:wipeout', (e) => queueTeamWipeHud(this, e, G.match))"), 'current match-owned WIPEOUT subscriber remains');
  assert.ok(hud.includes("flushTeamWipeHud(this, G.match, tr);"), 'the queued team notification retains its HUD consumer');
  assert.ok(hud.includes("kind === 'kill'"), 'kill-card suppression path untouched');
});
