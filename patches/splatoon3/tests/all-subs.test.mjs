import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ALL_SUB_IDS, ALL_SUB_SPECS } from '../runtime/all-subs.mjs';
import { fixture } from './source-fixture.mjs';

const frames = n => n / 60;
const rawDamage = n => n / 10;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} ≠ ${expected}`);
const SOURCE_RECEIPT = JSON.parse(fs.readFileSync(new URL('./fixtures/catalogue-sub-source-1130.json', import.meta.url), 'utf8'));
function source(name) {
  const record = SOURCE_RECEIPT.weapons[name];
  assert.ok(record, `pinned source fixture includes ${name}`);
  assert.match(record.sha256, /^[a-f0-9]{64}$/);
  return record.fields.GameParameters;
}
function equip(actor, sub) { actor.weapon = { ...actor.weapon, sub }; }
function deployed(f, actor, sub, pos = [0, 1, 0]) {
  equip(actor, sub);
  const object = f.G.projectiles.throwBomb(actor);
  assert.ok(object, `${sub} throw creates a runtime object`);
  object.phase = 'deployed';
  object.pos.set(...pos);
  object.prev.copy(object.pos);
  object.vel.set(0, 0, 0);
  object.activeAt = Infinity;
  object.deployedAt = 0;
  object.expireAt = Infinity;
  return object;
}

test('catalogue exposes fourteen entries and extracted rows follow the pinned 11.3.0 source', () => {
  assert.equal(SOURCE_RECEIPT.receipt.version, '11.3.0');
  assert.equal(ALL_SUB_IDS.length, 14);
  assert.deepEqual(ALL_SUB_IDS, ['bomb','suction','curling','burst','autobomb','fizzy','torpedo','inkMine','toxicMist','angleShooter','splashWall','sprinkler','beakon','pointSensor']);

  const sourcePairs = [
    ['burst','WeaponBombQuick'], ['autobomb','WeaponBombRobot'], ['fizzy','WeaponBombFizzy'],
    ['torpedo','WeaponBombTorpedo'], ['inkMine','WeaponTrap'], ['toxicMist','WeaponPoisonMist'],
    ['angleShooter','WeaponLineMarker'], ['splashWall','WeaponShield'], ['sprinkler','WeaponSprinkler'], ['beakon','WeaponBeacon'],
  ];
  for (const [id,name] of sourcePairs) {
    const gp=source(name);
    near(ALL_SUB_SPECS[id].inkCost,gp.WeaponParam.InkConsume*100,`${id} tank cost matches raw InkConsume`);
    assert.equal(ALL_SUB_SPECS[id].inkRecoverStop,frames(gp.WeaponParam.InkRecoverStop),`${id} recovery delay matches raw frames`);
    const speeds=gp.MoveParam.SpawnSpeedZSpecUp;
    assert.deepEqual(ALL_SUB_SPECS[id].throwSpeedTiers,{low:speeds.Low*60,mid:speeds.Mid*60,high:speeds.High*60},`${id} throw-speed tiers match raw rows`);
  }

  const quick = source('WeaponBombQuick');
  assert.equal(ALL_SUB_SPECS.burst.inkCost, quick.WeaponParam.InkConsume * 100);
  assert.equal(ALL_SUB_SPECS.burst.inkRecoverStop, frames(quick.WeaponParam.InkRecoverStop));
  assert.deepEqual([ALL_SUB_SPECS.burst.damageMax, ALL_SUB_SPECS.burst.damageMin], quick.BlastParam.DistanceDamage.map(row => rawDamage(row.Damage)));
  assert.equal(ALL_SUB_SPECS.burst.damageInner, quick.BlastParam.DistanceDamage[0].Distance);
  assert.equal(ALL_SUB_SPECS.burst.damageOuter, quick.BlastParam.DistanceDamage[1].Distance);
  assert.equal(ALL_SUB_SPECS.burst.damageFalloff, 'calibrated-quadratic', 'Quick Bomb explicitly has DamageLinear=false, so interpolated runtime curve remains labelled calibrated');

  const fizzy = source('WeaponBombFizzy');
  assert.deepEqual(ALL_SUB_SPECS.fizzy.chargeFrames, fizzy.MoveParam.ChargeFrameArray);
  assert.deepEqual(ALL_SUB_SPECS.fizzy.burstWaitFrames, fizzy.MoveParam.BurstWaitFrameArray);
  assert.deepEqual(ALL_SUB_SPECS.fizzy.bursts.map(row => row.damageInner), fizzy.MoveParam.BlastParamArray.map(row => row.DistanceDamage[0].Distance));
  assert.equal(ALL_SUB_SPECS.fizzy.objectDamage, rawDamage(fizzy.MoveParam.ObjColDamage));

  const robot=source('WeaponBombRobot');
  assert.equal(ALL_SUB_SPECS.autobomb.chaseSeconds,frames(robot.MoveParam.ChaseFrame));
  assert.equal(ALL_SUB_SPECS.autobomb.noTargetSeconds,frames(robot.MoveParam.NoReceiveTargetBurstWaitFrame));
  assert.deepEqual([ALL_SUB_SPECS.autobomb.damageMax,ALL_SUB_SPECS.autobomb.damageMin],robot.BlastParam.DistanceDamage.map(row=>rawDamage(row.Damage)));

  const torpedo = source('WeaponBombTorpedo');
  assert.equal(ALL_SUB_SPECS.torpedo.splashRadius, torpedo.BlastParamChase.SplashBlastParam.DistanceDamage[0].Distance);
  assert.equal(ALL_SUB_SPECS.torpedo.splashPaintRadius, torpedo.BlastParamChase.SplashBlastParam.PaintRadius);
  assert.equal(ALL_SUB_SPECS.torpedo.burstSeconds,frames(torpedo.MoveParam.BurstFrame));
  const trap = source('WeaponTrap');
  assert.deepEqual(ALL_SUB_SPECS.inkMine.sensorRadiusTiers, [trap.MoveParam.SensorRadius.Low, trap.MoveParam.SensorRadius.Mid, trap.MoveParam.SensorRadius.High]);
  assert.deepEqual(ALL_SUB_SPECS.inkMine.markRadiusTiers, [trap.AreaParam.Distance.Low, trap.AreaParam.Distance.Mid, trap.AreaParam.Distance.High]);
  assert.deepEqual(ALL_SUB_SPECS.inkMine.markFrames, [trap.AreaParam.MarkingFrameSubSpec.Low, trap.AreaParam.MarkingFrameSubSpec.Mid, trap.AreaParam.MarkingFrameSubSpec.High]);
  assert.equal(ALL_SUB_SPECS.inkMine.maxOwnerObjects,trap.MoveParam.MaxPlaceNum);
  assert.equal(ALL_SUB_SPECS.inkMine.lifetime,Infinity,'public gameplay mine duration is indefinite; the table omits a lifetime field');

  const mist=source('WeaponPoisonMist');
  assert.equal(ALL_SUB_SPECS.toxicMist.radius,mist.AreaParam.DistanceForOff);
  const marker=source('WeaponLineMarker');
  assert.equal(ALL_SUB_SPECS.angleShooter.directDamage,rawDamage(marker.MoveParam.DirectDamage));
  assert.equal(ALL_SUB_SPECS.angleShooter.collisionRadius,marker.MoveParam.CollisionRadius);
  assert.deepEqual(ALL_SUB_SPECS.angleShooter.markFrames,[marker.MoveParam.MarkingFrame.Low,marker.MoveParam.MarkingFrame.Mid,marker.MoveParam.MarkingFrame.High]);

  const shield = source('WeaponShield');
  assert.deepEqual(ALL_SUB_SPECS.splashWall.wallHpTiers, [shield.MoveParam.MaxHP.Low, shield.MoveParam.MaxHP.Mid, shield.MoveParam.MaxHP.High].map(rawDamage));
  assert.equal(ALL_SUB_SPECS.splashWall.gravity,shield.MoveParam.FlyGravity*3600);
  const sprinkler = source('WeaponSprinkler');
  assert.deepEqual(ALL_SUB_SPECS.sprinkler.firstPeriodFrames, [sprinkler.MoveParam.PeriodFirst.Low, sprinkler.MoveParam.PeriodFirst.Mid, sprinkler.MoveParam.PeriodFirst.High]);
  assert.deepEqual(ALL_SUB_SPECS.sprinkler.laterPeriodFrames, [sprinkler.MoveParam.PeriodSecond.Low, sprinkler.MoveParam.PeriodSecond.Mid, sprinkler.MoveParam.PeriodSecond.High]);
  assert.equal(ALL_SUB_SPECS.sprinkler.hitPaintRadius,sprinkler.MoveParam.HitPaintRadius);
  assert.equal(ALL_SUB_SPECS.sprinkler.paintRadius,sprinkler.MoveParam.SpoutInkDrawRadius);
  assert.equal(ALL_SUB_SPECS.sprinkler.lifetime, Infinity, 'public gameplay has no natural sprinkler expiry');
  assert.equal(ALL_SUB_SPECS.beakon.lifetime, Infinity, 'public gameplay has no natural Beakon expiry');
  assert.equal(ALL_SUB_SPECS.beakon.maxOwnerObjects, 3);
});

test('real WeaponRunner sub hold and release pay the selected cost and create a seeded event', async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const actor = f.make('shooter'); equip(actor, 'fizzy'); actor.ink = 100; actor.nid = 11; actor.netLife = 2;
  const events = [];
  const off = f.on('all:sub', event => events.push(event));
  // The real sub-ready gate owns its sourced preparation and one-frame use
  // startup; hold briefly, then let that gate admit the release.
  for (let i = 0; i < 8; i++) actor.weaponRunner.update(1 / 60, { sub: true });
  actor.weaponRunner.update(1 / 60, { subReleased: true });
  actor.weaponRunner.update(1 / 60, { subReleased: true });
  off?.();

  const object = f.G.projectiles._s3SubObjects.find(o => o.owner === actor && o.subId === 'fizzy');
  assert.ok(object, 'the selected sub reaches the installed Projectiles throw hook');
  assert.equal(actor.ink, 40, 'Fizzy uses its 60-point source cost');
  assert.equal(object.sourceLife, 2);
  assert.ok(Number.isSafeInteger(object.seed));
  assert.equal(object.fuse, frames(15), 'the first pop waits the extracted 15 frames');
  assert.equal(object.popLimit, 1, 'a short hold gets one pop');
  assert.ok(events.some(event => event.phase === 'spawn' && event.subId === 'fizzy' && event.actor === actor && event.sourceLife === 2));
});

test('remote ghost deployable hits become bounded owner proposals and only owner replay changes HP', async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const owner = f.make('shooter'), shooter = f.make('shooter');
  owner.team = 0; owner.nid = 1; owner.netLife = 3;
  shooter.team = 1; shooter.nid = 2; shooter.netLife = 7; shooter.remote = true;
  f.G.netm = { byNid: new Map([[1, owner], [2, shooter]]) };

  const remoteBeacon = { v: 1, phase: 'spawn', subId: 'beakon', seq: 80, eventSeq: 1, life: 7, sourceLife: 7,
    x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, charge: 0, seed: 8, actor: shooter };
  assert.equal(f.installedRuntime.replaySub(remoteBeacon), true);
  assert.equal(f.installedRuntime.replaySub({ ...remoteBeacon, phase: 'deploy', x: 0, y: 1, z: 0, life: 7, usesLeft: 2 }), true);

  const local = f.make('shooter'); local.team = 0; local.nid = 3; local.netLife = 1;
  const proposals = [];
  const off = f.on('all:sub', event => proposals.push(event));
  const p = { owner: local, team: local.team, damage: 40, size: .1, prev: new f.THREE.Vector3(-1, 1.2, 0), pos: new f.THREE.Vector3(1, 1.2, 0) };
  const candidate = f.G.projectiles.kitBarrierCandidate(p, p.prev, p.pos);
  assert.equal(candidate?.object?.seq, 80);
  candidate.onHit();
  off?.();
  const proposal = proposals.find(event => event.phase === 'objectHit');
  assert.ok(proposal);
  assert.equal(proposal.targetOwnerId, shooter.nid);
  assert.equal(proposal.targetLife, 7);
  assert.equal(proposal.damage, 40);
  assert.equal(remoteBeacon.actor, shooter);

  // A remote client's valid proposal reaches the authority that owns the wall.
  const wall = deployed(f, owner, 'splashWall');
  const before = wall.hp;
  const hit = { ...proposal, targetOwnerId: owner.nid, targetLife: wall.sourceLife, targetOwnerLife: owner.netLife,
    targetSeq: wall.seq, targetSubId: 'splashWall', damage: 40, x: wall.pos.x, y: wall.pos.y, z: wall.pos.z, actor: shooter, life: shooter.netLife };
  assert.equal(f.installedRuntime.replaySub(hit), true);
  assert.equal(wall.hp, before - 40);
  assert.equal(f.installedRuntime.replaySub(hit), false, 'duplicate object hit proposals are ignored');
});

test('owner life changes preserve deployed objects and thrown bombs; Sprinkler has no natural expiry but retires on owner death', async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const owner = f.make('shooter'); owner.nid = 9; owner.netLife = 4;
  const persistent = ['inkMine', 'splashWall', 'beakon'].map(id => deployed(f, owner, id, [id === 'inkMine' ? 3 : id === 'splashWall' ? 6 : 9, 1, 0]));
  equip(owner, 'burst');
  const thrown = f.G.projectiles.throwBomb(owner);
  const sprinkler = deployed(f, owner, 'sprinkler', [12, 1, 0]);
  assert.equal(sprinkler.expireAt, Infinity);
  owner.alive = true;
  f.G.time = 120;
  f.G.projectiles.update(1 / 60);
  assert.ok(f.G.projectiles._s3SubObjects.includes(sprinkler), 'a living owner does not age out the deployed Sprinkler');

  const originalSources = [...persistent, thrown, sprinkler].map(o => o.sourceLife);
  owner.alive = false;
  owner.netLife = 5;
  f.G.time += 1 / 60;
  f.G.projectiles.update(1 / 60);
  for (const object of [...persistent, thrown]) assert.ok(f.G.projectiles._s3SubObjects.includes(object), `${object.subId} survives owner death/respawn transition`);
  assert.ok(!f.G.projectiles._s3SubObjects.includes(sprinkler), 'Sprinkler retires when its owner dies');
  assert.deepEqual([...persistent, thrown, sprinkler].map(o => o.sourceLife), originalSources, 'object identity keeps original source life after owner life changes');
});

test('remote Beakon jump cancellation releases the reservation even after its ghost disappears', async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const owner = f.make('shooter'), jumper = f.make('shooter');
  owner.team = jumper.team = 0;
  owner.nid = 21; owner.netLife = 2; owner.remote = true;
  jumper.nid = 22; jumper.netLife = 5;
  f.G.netm = { byNid: new Map([[21, owner], [22, jumper]]) };
  const beaconEvent = { v: 1, phase: 'spawn', subId: 'beakon', seq: 12, eventSeq: 1, life: 2, sourceLife: 2,
    x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, charge: 0, seed: 9, actor: owner };
  assert.equal(f.installedRuntime.replaySub(beaconEvent), true);
  assert.equal(f.installedRuntime.replaySub({ ...beaconEvent, phase: 'deploy', x: 0, y: 1, z: 0 }), true);
  const beacon = f.G.projectiles._s3SubObjects.find(o => o.owner === owner && o.seq === 12);
  const proposals = [];
  const off = f.on('all:sub', event => proposals.push(event));
  assert.equal(f.installedRuntime.useSubBeakon(jumper, beacon, 'reserve'), true);
  assert.equal(beacon.reservations.size, 0, 'remote reservation is requested from its owner rather than mutated by a ghost');
  f.G.projectiles._s3SubObjects.splice(f.G.projectiles._s3SubObjects.indexOf(beacon), 1);
  assert.equal(f.installedRuntime.useSubBeakon(jumper, null, 'cancel'), true);
  off?.();
  assert.deepEqual(proposals.filter(event => event.phase === 'beakonUseProposal').map(event => event.stage), ['reserve', 'cancel']);
  assert.equal(proposals.at(-1).targetLife, 2);
});

test('Ink Mine persists until triggered and enemy ink in its sensor area detonates it', async () => {
  const f = await fixture({ fullRuntime: true, realProjectiles: true });
  const owner=f.make('shooter'), enemy=f.make('shooter');owner.team=0;enemy.team=1;
  const mine=deployed(f,owner,'inkMine');mine.activeAt=0;
  enemy.pos.set(4.5,0,0); // outside the 3 m actor sensor, within the blast
  let enemyInk=0;
  f.G.paint.regionStats=(_x,_y,_z,_radius,_team,out)=>{out.enemy=enemyInk;return out;};
  const hits=[];const applyHit=f.G.projectiles.applyHit.bind(f.G.projectiles);
  f.G.projectiles.applyHit=(...args)=>{hits.push(args);return applyHit(...args);};
  const events=[];const off=f.on('all:sub',event=>events.push(event));

  f.G.time=60;
  f.G.projectiles.update(1/60);
  assert.ok(f.G.projectiles._s3SubObjects.includes(mine),'a deployed mine has no natural timeout');
  assert.equal(hits.length,0,'an enemy outside sensor radius does not trigger it by proximity');

  enemyInk=.2;
  f.G.time+=1/60;
  f.G.projectiles.update(1/60);
  off?.();
  assert.ok(!f.G.projectiles._s3SubObjects.includes(mine),'enemy ink covering the mine sensor area detonates it');
  assert.ok(hits.some(args=>args[1]===enemy&&args[3]==='inkMine'),'mine blast damage goes through Projectiles.applyHit');
  assert.ok(events.some(event=>event.phase==='burst'&&event.seq===mine.seq));
});

test('placing a third Ink Mine detonates and damages from the oldest deployed mine', async () => {
  const f=await fixture({fullRuntime:true,realProjectiles:true});
  const owner=f.make('shooter'),enemy=f.make('shooter');owner.team=0;enemy.team=1;
  enemy.pos.set(4.5,0,0);
  const oldest=deployed(f,owner,'inkMine',[0,1,0]);oldest.age=30;oldest.activeAt=0;
  const newer=deployed(f,owner,'inkMine',[20,1,0]);newer.age=10;newer.activeAt=0;
  equip(owner,'inkMine');
  const third=f.G.projectiles.throwBomb(owner);
  third.pos.set(8,1,0);third.prev.set(8,1.1,0);third.vel.set(0,-1,0);
  f.G.physics.segment=(start,end,hit)=>{
    hit.hit=true;hit.dist=start.distanceTo(end);hit.point.copy(end);hit.normal.set(0,1,0);return hit;
  };
  const hits=[];const applyHit=f.G.projectiles.applyHit.bind(f.G.projectiles);
  f.G.projectiles.applyHit=(...args)=>{hits.push(args);return applyHit(...args);};
  const events=[];const off=f.on('all:sub',event=>events.push(event));
  f.G.projectiles.update(1/60);off?.();

  const objects=f.G.projectiles._s3SubObjects;
  assert.ok(!objects.includes(oldest),'third placement detonates rather than silently deleting the oldest mine');
  assert.ok(objects.includes(newer));
  assert.equal(third.phase,'deployed');
  assert.ok(hits.some(args=>args[1]===enemy&&args[3]==='inkMine'),'oldest-mine detonation applies its blast');
  assert.ok(events.some(event=>event.phase==='burst'&&event.seq===oldest.seq));
});
