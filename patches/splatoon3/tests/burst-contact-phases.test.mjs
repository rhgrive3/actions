import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';
import { ALL_SUB_SPECS } from '../runtime/all-subs.mjs';

// S3 11.3.0, ordinary versus, GP0, standing targets. The raw table supplies
// 35/25 damage bands and paint. The separate 25 contact + one source-frame
// delay is community measured, not an extracted field:
// https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/クイックボム#Explanation
// The Wiki does not establish a separate exact paint/VFX frame. These tests
// preserve the existing presentation order instead of retiming it by inference.
const STEP = 1 / 60;
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-8,
  `${message}: ${actual} != ${expected}`);

async function world(client = null) {
  const f = await fixture({ fullRuntime:true, productionComposition:true, realProjectiles:true });
  const { paint } = makePaintWorld(f);
  f.G.settings = {};
  f.setRandom(() => .37);
  const positions = [[-1,0,30], [0,0,30], [0,0,32.7], [0,0,33.5], [0,0,34.1]];
  const actors = positions.map((pos, i) => {
    const a = f.make('shooter');
    Object.assign(a, { nid:i + 1, owner:i === 0 ? 'a' : 'b', team:i === 0 ? 0 : 1,
      remote:client !== null && (i === 0 ? client !== 'a' : client !== 'b'), netLife:0, invuln:0 });
    a.pos.set(...pos);
    a.weapon = {...a.weapon, sub:'burst'};
    a.weaponRunner.reset();
    a.aimYaw = Math.PI / 2;
    a.aimDir.set(1,0,0);
    return a;
  });
  const [owner, direct, near, far, outside] = actors;
  const packets = [];
  let nm = null;
  if (client !== null) {
    nm = new f.NetMatch({ myId:client, isHost:client === 'a', hostId:'a',
      _members:new Map([['a','A'], ['b','B']]),
      tr:{ broadcast(){}, sendTo(to, packet){ packets.push({to, packet:JSON.parse(JSON.stringify(packet))}); } } },
    { id:'burst-contact-phases', map:'map', difficulty:'normal' });
    nm.bind({ actors, state:'playing', time:180, follower:false, playing:()=>true });
    f.G.netm = nm;
    f.G.match = nm.match;
    for (const a of actors) { nm.byNid.set(a.nid,a); nm._setupActor(a); }
  }
  f.G.actors = actors;
  const events = [], hits = [], stamps = [];
  let bomb;
  f.on('all:sub', event => events.push({...event, sourceAge:bomb?.age}));
  const applyHit = f.G.projectiles.applyHit.bind(f.G.projectiles);
  f.G.projectiles.applyHit = (attacker, victim, damage, cause, ...args) => {
    hits.push({victim, damage, cause, sourceAge:bomb?.age});
    return applyHit(attacker, victim, damage, cause, ...args);
  };
  const splat = paint.splat.bind(paint);
  paint.splat = (at, radius, team, options) => {
    stamps.push({radius, team, sourceAge:bomb?.age, proof:options?.kitPaint});
    return splat(at, radius, team, options);
  };
  function fire() {
    owner.ink = 100;
    for(let i=0;i<8;i++) owner.weaponRunner.update(STEP,{sub:true});
    owner.weaponRunner.update(STEP,{sub:false,subReleased:true});
    owner.weaponRunner.update(STEP,{sub:false});
    bomb = f.G.projectiles._s3SubObjects.find(o => o.owner === owner && o.subId === 'burst');
    assert.ok(bomb, 'the actual native input release emits the custom projectile');
    assert.equal(owner.ink,55,'the admitted release pays 45 ink once');
    bomb.pos.set(-1,.7,30);
    bomb.prev.copy(bomb.pos);
    bomb.vel.set(120,0,0);
    return bomb;
  }
  function step(dt = STEP, actorPhase = null) {
    f.G.time += dt;
    actorPhase?.();
    f.G.projectiles.update(dt);
    paint.advanceSimulation(dt);
  }
  return {f, paint, actors, owner, direct, near, far, outside, packets, nm, events, hits, stamps, fire, step};
}

function wire(event) {
  const row = JSON.parse(JSON.stringify(event));
  row._netSeq = event._netSeq;
  row._netTick = event._netTick;
  return row;
}
function playRows(receiver, rows) {
  receiver.nm._peer('a');
  for(const row of rows) receiver.nm._play('a',wire(row));
}
function settlePaint(w) { for(let i=0;i<180;i++) w.paint.advanceSimulation(STEP); }

