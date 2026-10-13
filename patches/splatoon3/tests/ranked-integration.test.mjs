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
  export { bigBubblerSourceRate, bigBubblerDomes, bigBubblerRemoteDomes, bigBubblerSnapshot, replayBigBubbler } from './patches/splatoon3/runtime/kit-big-bubbler.mjs';
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


async function rainmakerWallHarness() {
  const f = await bootRanked({ realProjectiles: true });
  const shooter = f.make('shooter'), owner = f.make('shooter'), rear = f.make('shooter'), front = f.make('shooter');
  Object.assign(shooter, { nid: 301, owner: 'guest', team: 0, remote: false });
  Object.assign(owner, { nid: 302, owner: 'host', team: 1, remote: false });
  rear.nid = 303; rear.team = 1; front.nid = 304; front.team = 1;
  shooter.pos.set(0, 0, 0); owner.pos.set(0, 0, 4); rear.pos.set(0, 0, 2.9); front.pos.set(1, 0, 1.8);
  for (const actor of [shooter, owner, rear, front]) { actor.invuln = 0; actor.s3.spawnArmor = null; }
  owner.weapon = { ...owner.weapon, sub: 'splashWall' }; owner.s3.abilityPoints = { ...owner.s3.abilityPoints, subPower: 0 }; shooter.s3.objectHitGear = false;
  f.G.scene = { add() {}, remove() {} }; f.G.netm = null;
  f.G.physics.segment = (_start, _end, hit) => { hit.hit = false; return hit; };
  f.G.physics.los = () => true;
  const proposals = [], emit = f.installedRuntime.emit;
  f.installedRuntime.emit = (name, event) => { if (name === 'all:sub' && event.phase === 'objectHit') proposals.push(event); else emit(name, event); };
  // Native creation and native HP/collision/owner callbacks; deployment position
  // is the controlled world condition, as in the installed Stamp guard test.
  const wall = f.G.projectiles.throwBomb(owner);
  assert.equal(wall.subId, 'splashWall'); assert.equal(wall.hp, 800);
  wall.phase = 'deployed'; wall.pos.set(0, 0, 2); wall.yaw = 0;
  const m = f.G.match = { mode: 'rainmaker', state: 'playing', playing: () => true, actors: [shooter, owner, rear, front],
    ranked: { revision: 0, rule: { state: { carrier: String(shooter.nid), charge: { value: 1 } } } } };
  f.G.actors = m.actors;
  const effects = f.createRankedEffects(f.installedRuntime, m);
  const fire = visualOnly => {
    effects.event({ kind: 'rainmaker-shot', id: 0, actorId: String(shooter.nid), team: 0, pos: [0, 0, 0], aim: [0, 0, 1],
      charge: 1, damage: 60, blastDamage: 180, outerDamage: 40, radius: 1.4, nearRadius: .92,
      paintRadius: 1, speed: 18, directRange: 4.4 }, visualOnly);
    effects.update(.1); effects.update(.1); effects.update(.3);
  };
  return { ...f, shooter, owner, rear, front, wall, proposals, effects, fire };
}

for (const gear of [false, true]) test('native Splash Wall receives Rainmaker direct x1 plus blast x2; Object Shredder once (' + gear + ')', async () => {
  const f = await rainmakerWallHarness(); f.shooter.s3.objectHitGear = gear;
  f.fire(false);
  assert.equal(f.wall.hp, 800 - (60 + 180 * 2) * (gear ? 1.5 : 1));
  assert.equal(f.rear.hp, 100, 'the virtual shield blocks the explosion behind it');
  assert.equal(f.front.hp, 60, 'the same shield does not hide the attacker-side opponent from the far blast');
  f.effects.dispose();
});

test('a shield destroyed by this Rainmaker blast still blocks the same explosion behind it', async () => {
  const f = await rainmakerWallHarness(); f.wall.hp = 400; f.fire(false);
  assert.equal(f.wall.dead, true); assert.equal(f.G.projectiles._s3SubObjects.includes(f.wall), false);
  assert.equal(f.rear.hp, 100); assert.equal(f.front.hp, 60);
  f.effects.dispose();
});

test('a guest-owned follower proposes native object damage and the wall owner accepts each hit only once', async () => {
  const f = await rainmakerWallHarness(); f.owner.remote = true; f.wall.ghost = true;
  f.fire(true);
  assert.equal(f.wall.hp, 800, 'a remote wall presentation never spends local HP');
  assert.deepEqual(f.proposals.map(p => p.damage), [60, 180]);
  assert.ok(f.proposals.every(p => p.actor === f.shooter && p.targetOwnerId === f.owner.nid && p.targetSeq === f.wall.seq));
  assert.equal(f.rear.hp, 100); assert.equal(f.front.hp, 100, 'a follower still cannot damage actors');
  // Replay through the installed, life/target-validated native owner handler.
  f.shooter.remote = true; f.owner.remote = false; f.wall.ghost = false;
  f.G.netm = { byNid: new Map([[f.shooter.nid, f.shooter], [f.owner.nid, f.owner]]) };
  for (const proposal of f.proposals) assert.equal(f.installedRuntime.replaySub(proposal), true);
  assert.equal(f.wall.hp, 380);
  for (const proposal of f.proposals) assert.equal(f.installedRuntime.replaySub(proposal), false);
  assert.equal(f.wall.hp, 380, 'ordered proposal identities reject replayed hits');
  f.effects.dispose();
});

