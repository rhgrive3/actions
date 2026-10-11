import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const RANKED_EXPORTS = `
  export { Match } from './inkwave-public/src/game/match.js';
  export { BotBrain } from './inkwave-public/src/game/bots.js';
  export { NetSession } from './inkwave-public/src/net/session.js';
  export { installRanked } from './patches/splatoon3/runtime/ranked/install.mjs';
  export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
  export { createRankedEffects } from './patches/splatoon3/runtime/ranked/combat.mjs';
`;

async function bootRanked() {
  const f = await fixture({
    fullRuntime: true,
    adaptNative: adaptBuildSource,
    adaptRuntime: adaptBuildSource,
    extraExports: RANKED_EXPORTS,
  });
  // Ranked snapshots clone validated rule state in the VM realm.
  f.context.structuredClone = structuredClone;
  f.installRanked({
    ...f.installedRuntime,
    G: f.G,
    Match: f.Match,
    BotBrain: f.BotBrain,
    NetSession: f.NetSession,
    structuredClone,
  });
  return f;
}

const fixtureStage = () => ({
  id: 'ranked-integration-stage',
  zones: [{ center: [0, 0, 0], size: [8, 8] }],
});

test('ranked runtime suppresses carrier fire, splats a timed-out carrier, and replicates owner input and snapshots', async () => {
  const f = await bootRanked();

  // This path uses the real Actor -> WeaponRunner update chain installed by
  // the full runtime, with only world display and projectile emission stubbed
  // by source-fixture.
  const carrier = f.make('shooter');
  carrier.team = 0;
  carrier.slot = 0;
  carrier.kidT = 5;
  carrier.intent.fire = true;
  f.G.match = {
    mode: 'rainmaker',
    ranked: { rule: { state: { carrier: '0:0' } } },
    playing: () => true,
  };
  f.tick(carrier, 36);
  assert.equal(f.shots.length, 0, 'the active Rainmaker carrier cannot emit its normal weapon');

  const timeoutCalls = [];
  carrier.alive = true;
  carrier.splat = (attacker, cause) => timeoutCalls.push({ attacker, cause });
  const timeoutMatch = { state: 'playing', actors: [carrier], ranked: { revision: 3 } };
  const effects = f.createRankedEffects({ ...f.installedRuntime, emit: f.emit }, timeoutMatch);
  effects.event({ kind: 'rainmaker-timeout', id: '0:0', pos: [0, 0, 0], team: 0 });
  effects.dispose();
  assert.deepEqual(timeoutCalls, [{ attacker: null, cause: 'rainmaker' }]);

  const stage = fixtureStage();
  const hostEngine = new f.RankedEngine('zones', stage);
  const guestEngine = new f.RankedEngine('zones', stage);
  const hostPackets = [];
  const guestPackets = [];
  const hostSession = {
    myId: 'host', hostId: 'host', isHost: true,
    _members: new Set(['host', 'guest']),
    tr: { broadcast: packet => hostPackets.push(packet), sendTo() {} },
  };
  const guestSession = {
    myId: 'guest', hostId: 'host', isHost: false,
    _members: new Set(['host', 'guest']),
    tr: { broadcast: packet => guestPackets.push(packet), sendTo() {} },
  };
  const owner = f.make('shooter');
  Object.assign(owner, { nid: 23, owner: 'guest', team: 0, slot: 1, remote: false });
  owner._rankedInput = { fire: true, aim: [0, 0, 1] };
  owner._rankedThrowPending = true;
  const guestMatch = {
    ranked: guestEngine, local: owner, actors: [owner], state: 'playing', time: 300,
    setState(state) { this.state = state; },
  };
  const guestNet = new f.NetMatch(guestSession, { id: 'ranked-fixture', map: 'tidewater' });
  guestNet.bind(guestMatch);
  guestNet._sendTick();
  const ownerPacket = guestPackets.at(-1);
  assert.equal(ownerPacket?.k, 't');
  assert.deepEqual(JSON.parse(JSON.stringify(ownerPacket?.rki)), {
    match: 'ranked-fixture', id: '23', seq: 1, fire: true, throw: true, aim: [0, 0, 1],
  }, 'the guest streams its owner-authenticated ranked command with the native actor tick');
  assert.equal(owner._rankedThrowPending, false, 'one-shot throw input is consumed once it is sent');

  const proxy = f.make('shooter');
  Object.assign(proxy, { nid: 23, owner: 'guest', team: 0, slot: 1, remote: true });
  const hostMatch = {
    ranked: hostEngine, local: null, actors: [proxy], state: 'playing', time: 300,
    rankedGains: [0, 0], setState(state) { this.state = state; },
  };
  const hostNet = new f.NetMatch(hostSession, { id: 'ranked-fixture', map: 'tidewater' });
  hostNet.bind(hostMatch);
  hostNet.onMessage('guest', ownerPacket);
  assert.deepEqual(JSON.parse(JSON.stringify(hostNet.rankedInputs.get('23'))), {
    seq: 1, fire: true, throw: true, aim: [0, 0, 1], at: f.G.time,
  }, 'the host accepts the command only for the actor owned by that guest');

  hostEngine.setCount(0, 55);
  const snapshot = {
    k: 'st', s: 'playing', t: hostEngine.time,
    rk: { match: 'ranked-fixture', host: 'host', state: hostEngine.snapshot(), gains: [0, 0] },
  };
  f.G.netm = guestNet;
  guestNet.onMessage('host', snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(guestEngine.counts)), [55, 100], 'the guest restores the host-owned ranked objective state');
  assert.equal(guestMatch.time, hostEngine.time);

});