test('Burst phase values distinguish the pinned raw bands from Wiki-measured direct and frame separation', () => {
  const receipt = JSON.parse(fs.readFileSync(new URL('./fixtures/catalogue-sub-source-1130.json',import.meta.url)));
  const row = receipt.weapons.WeaponBombQuick;
  const bytes = fs.readFileSync(new URL(`./fixtures/source-1130/weapon/${row.sourceFile}`,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
  const raw = JSON.parse(bytes).GameParameters;
  assert.deepEqual(raw.BlastParam.DistanceDamage,[{Damage:350,Distance:2.8},{Damage:250,Distance:4}]);
  assert.equal(raw.BlastParam.PaintRadius,4);
  assert.equal(raw.MoveParam.DirectDamage,undefined,'the raw table does not authenticate a direct-damage field');
  assert.equal(ALL_SUB_SPECS.burst.directDamage,25);
  assert.equal(ALL_SUB_SPECS.burst.directDamageStatus,'wiki-measured-first-hit');
  assert.equal(ALL_SUB_SPECS.burst.contactBurstDelayFrames,1);
});

for(const hz of [30,60,120]) test(`Burst real contact deals 25 then 35/25 on the next source frame at ${hz} Hz`, async () => {
  const w = await world();
  const bomb = w.fire();
  for(let i=0;i<hz/30;i++) w.step(1/hz);
  assert.deepEqual(w.hits.filter(h=>h.victim===w.direct).map(h=>h.damage),[25,35]);
  assert.deepEqual(w.hits.filter(h=>h.victim===w.near).map(h=>h.damage),[35]);
  assert.deepEqual(w.hits.filter(h=>h.victim===w.far).map(h=>h.damage),[25]);
  assert.deepEqual(w.hits.filter(h=>h.victim===w.outside),[]);
  const contact=w.hits.find(h=>h.victim===w.direct&&h.damage===25);
  const blast=w.hits.find(h=>h.victim===w.direct&&h.damage===35);
  close(blast.sourceAge-contact.sourceAge,STEP,'damage phases are one 60Hz source frame apart');
  assert.deepEqual([w.direct.hp,w.near.hp,w.far.hp,w.outside.hp],[40,65,75,100]);
  assert.ok(w.hits.every(h=>h.cause==='burst'),'both phases use the existing resistance and hit authority');
  assert.equal(w.stamps.filter(s=>s.radius===4).length,1,'one core paint operation');
  assert.equal(w.events.filter(e=>e.phase==='burst').length,1,'one burst event');
  assert.equal(w.events.filter(e=>e.phase==='expire').length,1,'one retirement');
  assert.equal(bomb.dead,true);
  const before=[w.hits.length,w.stamps.length,w.events.length];
  for(let i=0;i<10;i++)w.step(1/hz);
  assert.deepEqual([w.hits.length,w.stamps.length,w.events.length],before,'a retired projectile cannot repeat a phase');
});

for(const change of ['owner death','runner reset','clear']) test(`Burst pending source-frame blast handles ${change}`,async()=>{
  const w=await world(),bomb=w.fire(),sourceLife=bomb.sourceLife;
  w.step();
  assert.deepEqual(w.hits.map(h=>h.damage),[25]);
  assert.equal(bomb.phase,'burstWait');
  if(change==='owner death'){
    w.owner.splat(w.direct,'shooter');
    assert.equal(w.owner.alive,false,'the native death path also calls runner.onDeath');
  }
  if(change==='runner reset')w.owner.weaponRunner.reset();
  if(change==='clear')w.f.G.projectiles.clear();
  w.step();
  if(change==='clear'){
    assert.deepEqual(w.hits.map(h=>h.damage),[25]);
    assert.equal(w.stamps.length,0,'world reset cancels pending paint together with the object');
    assert.equal(w.events.filter(e=>e.phase==='burst').length,0);
  }else{
    assert.deepEqual(w.hits.filter(h=>h.victim===w.direct).map(h=>h.damage),[25,35]);
    assert.equal(w.stamps.filter(s=>s.radius===4).length,1);
    assert.equal(w.events.filter(e=>e.phase==='burst').length,1);
    assert.equal(bomb.sourceLife,sourceLife,'birth identity survives owner life or runner changes');
  }
  assert.equal(bomb.dead,true);
  assert.ok(!w.f.G.projectiles._s3SubObjects.includes(bomb));
});

test('a victim killed by the 25 contact is not hit again, while the delayed surrounding blast still resolves',async()=>{
  const w=await world();w.direct.hp=25;
  w.fire();w.step();
  assert.equal(w.direct.hp,0,'25 alone admits the lethal decision before any blast damage');
  assert.equal(w.direct.alive,true,'the shared native lethal owner commits on the next actor phase');
  w.step(STEP,()=>w.direct.update(STEP));
  assert.equal(w.direct.alive,false,'the real actor phase commits the contact kill before the delayed blast');
  assert.deepEqual(w.hits.filter(h=>h.victim===w.direct).map(h=>h.damage),[25]);
  assert.deepEqual(w.hits.filter(h=>h.victim===w.near).map(h=>h.damage),[35]);
  assert.deepEqual(w.hits.filter(h=>h.victim===w.far).map(h=>h.damage),[25]);
});

test('Burst actual contact uses separate authoritative JSON hits and one causal paint replay; ghosts author neither',async()=>{
  const source=await world('a'),receiver=await world('b');
  const bomb=source.fire();
  const birth=source.nm.out.find(e=>e[1]==='ac'&&e[5].phase==='spawn');
  assert.ok(birth);
  playRows(receiver,[birth]);
  source.step();
  const first=source.packets.filter(p=>p.packet.k==='hit');
  assert.equal(first.length,1);assert.equal(first[0].packet.d,25);
  assert.equal(source.stamps.length,0,'the existing paint phase is preserved without an unsupported retiming');
  receiver.nm.onMessage('a',first[0].packet);
  assert.equal(receiver.direct.hp,75);
  const ghost=receiver.f.G.projectiles._s3SubObjects[0];assert.equal(ghost.ghost,true);
  const ghostCounters=[receiver.hits.length,receiver.stamps.length,receiver.packets.length,receiver.events.length];
  for(let i=0;i<8;i++)receiver.step();
  assert.deepEqual([receiver.hits.length,receiver.stamps.length,receiver.packets.length,receiver.events.length],ghostCounters,
    'the remote visual cannot infer a hit, paint, event or damage proposal');
  assert.equal(receiver.direct.hp,75);
  source.step();
  const packets=source.packets.filter(p=>p.packet.k==='hit').map(p=>p.packet);
  assert.deepEqual(packets.filter(p=>p.v===source.direct.nid).map(p=>p.d),[25,35]);
  assert.deepEqual(packets.filter(p=>p.v===source.near.nid).map(p=>p.d),[35]);
  assert.deepEqual(packets.filter(p=>p.v===source.far.nid).map(p=>p.d),[25]);
  assert.equal(source.events.filter(e=>e.phase==='burst').length,1);
  const forged={...packets[1],h:packets[1].h+1000,d:60};
  receiver.nm.onMessage('foreign',packets[1]);receiver.nm.onMessage('a',forged);
  assert.equal(receiver.direct.hp,75,'foreign or invented combined-60 packets have no authority');
  for(const packet of packets.slice(1))receiver.nm.onMessage('a',packet);
  assert.deepEqual([receiver.direct.hp,receiver.near.hp,receiver.far.hp],[40,65,75]);
  const rows=source.nm.out.filter(e=>['s','ac'].includes(e[1]));
  assert.equal(rows.filter(e=>e[1]==='s'&&e[15]?.[0]==='inkwave-sub-core-v1').length,1);
  playRows(receiver,rows);settlePaint(source);settlePaint(receiver);
  assert.deepEqual(Array.from(receiver.paint.grid),Array.from(source.paint.grid),'the authenticated core and satellites replay exactly');
  assert.equal(receiver.f.G.projectiles._s3SubObjects.length,0,'owner expiry retires the visual after its delayed phase');
  const snapshot=Array.from(receiver.paint.grid),hp=receiver.direct.hp;
  for(const packet of packets)receiver.nm.onMessage('a',packet);
  playRows(receiver,rows);settlePaint(receiver);
  assert.deepEqual(Array.from(receiver.paint.grid),snapshot);assert.equal(receiver.direct.hp,hp,'duplicates cannot repeat either phase');
  assert.equal(bomb.dead,true);
});