test('the ranked host does not double-spend native object HP for a remote-owned carrier', async () => {
  const f = await rainmakerWallHarness(); f.shooter.remote = true; f.fire(false);
  assert.equal(f.wall.hp, 800); assert.deepEqual(f.proposals, []);
  assert.equal(f.rear.hp, 100, 'the host still owns and occludes actor blast damage');
  f.effects.dispose();
});

async function rainmakerArmorHarness() {
  const f = await rainmakerWallHarness();
  f.G.projectiles.clear();
  const victim = f.rear;
  victim.weapon = { ...victim.weapon, special: 'booyahBomb', specialCost: 100 };
  victim.special = 100; victim._resolve = () => {};
  victim.intent.fire = false; victim.intent.sub = false; victim._startSpecial();
  for (let frame = 0; frame < 30; frame++) victim._updateSpecial(1 / 60);
  victim.pos.set(0, 0, 2); victim.invuln = 0; victim.s3.spawnArmor = null;
  f.front.pos.set(20, 0, 20); f.owner.pos.set(20, 0, 25);
  return { ...f, victim };
}

for (const gear of [false, true]) test('dedicated Rainmaker actor hits retain their source phase against active Nice Ball armor (' + gear + ')', async () => {
  const f = await rainmakerArmorHarness(); f.shooter.s3.objectHitGear = gear;
  const before = f.victim._s3AllSpecialState.armorHP;
  f.fire(false);
  assert.equal(before - f.victim._s3AllSpecialState.armorHP, (60 + 180) * (gear ? 1.1 : 1));
  assert.equal(f.victim.hp, 100);
  assert.equal(f.shooter._s3AllSpecialDamageCause, undefined, 'the ordinary weapon cause is restored');
  f.effects.dispose();
});

test('victim-owned ranked damage carries a bounded Rainmaker cause through native armor and rejects duplicate/foreign causes', async () => {
  const f = await rainmakerArmorHarness(), victim = f.victim, shooter = f.shooter;
  Object.assign(shooter, { owner: 'host', remote: true }); Object.assign(victim, { owner: 'guest', remote: false });
  const m = f.G.match; m.local = victim; m.time = 300;
  const nm = new f.NetMatch({ myId: 'guest', hostId: 'host', isHost: false, _members: new Set(['host', 'guest']), tr: { broadcast() {}, sendTo() {} } }, { id: 'rainmaker-armor-network', map: 'tidewater' });
  nm.bind(m); f.G.netm = nm;
  const before = victim._s3AllSpecialState.armorHP;
  const packet = { k: 'rkdamage', match: nm.cfg.id, seq: 1, victim: String(victim.nid), attacker: String(shooter.nid), life: victim.netLife ?? 0, damage: 60, cause: 'Gachihoko_Bullet' };
  nm.onMessage('host', { ...packet, cause: 'Shooter' }); nm.onMessage('foreign', packet);
  assert.equal(victim._s3AllSpecialState.armorHP, before);
  nm.onMessage('host', packet); nm.onMessage('host', packet);
  assert.equal(victim._s3AllSpecialState.armorHP, before - 60);
  nm.onMessage('host', { ...packet, seq: 2, damage: 180, cause: 'Gachihoko_BombCore' });
  assert.equal(victim._s3AllSpecialState.armorHP, before - 240);
  assert.equal(shooter._s3AllSpecialDamageCause, undefined);
  f.effects.dispose();
});

test('actual dedicated projectile selects the Rainmaker direct row for native Big Bubbler contacts', async () => {
  const f = await rainmakerWallHarness(), original = f.G.projectiles.kitDefenseCandidate, probes = [];
  f.G.projectiles.kitDefenseCandidate = function (p) { probes.push(p); return original.call(this, p); };
  f.fire(false);
  const probe = probes.find(p => p.damage === 60);
  assert.ok(probe); assert.equal(f.bigBubblerSourceRate(probe, 'canopy'), 1); assert.equal(f.bigBubblerSourceRate(probe, 'field'), .75);
  f.effects.dispose();
});

