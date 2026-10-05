import test from 'node:test';
import assert from 'node:assert/strict';
import { ghostKindFor, ghostPositionAt, startSplatGhost, splatGhostSnapshot,
  updateSplatGhosts, installSplatGhostReturn } from '../issue-284-adapter.mjs';

const vec = (x, y, z) => ({ x, y, z });
const mkVictim = (over = {}) => ({
  alive: false, team: 1, respawnTimer: 5.5, color: '#2f5bff',
  pos: { x: 4, y: 0.5, z: -30 },
  character: { visible: false, style: {} },
  ...over,
});
const mkG = (calls, pad = vec(0, 2.2, 39.2)) => ({
  level: { spawnPads: { 1: pad } },
  fx: { ghost(pos, color) { calls.push([{ ...pos }, color]); } },
});

test('weapon splat creates a ghost path toward spawnPads[victim.team]', () => {
  const calls = [];
  const G = mkG(calls);
  const victim = mkVictim();
  const rec = startSplatGhost(G, victim, 'weapon');
  assert.ok(rec);
  assert.deepEqual(rec.target, { x: 0, y: 2.2, z: 39.2 });
  assert.equal(rec.kind, 'squid');
  assert.ok(Math.abs(rec.from.x - 4) < 1e-12 && Math.abs(rec.from.y - 0.85) < 1e-12);
  const p0 = {}; ghostPositionAt(rec.from, rec.target, 0, p0);
  const p1 = {}; ghostPositionAt(rec.from, rec.target, 1, p1);
  assert.ok(Math.abs(p0.x - rec.from.x) < 1e-9 && Math.abs(p0.z - rec.from.z) < 1e-9);
  const dStart = Math.hypot(rec.from.x - rec.target.x, rec.from.z - rec.target.z);
  const dEnd = Math.hypot(p1.x - rec.target.x, p1.z - rec.target.z);
  assert.ok(dStart > 1 && dEnd < 1e-9, 'ghost must travel horizontally to spawn');
  assert.ok(p1.y > rec.from.y, 'ghost must rise, not sit as a ground puff');
  const mid = {}; ghostPositionAt(rec.from, rec.target, 0.5, mid);
  const dMid = Math.hypot(mid.x - rec.target.x, mid.z - rec.target.z);
  assert.ok(dMid > 0 && dMid < dStart, 'mid-flight must be between splat and spawn');
  updateSplatGhosts(G, 1 / 30, [victim]);
  assert.ok(calls.length >= 1, 'presentation tick must emit the native ghost sprite');
  assert.equal(calls[0][1], '#2f5bff');
  const snap = splatGhostSnapshot(victim);
  assert.deepEqual(snap.target, rec.target);
  snap.target.x = 999; assert.notEqual(victim[Object.getOwnPropertySymbols(victim).find(s => String(s).includes('record'))]?.target?.x, 999);
});

test('negative main control: no record while alive, and water/fall deaths stay burst-only', () => {
  const G = mkG([]);
  assert.equal(startSplatGhost(G, mkVictim({ alive: true }), 'weapon'), null);
  assert.equal(startSplatGhost(G, mkVictim(), 'water'), null);
  assert.equal(startSplatGhost(G, mkVictim(), 'fall'), null);
  assert.equal(splatGhostSnapshot(mkVictim()), null);
  const calls = [];
  const G2 = mkG(calls);
  updateSplatGhosts(G2, 1 / 60, [mkVictim({ alive: true })]);
  assert.equal(calls.length, 0);
});

test('owner/remote isolation: octopus opt-in resolves; ghost retires on respawn or shown character', () => {
  assert.equal(ghostKindFor(mkVictim({ species: 'Octoling' })), 'octopus');
  assert.equal(ghostKindFor(mkVictim({ character: { visible: false, style: { kind: 'octo' } } })), 'octopus');
  assert.equal(ghostKindFor(mkVictim()), 'squid');
  const calls = [];
  const G = mkG(calls);
  const ownerVictim = mkVictim();
  const remoteVictim = mkVictim({ species: 'octopus' });
  const ro = startSplatGhost(G, ownerVictim, 'weapon');
  const rr = startSplatGhost(G, remoteVictim, 'weapon');
  assert.equal(ro.kind, 'squid');
  assert.equal(rr.kind, 'octopus');
  assert.deepEqual(ro.target, rr.target, 'same team spawn target on both sides');
  ownerVictim.alive = true; remoteVictim.character.visible = true;
  updateSplatGhosts(G, 1 / 30, [ownerVictim, remoteVictim]);
  assert.equal(splatGhostSnapshot(ownerVictim).active, false);
  assert.equal(splatGhostSnapshot(remoteVictim).active, false);
  assert.equal(calls.length, 0, 'retired ghosts must not emit');
});

test('native-path hooks install exactly once for owner and remote', () => {
  const Actor = { prototype: { splat() { this.alive = false; } } };
  const NetMatch = { prototype: { _remoteSplat() {} } };
  const beforeOwner = Actor.prototype.splat;
  const beforeRemote = NetMatch.prototype._remoteSplat;
  const G = mkG([]);
  G.level.spawnPads = [{ x: 99, y: 0, z: 0 }, { x: 1, y: 0, z: 2 }];
  const api = installSplatGhostReturn({ Actor, NetMatch, G });
  assert.ok(api);
  assert.notEqual(Actor.prototype.splat, beforeOwner);
  assert.notEqual(NetMatch.prototype._remoteSplat, beforeRemote);
  const afterOwner = Actor.prototype.splat;
  const afterRemote = NetMatch.prototype._remoteSplat;
  installSplatGhostReturn({ Actor, NetMatch, G });
  assert.equal(Actor.prototype.splat, afterOwner, 'second install must not stack owner hooks');
  assert.equal(NetMatch.prototype._remoteSplat, afterRemote, 'second install must not stack remote hooks');
  const victim = { alive: false, team: 1, respawnTimer: 5.5, pos: { x: 5, y: 0, z: 6 },
    character: { visible: false, style: {} } };
  Actor.prototype.splat.call(victim, null, 'weapon');
  assert.ok(splatGhostSnapshot(victim)?.active, 'owner death hook must seed the ghost');
  const remote = { alive: false, team: 1, respawnTimer: 5.5, pos: { x: 5, y: 0, z: 6 },
    character: { visible: false, style: {} } };
  NetMatch.prototype._remoteSplat.call({}, remote, null, 'weapon');
  assert.ok(splatGhostSnapshot(remote)?.active, 'remote death hook must seed the ghost');
  assert.throws(() => installSplatGhostReturn({}), /native Actor death path/);
});