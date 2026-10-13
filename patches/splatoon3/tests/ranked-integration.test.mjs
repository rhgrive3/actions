import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';

const RANKED_EXPORTS = `
  export { Match } from './inkwave-public/src/game/match.js';
  export { BotBrain } from './inkwave-public/src/game/bots.js';
  export { NetSession } from './inkwave-public/src/net/session.js';
  export { installRanked, buildFrame } from './patches/splatoon3/runtime/ranked/install.mjs';
  export { RankedEngine } from './patches/splatoon3/runtime/ranked/engine.mjs';
  export { createRankedEffects } from './patches/splatoon3/runtime/ranked/combat.mjs';
`;

async function bootRanked(options = {}) {
  const f = await fixture({
    fullRuntime: true,
    ...options,
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
  const beforeSpecial = carrier.special, beforeTurf = carrier.stats.turf; carrier.addTurf(10);
  assert.equal(carrier.special, beforeSpecial, 'pending paint and death-blast credit cannot increase a carrier gauge');
  assert.equal(carrier.stats.turf, beforeTurf + 10);

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
    match: 'ranked-fixture', id: '23', seq: 1, fire: true, throw: true, aim: [0, 0, 1], special: null, specialDeployed: false, clamDrop: 0,
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
    seq: 1, fire: true, throw: true, aim: [0, 0, 1], at: f.G.time, special: null, specialDeployed: false, clamDrop: 0,
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

test('native special lifecycle carries pickup restrictions and inventory ejection into the host rule', async()=>{
  const f=await bootRanked(),a=f.make('shooter');a.nid=230;a.team=0;a.slot=0;
  const stage={id:'native-clam-specials',clams:{spawns:[],goals:[[0,0,10],[0,0,-10]]}},e=new f.RankedEngine('clams',stage);
  const m=f.G.match={mode:'clams',state:'playing',playing:()=>true,ranked:e,actors:[a],rankedBarrierHits:[],rankedWorld:{zoneCoverage:()=>[],floorAt:()=>0,blocked:()=>false}};
  e.rule.state.inventories['230']={team:0,small:7,power:false};a.weapon={...a.weapon,special:'krakenRoyale'};a.special=a.specialCost();a._startSpecial();
  assert.equal(a.specialActive?.id,'krakenRoyale');assert.equal(a._rankedClamDrop,1,'native activation reaches the ranked lifecycle hook');
  const actual=f.buildFrame(m,{G:f.G});assert.equal(actual.actors[0].special,'krakenRoyale');assert.equal(actual.actors[0].clamDrop,1);
  e.update(1/60,actual);assert.equal(e.rule.state.inventories['230'].small,0);assert.equal(e.rule.state.clams.length,7);
  e.update(1/60,actual);assert.equal(e.rule.state.clams.length,7,'the same lifecycle counter cannot eject twice');
});

test('native objective effects apply Power Clam paint through the game paint path without special credit',async()=>{
  const f=await bootRanked(),calls=[];f.G.paint.splat=(...args)=>{calls.push(args);return 1;};
  const m={state:'playing',actors:[],ranked:{revision:12}},effects=f.createRankedEffects({...f.installedRuntime,emit:f.emit},m);
  effects.event({kind:'clam-paint',team:1,pos:[2,0,3],radius:.7});assert.equal(calls.length,1);assert.deepEqual(Array.from(calls[0][0].toArray()),[2,0,3]);assert.equal(calls[0][2],1);assert.equal(calls[0][3].claimMode,'no-special');
  effects.event({kind:'clam-paint',team:1,pos:[2,0,3],radius:.7},true);assert.equal(calls.length,1,'followers get native paint replication rather than duplicate paint events');effects.dispose();
});

test('native Rainmaker pickup cancels allowed actor-owned specials while keeping deployed object lifetime',async()=>{
  const f=await bootRanked(),a=f.make('shooter');a.nid=231;a.team=0;a.weapon={...a.weapon,special:'crabTank'};a.special=a.specialCost();
  const stage={id:'native-rm-specials',rainmaker:{center:[0,0,0],goals:[[0,0,10],[0,0,-10]],checkpoints:[[],[]]}},e=new f.RankedEngine('rainmaker',stage);
  const m=f.G.match={mode:'rainmaker',state:'playing',playing:()=>true,ranked:e,actors:[a],rankedBarrierHits:[],rankedWorld:{zoneCoverage:()=>[],floorAt:()=>0,blocked:()=>false},rankedEffects:{event(){}},rankedGains:[0,0]};
  a._startSpecial();assert.equal(a.specialActive?.id,'crabTank');e.rule.state.barrier.active=false;e.update(1/60,f.buildFrame(m,{G:f.G}));assert.equal(e.rule.state.carrier,'231');
  f.Match.prototype.playRankedEvents.call(m,e.events);assert.equal(a.specialActive,null);assert.equal(a._s3AllSpecialState,null);assert.equal(a.special,0);
});

test('Rainmaker sweep reaches the real native Ultra Stamp guard and never detonates behind it', async () => {
  const f = await bootRanked({ realProjectiles: true }), shooter = f.make('shooter'), guard = f.make('shooter');
  shooter.nid = 'carrier'; shooter.team = 0; shooter.pos.set(0, 0, 0);
  guard.nid = 'stamp'; guard.team = 1; guard.pos.set(0, 0, 3); guard.yaw = guard.aimYaw = Math.PI; guard.aimDir.set(0, 0, -1);
  guard.weapon = { ...guard.weapon, special: 'ultraStamp' }; guard.special = guard.specialCost();
  const m = f.G.match = { mode: 'rainmaker', state: 'playing', playing: () => true, actors: [shooter, guard], ranked: { revision: 0, rule: { state: { carrier: shooter.nid, charge: { value: 1 } } } } };
  f.G.actors = m.actors; guard._startSpecial(); assert.equal(guard.specialActive?.id, 'ultraStamp');
  f.G.physics.segment = (_start, _end, hit) => { hit.hit = false; return hit; };
  const rings = [], removals = []; f.G.fx = { ...f.G.fx, ring: (...a) => rings.push(a) }; f.G.scene = { add() {}, remove: o => removals.push(o) };
  const effects = f.createRankedEffects(f.installedRuntime, m);
  effects.event({ kind: 'rainmaker-shot', actorId: shooter.nid, team: 0, pos: [0, 0, 0], aim: [0, 0, 1], charge: 1,
    damage: 60, blastDamage: 180, outerDamage: 40, radius: 1.4, nearRadius: .92, paintRadius: 1, speed: 18, directRange: 4.4 });
  effects.update(.1); effects.update(.1); effects.update(.3);
  assert.equal(removals.length, 1); assert.deepEqual(rings, []); assert.equal(guard.hp, 100);
  effects.dispose();
});

test('pickup interrupts a real main-weapon charge so the carrier can swim and no old charge resumes after loss', async () => {
  const f = await bootRanked(), a = f.make('charger'); a.nid = 'charging-carrier'; a.kidT = 5;
  a.intent.fire = true; f.tick(a, 24); assert.equal(a.weaponRunner.charging, true); assert.equal(a.weaponRunner.busy(), true);
  const stage = { id: 'charging-pickup', rainmaker: { center: a.pos.toArray(), goals: [[0,0,10],[0,0,-10]], checkpoints: [[],[]] } }, e = new f.RankedEngine('rainmaker', stage);
  const m = f.G.match = { mode: 'rainmaker', state: 'playing', playing: () => true, actors: [a], ranked: e, rankedGains: [0,0], rankedEffects: { event() {} } };
  e.rule.state.barrier.active = false; e.update(1/60, { actors: [{ id: a.nid, team: 0, pos: a.pos.toArray(), alive: true, grounded: true }] });
  const beforeShots = f.shots.length; f.Match.prototype.playRankedEvents.call(m, e.events);
  assert.equal(a.weaponRunner.busy(), false); assert.equal(a.weaponRunner.charging, false); assert.equal(a.ink, f.PLAYER.inkMax);
  a.intent.fire = false; a.intent.squid = true; f.tick(a, 1); assert.equal(a.form, 'squid', 'the ordinary main charge cannot lock Rainmaker form arbitration');
  e.rule.state.carrier = null; a.intent.squid = false; f.tick(a, 30); assert.equal(f.shots.length, beforeShots, 'the pre-pickup charge cannot fire after possession ends');
});