test('Rainmaker weapon blast reaches native deployed special-device HP through its authored source row', async () => {
  const f = await rainmakerWallHarness(), owner = f.owner;
  owner.weapon = { ...owner.weapon, special: 'waveBreaker', specialCost: 100 }; owner.special = 100; owner._resolve = () => {};
  owner.intent.fire = false; owner.intent.sub = false; owner._prevIntent ||= {}; owner._prevIntent.sub = false;
  owner._startSpecial(); owner._updateSpecial(1 / 60); owner.intent.sub = true; owner._updateSpecial(1 / 60);
  owner.intent.sub = false; for (let frame = 0; frame < 17 && owner.specialActive; frame++) owner._updateSpecial(1 / 60);
  const device = f.G.projectiles._s3AllSpecialObjects.find(o => o.id === 'waveBreaker' && o.kind === 'wave');
  assert.ok(device, 'actual R hold/release creates the native device'); assert.equal(device.hp, 480);
  device.pos.set(0, 1, 2); f.fire(false);
  assert.equal(device.hp, 480 - 60 - 180 * 2);
  assert.equal(f.wall.hp, 800 - 180 * 2, 'the device takes first contact; the wall receives this blast once');
  f.effects.dispose();
});

async function rainmakerDomeHarness() {
  const f = await rainmakerWallHarness(), owner = f.owner;
  f.G.projectiles.clear(); owner.pos.set(0, 0, 6);
  owner.weapon = { ...owner.weapon, special: 'bubbler', specialCost: 100 }; owner.special = 100;
  owner._startSpecial();
  for (let frame = 0; frame < 60; frame++) { f.G.time += 1 / 60; f.G.projectiles.update(1 / 60); }
  const dome = f.bigBubblerDomes()[0]; assert.ok(dome);
  return { ...f, dome };
}

for (const [breaking, gear] of [[false, false], [true, false], [false, true]]) test('full Rainmaker contact applies native Big Bubbler direct/blast rows and shields the same blast (' + breaking + ', gear ' + gear + ')', async () => {
  const f = await rainmakerDomeHarness(); f.shooter.s3.objectHitGear = gear;
  const start = new f.THREE.Vector3(0, 1, 0), end = new f.THREE.Vector3(0, 1, 20);
  const contact = f.G.projectiles.kitBarrierCandidate({ owner: f.shooter, team: 0, prev: start, pos: end, damage: 0, size: .16, ghost: false }, start, end);
  assert.ok(contact?.dome, 'actual special activation deploys a native dome');
  const dome = contact.dome; f.rear.pos.set(0, 0, contact.point.z + 1.05); f.front.pos.set(20, 0, 20);
  if (breaking) dome.hp = 100;
  const before = dome.hp; f.fire(false);
  if (breaking) assert.equal(dome.dead, true);
  else assert.ok(Math.abs(before - dome.hp - (60 + 180 * 2) * 10 * .64 * (gear ? 1.1 : 1)) < 1e-8,
    'the native raw-unit x10 and pinned BarrierParam.DamgeRatio .64 apply once');
  assert.equal(f.rear.hp, 100, 'the native canopy occludes actor blast damage');
  f.effects.dispose();
});

test('an off-axis ground blast damages an otherwise empty native Bubbler without a direct projectile contact', async () => {
  const f = await rainmakerDomeHarness(), burst = f.dome.pos.clone(); burst.x += f.dome.radius + 1; burst.y += 1;
  f.shooter.pos.copy(burst); f.shooter.pos.y -= 1;
  const before = f.dome.hp;
  f.G.physics.segment = (_start, _end, hit) => { hit.hit = true; hit.dist = 0; hit.point.copy(burst); return hit; };
  f.effects.event({ kind: 'rainmaker-shot', id: 0, actorId: '301', team: 0, pos: f.shooter.pos.toArray(), aim: [0, 1, 0], charge: 1,
    damage: 60, blastDamage: 180, outerDamage: 40, radius: 1.4, nearRadius: .92, paintRadius: 1, speed: 18, directRange: 4.4 });
  f.effects.update(.1); assert.equal(f.dome.hp, before, 'there was no direct contact'); f.effects.update(.3);
  assert.ok(Math.abs(before - f.dome.hp - 40 * 2 * 10 * .64) < 1e-8, 'the far blast band reaches native canopy HP');
  f.effects.dispose();
});

test('a locally owned guest follower proposes native Bubbler direct and blast damage without spending replica HP', async () => {
  const f = await rainmakerDomeHarness(), snapshot = f.bigBubblerSnapshot()[0];
  f.G.projectiles.clear(); f.owner.remote = true;
  assert.equal(f.replayBigBubbler('deploy', f.owner, snapshot).ok, true);
  for (let frame = 0; frame < 60; frame++) { f.G.time += 1 / 60; f.G.projectiles.update(1 / 60); }
  const replica = f.bigBubblerRemoteDomes()[0], before = replica.hp, proposals = [];
  const stop = f.on('kit:bubbler:damage-proposal', event => proposals.push(event)); f.fire(true); stop();
  assert.equal(replica.hp, before); assert.deepEqual(proposals.map(p => p.amount), [60 * 10 * .64, 180 * 2 * 10 * .64]);
  assert.ok(proposals.every(p => p.actor === f.shooter && p.shooter === 'n' + f.shooter.nid && p.domeOwner === 'n' + f.owner.nid));
  assert.equal(f.rear.hp, 100); assert.equal(f.front.hp, 100);
  f.effects.dispose();
});