test('ranked finish freezes actor and projectile combat while zero-clock overtime remains live', async () => {
  const f = await bootRanked();
  const ranked = new f.RankedEngine('zones', fixtureStage());
  const attacker = f.make('shooter');
  attacker.team = 0;
  const victim = f.make('shooter');
  victim.team = 1;
  const projectiles = new f.Projectiles(new f.THREE.Scene());
  f.G.match = { mode: 'zones', ranked, state: 'finish', time: 0, attract: false };

  const hpAtFinish = victim.hp;
  const turfAtFinish = attacker.stats.turf;
  assert.equal(victim.damage(20, attacker, 'shooter'), false);
  victim.splat(attacker, 'shooter');
  attacker.addTurf(9);
  projectiles.applyHit(attacker, victim, 20, 'shooter');
  assert.equal(victim.alive, true, 'direct splat is denied after ranked finish');
  assert.equal(victim.hp, hpAtFinish, 'direct damage and projectile hits are denied after ranked finish');
  assert.equal(attacker.stats.turf, turfAtFinish, 'actor turf stats stay frozen after ranked finish');

  f.G.match.state = 'playing';
  ranked.overtime = true;
  const overtimeHp = victim.hp;
  assert.equal(victim.damage(12, attacker, 'shooter'), false);
  assert.equal(victim.hp, overtimeHp - 12, 'combat remains enabled at zero regulation time during overtime');
  const overtimeTurf = attacker.stats.turf;
  attacker.addTurf(7);
  assert.equal(attacker.stats.turf, overtimeTurf + 7);
  victim.splat(attacker, 'shooter');
  assert.equal(victim.alive, false, 'overtime permits a real actor splat');

  const projectileVictim = f.make('shooter');
  projectileVictim.team = 1;
  const projectileHp = projectileVictim.hp;
  projectiles.applyHit(attacker, projectileVictim, 13, 'shooter');
  assert.equal(projectileVictim.hp, projectileHp - 13, 'projectile applyHit remains enabled during overtime');
});


for (const mode of ['zones', 'tower', 'rainmaker', 'clams']) test(`native ranked room ${mode} confirms teams, requires two humans and starts the matching roster`, async () => {
  const f = await bootRanked();
  const host = new f.NetSession(), guest = new f.NetSession();
  const peers = new Map([['host', host], ['guest', guest]]), packets = [];
  for (const [id, net] of peers) {
    Object.assign(net, {myId:id, hostId:'host', state:'lobby', _members:new Map([['host','Host'],['guest','Guest']])});
    net.tr = {broadcast(packet) { packets.push(structuredClone(packet)); for(const [other, peer] of peers) if(other!==id) peer._message(id,structuredClone(packet)); },
      sendTo(id,packet) {peers.get(id)?._message(net.myId,structuredClone(packet));}, lock() {}, close() {}};
  }
  f.G.projectiles = new f.Projectiles(new f.THREE.Scene());
  f.G.game = {menus:{launchLobby:async()=>{}}, startNetMatch:async()=>{}, netMatchGo() {}};
  try {
    host.lobby.players = [host._newPlayer('host','Host',{}),host._newPlayer('guest','Guest',{})];
    host._fixTeams(); host.setSettings({mode,bots:true,map:'tidewater'});
    assert.equal(guest.lobby.mode,mode);
    assert.equal(host.confirmTeams(),true,'ranked modes share native team confirmation');
    assert.equal(host.assignTeam('guest',1),true,'host may assign ranked teams');
    assert.equal(host.lobby.teamsConfirmed,false,'assignment revokes confirmation');
    host.confirmTeams(); guest.setMe({ready:true}); host.setMe({ready:true});
    assert.equal(host.canStart(),true);
    const guestRow=host.lobby.players.pop();
    assert.equal(host.canStart(),false,'one human with bots cannot launch a private ranked room');
    host.lobby.players.push(guestRow);
    assert.equal(host.start(),true);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const cfg=packets.find(p=>p.k==='start');
    assert.equal(cfg.mode,mode); assert.equal(cfg.duration,300); assert.equal(cfg.roster.length,8);
    assert.equal(guest._startCfg.id,cfg.id);
  } finally {host.leave();guest.leave();}
});
